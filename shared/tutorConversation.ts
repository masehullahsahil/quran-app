/**
 * What the teacher is doing, what they just said, and what the learner can do
 * about it.
 *
 * The product this serves is a *lesson*, not a report. A teacher sitting with a
 * learner spends most of the time listening and says one short thing when they
 * speak — "You missed one word. Listen." — and the learner always knows whose
 * turn it is. So this module holds three things and nothing else:
 *
 *  1. the states a lesson can be in;
 *  2. for each, the single sentence the teacher says, as a locale key;
 *  3. for each, the two or three things the learner can do right now.
 *
 * **It decides nothing about the recitation.** Whether a word was heard, whether
 * an attempt may advance, what the target is — all of that is settled by the
 * correction engine and arrives here as a `TutorSessionView`. This module maps
 * a state to words and buttons. Nothing here reads a transcript, and nothing
 * here may ever claim that a pronunciation, a makhraj or a tajwid rule was
 * correct: "I heard the marked word" is a statement about hearing a word.
 *
 * It is deliberately a pure function of a small input so the tutor engine Codex
 * is building can drive it by supplying that input, with no other coupling.
 */
import type { StringKey } from "@locales/index";

/**
 * Where the lesson is.
 *
 * Ordered roughly as a lesson runs. `checking` is deliberately its own state
 * rather than a flag: the pause while the teacher listens back is a moment the
 * learner should see, and filling it with a result that has not arrived is how
 * an interface starts feeling like a dashboard.
 */
export const TUTOR_STATES = [
  /** The teacher is ready and the learner has not begun. */
  "ready",
  /** The microphone is open; the teacher is listening. */
  "listening",
  /** The teacher is checking what they heard. Brief, and no controls. */
  "checking",
  /** One word needs another attempt. */
  "correction",
  /** That word went through. */
  "word-recognised",
  /** Put the word back into the ayah. */
  "recite-ayah",
  /** The learner asked for help, or the teacher offered it. */
  "hint",
  /** The teacher could not tell. No claim is made about the recitation. */
  "uncertain",
  /** The learner stepped away. */
  "paused",
  /** The ayah is done. */
  "complete",
] as const;

export type TutorState = (typeof TUTOR_STATES)[number];

/**
 * The things a learner can ask for.
 *
 * Named as intents rather than as buttons because they are also what a spoken
 * command will resolve to once there is a voice channel — "again", "give me a
 * hint", "play the word". A recitation is never one of these: what the learner
 * recites is the lesson, not an instruction.
 */
export const TUTOR_INTENTS = [
  "start",
  "again",
  "repeat-word",
  "hear-word",
  "hear-ayah",
  "hint",
  "from-beginning",
  "continue",
  "pause",
  "resume",
  "stop",
] as const;

export type TutorIntent = (typeof TUTOR_INTENTS)[number];

/**
 * Who is doing something, and what.
 *
 * Presence is how the interface says "I am listening" without a face and
 * without pretending a person is connected. It is a state, communicated in
 * words and shape as well as motion, so it survives reduced motion and a
 * screen reader.
 */
export type TutorPresence = "listening" | "thinking" | "speaking" | "waiting";

export type TutorTurn = "teacher" | "learner";

export type TutorControl = {
  intent: TutorIntent;
  labelKey: StringKey;
  /** The one thing to do next. Exactly one control per state has this. */
  primary: boolean;
};

/** What the tutor engine tells this module. Nothing else is read. */
export type TutorSessionView = {
  state: TutorState;
  /** The word under correction, when the engine named one. */
  target?: { arabic: string; wordIndex: number; totalWords: number } | null;
  /** Whether a trusted recording of that word exists — see #51. Never synthesised. */
  canHearWord?: boolean;
  /** Whether the reciter's ayah can be played. */
  canHearAyah?: boolean;
  /** Whether the engine has a hint to give. */
  hintAvailable?: boolean;
  /** True once the learner has asked for the hint and it is on screen. */
  hintShown?: boolean;
};

export type TutorView = {
  state: TutorState;
  /** The one sentence the teacher says. Always exactly one. */
  messageKey: StringKey;
  /** Substitutions for that sentence — the target word, and nothing technical. */
  messageParams?: Record<string, string | number>;
  presence: TutorPresence;
  turn: TutorTurn;
  /** Two or three things, never ten. The first is primary. */
  controls: TutorControl[];
  /** The word to show large, when the lesson is about one. */
  target: TutorSessionView["target"];
  /**
   * Whether the target is still the problem.
   *
   * False the moment the engine reports it recognised, which is what stops the
   * screen from carrying "needs attention" under a sentence that has just said
   * the word came through.
   */
  targetUnresolved: boolean;
  /**
   * How the word should be shown.
   *
   * Three treatments, not two. "Not the problem any more" and "went through"
   * are different things: an attempt the teacher could not judge says nothing
   * about the word, so marking it with a success tick would claim a result
   * nobody reached. `neutral` is the word simply present, as context.
   */
  targetTone: "attention" | "resolved" | "neutral";
};

/** One short sentence per state. No branching prose, no model text. */
const MESSAGE_KEYS: Record<TutorState, StringKey> = {
  ready: "tutor.ready",
  listening: "tutor.listening",
  checking: "tutor.checking",
  correction: "tutor.wordMissed",
  "word-recognised": "tutor.wordRecognised",
  "recite-ayah": "tutor.reciteFullAyah",
  hint: "tutor.offerHint",
  uncertain: "tutor.uncertain",
  paused: "tutor.paused",
  complete: "tutor.finished",
};

