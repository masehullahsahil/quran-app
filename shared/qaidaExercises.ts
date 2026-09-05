/**
 * Exercise vocabulary for the Qaida curriculum.
 *
 * This module defines *shapes*, not lessons: the exercise types a lesson may
 * use, the small builders that keep lesson data terse, and the predicates the
 * curriculum tests check every practice item against. Lesson content lives in
 * shared/qaidaCurriculum.ts.
 *
 * Scope boundary: every exercise here is a *reading* exercise — recognising a
 * letter, a vowel mark, a joined form, or a mushaf symbol on the page, or
 * reading it aloud for the learner's own ear. None of them judges makhraj,
 * tajwid accuracy, pronunciation, madd duration, or ghunnah duration. The app
 * can only make an acoustic observation where the separate, confidence-gated
 * Quran-aware evaluator returns one (shared/quranEvaluation.ts).
 *
 * English text is inline rather than behind locale keys, following the same
 * pattern as shared/learningPath.ts: this is teaching content, kept in one
 * reviewable place, not interface chrome.
 */

export const QAIDA_EXERCISE_TYPES = [
  /** A letter is shown; name it. */
  "identify-letter",
  /** A sound is named; pick the correctly vowelled letter. */
  "choose-vowelled-form",
  /** A reference recording plays; pick the letter or form it belongs to. */
  "match-audio",
  /** Pick the right joined form for a position in a word. */
  "choose-connected-form",
  /** Tell two visually similar letters apart. */
  "distinguish-similar",
  /** Read a short combination and pick how it reads. */
  "build-combination",
  /** Read a teaching combination or a Quranic word aloud. */
  "read-word",
  /** Name a mushaf symbol and what it asks the reader to do. */
  "identify-symbol",
  /** Read an ayah of the Quran itself, opened from the app's Quran data. */
  "read-quran",
] as const;

export type QaidaExerciseType = (typeof QAIDA_EXERCISE_TYPES)[number];

/** Exercise types answered by choosing one of several options. */
export const CHOICE_EXERCISE_TYPES = [
  "identify-letter",
  "choose-vowelled-form",
  "match-audio",
  "choose-connected-form",
  "distinguish-similar",
  "build-combination",
  "identify-symbol",
] as const satisfies readonly QaidaExerciseType[];

/** Exercise types the learner completes by reading aloud and confirming. */
export const READ_EXERCISE_TYPES = ["read-word", "read-quran"] as const satisfies readonly QaidaExerciseType[];

export function isChoiceExercise(type: QaidaExerciseType): boolean {
  return (CHOICE_EXERCISE_TYPES as readonly QaidaExerciseType[]).includes(type);
}

export function isReadExercise(type: QaidaExerciseType): boolean {
  return (READ_EXERCISE_TYPES as readonly QaidaExerciseType[]).includes(type);
}

/**
 * Where a piece of Arabic on screen comes from.
 *
 * `teaching` is a syllable or combination built to practise a shape — it is not
 * Quran and must never be presented as Quran. `quran` is Quranic text and
 * always carries its `reference`.
 */
export type QaidaTextSource = "teaching" | "quran";

export type QaidaArabicText = {
  arabic: string;
  /** Plain-English gloss: how it reads, or what it means. Never a tajwid ruling. */
  gloss: string;
  source: QaidaTextSource;
  /** "1:1" style reference. Required when `source` is "quran". */
  reference?: string;
};

/** A reference recording already present in the app's letter audio set. */
export type QaidaAudioRef = {
  letterSlug: string;
  harakat?: "fatha" | "kasra" | "damma";
};

export type QaidaChoice = {
  id: string;
  /** English label, for choices answered by name. */
  label?: string;
  /** Arabic glyph, for choices answered by shape. */
  arabic?: string;
  correct: boolean;
};

/** A pointer into the app's own Quran data, so no ayah text is copied here. */
export type QaidaQuranRef = {
  surah: number;
  ayah: number;
  /** Short well-known name, for the button label. */
  label: string;
};

export type QaidaExercise = {
  id: string;
  type: QaidaExerciseType;
  /** English question or instruction. */
  prompt: string;
  /** The Arabic the question is about, when the question shows any. */
  subject?: QaidaArabicText;
  /** Reference audio to play with the question, when the set carries it. */
  audio?: QaidaAudioRef;
  /** Options for a choice exercise; exactly one is correct. */
  choices?: QaidaChoice[];
  /** The ayah a `read-quran` exercise opens in Study mode. */
  quran?: QaidaQuranRef;
  /** One extra line of guidance shown after answering. */
  note?: string;
};

/** A teaching combination: built to practise a shape, never presented as Quran. */
export function teaching(arabic: string, gloss: string): QaidaArabicText {
  return { arabic, gloss, source: "teaching" };
}

/** Quranic text, always with its reference. */
export function quranWord(arabic: string, gloss: string, reference: string): QaidaArabicText {
  return { arabic, gloss, source: "quran", reference };
}

/**
 * Builds the choice list. Lesson data is written correct-answer-first because
 * that is how it reads, so the answer must be moved before it reaches a learner
 * — see `placeChoices`, which every lesson's items are passed through.
 */
export function choices(options: Array<{ label?: string; arabic?: string; correct?: boolean }>): QaidaChoice[] {
  return options.map((option, index) => ({
    id: `option-${index + 1}`,
    ...(option.label === undefined ? {} : { label: option.label }),
    ...(option.arabic === undefined ? {} : { arabic: option.arabic }),
    correct: option.correct === true,
  }));
}

/** A small stable hash, so answer placement is fixed per item and repeatable. */
function hashExerciseId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * Moves the correct answer off the first position.
 *
 * Lesson data lists the right answer first, which would let a learner finish the
 * whole course by always tapping the top option — passing every lesson without
 * reading a single letter. Rotating by a hash of the exercise id fixes that
 * while keeping the data deterministic: the same item always presents its
 * options in the same order, so tests and screenshots do not drift.
 */
export function placeChoices(exerciseId: string, options: QaidaChoice[]): QaidaChoice[] {
  if (options.length < 2) return options;
  const offset = hashExerciseId(exerciseId) % options.length;
  const rotated = [...options.slice(offset), ...options.slice(0, offset)];
  // Re-number after rotating so the ids read in the order they are shown.
  return rotated.map((choice, index) => ({ ...choice, id: `option-${index + 1}` }));
}

/** The correct choice of a choice exercise, or null for a read exercise. */
export function correctChoice(exercise: QaidaExercise): QaidaChoice | null {
  return exercise.choices?.find((choice) => choice.correct) ?? null;
}

/**
 * Whether an answer completes the exercise.
 *
 * A read exercise has no right answer to grade — the learner confirms they read
 * it. That is an attempt record, not a judgement of how it sounded.
 */
export function isCorrectAnswer(exercise: QaidaExercise, choiceId: string | null): boolean {
  if (isReadExercise(exercise.type)) return true;
  return Boolean(choiceId) && correctChoice(exercise)?.id === choiceId;
}
