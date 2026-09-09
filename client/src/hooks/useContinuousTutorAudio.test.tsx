/**
 * @vitest-environment happy-dom
 *
 * The recorder's last blob, and the turns it must not reach.
 *
 * `MediaRecorder.stop()` does not finish a recording. It delivers one final
 * `dataavailable` holding everything captured since the previous slice, and
 * only then fires `onstop`. A hook that assembles at the moment of stopping
 * therefore drops the tail of the turn — the last consonant of an ayah, or most
 * of a one-word answer, which can live almost entirely inside that last slice.
 *
 * Waiting for it creates the opposite hazard: the recorder goes on emitting
 * into a turn the server has already interrupted, or into a turn that was
 * abandoned while a new one is opening. So these tests pin both halves at once:
 * a submitted turn contains the final blob, and a turn that was never going to
 * be submitted cannot contribute a byte to one that is.
 *
 * The recorder here is a fake with an explicit `flush()`, so the ordering that
 * a real browser produces asynchronously — final data, then `onstop` — can be
 * driven exactly rather than waited on.
 */
import React, { act } from "react";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useContinuousTutorAudio,
  type ContinuousTutorAudio,
  type FinalisedTurn,
  type InterimTurnAudio,
} from "./useContinuousTutorAudio";
import { HANDS_FREE_TIMING } from "@/lib/handsFreePlan";

/* -------------------------------------------------------------- the fakes */

const tracks: { stopped: boolean }[] = [];

/**
 * A recorder that hands over its tail only when told to.
 *
 * `stop()` deliberately does *not* deliver data or fire `onstop`; `flush()`
 * does both, in the order a browser does. That is the whole point: it makes the
 * window between the two observable.
 */
class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported(type: string) { return type === "audio/webm"; }
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  stopped = false;
  constructor() { FakeRecorder.instances.push(this); }
  start() { this.state = "recording"; }
  /** One timeslice, as a running recorder produces every 250ms. */
  slice(text: string) { this.ondataavailable?.({ data: new Blob([text], { type: "audio/webm" }) }); }
  stop() { this.state = "inactive"; this.stopped = true; }
  /** The final `dataavailable`, then `onstop` — the real browser order. */
  flush(tail = "TAIL") {
    if (tail) this.ondataavailable?.({ data: new Blob([tail], { type: "audio/webm" }) });
    this.onstop?.();
  }
  fail() { this.onerror?.(); }
}

class FakeAnalyser {
  fftSize = 1024;
  smoothingTimeConstant = 0.6;
  getByteTimeDomainData(buffer: Uint8Array) { buffer.fill(128); }
  disconnect() {}
}

class FakeAudioContext {
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createAnalyser() { return new FakeAnalyser(); }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

/* ------------------------------------------------------------ the harness */

let controller: ContinuousTutorAudio;
const submitted: FinalisedTurn[] = [];
const interims: InterimTurnAudio[] = [];
let container: HTMLDivElement;
let root: Root;

function Harness() {
  controller = useContinuousTutorAudio({
    onTurn: (turn) => submitted.push(turn),
    onInterim: (chunk) => interims.push(chunk),
  });
  return null;
}

async function settle(turns = 3) {
  for (let turn = 0; turn < turns; turn += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  }
}

/** What a submitted turn actually contains, as text. */
async function bodyOf(turn: FinalisedTurn): Promise<string> {
  return turn.blob.text();
}

const recorders = () => FakeRecorder.instances;
const latest = () => FakeRecorder.instances[FakeRecorder.instances.length - 1];

beforeEach(async () => {
  submitted.length = 0;
  interims.length = 0;
  tracks.length = 0;
  FakeRecorder.instances.length = 0;
  Object.defineProperty(window, "MediaRecorder", { value: FakeRecorder, configurable: true, writable: true });
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  (window as unknown as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: async () => {
        const track = { stopped: false };
        tracks.push(track);
        return { getTracks: () => [{ stop: () => { track.stopped = true; } }] };
      },
    },
    configurable: true, writable: true,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<Harness />); });
  await act(async () => { await controller.start(); });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/* -------------------------------------------- the tail of the recitation */

