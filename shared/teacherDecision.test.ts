/**
 * The teacher's decision, scenario by scenario.
 *
 * Every case asserts both halves of the contract: which action was chosen, and
 * whether the learner is allowed to move on. A rule that picks the right words
 * but advances a learner past a word they cannot read is still wrong.
 */
import { describe, expect, it } from "vitest";
import type { QuranAwareReview } from "./quranEvaluation";
import type { VerseFollowingResult } from "./verseFollowing";
import {
  ACOUSTIC_MIN_CONFIDENCE,
  actionableAcousticFindings,
  decideTeacherAction,
  describeDecision,
  rankedTextCorrections,
  type AttemptEvidence,
  type TeacherEvidence,
  type TextCorrection,
} from "./teacherDecision";

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

const missing = (wordIndex: number, expected: string): TextCorrection => ({ expected, heard: null, status: "missing", wordIndex });
const review = (wordIndex: number, expected: string, heard: string): TextCorrection => ({ expected, heard, status: "review", wordIndex });
const extra = (heard: string): TextCorrection => ({ expected: "", heard, status: "extra", wordIndex: null });

function attempt(patch: Partial<AttemptEvidence> = {}): AttemptEvidence {
  return { reviewable: true, corrections: [], verseFollowing: follow(), ...patch };
}

function acousticReview(patch: Partial<QuranAwareReview> = {}): QuranAwareReview {
  return {
    status: "available",
    provider: "test-evaluator",
    confidence: 0.9,
    summary: "Listen once more to the marked word.",
    findings: [{ kind: "phoneme", wordIndex: 3, expectedArabic: "رَبِّ", guidance: "Listen to the reference, then repeat this word." }],
    ...patch,
  };
}

function evidence(patch: Partial<TeacherEvidence> = {}): TeacherEvidence {
  return {
    recording: { isRecording: false, isReviewing: false, failed: false },
    attempt: null,
    acoustic: null,
    memory: { reviewDue: false, recurringWordIndexes: [] },
    livePosition: { currentAyah: 2, expectedWordIndex: 1 },
    hasNextAyah: true,
    ...patch,
  };
}

describe("the microphone outranks everything", () => {
  it("reports listening while recording, and never advances", () => {
    const decision = decideTeacherAction(evidence({
      recording: { isRecording: true, isReviewing: false, failed: false },
      attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3 }) }),
    }));

    expect(decision.action).toBe("listening");
    expect(decision.reason).toBe("recording_in_progress");
    expect(decision.canAdvance).toBe(false);
  });

  it("reports reviewing while the attempt is being checked", () => {
    const decision = decideTeacherAction(evidence({ recording: { isRecording: false, isReviewing: true, failed: false } }));

    expect(decision.action).toBe("reviewing");
    expect(decision.reason).toBe("attempt_under_review");
    expect(decision.canAdvance).toBe(false);
  });
});

describe("a perfect attempt", () => {
  it("advances one ayah", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong", reason: "ayah_completed" }) }),
    }));

    expect(decision).toMatchObject({ action: "next-ayah", reason: "ayah_complete", canAdvance: true, targetAyah: 3, evidenceLevel: "strong" });
    expect(decision.focus).toBeNull();
    expect(decision.sequence).toEqual([]);
  });

  it("reports the surah finished on the last ayah, and does not advance", () => {
    const decision = decideTeacherAction(evidence({
      hasNextAyah: false,
      attempt: attempt({ verseFollowing: follow({ state: "completed", currentAyah: 7, evidence: "strong", reason: "surah_completed" }) }),
    }));

    expect(decision).toMatchObject({ action: "surah-complete", reason: "surah_complete", canAdvance: false, targetAyah: null });
  });

  it("does not advance past the end even when the tracker asks to", () => {
    const decision = decideTeacherAction(evidence({
      hasNextAyah: false,
      attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 7, evidence: "strong" }) }),
    }));

    expect(decision.action).toBe("surah-complete");
    expect(decision.canAdvance).toBe(false);
  });
});

