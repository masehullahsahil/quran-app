import type { AcousticBenchmarkFixture, AcousticPrediction } from "@shared/quranAcoustic";
import { ACOUSTIC_BENCHMARK_CATEGORIES } from "@shared/quranAcoustic";
import { ACOUSTIC_BENCHMARK_FIXTURES } from "./acoustic.benchmark-fixtures";

export type AcousticCaseResult = { id: string; category: string; status: "not evaluated" | "matched" | "mismatched"; reasons: string[] };
export type AcousticBenchmarkReport = { fixtureIntegrity: boolean; evaluatedCases: number; notEvaluatedCases: number; matchedCases: number; categories: Record<string, { total: number; evaluated: number; matched: number }>; results: AcousticCaseResult[] };

export function validateAcousticFixtures(cases: readonly AcousticBenchmarkFixture[]) {
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const item of cases) {
    if (ids.has(item.id)) errors.push(`${item.id}: duplicate id`);
    ids.add(item.id);
    if (!Number.isInteger(item.surah) || item.surah < 1 || item.surah > 114) errors.push(`${item.id}: invalid surah`);
    if (!Number.isInteger(item.ayah) || item.ayah < 1) errors.push(`${item.id}: invalid ayah`);
    if (!item.expectedArabic.trim()) errors.push(`${item.id}: expectedArabic is empty`);
    if (item.expectedWordIndex !== null && (!Number.isInteger(item.expectedWordIndex) || item.expectedWordIndex < 1)) errors.push(`${item.id}: invalid word index`);
    if (item.shouldAbstain && item.expectedFindingKind !== null) errors.push(`${item.id}: abstention cannot expect a finding`);
    const range = item.expectedConfidenceRange;
    if (range && (range[0] < 0 || range[1] > 1 || range[0] > range[1])) errors.push(`${item.id}: invalid confidence range`);
  }
  for (const category of ACOUSTIC_BENCHMARK_CATEGORIES) if (!cases.some(item => item.category === category)) errors.push(`missing category: ${category}`);
  return errors;
}

export function runAcousticBenchmark(predictions: Readonly<Record<string, AcousticPrediction>> = {}, cases: readonly AcousticBenchmarkFixture[] = ACOUSTIC_BENCHMARK_FIXTURES): AcousticBenchmarkReport {
  const integrityErrors = validateAcousticFixtures(cases);
  const results = [...cases].sort((a, b) => a.id.localeCompare(b.id)).map(item => {
    const prediction = predictions[item.id];
    if (!prediction) return { id: item.id, category: item.category, status: "not evaluated" as const, reasons: ["No labeled audio/evaluator result was supplied"] };
    const reasons: string[] = [];
    const abstained = prediction.status === "abstained";
    if (abstained !== item.shouldAbstain) reasons.push(`expected abstain=${item.shouldAbstain}`);
    if (!item.shouldAbstain && prediction.findingKind !== item.expectedFindingKind) reasons.push(`expected finding ${item.expectedFindingKind}`);
    if (item.expectedConfidenceRange && (prediction.confidence === null || prediction.confidence < item.expectedConfidenceRange[0] || prediction.confidence > item.expectedConfidenceRange[1])) reasons.push("confidence outside expected range");
    return { id: item.id, category: item.category, status: reasons.length ? "mismatched" as const : "matched" as const, reasons };
  });
  const categories: AcousticBenchmarkReport["categories"] = {};
  for (const category of ACOUSTIC_BENCHMARK_CATEGORIES) {
    const selected = results.filter(item => item.category === category);
    categories[category] = { total: selected.length, evaluated: selected.filter(item => item.status !== "not evaluated").length, matched: selected.filter(item => item.status === "matched").length };
  }
  return { fixtureIntegrity: integrityErrors.length === 0, evaluatedCases: results.filter(item => item.status !== "not evaluated").length, notEvaluatedCases: results.filter(item => item.status === "not evaluated").length, matchedCases: results.filter(item => item.status === "matched").length, categories, results };
}

export function formatAcousticBenchmarkReport(report: AcousticBenchmarkReport) {
  const lines = [
    "Quran acoustic evaluator benchmark",
    `Fixture integrity: ${report.fixtureIntegrity ? "valid" : "invalid"}`,
    `Evaluated: ${report.evaluatedCases} | Not evaluated: ${report.notEvaluatedCases} | Contract matches: ${report.matchedCases}`,
    "Acoustic accuracy: not evaluated unless teacher-reviewed labeled audio and an evaluator result are supplied",
    "Categories:",
    ...Object.entries(report.categories).map(([name, value]) => `  ${name}: ${value.evaluated}/${value.total} evaluated, ${value.matched} matched`),
  ];
  return lines.join("\n");
}
