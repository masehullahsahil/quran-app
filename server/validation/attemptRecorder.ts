/**
 * Records one evaluated recitation attempt into a validation ledger.
 *
 * The input is a structural summary of an already-computed pipeline result —
 * this module calls no evaluation logic itself. It is shared by
 * scripts/validate-real-recitation.ts and the integration tests so both
 * record the same events in the same shape.
 *
 * Safety rules recorded here mirror the product mission:
 * - A false correction on a known-correct sample is a SERIOUS safety issue.
 * - Raw transcripts are never written to the ledger (word indexes only).
 */
import { ValidationLedger, type RecordOptions } from "./validationRun";

export type SampleAttemptSummary = {
  sampleId: string;
  /** The known scenario label, e.g. "correct_ayah" | "skipped_word" | ... */
  sampleKind: string;
  expectedSurah: number;
  expectedAyah: number;
  /** Teacher decision trace kind, e.g. "repeat-word" | "listening" | ... */
  teacherDecisionKind: string;
  teacherDecisionReason: string;
  teacherDecisionEvidenceLevel: string;
  teacherDecisionFocusWordIndex: number | null;
  /** Server-held verse-following position after evaluation. */
  verseFollowingState: string;
  verseFollowingReason: string;
  verseFollowingExpectedWordIndex: number | null;
  verseFollowingShouldAdvance: boolean;
  matchedWords: number;
  totalExpectedWords: number;
  evaluationAbstained: boolean;
  abstentionReason: string | null;
  /** Stage latencies in ms (transcription, acoustic, alignment, decision, total). */
  latenciesMs: Record<string, number | undefined>;
};

/** Teacher decision kinds that constitute a learner correction. */
const CORRECTION_DECISION_KINDS = new Set(["repeat-word"]);

export function isCorrectionDecision(kind: string): boolean {
  return CORRECTION_DECISION_KINDS.has(kind);
}

export function recordSampleAttempt(
  ledger: ValidationLedger,
  summary: SampleAttemptSummary,
  opts: RecordOptions & { audioDerived?: boolean } = {},
): { correctionDecided: boolean } {
  const { audioDerived = true, ...recordOpts } = opts;
  const correctionDecided = isCorrectionDecision(summary.teacherDecisionKind);

  ledger.recordPosition(
    {
      surah: summary.expectedSurah,
      ayah: summary.expectedAyah,
      wordIndex: summary.verseFollowingExpectedWordIndex,
      source: "harness",
      evidenceSource: "sample-audio",
      audioDerived,
      quranStateMutation: summary.verseFollowingShouldAdvance ? "advance" : null,
      note: `verse-following=${summary.verseFollowingState} reason=${summary.verseFollowingReason}`,
    },
    recordOpts,
  );

  if (correctionDecided) {
    ledger.record(
      "correction.decided",
      {
        sampleId: summary.sampleId,
        decisionKind: summary.teacherDecisionKind,
        reason: summary.teacherDecisionReason,
        evidenceLevel: summary.teacherDecisionEvidenceLevel,
        focusWordIndex: summary.teacherDecisionFocusWordIndex,
        audioDerived,
      },
      recordOpts,
    );
  }

  ledger.record(
    "attempt.completed",
    {
      sampleId: summary.sampleId,
      sampleKind: summary.sampleKind,
      matchedWords: summary.matchedWords,
      totalExpectedWords: summary.totalExpectedWords,
      evaluationAbstained: summary.evaluationAbstained,
      abstentionReason: summary.abstentionReason,
      teacherDecisionKind: summary.teacherDecisionKind,
      shouldAdvance: summary.verseFollowingShouldAdvance,
      latenciesMs: summary.latenciesMs,
      audioDerived,
    },
    recordOpts,
  );

  if (summary.sampleKind === "correct_ayah" && !summary.evaluationAbstained && correctionDecided) {
    ledger.recordSafetyOutcome(
      {
        severity: "serious",
        code: "false-correction-on-correct-sample",
        description: `Known-correct sample ${summary.sampleId} received a correction decision (${summary.teacherDecisionKind}). False corrections are especially harmful in Quran learning.`,
        evidence: {
          sampleId: summary.sampleId,
          decisionKind: summary.teacherDecisionKind,
          reason: summary.teacherDecisionReason,
          focusWordIndex: summary.teacherDecisionFocusWordIndex,
        },
      },
      recordOpts,
    );
  }

  return { correctionDecided };
}
