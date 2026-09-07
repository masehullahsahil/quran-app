/**
 * The correction lesson's state, as data.
 *
 * The point of these is that the lesson invents nothing. Every stage below is
 * produced by replaying two facts — which control the learner pressed, and what
 * the backend's newest word-by-word result says about the target word — and the
 * same two facts always produce the same stage. There is no counter, no timer,
 * and no path that puts a word on screen that the decision did not name.
 */
import { describe, expect, it } from "vitest";
import type { VerseFollowingResult } from "@shared/verseFollowing";
import type { AttemptEvidence, TeacherEvidence, TextCorrection } from "@shared/teacherDecision";
import { resolveTeacherAction, type TeacherAction } from "./teacherAction";
import {
  CORRECTION_STAGES,
  deriveCorrectionLesson,
  type CorrectionLessonInput,
  type CorrectionStage,
} from "./correctionSession";
import en from "@locales/en";

const TARGET = "رَبِّ";
const AYAH_WORDS = ["ٱلْحَمْدُ", "لِلَّهِ", "رَبِّ", "ٱلْعَـٰلَمِينَ"];
const MISSING: TextCorrection = { expected: TARGET, heard: null, status: "missing", wordIndex: 3 };

function follow(patch: Partial<VerseFollowingResult> = {}): VerseFollowingResult {
  return {
    currentSurah: 1, currentAyah: 2, expectedWordIndex: 1, lastCompletedAyah: null, state: "correcting",
    attemptsOnCurrentAyah: 1, evidence: "partial", shouldAdvance: false, nextAyah: 3, correctionFocus: null,
    reason: "mistake_to_correct", ...patch,
  };
}

function attempt(patch: Partial<AttemptEvidence> = {}): AttemptEvidence {
  return { reviewable: true, corrections: [MISSING], verseFollowing: follow(), ...patch };
}

function evidence(patch: Partial<TeacherEvidence> = {}): TeacherEvidence {
  return {
    recording: { isRecording: false, isReviewing: false, failed: false },
    attempt: attempt(),
    acoustic: null,
    memory: { reviewDue: false, recurringWordIndexes: [] },
    livePosition: { currentSurah: 1, currentAyah: 2, expectedWordIndex: 1 },
    hasNextAyah: true,
    ...patch,
  };
}

/** The decision that names the target word, run through the real engine. */
const correctingAction: TeacherAction = resolveTeacherAction(evidence());
/** A decision that names no word: the learner has recorded nothing yet. */
const idleAction: TeacherAction = resolveTeacherAction(evidence({ attempt: null }));

function lessonFor(patch: Partial<CorrectionLessonInput> = {}) {
  return deriveCorrectionLesson({
    action: correctingAction,
    surah: 1,
    ayah: 2,
    observationKey: "correction.notHeard",
    ayahWords: AYAH_WORDS,
    corrections: [MISSING],
    wordReviewAvailable: true,
    lastAttemptScope: null,
    isRecording: false,
    isChecking: false,
    ...patch,
  });
}

describe("there is a lesson only when the decision named a word", () => {
  it("builds nothing before the first attempt", () => {
    expect(lessonFor({ action: idleAction, corrections: null, wordReviewAvailable: false })).toBeNull();
  });

  it("takes the word and its position from the decision, not from the ayah", () => {
    const lesson = lessonFor()!;
    expect(lesson.targetArabic).toBe(TARGET);
    expect(lesson.targetWordIndex).toBe(3);
    expect(lesson.totalWords).toBe(4);
  });

  it("shows the ayah as given, in order, with only the target marked", () => {
    const lesson = lessonFor()!;
    expect(lesson.context.words).toEqual(AYAH_WORDS);
    expect(lesson.context.targetIndex).toBe(3);
  });
});

