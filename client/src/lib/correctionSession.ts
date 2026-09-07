/**
 * One word, practised as a short lesson.
 *
 * When the app finds a word a learner did not get through, showing the word and
 * "try again" is a marker, not teaching. A teacher does something narrower:
 * points at the place, says it, has the learner say it back, listens to *that*,
 * and only then asks for the whole ayah again. This module holds the state of
 * that little lesson so the screen can render it.
 *
 * **It invents no progress.** Every verdict here comes from a backend result:
 * whether the target word was heard is read from the newest attempt's own
 * corrections list, never from a counter this module keeps. The only local
 * input is `lastAttemptScope` — which of the two record buttons the learner
 * pressed — because the app has to know whether the recording it just sent was
 * one word or a whole ayah in order to read the answer correctly. That is the
 * learner's action, not a judgement about their recitation.
 *
 * **Codex's session wins.** `deriveCorrectionLesson` accepts an optional
 * `session` in the shape the recitation service will supply once the server
 * holds the correction session itself. When it is present, its `stage` and
 * `recognition` are used as given and nothing below is consulted. The
 * derivation exists so this screen works against the contract that ships today,
 * and so swapping in the server's own state is a one-field change.
 */
import type { StringKey } from "@locales/index";
import type { TeacherAction } from "./teacherAction";
import type { TextCorrection } from "@shared/teacherDecision";

/**
 * The four things a learner does, in order.
 *
 * Not a wizard: at most one of these is ever "current", the strip is four short
 * words, and the learner can leave at any point by simply reciting the ayah.
 */
export type CorrectionStage = "hear" | "say-word" | "recite-ayah" | "continue";

export const CORRECTION_STAGES: readonly CorrectionStage[] = ["hear", "say-word", "recite-ayah", "continue"];

/** The learner-facing name of each stage. */
export const STAGE_LABEL_KEYS: Record<CorrectionStage, StringKey> = {
  hear: "lesson.stageHear",
  "say-word": "lesson.stageSay",
  "recite-ayah": "lesson.stageRecite",
  continue: "lesson.stageContinue",
};

/**
 * What the app knows about the target word after the most recent attempt.
 *
 * `unknown` is a real answer and the common one: an attempt that could not be
 * reviewed says nothing about the word, and must not be reported as either
 * success or failure.
 */
export type TargetRecognition = "recognised" | "not-recognised" | "unknown";

/** Which control the learner pressed to make the recording being judged. */
export type AttemptScope = "word" | "ayah";

/**
 * The correction session as the recitation service will supply it.
 *
 * Kept as a separate type from the derived lesson on purpose: this is a wire
 * shape to agree on, and the renderer never sees it directly.
 */
export type CorrectionSessionSnapshot = {
  targetWordIndex: number;
  targetArabic: string;
  stage: CorrectionStage;
  recognition: TargetRecognition;
  /** How many focused attempts have been made on this word. Display only. */
  attemptsOnTarget?: number;
};

/**
 * The word the lesson is about, as the page remembers it.
 *
 * Carries the observation too: "what was observed about this word" is settled
 * when the decision names it, and must not change into a different sentence
 * just because a later render no longer has the decision in hand.
 */
export type RetainedTarget = {
  /**
   * The ayah this correction was made about.
   *
   * Scoping it is not bookkeeping. A correction is a statement about one word
   * of one ayah, and the moment the learner is on a different ayah it is a
   * statement about somewhere else. Without this, advancing from Al-Fatiha 1:2
   * to 1:3 carried `رَبِّ` across and rendered "Word 3 of 2" — a word that is
   * not in the ayah on screen, at a position that ayah does not have.
   */
  surah: number;
  ayah: number;
  wordIndex: number;
  arabic: string;
  observationKey: StringKey;
};

export type CorrectionLessonInput = {
  /** The presented decision. The source of the target word, and of nothing else. */
  action: TeacherAction;
  /** The ayah on screen right now. Anything about another ayah is not shown. */
  surah: number;
  ayah: number;
  /** What was observed about the word the decision named, when it named one. */
  observationKey: StringKey | null;
  /** The expected ayah, word by word, exactly as the Quran text gives it. */
  ayahWords: readonly string[];
  /** The newest attempt's word-by-word result, when there was one. */
  corrections: readonly TextCorrection[] | null;
  /** False when the newest attempt produced no usable word-by-word result. */
  wordReviewAvailable: boolean;
  /** The scope of the newest attempt. Null before the learner has recorded. */
  lastAttemptScope: AttemptScope | null;
  /**
   * The word the lesson is about, held across one attempt.
   *
   * The decision names no focus while a recording is in flight — the previous
   * review is cleared the moment the microphone opens — and it names none once
   * the word has gone through. Without this the lesson would vanish under the
   * learner mid-sentence and never get to say "I heard it". This is the
   * backend's own most recent answer, kept for the length of one attempt; it is
   * never used to *create* a correction, only to keep showing one that was
   * already made. The page clears it when a whole-ayah attempt resolves the word.
   */
  retainedTarget?: RetainedTarget | null;
  /** The microphone is open. */
  isRecording: boolean;
  /** An attempt is with the reviewer. */
  isChecking: boolean;
  /** The server's own session, once it supplies one. Takes precedence entirely. */
  session?: CorrectionSessionSnapshot | null;
};

