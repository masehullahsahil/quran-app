import { randomUUID } from "node:crypto";
import type {
  LiveAudioTiming,
  LiveInputAcknowledgement,
  LiveListeningDirective,
  LiveQuranTrackerState,
  LiveRecitationStreamSnapshot,
  LiveStreamPhase,
  LiveWordOmittedEvent,
} from "@shared/liveRecitation";
import type { LiveTutorSession } from "@shared/liveTutor";
import { createLiveQuranTracker } from "./liveRecitationTracker";

type ProcessedInput = {
  key: string;
  audioHash: string;
  sequence: number;
};

type PendingInput = {
  key: string;
  audioHash: string;
  sequence: number;
};

type LiveStreamRecord = {
  snapshot: LiveRecitationStreamSnapshot;
  processed: ProcessedInput[];
  pending: PendingInput | null;
};

export type LiveStreamReservation =
  | { status: "reserved"; snapshot: LiveRecitationStreamSnapshot }
  | {
      status: "duplicate" | "out-of-order" | "rejected" | "lost-stream";
      acknowledgement: LiveInputAcknowledgement;
      snapshot: LiveRecitationStreamSnapshot | null;
    };

const LIVE_STREAM_STORE = Symbol.for("quran-app.continuous-tutor-streams");
const globalStore = globalThis as typeof globalThis & { [LIVE_STREAM_STORE]?: Map<string, LiveStreamRecord> };
globalStore[LIVE_STREAM_STORE] ??= new Map<string, LiveStreamRecord>();
const streams = globalStore[LIVE_STREAM_STORE];
const MAX_STREAMS = 500;
const MAX_PROCESSED_INPUTS = 64;

function copySnapshot(snapshot: LiveRecitationStreamSnapshot): LiveRecitationStreamSnapshot {
  return {
    ...snapshot,
    tracker: {
      ...snapshot.tracker,
      confirmedWordIndexes: [...snapshot.tracker.confirmedWordIndexes],
      tentativeWordIndexes: [...snapshot.tracker.tentativeWordIndexes],
      possibleSkip: snapshot.tracker.possibleSkip ? { ...snapshot.tracker.possibleSkip } : null,
      emittedCorrectionWordIndexes: [...snapshot.tracker.emittedCorrectionWordIndexes],
    },
  };
}

function save(record: LiveStreamRecord) {
  streams.delete(record.snapshot.streamId);
  streams.set(record.snapshot.streamId, record);
  if (streams.size <= MAX_STREAMS) return;
  const oldest = streams.keys().next().value;
  if (oldest) streams.delete(oldest);
}

function acknowledgement(
  status: LiveInputAcknowledgement["status"],
  input: { turnId: string; chunkId: string; sequence: number },
  appliedSequence: number,
): LiveInputAcknowledgement {
  return { status, ...input, appliedSequence };
}

export function startContinuousTutorStream(session: LiveTutorSession): LiveRecitationStreamSnapshot {
  const tracker = createLiveQuranTracker(session.surah, session.ayah);
  tracker.expectedWordIndex = session.expectedWordIndex;
  const snapshot: LiveRecitationStreamSnapshot = {
    streamId: randomUUID(),
    tutorSessionId: session.sessionId,
    tutorRevision: session.revision,
    phase: session.phase === "paused"
      ? "paused"
      : session.phase === "completed"
        ? "completed"
        : session.phase === "stopped"
          ? "stopped"
          : session.phase === "correcting-word"
            ? "interrupted"
            : "listening",
    lastSequence: 0,
    tracker,
  };
  save({ snapshot, processed: [], pending: null });
  return copySnapshot(snapshot);
}

function inputKey(input: { turnId: string; chunkId: string; turnComplete: boolean }): string {
  return input.turnComplete ? `turn:${input.turnId}` : `chunk:${input.chunkId}`;
}

