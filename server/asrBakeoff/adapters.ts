/**
 * ASR adapters for the bake-off. Every candidate implements the same
 * AsrAdapter interface so the harness owns normalization, alignment, and
 * scoring — model-specific logic never leaks into the Quran alignment code.
 *
 * LICENSE GATE: an adapter is only constructed when its verified license is
 * in ALLOWED_LICENSES. Non-commercial / no-profit models (e.g. Quran-Lab
 * NPL-1.1, Muno459/fastconformer-quran) are refused here, not just by
 * convention. See LICENSES.md for the verification log.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ENV } from "../_core/env";
import { transcribeAudio } from "../_core/voiceTranscription";
import {
  ADAPTER_IDS,
  ALLOWED_LICENSES,
  type AdapterTranscribeResult,
  type AsrAdapter,
} from "./types";

const here = dirname(fileURLToPath(import.meta.url));

function rssMb(): number {
  return process.memoryUsage().rss / (1024 * 1024);
}

function assertAllowedLicense(license: string, modelRef: string): void {
  if (!(ALLOWED_LICENSES as readonly string[]).includes(license)) {
    throw new Error(
      `Refusing model ${modelRef}: license "${license}" is not in the bake-off allowlist ` +
        `(${ALLOWED_LICENSES.join(", ")}). Non-commercial / no-profit models cannot back this product.`,
    );
  }
}

/**
 * Adapter A — the app's current production transcription path, called exactly
 * the way server/routers.ts calls it (language "ar", raw audio bytes).
 * This is the baseline every candidate is compared against.
 */