describe("textual corrections", () => {
  it("puts one missing word in front of the learner and holds the position", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({
        corrections: [missing(4, "الْعَالَمِينَ")],
        verseFollowing: follow({ state: "correcting", reason: "mistake_to_correct", correctionFocus: { wordIndex: 4, expectedArabic: "الْعَالَمِينَ", kind: "missing" } }),
      }),
    }));

    expect(decision).toMatchObject({ action: "repeat-word", reason: "text_missing_word", canAdvance: false });
    expect(decision.focus).toEqual({ wordIndex: 4, expectedArabic: "الْعَالَمِينَ", source: "tracker" });
    expect(decision.sequence).toEqual(["show-word", "listen", "repeat-word", "recite-ayah"]);
  });

  it("chooses the highest-priority correction when there are several", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({
        // A substitution at word 2 comes first in the list, but an omission is
        // the bigger gap, so word 3 is the one to return to.
        corrections: [review(2, "لِلَّهِ", "لله"), missing(3, "رَبِّ"), missing(5, "الْعَالَمِينَ")],
        verseFollowing: follow({ state: "correcting" }),
      }),
    }));

    expect(decision.focus?.wordIndex).toBe(3);
    expect(decision.reason).toBe("text_missing_word");
    expect(decision.canAdvance).toBe(false);
    // The others are still reported, just not as the instruction.
    expect(decision.secondaryNotes).toEqual(
      expect.arrayContaining([{ kind: "text", wordIndex: 2, status: "review" }, { kind: "text", wordIndex: 5, status: "missing" }]),
    );
  });

  it("never makes an extra word the thing to repeat", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ corrections: [extra("زائد"), extra("مرة")], verseFollowing: follow({ state: "correcting" }) }),
    }));

    expect(decision.action).toBe("repeat-ayah");
    expect(decision.reason).toBe("tracker_repeat_ayah");
    expect(decision.focus).toBeNull();
    expect(decision.secondaryNotes).toContainEqual({ kind: "extra-words", count: 2 });
  });

  it("asks for the whole ayah again when no single word is to blame", () => {
    const decision = decideTeacherAction(evidence({ attempt: attempt({ verseFollowing: follow({ state: "correcting", currentAyah: 5 }) }) }));

    expect(decision).toMatchObject({ action: "repeat-ayah", reason: "tracker_repeat_ayah", canAdvance: false });
    expect(decision.sequence).toEqual(["listen", "recite-ayah"]);
  });
});

describe("abstention when the evidence is thin", () => {
  it("asks for another recording when the attempt could not be reviewed", () => {
    const decision = decideTeacherAction(evidence({ attempt: attempt({ reviewable: false }) }));

    expect(decision).toMatchObject({ action: "recording-problem", reason: "recording_unreviewable", canAdvance: false, evidenceLevel: "none" });
    expect(decision.focus).toBeNull();
    expect(decision.sequence).toEqual(["record-again"]);
  });

  it("treats a recorder or network failure the same way", () => {
    const decision = decideTeacherAction(evidence({ recording: { isRecording: false, isReviewing: false, failed: true } }));

    expect(decision).toMatchObject({ action: "recording-problem", canAdvance: false });
  });

  it.each(["no_transcript", "too_little_evidence", "noisy_transcript"] as const)(
    "says the evidence was unclear rather than inventing a mistake for %s",
    (reason) => {
      const decision = decideTeacherAction(evidence({
        attempt: attempt({ verseFollowing: follow({ state: "uncertain", reason, evidence: "weak" }) }),
      }));

      expect(decision.action).toBe("unclear");
      expect(decision.reason).toBe("evidence_uncertain");
      expect(decision.canAdvance).toBe(false);
      expect(decision.focus).toBeNull();
    },
  );

  it("discards an acoustic finding when the words themselves were not established", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ verseFollowing: follow({ state: "uncertain", reason: "no_transcript", evidence: "none" }) }),
      acoustic: acousticReview(),
    }));

    expect(decision.action).toBe("unclear");
    expect(decision.reason).toBe("evidence_uncertain");
    expect(decision.focus).toBeNull();
    // It survives as context in Teacher notes — the evaluator listened to the
    // audio independently — but it is never turned into the instruction when
    // the words it refers to could not be established.
    expect(decision.secondaryNotes.some((note) => note.kind === "acoustic")).toBe(true);
  });
});

