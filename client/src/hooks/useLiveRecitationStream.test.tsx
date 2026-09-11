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

/* ------------------------------------------------------------------ fakes */

const networkDown = () => Promise.reject(new Error("network down"));

const startLiveAnswer = {
  stream: { streamId: "stream-1", lastSequence: 0 },
  nextChannel: "keep-listening" as const,
  tutor: null,
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    recitation: {
      startLive: { useMutation: () => ({ mutateAsync: () => Promise.resolve(startLiveAnswer) }) },
      ingestLiveAudio: { useMutation: () => ({ mutateAsync: networkDown }) },
    },
  },
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: LiveRecitationStream | null = null;
const instrumented: Array<{ kind: string; details: Record<string, unknown> }> = [];

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

beforeEach(() => {
  vi.useFakeTimers();
  latest = null;
  instrumented.length = 0;
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

    // One failed attempt and one retry: not abandoned yet.
    await flushAttempt();
    await act(async () => {
      await Promise.resolve();
    });

    expect(instrumented).toEqual([]);
    expect(latest?.interimAbandoned).toBe(false);
  });
});
