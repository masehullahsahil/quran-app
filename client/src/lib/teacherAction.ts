/**
 * What the teacher would say next.
 *
 * Study mode gathers evidence from several systems at once — the live tracker,
 * the recorded word review, the memorization schedule, the recorder itself. The
 * learner should not have to read all of them. This module reduces that state to
 * exactly one instruction and at most one contextual button, deterministically.
 *
 * It decides nothing. Verse-following rules, mastery scheduling and the word
 * alignment are all upstream of this and unchanged; this only chooses which of
 * their conclusions is the one to show largest.
 *
 * Nothing here describes how the recitation *sounded*: an instruction to repeat
 * a word means that word was not recognised in the transcript, not that it was
 * mispronounced.
 */
import type { StringKey } from "@locales/index";
import type { VerseFollowingResult } from "@shared/verseFollowing";

export type TeacherActionKind =
  /** The microphone is open. */
  | "listening"
  /** A recording is being reviewed. */
  | "reviewing"
  /** The attempt could not be reviewed; the learner should record again. */
  | "recording-problem"
  /** One word needs repeating. */
  | "repeat-word"
  /** The whole ayah needs another attempt. */
  | "repeat-ayah"
  /** The ayah was recited; move on. */
  | "next-ayah"
  /** The last ayah of the surah is done. */
  | "surah-complete"
  /** Part of the ayah was recited; carry on from where it stopped. */
  | "continue"
  /** Nothing attempted yet, and this ayah is due for review. */
  | "review-today"
  /** Nothing attempted yet. */
  | "listen-first";

/** The one contextual button, when there is something to offer beyond the mic. */
export type TeacherActionButton = {
  /** What the button does. The page supplies the handler. */
  command: "retry-ayah" | "next-ayah";
  labelKey: StringKey;
  params?: Record<string, string | number>;
};

export type TeacherAction = {
  kind: TeacherActionKind;
  /** The dominant line: one instruction, in learner wording. */
  titleKey: StringKey;
  titleParams?: Record<string, string | number>;
  /** The word to repeat, shown large in Arabic. Null unless kind is repeat-word. */
  focusArabic: string | null;
  focusWordIndex: number | null;
  /**
   * At most one button. Null when the listen and record controls below are
   * already the natural next step, so the page never shows two competing CTAs.
   */
  button: TeacherActionButton | null;
  /** Drives the accent only — never a claim about recitation quality. */
  tone: "neutral" | "attention" | "success";
  /** The ayah to move to when `command` is "next-ayah". */
  targetAyah: number | null;
};

export type CorrectionFocus = {
  wordIndex: number;
  expectedArabic: string;
};

/** The subset of a recorded review this module reads. */
export type ReviewEvidence = {
  wordReviewAvailable: boolean;
  corrections: Array<{ expected: string; heard: string | null; wordIndex: number | null }>;
  verseFollowing: VerseFollowingResult;
};

export type TeacherActionInput = {
  isRecording: boolean;
  isReviewing: boolean;
  /** A recorder or network failure the learner needs to retry past. */
  recordingError: boolean;
  review: ReviewEvidence | null;
  /** The live tracker's place, which updates while reciting as well as after. */
  position: { currentAyah: number; expectedWordIndex: number };
  /** Whether this ayah is scheduled for review today. Never overrides a correction. */
  reviewDue: boolean;
  /** Whether there is an ayah after the tracker's current one. */
  hasNextAyah: boolean;
};

/**
 * The word to put in front of the learner, or null.
 *
 * The tracker's own focus wins: it is the word the learner is expected to
 * continue from. Otherwise the first correction of the recorded review is used.
 * A review that advanced the ayah has no focus — the learner is moving on.
 */
export function pickCorrectionFocus(review: ReviewEvidence | null): CorrectionFocus | null {
  if (!review || !review.wordReviewAvailable) return null;
  if (review.verseFollowing.shouldAdvance) return null;

  const tracked = review.verseFollowing.correctionFocus;
  if (tracked) return { wordIndex: tracked.wordIndex, expectedArabic: tracked.expectedArabic };

  const first = review.corrections.find((item) => item.wordIndex !== null && item.expected);
  return first?.wordIndex ? { wordIndex: first.wordIndex, expectedArabic: first.expected } : null;
}

/**
 * Chooses the single instruction to show, in a fixed order of precedence:
 *
 *  1. what the microphone is doing right now;
 *  2. a failure the learner has to get past;
 *  3. the tracker's conclusion about the ayah just recited — advance, finish,
 *     fix one word, or try the ayah again;
 *  4. where to carry on from, when the ayah was only partly recited;
 *  5. a review that is due, which is context rather than a correction and so
 *     never displaces one;
 *  6. otherwise, listen first.
 */
export function resolveTeacherAction(input: TeacherActionInput): TeacherAction {
  const base = { focusArabic: null, focusWordIndex: null, button: null, targetAyah: null } as const;

  if (input.isRecording) {
    return { ...base, kind: "listening", titleKey: "now.listening", tone: "neutral" };
  }

  if (input.isReviewing) {
    return { ...base, kind: "reviewing", titleKey: "now.reviewing", tone: "neutral" };
  }

  if (input.recordingError || (input.review !== null && !input.review.wordReviewAvailable)) {
    return {
      ...base,
      kind: "recording-problem",
      titleKey: "now.recordAgain",
      button: { command: "retry-ayah", labelKey: "now.tryAgain" },
      tone: "attention",
    };
  }

  const follow = input.review?.verseFollowing ?? null;

  if (follow?.shouldAdvance && input.hasNextAyah) {
    return {
      ...base,
      kind: "next-ayah",
      titleKey: "now.nextAyah",
      titleParams: { number: follow.currentAyah },
      button: { command: "next-ayah", labelKey: "now.goToAyah", params: { number: follow.currentAyah } },
      tone: "success",
      targetAyah: follow.currentAyah,
    };
  }

  if (follow?.state === "completed") {
    return { ...base, kind: "surah-complete", titleKey: "now.surahComplete", tone: "success" };
  }

  const focus = pickCorrectionFocus(input.review);
  if (focus) {
    return {
      ...base,
      kind: "repeat-word",
      titleKey: "now.repeatWord",
      titleParams: { number: focus.wordIndex },
      focusArabic: focus.expectedArabic,
      focusWordIndex: focus.wordIndex,
      button: { command: "retry-ayah", labelKey: "now.repeat" },
      tone: "attention",
    };
  }

  if (follow?.state === "correcting" || follow?.state === "uncertain") {
    return {
      ...base,
      kind: "repeat-ayah",
      titleKey: "now.repeatAyah",
      titleParams: { number: follow.currentAyah },
      button: { command: "retry-ayah", labelKey: "now.repeat" },
      tone: "attention",
    };
  }

  if (follow?.state === "following") {
    // Part-way through: the record control below is the next step, so no button.
    return {
      ...base,
      kind: "continue",
      titleKey: "now.continueFromWord",
      titleParams: { number: follow.expectedWordIndex },
      focusWordIndex: follow.expectedWordIndex,
      tone: "neutral",
    };
  }

  if (input.reviewDue) {
    return { ...base, kind: "review-today", titleKey: "now.reviewToday", tone: "neutral" };
  }

  return {
    ...base,
    kind: "listen-first",
    titleKey: input.position.expectedWordIndex > 1 ? "now.continueFromWord" : "now.listenFirst",
    titleParams: { number: input.position.expectedWordIndex },
    tone: "neutral",
  };
}
