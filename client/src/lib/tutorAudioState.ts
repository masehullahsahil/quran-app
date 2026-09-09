/**
 * Who is making sound, and whether the microphone may be collecting.
 *
 * The hands-free lesson has exactly one microphone and three things that want
 * to use the room: the learner reciting, the teacher speaking a coaching
 * sentence, and the trusted Qari recording. Without an explicit model of that,
 * the failure is not subtle — the app plays `رَبِّ` through the speaker, the
 * open microphone records it, and the server is asked to judge the learner on a
 * recording of the app. That is a wrong answer produced by an audio bug, and it
 * is the single most damaging thing this feature could do.
 *
 * So the channel is a state, not a flag, and capture is a *derived* property of
 * it. `canCapture` is the only place that decides whether learner audio may be
 * collected, and it is false in every state where the app itself is audible.
 *
 * Nothing here judges a recitation. These are states about audio devices.
 */
import type { StringKey } from "@locales/index";

export const TUTOR_AUDIO_STATES = [
  /** No session. The microphone is not open and nothing is playing. */
  "idle",
  /** The microphone is open and the teacher is waiting for the learner. */
  "learner-listening",
  /** The microphone is open and the learner is audibly reciting. */
  "learner-speaking",
  /** A finalised segment is with the server. */
  "checking",
  /** The teacher is speaking a coaching sentence. Not the Quran. */
  "app-speaking",
  /** A trusted recording is playing: one word, or the ayah. */
  "qari-playing",
  /** Between steps — playback finished, capture not armed yet. */
  "waiting",
  /** The learner stepped away. The place in the lesson is kept. */
  "paused",
  /** No microphone: refused, absent, or unsupported. Manual Study instead. */
  "microphone-unavailable",
  /** The server no longer has the lesson. Nothing advances. */
  "session-lost",
] as const;

export type TutorAudioState = (typeof TUTOR_AUDIO_STATES)[number];

/**
 * Whether learner audio may be collected in this state.
 *
 * The three "no" cases that matter are `app-speaking`, `qari-playing` and
 * `checking`: the first two are the app being audible, and the third is an
 * attempt already in flight, which is what stops one turn being submitted
 * twice. Everything else is either the learner's turn or not a session.
 */
export function canCapture(state: TutorAudioState): boolean {
  return state === "learner-listening" || state === "learner-speaking";
}

/** Whether the app itself is making sound right now. */
export function isAppAudible(state: TutorAudioState): boolean {
  return state === "app-speaking" || state === "qari-playing";
}

/** Whether the lesson can still go forward from here without the learner. */
export function isRecoverable(state: TutorAudioState): boolean {
  return state !== "microphone-unavailable" && state !== "session-lost";
}

/**
 * The sentence shown for each state.
 *
 * Every live audio state has text. Not a colour, not a pulsing ring, not an
 * animation: text, announced politely, so the state survives reduced motion,
 * a screen reader, and a learner glancing at a propped-up phone from arm's
 * length. This map is exhaustive by type, so a state added without a sentence
 * does not compile.
 */
export const TUTOR_AUDIO_STATE_KEYS: Record<TutorAudioState, StringKey> = {
  idle: "handsfree.stateIdle",
  "learner-listening": "handsfree.stateListening",
  "learner-speaking": "handsfree.stateSpeaking",
  checking: "handsfree.stateChecking",
  "app-speaking": "handsfree.stateTeacher",
  "qari-playing": "handsfree.stateReciter",
  waiting: "handsfree.stateWaiting",
  paused: "handsfree.statePaused",
  "microphone-unavailable": "handsfree.stateMicUnavailable",
  "session-lost": "handsfree.stateReconnect",
};

/**
 * Why the microphone is not available.
 *
 * Kept apart from the state because the state is what the learner sees and this
 * is what decides the fallback. All four end in the same place — manual Study,
 * which works — and the lesson never claims to be hands-free after any of them.
 */
export type MicrophoneFailure =
  | "permission-denied"
  | "no-device"
  | "recorder-unsupported"
  | "analysis-unsupported";

export const MICROPHONE_FAILURE_KEYS: Record<MicrophoneFailure, StringKey> = {
  "permission-denied": "handsfree.micDenied",
  "no-device": "handsfree.micMissing",
  "recorder-unsupported": "handsfree.micUnsupported",
  "analysis-unsupported": "handsfree.vadUnsupported",
};
