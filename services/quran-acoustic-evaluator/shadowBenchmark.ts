import type { ShadowAnalysisStatus } from "./shadow";

export type ShadowBenchmarkRun = {
  status: ShadowAnalysisStatus;
  latencyMs: number;
  decodedLevelCount: number;
  phonemeTokenCount: number;
  averagePosterior: number | null;
};

export type ShadowBenchmarkReport = {
  attempted: number;
  available: number;
  abstained: number;
  unavailable: number;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  meanDecodedLevels: number | null;
  meanPhonemeTokens: number | null;
  meanPosterior: number | null;
};

function mean(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)
  ];
}

export function summarizeShadowBenchmark(
  runs: readonly ShadowBenchmarkRun[]
): ShadowBenchmarkReport {
  const available = runs.filter(run => run.status === "available");
  return {
    attempted: runs.length,
    available: available.length,
    abstained: runs.filter(run => run.status === "abstained").length,
    unavailable: runs.filter(run => run.status === "unavailable").length,
    latencyP50Ms: percentile(
      runs.map(run => run.latencyMs),
      0.5
    ),
    latencyP95Ms: percentile(
      runs.map(run => run.latencyMs),
      0.95
    ),
    meanDecodedLevels: mean(available.map(run => run.decodedLevelCount)),
    meanPhonemeTokens: mean(available.map(run => run.phonemeTokenCount)),
    meanPosterior: mean(
      available.flatMap(run =>
        run.averagePosterior === null ? [] : [run.averagePosterior]
      )
    ),
  };
}

function valueOrNotEvaluated(value: number | null, digits = 1) {
  return value === null ? "not evaluated" : value.toFixed(digits);
}

export function formatShadowBenchmark(report: ShadowBenchmarkReport) {
  return [
    "Muaalem shadow runtime benchmark",
    "INFERENCE COVERAGE ONLY — no pronunciation, makhraj, or tajweed accuracy is measured.",
    `Attempts: ${report.attempted} | Available: ${report.available} | Abstained: ${report.abstained} | Unavailable: ${report.unavailable}`,
    `Latency p50/p95 ms: ${valueOrNotEvaluated(report.latencyP50Ms, 0)} / ${valueOrNotEvaluated(report.latencyP95Ms, 0)}`,
    `Mean decoded levels: ${valueOrNotEvaluated(report.meanDecodedLevels)}`,
    `Mean phoneme tokens: ${valueOrNotEvaluated(report.meanPhonemeTokens)}`,
    `Mean raw CTC posterior: ${valueOrNotEvaluated(report.meanPosterior, 3)} (not a correctness probability)`,
  ].join("\n");
}
