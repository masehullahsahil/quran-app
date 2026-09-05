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
process.exitCode = report.fixtureIntegrity ? 0 : 1;
