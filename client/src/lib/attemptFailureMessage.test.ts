/**
 * Unit tests for the attempt-failure message classifier.
 *
 * The regression under test comes from run_e6872ef0aa84e7b7dc7ac447: the
 * recorder captured 50,622 bytes, interim recognition transcribed, the server
 * review completed — and the learner-facing copy said "Nothing usable was
 * heard." These tests pin the rule that "nothing was heard" is only ever
 * shown when the capture itself produced nothing.
 */
import { describe, expect, it } from "vitest";
import {
  attemptFailureLocaleKeys,
  classifyAttemptFailure,
  selectPlaceReasonKey,
  type AttemptFailureEvidence,
} from "./attemptFailureMessage";

function evidence(overrides: Partial<AttemptFailureEvidence> = {}): AttemptFailureEvidence {
  return {
    bytesCaptured: null,
    signalTooQuiet: null,
    reviewMessageCode: null,
    verseFollowReason: null,
    verseFollowState: null,
    acousticStatus: null,
    acousticExpected: false,
    ...overrides,
  };
}

describe("classifyAttemptFailure", () => {
  it("reports no audio when the recorder produced zero bytes", () => {
    expect(classifyAttemptFailure(evidence({ bytesCaptured: 0 }))).toBe("no-audio-captured");
    expect(attemptFailureLocaleKeys["no-audio-captured"]).toBe("recorder.empty");
  });

  it("reports a quiet mic from the client's own signal measurement", () => {
    expect(
      classifyAttemptFailure(evidence({ bytesCaptured: 1024, signalTooQuiet: true }))
    ).toBe("mic-too-quiet");
    expect(attemptFailureLocaleKeys["mic-too-quiet"]).toBe("attemptFailure.micTooQuiet");
  });

  it("maps a failed speech service to transcription-unavailable", () => {
    expect(
      classifyAttemptFailure(
        evidence({ bytesCaptured: 1024, reviewMessageCode: "transcription_failed" })
      )
    ).toBe("transcription-unavailable");
    expect(attemptFailureLocaleKeys["transcription-unavailable"]).toBe(
      "feedback.transcriptionFailed"
    );
  });

  it("maps an empty transcription result to no-usable-transcript", () => {
    expect(
      classifyAttemptFailure(
        evidence({ bytesCaptured: 1024, reviewMessageCode: "no_arabic_returned" })
      )
    ).toBe("no-usable-transcript");
    expect(attemptFailureLocaleKeys["no-usable-transcript"]).toBe("feedback.noArabicReturned");
  });

  it("never claims nothing was heard when bytes were captured but the verse match is uncertain", () => {
    // The Ayah 4 shape from run_e6872ef0aa84e7b7dc7ac447: audio captured,
    // review completed, server stayed put for lack of a confident match.
    expect(
      classifyAttemptFailure(
        evidence({
          bytesCaptured: 50622,
          verseFollowReason: "no_transcript",
          verseFollowState: "uncertain",
        })
      )
    ).toBe("uncertain-verse-match");
    expect(attemptFailureLocaleKeys["uncertain-verse-match"]).toBe(
      "attemptFailure.uncertainVerseMatch"
    );
  });

  it("reports an uncertain match for too_little_evidence without a message code", () => {
    expect(
      classifyAttemptFailure(
        evidence({ bytesCaptured: 50622, verseFollowReason: "too_little_evidence" })
      )
    ).toBe("uncertain-verse-match");
  });

  it("reports an uncertain match from an uncertain verse state alone", () => {
    expect(
      classifyAttemptFailure(
        evidence({ bytesCaptured: 50622, verseFollowState: "uncertain" })
      )
    ).toBe("uncertain-verse-match");
  });

  it("reports an unavailable acoustic evaluator only when one was expected", () => {
    expect(
      classifyAttemptFailure(
        evidence({ bytesCaptured: 1024, acousticStatus: "unavailable", acousticExpected: true })
      )
    ).toBe("evaluator-unavailable");
    expect(
      classifyAttemptFailure(
        evidence({ bytesCaptured: 1024, acousticStatus: "unavailable", acousticExpected: false })
      )
    ).toBeNull();
  });

  it("leaves focused-correction codes to the existing mapping", () => {
    // focused_target_invalid / focused_unclear already have dedicated copy in
    // reviewMessageKeys; the classifier must not steal them.
    expect(
      classifyAttemptFailure(
        evidence({ bytesCaptured: 1024, reviewMessageCode: "focused_unclear" })
      )
    ).toBeNull();
  });

  it("returns null when nothing classified the attempt", () => {
    expect(classifyAttemptFailure(evidence())).toBeNull();
    expect(classifyAttemptFailure(evidence({ bytesCaptured: 1024 }))).toBeNull();
  });

  it("stays conservative when capture evidence is unknown", () => {
    // bytesCaptured null means the client never measured the capture — do not
    // invent an uncertain-match story from server enums alone.
    expect(
      classifyAttemptFailure(
        evidence({ verseFollowReason: "no_transcript", verseFollowState: "uncertain" })
      )
    ).toBeNull();
  });

  it("prefers the capture-level truth over downstream enums", () => {
    expect(
      classifyAttemptFailure(evidence({ bytesCaptured: 0, verseFollowReason: "no_transcript" }))
    ).toBe("no-audio-captured");
  });
});

describe("selectPlaceReasonKey", () => {
  it("overrides no_transcript only when the client captured audio", () => {
    expect(selectPlaceReasonKey("no_transcript", 50622, "follow.reasonNoTranscript")).toBe(
      "attemptFailure.uncertainVerseMatch"
    );
    expect(selectPlaceReasonKey("no_transcript", 0, "follow.reasonNoTranscript")).toBe(
      "follow.reasonNoTranscript"
    );
    expect(selectPlaceReasonKey("no_transcript", null, "follow.reasonNoTranscript")).toBe(
      "follow.reasonNoTranscript"
    );
  });

  it("keeps every other reason's copy verbatim", () => {
    expect(selectPlaceReasonKey("too_little_evidence", 50622, "follow.reasonTooLittleEvidence")).toBe(
      "follow.reasonTooLittleEvidence"
    );
    expect(selectPlaceReasonKey("noisy_transcript", 50622, "follow.reasonNoisyTranscript")).toBe(
      "follow.reasonNoisyTranscript"
    );
    expect(selectPlaceReasonKey("partial_progress", 50622, "follow.reasonPartialProgress")).toBe(
      "follow.reasonPartialProgress"
    );
    expect(selectPlaceReasonKey("mistake_to_correct", 50622, "follow.reasonMistakeToCorrect")).toBe(
      "follow.reasonMistakeToCorrect"
    );
  });
});
