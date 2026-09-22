/**
 * @vitest-environment happy-dom
 *
 * The live interim stream must fail loudly in the ledger, not silently.
 *
 * When the interim path gives up after its bounded retries, the lesson falls
 * back to finalised turns and keeps working — but until now nothing recorded
 * the give-up. "The tutor stopped interrupting mid-ayah" was then
 * indistinguishable from "the learner stopped making mistakes", which is
 * exactly the wrong confusion during real-device validation. The abandonment
 * now emits `interim.abandoned` on the validation channel and raises a
 * non-blocking `interimAbandoned` indicator on the hook.
 */
import React, { act } from "react";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_RETRY,
  useLiveRecitationStream,
  type LiveRecitationStream,
  type UseLiveRecitationStreamInput,
} from "./useLiveRecitationStream";
import type { InterimTurnAudio } from "./useContinuousTutorAudio";
import type { AttemptTraceInput } from "@/lib/validationCapture";

/* ------------------------------------------------------------------ fakes */

const networkDown = () => Promise.reject(new Error("network down"));
/** What `ingestLiveAudio` does in the current test. Network down by default. */
let ingestImpl: (payload: unknown) => Promise<unknown> = networkDown;

/**
 * Deterministic FileReader.
 *
 * The hook encodes interim audio through `blobToBase64`, which uses the real
 * `FileReader` — and happy-dom's FileReader completes through real timers
 * that `vi.useFakeTimers()` does not govern (advancing the fake clock never
 * finishes a read). The test would then depend on wall-clock scheduling for
 * the first attempt to be dispatched, which is exactly the flake this file
 * had: under load the retry loop desynchronised from the real attempt count.
 * This stub resolves through the microtask queue only, so the whole
 * send → retry → abandon chain is deterministic under fake timers.
 */
class DeterministicFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  readAsDataURL(_blob: Blob): void {
    void Promise.resolve().then(() => {
      this.result = "data:audio/webm;base64,ZHVtbXktYXVkaW8=";
      this.onload?.();
    });
  }
}

const startLiveAnswer = {
  stream: { streamId: "stream-1", lastSequence: 0 },
  nextChannel: "keep-listening" as const,
  tutor: null,
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    recitation: {
      startLive: { useMutation: () => ({ mutateAsync: () => Promise.resolve(startLiveAnswer) }) },
      ingestLiveAudio: { useMutation: () => ({ mutateAsync: (payload: unknown) => ingestImpl(payload) }) },
    },
  },
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: LiveRecitationStream | null = null;
const instrumented: Array<{ kind: string; details: Record<string, unknown> }> = [];
const traces: AttemptTraceInput[] = [];

function baseInput(overrides: Partial<UseLiveRecitationStreamInput> = {}): UseLiveRecitationStreamInput {
  return {
    enabled: true,
    reference: { sessionId: "session-1", revision: 1 },
    learningLevel: "qaida",
    uiLanguage: "en",
    onEvent: () => {},
    onInstrument: (kind, details) => {
      instrumented.push({ kind, details });
    },
    onAttemptTrace: (input) => {
      traces.push(input);
    },
    ...overrides,
  };
}

