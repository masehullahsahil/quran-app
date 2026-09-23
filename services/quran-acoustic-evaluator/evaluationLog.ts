import type { EvaluationResult } from "./types";

/**
 * The single structured `quran_acoustic_evaluation` log line.
 *
 * Aggregate diagnostics only: counts, enums, bounded model identifiers,
 * timings, and the app's opaque request correlation ID. It never includes
 * audio, transcripts, Quran text, decoded phoneme tokens, credentials, or
 * learner identity, so it is safe to ship to the worker's log sink.
 */
export function acousticEvaluationLogLine(
  result: EvaluationResult,
  context: { correlationId: string | null; requestDurationMs: number }
) {
  const shadow = result.measurements?.shadow;
  return {
    event: "quran_acoustic_evaluation",
    correlationId: context.correlationId,
    requestDurationMs: context.requestDurationMs,
    audioDurationMs: result.measurements?.audioDurationMs ?? null,
    preprocessingResult: result.measurements ? "usable" : "rejected",
    alignmentConfidence: result.measurements?.alignmentConfidence ?? 0,
    alignedWords: result.measurements?.words.length ?? 0,
    abstentionReason:
      result.status === "abstained" ? "insufficient_reliable_evidence" : null,
    findingsReturned: result.findings.length,
    shadowStatus: shadow?.status ?? "not_run",
    shadowProvider: shadow?.provider ?? null,
    shadowModelId: shadow?.modelId ?? null,
    shadowDecodedLevels: shadow?.decodedLevelCount ?? 0,
    shadowPhonemeTokens: shadow?.phonemeTokenCount ?? 0,
    shadowAveragePosterior: shadow?.averagePosterior ?? null,
    shadowLatencyMs: shadow?.latencyMs ?? null,
  };
}
