import { describe, expect, it, beforeEach } from "vitest";
import {
  activateValidationRun,
  activeValidationRunFromCtx,
  correlationIdFromCtx,
  deactivateValidationRun,
  exportValidationRun,
  getActiveValidationRun,
  observeLiveRouterResult,
  playbackDirectiveOf,
  resetValidationRunsForTests,
  VALIDATION_RUN_HEADER,
} from "./liveObservation";
import { createRunId } from "./validationRun";
import type { TrpcContext } from "../_core/context";

function ctxWith(headers: Record<string, string>, requestId?: string): TrpcContext {
  return { req: { headers }, res: {}, requestId } as TrpcContext;
}

beforeEach(() => {
  resetValidationRunsForTests();
});

describe("validation run registry", () => {
  it("activates a run with a fresh ledger and a session.start event", () => {
    const runId = createRunId();
    const run = activateValidationRun(runId, { deviceMetadata: { device: "pilot" } });
    expect(run.runId).toBe(runId);
    expect(getActiveValidationRun(runId)).toBe(run);
    const starts = run.ledger.eventsOfType("session.start");
    expect(starts).toHaveLength(1);
    expect(starts[0].runId).toBe(runId);
  });

  it("re-activation returns the existing run without duplicating session.start", () => {
    const runId = createRunId();
    const first = activateValidationRun(runId);
    const second = activateValidationRun(runId);
    expect(second).toBe(first);
    expect(first.ledger.eventsOfType("session.start")).toHaveLength(1);
  });

  it("refuses malformed run IDs", () => {
    expect(() => activateValidationRun("not-a-run-id")).toThrow(/malformed run ID/);
    expect(() => activateValidationRun("")).toThrow(/malformed run ID/);
  });

  it("deactivates and exports the ledger for offline joining", () => {
    const runId = createRunId();
    const run = activateValidationRun(runId);
    run.ledger.record("note", { hello: "world" });
    const exported = exportValidationRun(runId);
    expect(exported?.runId).toBe(runId);
    expect(exported?.eventCount).toBe(2);
    const removed = deactivateValidationRun(runId);
    expect(removed).toBe(run);
    expect(getActiveValidationRun(runId)).toBeUndefined();
    expect(exportValidationRun(runId)).toBeNull();
  });
});

describe("request run lookup", () => {
  it("resolves an active run from the header and the correlation ID from ctx", () => {
    const runId = createRunId();
    const run = activateValidationRun(runId);
    const ctx = ctxWith({ [VALIDATION_RUN_HEADER]: runId }, "req-123");
    expect(activeValidationRunFromCtx(ctx)).toBe(run);
    expect(correlationIdFromCtx(ctx)).toBe("req-123");
  });

  it("falls back to the x-request-id header when ctx.requestId is absent", () => {
    const runId = createRunId();
    activateValidationRun(runId);
    const ctx = ctxWith({ [VALIDATION_RUN_HEADER]: runId, "x-request-id": "req-hdr-1" });
    expect(correlationIdFromCtx(ctx)).toBe("req-hdr-1");
  });

  it("returns null for missing, malformed, or inactive run IDs", () => {
    expect(activeValidationRunFromCtx(ctxWith({}))).toBeNull();
    expect(activeValidationRunFromCtx(ctxWith({ [VALIDATION_RUN_HEADER]: "bogus" }))).toBeNull();
    expect(activeValidationRunFromCtx(ctxWith({ [VALIDATION_RUN_HEADER]: createRunId() }))).toBeNull();
  });

  it("never throws on hostile context shapes", () => {
    expect(activeValidationRunFromCtx({} as TrpcContext)).toBeNull();
    expect(activeValidationRunFromCtx({ req: null } as unknown as TrpcContext)).toBeNull();
    expect(correlationIdFromCtx({} as TrpcContext)).toBeNull();
  });
});