describe("acoustic findings", () => {
  it("acts on a high-confidence finding when the words themselves were right", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong", reason: "ayah_completed" }) }),
      acoustic: acousticReview(),
    }));

    expect(decision).toMatchObject({ action: "repeat-word", reason: "acoustic_high_confidence", canAdvance: false });
    expect(decision.focus).toEqual({ wordIndex: 3, expectedArabic: "رَبِّ", source: "acoustic" });
  });

  it.each([
    ["abstained", { status: "abstained" as const, findings: [] }],
    ["unavailable", { status: "unavailable" as const }],
    ["not configured", { status: "not_configured" as const, confidence: null, findings: [] }],
    ["below the confidence threshold", { confidence: ACOUSTIC_MIN_CONFIDENCE - 0.01 }],
    ["without a word position", { findings: [{ kind: "tajweed" as const, wordIndex: null, expectedArabic: null, guidance: "General remark." }] }],
  ])("ignores a finding that is %s", (_name, patch) => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong" }) }),
      acoustic: acousticReview(patch),
    }));

    expect(decision.action).toBe("next-ayah");
    expect(decision.canAdvance).toBe(true);
    expect(decision.secondaryNotes.some((note) => note.kind === "acoustic")).toBe(false);
  });

  it("does not invent an acoustic problem when the transcript was clean and the evaluator was quiet", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong" }) }),
      acoustic: acousticReview({ status: "abstained", confidence: 0.4, summary: null, findings: [] }),
    }));

    expect(decision).toMatchObject({ action: "next-ayah", canAdvance: true });
    expect(decision.focus).toBeNull();
  });

  it("puts a missing word before a sound finding somewhere else", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ corrections: [missing(2, "لِلَّهِ")], verseFollowing: follow({ state: "correcting" }) }),
      acoustic: acousticReview({ findings: [{ kind: "phoneme", wordIndex: 4, expectedArabic: "الْعَالَمِينَ", guidance: "Listen again to this word." }] }),
    }));

    expect(decision.reason).toBe("text_missing_word");
    expect(decision.focus?.wordIndex).toBe(2);
    expect(decision.canAdvance).toBe(false);
    // The sound observation is kept, as detail rather than as the instruction.
    expect(decision.secondaryNotes).toContainEqual({ kind: "acoustic", wordIndex: 4, guidance: "Listen again to this word." });
  });

  it("chooses one finding when several are reported", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong" }) }),
      acoustic: acousticReview({
        findings: [
          { kind: "phoneme", wordIndex: 2, expectedArabic: "لِلَّهِ", guidance: "First." },
          { kind: "vowel_length", wordIndex: 5, expectedArabic: "الْعَالَمِينَ", guidance: "Second." },
        ],
      }),
    }));

    expect(decision.focus?.wordIndex).toBe(2);
    expect(decision.secondaryNotes.filter((note) => note.kind === "acoustic")).toHaveLength(1);
  });
});