describe("the four steps", () => {
  it("always names the same four, with exactly one current", () => {
    for (const stage of CORRECTION_STAGES) {
      const lesson = lessonFor({ session: { targetWordIndex: 3, targetArabic: TARGET, stage, recognition: "unknown" } })!;
      expect(lesson.steps.map((step) => step.stage)).toEqual([...CORRECTION_STAGES]);
      expect(lesson.steps.filter((step) => step.state === "current")).toHaveLength(1);
      expect(lesson.steps.find((step) => step.state === "current")!.stage).toBe(stage);
    }
  });

  it("marks everything before the current step as done", () => {
    const lesson = lessonFor({ session: { targetWordIndex: 3, targetArabic: TARGET, stage: "recite-ayah", recognition: "recognised" } })!;
    expect(lesson.steps.map((step) => step.state)).toEqual(["done", "done", "current", "upcoming"]);
  });

  it("has real wording for every step in the reference pack", () => {
    for (const step of lessonFor()!.steps) expect(en.strings[step.labelKey], step.stage).toBeTruthy();
  });
});

describe("the stage is a function of the backend's answer", () => {
  const stageOf = (patch: Partial<CorrectionLessonInput>): CorrectionStage => lessonFor(patch)!.stage;

  it("starts at hear, before the learner has recorded anything", () => {
    expect(stageOf({ lastAttemptScope: null })).toBe("hear");
  });

  it("keeps the learner on the word while the target is still named", () => {
    expect(stageOf({ lastAttemptScope: "word" })).toBe("say-word");
    expect(lessonFor({ lastAttemptScope: "word" })!.recognition).toBe("not-recognised");
  });

  it("moves to the ayah once the target is no longer named", () => {
    const lesson = lessonFor({ lastAttemptScope: "word", corrections: [] })!;
    expect(lesson.recognition).toBe("recognised");
    expect(lesson.stage).toBe("recite-ayah");
  });

  it("sends a whole-ayah attempt that still misses the word back to the start", () => {
    expect(stageOf({ lastAttemptScope: "ayah" })).toBe("hear");
  });

  it("is the same every time for the same two facts", () => {
    const twice = [lessonFor({ lastAttemptScope: "word" }), lessonFor({ lastAttemptScope: "word" })];
    expect(twice[0]).toEqual(twice[1]);
  });
});

describe("an attempt that could not be reviewed says nothing about the word", () => {
  it("reports the target as unknown rather than matched", () => {
    const lesson = lessonFor({ lastAttemptScope: "word", wordReviewAvailable: false, corrections: null })!;
    expect(lesson.recognition).toBe("unknown");
    // Unknown is not success: the learner stays on the word.
    expect(lesson.stage).toBe("say-word");
  });

  it("never claims recognition before an attempt exists", () => {
    expect(lessonFor({ lastAttemptScope: null })!.recognition).toBe("unknown");
  });
});

describe("the wording never claims the pronunciation was right", () => {
  it("says the word was heard, and nothing about how it was said", () => {
    const sentence = en.strings["lesson.recognised"].toLowerCase();
    expect(sentence).toContain("heard");
    for (const claim of ["pronunciation", "correct", "perfect", "makhraj", "tajwid", "tajweed"]) {
      expect(sentence, claim).not.toContain(claim);
    }
  });

  it("does not shame a learner whose word was not matched", () => {
    const lesson = lessonFor({ lastAttemptScope: "word" })!;
    expect(lesson.detailKey).toBe("lesson.notRecognisedDetail");
    const sentence = en.strings["lesson.notRecognisedDetail"].toLowerCase();
    for (const word of ["wrong", "incorrect", "failed", "mistake", "again and again"]) {
      expect(sentence, word).not.toContain(word);
    }
  });

  it("has real wording for every headline, detail and action it can reach", () => {
    const keys = new Set<string>();
    for (const scope of [null, "word", "ayah"] as const) {
      for (const corrections of [[MISSING], []]) {
        const lesson = lessonFor({ lastAttemptScope: scope, corrections })!;
        keys.add(lesson.headlineKey);
        keys.add(lesson.detailKey);
        keys.add(lesson.actionKey);
      }
    }
    for (const key of Array.from(keys)) expect(en.strings[key as keyof typeof en.strings], key).toBeTruthy();
  });
});