export type CorrectionStep = {
  stage: CorrectionStage;
  labelKey: StringKey;
  state: "done" | "current" | "upcoming";
};

export type CorrectionLesson = {
  targetArabic: string;
  /** One sentence on what was observed. A fixed key, chosen by the decision. */
  observationKey: StringKey;
  targetWordIndex: number;
  /** How many words the ayah has, so "Word 3 of 4" can be read. */
  totalWords: number;
  stage: CorrectionStage;
  steps: readonly CorrectionStep[];
  recognition: TargetRecognition;
  /** The headline for the current stage. One key, chosen from a fixed table. */
  headlineKey: StringKey;
  /** One line beneath it. Never a claim about pronunciation quality. */
  detailKey: StringKey;
  /** The label of the one primary action at this stage. */
  actionKey: StringKey;
  /** What that action does. The page owns the handlers. */
  action: "record-word" | "record-ayah" | "stop" | "continue";
  /** True while the microphone is open or the attempt is with the reviewer. */
  busy: "recording" | "checking" | null;
  /**
   * The ayah with the target marked, for the context line. Positions are
   * 1-based and index into `ayahWords` unchanged — no word is rewritten.
   */
  context: { words: readonly string[]; targetIndex: number };
};

/** Headline and detail per stage. No branching prose, no model text. */
const STAGE_COPY: Record<CorrectionStage, { headlineKey: StringKey; detailKey: StringKey; actionKey: StringKey; action: CorrectionLesson["action"] }> = {
  hear: { headlineKey: "lesson.hearHeadline", detailKey: "lesson.hearDetail", actionKey: "lesson.sayWord", action: "record-word" },
  "say-word": { headlineKey: "lesson.sayHeadline", detailKey: "lesson.sayDetail", actionKey: "lesson.sayWord", action: "record-word" },
  "recite-ayah": { headlineKey: "lesson.reciteHeadline", detailKey: "lesson.reciteDetail", actionKey: "lesson.reciteAyah", action: "record-ayah" },
  continue: { headlineKey: "lesson.continueHeadline", detailKey: "lesson.continueDetail", actionKey: "lesson.continue", action: "continue" },
};

/**
 * The detail line when a focused word attempt did not land.
 *
 * Deliberately separate from `lesson.sayDetail`: the first time the learner is
 * asked, there is nothing to report; the second time there is, and it should
 * not read as a scolding.
 */
const NOT_RECOGNISED_DETAIL: StringKey = "lesson.notRecognisedDetail";

/**
 * Builds the lesson, or returns null when there is no word to practise.
 *
 * The target always comes from the decision. There is no path here that
 * produces a word the decision did not name.
 */
export function deriveCorrectionLesson(input: CorrectionLessonInput): CorrectionLesson | null {
  const { action, session } = input;
  const named =
    action.kind === "repeat-word" && action.focusArabic && action.focusWordIndex !== null
      ? { wordIndex: action.focusWordIndex, arabic: action.focusArabic, observationKey: input.observationKey ?? "correction.notHeard" }
      : null;
  // A word held over from the last decision counts only while this attempt is
  // still about it: during the recording, during the check, and for the one
  // result that answers a focused word attempt — and only while the learner is
  // still on the ayah it was about.
  const stillHere = input.retainedTarget?.surah === input.surah && input.retainedTarget?.ayah === input.ayah;
  const carryable = input.isRecording || input.isChecking || input.lastAttemptScope === "word";
  const carried = stillHere && carryable ? input.retainedTarget ?? null : null;
  const target = named ?? carried;
  if (!target) return null;

  const targetWordIndex = session?.targetWordIndex ?? target.wordIndex;
  const targetArabic = session?.targetArabic ?? target.arabic;

  // Last line of defence, applied to every source of a target — the decision's,
  // the page's retained copy, and the service's own session alike. A word the
  // ayah on screen does not have at that position is not a correction anybody
  // can act on, so nothing is rendered and Study falls back to its ordinary
  // states. Failing closed here is what makes a stale target impossible to
  // show, rather than merely unlikely.
  if (!targetFitsAyah(targetWordIndex, targetArabic, input.ayahWords)) return null;
  const recognition = session?.recognition ?? recogniseTarget(input, targetWordIndex);
  const stage = session?.stage ?? deriveStage(input, recognition);

  const busy = input.isRecording ? "recording" as const : input.isChecking ? "checking" as const : null;
  const copy = STAGE_COPY[stage];
  // A focused attempt the app could not match keeps the learner on the same
  // word, and says so without implying they got it wrong.
  const detailKey = stage === "say-word" && recognition === "not-recognised" ? NOT_RECOGNISED_DETAIL : copy.detailKey;

  return {
    targetArabic,
    observationKey: target.observationKey,
    targetWordIndex,
    totalWords: input.ayahWords.length,
    stage,
    steps: buildSteps(stage),
    recognition,
    headlineKey: copy.headlineKey,
    detailKey,
    actionKey: busy === "recording" ? "lesson.stopRecording" : busy === "checking" ? "lesson.checking" : copy.actionKey,
    action: busy === "recording" ? "stop" : copy.action,
    busy,
    context: { words: input.ayahWords, targetIndex: targetWordIndex },
  };
}