function renderStream(input: UseLiveRecitationStreamInput) {
  function Probe() {
    latest = useLiveRecitationStream(input);
    return null;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  return act(async () => {
    root?.render(<Probe />);
  });
}

function chunk(): InterimTurnAudio {
  return {
    blob: new Blob(["audio"], { type: "audio/webm" }),
    mimeType: "audio/webm",
    scope: "ayah",
    turnId: "turn-1",
    captureStartedAtMs: 1000,
    captureEndedAtMs: 4000,
  };
}

/** Flush the promise chain and one retry delay, in order. */
async function flushAttempt() {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(LIVE_RETRY.delayMs + 10);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Wait until the first attempt is actually in flight.
 *
 * `sendInterim` dispatches the first attempt asynchronously (through the
 * stubbed FileReader above), so the bounded retry loop must not start driving
 * fake-timer retries before that dispatch has happened — otherwise the loop
 * desynchronises from the hook's real attempt count. Polling
 * `awaitingAnswer` — set synchronously when an attempt is dispatched and
 * held through its retries — keeps the loop aligned with reality. Bounded:
 * if the attempt never starts the test fails on its assertions instead of
 * hanging.
 */
async function waitForFirstAttempt() {
  for (let i = 0; i < 50 && !latest?.awaitingAnswer; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("FileReader", DeterministicFileReader);
  latest = null;
  instrumented.length = 0;
  traces.length = 0;
  ingestImpl = networkDown;
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  if (container) {
    container.remove();
    container = null;
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ tests */

describe("interim stream abandonment", () => {
  it("emits interim.abandoned and raises the indicator after the bounded retries", async () => {
    await renderStream(baseInput());
    // The stream opens; the directive accepts interim audio.
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest?.open).toBe(true);

    await act(async () => {
      latest?.sendInterim(chunk());
    });
    // The first attempt is dispatched asynchronously; wait until it is in
    // flight before driving the retry loop.
    await waitForFirstAttempt();

    // First send fails, then each bounded retry fails the same way.
    for (let attempt = 0; attempt < LIVE_RETRY.maxAttempts; attempt += 1) {
      await flushAttempt();
    }
    await act(async () => {
      await Promise.resolve();
    });

    expect(instrumented).toHaveLength(1);
    expect(instrumented[0]).toMatchObject({
      kind: "interim.abandoned",
      details: { attempts: LIVE_RETRY.maxAttempts },
    });
    expect(latest?.interimAbandoned).toBe(true);
    // The lesson is not stuck: the stream is closed and finalised turns take over.
    expect(latest?.open).toBe(false);
  });

  it("stays quiet while retries are still in flight", async () => {
    await renderStream(baseInput());
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      latest?.sendInterim(chunk());
    });
    // Wait for the first attempt to be in flight so the single retry below is
    // a real retry, not a vacuous pass before anything was sent.
    await waitForFirstAttempt();

    // One failed attempt and one retry: not abandoned yet.
    await flushAttempt();
    await act(async () => {
      await Promise.resolve();
    });

    expect(instrumented).toEqual([]);
    expect(latest?.interimAbandoned).toBe(false);
  });
});

describe("interim attempt lifecycle tracing", () => {
  const stages = () => traces.map((trace) => trace.stage);
  /** The encoded audio the stub FileReader produces; must never be traced. */
  const ENCODED = "ZHVtbXktYXVkaW8=";

  async function openStream() {
    await renderStream(baseInput());
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest?.open).toBe(true);
  }

  it("traces a normal submit: eligible, started, responded", async () => {
    ingestImpl = () => Promise.resolve({
      acknowledgement: { status: "applied", sequence: 1, appliedSequence: 1 },
      nextChannel: "keep-listening",
      recognitionStatus: "transcribed",
      stream: null,
      event: null,
      tutor: null,
    });
    await openStream();
    await act(async () => {
      latest?.sendInterim(chunk());
    });
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(stages()).toEqual(["submission.eligible", "submission.started", "submission.responded"]);
    expect(traces.every((trace) => trace.path === "interim" && trace.attemptId === "turn-1:1")).toBe(true);
    expect(traces.every((trace) => trace.correlationId === null)).toBe(true);
    expect(traces[0]?.details).toMatchObject({ route: "live", acousticEligible: false, sequence: 1, bytes: 5, durationMs: 3000 });
    expect(traces[1]?.details).toMatchObject({ attempt: 1, sequence: 1 });
    expect(traces[2]?.details).toMatchObject({ acknowledgementStatus: "applied", recognitionStatus: "transcribed" });
    expect(JSON.stringify(traces)).not.toContain(ENCODED);
  });

  it("traces a dropped chunk with its skip reason and sends nothing", async () => {
    let calls = 0;
    ingestImpl = () => {
      calls += 1;
      return new Promise(() => {});
    };
    await openStream();
    // A word turn is never streamed.
    await act(async () => {
      latest?.sendInterim({ ...chunk(), scope: "word" });
    });
    // The first ayah chunk goes out and never answers; the next is dropped.
    await act(async () => {
      latest?.sendInterim(chunk());
    });
    await waitForFirstAttempt();
    await act(async () => {
      latest?.sendInterim(chunk());
    });

    const skipped = traces.filter((trace) => trace.stage === "submission.skipped");
    expect(skipped.map((trace) => trace.details?.skipReason)).toEqual(["not-ayah-scope", "request-outstanding"]);
    // Dropped before a chunk id existed: traced under the turn id, and never
    // with a client id in correlationId.
    expect(skipped.every((trace) => trace.attemptId === "turn-1" && trace.correlationId === null)).toBe(true);
    expect(calls).toBe(1);
  });

  it("traces a network failure per attempt until the stream gives up", async () => {
    await openStream();
    await act(async () => {
      latest?.sendInterim(chunk());
    });
    await waitForFirstAttempt();
    for (let attempt = 0; attempt < LIVE_RETRY.maxAttempts; attempt += 1) {
      await flushAttempt();
    }
    await act(async () => {
      await Promise.resolve();
    });

    const failed = traces.filter((trace) => trace.stage === "submission.failed");
    expect(failed.map((trace) => [trace.details?.attempt, trace.details?.willRetry])).toEqual([
      [1, true],
      [2, true],
      [3, false],
    ]);
    expect(failed.every((trace) => trace.details?.errorCode === "Error")).toBe(true);
    expect(traces.every((trace) => trace.attemptId === "turn-1:1" && trace.correlationId === null)).toBe(true);
    expect(JSON.stringify(traces)).not.toContain("network down");
    expect(traces.filter((trace) => trace.stage === "submission.started")).toHaveLength(LIVE_RETRY.maxAttempts);
    // Behavior unchanged: the existing abandonment signal still fires once.
    expect(instrumented).toHaveLength(1);
    expect(latest?.interimAbandoned).toBe(true);
  });

  it("changes nothing when no trace callback is given", async () => {
    await renderStream(baseInput({ onAttemptTrace: undefined }));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      latest?.sendInterim(chunk());
    });
    await waitForFirstAttempt();
    expect(latest?.awaitingAnswer).toBe(true);
    expect(traces).toEqual([]);
  });
});