const PRESENCE: Record<TutorState, TutorPresence> = {
  ready: "waiting",
  listening: "listening",
  checking: "thinking",
  correction: "speaking",
  "word-recognised": "speaking",
  "recite-ayah": "waiting",
  hint: "speaking",
  uncertain: "speaking",
  paused: "waiting",
  complete: "speaking",
};

/**
 * Whose turn it is.
 *
 * The teacher's turn is the short moment they speak; everything else is the
 * learner's, because a teacher who is not talking is listening. `checking` is
 * the teacher's — the learner has stopped and is waiting on them.
 */
const TURN: Record<TutorState, TutorTurn> = {
  ready: "learner",
  listening: "learner",
  checking: "teacher",
  correction: "teacher",
  "word-recognised": "teacher",
  "recite-ayah": "learner",
  hint: "teacher",
  uncertain: "teacher",
  paused: "learner",
  complete: "teacher",
};

/** The learner-facing name of each intent. Exported so nothing builds a key. */
export const TUTOR_INTENT_LABEL_KEYS: Record<TutorIntent, StringKey> = {
  start: "tutor.doStart",
  again: "tutor.doAgain",
  "repeat-word": "tutor.doRepeatWord",
  "hear-word": "tutor.doHearWord",
  "hear-ayah": "tutor.doHearAyah",
  hint: "tutor.doHint",
  "from-beginning": "tutor.doFromBeginning",
  continue: "tutor.doContinue",
  pause: "tutor.doPause",
  resume: "tutor.doResume",
  stop: "tutor.doStop",
};

/**
 * The two or three things offered in each state.
 *
 * The whole list of intents is never on screen. A learner reciting with the
 * phone propped in front of them can hold one obvious next action and a couple
 * of ways out; eleven buttons is a control panel, and a control panel is the
 * thing this design is moving away from.
 *
 * Order is meaningful: the first entry is the primary action.
 */
function controlsFor(view: TutorSessionView): TutorIntent[] {
  switch (view.state) {
    case "ready":
      return ["start"];
    // While the learner recites, the teacher is quiet. Only the ways out.
    case "listening":
      return ["pause", "from-beginning"];
    // Nothing to press while the teacher listens back.
    case "checking":
      return [];
    case "correction":
      return view.canHearWord ? ["hear-word", "again", "hear-ayah"] : ["again", "hear-ayah"];
    case "word-recognised":
    case "recite-ayah":
      return view.canHearAyah ? ["again", "hear-ayah"] : ["again"];
    case "hint":
      return view.canHearWord ? ["again", "hear-word"] : ["again", "hear-ayah"];
    case "uncertain":
      return view.canHearAyah ? ["again", "hear-ayah"] : ["again"];
    case "paused":
      return ["resume", "stop"];
    case "complete":
      return ["continue", "stop"];
    default:
      return [];
  }
}

/**
 * The offer of help.
 *
 * Added as a quiet third option rather than a state of its own, and only where
 * a learner is actually stuck — never while they are mid-recitation, where it
 * would read as the teacher interrupting.
 */
const HINT_STATES = new Set<TutorState>(["correction", "uncertain", "recite-ayah"]);

/** Three at a time, and the offer of help takes the last slot when it applies. */
const MAX_CONTROLS = 3;

export function describeTutorView(view: TutorSessionView): TutorView {
  const intents = controlsFor(view);
  if (view.hintAvailable && HINT_STATES.has(view.state) && !intents.includes("hint")) {
    // The primary action is never displaced. Where three things are already on
    // offer, the hint takes the place of the last of them rather than becoming
    // a fourth: a learner mid-lesson scanning four buttons is choosing, not
    // reciting.
    if (intents.length >= MAX_CONTROLS) intents.splice(MAX_CONTROLS - 1);
    intents.push("hint");
  }

  // The engine says the word came through; the message says so, and nothing on
  // screen may go on treating it as the outstanding problem.
  const targetUnresolved = view.state === "correction" || view.state === "hint";
  const targetTone: TutorView["targetTone"] = targetUnresolved
    ? "attention"
    : view.state === "word-recognised" || view.state === "recite-ayah" || view.state === "complete"
      ? "resolved"
      : "neutral";

  return {
    state: view.state,
    messageKey: view.hintShown && view.state === "hint" ? "tutor.hintGiven" : MESSAGE_KEYS[view.state],
    ...(view.target ? { messageParams: { word: view.target.arabic } } : {}),
    presence: PRESENCE[view.state],
    turn: TURN[view.state],
    controls: intents.map((intent, index) => ({ intent, labelKey: TUTOR_INTENT_LABEL_KEYS[intent], primary: index === 0 })),
    target: view.target ?? null,
    targetUnresolved,
    targetTone,
  };
}

/**
 * The phrases a learner will be able to say once there is a voice channel.
 *
 * Listed so the interface can show them honestly — "these are what the teacher
 * will understand" — rather than implying the app is already listening for
 * commands. Nothing in this repository is listening for them yet.
 */
export const TUTOR_VOICE_INTENTS: TutorIntent[] = [
  "again",
  "hear-word",
  "hear-ayah",
  "hint",
  "from-beginning",
  "continue",
  "pause",
  "stop",
];

/** Whether the app can currently hear spoken commands. It cannot. */
export const TUTOR_VOICE_STATUS = "not-listening" as const;
