/**
 * What the Study screen shows, and in which tier.
 *
 * The page renders this; it decides nothing. Three tiers, in the order a
 * learner reads them:
 *
 *   1. NOW — where you are, one instruction, the mic, at most one extra button.
 *   2. THE RESULT — one card, immediately below NOW and never collapsed. It is
 *      either the exact word to fix (`correction`) or, when the decision named
 *      no word, what actually happened instead (`outcome`): the whole ayah
 *      again, an attempt that could not be judged, or an accepted one. The two
 *      are mutually exclusive, so a learner is never shown a word to repeat and
 *      a "recite it all again" card at once.
 *   3. TEACHER NOTES — everything that explains rather than instructs,
 *      collapsed by default. Warnings never live here.
 *
 * Keeping this as a function rather than as JSX conditionals is what lets the
 * layout contract be tested: exactly one instruction, at most one contextual
 * call to action, a confirmed correction never hidden inside notes, and an
 * uncertain result never dressed as a confirmed mistake.
 */
import type { StringKey } from "@locales/index";
import type { TeacherAction, TeacherObservation, TeachingStep } from "./teacherAction";

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
   * What that playback actually is. The Quran data this app reads carries one
   * recitation file per ayah and no word-level timings, so there is no
   * trustworthy recording of a single word to offer. Rather than synthesise one
   * — which would put a machine voice on Quranic Arabic — the card replays the
   * whole ayah slowly and says so.
   */
  reference: "ayah";
  /**
   * False when the evidence was not good enough to confirm a mistake, so the
   * panel must not use the confirmed-error styling.
   */
  confirmed: boolean;
  /** What was observed, carried through so a test can check the wording matches. */
  observation: TeacherObservation;
  /**
   * The steps to walk through, in order. These are the decision's own teaching
   * sequence minus `show-word`: the card *is* the word, so naming it as a step
   * would just point at itself. The recorder is rendered as the final step when
   * `offerRecord` is set — that is the same control, not an extra instruction.
   */
  steps: readonly TeachingStep[];
  offerRecord: boolean;
};

/**
 * The tier-2 card for the states that are *not* about one word.
 *
 * Each is deliberately its own kind rather than a flag on the correction panel:
 * "I could not tell" must never be able to render as "this word was wrong", and
 * "recite the whole ayah again" must never borrow the exact-word styling.
 */
export type StudyOutcomePanel = {
  kind: "whole-ayah" | "uncertain" | "accepted";
  /** The one line the learner reads first. */
  headlineKey: StringKey;
  /** One short line of context beneath it. Never a score, never a claim. */
  detailKey: StringKey;
  /** The same teaching sequence treatment as the correction card. */
  steps: readonly TeachingStep[];
  /** Whether the recorder is this card's terminal step. */
  offerRecord: boolean;
  /** Whether replaying the ayah is offered here. */
  offerReference: boolean;
  /** The decision's own button, when it has one. Never re-derived. */
  cta: TeacherAction["button"];
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
  /**
   * Tier 2 when no single word is at fault. Mutually exclusive with
   * `correction`: the learner is never shown a word to fix and a "the whole
   * attempt again" card at the same time.
   */
  outcome: StudyOutcomePanel | null;
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

  const observation = observationOf(action);
  const correction: StudyCorrectionPanel | null =
    action.focusArabic && action.focusWordIndex !== null && CONFIRMED_CORRECTION_KINDS.has(action.kind)
      ? {
          arabic: action.focusArabic,
          wordIndex: action.focusWordIndex,
          explanationKey: OBSERVATION_KEYS[observation],
          observation,
          offerReference: true,
          reference: "ayah",
          steps: cardSteps(action),
          offerRecord: true,
          // Only an action the engine reached on confirmed evidence may be
          // styled as a mistake. `unsure` never gets there.
          confirmed: action.tone !== "unsure",
        }
      : null;

  const outcome = correction ? null : outcomeFor(action);
  // Whichever tier-2 card is showing takes the steps and the contextual button
  // with it. Leaving copies in NOW would give the learner two places to tap for
  // the same thing, a few centimetres apart; NOW keeps the instruction, the
  // place and the microphone, and the card owns the path back to it.
  const card = correction ?? outcome;

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
      cta: card ? null : action.button,
      sequence: card ? [] : action.sequence,
    },
    correction,
    outcome,
    alerts: {
      audioUnavailable: input.audioUnavailable,
      reviewFailed: input.reviewFailed,
      reviewUnavailable: input.hasFeedback && !input.wordReviewAvailable,
    },
    notes,
  };
}

/**
 * The steps a tier-2 card walks the learner through.
 *
 * `show-word` is dropped: the card puts the word on screen itself, so listing
 * "look at the word" beside it points at nothing. Everything else is the
 * decision's own sequence, in the decision's own order — no step is invented
 * here and none is reordered.
 */
function cardSteps(action: TeacherAction): readonly TeachingStep[] {
  return action.sequence.filter((step) => step !== "show-word");
}

/**
 * The tier-2 card when the decision named no word.
 *
 * Each branch reads one action kind and nothing else. There is no fallback that
 * turns an unrecognised kind into a correction: a state this function does not
 * know about renders no card at all, which is the safe direction to fail in.
 */
function outcomeFor(action: TeacherAction): StudyOutcomePanel | null {
  // Only a button that goes somewhere is carried. A "Try again" button here
  // would sit beside the card's own Record again and mean nearly the same
  // thing, which is exactly the ambiguity this card exists to remove.
  const cta = action.button?.command === "next-ayah" ? action.button : null;
  const base = { steps: cardSteps(action), cta, offerReference: true };

  switch (action.kind) {
    // The whole recitation needs another attempt, and no single word is being
    // blamed for it. Deliberately its own card: pointing at a word here would
    // be a claim the decision did not make.
    case "repeat-ayah":
      return { ...base, kind: "whole-ayah", headlineKey: "outcome.ayahHeadline", detailKey: "outcome.ayahDetail", offerRecord: true };

    // The app could not tell. Nothing is marked wrong, no word is shown, and
    // the wording says what happened rather than implying a mistake.
    case "unclear":
      return { ...base, kind: "uncertain", headlineKey: "outcome.unclearHeadline", detailKey: "outcome.unclearDetail", offerRecord: true };
    case "recording-problem":
      return { ...base, kind: "uncertain", headlineKey: "outcome.problemHeadline", detailKey: "outcome.problemDetail", offerRecord: true };

    // Accepted. The learner sees that plainly, and what comes next is the
    // decision's own button — the view does not decide where they go.
    case "next-ayah":
      return { ...base, kind: "accepted", headlineKey: "outcome.acceptedHeadline", detailKey: "outcome.acceptedDetail", offerRecord: false, offerReference: false };
    case "surah-complete":
      return { ...base, kind: "accepted", headlineKey: "outcome.surahHeadline", detailKey: "outcome.surahDetail", offerRecord: false, offerReference: false };

    default:
      return null;
  }
}

/** The observation behind the current focus, defaulting to the safest reading. */
function observationOf(action: TeacherAction): TeacherObservation {
  if (action.titleKey === "now.repeatWordSound") return "sound-observation";
  if (action.reason === "text_recurring_word" || action.reason === "text_missing_word") {
    return action.observation ?? "not-heard";
  }
  return action.observation ?? "came-through-differently";
}
