/**
 * @vitest-environment happy-dom
 *
 * The microphone must never open over the app's own audio.
 *
 * The orchestrator holds the microphone closed while the teacher speaks or a
 * trusted recording plays, then re-opens it. Two backstops exist for audio
 * that never reports finishing — a recording that plays past
 * `playbackTimeoutMs`, and a synthesiser voice that never fires `onend`. Both
 * resolve the step so the lesson is not stuck forever. The defect these pin:
 * resolving the step is not the same as stopping the audio. Before the fix,
 * the timeout fired, the orchestrator moved on, the microphone re-opened 350ms
 * later — and the recording/utterance kept playing into it. The learner's next
 * turn then contained the app's own audio, transcribed as though the learner
 * had said it: recognition went unreliable right after Tutor speech, and a
 * qari recording of the expected ayah could even align strongly enough to
 * advance the lesson on evidence the learner never produced.
 */
import React, { act } from "react";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTutorPlaybackOrchestrator, type TutorPlaybackInput } from "./useTutorPlaybackOrchestrator";
import { HANDS_FREE_TIMING, type HandsFreePlan } from "@/lib/handsFreePlan";

/* -------------------------------------------------------------- the fakes */

const events: string[] = [];

/**
 * A recording that starts but only ends when the test says so — a long ayah,
 * or a stalled element. `play()` resolves (playback began); `onended` fires
 * only when `finish()` is called.
 */
class NeverEndingAudio {
  static instances: NeverEndingAudio[] = [];
  src = "";
  currentTime = 0;
  paused = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { NeverEndingAudio.instances.push(this); }
  play() {
    this.paused = false;
    events.push("audio-play");
    return playBehavior === "reject" ? Promise.reject(new Error("play failed"))
      : playBehavior === "hang" ? new Promise<void>(() => {})
      : Promise.resolve();
  }
  pause() {
    this.paused = true;
    events.push("audio-pause");
  }
  removeAttribute() { events.push("audio-src-removed"); }
  load() { events.push("audio-load"); }
  finish() { this.paused = true; this.onended?.(); }
}

/** What the next `play()` call does: starts, rejects, or never settles. */
let playBehavior: "start" | "reject" | "hang" = "start";

class FakeUtterance {
  voice: unknown = null;
  lang = "";
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

/** A voice that never reports finishing: `speak` never calls `onend`. */
const silentSynthesis = {
  speak: () => { events.push("synth-speak"); },
  cancel: () => { events.push("synth-cancel"); },
  getVoices: () => [{ lang: "en-US", name: "Test English" }],
};

/* ------------------------------------------------------------------ setup */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function baseInput(overrides: Partial<TutorPlaybackInput> = {}): TutorPlaybackInput {
  return {
    plan: null,
    language: "en",
    muted: false,
    wordAudioUrl: null,
    ayahAudioUrl: "https://example.test/ayah-1-2.mp3",
    translate: (key) => key,
    holdForPlayback: () => { events.push("hold"); },
    releasePlayback: () => { events.push("release"); },
    listen: (scope) => { events.push(`listen:${scope}`); },
    enabled: true,
    ...overrides,
  };
}

function renderOrchestrator(plan: HandsFreePlan) {
  function Probe() {
    useTutorPlaybackOrchestrator(baseInput({ plan }));
    return null;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  return act(async () => {
    root?.render(<Probe />);
  });
}

/** Fire the playback backstop, then the re-open beat, flushing in between. */
async function runPastBackstop() {
  await act(async () => {
    vi.advanceTimersByTime(HANDS_FREE_TIMING.playbackTimeoutMs);
  });
  await act(async () => {
    vi.advanceTimersByTime(HANDS_FREE_TIMING.resumeDelayMs + 50);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  events.length = 0;
  playBehavior = "start";
  NeverEndingAudio.instances.length = 0;
  (globalThis as { Audio?: unknown }).Audio = NeverEndingAudio;
  (globalThis as { speechSynthesis?: unknown }).speechSynthesis = silentSynthesis;
  (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = FakeUtterance;
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

describe("a trusted recording that outlasts the playback backstop", () => {
  it("holds the lesson until the recording finishes — the mic never opens over it", async () => {
    const plan: HandsFreePlan = {
      key: "s1#7",
      steps: [{ kind: "qari-ayah" }],
      resume: "ayah",
      terminal: false,
    };
    await renderOrchestrator(plan);
    // Past the old 8s cap and the re-open beat: a real ayah can be a minute
    // long, and the lesson must wait for it rather than resolve the step while
    // the reciter is still audible.
    await runPastBackstop();

    const audio = NeverEndingAudio.instances[0];
    expect(audio, "a recording should have been played").toBeDefined();
    expect(audio.paused).toBe(false);
    expect(events.filter((event) => event.startsWith("listen:"))).toEqual([]);

    // The recording ends; only then does the microphone re-open.
    await act(async () => { audio.finish(); });
    await act(async () => {
      vi.advanceTimersByTime(HANDS_FREE_TIMING.resumeDelayMs + 50);
    });
    expect(events).toContain("listen:ayah");
  });

  it("gives up on a recording that never starts, and stops it so a late load cannot sound under the open mic", async () => {
    playBehavior = "hang";
    const plan: HandsFreePlan = {
      key: "s1#9",
      steps: [{ kind: "qari-ayah" }],
      resume: "ayah",
      terminal: false,
    };
    await renderOrchestrator(plan);
    await runPastBackstop();

    const audio = NeverEndingAudio.instances[0];
    expect(audio, "a recording should have been attempted").toBeDefined();
    // The step was given up on — but the element was never stopped, so a
    // play() the browser was still deciding could start sounding after the
    // microphone re-opened.
    expect(events).toContain("audio-pause");
    expect(events).toContain("audio-src-removed");
    expect(events).toContain("listen:ayah");
    expect(events.indexOf("audio-pause")).toBeLessThan(events.indexOf("listen:ayah"));
  });
});

describe("a coaching voice that never reports finishing", () => {
  it("cancels the utterance before the microphone re-opens", async () => {
    const plan: HandsFreePlan = {
      key: "s1#8",
      steps: [{ kind: "coach", messageKey: "handsfree.nowYouSayIt", speak: true }],
      resume: "word",
      terminal: false,
    };
    await renderOrchestrator(plan);
    await runPastBackstop();

    // speakCoaching cancels once before speaking; the backstop must cancel
    // again so a still-talking voice cannot speak under the open microphone.
    const cancels = events.filter((event) => event === "synth-cancel").length;
    expect(cancels).toBe(2);
    expect(events).toContain("listen:word");
    const lastCancel = events.lastIndexOf("synth-cancel");
    expect(lastCancel).toBeLessThan(events.indexOf("listen:word"));
  });
});