/**
 * Whether a target still describes the ayah on screen.
 *
 * Two questions, both of which must hold: is there a word at that position at
 * all, and is the word there the one the correction is about?
 */
function targetFitsAyah(wordIndex: number, arabic: string, ayahWords: readonly string[]): boolean {
  if (!Number.isInteger(wordIndex) || wordIndex < 1 || wordIndex > ayahWords.length) return false;
  return sameQuranWord(ayahWords[wordIndex - 1], arabic);
}

/** Marks and joiners that distinguish two spellings of the same word. */
const COMPARISON_NOISE = /[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0640\u0670\u200C-\u200F\u202A-\u202E\u2066-\u2069]/g;

/**
 * Whether two spellings are the same Quranic word.
 *
 * The reviewer's `expectedArabic` and the ayah text on screen can differ in
 * harakat and in which alif is written — `اللَّهُ` against `ٱللَّهُ` is the same word
 * in the same place — and treating those as different words would hide a
 * correction that is perfectly valid.
 *
 * This compares; it never rewrites. Both arguments are thrown away and the
 * ayah is always rendered exactly as the content gives it. The rules mirror the
 * equivalences in `server/recitation.ts` — that module belongs to the server and
 * is deliberately not imported into the browser bundle — and any drift between
 * them can only change whether the lesson is *shown*, never what it says.
 */
function sameQuranWord(left: string, right: string): boolean {
  const fold = (word: string) =>
    word
      .normalize("NFKC")
      .replace(COMPARISON_NOISE, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .trim();
  const folded = fold(left);
  return folded.length > 0 && folded === fold(right);
}

/**
 * Whether the newest attempt heard the target word.
 *
 * Read from the attempt's own corrections list: the target is recognised when
 * the reviewer produced a word-by-word result and that result no longer names
 * it. Nothing about how the word *sounded* is claimed — this is only whether
 * the word was matched where it belongs.
 *
 * A focused word attempt is judged on the target alone. The other words of the
 * ayah will of course be missing from a recording of one word, and reading the
 * whole-ayah verdict there would answer a question the learner was not asked.
 */
function recogniseTarget(input: CorrectionLessonInput, targetWordIndex: number): TargetRecognition {
  if (input.lastAttemptScope === null) return "unknown";
  // An attempt in flight has no answer yet. Reading the previous one here would
  // tell a learner who is mid-recording that their word was not matched — about
  // a recording they have not finished making.
  if (input.isRecording || input.isChecking) return "unknown";
  if (!input.wordReviewAvailable || input.corrections === null) return "unknown";
  const stillNamed = input.corrections.some(
    (correction) => correction.wordIndex === targetWordIndex && correction.status !== "matched" && correction.status !== "extra",
  );
  return stillNamed ? "not-recognised" : "recognised";
}

/**
 * Which step the learner is on.
 *
 * Every branch reads the scope of the last attempt and the backend's answer
 * about the target. There is no counter and no timer: replaying the same two
 * inputs always produces the same stage.
 */
function deriveStage(input: CorrectionLessonInput, recognition: TargetRecognition): CorrectionStage {
  // Nothing recorded since the word came up: hear it first.
  if (input.lastAttemptScope === null) return "hear";

  if (input.lastAttemptScope === "word") {
    // The word went through. Put it back into the ayah.
    if (recognition === "recognised") return "recite-ayah";
    // Not matched, or nothing to go on. Same word, again.
    return "say-word";
  }

  // A whole-ayah attempt that still names this word sends the learner back to
  // the start of the lesson rather than straight to the microphone.
  return recognition === "recognised" ? "recite-ayah" : "hear";
}

function buildSteps(stage: CorrectionStage): CorrectionStep[] {
  const current = CORRECTION_STAGES.indexOf(stage);
  return CORRECTION_STAGES.map((entry, index) => ({
    stage: entry,
    labelKey: STAGE_LABEL_KEYS[entry],
    state: index < current ? "done" : index === current ? "current" : "upcoming",
  }));
}
