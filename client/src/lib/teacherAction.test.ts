import { describe, expect, it } from "vitest";
import type { VerseFollowingResult } from "@shared/verseFollowing";
import {
  pickCorrectionFocus,
  resolveTeacherAction,
  type ReviewEvidence,
  type TeacherActionInput,
} from "./teacherAction";

function follow(patch: Partial<VerseFollowingResult> = {}): VerseFollowingResult {
  return {
    currentSurah: 1,
    currentAyah: 2,
    expectedWordIndex: 1,
    lastCompletedAyah: null,
    state: "following",
    attemptsOnCurrentAyah: 1,
    evidence: "partial",
    shouldAdvance: false,
    nextAyah: 3,
    correctionFocus: null,
    reason: "partial_progress",
    ...patch,
  };
}

function review(patch: Partial<ReviewEvidence> = {}): ReviewEvidence {
  return { wordReviewAvailable: true, corrections: [], verseFollowing: follow(), ...patch };
}

function input(patch: Partial<TeacherActionInput> = {}): TeacherActionInput {
  return {
    isRecording: false,
    isReviewing: false,
    recordingError: false,
    review: null,
    position: { currentAyah: 2, expectedWordIndex: 1 },
    reviewDue: false,
    hasNextAyah: true,
    ...patch,
  };
}

describe("the microphone comes first", () => {
  it("says it is listening while recording, with no competing button", () => {
    const action = resolveTeacherAction(input({ isRecording: true, review: review() }));

    expect(action.kind).toBe("listening");
    expect(action.button).toBeNull();
  });

  it("says it is reviewing while the attempt is being checked", () => {
    const action = resolveTeacherAction(input({ isReviewing: true }));

    expect(action.kind).toBe("reviewing");
    expect(action.button).toBeNull();
  });

  it("recording state outranks a pending correction", () => {
    const withCorrection = review({ verseFollowing: follow({ state: "correcting", correctionFocus: { wordIndex: 3, expectedArabic: "رَبِّ", kind: "missing" } }) });

    expect(resolveTeacherAction(input({ isRecording: true, review: withCorrection })).kind).toBe("listening");
    expect(resolveTeacherAction(input({ review: withCorrection })).kind).toBe("repeat-word");
  });
});

describe("failures", () => {
  it("asks for another recording when the attempt could not be reviewed", () => {
    const action = resolveTeacherAction(input({ recordingError: true }));

    expect(action.kind).toBe("recording-problem");
    expect(action.button).toEqual({ command: "retry-ayah", labelKey: "now.tryAgain" });
    expect(action.tone).toBe("attention");
  });

  it("treats an unavailable word review the same way", () => {
    const action = resolveTeacherAction(input({ review: review({ wordReviewAvailable: false }) }));

    expect(action.kind).toBe("recording-problem");
  });
});

describe("a completed ayah maps to the next-ayah action", () => {
  it("offers exactly one button, pointing at the tracker's ayah", () => {
    const action = resolveTeacherAction(input({
      review: review({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, state: "following", reason: "ayah_completed", evidence: "strong" }) }),
    }));

    expect(action.kind).toBe("next-ayah");
    expect(action.targetAyah).toBe(3);
    expect(action.button).toEqual({ command: "next-ayah", labelKey: "now.goToAyah", params: { number: 3 } });
    expect(action.tone).toBe("success");
    expect(action.focusArabic).toBeNull();
  });

  it("reports the surah finished instead of advancing past the last ayah", () => {
    const action = resolveTeacherAction(input({
      hasNextAyah: false,
      review: review({ verseFollowing: follow({ state: "completed", currentAyah: 7, shouldAdvance: false, reason: "surah_completed", evidence: "strong" }) }),
    }));

    expect(action.kind).toBe("surah-complete");
    expect(action.button).toBeNull();
  });

  it("does not advance past the end even if the tracker asks to", () => {
    const action = resolveTeacherAction(input({
      hasNextAyah: false,
      review: review({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 7 }) }),
    }));

    expect(action.kind).not.toBe("next-ayah");
  });
});

describe("a correction maps to one primary action", () => {
  it("puts the tracked word in front of the learner", () => {
    const action = resolveTeacherAction(input({
      review: review({ verseFollowing: follow({ state: "correcting", reason: "mistake_to_correct", correctionFocus: { wordIndex: 4, expectedArabic: "الْعَالَمِينَ", kind: "missing" } }) }),
    }));

    expect(action.kind).toBe("repeat-word");
    expect(action.titleParams).toEqual({ number: 4 });
    expect(action.focusArabic).toBe("الْعَالَمِينَ");
    expect(action.focusWordIndex).toBe(4);
    expect(action.button).toEqual({ command: "retry-ayah", labelKey: "now.repeat" });
  });

  it("falls back to the first correction of the recorded review", () => {
    const action = resolveTeacherAction(input({
      review: review({
        corrections: [{ expected: "رَبِّ", heard: null, wordIndex: 3 }, { expected: "لِلَّهِ", heard: null, wordIndex: 2 }],
        verseFollowing: follow({ state: "correcting" }),
      }),
    }));

    expect(action.kind).toBe("repeat-word");
    expect(action.focusWordIndex).toBe(3);
  });

  it("ignores an unanchored extra word, which names no place to return to", () => {
    const action = resolveTeacherAction(input({
      review: review({ corrections: [{ expected: "", heard: "زائد", wordIndex: null }], verseFollowing: follow({ state: "correcting" }) }),
    }));

    expect(action.kind).toBe("repeat-ayah");
    expect(action.focusArabic).toBeNull();
  });

  it("asks for the whole ayah again when there is no single word to blame", () => {
    const action = resolveTeacherAction(input({ review: review({ verseFollowing: follow({ state: "correcting", currentAyah: 5 }) }) }));

    expect(action.kind).toBe("repeat-ayah");
    expect(action.titleParams).toEqual({ number: 5 });
    expect(action.button).toEqual({ command: "retry-ayah", labelKey: "now.repeat" });
  });
});

