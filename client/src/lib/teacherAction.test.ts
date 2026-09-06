/**
 * The presentation half: one instruction key, at most one button, and nothing
 * a service wrote showing up as the thing the learner is told to do.
 *
 * The decision rules themselves are covered in shared/teacherDecision.test.ts.
 */
import { describe, expect, it } from "vitest";
import type { QuranAwareReview } from "@shared/quranEvaluation";
import type { VerseFollowingResult } from "@shared/verseFollowing";
import { decideTeacherAction, type AttemptEvidence, type TeacherEvidence } from "@shared/teacherDecision";
import { presentDecision, resolveTeacherAction, type TeacherAction } from "./teacherAction";
import en from "@locales/en";

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

function attempt(patch: Partial<AttemptEvidence> = {}): AttemptEvidence {
  return { reviewable: true, corrections: [], verseFollowing: follow(), ...patch };
}

function evidence(patch: Partial<TeacherEvidence> = {}): TeacherEvidence {
  return {
    recording: { isRecording: false, isReviewing: false, failed: false },
    attempt: null,
    acoustic: null,
    memory: { reviewDue: false, recurringWordIndexes: [] },
    livePosition: { currentSurah: 1, currentAyah: 2, expectedWordIndex: 1 },
    hasNextAyah: true,
    ...patch,
  };
}

