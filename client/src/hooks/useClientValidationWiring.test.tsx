/**
 * @vitest-environment happy-dom
 *
 * Wave 0: the client validation capture is wired into the real live Tutor
 * flow. With a staff validation run active (`?validation=1&validationRunId=…`),
 * the existing `createClientValidationLog` observes the real playback and
 * microphone transitions through the hooks' additive `onInstrument`
 * channels — no new validation system, no behavior change.
 *
 * The first test below is the gap proof: before the wiring, the orchestrator
 * emitted nothing at all for trusted Qari playback steps, so a validation
 * run recorded no client-side playback intervals and ECHO-01 had no client
 * evidence. The rest pin the seven required properties:
 *
 * 1. live Tutor playback is recorded by validation capture
 * 2. mic/listening resume is recorded
 * 3. events carry the active validation run
 * 4. ordinary non-validation sessions are unaffected
 * 5. no Quran text, transcripts, audio, or PII enter the validation log
 * 6. playback evidence cannot itself mutate Quran state
 * 7. the resulting evidence is sufficient for ECHO-01 analysis
 */
import React, { act } from "react";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTutorPlaybackOrchestrator, type TutorPlaybackInput } from "./useTutorPlaybackOrchestrator";
import { useClientValidationWiring, type ClientValidationWiring } from "./useClientValidationWiring";
import { createClientValidationLog, extractPlaybackIntervals } from "@/lib/validationCapture";
import { HANDS_FREE_TIMING, type HandsFreePlan } from "@/lib/handsFreePlan";

const RUN_ID = "run_aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_RUN_ID = "run_bbbbbbbbbbbbbbbbbbbbbbbb";

function setUrl(search: string) {
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(
    `http://localhost/${search}`,
  );
}

/** A recording that ends when the test says so. */
class FakeAudio {
  static instances: FakeAudio[] = [];
  src = "";
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { FakeAudio.instances.push(this); }
  play() {
    return fakePlayBehavior === "hang"
      ? new Promise<void>(() => {})
      : Promise.resolve();
  }
  pause() {}
  removeAttribute() {}
  load() {}
  finish() { this.onended?.(); }
}

/** What the next `play()` call does: starts, or never settles (the give-up). */
let fakePlayBehavior: "start" | "hang" = "start";

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
    holdForPlayback: () => {},
    releasePlayback: () => {},
    listen: () => {},
    enabled: true,
    ...overrides,
  };
}

async function renderProbe(probe: () => React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root?.render(probe()); });
}

/** Mount the real wiring hook and return it for direct assertions. */
async function mountWiring(): Promise<ClientValidationWiring> {
  const holder: { wiring: ClientValidationWiring | null } = { wiring: null };
  function Probe() {
    holder.wiring = useClientValidationWiring();
    return null;
  }
  await renderProbe(() => <Probe />);
  if (!holder.wiring) throw new Error("wiring hook did not mount");
  return holder.wiring;
}

/** Mount the real wiring + the real orchestrator, performing `plan`. */
async function mountWiredOrchestrator(plan: HandsFreePlan) {
  const holder: { wiring: ClientValidationWiring | null } = { wiring: null };
  function Probe() {
    holder.wiring = useClientValidationWiring();
    useTutorPlaybackOrchestrator(baseInput({ plan, onInstrument: holder.wiring?.instrumentPlayback }));
    return null;
  }
  await renderProbe(() => <Probe />);
  if (!holder.wiring) throw new Error("wiring hook did not mount");
  return holder.wiring;
}

