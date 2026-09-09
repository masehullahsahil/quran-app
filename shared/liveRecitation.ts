import type { RecitationAttemptScope } from "./wordCorrection";

export const LIVE_RECOGNITION_STATES = [
  "tentative",
  "stable-progress",
  "possible-skip",
  "confirmed-skip",
  "uncertain",
] as const;

export const LIVE_STREAM_PHASES = ["listening", "interrupted", "paused", "completed", "stopped"] as const;

export const LIVE_LISTENING_DIRECTIVES = [
  "keep-listening",
  "interrupt-learner",
  "play-target-word",
  "listen-for-target-word",
  "listen-for-full-ayah",
  "listen-next-ayah",
  "wait",
  "do-not-listen",
] as const;

export const LIVE_INPUT_ACKNOWLEDGEMENTS = [
  "applied",
  "duplicate",
  "stale",
  "out-of-order",
  "rejected",
  "lost-stream",
] as const;

export type LiveRecognitionState = (typeof LIVE_RECOGNITION_STATES)[number];
export type LiveStreamPhase = (typeof LIVE_STREAM_PHASES)[number];
export type LiveListeningDirective = (typeof LIVE_LISTENING_DIRECTIVES)[number];
export type LiveInputAcknowledgementStatus = (typeof LIVE_INPUT_ACKNOWLEDGEMENTS)[number];

export type LiveAudioTiming = {
  /** Client clock metadata for later latency analysis; never correctness evidence. */
  captureStartedAtMs: number;
  captureEndedAtMs: number;
  /** Server timestamps. Null until that stage occurred. */
  recognitionResultAtMs: number | null;
  omissionConfirmedAtMs: number | null;
  tutorActionAtMs: number | null;
};

export type LivePossibleSkip = {
  targetWordIndex: number;
  laterWordIndex: number;
  consecutiveObservations: number;
};

/** Transcript-free, structural Quran position evidence for one live ayah. */
export type LiveQuranTrackerState = {
  surah: number;
  ayah: number;
  lastSequence: number;
  expectedWordIndex: number;
  confirmedWordIndexes: number[];
  tentativeWordIndexes: number[];
  possibleSkip: LivePossibleSkip | null;
  emittedCorrectionWordIndexes: number[];
  recognitionState: LiveRecognitionState;
};

export type LiveRecitationStreamSnapshot = {
  streamId: string;
  tutorSessionId: string;
  tutorRevision: number;
  phase: LiveStreamPhase;
  lastSequence: number;
  tracker: LiveQuranTrackerState;
};

export type LiveWordOmittedEvent = {
  type: "word-omitted";
  surah: number;
  ayah: number;
  targetWordIndex: number;
  targetArabic: string;
  evidence: "finalized-later-word" | "repeated-stable-later-word";
  heardThroughWordIndex: number;
};

export type LiveInputAcknowledgement = {
  status: LiveInputAcknowledgementStatus;
  turnId: string;
  chunkId: string;
  sequence: number;
  appliedSequence: number;
};

export type LiveAudioTurnContract = {
  streamId: string;
  turnId: string;
  chunkId: string;
  sequence: number;
  attemptScope: RecitationAttemptScope;
  stability: "interim" | "final";
  /** True only when VAD/capture has closed this utterance for full evaluation. */
  turnComplete: boolean;
  captureStartedAtMs: number;
  captureEndedAtMs: number;
};