describe("a submitted turn keeps everything the recorder captured", () => {
  it("includes the final blob that arrives after stop()", async () => {
    await act(async () => controller.listen("ayah"));
    latest().slice("ALHAMDU");
    latest().slice("LILLAHI");

    // Silence ends the turn. At this moment the browser has not yet delivered
    // the tail, and the hook must not have assembled anything.
    await act(async () => controller.finish());
    expect(submitted).toHaveLength(0);
    expect(latest().stopped).toBe(true);

    // Now the browser hands over the last slice, then fires onstop.
    await act(async () => latest().flush("RABBIL-ALAMEEN"));

    expect(submitted).toHaveLength(1);
    // The end of the ayah is in the recording. Assembling at stop() would have
    // sent the server everything except the last word.
    expect(await bodyOf(submitted[0])).toBe("ALHAMDULILLAHIRABBIL-ALAMEEN");
  });

  it("keeps the tail of a one-word answer, which is almost all of it", async () => {
    await act(async () => controller.listen("word"));
    // A word attempt is short enough to live inside the final slice alone.
    await act(async () => controller.finish());
    await act(async () => latest().flush("RABBI"));

    expect(submitted).toHaveLength(1);
    expect(await bodyOf(submitted[0])).toBe("RABBI");
    expect(submitted[0].scope).toBe("word");
  });

  it("shows the learner it is being checked before the recorder has flushed", async () => {
    await act(async () => controller.listen("ayah"));
    latest().slice("A");
    await act(async () => controller.finish());

    // The turn is with the teacher as far as the learner is concerned, even
    // though the blob does not exist yet.
    expect(controller.state).toBe("checking");
    await act(async () => latest().flush());
    expect(submitted).toHaveLength(1);
  });

  it("submits anyway when a recorder never reports finishing", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => controller.listen("ayah"));
      latest().slice("A");
      await act(async () => controller.finish());
      expect(submitted).toHaveLength(0);

      // The recorder is gone, wedged, or the device was removed. The turn is
      // still the learner's attempt, so it goes after the cap rather than
      // hanging on "Checking" forever.
      await act(async () => { vi.advanceTimersByTime(HANDS_FREE_TIMING.recorderFlushMs + 50); });
      expect(submitted).toHaveLength(1);
      expect(await bodyOf(submitted[0])).toBe("A");
    } finally {
      vi.useRealTimers();
    }
  });

  it("assembles once, however many times the recorder reports stopping", async () => {
    await act(async () => controller.listen("ayah"));
    latest().slice("A");
    await act(async () => controller.finish());

    await act(async () => latest().flush("B"));
    await act(async () => latest().flush("C"));
    await act(async () => latest().onstop?.());

    expect(submitted).toHaveLength(1);
    expect(await bodyOf(submitted[0])).toBe("AB");
  });
});

/* ------------------------------------ what an abandoned recorder may not do */

