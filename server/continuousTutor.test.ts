import { beforeEach, describe, expect, it } from "vitest";
import { createLiveTutorSession } from "@shared/liveTutor";
import {
  commitContinuousTutorInput,
  reserveContinuousTutorInput,
  resetContinuousTutorStreamsForTests,
  startContinuousTutorStream,
} from "./continuousTutor";

function tutor() {
  return createLiveTutorSession({
    sessionId: "tutor-live",
    mode: "guided-recitation",
    surah: 1,
    ayah: 2,
    totalAyahs: 7,
    learnerLanguage: "en",
  }).session;
}

function request(streamId: string, patch: Partial<Parameters<typeof reserveContinuousTutorInput>[0]> = {}) {
  return {
    streamId,
    tutorSessionId: "tutor-live",
    turnId: "turn-1",
    chunkId: "chunk-1",
    sequence: 1,
    turnComplete: false,
    audioHash: "audio-1",
    ...patch,
  };
}

beforeEach(resetContinuousTutorStreamsForTests);

describe("continuous Tutor stream ordering", () => {
  it("applies one unique input and acknowledges its sequence", () => {
    const session = tutor();
    const stream = startContinuousTutorStream(session);
    expect(reserveContinuousTutorInput(request(stream.streamId)).status).toBe("reserved");
    const committed = commitContinuousTutorInput({
      streamId: stream.streamId,
      turnId: "turn-1",
      chunkId: "chunk-1",
      sequence: 1,
      tutorSession: session,
      directive: "keep-listening",
    });
    expect(committed).toMatchObject({
      acknowledgement: { status: "applied", sequence: 1, appliedSequence: 1 },
      snapshot: { lastSequence: 1, tutorRevision: 0, phase: "listening" },
    });
  });

  it("deduplicates a chunk id and repeated partial audio", () => {
    const session = tutor();
    const stream = startContinuousTutorStream(session);
    reserveContinuousTutorInput(request(stream.streamId));
    commitContinuousTutorInput({
      streamId: stream.streamId,
      turnId: "turn-1",
      chunkId: "chunk-1",
      sequence: 1,
      tutorSession: session,
      directive: "keep-listening",
      replay: { nextChannel: "keep-listening", event: null },
    });

    const sameId = reserveContinuousTutorInput(request(stream.streamId, { sequence: 2, audioHash: "audio-2" }));
    const sameAudio = reserveContinuousTutorInput(request(stream.streamId, { sequence: 2, chunkId: "chunk-2" }));
    expect(sameId).toMatchObject({
      status: "duplicate",
      replay: { nextChannel: "keep-listening", event: null },
    });
    expect(sameAudio).toMatchObject({
      status: "duplicate",
      replay: { nextChannel: "keep-listening", event: null },
    });
  });

  it("deduplicates a completed turn without treating its earlier preview as the same input", () => {
    const session = tutor();
    const stream = startContinuousTutorStream(session);
    reserveContinuousTutorInput(request(stream.streamId));
    commitContinuousTutorInput({
      streamId: stream.streamId,
      turnId: "turn-1",
      chunkId: "chunk-1",
      sequence: 1,
      tutorSession: session,
      directive: "keep-listening",
    });

    const final = reserveContinuousTutorInput(request(stream.streamId, {
      sequence: 2,
      chunkId: "chunk-final",
      turnComplete: true,
    }));
    expect(final.status).toBe("reserved");
    commitContinuousTutorInput({
      streamId: stream.streamId,
      turnId: "turn-1",
      chunkId: "chunk-final",
      sequence: 2,
      tutorSession: session,
      directive: "keep-listening",
    });
    const duplicate = reserveContinuousTutorInput(request(stream.streamId, {
      sequence: 3,
      chunkId: "chunk-final-retry",
      turnComplete: true,
      audioHash: "another-hash",
    }));
    expect(duplicate.status).toBe("duplicate");
  });

  it("does not replay an obsolete outcome after newer input was committed", () => {
    const session = tutor();
    const stream = startContinuousTutorStream(session);
    reserveContinuousTutorInput(request(stream.streamId));
    commitContinuousTutorInput({
      streamId: stream.streamId,
      turnId: "turn-1",
      chunkId: "chunk-1",
      sequence: 1,
      tutorSession: session,
      directive: "keep-listening",
      replay: { marker: "first" },
    });
    reserveContinuousTutorInput(request(stream.streamId, {
      sequence: 2,
      chunkId: "chunk-2",
      audioHash: "audio-2",
    }));
    commitContinuousTutorInput({
      streamId: stream.streamId,
      turnId: "turn-1",
      chunkId: "chunk-2",
      sequence: 2,
      tutorSession: session,
      directive: "keep-listening",
      replay: { marker: "second" },
    });

    expect(reserveContinuousTutorInput(request(stream.streamId, {
      sequence: 3,
      audioHash: "retry-first",
    }))).toMatchObject({ status: "duplicate", replay: null });
  });

  it("rejects skipped and old sequences without rolling state backward", () => {
    const stream = startContinuousTutorStream(tutor());
    expect(reserveContinuousTutorInput(request(stream.streamId, { sequence: 2 })).status).toBe("out-of-order");
    expect(reserveContinuousTutorInput(request(stream.streamId)).status).toBe("reserved");
    expect(reserveContinuousTutorInput(request(stream.streamId, { sequence: 1, chunkId: "late", audioHash: "late" })).status).toBe("out-of-order");
  });

  it("allows only one in-flight input per stream", () => {
    const stream = startContinuousTutorStream(tutor());
    expect(reserveContinuousTutorInput(request(stream.streamId)).status).toBe("reserved");
    expect(reserveContinuousTutorInput(request(stream.streamId, {
      sequence: 2,
      chunkId: "chunk-2",
      audioHash: "audio-2",
    })).status).toBe("out-of-order");
  });

  it("fails closed when the process-local stream is lost", () => {
    const stream = startContinuousTutorStream(tutor());
    resetContinuousTutorStreamsForTests();
    expect(reserveContinuousTutorInput(request(stream.streamId))).toMatchObject({
      status: "lost-stream",
      snapshot: null,
      acknowledgement: { status: "lost-stream", appliedSequence: 0 },
    });
  });
});
