import { describe, expect, it } from "vitest";
import type { LiveRecitationStreamSnapshot } from "@shared/liveRecitation";
import {
  collectDeviceMetadata,
  createClientValidationLog,
  isValidationMode,
} from "./validationCapture";

describe("collectDeviceMetadata", () => {
  it("never throws and degrades gracefully without browser APIs", () => {
    const metadata = collectDeviceMetadata("en");
    expect(metadata.collectedAt).not.toBe("");
    expect(metadata.interfaceLanguage).toBe("en");
    // In the node test env there is no navigator/screen.
    expect(metadata.browserName).toBeNull();
    expect(metadata.connection).toBeNull();
    expect(metadata.validationMode).toBe(false);
  });

  it("reports validation mode as false outside a validation context", () => {
    expect(isValidationMode()).toBe(false);
  });
});

describe("createClientValidationLog", () => {
  const snapshot: LiveRecitationStreamSnapshot = {
    streamId: "stream-1",
    tutorSessionId: "tutor-1",
    tutorRevision: 3,
    phase: "listening",
    lastSequence: 12,
    tracker: {
      surah: 1,
      ayah: 2,
      lastSequence: 12,
      expectedWordIndex: 3,
      confirmedWordIndexes: [0, 1, 2],
      tentativeWordIndexes: [],
      possibleSkip: null,
      emittedCorrectionWordIndexes: [],
      recognitionState: "transcribed",
    },
  };

  it("records a position checkpoint copied verbatim from the server snapshot", () => {
    const log = createClientValidationLog({ runId: "run_test", correlationId: "corr-1" });
    const event = log.recordPositionCheckpoint(snapshot, { attemptId: "att_1" });
    expect(event).not.toBeNull();
    expect(event?.type).toBe("position.checkpoint");
    expect(event?.details).toMatchObject({
      surah: 1,
      ayah: 2,
      wordIndex: 3,
      source: "server-response",
    });
    expect(event?.correlationId).toBe("corr-1");
    expect(event?.attemptId).toBe("att_1");
  });

  it("returns null for a missing snapshot", () => {
    const log = createClientValidationLog({ runId: "run_test" });
    expect(log.recordPositionCheckpoint(null)).toBeNull();
    expect(log.events).toHaveLength(0);
  });

  it("records playback and mic-reopen events with sequencing", () => {
    const log = createClientValidationLog({ runId: "run_test" });
    log.recordDeviceMetadata(collectDeviceMetadata("ur"));
    log.recordPlaybackStarted("qari");
    log.recordPlaybackEnded("qari");
    log.recordMicReopened("word");
    const types = log.events.map((event) => event.type);
    expect(types).toEqual(["device.metadata", "playback.started", "playback.ended", "mic.reopened"]);
    expect(log.events.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
    expect(log.toJSON().runId).toBe("run_test");
    expect(log.toJSON().eventCount).toBe(4);
  });

  it("records mic reopen timing after playback", () => {
    const log = createClientValidationLog({ runId: "run_test" });
    const event = log.recordMicReopened("ayah", { attemptId: "att_1" }, { msSincePlaybackEnd: 412 });
    expect(event.type).toBe("mic.reopened");
    expect(event.details).toMatchObject({ scope: "ayah", msSincePlaybackEnd: 412 });
    expect(event.attemptId).toBe("att_1");
  });
});

describe("pipeline instrumentation", () => {
  it("carries tts.step, vad, capture, and interim events on the client.event channel", () => {
    const log = createClientValidationLog({ runId: "run_test" });
    log.recordInstrumentation("tts.step", {
      key: "handsfree.nowYouSayIt",
      spoken: true,
      resolvedBy: "silent-immediate",
      audibleMs: 403,
    });
    log.recordInstrumentation("vad.turnOpened", { noiseFloor: 0.002, enterThreshold: 0.0158 });
    log.recordInstrumentation("vad.turnEnded", {
      reason: "silence",
      voicedMs: 2100,
      silenceMs: 1850,
      noiseFloor: 0.004,
    });
    log.recordInstrumentation("capture.turnSettled", { blobBytes: 18432, chunkCount: 3, reason: "turn-ended" });
    log.recordInstrumentation("interim.abandoned", { attempts: 3 });

    const events = log.events;
    expect(events.map((event) => event.type)).toEqual([
      "client.event",
      "client.event",
      "client.event",
      "client.event",
      "client.event",
    ]);
    expect(events[0]?.details).toMatchObject({ kind: "tts.step", resolvedBy: "silent-immediate" });
    expect(events[1]?.details).toMatchObject({ kind: "vad.turnOpened", noiseFloor: 0.002 });
    expect(events[2]?.details).toMatchObject({ kind: "vad.turnEnded", reason: "silence", voicedMs: 2100 });
    expect(events[3]?.details).toMatchObject({ kind: "capture.turnSettled", blobBytes: 18432, chunkCount: 3 });
    expect(events[4]?.details).toMatchObject({ kind: "interim.abandoned", attempts: 3 });
  });

  it("keeps instrumentation numeric: no audio, no transcripts, no PII in the helpers' contract", () => {
    // The helpers take plain detail objects; the ledger's sanitizer is what
    // enforces the denylist. This pins the intended shape: counts and timings.
    const log = createClientValidationLog({ runId: "run_test" });
    const event = log.recordInstrumentation("capture.turnSettled", { blobBytes: 100, chunkCount: 1, reason: "x" });
    expect(Object.keys(event.details).sort()).toEqual(["blobBytes", "chunkCount", "kind", "reason"]);
  });
});