async function finishQariStepAndResume() {
  const audio = FakeAudio.instances[0];
  expect(audio, "a trusted recording should have been played").toBeDefined();
  await act(async () => { audio.finish(); });
  await act(async () => { /* let the plan loop continue */ });
  await act(async () => {
    vi.advanceTimersByTime(HANDS_FREE_TIMING.resumeDelayMs + 50);
  });
  await act(async () => { /* flush the listen() continuation */ });
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeAudio.instances.length = 0;
  fakePlayBehavior = "start";
  (globalThis as { Audio?: unknown }).Audio = FakeAudio;
  localStorage.clear();
  delete (window as unknown as { __quranValidationLog?: unknown }).__quranValidationLog;
  setUrl("");
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  if (container) { container.remove(); container = null; }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ------------------------------------------------- 1. playback recorded */

describe("live Tutor playback is recorded by validation capture", () => {
  it("records the trusted Qari playback interval end-to-end through the real wiring and orchestrator", async () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    const wiring = await mountWiredOrchestrator({
      key: "wired#qari",
      steps: [{ kind: "qari-ayah" }],
      resume: "ayah",
      terminal: false,
    });
    await finishQariStepAndResume();

    const log = wiring.log;
    expect(log, "a validation log must exist during a run").not.toBeNull();
    const types = log!.events.map((event) => event.type);
    expect(types).toContain("playback.started");
    expect(types).toContain("playback.ended");
    const started = log!.events.find((event) => event.type === "playback.started");
    expect(started?.details).toMatchObject({ playbackSource: "qari" });
    expect(started?.runId).toBe(RUN_ID);
    expect(log!.events.every((event) => event.runId === RUN_ID)).toBe(true);
  });

  it("records a tutor-voice interval for a spoken coach step, without forwarding the message key", async () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    const wiring = await mountWiring();
    wiring.instrumentPlayback?.("tts.step", {
      key: "tutor.tryAgain",
      spoken: true,
      resolvedBy: "onend",
      audibleMs: 1200,
    });

    const intervals = extractPlaybackIntervals(wiring.log!.events);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]?.source).toBe("tutor");
    const detailsJson = JSON.stringify(wiring.log!.events.map((event) => event.details));
    expect(detailsJson).not.toContain("tutor.tryAgain");
  });

  it("records no interval for a shown-only coach step — silence is not playback", async () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    const wiring = await mountWiring();
    wiring.instrumentPlayback?.("tts.step", {
      key: "tutor.tryAgain",
      spoken: false,
      resolvedBy: "display",
      audibleMs: 2500,
    });

    expect(extractPlaybackIntervals(wiring.log!.events)).toHaveLength(0);
    const trace = wiring.log!.events.find((event) => event.type === "client.event");
    expect(trace?.details).toMatchObject({ kind: "tts.step", audibleMs: 0 });
  });

  it("records no interval for a trusted recording that never became audible", async () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    const wiring = await mountWiring();
    wiring.instrumentPlayback?.("qari.step", {
      kind: "qari-ayah",
      audible: false,
      audibleMs: HANDS_FREE_TIMING.playbackTimeoutMs,
    });

    expect(extractPlaybackIntervals(wiring.log!.events)).toHaveLength(0);
    const trace = wiring.log!.events.find((event) => event.type === "client.event");
    expect(trace?.details).toMatchObject({ kind: "qari.step", audibleMs: 0 });
  });

  it("the orchestrator marks a give-up qari step as not audible", async () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    fakePlayBehavior = "hang";
    const seen: Array<{ kind: string; details: Record<string, unknown> }> = [];
    function Probe() {
      useTutorPlaybackOrchestrator(baseInput({
        plan: { key: "wired#giveup", steps: [{ kind: "qari-ayah" }], resume: "ayah", terminal: false },
        onInstrument: (kind, details) => { seen.push({ kind, details }); },
      }));
      return null;
    }
    await renderProbe(() => <Probe />);
    await act(async () => {
      vi.advanceTimersByTime(HANDS_FREE_TIMING.playbackTimeoutMs + 50);
    });
    await act(async () => {
      vi.advanceTimersByTime(HANDS_FREE_TIMING.resumeDelayMs + 50);
    });

    const qari = seen.find((event) => event.kind === "qari.step");
    expect(qari, "the orchestrator must emit qari.step even on give-up").toBeDefined();
    expect(qari?.details["audible"]).toBe(false);
  });
});

/* ---------------------------------------------- 2. mic resume recorded */

describe("mic/listening resume is recorded", () => {
  it("records mic.reopened with the resume scope and the gap since playback ended", async () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    const wiring = await mountWiredOrchestrator({
      key: "wired#mic",
      steps: [{ kind: "qari-ayah" }],
      resume: "ayah",
      terminal: false,
    });
    await finishQariStepAndResume();

    const reopened = wiring.log!.events.find((event) => event.type === "mic.reopened");
    expect(reopened).toBeDefined();
    expect(reopened?.details["scope"]).toBe("ayah");
    expect(typeof reopened?.details["msSincePlaybackEnd"]).toBe("number");
    expect(reopened?.runId).toBe(RUN_ID);
  });

  it("maps the live stream's interim.abandoned into a numeric client.event trace", async () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    const wiring = await mountWiring();
    wiring.instrumentLive?.("interim.abandoned", { attempts: 3 });

    const trace = wiring.log!.events.find((event) => event.type === "client.event");
    expect(trace?.details).toMatchObject({ kind: "interim.abandoned", attempts: 3 });
    expect(trace?.runId).toBe(RUN_ID);
  });
});