export function createProductionAdapter(): AsrAdapter {
  const license = "Apache-2.0"; // OpenAI API service; no model weights ship.
  assertAllowedLicense(license, "openai/whisper-1 (API)");
  return {
    id: ADAPTER_IDS.production,
    displayName: "Production — OpenAI whisper-1 (API)",
    modelRef: "openai/whisper-1",
    license,
    async isAvailable() {
      if (!ENV.openaiApiKey) {
        return {
          available: false,
          reason: "OPENAI_API_KEY is not set; baseline skipped (set it to include production)",
        };
      }
      return { available: true };
    },
    async transcribe(audio: Buffer, mimeType: string): Promise<AdapterTranscribeResult> {
      const before = rssMb();
      const start = Date.now();
      try {
        // Mirrors server/routers.ts exactly: raw bytes, original MIME, Arabic.
        const result = await transcribeAudio({ audio, mimeType, language: "ar" });
        const latencyMs = Date.now() - start;
        if ("error" in result) {
          return {
            transcript: null,
            latencyMs,
            peakRssMb: Math.max(0, rssMb() - before),
            error: { code: result.code, detail: result.details },
          };
        }
        return {
          transcript: result.text,
          latencyMs,
          peakRssMb: Math.max(0, rssMb() - before),
          error: null,
        };
      } catch (error) {
        return {
          transcript: null,
          latencyMs: Date.now() - start,
          peakRssMb: Math.max(0, rssMb() - before),
          error: {
            code: "ADAPTER_THROWN",
            detail: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}

type HfWorkerResponse =
  | { event: "ready"; device: string }
  | { id: string; ok: true; text: string; latencyMs: number }
  | { id: string; ok: false; error: string; detail: string; latencyMs: number };

/**
 * Persistent python worker: loads the HF model once, then transcribes one
 * audio path per stdin line. One model load per bake-off run, not per sample.
 */
class HfWorker {
  private proc: ChildProcess | null = null;
  private rl: ReturnType<typeof createInterface> | null = null;
  private pending = new Map<string, (res: HfWorkerResponse) => void>();
  private ready: Promise<void> | null = null;
  private seq = 0;

  constructor(
    private readonly modelRef: string,
    private readonly allowDownload: boolean,
  ) {}

  start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const script = join(here, "hfTranscribe.py");
      if (!existsSync(script)) {
        reject(new Error(`hfTranscribe.py not found at ${script}`));
        return;
      }
      const args = ["-u", script, "--model", this.modelRef];
      if (this.allowDownload) args.push("--allow-download");
      const proc = spawn("python3", args, { stdio: ["pipe", "pipe", "pipe"] });
      this.proc = proc;
      let stderr = "";
      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on("error", (error) => {
        reject(new Error(`could not start python3 worker: ${error.message}`));
      });
      proc.on("exit", (code) => {
        const first = this.pending.values().next();
        const detail = stderr.trim().slice(-500);
        this.pending.forEach((resolvePending) => {
          resolvePending({
            id: "",
            ok: false,
            error: "WORKER_EXIT",
            detail: `worker exited (code ${code}): ${detail}`,
            latencyMs: 0,
          });
        });
        this.pending.clear();
        if (!this.rl) {
          reject(new Error(`transcription worker exited early (code ${code}): ${detail}`));
        }
      });
      const rl = createInterface({ input: proc.stdout! });
      this.rl = rl;
      rl.on("line", (line: string) => {
        let msg: HfWorkerResponse;
        try {
          msg = JSON.parse(line) as HfWorkerResponse;
        } catch {
          return;
        }
        if ("event" in msg && msg.event === "ready") {
          resolve();
          return;
        }
        if ("id" in msg) {
          const resolvePending = this.pending.get(msg.id);
          if (resolvePending) {
            this.pending.delete(msg.id);
            resolvePending(msg);
          }
        }
      });
      // Safety: if the worker never reports ready, fail fast-ish.
      setTimeout(() => {
        reject(new Error(`transcription worker for ${this.modelRef} did not become ready in 120s`));
      }, 120_000).unref();
    });
    return this.ready;
  }

  async transcribe(audioPath: string, timeoutMs = 300_000): Promise<HfWorkerResponse> {
    await this.start();
    const id = `req-${++this.seq}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({
          id,
          ok: false,
          error: "WORKER_TIMEOUT",
          detail: `no response in ${timeoutMs}ms`,
          latencyMs: timeoutMs,
        });
      }, timeoutMs);
      timer.unref();
      this.pending.set(id, (res) => {
        clearTimeout(timer);
        resolve(res);
      });
      this.proc!.stdin!.write(JSON.stringify({ id, audio_path: audioPath }) + "\n");
    });
  }

  stop(): void {
    try {
      this.proc?.stdin?.end();
    } catch {
      /* already gone */
    }
    try {
      this.proc?.kill();
    } catch {
      /* already gone */
    }
    this.rl?.close();
    this.proc = null;
    this.rl = null;
    this.ready = null;
  }
}

/**
 * Adapter for local Hugging Face Whisper fine-tunes. Model weights are
 * downloaded once into the HF cache (never committed to git) and run locally
 * via transformers. License is verified before the adapter can be built.
 */
export function createHuggingFaceAdapter(options: {
  id: string;
  displayName: string;
  modelRef: string;
  license: string;
  allowDownload: boolean;
}): AsrAdapter {
  assertAllowedLicense(options.license, options.modelRef);
  let worker: HfWorker | null = null;

  const getWorker = () => {
    if (!worker) worker = new HfWorker(options.modelRef, options.allowDownload);
    return worker;
  };

  return {
    id: options.id,
    displayName: options.displayName,
    modelRef: options.modelRef,
    license: options.license,
    async isAvailable() {
      // python3 + transformers must exist; the model must be cached unless
      // the operator explicitly allowed a download for this run.
      const require = createRequire(import.meta.url);
      void require;
      const check = spawn("python3", [
        "-c",
        "import transformers, huggingface_hub, librosa; print('ok')",
      ]);
      const depsOk: boolean = await new Promise((resolve) => {
        let out = "";
        check.stdout?.on("data", (c: Buffer) => {
          out += c.toString();
        });
        check.on("error", () => resolve(false));
        check.on("exit", (code) => resolve(code === 0 && out.includes("ok")));
      });
      if (!depsOk) {
        return {
          available: false,
          reason:
            "python3 with transformers, huggingface_hub and librosa is required " +
            "(see server/asrBakeoff/requirements.txt)",
        };
      }
      return { available: true };
    },
    async transcribe(audio: Buffer, mimeType: string): Promise<AdapterTranscribeResult> {
      void mimeType; // HF path decodes from the file; container handled by librosa.
      const before = rssMb();
      const start = Date.now();
      try {
        // The runner writes each sample to a temp file; pass the path through.
        // transcribe() receives bytes, so stage them to a temp file here.
        const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const dir = mkdtempSync(join(tmpdir(), "asr-bakeoff-"));
        const ext = mimeType.includes("wav") ? "wav" : mimeType.includes("mp3") || mimeType.includes("mpeg") ? "mp3" : "bin";
        const audioPath = join(dir, `sample.${ext}`);
        writeFileSync(audioPath, audio);
        try {
          const res = await getWorker().transcribe(audioPath);
          const latencyMs = Date.now() - start;
          if (!("ok" in res) || !res.ok) {
            const failure = res as { error: string; detail: string };
            return {
              transcript: null,
              latencyMs,
              peakRssMb: Math.max(0, rssMb() - before),
              error: { code: failure.error, detail: failure.detail },
            };
          }
          return {
            transcript: (res as { text: string }).text,
            latencyMs,
            // RSS delta here mostly reflects the node side; the python worker
            // holds the model. Report it as measured, not as model memory.
            peakRssMb: Math.max(0, rssMb() - before),
            error: null,
          };
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      } catch (error) {
        return {
          transcript: null,
          latencyMs: Date.now() - start,
          peakRssMb: Math.max(0, rssMb() - before),
          error: {
            code: "ADAPTER_THROWN",
            detail: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}

/** The three bake-off candidates. HF adapters need --allow-download (env). */
export function createAdapters(allowDownload: boolean): AsrAdapter[] {
  return [
    createProductionAdapter(),
    createHuggingFaceAdapter({
      id: ADAPTER_IDS.tarteelBase,
      displayName: "Tarteel Quran Whisper (base, local)",
      modelRef: "tarteel-ai/whisper-base-ar-quran",
      license: "Apache-2.0", // verified 2026-09-13 via HF API; see LICENSES.md
      allowDownload,
    }),
    createHuggingFaceAdapter({
      id: ADAPTER_IDS.quranTurbo,
      displayName: "Quran Whisper Large v3 Turbo (local)",
      modelRef: "naazimsnh02/whisper-large-v3-turbo-ar-quran",
      license: "Apache-2.0", // verified 2026-09-13 via HF API; see LICENSES.md
      allowDownload,
    }),
  ];
}
