import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ACOUSTIC_BENCHMARK_FIXTURES } from "../server/acoustic.benchmark-fixtures";
import {
  formatShadowBenchmark,
  summarizeShadowBenchmark,
  type ShadowBenchmarkRun,
} from "../services/quran-acoustic-evaluator/shadowBenchmark";
import { parseShadowAnalysis } from "../services/quran-acoustic-evaluator/shadow";

type ManifestEntry = {
  fixtureId?: string;
  recordingPath?: string;
  mimeType?: string;
  surah?: number;
  ayah?: number;
  expectedArabic?: string;
  consentSourceNotes?: string;
};

const evaluatorUrl = process.env.QURAN_EVALUATOR_URL;
const manifestPath = process.env.ACOUSTIC_BENCHMARK_MANIFEST;
if (!evaluatorUrl || !manifestPath) {
  console.log(formatShadowBenchmark(summarizeShadowBenchmark([])));
  console.log(
    "Set QURAN_EVALUATOR_URL and ACOUSTIC_BENCHMARK_MANIFEST to run authorized recordings."
  );
  process.exit(0);
}

const absoluteManifestPath = resolve(manifestPath);
const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8")) as {
  recordings?: ManifestEntry[];
};
const recordings = Array.isArray(manifest.recordings)
  ? manifest.recordings
  : [];
const runs: ShadowBenchmarkRun[] = [];

for (const entry of recordings) {
  const fixture = ACOUSTIC_BENCHMARK_FIXTURES.find(
    item => item.id === entry.fixtureId
  );
  const expectedArabic =
    entry.expectedArabic?.trim() || fixture?.expectedArabic;
  const surah = entry.surah ?? fixture?.surah;
  const ayah = entry.ayah ?? fixture?.ayah;
  if (
    !entry.recordingPath ||
    !Number.isInteger(surah) ||
    !Number.isInteger(ayah) ||
    !expectedArabic ||
    !entry.consentSourceNotes?.trim()
  )
    continue;
  const audioBase64 = (
    await readFile(resolve(dirname(absoluteManifestPath), entry.recordingPath))
  ).toString("base64");
  const started = performance.now();
  let analysis = parseShadowAnalysis(null);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (process.env.QURAN_EVALUATOR_API_KEY)
      headers.authorization = `Bearer ${process.env.QURAN_EVALUATOR_API_KEY}`;
    const response = await fetch(
      new URL("v1/evaluate", `${evaluatorUrl.replace(/\/+$/, "")}/`),
      {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          audioBase64,
          mimeType: entry.mimeType ?? "audio/webm",
          expectedArabic,
          surah,
          ayah,
          learningLevel: "tajweed",
          uiLanguage: "en",
        }),
      }
    );
    if (response.ok) {
      const body = (await response.json()) as {
        measurements?: { shadow?: unknown };
      };
      analysis = parseShadowAnalysis(body.measurements?.shadow);
    }
  } catch {
    // Network failure is counted as unavailable without logging private paths.
  }
  runs.push({
    ...analysis,
    latencyMs: performance.now() - started,
  });
}

console.log(formatShadowBenchmark(summarizeShadowBenchmark(runs)));
