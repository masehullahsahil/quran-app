import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ACOUSTIC_BENCHMARK_FIXTURES } from "../server/acoustic.benchmark-fixtures";
import { formatAcousticBenchmarkReport, runAcousticBenchmark } from "../server/acoustic.benchmark";
import { evaluateQuranAwareAudio } from "../server/quranEvaluator";
import type { AcousticPrediction } from "../shared/quranAcoustic";

type ManifestEntry = { fixtureId?: string; recordingPath: string; mimeType?: string };
const predictions: Record<string, AcousticPrediction> = {};
const manifestPath = process.env.ACOUSTIC_BENCHMARK_MANIFEST;
if (process.env.QURAN_EVALUATOR_URL && manifestPath) {
  const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8")) as { recordings: ManifestEntry[] };
  for (const entry of [...manifest.recordings].sort((a, b) => (a.fixtureId ?? "").localeCompare(b.fixtureId ?? ""))) {
    const fixture = ACOUSTIC_BENCHMARK_FIXTURES.find(item => item.id === entry.fixtureId);
    if (!fixture) continue;
    const audioBase64 = (await readFile(resolve(entry.recordingPath))).toString("base64");
    const review = await evaluateQuranAwareAudio({ audioBase64, mimeType: entry.mimeType ?? "audio/webm", expectedArabic: fixture.expectedArabic, surah: fixture.surah, ayah: fixture.ayah, learningLevel: "tajweed" });
    predictions[fixture.id] = { status: review.status, confidence: review.confidence, findingKind: review.findings[0]?.kind ?? null };
  }
}
const report = runAcousticBenchmark(predictions);
console.log(formatAcousticBenchmarkReport(report));
if (process.env.QURAN_EVALUATOR_URL) {
  const rate = 16_000;
  const parts = [{ ms: 450, amplitude: .25 }, { ms: 1_100, amplitude: 0 }, { ms: 450, amplitude: .25 }];
  const samples = parts.flatMap(part => Array.from({ length: part.ms * rate / 1000 }, (_, i) => part.amplitude * Math.sin(2 * Math.PI * 220 * i / rate)));
  const data = Buffer.alloc(samples.length * 2); samples.forEach((sample, i) => data.writeInt16LE(Math.round(sample * 32767), i * 2));
  const wav = Buffer.alloc(44 + data.length); wav.write("RIFF", 0); wav.writeUInt32LE(36 + data.length, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(data.length, 40); data.copy(wav, 44);
  const pipeline = await evaluateQuranAwareAudio({ audioBase64: wav.toString("base64"), mimeType: "audio/wav", expectedArabic: "بِسْمِ اللَّهِ", surah: 1, ayah: 1, learningLevel: "tajweed" });
  console.log(`Pipeline/contract validation (synthetic tone/silence; not pronunciation accuracy): ${pipeline.status}, ${pipeline.findings.length} contract finding(s)`);
}
process.exitCode = report.fixtureIntegrity ? 0 : 1;
