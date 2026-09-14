/**
 * @vitest-environment happy-dom
 *
 * Reproduction: a turn that never heard the learner must never be submitted.
 *
 * The reported real-device failure: immediately after the Tutor starts
 * listening — before the learner recites even one word — the app says "I
 * couldn't hear that clearly. Try once more.", and can repeat it automatically.
 *
 * The mechanism under test: the voice-activity safety cap (`max-turn`) fires
 * even when the learner never spoke. The capture hook treats it as a submitted
 * turn, so a silent recording reaches review, which produces `hold-uncertain`
 * ("I couldn't hear that clearly") and re-opens listening — a loop that needs
 * no learner speech at all.
 *
 * A real MediaRecorder produces a *non-empty* blob for silence (container
 * bytes), so the `!blob.size` guard in review does not catch it. The fake
 * recorder here emits silent timeslices for the same reason.
 *
 * Expected: no `onTurn` call. A turn with no speech is not an attempt.
 */
import React, { act } from "react";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useContinuousTutorAudio,
  type ContinuousTutorAudio,
  type FinalisedTurn,
} from "./useContinuousTutorAudio";

/* -------------------------------------------------------------- the fakes */

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported(type: string) { return type === "audio/webm"; }
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { FakeRecorder.instances.push(this); }
  start() { this.state = "recording"; }
  /** A 250ms timeslice of silence, as a real recorder emits while running. */
  slice() {
    // Non-empty: a real MediaRecorder's silent timeslices carry container
    // bytes, so the blob is never empty even when nobody spoke.
    this.ondataavailable?.({ data: new Blob(["SILENT-SLICE"], { type: "audio/webm" }) });
  }
  stop() { this.state = "inactive"; }
  /** Final data, then onstop — the real browser order. */
  finish() {
    this.ondataavailable?.({ data: new Blob(["SILENT-TAIL"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

/** Controllable microphone: silence (128) or simulated speech. */
const micInput = { speech: false };

class FakeAnalyser {
  fftSize = 1024;
  smoothingTimeConstant = 0.6;
  getByteTimeDomainData(buffer: Uint8Array) {
    if (micInput.speech) {
      // Alternating ±28 around the 128 zero line: RMS ≈ 0.22, well above the
      // 0.08 speech threshold, well below clipping.
      for (let i = 0; i < buffer.length; i += 1) buffer[i] = i % 2 === 0 ? 100 : 156;
    } else {
      buffer.fill(128);
    }
  }
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
let container: HTMLDivElement;
let root: Root;

function Harness() {
  controller = useContinuousTutorAudio({
    onTurn: (turn) => submitted.push(turn),
  });
  return null;
}

const latest = () => FakeRecorder.instances[FakeRecorder.instances.length - 1];

beforeEach(async () => {
  submitted.length = 0;
  FakeRecorder.instances.length = 0;
  micInput.speech = false;
  Object.defineProperty(window, "MediaRecorder", { value: FakeRecorder, configurable: true, writable: true });
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  (window as unknown as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
    },
    configurable: true, writable: true,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<Harness />); });
  await act(async () => { await controller.start(); });
  // Fake `performance` too: the voice-activity detector stamps samples with
  // `performance.now()`, and without it the safety cap can never fire here.
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"],
  });
});

afterEach(() => {
  vi.useRealTimers();
  act(() => root.unmount());
  container.remove();
});

/* ------------------------------------------------------- the reproduction */

describe("a turn that never heard the learner", () => {
  it("is never submitted for review, even when the safety cap fires", async () => {
    await act(async () => { controller.listen("ayah"); });
    const recorder = latest();
    expect(recorder.state).toBe("recording");

    // A real recorder emits 250ms timeslices of (silent) audio while open.
    // Emit a few, then let silence run past the 45s ayah safety cap.
    for (let i = 0; i < 8; i += 1) recorder.slice();
    await act(async () => { vi.advanceTimersByTime(46_000); });
    // The safety cap stops the recorder; the final data arrives.
    recorder.finish();
    await act(async () => { vi.advanceTimersByTime(2_000); });

    // The learner never spoke. There is nothing to review, nothing to fail,
    // and nothing that may trigger "I couldn't hear that clearly".
    expect(submitted).toHaveLength(0);
  });

  it("exits to waiting without retrying after a speechless timeout", async () => {
    const onIdle = vi.fn();
    // Re-render with onIdle wired to observe the lesson notification.
    await act(async () => { root.unmount(); });
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    const { createRoot: createRoot2 } = await import("react-dom/client");
    const root2 = createRoot2(container);
    function Harness2() {
      controller = useContinuousTutorAudio({
        onTurn: (turn) => submitted.push(turn),
        onIdle,
      });
      return null;
    }
    await act(async () => { root2.render(<Harness2 />); });
    await act(async () => { await controller.start(); });

    await act(async () => { controller.listen("ayah"); });
    const recorderCount = FakeRecorder.instances.length;
    await act(async () => { vi.advanceTimersByTime(46_000); });
    latest().finish();
    await act(async () => { vi.advanceTimersByTime(2_000); });

    // Exits safely: no submission, no new recorder (no automatic retry),
    // state leaves "learner-listening", and the lesson is notified.
    expect(submitted).toHaveLength(0);
    expect(FakeRecorder.instances.length).toBe(recorderCount);
    expect(controller.state).toBe("waiting");
    expect(onIdle).toHaveBeenCalled();
    await act(async () => { root2.unmount(); });
  });

  it("captures normally when the learner starts after several seconds of silence", async () => {
    await act(async () => { controller.listen("ayah"); });
    // 10s of silence: the learner is preparing, not failing.
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(submitted).toHaveLength(0);

    // The learner begins: normal capture proceeds.
    micInput.speech = true;
    await act(async () => { vi.advanceTimersByTime(1_000); });
    micInput.speech = false;
    const recorder = latest();
    recorder.slice();
    await act(async () => { vi.advanceTimersByTime(2_500); });
    recorder.finish();
    await act(async () => { vi.advanceTimersByTime(2_000); });

    expect(submitted).toHaveLength(1);
    expect(submitted[0].reason).toBe("silence");
  });

  it("keeps listening through a short pause after speech starts", async () => {
    await act(async () => { controller.listen("ayah"); });
    micInput.speech = true;
    await act(async () => { vi.advanceTimersByTime(1_000); });
    // A 500ms pause (waqf-like) is shorter than the 700ms short-pause
    // threshold: the turn must not finalize.
    micInput.speech = false;
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(submitted).toHaveLength(0);
    // Speech resumes, then a real end-of-turn silence finalises.
    micInput.speech = true;
    await act(async () => { vi.advanceTimersByTime(1_000); });
    micInput.speech = false;
    const recorder = latest();
    recorder.slice();
    await act(async () => { vi.advanceTimersByTime(2_500); });
    recorder.finish();
    await act(async () => { vi.advanceTimersByTime(2_000); });

    expect(submitted).toHaveLength(1);
    expect(submitted[0].reason).toBe("silence");
  });

  it("does not fail the next turn after playback reopens the mic", async () => {
    await act(async () => { controller.listen("ayah"); });
    // Coach playback: the turn is held (abandoned), then the mic reopens.
    await act(async () => { controller.holdForPlayback("coach"); });
    await act(async () => { controller.releasePlayback(); });
    await act(async () => { controller.listen("ayah"); });
    const recorder = latest();
    expect(recorder.state).toBe("recording");
    // Two seconds of fresh silence: no stale timeout may submit this turn.
    await act(async () => { vi.advanceTimersByTime(2_000); });
    expect(submitted).toHaveLength(0);
    expect(recorder.state).toBe("recording");
  });

  it("still submits a turn where the learner actually spoke", async () => {
    await act(async () => { controller.listen("ayah"); });
    const recorder = latest();

    // 1s of speech: past the 120ms confirm and the 400ms minimum.
    micInput.speech = true;
    await act(async () => { vi.advanceTimersByTime(1_000); });
    // Then silence past the 1.8s end-of-turn: the VAD finalises normally.
    micInput.speech = false;
    recorder.slice();
    await act(async () => { vi.advanceTimersByTime(2_500); });
    recorder.finish();
    await act(async () => { vi.advanceTimersByTime(2_000); });

    expect(submitted).toHaveLength(1);
    expect(submitted[0].reason).toBe("silence");
  });
});
