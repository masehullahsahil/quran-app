import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { PcmAudio, Quality, SpeechRegion } from "./types";

const execFileAsync = promisify(execFile);
export const SAMPLE_RATE = 16_000;
export const MAX_DURATION_MS = 120_000;

function parseWav(bytes: Buffer): PcmAudio {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") throw new Error("invalid_wav");
  let offset = 12, format = 0, channels = 0, rate = 0, bits = 0, data: Buffer | null = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4), size = bytes.readUInt32LE(offset + 4), start = offset + 8;
    if (id === "fmt " && size >= 16) { format = bytes.readUInt16LE(start); channels = bytes.readUInt16LE(start + 2); rate = bytes.readUInt32LE(start + 4); bits = bytes.readUInt16LE(start + 14); }
    if (id === "data") data = bytes.subarray(start, Math.min(start + size, bytes.length));
    offset = start + size + (size % 2);
  }
  if (!data || format !== 1 || !channels || !rate || bits !== 16) throw new Error("unsupported_wav");
  const frames = Math.floor(data.length / (channels * 2));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { let sum = 0; for (let c = 0; c < channels; c++) sum += data.readInt16LE((i * channels + c) * 2) / 32768; mono[i] = sum / channels; }
  if (rate === SAMPLE_RATE) return { samples: mono, sampleRate: rate, durationMs: mono.length / rate * 1000 };
  const output = new Float32Array(Math.floor(mono.length * SAMPLE_RATE / rate));
  for (let i = 0; i < output.length; i++) { const p = i * rate / SAMPLE_RATE, a = Math.floor(p), b = Math.min(a + 1, mono.length - 1); output[i] = mono[a] * (1 - (p - a)) + mono[b] * (p - a); }
  return { samples: output, sampleRate: SAMPLE_RATE, durationMs: output.length / SAMPLE_RATE * 1000 };
}

export async function preprocessAudio(bytes: Buffer, mimeType: string): Promise<PcmAudio> {
  if (!bytes.length) throw new Error("empty_audio");
  let wav = bytes;
  if (!mimeType.toLowerCase().startsWith("audio/wav") && bytes.toString("ascii", 0, 4) !== "RIFF") {
    const dir = await mkdtemp(join(tmpdir(), "quran-acoustic-"));
    try {
      const input = join(dir, "input"), output = join(dir, "output.wav");
      await writeFile(input, bytes);
      await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-ac", "1", "-ar", String(SAMPLE_RATE), "-c:a", "pcm_s16le", output], { timeout: 30_000 });
      wav = await readFile(output);
    } catch { throw new Error("decode_failed"); } finally { await rm(dir, { recursive: true, force: true }); }
  }
  const pcm = parseWav(wav);
  if (pcm.durationMs > MAX_DURATION_MS) throw new Error("duration_exceeded");
  let peak = 0; for (let i = 0; i < pcm.samples.length; i++) peak = Math.max(peak, Math.abs(pcm.samples[i]));
  if (peak > 0 && peak < 0.95) { const gain = Math.min(0.9 / peak, 8); for (let i = 0; i < pcm.samples.length; i++) pcm.samples[i] *= gain; }
  return pcm;
}

export function analyzeAudio(pcm: PcmAudio): { quality: Quality; regions: SpeechRegion[] } {
  const frameSamples = Math.round(pcm.sampleRate * 0.02), energies: number[] = []; let clipped = 0;
  for (let i = 0; i < pcm.samples.length; i++) if (Math.abs(pcm.samples[i]) >= 0.995) clipped++;
  for (let at = 0; at < pcm.samples.length; at += frameSamples) { let sum = 0; const end = Math.min(at + frameSamples, pcm.samples.length); for (let i = at; i < end; i++) sum += pcm.samples[i] ** 2; energies.push(Math.sqrt(sum / Math.max(1, end - at))); }
  const sorted = [...energies].sort((a, b) => a - b), noise = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  const threshold = Math.max(0.012, noise * 3); const active = energies.map(e => e >= threshold);
  const regions: SpeechRegion[] = []; let start = -1;
  for (let i = 0; i <= active.length; i++) if (active[i] && start < 0) start = i; else if (!active[i] && start >= 0) { if ((i - start) * 20 >= 60) regions.push({ startMs: start * 20, endMs: Math.min(i * 20, pcm.durationMs), meanEnergy: energies.slice(start, i).reduce((a,b)=>a+b,0)/(i-start) }); start = -1; }
  const speechMs = regions.reduce((n, r) => n + r.endMs - r.startMs, 0), speechRatio = speechMs / Math.max(1, pcm.durationMs), clippedRatio = clipped / Math.max(1, pcm.samples.length);
  let reason: string | null = null; if (speechMs < 150 || speechRatio < 0.03) reason = "silence_or_no_speech"; else if (clippedRatio > 0.03) reason = "clipped_audio";
  const confidence = Math.max(0, Math.min(1, (1 - Math.min(1, clippedRatio * 10)) * Math.min(1, speechMs / 800) * Math.min(1, speechRatio / 0.2)));
  return { quality: { confidence, clippedRatio, speechRatio, reason }, regions };
}