describe("the recorder is the page's own", () => {
  it("asks for one word at the word stages and the ayah at the ayah stage", () => {
    expect(lessonFor({ lastAttemptScope: null })!.action).toBe("record-word");
    expect(lessonFor({ lastAttemptScope: "word" })!.action).toBe("record-word");
    expect(lessonFor({ lastAttemptScope: "word", corrections: [] })!.action).toBe("record-ayah");
  });

  it("becomes a stop control while the microphone is open", () => {
    const lesson = lessonFor({ isRecording: true })!;
    expect(lesson.action).toBe("stop");
    expect(lesson.busy).toBe("recording");
    expect(lesson.actionKey).toBe("lesson.stopRecording");
  });

  it("says it is checking, and offers nothing to press, while the attempt is out", () => {
    const lesson = lessonFor({ isChecking: true })!;
    expect(lesson.busy).toBe("checking");
    expect(lesson.actionKey).toBe("lesson.checking");
  });
});

describe("the word is kept across one attempt, and only that", () => {
  const retained = { surah: 1, ayah: 2, wordIndex: 3, arabic: TARGET, observationKey: "correction.notHeard" as const };

  it("keeps the lesson on screen while the learner is recording", () => {
    // The decision names no word during a recording — the previous review was
    // cleared when the microphone opened — and the lesson must not vanish.
    const lesson = deriveCorrectionLesson({
      action: idleAction, surah: 1, ayah: 2, observationKey: null, ayahWords: AYAH_WORDS, corrections: null,
      wordReviewAvailable: false, lastAttemptScope: "word", isRecording: true, isChecking: false,
      retainedTarget: retained,
    });
    expect(lesson?.targetArabic).toBe(TARGET);
    expect(lesson?.busy).toBe("recording");
  });

  it("does not resurrect a word once a whole-ayah attempt has moved on", () => {
    const lesson = deriveCorrectionLesson({
      action: idleAction, surah: 1, ayah: 2, observationKey: null, ayahWords: AYAH_WORDS, corrections: [],
      wordReviewAvailable: true, lastAttemptScope: "ayah", isRecording: false, isChecking: false,
      retainedTarget: retained,
    });
    expect(lesson).toBeNull();
  });
});

describe("the service's own session, when it ships, wins outright", () => {
  it("uses the supplied stage and recognition rather than deriving them", () => {
    const lesson = lessonFor({
      // Everything derivable points at "say-word"; the session says otherwise.
      lastAttemptScope: "word",
      session: { targetWordIndex: 3, targetArabic: TARGET, stage: "continue", recognition: "recognised" },
    })!;
    expect(lesson.stage).toBe("continue");
    expect(lesson.recognition).toBe("recognised");
    expect(lesson.action).toBe("continue");
  });

  it("uses the word the session names", () => {
    const lesson = lessonFor({
      session: { targetWordIndex: 1, targetArabic: AYAH_WORDS[0], stage: "hear", recognition: "unknown" },
    })!;
    expect(lesson.targetArabic).toBe(AYAH_WORDS[0]);
    expect(lesson.targetWordIndex).toBe(1);
  });
});

describe("an attempt still in flight has no answer yet", () => {
  it("says nothing about the word while the learner is recording", () => {
    const lesson = lessonFor({ lastAttemptScope: "word", isRecording: true })!;
    // The previous attempt's corrections are still in hand; reading them here
    // would tell a learner mid-recording that the word they are currently
    // saying was not matched.
    expect(lesson.recognition).toBe("unknown");
    expect(lesson.detailKey).not.toBe("lesson.notRecognisedDetail");
  });

  it("says nothing about the word while the attempt is being checked", () => {
    expect(lessonFor({ lastAttemptScope: "word", isChecking: true })!.recognition).toBe("unknown");
  });

  it("keeps the learner on the same step either way", () => {
    expect(lessonFor({ lastAttemptScope: "word", isRecording: true })!.stage).toBe("say-word");
    expect(lessonFor({ lastAttemptScope: "word", isChecking: true })!.stage).toBe("say-word");
  });
});