describe("a word the learner keeps missing", () => {
  it("outranks the tracker's willingness to advance", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({
        corrections: [missing(3, "رَبِّ")],
        // The tracker would have advanced: one omission with a strong finish.
        verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong", reason: "ayah_completed" }),
      }),
      memory: { reviewDue: false, recurringWordIndexes: [3] },
    }));

    expect(decision).toMatchObject({ action: "repeat-word", reason: "text_recurring_word", canAdvance: false });
    expect(decision.focus).toEqual({ wordIndex: 3, expectedArabic: "رَبِّ", source: "recurring" });
    expect(decision.sequence).toEqual(["show-word", "listen", "repeat-word", "recite-ayah"]);
  });

  it("outranks a different word missed for the first time", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ corrections: [missing(2, "لِلَّهِ"), review(5, "الْعَالَمِينَ", "العالم")], verseFollowing: follow({ state: "correcting" }) }),
      memory: { reviewDue: false, recurringWordIndexes: [5] },
    }));

    expect(decision.reason).toBe("text_recurring_word");
    expect(decision.focus?.wordIndex).toBe(5);
  });

  it("outranks a high-confidence acoustic finding elsewhere", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ corrections: [missing(3, "رَبِّ")], verseFollowing: follow({ state: "correcting" }) }),
      memory: { reviewDue: false, recurringWordIndexes: [3] },
      acoustic: acousticReview({ findings: [{ kind: "phoneme", wordIndex: 6, expectedArabic: null, guidance: "Elsewhere." }] }),
    }));

    expect(decision.reason).toBe("text_recurring_word");
    expect(decision.focus?.wordIndex).toBe(3);
  });

  it("does not fire when the recurring word was recited correctly this time", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong" }) }),
      memory: { reviewDue: false, recurringWordIndexes: [3] },
    }));

    expect(decision).toMatchObject({ action: "next-ayah", canAdvance: true });
    // It stays visible as history, without blocking the learner.
    expect(decision.secondaryNotes).toContainEqual({ kind: "recurring", wordIndex: 3 });
  });
});

describe("partial progress and scheduling", () => {
  it("carries on from where the recitation stopped, without advancing", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ verseFollowing: follow({ state: "following", expectedWordIndex: 5, evidence: "partial" }) }),
    }));

    expect(decision).toMatchObject({ action: "continue", reason: "tracker_partial_progress", canAdvance: false });
    expect(decision.sequence).toEqual(["recite-ayah"]);
  });

  it("mentions a due review only when there is no correction to make", () => {
    const withCorrection = decideTeacherAction(evidence({
      memory: { reviewDue: true, recurringWordIndexes: [] },
      attempt: attempt({ corrections: [missing(2, "لِلَّهِ")], verseFollowing: follow({ state: "correcting" }) }),
    }));
    expect(withCorrection.reason).toBe("text_missing_word");

    const withoutAttempt = decideTeacherAction(evidence({ memory: { reviewDue: true, recurringWordIndexes: [] } }));
    expect(withoutAttempt).toMatchObject({ action: "review-today", reason: "review_due", canAdvance: false });
  });

  it("falls back to listening first", () => {
    const decision = decideTeacherAction(evidence());

    expect(decision).toMatchObject({ action: "listen-first", reason: "default_listen", canAdvance: false, evidenceLevel: "none" });
    expect(decision.sequence).toEqual(["listen", "recite-ayah"]);
  });
});

