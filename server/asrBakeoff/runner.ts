/**
 * ASR bake-off runner: loads the corpus manifest, runs every selected adapter
 * over every sample, evaluates with the production alignment engine, and
 * writes a Markdown report + JSON artifact.
 *
 * Usage:
 *   pnpm benchmark:asr-bakeoff [--corpus <dir>] [--adapters <ids>] [--out <report.md>] [--allow-download]
 *
 * Flags:
 *   --corpus        corpus directory (default: server/asrBakeoff/corpus)
 *   --adapters      comma-separated adapter ids (default: all three)
 *   --out           report path (default: server/asrBakeoff/last-report.md)
 *   --allow-download  permit downloading HF model weights into the HF cache
 *                     (never committed to git). Without it, uncached models
 *                     are skipped with a recorded reason.
 *
 * Exit code 0 when the harness itself ran cleanly, even if every adapter was
 * skipped — a bake-off with no runnable adapters is an empty report, not a
 * crash. Exit code 2 for harness/usage errors (bad manifest, unreadable
 * corpus dir).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAdapters } from "./adapters";
import { evaluateSample, skippedSample } from "./evaluate";
import { loadManifest, sampleAudioPath } from "./manifest";
import { aggregateAdapter } from "./metrics";
import { formatBakeoffReport } from "./report";
import type {
  AdapterAggregateMetrics,
  AsrAdapter,
  BakeoffReport,
  ExpectedResult,
  PerRecordingResult,
} from "./types";

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue; // npm/pnpm separator between script args
    if (arg === "--allow-download") {
      args["allow-download"] = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`flag --${key} needs a value`);
      }
      args[key] = value;
      i++;
    }
  }
  return args;
}

function guessMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return "audio/mp4";
  return "audio/wav";
}

export async function runBakeoff(options: {
  corpusDir: string;
  adapterIds: string[] | null;
  allowDownload: boolean;
}): Promise<BakeoffReport> {
  const notes: string[] = [];
  const manifestResult = loadManifest(options.corpusDir);
  if (!manifestResult.ok) {
    throw new Error(`Cannot run bake-off:\n- ${manifestResult.errors.join("\n- ")}`);
  }
  const manifest = manifestResult.manifest;

  const allAdapters = createAdapters(options.allowDownload);
  const wanted = options.adapterIds;
  const adapters: AsrAdapter[] = wanted
    ? allAdapters.filter((a) => wanted.includes(a.id))
    : allAdapters;
  if (wanted) {
    const unknown = wanted.filter((id) => !allAdapters.some((a) => a.id === id));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown adapter id(s): ${unknown.join(", ")}. Known: ${allAdapters.map((a) => a.id).join(", ")}`,
      );
    }
  }

  const expectedBySampleId = new Map<string, ExpectedResult>();
  for (const sample of manifest.samples) expectedBySampleId.set(sample.id, sample.expectedResult);

  const perRecording: PerRecordingResult[] = [];
  const aggregates: AdapterAggregateMetrics[] = [];

  for (const adapter of adapters) {
    const availability = await adapter.isAvailable();
    if (!availability.available) {
      notes.push(
        `Adapter "${adapter.displayName}" skipped entirely: ${availability.reason ?? "unavailable"}`,
      );
      for (const sample of manifest.samples) {
        perRecording.push(skippedSample(sample, adapter.id, availability.reason ?? "unavailable"));
      }
      aggregates.push(
        aggregateAdapter(adapter.id, adapter.displayName, [], expectedBySampleId),
      );
      continue;
    }

    const adapterResults: PerRecordingResult[] = [];
    for (const sample of manifest.samples) {
      const audioPath = sampleAudioPath(options.corpusDir, sample.audio);
      if (!existsSync(audioPath)) {
        adapterResults.push(
          skippedSample(sample, adapter.id, `audio file missing: ${audioPath}`),
        );
        continue;
      }
      const audio = readFileSync(audioPath);
      const mimeType = guessMimeType(sample.audio);
      const transcribed = await adapter.transcribe(audio, mimeType);
      adapterResults.push(evaluateSample(sample, adapter.id, transcribed));
    }
    perRecording.push(...adapterResults);
    aggregates.push(
      aggregateAdapter(adapter.id, adapter.displayName, adapterResults, expectedBySampleId),
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    corpusDir: options.corpusDir,
    adapters: adapters.map((a) => a.id),
    perRecording,
    aggregates,
    notes,
  };
}

export async function runBakeoffCli(argv: string[]): Promise<void> {
  let args: Record<string, string | boolean>;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`usage: pnpm benchmark:asr-bakeoff [--corpus <dir>] [--adapters <ids>] [--out <report.md>] [--allow-download]`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  const corpusDir = resolve(String(args["corpus"] ?? join(here, "corpus")));
  const adapterIds =
    typeof args["adapters"] === "string"
      ? String(args["adapters"]).split(",").map((s) => s.trim()).filter(Boolean)
      : null;
  const allowDownload = args["allow-download"] === true;
  const outPath = resolve(String(args["out"] ?? join(here, "last-report.md")));

  try {
    const report = await runBakeoff({ corpusDir, adapterIds, allowDownload });
    const markdown = formatBakeoffReport(report);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, markdown);
    writeFileSync(outPath.replace(/\.md$/, ".json"), JSON.stringify(report, null, 2));
    console.log(markdown);
    console.log(`\nReport written to ${outPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