describe("observeLiveRouterResult", () => {
  it("records the initial server-held position for startLive", () => {
    const run = activateValidationRun(createRunId());
    observeLiveRouterResult(
      run,
      "recitation.startLive",
      { stream: { streamId: "s-1", tracker: { surah: 1, ayah: 2, expectedWordIndex: 0 } }, tutor: null },
      { correlationId: "req-start" },
    );
    const checkpoints = run.ledger.eventsOfType("position.checkpoint");
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].correlationId).toBe("req-start");
    expect(checkpoints[0].details).toMatchObject({
      surah: 1,
      ayah: 2,
      wordIndex: 0,
      source: "server",
      evidenceSource: "none",
      audioDerived: false,
      quranStateMutation: null,
      streamId: "s-1",
    });
  });

  it("records a checkpoint and an exact correction decision for an applied omission", () => {
    const run = activateValidationRun(createRunId());
    observeLiveRouterResult(
      run,
      "recitation.ingestLiveAudio",
      {
        acknowledgement: { status: "applied", turnId: "t-1", chunkId: "c-1", sequence: 4 },
        stream: { streamId: "s-1", tracker: { surah: 1, ayah: 2, expectedWordIndex: 3 } },
        recognitionStatus: "transcribed",
        event: { type: "word-omitted", surah: 1, ayah: 2, targetWordIndex: 3, evidence: "finalized-later-word", heardThroughWordIndex: 5 },
        tutor: { action: { kind: "play-target-word", targetWordIndex: 3, hint: null } },
        recitation: null,
      },
      { correlationId: "req-4" },
    );
    const checkpoints = run.ledger.eventsOfType("position.checkpoint");
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].details).toMatchObject({
      source: "server",
      evidenceSource: "learner-audio",
      audioDerived: true,
      quranStateMutation: null,
      playbackDirective: { actionKind: "play-target-word", targetWordIndex: 3 },
    });
    const decisions = run.ledger.eventsOfType("correction.decided");
    expect(decisions).toHaveLength(1);
    expect(decisions[0].correlationId).toBe("req-4");
    expect(decisions[0].details).toMatchObject({
      eventType: "word-omitted",
      surah: 1,
      ayah: 2,
      targetWordIndex: 3,
      evidence: "finalized-later-word",
      heardThroughWordIndex: 5,
      audioDerived: true,
      decisionKind: "repeat-word",
      playbackDirective: { actionKind: "play-target-word" },
      sequence: 4,
    });
    // Word indexes only: no Quran text, no transcript in the ledger.
    expect(decisions[0].details).not.toHaveProperty("targetArabic");
    expect(decisions[0].details).not.toHaveProperty("transcript");
  });

  it("marks the advance mutation only for applied inputs that actually advance", () => {
    const run = activateValidationRun(createRunId());
    const appliedAdvance = {
      acknowledgement: { status: "applied", sequence: 6 },
      stream: { tracker: { surah: 1, ayah: 3, expectedWordIndex: 0 } },
      recognitionStatus: "transcribed",
      event: null,
      tutor: { action: { kind: "continue-recitation" } },
      recitation: { verseFollowing: { shouldAdvance: true } },
    };
    observeLiveRouterResult(run, "recitation.ingestLiveAudio", appliedAdvance, {});
    // A duplicate replay returns the same snapshot without committing: it must
    // not fabricate a second mutation or a second correction decision.
    observeLiveRouterResult(
      run,
      "recitation.ingestLiveAudio",
      { ...appliedAdvance, acknowledgement: { status: "duplicate", sequence: 7 } },
      {},
    );
    const mutations = run.ledger
      .eventsOfType("position.checkpoint")
      .filter((event) => (event.details as { quranStateMutation?: unknown }).quranStateMutation === "advance");
    expect(mutations).toHaveLength(1);
    expect(run.ledger.eventsOfType("correction.decided")).toHaveLength(0);
  });

  it("does not record correction.decided for a duplicate replay of an omission", () => {
    const run = activateValidationRun(createRunId());
    const omission = {
      acknowledgement: { status: "duplicate", sequence: 5 },
      stream: { tracker: { surah: 1, ayah: 2, expectedWordIndex: 3 } },
      recognitionStatus: "transcribed",
      event: { type: "word-omitted", surah: 1, ayah: 2, targetWordIndex: 3, evidence: "repeated-stable-later-word", heardThroughWordIndex: 5 },
      tutor: { action: { kind: "play-target-word" } },
    };
    observeLiveRouterResult(run, "recitation.ingestLiveAudio", omission, {});
    expect(run.ledger.eventsOfType("correction.decided")).toHaveLength(0);
  });

  it("ignores unknown paths and hostile results without throwing", () => {
    const run = activateValidationRun(createRunId());
    expect(() => {
      observeLiveRouterResult(run, "recitation.evaluate", { stream: {} }, {});
      observeLiveRouterResult(run, "recitation.startLive", null, {});
      observeLiveRouterResult(run, "recitation.startLive", { stream: { tracker: "nope" } }, {});
      observeLiveRouterResult(run, "recitation.ingestLiveAudio", { acknowledgement: 42 }, {});
    }).not.toThrow();
    expect(run.ledger.events).toHaveLength(1); // only session.start
  });
});

describe("playbackDirectiveOf", () => {
  it("detects trusted-audio playback directives", () => {
    expect(playbackDirectiveOf({ kind: "play-target-word", targetWordIndex: 3, hint: null })).toMatchObject({
      actionKind: "play-target-word",
      targetWordIndex: 3,
    });
    expect(
      playbackDirectiveOf({ kind: "offer-hint", hint: { kind: "trusted-ayah-audio", wordIndex: null } }),
    ).toMatchObject({ actionKind: "offer-hint", hintKind: "trusted-ayah-audio" });
    expect(playbackDirectiveOf({ kind: "listen", hint: null })).toBeNull();
    expect(playbackDirectiveOf({ kind: "ask-full-ayah", hint: { kind: "target-word" } })).toBeNull();
    expect(playbackDirectiveOf(null)).toBeNull();
  });
});