describe("advancement is granted in exactly one case", () => {
  const cases: Array<[string, TeacherEvidence]> = [
    ["recording", evidence({ recording: { isRecording: true, isReviewing: false, failed: false } })],
    ["reviewing", evidence({ recording: { isRecording: false, isReviewing: true, failed: false } })],
    ["unreviewable", evidence({ attempt: attempt({ reviewable: false }) })],
    ["uncertain", evidence({ attempt: attempt({ verseFollowing: follow({ state: "uncertain", reason: "no_transcript", evidence: "none" }) }) })],
    ["a correction outstanding", evidence({ attempt: attempt({ corrections: [missing(2, "لِلَّهِ")], verseFollowing: follow({ state: "correcting" }) }) })],
    ["a recurring word missed", evidence({
      attempt: attempt({ corrections: [missing(3, "رَبِّ")], verseFollowing: follow({ shouldAdvance: true, currentAyah: 3 }) }),
      memory: { reviewDue: false, recurringWordIndexes: [3] },
    })],
    ["an acoustic finding", evidence({
      attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3 }) }),
      acoustic: acousticReview(),
    })],
    ["partial progress", evidence({ attempt: attempt({ verseFollowing: follow({ state: "following" }) }) })],
    ["nothing attempted", evidence()],
    ["review due", evidence({ memory: { reviewDue: true, recurringWordIndexes: [] } })],
    ["the last ayah finished", evidence({ hasNextAyah: false, attempt: attempt({ verseFollowing: follow({ state: "completed" }) }) })],
  ];

  it.each(cases)("refuses to advance: %s", (_name, input) => {
    const decision = decideTeacherAction(input);
    expect(decision.canAdvance, describeDecision(decision)).toBe(false);
    expect(decision.targetAyah, describeDecision(decision)).toBeNull();
  });

  it("grants it only for a finalized attempt the tracker completed", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong", reason: "ayah_completed" }) }),
    }));

    expect(decision.canAdvance).toBe(true);
    expect(decision.targetAyah).toBe(3);
  });
});

describe("conflicting evidence resolves conservatively", () => {
  it("holds the learner when the tracker advances but a known weak word was missed again", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({
        corrections: [missing(2, "لِلَّهِ")],
        verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong" }),
      }),
      memory: { reviewDue: true, recurringWordIndexes: [2] },
      acoustic: acousticReview({ findings: [{ kind: "phoneme", wordIndex: 2, expectedArabic: "لِلَّهِ", guidance: "Sound." }] }),
    }));

    expect(decision.reason).toBe("text_recurring_word");
    expect(decision.canAdvance).toBe(false);
  });

  it("prefers the abstention when the tracker is unsure and the evaluator is confident", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ corrections: [missing(2, "لِلَّهِ")], verseFollowing: follow({ state: "uncertain", reason: "noisy_transcript", evidence: "weak" }) }),
      acoustic: acousticReview(),
      memory: { reviewDue: false, recurringWordIndexes: [2] },
    }));

    expect(decision.action).toBe("unclear");
    expect(decision.canAdvance).toBe(false);
  });
});

describe("evidence and instruction stay separate", () => {
  it("never carries service prose in the decision itself", () => {
    const decision = decideTeacherAction(evidence({
      attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3 }) }),
      acoustic: acousticReview(),
    }));

    // The action, reason and focus are structured values; the evaluator's own
    // sentence only ever appears inside a note.
    expect(typeof decision.action).toBe("string");
    expect(JSON.stringify({ ...decision, secondaryNotes: [] })).not.toContain("Listen once more");
  });

  it("describes itself for a developer without exposing that to a learner", () => {
    const decision = decideTeacherAction(evidence({ attempt: attempt({ corrections: [missing(2, "لِلَّهِ")], verseFollowing: follow({ state: "correcting" }) }) }));

    expect(describeDecision(decision)).toBe("repeat-word (text_missing_word) evidence=partial advance=false focus=word2:text notes=0");
  });
});

describe("helpers", () => {
  it("filters acoustic findings by status, confidence and position", () => {
    expect(actionableAcousticFindings(null)).toEqual([]);
    expect(actionableAcousticFindings(acousticReview({ confidence: null }))).toEqual([]);
    expect(actionableAcousticFindings(acousticReview())).toEqual([
      { wordIndex: 3, guidance: "Listen to the reference, then repeat this word.", expectedArabic: "رَبِّ" },
    ]);
  });

  it("ranks corrections without an attempt to nothing", () => {
    expect(rankedTextCorrections(null, [])).toEqual([]);
    expect(rankedTextCorrections(attempt({ reviewable: false, corrections: [missing(1, "بِسْمِ")] }), [])).toEqual([]);
  });
});
