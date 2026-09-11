/**
 * Turning the tutor engine's turn into something the panel can render.
 *
 * `shared/liveTutor.ts` decides the lesson: which phase it is in, what the
 * teacher should do next, whether the learner may move on. This maps that
 * decision onto the `TutorSessionView` the panel already speaks
 * (`shared/tutorConversation.ts`), and does nothing else.
 *
 * **It infers nothing about the recitation.** It never reads a transcript, a
 * score or an alignment. Whether a word was missed, whether it was heard,
 * whether the ayah passed and whether the learner advances are all settled
 * server-side and arrive as a phase and an action kind. This file is a
 * translation between two vocabularies, and if the engine's phase is one it
 * does not recognise it falls back to waiting rather than guessing.
 *
 * The one place the two vocabularies genuinely differ is around a recognised
 * word. The engine has a single `recite-ayah` phase covering "I heard the word"
 * and "now give me the ayah"; the conversation layer separates them, because a
 * teacher says the first thing once and then asks. The action kind is what
 * tells them apart — see `stateFor`.
 */
import type { LiveTutorSession, TutorAction } from "@shared/liveTutor";
import type { TutorSessionView } from "@shared/tutorConversation";

export type LiveTutorViewInput = {
  session: LiveTutorSession;
  action: TutorAction;
  /** Whether a trusted recording of the target word exists — #51 decides this. */
  canHearWord: boolean;
  /** Whether the selected reciter has this ayah. */
  canHearAyah: boolean;
  /** True while the microphone is open. */
  isRecording: boolean;
  /** True while an attempt is with the reviewer. */
  isChecking: boolean;
  /**
   * The surah and ayah actually on screen.
   *
   * Compared against the session's own position, because the two can disagree
   * for a moment: the tutor advances, and the page follows on the next commit.
   * A correction rendered across that gap is the #50 bug — the previous ayah's
   * word, counted against this ayah's words. So a view whose position does not
   * match the screen shows no target at all.
   */
  displayedSurah: number;
  displayedAyah: number;
};

/** Whether the lesson and the screen are looking at the same ayah. */
function onScreen(input: LiveTutorViewInput): boolean {
  return input.session.surah === input.displayedSurah && input.session.ayah === input.displayedAyah;
}

/**
 * The lesson state the learner is shown.
 *
 * Read in this order, and each rule is about *evidence the engine supplied*,
 * never about anything derived here:
 *
 *  1. the microphone and the reviewer outrank everything — nothing else is
 *     settled while an attempt is in flight;
 *  2. paused, stopped and completed are the engine's own terminal phases;
 *  3. `correcting-word` is a target the engine still holds open;
 *  4. `recite-ayah` splits on the action kind: the turn that *announces* the
 *     recognition reads as "I heard it", and every turn after it asks for the
 *     ayah;
 *  5. `waiting` after uncertain evidence is the abstention, not a fault.
 */
function stateFor(input: LiveTutorViewInput): TutorSessionView["state"] {
  const { session, action } = input;

  if (input.isRecording) return "listening";
  if (input.isChecking) return "checking";

  switch (session.phase) {
    case "ready":
      return "ready";
    case "listening":
      return "listening";
    case "paused":
      return "paused";
    // The engine keeps "stopped" and "completed" as distinct phases: a lesson
    // the learner ended is not a lesson that was completed, and the panel must
    // not congratulate it.
    case "completed":
      return "complete";
    case "stopped":
      return "stopped";
    case "correcting-word":
      // Only where the screen is showing the ayah the lesson is on. A word
      // being taught somewhere else is not a correction *here*, so the teacher
      // goes quiet rather than saying something about the wrong ayah.
      if (!onScreen(input)) return "listening";
      // The engine offers help by choosing an offer-hint or show-hint action;
      // the learner being stuck is its judgement, not this file's.
      return action.kind === "offer-hint" || action.kind === "show-hint" ? "hint" : "correction";
    case "recite-ayah":
      if (!onScreen(input)) return "listening";
      // "target-recognised" is the turn that says so. Anything after it is the
      // teacher waiting for the ayah, which is a different sentence.
      return action.reason === "target-recognised" ? "word-recognised" : "recite-ayah";
    case "waiting":
      return action.reason === "recitation-uncertain" || action.evidence === "uncertain" ? "uncertain" : "listening";
    default:
      // An unrecognised phase is not an excuse to invent a lesson state.
      return "listening";
  }
}

/**
 * The word the lesson is about.
 *
 * Only ever the engine's own target, and only where the engine still holds one.
 * `totalWords` comes from the ayah on screen because the engine addresses words
 * by position and the page is the thing that knows how many there are; a target
 * the ayah cannot support is dropped rather than rendered against it — the same
 * rule the focused lesson gained in #50.
 */
function targetFor(input: LiveTutorViewInput, ayahWordCount: number): TutorSessionView["target"] {
  const correction = input.session.activeCorrection;
  if (!correction) return null;
  // Three ways this can be the wrong word, and all three hide it: the engine
  // holds a target from another ayah, the lesson is not on the ayah the learner
  // is looking at, or the position is one this ayah has no room for.
  if (correction.surah !== input.session.surah || correction.ayah !== input.session.ayah) return null;
  if (!onScreen(input)) return null;
  const { targetWordIndex, targetArabic } = correction;
  if (!Number.isInteger(targetWordIndex) || targetWordIndex < 1 || targetWordIndex > ayahWordCount) return null;
  if (!targetArabic) return null;
  return { arabic: targetArabic, wordIndex: targetWordIndex, totalWords: ayahWordCount };
}

/**
 * @param ayahWordCount how many words the ayah on screen has, from the Quran
 * data the page already renders.
 */
export function liveTutorSessionView(input: LiveTutorViewInput, ayahWordCount: number): TutorSessionView {
  const state = stateFor(input);
  return {
    state,
    target: targetFor(input, ayahWordCount),
    canHearWord: input.canHearWord,
    canHearAyah: input.canHearAyah,
    // The engine decides that help is worth offering; the panel only shows it.
    hintAvailable: input.action.hint !== null || input.action.kind === "offer-hint",
    hintShown: input.action.kind === "show-hint",
    // The recorder's state, not the engine's phase: it decides whether the
    // learner is offered a way to end their turn.
    micOpen: input.isRecording,
  };
}

/**
 * Which recording an attempt is.
 *
 * The distinction #53 introduced is load-bearing: a recording of one word run
 * through the whole-ayah reviewer answers a question the learner was not asked.
 * The engine says which it is asking for, and this reads that and nothing else
 * — never the interface's guess about what the learner probably meant.
 */
export function attemptScopeFor(session: LiveTutorSession, _action?: TutorAction): "word" | "ayah" {
  // The phase is the engine's own statement of what it is working on, and it
  // holds across the whole of a correction — through "listen to it" and "now
  // say it" alike. Reading only the current action kind would send a word
  // attempt as an ayah attempt on every turn but one.
  // `recite-ayah` is the other half of a correction and still carries the
  // target, but the thing being asked for there is the whole ayah — so it is an
  // ayah attempt, exactly like ordinary listening. Only `correcting-word` is a
  // word attempt (#53), and the trusted route rejects a word attempt that has
  // no target behind it.
  if (session.phase === "correcting-word") return "word";
  return "ayah";
}