/** Every state the page can be in, for the sweeps below. */
const everyState: Array<[string, TeacherEvidence]> = [
  ["recording", evidence({ recording: { isRecording: true, isReviewing: false, failed: false } })],
  ["reviewing", evidence({ recording: { isRecording: false, isReviewing: true, failed: false } })],
  ["recorder failed", evidence({ recording: { isRecording: false, isReviewing: false, failed: true } })],
  ["unreviewable", evidence({ attempt: attempt({ reviewable: false }) })],
  ["uncertain", evidence({ attempt: attempt({ verseFollowing: follow({ state: "uncertain", reason: "no_transcript", evidence: "none" }) }) })],
  ["missing word", evidence({
    attempt: attempt({ corrections: [{ expected: "رَبِّ", heard: null, status: "missing", wordIndex: 3 }], verseFollowing: follow({ state: "correcting" }) }),
  })],
  ["recurring word", evidence({
    attempt: attempt({ corrections: [{ expected: "رَبِّ", heard: null, status: "missing", wordIndex: 3 }], verseFollowing: follow({ state: "correcting" }) }),
    memory: { reviewDue: false, recurringWordIndexes: [3] },
  })],
  ["acoustic finding", evidence({
    attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong" }) }),
    acoustic: {
      status: "available",
      provider: "test",
      confidence: 0.92,
      summary: "A summary the learner may read in Teacher notes.",
      findings: [{ kind: "phoneme", wordIndex: 4, expectedArabic: "الْعَالَمِينَ", guidance: "Guidance text from the evaluator." }],
    } satisfies QuranAwareReview,
  })],
  ["repeat ayah", evidence({ attempt: attempt({ verseFollowing: follow({ state: "correcting" }) }) })],
  ["advance", evidence({ attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong" }) }) })],
  ["surah complete", evidence({ hasNextAyah: false, attempt: attempt({ verseFollowing: follow({ state: "completed" }) }) })],
  ["partial progress", evidence({ attempt: attempt({ verseFollowing: follow({ state: "following", expectedWordIndex: 4 }) }) })],
  ["review due", evidence({ memory: { reviewDue: true, recurringWordIndexes: [] } })],
  ["nothing yet", evidence()],
];

describe("one instruction, at most one button", () => {
  it.each(everyState)("presents a single defined instruction for %s", (_name, input) => {
    const action = resolveTeacherAction(input);

    expect(action.titleKey, action.kind).toBeTruthy();
    expect(en.strings[action.titleKey], `${action.kind}: ${action.titleKey} is not defined in the reference pack`).toBeTruthy();
    expect(["neutral", "attention", "success", "unsure"]).toContain(action.tone);
  });

  it.each(everyState)("offers no more than one contextual button for %s", (_name, input) => {
    const action = resolveTeacherAction(input);

    if (action.button) {
      expect(["retry-ayah", "next-ayah"]).toContain(action.button.command);
      expect(en.strings[action.button.labelKey], action.button.labelKey).toBeTruthy();
    }
    // A next-ayah button must always name where it goes.
    if (action.button?.command === "next-ayah") expect(action.targetAyah).not.toBeNull();
    else expect(action.canAdvance, action.kind).toBe(false);
  });

  it("mirrors the decision's advancement permission rather than deciding again", () => {
    for (const [name, input] of everyState) {
      const decision = decideTeacherAction(input);
      const action = resolveTeacherAction(input);

      expect(action.canAdvance, name).toBe(decision.canAdvance);
      expect(action.reason, name).toBe(decision.reason);
      expect(action.kind, name).toBe(decision.action);
      expect(action.targetAyah, name).toBe(decision.targetAyah);
    }
  });
});

describe("wording follows the evidence that named the word", () => {
  it("says something different for a repeated word than for a first miss", () => {
    const first = resolveTeacherAction(evidence({
      attempt: attempt({ corrections: [{ expected: "رَبِّ", heard: null, status: "missing", wordIndex: 3 }], verseFollowing: follow({ state: "correcting" }) }),
    }));
    const again = resolveTeacherAction(evidence({
      attempt: attempt({ corrections: [{ expected: "رَبِّ", heard: null, status: "missing", wordIndex: 3 }], verseFollowing: follow({ state: "correcting" }) }),
      memory: { reviewDue: false, recurringWordIndexes: [3] },
    }));

    expect(first.titleKey).toBe("now.repeatWord");
    expect(again.titleKey).toBe("now.repeatWordAgain");
    expect(first.focusArabic).toBe("رَبِّ");
    expect(again.focusArabic).toBe("رَبِّ");
  });

  it("uses listening wording for a sound observation, not a spelling correction", () => {
    const action = resolveTeacherAction(everyState.find(([name]) => name === "acoustic finding")![1]);

    expect(action.titleKey).toBe("now.repeatWordSound");
    expect(action.focusWordIndex).toBe(4);
    expect(action.canAdvance).toBe(false);
  });

  it("names the word position in the instruction parameters", () => {
    const action = resolveTeacherAction(everyState.find(([name]) => name === "missing word")![1]);
    expect(action.titleParams).toEqual({ number: 3 });
  });
});

describe("the language-model boundary", () => {
  /**
   * The primary instruction is always one of a fixed set of locale keys. Text
   * written by the coach model or by the acoustic evaluator can only reach the
   * learner through Teacher notes, never as the thing they are told to do.
   */
  it("never lets service text become the instruction", () => {
    for (const [name, input] of everyState) {
      const action: TeacherAction = resolveTeacherAction(input);

      expect(action.titleKey.startsWith("now."), `${name}: ${action.titleKey}`).toBe(true);
      const rendered = JSON.stringify({ titleKey: action.titleKey, titleParams: action.titleParams, focusArabic: action.focusArabic });
      expect(rendered, name).not.toContain("Guidance text from the evaluator");
      expect(rendered, name).not.toContain("A summary the learner may read");
    }
  });

  it("keeps evaluator prose in the secondary notes only", () => {
    // A finding the teacher did not act on: the missing word is the
    // instruction, and the evaluator's sentence is available as detail.
    const action = resolveTeacherAction(evidence({
      attempt: attempt({ corrections: [{ expected: "رَبِّ", heard: null, status: "missing", wordIndex: 3 }], verseFollowing: follow({ state: "correcting" }) }),
      acoustic: {
        status: "available",
        provider: "test",
        confidence: 0.92,
        summary: "A summary the learner may read in Teacher notes.",
        findings: [{ kind: "phoneme", wordIndex: 6, expectedArabic: null, guidance: "Guidance text from the evaluator." }],
      },
    }));

    expect(action.titleKey).toBe("now.repeatWord");
    expect(action.secondaryNotes).toContainEqual({ kind: "acoustic", wordIndex: 6, guidance: "Guidance text from the evaluator." });
  });

  it("does not repeat the finding it acted on as a note as well", () => {
    const action = resolveTeacherAction(everyState.find(([name]) => name === "acoustic finding")![1]);

    expect(action.focusWordIndex).toBe(4);
    expect(action.secondaryNotes.filter((note) => note.kind === "acoustic")).toEqual([]);
  });

  it("cannot be handed an instruction from outside: presentation reads only the decision", () => {
    const input = everyState.find(([name]) => name === "advance")![1];
    const decision = decideTeacherAction(input);
    const presented = presentDecision(decision, input);

    expect(presented.kind).toBe(decision.action);
    expect(presented.titleKey).toBe("now.nextAyah");
    expect(presented.button).toEqual({ command: "next-ayah", labelKey: "now.goToAyah", params: { number: 3 } });
  });
});

describe("the teaching sequence travels with the action", () => {
  it("gives a word repeat the show-listen-repeat-recite sequence", () => {
    const action = resolveTeacherAction(everyState.find(([name]) => name === "missing word")![1]);
    expect(action.sequence).toEqual(["show-word", "listen", "repeat-word", "recite-ayah"]);
  });

  it("asks only for another recording when the attempt was unusable", () => {
    expect(resolveTeacherAction(evidence({ attempt: attempt({ reviewable: false }) })).sequence).toEqual(["record-again"]);
    expect(resolveTeacherAction(evidence({
      attempt: attempt({ verseFollowing: follow({ state: "uncertain", reason: "no_transcript", evidence: "none" }) }),
    })).sequence).toEqual(["listen", "record-again"]);
  });

  it("asks for nothing further once the ayah is complete", () => {
    expect(resolveTeacherAction(everyState.find(([name]) => name === "advance")![1]).sequence).toEqual([]);
  });
});