export function reserveContinuousTutorInput(input: {
  streamId: string;
  tutorSessionId: string;
  turnId: string;
  chunkId: string;
  sequence: number;
  turnComplete: boolean;
  audioHash: string;
}): LiveStreamReservation {
  const record = streams.get(input.streamId);
  if (!record) {
    return {
      status: "lost-stream",
      acknowledgement: acknowledgement("lost-stream", input, 0),
      snapshot: null,
    };
  }
  const key = inputKey(input);
  const keyPrefix = input.turnComplete ? "turn:" : "chunk:";
  if (record.snapshot.tutorSessionId !== input.tutorSessionId) {
    return {
      status: "rejected",
      acknowledgement: acknowledgement("rejected", input, record.snapshot.lastSequence),
      snapshot: copySnapshot(record.snapshot),
    };
  }

  const duplicate = record.processed.some((item) => (
    item.key === key || item.key.startsWith(keyPrefix) && item.audioHash === input.audioHash
  )) || record.pending?.key === key || Boolean(
    record.pending?.key.startsWith(keyPrefix) && record.pending.audioHash === input.audioHash,
  );
  if (duplicate) {
    return {
      status: "duplicate",
      acknowledgement: acknowledgement("duplicate", input, record.snapshot.lastSequence),
      snapshot: copySnapshot(record.snapshot),
    };
  }

  if (record.pending || input.sequence !== record.snapshot.lastSequence + 1) {
    return {
      status: "out-of-order",
      acknowledgement: acknowledgement("out-of-order", input, record.snapshot.lastSequence),
      snapshot: copySnapshot(record.snapshot),
    };
  }

  record.pending = { key, audioHash: input.audioHash, sequence: input.sequence };
  save(record);
  return { status: "reserved", snapshot: copySnapshot(record.snapshot) };
}

export function abortContinuousTutorInput(streamId: string, sequence: number) {
  const record = streams.get(streamId);
  if (!record || record.pending?.sequence !== sequence) return;
  record.pending = null;
  save(record);
}

function phaseForDirective(directive: LiveListeningDirective, tutorPhase: LiveTutorSession["phase"]): LiveStreamPhase {
  if (tutorPhase === "paused") return "paused";
  if (tutorPhase === "completed") return "completed";
  if (tutorPhase === "stopped") return "stopped";
  if (directive === "interrupt-learner" || directive === "play-target-word") return "interrupted";
  return "listening";
}

export function commitContinuousTutorInput(input: {
  streamId: string;
  turnId: string;
  chunkId: string;
  sequence: number;
  tutorSession: LiveTutorSession;
  directive: LiveListeningDirective;
  tracker?: LiveQuranTrackerState;
}): { snapshot: LiveRecitationStreamSnapshot; acknowledgement: LiveInputAcknowledgement } | null {
  const record = streams.get(input.streamId);
  if (!record || record.pending?.sequence !== input.sequence) return null;

  let tracker = input.tracker ?? record.snapshot.tracker;
  if (tracker.surah !== input.tutorSession.surah || tracker.ayah !== input.tutorSession.ayah) {
    tracker = createLiveQuranTracker(input.tutorSession.surah, input.tutorSession.ayah);
  }
  tracker = { ...tracker, lastSequence: input.sequence };
  record.snapshot = {
    ...record.snapshot,
    tutorRevision: input.tutorSession.revision,
    phase: phaseForDirective(input.directive, input.tutorSession.phase),
    lastSequence: input.sequence,
    tracker,
  };
  record.processed = [
    ...record.processed.slice(-(MAX_PROCESSED_INPUTS - 1)),
    {
      key: record.pending.key,
      audioHash: record.pending.audioHash,
      sequence: input.sequence,
    },
  ];
  record.pending = null;
  save(record);
  return {
    snapshot: copySnapshot(record.snapshot),
    acknowledgement: acknowledgement("applied", input, input.sequence),
  };
}

export function liveTiming(input: {
  captureStartedAtMs: number;
  captureEndedAtMs: number;
  recognitionResultAtMs?: number | null;
  omission?: LiveWordOmittedEvent | null;
  tutorActionAtMs?: number | null;
}): LiveAudioTiming {
  return {
    captureStartedAtMs: input.captureStartedAtMs,
    captureEndedAtMs: input.captureEndedAtMs,
    recognitionResultAtMs: input.recognitionResultAtMs ?? null,
    omissionConfirmedAtMs: input.omission ? input.recognitionResultAtMs ?? Date.now() : null,
    tutorActionAtMs: input.tutorActionAtMs ?? null,
  };
}

export function resetContinuousTutorStreamsForTests() {
  streams.clear();
}
