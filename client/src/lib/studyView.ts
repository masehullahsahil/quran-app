/**
 * What the Study screen shows, and in which tier.
 *
 * The page renders this; it decides nothing. Three tiers, in the order a
 * learner reads them:
 *
 *   1. NOW — where you are, one instruction, the mic, at most one extra button.
 *   2. ACTIVE CORRECTION — the word to fix, immediately below NOW and never
 *      collapsed. Absent when there is nothing confirmed to fix.
 *   3. TEACHER NOTES — everything that explains rather than instructs,
 *      collapsed by default. Warnings never live here.
 *
 * Keeping this as a function rather than as JSX conditionals is what lets the
 * layout contract be tested: exactly one instruction, at most one contextual
 * call to action, a confirmed correction never hidden inside notes, and an
 * uncertain result never dressed as a confirmed mistake.
 */
import type { StringKey } from "@locales/index";
import type { TeacherAction, TeacherObservation } from "./teacherAction";

/** One short sentence explaining what was observed about the focus word. */
const OBSERVATION_KEYS: Record<TeacherObservation, StringKey> = {
  "not-heard": "correction.notHeard",
  "came-through-differently": "correction.different",
  "sound-observation": "correction.sound",
};

export type StudyCorrectionPanel = {
  /** The word to put in front of the learner, large and in Arabic. */
  arabic: string;
  wordIndex: number;
  /** One line saying what was observed. Never a score. */
  explanationKey: StringKey;
  /** Whether to offer the slow reference playback beside it. */
  offerReference: boolean;
  /**
   * False when the evidence was not good enough to confirm a mistake, so the
   * panel must not use the confirmed-error styling.
   */
  confirmed: boolean;
};

export type StudyTiers = {
  now: {
    /** "Al-Ikhlas · Ayah 2 · Word 3" — assembled by the page from these parts. */
    showWordPosition: boolean;
    instructionKey: StringKey;
    instructionParams?: Record<string, string | number>;
    tone: TeacherAction["tone"];
    /** At most one contextual button beyond listen and record. */
    cta: TeacherAction["button"];
    /** The teaching sequence, when there is more than one step to show. */
    sequence: readonly string[];
  };
  /** Tier 2. Null when there is nothing confirmed to correct. */
  correction: StudyCorrectionPanel | null;
  /** Blocking messages that stay visible outside Teacher notes. */
  alerts: { audioUnavailable: boolean; reviewFailed: boolean; reviewUnavailable: boolean };
  /** Tier 3 keys, in render order. Everything here is collapsed by default. */
  notes: StudyNoteBlock[];
};

export type StudyNoteBlock =
  | "observations"
  | "score"
  | "corrections"
  | "memory"
  | "place"
  | "acoustic"
  | "plan"
  | "stages";

export type StudyViewInput = {
  action: TeacherAction;
  /** A review has come back for this ayah. */
  hasFeedback: boolean;
  /** The review produced a usable word-by-word result. */
  wordReviewAvailable: boolean;
  /** The specialised evaluator returned something worth a note. */
  hasAcousticReview: boolean;
  audioUnavailable: boolean;
  reviewFailed: boolean;
};

/** Actions whose focus word is a confirmed observation rather than a guess. */
const CONFIRMED_CORRECTION_KINDS = new Set(["repeat-word"]);

export function describeStudyTiers(input: StudyViewInput): StudyTiers {
  const { action } = input;

  const correction: StudyCorrectionPanel | null =
    action.focusArabic && action.focusWordIndex !== null && CONFIRMED_CORRECTION_KINDS.has(action.kind)
      ? {
          arabic: action.focusArabic,
          wordIndex: action.focusWordIndex,
          explanationKey: OBSERVATION_KEYS[observationOf(action)],
          offerReference: true,
          // Only an action the engine reached on confirmed evidence may be
          // styled as a mistake. `unsure` never gets there.
          confirmed: action.tone !== "unsure",
        }
      : null;

  const notes: StudyNoteBlock[] = [];
  if (action.secondaryNotes.length > 0) notes.push("observations");
  if (input.hasFeedback) notes.push("score");
  if (input.hasFeedback && input.wordReviewAvailable) notes.push("corrections");
  notes.push("memory");
  if (input.hasFeedback) notes.push("place");
  if (input.hasAcousticReview) notes.push("acoustic");
  notes.push("plan", "stages");

  return {
    now: {
      // The word position belongs on screen only when the instruction is about
      // one: "Ayah 2 · Word 3" is noise when the whole ayah is the subject.
      showWordPosition: action.focusWordIndex !== null,
      instructionKey: action.titleKey,
      instructionParams: action.titleParams,
      tone: action.tone,
      cta: action.button,
      sequence: action.sequence,
    },
    correction,
    alerts: {
      audioUnavailable: input.audioUnavailable,
      reviewFailed: input.reviewFailed,
      reviewUnavailable: input.hasFeedback && !input.wordReviewAvailable,
    },
    notes,
  };
}

/** The observation behind the current focus, defaulting to the safest reading. */
function observationOf(action: TeacherAction): TeacherObservation {
  if (action.titleKey === "now.repeatWordSound") return "sound-observation";
  if (action.reason === "text_recurring_word" || action.reason === "text_missing_word") {
    return action.observation ?? "not-heard";
  }
  return action.observation ?? "came-through-differently";
}
