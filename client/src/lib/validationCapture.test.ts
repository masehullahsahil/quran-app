import { describe, expect, it } from "vitest";
import type { LiveRecitationStreamSnapshot } from "@shared/liveRecitation";
import {
  attemptCorrelationId,
  attemptErrorCode,
  collectDeviceMetadata,
  createClientValidationLog,
  createFinalAttemptTrace,
  emitAttemptTrace,
  isValidationMode,
  sanitizeAttemptTraceDetails,
  type AttemptTraceInput,
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

describe("attempt lifecycle tracing", () => {
  const RUN = "run_0123456789abcdef01234567";
  const AUDIO_BASE64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEA";

  /** A fake clock: each call advances 250ms. */
  function clock(start = 10_000) {
    let t = start;
    return () => (t += 250);
  }

  function traced() {
    const log = createClientValidationLog({ runId: RUN });
    const sink = (input: AttemptTraceInput) => {
      log.recordAttemptLifecycle(input);
    };
    return { log, sink };
  }

  it("traces a normal final ayah submission from capture to the acoustic status", () => {
    const { log, sink } = traced();
    sink({ stage: "capture.started", path: "final", attemptId: "turn-1", correlationId: null, details: { scope: "ayah" } });
    sink({
      stage: "capture.finalized",
      path: "final",
      attemptId: "turn-1",
      correlationId: null,
      details: { scope: "ayah", endReason: "silence", durationMs: 4200 },
    });
    const trace = createFinalAttemptTrace(sink, { attemptId: "turn-1", scope: "ayah" }, clock());
    trace.eligible({ size: 48_000, type: "audio/webm;codecs=opus" });
    trace.started("tutor");
    trace.responded("tutor", {
      recitation: { quranAwareReview: { status: "available" }, reviewStatus: "ready" },
      tutor: { status: "updated" },
    });

    const lifecycle = log.events.filter((event) => event.type === "attempt.lifecycle");
    expect(lifecycle.map((event) => event.details["stage"])).toEqual([
      "capture.started",
      "capture.finalized",
      "submission.eligible",
      "submission.started",
      "submission.responded",
    ]);
    expect(lifecycle.every((event) => event.attemptId === "turn-1" && event.runId === RUN)).toBe(true);
    // The client turn id never masquerades as the server's correlation id.
    expect(lifecycle.every((event) => event.correlationId === null)).toBe(true);
    expect(lifecycle[2]?.details).toMatchObject({ bytes: 48_000, mimeType: "audio/webm", acousticEligible: true });
    expect(lifecycle[3]?.details).toMatchObject({ route: "tutor", acousticEligible: true });
    expect(lifecycle[4]?.details).toMatchObject({
      route: "tutor",
      elapsedMs: 250,
      recitationReturned: true,
      tutorStatus: "updated",
      acousticStatus: "available",
      reviewStatus: "ready",
    });

    const summary = log.attemptLifecycleSummary();
    expect(summary.attempts).toEqual([
      expect.objectContaining({
        attemptId: "turn-1",
        path: "final",
        outcome: "responded",
        skipReason: null,
        acousticEligible: true,
        acousticStatus: "available",
      }),
    ]);
    expect(summary.stageCounts.final["submission.responded"]).toBe(1);
    expect(summary.acousticStatuses).toEqual({ available: 1 });
  });

  it("records a skipped attempt with no audio and never reaches submission", () => {
    const { log, sink } = traced();
    const trace = createFinalAttemptTrace(sink, { attemptId: "turn-2", scope: "ayah" }, clock());
    trace.skipped("no-audio", { bytes: 0 });
    // A capture the server interrupted produces no submission either.
    sink({
      stage: "submission.skipped",
      path: "final",
      attemptId: "turn-3",
      correlationId: null,
      details: { scope: "ayah", skipReason: "capture-interrupted" },
    });

    const summary = log.attemptLifecycleSummary();
    expect(summary.attempts.map((attempt) => [attempt.attemptId, attempt.outcome, attempt.skipReason])).toEqual([
      ["turn-2", "skipped", "no-audio"],
      ["turn-3", "skipped", "capture-interrupted"],
    ]);
    expect(summary.stageCounts.final["submission.started"]).toBe(0);
    expect(summary.skipReasons.final).toEqual({ "no-audio": 1, "capture-interrupted": 1 });
  });

  it("records a network failure by error code, never by message", () => {
    const { log, sink } = traced();
    const trace = createFinalAttemptTrace(sink, { attemptId: "turn-4", scope: "ayah" }, clock());
    trace.eligible({ size: 1024, type: "audio/webm" });
    trace.started("tutor");
    const error = Object.assign(new TypeError(`Failed to fetch https://x.test/?key=sk-secret ${AUDIO_BASE64}`), {});
    trace.failed(error);

    const failed = log.events.find((event) => event.details["stage"] === "submission.failed");
    expect(failed?.details).toMatchObject({ errorCode: "TypeError", willRetry: false, elapsedMs: 250 });
    const serialized = JSON.stringify(log.toJSON());
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("Failed to fetch");
    expect(serialized).not.toContain(AUDIO_BASE64);
    expect(log.attemptLifecycleSummary().attempts[0]).toMatchObject({ outcome: "failed" });
  });

  it("does not trace a page error after the answer as a failed submission", () => {
    const { log, sink } = traced();
    const trace = createFinalAttemptTrace(sink, { attemptId: "turn-5", scope: "word" }, clock());
    trace.started("study");
    trace.responded("study", { recitation: null });
    trace.failed(new Error("render failure"));
    expect(log.attemptLifecycleSummary().attempts[0]).toMatchObject({
      outcome: "responded",
      acousticEligible: false,
      acousticStatus: null,
    });
  });

  it("traces an encoding failure before sending as encode-failed", () => {
    const { log, sink } = traced();
    const trace = createFinalAttemptTrace(sink, { attemptId: "turn-6", scope: "ayah" });
    trace.eligible({ size: 10, type: "audio/webm" });
    trace.failed(new Error("The recording could not be read."));
    expect(log.attemptLifecycleSummary().attempts[0]).toMatchObject({ outcome: "skipped", skipReason: "encode-failed" });
  });

  it("drops audio, transcripts, messages, and secrets from trace details", () => {
    const details = sanitizeAttemptTraceDetails({
      audioBase64: AUDIO_BASE64,
      transcript: "بسم الله الرحمن الرحيم",
      message: "provider said something",
      apiKey: "sk-live-123",
      errorCode: "has spaces so not a token",
      tutorStatus: "updated",
      bytes: 12.4,
      durationMs: Number.NaN,
      willRetry: "yes",
      scope: "surah",
      route: "tutor",
    });
    expect(details).toEqual({ tutorStatus: "updated", bytes: 12, route: "tutor" });
  });

  it("reads the tRPC code before the class name and never the message", () => {
    expect(attemptErrorCode({ data: { code: "BAD_GATEWAY" }, message: "secret" })).toBe("BAD_GATEWAY");
    expect(attemptErrorCode(new TypeError("network down"))).toBe("TypeError");
    expect(attemptErrorCode(null)).toBe("unknown");
  });

  it("accepts only a safe genuine server correlation ID", () => {
    expect(attemptCorrelationId({ validationCorrelationId: "req_server-123" })).toBe("req_server-123");
    expect(attemptCorrelationId({ data: { correlationId: "req_error-456" } })).toBe("req_error-456");
    expect(attemptCorrelationId({ validationCorrelationId: "contains spaces" })).toBeNull();
    expect(attemptCorrelationId({ data: { correlationId: "line\nbreak" } })).toBeNull();
    expect(attemptCorrelationId(null)).toBeNull();
  });

  it("is a no-op without a sink and swallows a throwing sink", () => {
    const input: AttemptTraceInput = { stage: "capture.started", path: "final", attemptId: "t" };
    expect(() => emitAttemptTrace(undefined, input)).not.toThrow();
    expect(() => emitAttemptTrace(() => { throw new Error("sink down"); }, input)).not.toThrow();
    const trace = createFinalAttemptTrace(undefined, { attemptId: "t", scope: "ayah" });
    expect(() => {
      trace.eligible({ size: 1, type: "" });
      trace.started("tutor");
      trace.failed(new Error("x"));
    }).not.toThrow();
  });

  it("leaves correlationId null on every final-path trace, keeping the client id as attemptId", () => {
    const { log, sink } = traced();
    const trace = createFinalAttemptTrace(sink, { attemptId: "turn-10", scope: "ayah" }, clock());
    trace.skipped("no-active-verse");
    trace.eligible({ size: 10, type: "audio/webm" });
    trace.started("tutor");
    trace.responded("tutor", { recitation: null, tutor: { status: "stale" } });
    trace.failed(new Error("after answer"));
    const second = createFinalAttemptTrace(sink, { attemptId: "manual-1", scope: "ayah" }, clock());
    second.started("study");
    second.failed(new TypeError("offline"));

    const lifecycle = log.events.filter((event) => event.type === "attempt.lifecycle");
    expect(lifecycle.length).toBeGreaterThan(0);
    expect(lifecycle.every((event) => event.correlationId === null)).toBe(true);
    expect(new Set(lifecycle.map((event) => event.attemptId))).toEqual(new Set(["turn-10", "manual-1"]));
    expect(log.attemptLifecycleSummary().attempts.every((attempt) => attempt.correlationId === null)).toBe(true);
  });

  it("fills the attempt with the server request ID returned by success or failure", () => {
    const success = traced();
    const completed = createFinalAttemptTrace(success.sink, { attemptId: "turn-success", scope: "ayah" }, clock());
    completed.started("tutor");
    completed.responded("tutor", {
      recitation: { quranAwareReview: { status: "abstained" }, reviewStatus: "available" },
      tutor: { status: "updated" },
      validationCorrelationId: "req_success-1",
    });
    expect(success.log.attemptLifecycleSummary().attempts[0]).toMatchObject({
      attemptId: "turn-success",
      correlationId: "req_success-1",
      outcome: "responded",
    });

    const failure = traced();
    const failed = createFinalAttemptTrace(failure.sink, { attemptId: "turn-failed", scope: "ayah" }, clock());
    failed.started("study");
    failed.failed({ data: { code: "BAD_GATEWAY", correlationId: "req_failed-1" }, message: "private" });
    expect(failure.log.attemptLifecycleSummary().attempts[0]).toMatchObject({
      attemptId: "turn-failed",
      correlationId: "req_failed-1",
      outcome: "failed",
    });
    expect(JSON.stringify(failure.log.toJSON())).not.toContain("private");
  });

  it("counts acoustic statuses only for acoustic-eligible ayah attempts, never word-scope", () => {
    const { log, sink } = traced();
    const ayah = createFinalAttemptTrace(sink, { attemptId: "turn-a", scope: "ayah" }, clock());
    ayah.eligible({ size: 10, type: "audio/webm" });
    ayah.started("tutor");
    ayah.responded("tutor", { recitation: { quranAwareReview: { status: "available" } }, tutor: { status: "updated" } });
    // Word-scope reviews intentionally skip the acoustic evaluator; the server
    // still reports the empty review's status, which must not be counted.
    for (const id of ["turn-w1", "turn-w2"]) {
      const word = createFinalAttemptTrace(sink, { attemptId: id, scope: "word" }, clock());
      word.eligible({ size: 10, type: "audio/webm" });
      word.started("tutor");
      word.responded("tutor", { recitation: { quranAwareReview: { status: "not_configured" } }, tutor: { status: "updated" } });
    }
    // A hand-built word-scope response that claims eligibility is still not counted.
    sink({
      stage: "submission.responded",
      path: "final",
      attemptId: "turn-w3",
      details: { scope: "word", acousticEligible: true, acousticStatus: "available" },
    });
    // Interim answers never reach the evaluator either.
    sink({
      stage: "submission.responded",
      path: "interim",
      attemptId: "turn-a:1",
      details: { scope: "ayah", acousticEligible: true, acousticStatus: "available" },
    });

    const summary = log.attemptLifecycleSummary();
    expect(summary.acousticStatuses).toEqual({ available: 1 });
    const byId = Object.fromEntries(summary.attempts.map((attempt) => [attempt.attemptId, attempt]));
    expect(byId["turn-a"]).toMatchObject({ acousticEligible: true, acousticStatus: "available" });
    expect(byId["turn-w1"]).toMatchObject({ outcome: "responded", acousticEligible: false, acousticStatus: null });
    expect(byId["turn-w3"]).toMatchObject({ acousticEligible: false, acousticStatus: null });
  });

  it("keeps a final attempt and interim drops from the same turn as separate records", () => {
    const { log, sink } = traced();
    sink({ stage: "submission.skipped", path: "interim", attemptId: "turn-x", details: { skipReason: "request-outstanding" } });
    const trace = createFinalAttemptTrace(sink, { attemptId: "turn-x", scope: "ayah" }, clock());
    trace.eligible({ size: 10, type: "audio/webm" });
    trace.started("tutor");
    trace.responded("tutor", { recitation: { quranAwareReview: { status: "abstained" } } });

    const records = log.attemptLifecycleSummary().attempts.filter((attempt) => attempt.attemptId === "turn-x");
    expect(records.map((record) => [record.path, record.outcome])).toEqual([
      ["interim", "skipped"],
      ["final", "responded"],
    ]);
  });
});