describe("an abandoned turn cannot contribute to a later one", () => {
  it("discards the interrupted turn, tail and all", async () => {
    await act(async () => controller.listen("ayah"));
    latest().slice("PARTIAL");

    // The server confirmed an omission while the learner was still speaking.
    await act(async () => controller.interrupt());
    // The recorder still owes a final blob, and delivers it into a turn nobody
    // will read.
    await act(async () => latest().flush("MORE-PARTIAL"));

    expect(submitted).toHaveLength(0);
  });

  it("keeps a late blob from the interrupted recorder out of the next turn", async () => {
    const first = (await act(async () => controller.listen("ayah")), latest());
    first.slice("OLD");
    await act(async () => controller.interrupt());

    // A new turn opens — the word the teacher just asked for — before the old
    // recorder has finished emitting.
    await act(async () => controller.listen("word"));
    const second = latest();
    expect(second).not.toBe(first);
    second.slice("RABBI");

    // Now the *old* recorder delivers its tail and stops.
    await act(async () => first.flush("OLD-TAIL"));

    await act(async () => controller.finish());
    await act(async () => second.flush("-TAIL"));

    expect(submitted).toHaveLength(1);
    // Not one byte of the interrupted turn is in the word attempt. This is the
    // failure that would have the server judge `رَبِّ` against audio from the
    // ayah the learner was cut off in.
    const body = await bodyOf(submitted[0]);
    expect(body).toBe("RABBI-TAIL");
    expect(body).not.toContain("OLD");
  });

  it("submits nothing when the learner pauses mid-turn", async () => {
    await act(async () => controller.listen("ayah"));
    latest().slice("HALF");
    await act(async () => controller.pause());
    await act(async () => latest().flush("REST"));

    // Stepping away is not an attempt, and a lesson must never record progress
    // because a learner stopped.
    expect(submitted).toHaveLength(0);
    expect(controller.state).toBe("paused");
  });

  it("submits nothing when the session is stopped", async () => {
    await act(async () => controller.listen("ayah"));
    latest().slice("HALF");
    await act(async () => controller.stop());
    await act(async () => latest().flush("REST"));

    expect(submitted).toHaveLength(0);
    expect(tracks[0].stopped).toBe(true);
  });

  it("submits nothing when playback takes the room", async () => {
    await act(async () => controller.listen("ayah"));
    latest().slice("HALF");
    await act(async () => controller.holdForPlayback("qari"));
    await act(async () => latest().flush("REST"));

    expect(submitted).toHaveLength(0);
    expect(controller.state).toBe("qari-playing");
  });

  it("submits nothing when the recorder itself fails", async () => {
    await act(async () => controller.listen("ayah"));
    latest().slice("HALF");
    await act(async () => latest().fail());
    await act(async () => latest().flush("REST"));

    // A recorder that failed mid-turn has nothing trustworthy to submit.
    expect(submitted).toHaveLength(0);
  });

  it("closes a turn once, whatever closes it second", async () => {
    await act(async () => controller.listen("ayah"));
    latest().slice("A");
    await act(async () => controller.finish());
    // A detector frame that was still in flight when the turn closed.
    await act(async () => controller.finish());
    await act(async () => controller.interrupt());
    await act(async () => latest().flush("B"));

    expect(submitted).toHaveLength(1);
  });

  it("refuses to open a turn on top of an open one", async () => {
    await act(async () => controller.listen("ayah"));
    const only = latest();
    await act(async () => controller.listen("ayah"));
    expect(latest()).toBe(only);
    expect(recorders()).toHaveLength(1);
  });
});

/* ------------------------------------------------------- the rolling audio */

describe("rolling audio", () => {
  it("cuts nothing for a word turn", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => controller.listen("word"));
      latest().slice("RABBI");
      await act(async () => { vi.advanceTimersByTime(HANDS_FREE_TIMING.interimChunkMs * 3); });

      // The live contract requires a focused word attempt to be a completed
      // turn. Half of a one-word answer is not an answer.
      expect(interims).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops cutting the moment the turn closes", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => controller.listen("ayah"));
      await act(async () => controller.interrupt());
      await act(async () => { vi.advanceTimersByTime(HANDS_FREE_TIMING.interimChunkMs * 3); });
      expect(interims).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ------------------------------------------------------ the microphone itself */

describe("the microphone", () => {
  it("is asked for once and kept across turns", async () => {
    await act(async () => controller.listen("ayah"));
    await act(async () => controller.finish());
    await act(async () => latest().flush());
    await act(async () => controller.setChecking(false));
    await act(async () => controller.listen("ayah"));
    await act(async () => controller.finish());
    await act(async () => latest().flush());

    expect(tracks).toHaveLength(1);
    expect(tracks[0].stopped).toBe(false);
    expect(recorders()).toHaveLength(2);
    expect(submitted).toHaveLength(2);
  });

  it("is released on unmount", async () => {
    await act(async () => controller.listen("ayah"));
    act(() => root.unmount());
    expect(tracks[0].stopped).toBe(true);
    // Re-created in afterEach's unmount; this one is already gone.
    root = createRoot(document.createElement("div"));
  });
});