/* --------------------------------------- 3. events carry the active run */

describe("events carry the active validation run", () => {
  it("keys every event by the runId from the URL and exposes the log for staff export", async () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    const wiring = await mountWiredOrchestrator({
      key: "wired#run",
      steps: [{ kind: "qari-ayah" }],
      resume: "ayah",
      terminal: false,
    });
    await finishQariStepAndResume();

    expect(wiring.log!.events.length).toBeGreaterThan(0);
    expect(wiring.log!.events.every((event) => event.runId === RUN_ID)).toBe(true);
    expect(
      (window as unknown as { __quranValidationLog?: unknown }).__quranValidationLog,
    ).toBe(wiring.log);
    // Device inventory is recorded once, flagged as a validation run.
    const device = wiring.log!.events.find((event) => event.type === "device.metadata");
    expect(device?.details["validationMode"]).toBe(true);
    expect(device?.runId).toBe(RUN_ID);
  });

  it("a different runId starts a different log", async () => {
    setUrl(`?validation=1&validationRunId=${OTHER_RUN_ID}`);
    const wiring = await mountWiring();
    expect(wiring.log!.events.every((event) => event.runId === OTHER_RUN_ID)).toBe(true);
  });

  it("a malformed runId fails safe: no log, no callbacks", async () => {
    setUrl("?validation=1&validationRunId=not-a-run-id");
    const wiring = await mountWiring();
    expect(wiring.log).toBeNull();
    expect(wiring.instrumentPlayback).toBeUndefined();
    expect(wiring.instrumentLive).toBeUndefined();
  });
});

/* --------------------------------- 4. non-validation sessions unaffected */

describe("ordinary non-validation sessions are unaffected", () => {
  it("returns nulls and undefineds with no validation query params", async () => {
    const wiring = await mountWiring();
    expect(wiring.log).toBeNull();
    expect(wiring.instrumentPlayback).toBeUndefined();
    expect(wiring.instrumentLive).toBeUndefined();
    expect(
      (window as unknown as { __quranValidationLog?: unknown }).__quranValidationLog,
    ).toBeUndefined();
  });

  it("the orchestrator performs a plan identically with onInstrument unset", async () => {
    const listened: string[] = [];
    function Probe() {
      useTutorPlaybackOrchestrator(baseInput({
        plan: { key: "plain#qari", steps: [{ kind: "qari-ayah" }], resume: "ayah", terminal: false },
        listen: (scope) => { listened.push(scope); },
      }));
      return null;
    }
    await renderProbe(() => <Probe />);
    await finishQariStepAndResume();
    expect(listened).toEqual(["ayah"]);
  });
});

/* --------------------------------- 5. no Quran text, transcripts, audio, PII */

describe("no Quran text, transcripts, audio, or PII enter the validation log", () => {
  it("playback/mic/instrumentation details carry only enums, numbers, and timestamps", async () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    const wiring = await mountWiredOrchestrator({
      key: "wired#clean",
      steps: [{ kind: "qari-ayah" }],
      resume: "ayah",
      terminal: false,
    });
    wiring.instrumentPlayback?.("tts.step", {
      key: "tutor.tryAgain",
      spoken: true,
      resolvedBy: "onend",
      audibleMs: 900,
    });
    wiring.instrumentLive?.("interim.abandoned", { attempts: 3 });
    await finishQariStepAndResume();

    const allowedStrings = new Set([
      "tutor",
      "qari",
      "word",
      "ayah",
      // numeric-trace instrumentation kinds, never intervals
      "tts.step",
      "qari.step",
      "interim.abandoned",
    ]);
    const arabic = /[\u0600-\u06FF]/;
    for (const event of wiring.log!.events) {
      if (event.type === "device.metadata") continue; // existing sanitized inventory, covered by its own tests
      for (const [name, value] of Object.entries(event.details)) {
        expect(name).not.toMatch(/key|text|transcript|audio|quran/i);
        if (typeof value === "string") {
          // Timestamps are ISO strings; everything else must be a known enum.
          const isTimestamp = !Number.isNaN(Date.parse(value));
          expect(allowedStrings.has(value) || isTimestamp, `unexpected string detail ${name}=${value}`).toBe(true);
          expect(arabic.test(value)).toBe(false);
        } else {
          expect(typeof value === "number" || typeof value === "boolean" || value === null).toBe(true);
        }
      }
    }
  });
});

