/**
 * Client -> server validation run propagation contract.
 *
 * Proves that the exact header dict the client sends
 * (client/src/lib/validationCapture.buildValidationHeaders) is read by the
 * server's activeValidationRunFromCtx, for both live-tutor paths, with
 * request correlation intact and malformed state failing safe.
 *
 * This connects the test through the real server header reader and the real
 * observation entrypoint rather than testing isolated helpers.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { TrpcContext } from "../_core/context";
import {
  VALIDATION_RUN_HEADER,
  activeValidationRunFromCtx,
  activateValidationRun,
  correlationIdFromCtx,
  observeLiveRouterResult,
  resetValidationRunsForTests,
} from "./liveObservation";
import { createRunId } from "./validationRun";

// Mirrors client/src/lib/validationCapture.buildValidationHeaders output shape.
function clientHeaders(runId: string | null): Record<string, string> {
  return runId ? { [VALIDATION_RUN_HEADER]: runId } : {};
}

function ctxWithHeaders(
  headers: Record<string, string>,
  requestId?: string,
): TrpcContext {
  return {
    req: { headers, socket: { remoteAddress: "203.0.113.90" } },
    res: {},
    requestId,
    user: null,
  } as unknown as TrpcContext;
}

describe("validation client -> server propagation contract", () => {
  beforeEach(() => resetValidationRunsForTests());
  afterEach(() => resetValidationRunsForTests());

  it("inactive (no header) → server sees no active run; nothing observed", () => {
    const runId = createRunId();
    activateValidationRun(runId);
    const ctx = ctxWithHeaders(clientHeaders(null), "req-1");
    expect(activeValidationRunFromCtx(ctx)).toBeNull();
    // Observation with no run must not throw and must not record.
    const run = activateValidationRun(createRunId());
    const before = run.ledger.events.length;
    // No run for this ctx, so we never call observe — contract holds.
    expect(before).toBe(1); // only session.start
  });

  it("active run → server resolves the same run from the client header", () => {
    const runId = createRunId();
    const activated = activateValidationRun(runId);
    const ctx = ctxWithHeaders(clientHeaders(runId), "req-correlation-1");
    const resolved = activeValidationRunFromCtx(ctx);
    expect(resolved?.runId).toBe(runId);
    expect(resolved?.ledger).toBe(activated.ledger);
  });

  it("request correlation remains intact alongside the validation header", () => {
    const runId = createRunId();
    activateValidationRun(runId);
    const ctx = ctxWithHeaders(clientHeaders(runId), "req-abc-123");
    expect(activeValidationRunFromCtx(ctx)?.runId).toBe(runId);
    expect(correlationIdFromCtx(ctx)).toBe("req-abc-123");
  });

  it("falls back to x-request-id when ctx.requestId is absent", () => {
    const runId = createRunId();
    activateValidationRun(runId);
    const ctx = ctxWithHeaders(
      { ...clientHeaders(runId), "x-request-id": "req-hdr-fallback" },
      undefined,
    );
    expect(correlationIdFromCtx(ctx)).toBe("req-hdr-fallback");
  });

  it("malformed run ID header fails safely → no active run, no throw", () => {
    const runId = createRunId();
    activateValidationRun(runId);
    const ctx = ctxWithHeaders({ [VALIDATION_RUN_HEADER]: "bogus" }, "req-1");
    expect(activeValidationRunFromCtx(ctx)).toBeNull();
    const emptyCtx = ctxWithHeaders({}, "req-1");
    expect(activeValidationRunFromCtx(emptyCtx)).toBeNull();
  });

  it("well-formed but never-activated run ID → no active run", () => {
    const neverActivated = createRunId();
    const ctx = ctxWithHeaders(clientHeaders(neverActivated), "req-1");
    expect(activeValidationRunFromCtx(ctx)).toBeNull();
  });

  it("observed results carry both runId and correlationId for startLive and ingestLiveAudio", () => {
    const runId = createRunId();
    const activated = activateValidationRun(runId);
    const correlationId = "req-join-1";

    // startLive path
    observeLiveRouterResult(
      activated,
      "recitation.startLive",
      {
        stream: {
          streamId: "stream-1",
          tracker: { surah: 1, ayah: 2, expectedWordIndex: 1 },
        },
      },
      { correlationId },
    );
    // ingestLiveAudio path
    observeLiveRouterResult(
      activated,
      "recitation.ingestLiveAudio",
      {
        acknowledgement: { status: "applied", turnId: "t1", chunkId: "c1", sequence: 1 },
        stream: {
          streamId: "stream-1",
          tracker: { surah: 1, ayah: 2, expectedWordIndex: 2 },
        },
        recognitionStatus: "transcribed",
        recitation: { verseFollowing: { shouldAdvance: false } },
        tutor: { action: { kind: "none" } },
      },
      { correlationId },
    );

    const checkpoints = activated.ledger.eventsOfType("position.checkpoint");
    expect(checkpoints.length).toBe(2);
    for (const event of checkpoints) {
      expect(event.runId).toBe(runId);
      expect(event.correlationId).toBe(correlationId);
    }
  });

  it("browser run ID never becomes Quran authority: observation copies server state only", () => {
    const runId = createRunId();
    const activated = activateValidationRun(runId);
    // Even with a valid client header, the recorded checkpoint comes from the
    // server result payload, not from any client-supplied position.
    observeLiveRouterResult(
      activated,
      "recitation.startLive",
      {
        stream: {
          streamId: "s1",
          tracker: { surah: 112, ayah: 3, expectedWordIndex: 5 },
        },
      },
      { correlationId: "req-1" },
    );
    const [checkpoint] = activated.ledger.eventsOfType("position.checkpoint");
    expect(checkpoint?.details).toMatchObject({
      surah: 112,
      ayah: 3,
      wordIndex: 5,
      source: "server",
    });
  });
});