describe("a correction belongs to the ayah it was made about", () => {
  /**
   * The production bug this covers. A learner corrected `رَبِّ` in Al-Fatiha 1:2
   * — word 3 of four — and Study then advanced to 1:3, which is two words long
   * and does not contain that word. The lesson kept rendering the old target
   * against the new ayah: "رَبِّ · Word 3 of 2".
   */
  const AYAH_3 = ["ٱلرَّحْمَـٰنِ", "ٱلرَّحِيمِ"];
  const retained = { surah: 1, ayah: 2, wordIndex: 3, arabic: TARGET, observationKey: "correction.notHeard" as const };

  const afterAdvancing = (patch: Partial<CorrectionLessonInput> = {}) =>
    deriveCorrectionLesson({
      action: idleAction,
      surah: 1,
      ayah: 3,
      observationKey: null,
      ayahWords: AYAH_3,
      corrections: null,
      wordReviewAvailable: false,
      lastAttemptScope: "word",
      isRecording: false,
      isChecking: false,
      retainedTarget: retained,
      ...patch,
    });

  it("drops a target held from the previous ayah", () => {
    expect(afterAdvancing()).toBeNull();
  });

  it("drops it even mid-recording, when the lesson would otherwise be held open", () => {
    expect(afterAdvancing({ isRecording: true })).toBeNull();
    expect(afterAdvancing({ isChecking: true })).toBeNull();
  });

  it("drops a target from a different surah at the same ayah number", () => {
    expect(afterAdvancing({ surah: 2, ayah: 2, ayahWords: AYAH_WORDS })).toBeNull();
  });

  it("keeps it while the learner is still on the ayah it was made about", () => {
    expect(afterAdvancing({ ayah: 2, ayahWords: AYAH_WORDS, isRecording: true })?.targetArabic).toBe(TARGET);
  });
});

describe("a target the ayah on screen cannot support is never rendered", () => {
  const AYAH_3 = ["ٱلرَّحْمَـٰنِ", "ٱلرَّحِيمِ"];

  it("refuses a word index past the end of the ayah", () => {
    // The shape of the reported bug: word 3 of a two-word ayah.
    expect(lessonFor({ ayahWords: AYAH_3 })).toBeNull();
  });

  it("refuses index zero and a negative index", () => {
    for (const wordIndex of [0, -1]) {
      expect(lessonFor({ session: { targetWordIndex: wordIndex, targetArabic: TARGET, stage: "hear", recognition: "unknown" } }), String(wordIndex)).toBeNull();
    }
  });

  it("refuses a word that is not the one standing at that position", () => {
    expect(lessonFor({ session: { targetWordIndex: 1, targetArabic: TARGET, stage: "hear", recognition: "unknown" } })).toBeNull();
  });

  it("refuses everything while the ayah text has not arrived", () => {
    expect(lessonFor({ ayahWords: [] })).toBeNull();
  });

  it("applies the check to the service's own session too", () => {
    const session = { targetWordIndex: 3, targetArabic: TARGET, stage: "say-word" as const, recognition: "recognised" as const };
    expect(lessonFor({ session })).not.toBeNull();
    // The session says word 3; this ayah has two. The session does not get to
    // put a word on screen that the ayah does not have.
    expect(lessonFor({ session, ayahWords: AYAH_3 })).toBeNull();
  });

  it("still renders when the spellings differ only in harakat or which alif is written", () => {
    // The reviewer's expected text and the ayah on screen legitimately differ
    // this way, and treating them as different words would hide a real
    // correction. The comparison folds them; neither string is rewritten.
    const lesson = lessonFor({
      ayahWords: ["قُلْ", "هُوَ", "ٱللَّهُ", "أَحَدٌ"],
      session: { targetWordIndex: 3, targetArabic: "اللَّهُ", stage: "hear", recognition: "unknown" },
    })!;
    expect(lesson.targetArabic).toBe("اللَّهُ");
    // The ayah keeps its own spelling, untouched.
    expect(lesson.context.words[2]).toBe("ٱللَّهُ");
  });

  it("reports a position the ayah actually has", () => {
    const lesson = lessonFor()!;
    expect(lesson.targetWordIndex).toBeLessThanOrEqual(lesson.totalWords);
    expect(lesson.totalWords).toBe(AYAH_WORDS.length);
  });
});