/* ------------------------- 6. playback evidence cannot mutate Quran state */

describe("playback evidence cannot itself mutate Quran state", () => {
  it("instrumenting playback and mic transitions performs no network calls", async () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const wiring = await mountWiredOrchestrator({
      key: "wired#quiet",
      steps: [{ kind: "qari-ayah" }],
      resume: "ayah",
      terminal: false,
    });
    wiring.instrumentPlayback?.("tts.step", { key: "tutor.tryAgain", spoken: true, resolvedBy: "onend", audibleMs: 800 });
    wiring.instrumentPlayback?.("qari.step", { kind: "qari-word", audible: true, audibleMs: 1500 });
    wiring.instrumentPlayback?.("mic.reopened", { scope: "word", msSincePlaybackEnd: 350 });
    wiring.instrumentLive?.("interim.abandoned", { attempts: 2 });
    await finishQariStepAndResume();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("recorded events carry no Quran-state fields", async () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    const wiring = await mountWiring();
    wiring.instrumentPlayback?.("qari.step", { kind: "qari-ayah", audible: true, audibleMs: 2000 });
    wiring.instrumentPlayback?.("mic.reopened", { scope: "ayah", msSincePlaybackEnd: 400 });

    const names = wiring.log!.events.flatMap((event) => Object.keys(event.details));
    for (const name of names) {
      expect(name).not.toMatch(/surah|ayahNumber|position|advance|correct|wordIndex|expected/i);
    }
  });
});

/* --------------------------------------- 7. sufficient for ECHO-01 analysis */

describe("the resulting evidence is sufficient for ECHO-01 analysis", () => {
  it("reconstructs well-formed playback intervals joined to the run", async () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    const wiring = await mountWiredOrchestrator({
      key: "wired#echo",
      steps: [{ kind: "qari-ayah" }],
      resume: "ayah",
      terminal: false,
    });
    await finishQariStepAndResume();

    const intervals = extractPlaybackIntervals(wiring.log!.events);
    expect(intervals).toHaveLength(1);
    const [interval] = intervals;
    expect(interval?.source).toBe("qari");
    expect(new Date(interval!.startedAt).getTime()).toBeLessThanOrEqual(
      new Date(interval!.endedAt).getTime(),
    );
    expect(interval!.startSeq).toBeLessThan(interval!.endSeq);

    // The mic reopened after the playback interval ended: the ECHO-01
    // ordering the analysis depends on.
    const reopened = wiring.log!.events.find((event) => event.type === "mic.reopened");
    expect(new Date(reopened!.t).getTime()).toBeGreaterThanOrEqual(
      new Date(interval!.endedAt).getTime(),
    );
  });

  it("flags learner evidence inside a playback interval and clears evidence outside it", () => {
    const log = createClientValidationLog({ runId: RUN_ID });
    // A fixed, known interval: no fake-timer arithmetic involved.
    log.recordPlaybackStarted("qari", { t: "2026-09-12T10:00:00.000Z" });
    log.recordPlaybackEnded("qari", { t: "2026-09-12T10:00:05.000Z" });
    const intervals = extractPlaybackIntervals(log.events);
    expect(intervals).toHaveLength(1);

    const duringPlayback = (iso: string): boolean => {
      const t = new Date(iso).getTime();
      return intervals.some(
        (interval) =>
          t >= new Date(interval.startedAt).getTime() && t <= new Date(interval.endedAt).getTime(),
      );
    };
    // A learner-evidence event stamped inside the interval is caught…
    expect(duringPlayback("2026-09-12T10:00:02.500Z")).toBe(true);
    // …and one after the mic reopened is clear.
    expect(duringPlayback("2026-09-12T10:00:06.000Z")).toBe(false);
  });

  it("drops an unpaired playback start rather than inventing an interval", () => {
    const log = createClientValidationLog({ runId: RUN_ID });
    log.recordPlaybackStarted("qari", { t: "2026-09-12T10:00:00.000Z" });
    expect(extractPlaybackIntervals(log.events)).toHaveLength(0);
  });
});
