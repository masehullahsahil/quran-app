import type { ShadowAnalysisStatus } from "./shadow";

export type ShadowBenchmarkRun = {
  status: ShadowAnalysisStatus;
  latencyMs: number;
  audioDurationMs: number | null;
  decodedLevelCount: number;
  phonemeTokenCount: number;
  averagePosterior: number | null;
};

export type ShadowBenchmarkCostOptions = {
  gpuHourlyUsd?: number | null;
  projectedDeepReviewMinutesPerLearnerMonth?: number | null;
  maximumGpuUsdPerAudioHour?: number | null;
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
  costSampleCount: number;
  measuredAudioMinutes: number | null;
  processingRealTimeFactor: number | null;
  gpuHourlyUsd: number | null;
  estimatedGpuUsdPerAudioHour: number | null;
  projectedDeepReviewMinutesPerLearnerMonth: number | null;
  projectedGpuUsdPerLearnerMonth: number | null;
  maximumGpuUsdPerAudioHour: number | null;
  costGate: "pass" | "fail" | "not_evaluated";
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
  runs: readonly ShadowBenchmarkRun[],
  costOptions: ShadowBenchmarkCostOptions = {}
): ShadowBenchmarkReport {
  const available = runs.filter(run => run.status === "available");
  const costSamples = runs.filter(
    run =>
      typeof run.audioDurationMs === "number" &&
      Number.isFinite(run.audioDurationMs) &&
      run.audioDurationMs > 0 &&
      Number.isFinite(run.latencyMs) &&
      run.latencyMs >= 0
  );
  const measuredAudioMs = costSamples.reduce(
    (total, run) => total + run.audioDurationMs!,
    0
  );
  const measuredRequestMs = costSamples.reduce(
    (total, run) => total + run.latencyMs,
    0
  );
  const processingRealTimeFactor = measuredAudioMs
    ? measuredRequestMs / measuredAudioMs
    : null;
  const gpuHourlyUsd = finiteNonNegative(costOptions.gpuHourlyUsd);
  const estimatedGpuUsdPerAudioHour =
    processingRealTimeFactor === null || gpuHourlyUsd === null
      ? null
      : processingRealTimeFactor * gpuHourlyUsd;
  const projectedMinutes = finiteNonNegative(
    costOptions.projectedDeepReviewMinutesPerLearnerMonth
  );
  const projectedGpuUsdPerLearnerMonth =
    estimatedGpuUsdPerAudioHour === null || projectedMinutes === null
      ? null
      : estimatedGpuUsdPerAudioHour * (projectedMinutes / 60);
  const maximumGpuUsdPerAudioHour = finiteNonNegative(
    costOptions.maximumGpuUsdPerAudioHour
  );
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
    costSampleCount: costSamples.length,
    measuredAudioMinutes: measuredAudioMs ? measuredAudioMs / 60_000 : null,
    processingRealTimeFactor,
    gpuHourlyUsd,
    estimatedGpuUsdPerAudioHour,
    projectedDeepReviewMinutesPerLearnerMonth: projectedMinutes,
    projectedGpuUsdPerLearnerMonth,
    maximumGpuUsdPerAudioHour,
    costGate:
      estimatedGpuUsdPerAudioHour === null || maximumGpuUsdPerAudioHour === null
        ? "not_evaluated"
        : estimatedGpuUsdPerAudioHour <= maximumGpuUsdPerAudioHour
          ? "pass"
          : "fail",
  };
}

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function valueOrNotEvaluated(value: number | null, digits = 1) {
  return value === null ? "not evaluated" : value.toFixed(digits);
}

export function formatShadowBenchmark(report: ShadowBenchmarkReport) {
  return [
    "Muaalem shadow runtime benchmark",
    "INFERENCE COVERAGE ONLY — no pronunciation, makhraj, or tajweed accuracy is measured.",
    "COST ESTIMATE ONLY — excludes idle time, cold starts, storage, egress, and transcription.",
    `Attempts: ${report.attempted} | Available: ${report.available} | Abstained: ${report.abstained} | Unavailable: ${report.unavailable}`,
    `Latency p50/p95 ms: ${valueOrNotEvaluated(report.latencyP50Ms, 0)} / ${valueOrNotEvaluated(report.latencyP95Ms, 0)}`,
    `Measured audio minutes: ${valueOrNotEvaluated(report.measuredAudioMinutes, 2)} across ${report.costSampleCount}/${report.attempted} attempts`,
    `Processing/audio ratio: ${report.processingRealTimeFactor === null ? "not evaluated" : `${report.processingRealTimeFactor.toFixed(3)}x`} (active request wall time; lower is faster)`,
    `GPU hourly price input: ${report.gpuHourlyUsd === null ? "not evaluated" : `$${report.gpuHourlyUsd.toFixed(4)}`}`,
    `Estimated GPU cost per processed audio hour: ${report.estimatedGpuUsdPerAudioHour === null ? "not evaluated" : `$${report.estimatedGpuUsdPerAudioHour.toFixed(4)}`}`,
    report.projectedDeepReviewMinutesPerLearnerMonth === null
      ? "Projected GPU cost per learner month: not evaluated"
      : `Projected GPU cost per learner month at ${report.projectedDeepReviewMinutesPerLearnerMonth.toFixed(1)} deep-review minutes: ${report.projectedGpuUsdPerLearnerMonth === null ? "not evaluated" : `$${report.projectedGpuUsdPerLearnerMonth.toFixed(4)}`}`,
    `Cost gate (maximum ${report.maximumGpuUsdPerAudioHour === null ? "not evaluated" : `$${report.maximumGpuUsdPerAudioHour.toFixed(4)}/audio hour`}): ${report.costGate.replace("_", " ").toUpperCase()}`,
    `Mean decoded levels: ${valueOrNotEvaluated(report.meanDecodedLevels)}`,
    `Mean phoneme tokens: ${valueOrNotEvaluated(report.meanPhonemeTokens)}`,
    `Mean raw CTC posterior: ${valueOrNotEvaluated(report.meanPosterior, 3)} (not a correctness probability)`,
  ].join("\n");
}
