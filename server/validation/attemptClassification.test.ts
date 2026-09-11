/**
 * The three failure classes a real-device run must distinguish.
 *
 * CAPTURE (the mic/VAD never delivered the recitation) vs TRANSCRIPTION
 * (audio arrived but Whisper failed) vs MATCHING/DECISION (the server
 * deliberately abstained on weak evidence — working as designed). The label
 * is diagnostic only: it describes what already happened and never gates
 * release behavior.
 */
import { describe, expect, it } from "vitest";
import {
  captureBuildInfo,
  classifyAttemptFailure,
  createAttemptId,
  createRunId,
  ValidationLedger,
} from "./validationRun";
import { recordSampleAttempt, type SampleAttemptSummary } from "./attemptRecorder";

function baseSummary(overrides: Partial<SampleAttemptSummary> = {}): SampleAttemptSummary {
  return {
    sampleId: "sample-1",
    sampleKind: "correct_ayah",
    expectedSurah: 1,
    expectedAyah: 2,
    teacherDecisionKind: "listening",
    teacherDecisionReason: "r",
    teacherDecisionEvidenceLevel: "strong",
    teacherDecisionFocusWordIndex: null,
    verseFollowingState: "on-track",
    verseFollowingReason: "partial_progress",
    verseFollowingExpectedWordIndex: 3,
    verseFollowingShouldAdvance: false,
    matchedWords: 3,
    totalExpectedWords: 4,
    evaluationAbstained: false,
    abstentionReason: null,
    latenciesMs: {},
    ...overrides,
  };
}

function attemptCompletedOf(ledger: ValidationLedger) {
  return ledger.eventsOfType("attempt.completed")[0]?.details as Record<string, unknown>;
}

describe("classifyAttemptFailure", () => {
  it("labels a failed transcription call as a transcription failure", () => {
    expect(classifyAttemptFailure({ transcriptionOutcome: "failed" })).toBe("transcription-failure");
    expect(classifyAttemptFailure({ transcriptionOutcome: "timeout" })).toBe("transcription-failure");
  });

  it("labels a voiceless short clip as a capture failure", () => {
    expect(
      classifyAttemptFailure({
        transcriptionOutcome: "ok",
        noSpeechProbMean: 0.92,
        durationSec: 0.6,
        transcriptWordCount: 0,
      }),
    ).toBe("capture-failure");
  });

  it("does not label a long voiceless clip as a capture failure", () => {
    // The short-duration rule keeps the label narrow: a long clip with high
    // no_speech_prob is genuinely ambiguous (a silent room, not a clipped
    // turn), and an ambiguous case must not be mislabeled as capture-side.
    expect(
      classifyAttemptFailure({
        transcriptionOutcome: "ok",
        noSpeechProbMean: 0.95,
        durationSec: 8,
        transcriptWordCount: 0,
      }),
    ).toBeNull();
  });

  it("labels a deliberate abstention on real words as matching/decision", () => {
    for (const reason of ["too_little_evidence", "no_transcript", "noisy_transcript"]) {
      expect(
        classifyAttemptFailure({
          transcriptionOutcome: "ok",
          noSpeechProbMean: 0.1,
          durationSec: 3,
          transcriptWordCount: 3,
          verseFollowingReason: reason,
        }),
      ).toBe("matching-decision");
    }
  });

  it("does not label an abstention on a single word as matching/decision", () => {
    // One word is not enough evidence to call the abstention deliberate
    // matching rather than a capture problem.
    expect(
      classifyAttemptFailure({
        transcriptionOutcome: "ok",
        noSpeechProbMean: 0.1,
        durationSec: 3,
        transcriptWordCount: 1,
        verseFollowingReason: "too_little_evidence",
      }),
    ).toBeNull();
  });

  it("returns null when there is nothing to classify", () => {
    expect(classifyAttemptFailure({})).toBeNull();
    expect(
      classifyAttemptFailure({ transcriptionOutcome: "ok", transcriptWordCount: 4, verseFollowingReason: "ayah_completed" }),
    ).toBeNull();
  });
});

describe("recordSampleAttempt with three-class instrumentation", () => {
  function ledger() {
    return new ValidationLedger({
      runId: createRunId(),
      build: captureBuildInfo({}),
      deviceMetadata: {},
    });
  }

  it("records no_speech_prob, audio bytes, and the failure class on attempt.completed", () => {
    const led = ledger();
    recordSampleAttempt(
      led,
      baseSummary({
        transcription: { outcome: "ok", latencyMs: 1200 },
        whisper: { noSpeechProbMean: 0.92, durationSec: 0.6 },
        audio: { bytes: 18432, mimeType: "audio/webm" },
        transcriptWordCount: 0,
      }),
      { attemptId: createAttemptId() },
    );

    const details = attemptCompletedOf(led);
    expect(details.transcription).toEqual({ outcome: "ok", latencyMs: 1200 });
    expect(details.whisper).toEqual({ noSpeechProbMean: 0.92, durationSec: 0.6 });
    expect(details.audio).toEqual({ bytes: 18432, mimeType: "audio/webm" });
    expect(details.transcriptWordCount).toBe(0);
    expect(details.failureClass).toBe("capture-failure");
  });

  it("labels a deliberate abstention as matching-decision, not a pipeline failure", () => {
    const led = ledger();
    recordSampleAttempt(
      led,
      baseSummary({
        verseFollowingReason: "too_little_evidence",
        evaluationAbstained: true,
        abstentionReason: "too_little_evidence",
        transcription: { outcome: "ok", latencyMs: 900 },
        whisper: { noSpeechProbMean: 0.12, durationSec: 3.1 },
        audio: { bytes: 96000, mimeType: "audio/webm" },
        transcriptWordCount: 3,
      }),
      { attemptId: createAttemptId() },
    );

    expect(attemptCompletedOf(led).failureClass).toBe("matching-decision");
  });

  it("keeps older callers working: the new fields are optional", () => {
    const led = ledger();
    recordSampleAttempt(led, baseSummary(), { attemptId: createAttemptId() });

    const details = attemptCompletedOf(led);
    expect(details.failureClass).toBeNull();
    expect(details.transcription).toBeUndefined();
    expect(details.whisper).toBeUndefined();
    expect(details.audio).toBeUndefined();
  });
});