describe("an uncertain attempt never shows an advance action", () => {
  it.each(["no_transcript", "too_little_evidence", "noisy_transcript"] as const)(
    "keeps the learner on the ayah for %s",
    (reason) => {
      const action = resolveTeacherAction(input({
        review: review({ verseFollowing: follow({ state: "uncertain", reason, evidence: "none" }) }),
      }));

      expect(action.kind).toBe("repeat-ayah");
      expect(action.targetAyah).toBeNull();
      expect(action.button?.command).toBe("retry-ayah");
    },
  );

  it("never offers a next-ayah command for any non-advancing state", () => {
    for (const state of ["following", "correcting", "uncertain"] as const) {
      const action = resolveTeacherAction(input({ review: review({ verseFollowing: follow({ state }) }) }));
      expect(action.button?.command, state).not.toBe("next-ayah");
      expect(action.targetAyah, state).toBeNull();
    }
  });
});

describe("partial progress", () => {
  it("says where to carry on and leaves the mic as the next step", () => {
    const action = resolveTeacherAction(input({
      review: review({ verseFollowing: follow({ state: "following", expectedWordIndex: 5 }) }),
    }));

    expect(action.kind).toBe("continue");
    expect(action.titleParams).toEqual({ number: 5 });
    expect(action.button).toBeNull();
  });
});

describe("a review due today stays secondary", () => {
  it("shows before any attempt has been made", () => {
    const action = resolveTeacherAction(input({ reviewDue: true }));

    expect(action.kind).toBe("review-today");
    expect(action.button).toBeNull();
  });

  it("never displaces an active correction", () => {
    const action = resolveTeacherAction(input({
      reviewDue: true,
      review: review({ verseFollowing: follow({ state: "correcting", correctionFocus: { wordIndex: 2, expectedArabic: "لِلَّهِ", kind: "review" } }) }),
    }));

    expect(action.kind).toBe("repeat-word");
  });

  it("never displaces a finished ayah", () => {
    const action = resolveTeacherAction(input({
      reviewDue: true,
      review: review({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3 }) }),
    }));

    expect(action.kind).toBe("next-ayah");
  });

  it("never displaces a recording that could not be reviewed", () => {
    expect(resolveTeacherAction(input({ reviewDue: true, recordingError: true })).kind).toBe("recording-problem");
  });
});

describe("nothing attempted yet", () => {
  it("asks the learner to listen first", () => {
    const action = resolveTeacherAction(input());

    expect(action.kind).toBe("listen-first");
    expect(action.titleKey).toBe("now.listenFirst");
    expect(action.button).toBeNull();
  });

  it("names the live tracker's place when the learner is already part-way in", () => {
    const action = resolveTeacherAction(input({ position: { currentAyah: 2, expectedWordIndex: 4 } }));

    expect(action.kind).toBe("listen-first");
    expect(action.titleKey).toBe("now.continueFromWord");
    expect(action.titleParams).toEqual({ number: 4 });
  });
});

describe("pickCorrectionFocus", () => {
  it("has nothing to show without a usable review", () => {
    expect(pickCorrectionFocus(null)).toBeNull();
    expect(pickCorrectionFocus(review({ wordReviewAvailable: false }))).toBeNull();
  });

  it("has nothing to show once the ayah has been passed", () => {
    expect(pickCorrectionFocus(review({
      corrections: [{ expected: "رَبِّ", heard: null, wordIndex: 3 }],
      verseFollowing: follow({ shouldAdvance: true }),
    }))).toBeNull();
  });

  it("prefers the tracker's focus over the correction list", () => {
    const focus = pickCorrectionFocus(review({
      corrections: [{ expected: "لِلَّهِ", heard: null, wordIndex: 2 }],
      verseFollowing: follow({ correctionFocus: { wordIndex: 4, expectedArabic: "الْعَالَمِينَ", kind: "missing" } }),
    }));

    expect(focus).toEqual({ wordIndex: 4, expectedArabic: "الْعَالَمِينَ" });
  });
});

describe("the whole surface", () => {
  it("returns exactly one instruction and at most one button for every state", () => {
    const states = ["following", "correcting", "uncertain", "completed"] as const;
    const cases: TeacherActionInput[] = [
      input(),
      input({ isRecording: true }),
      input({ isReviewing: true }),
      input({ recordingError: true }),
      input({ reviewDue: true }),
      ...states.map((state) => input({ review: review({ verseFollowing: follow({ state }) }) })),
      ...states.map((state) => input({ hasNextAyah: false, review: review({ verseFollowing: follow({ state, shouldAdvance: true }) }) })),
    ];

    for (const testCase of cases) {
      const action = resolveTeacherAction(testCase);
      expect(action.titleKey, action.kind).toBeTruthy();
      expect(["neutral", "attention", "success"], action.kind).toContain(action.tone);
      // "At most one" is the whole point: the type allows a single button only,
      // and a next-ayah button must always name the ayah it moves to.
      if (action.button?.command === "next-ayah") expect(action.targetAyah, action.kind).not.toBeNull();
      if (action.kind !== "repeat-word") expect(action.focusArabic, action.kind).toBeNull();
    }
  });
});
