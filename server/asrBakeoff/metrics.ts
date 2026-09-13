/**
 * Aggregate metrics for the ASR bake-off.
 *
 * WER/CER are computed but deliberately secondary — see AdapterAggregateMetrics.
 * The primary product decision metric is falseCorrectionRateOnCorrect:
 * how often the ASR would cause the tutor to falsely correct a learner who
 * recited correctly.
 */
import type {
  AdapterAggregateMetrics,
  ExpectedResult,
  PerRecordingResult,
} from "./types";

/** Word-level edit distance between token arrays. */
function wordEditDistance(a: string[], b: string[]): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/** Character-level edit distance on plain strings. */
function charEditDistance(a: string, b: string): number {
  return wordEditDistance(a.split(""), b.split(""));
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function aggregateAdapter(
  adapterId: string,
  displayName: string,
  results: PerRecordingResult[],
  expectedBySampleId: Map<string, ExpectedResult>,
): AdapterAggregateMetrics {
  const evaluated = results.filter((r) => !r.skipped);
  const latencies = evaluated
    .map((r) => r.latencyMs)
    .filter((v): v is number => typeof v === "number");

  const correct = evaluated.filter(
    (r) => expectedBySampleId.get(r.sampleId) === "correct",
  );
  const omissions = evaluated.filter(
    (r) => expectedBySampleId.get(r.sampleId) === "omission",
  );
  const substitutions = evaluated.filter(
    (r) => expectedBySampleId.get(r.sampleId) === "substitution",
  );
  const repetitions = evaluated.filter(
    (r) => expectedBySampleId.get(r.sampleId) === "repetition",
  );

  // Secondary: mean WER/CER over evaluated samples with usable transcripts.
  let werSum = 0;
  let werCount = 0;
  let cerSum = 0;
  let cerCount = 0;
  for (const r of evaluated) {
    if (r.normalizedTokens.length === 0 || r.expectedTokens.length === 0) continue;
    werSum += wordEditDistance(r.expectedTokens, r.normalizedTokens) / r.expectedTokens.length;
    werCount++;
    const expectedChars = r.expectedTokens.join("");
    const heardChars = r.normalizedTokens.join("");
    if (expectedChars.length > 0) {
      cerSum += charEditDistance(expectedChars, heardChars) / expectedChars.length;
      cerCount++;
    }
  }

  return {
    adapterId,
    displayName,
    totalSamples: results.length,
    skippedSamples: results.length - evaluated.length,
    evaluatedSamples: evaluated.length,
    arabicOutputRate: rate(evaluated.filter((r) => r.producedArabic).length, evaluated.length),
    exactWordMatchRate: rate(
      evaluated.filter(
        (r) =>
          r.normalizedTokens.length > 0 &&
          r.normalizedTokens.join(" ") === r.expectedTokens.join(" "),
      ).length,
      evaluated.length,
    ),
    falseCorrectionRateOnCorrect: rate(
      correct.filter((r) => r.falseCorrectionOnCorrect === true).length,
      correct.filter((r) => r.falseCorrectionOnCorrect !== null).length,
    ),
    omissionTruePositiveRate: rate(
      omissions.filter((r) => r.omissionDetected === true).length,
      omissions.filter((r) => r.omissionDetected !== null).length,
    ),
    omissionFalsePositiveRate: rate(
      correct.filter((r) => (r.alignment?.missingWordIndexes.length ?? 0) > 0).length,
      correct.length,
    ),
    substitutionDetectionRate: rate(
      substitutions.filter((r) => r.substitutionDetected === true).length,
      substitutions.filter((r) => r.substitutionDetected !== null).length,
    ),
    repetitionHandledRate: rate(
      repetitions.filter(
        (r) =>
          (r.alignment?.extraCount ?? 0) > 0 &&
          (r.alignment?.matched ?? 0) === (r.alignment?.total ?? -1),
      ).length,
      repetitions.length,
    ),
    emptyGarbageRate: rate(
      evaluated.filter(
        (r) => r.rawTranscript === null || !r.producedArabic || r.normalizedTokens.length === 0,
      ).length,
      evaluated.length,
    ),
    medianLatencyMs: median(latencies),
    p95LatencyMs: percentile(latencies, 95),
    meanWer: werCount > 0 ? werSum / werCount : null,
    meanCer: cerCount > 0 ? cerSum / cerCount : null,
  };
}
