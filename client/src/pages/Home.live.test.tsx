/**
 * @vitest-environment happy-dom
 *
 * The microphone, the live server, and the interruption — end to end.
 *
 * This is the locked requirement under test: a learner must not have to finish
 * the ayah and stop before the app notices a skipped word. So nothing here is
 * a mock that emits an interruption on cue. The page is the real Study screen,
 * the routes are the **real** `recitation.startLive` and
 * `recitation.ingestLiveAudio` from `server/routers.ts`, called through their
 * real `.strict()` schemas, and the decision to interrupt is made by Codex's
 * tracker applying its own stability rule to transcripts it aligns itself.
 *
 * The only thing stubbed is the network beyond the router: Quran.com's ayah
 * text and the transcription provider. Those are what the server would call,
 * and neither is what these tests are about. Everything between the learner's
 * microphone and the teacher's interruption is production code.
 *
 * What that buys: a test cannot pass by agreeing with an out-of-date idea of
 * the contract, and it cannot pass by the browser deciding a word was missed.
 * The browser sends audio and identifiers; the omission is the server's.
 *
 * It is still not a microphone test. There is no real audio and no real voice
 * anywhere in it — the analyser is fake and the transcripts are chosen by the
 * test. Whether the thresholds and the chunk cadence suit a real learner in a
 * real room is a question for a physical device.
 */
import React, { act } from "react";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../../server/_core/context";
import { resetContinuousTutorStreamsForTests } from "../../../server/continuousTutor";
import { resetRecitationRateLimitForTests } from "../../../server/recitationRateLimit";
import { resetLiveTutorSessionsForTests } from "../../../server/tutorRouter";
import { SUPPORTED_LANGUAGE_CODES } from "@shared/languages";
import { loadLocale } from "@locales/index";
import en from "@locales/en";
import { VOICE_ACTIVITY_DEFAULTS } from "@/lib/voiceActivity";
import { HANDS_FREE_TIMING } from "@/lib/handsFreePlan";

/* ---------------------------------------------------------- the Quran text */

const AYAH_NUMBER = 2;
const AYAH_ARABIC = "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ";
const TARGET = "رَبِّ";
/** Three ayahs, so completing Ayah 2 has somewhere to go — and so the server's
 *  own count of the surah agrees with the page's. */
const SURAH_TEXT = [
  "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
  AYAH_ARABIC,
  "ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
];
const WORD_AUDIO_URL = "https://audio.qurancdn.example/wbw/001_002_003.mp3";

/* -------------------------------------------- the real router, through tRPC */

const routerCalls: { name: string; input: Record<string, unknown> }[] = [];
const callerRef: { current: ReturnType<typeof import("../../../server/routers")["appRouter"]["createCaller"]> | null } = { current: null };

vi.mock("@/lib/trpc", () => {
  const words = "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ".split(" ");
  const ayahs = [
    { number: 1, verseKey: "1:1", arabic: "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ", translation: "In the name of Allah", transliteration: null, audioUrl: "https://audio.example/001001.mp3", wordAudio: [] },
    {
      number: 2, verseKey: "1:2", arabic: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ",
      translation: "All praise is for Allah, Lord of all worlds", transliteration: null,
      audioUrl: "https://audio.example/001002.mp3",
      wordAudio: words.map((arabic, index) => ({ position: index + 1, arabic, url: `https://audio.qurancdn.example/wbw/001_002_00${index + 1}.mp3` })),
    },
    { number: 3, verseKey: "1:3", arabic: "ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ", translation: "the Most Compassionate, Most Merciful", transliteration: null, audioUrl: "https://audio.example/001003.mp3", wordAudio: [] },
  ];
  const surah = { number: 1, nameSimple: "Al-Fatiha", nameArabic: "الفاتحة", versesCount: 3, revelationPlace: "makkah", translatedName: "The Opening" };
  const FAKE_SURAH = { surah, reciterId: 7, translationId: 131, ayahs, wordAudioSource: { provider: "quran.com", kind: "word-file", reciterName: null, matchesSelectedReciter: false } };
  const FAKE_INDEX = {
    surahs: [surah], juzs: [{ number: 30, firstSurah: 78, firstAyah: 1 }],
    reciters: [{ id: 7, name: "Test Reciter", style: null, available: true }],
    translations: [{ id: 131, authorName: "Test Translation", languageName: "english" }],
  };
  const empty = () => ({ data: undefined, isSuccess: false, isLoading: false, isError: false, error: null, refetch: () => {} });
  const ready = (data: unknown) => () => ({ data, isSuccess: true, isLoading: false, isError: false, error: null, refetch: () => {} });
  const noop = () => ({ mutateAsync: async () => undefined, mutate: () => {}, isPending: false, reset: () => {} });

  /**
   * Every tutor and recitation call goes to the real router.
   *
   * Not a stand-in for it: the same procedures the deployed server exposes,
   * with the same input schemas and the same process-local stores, so a payload
   * these tests send is accepted or rejected for exactly the reason production
   * would accept or reject it.
   */
  const live = (name: string) => () => ({
    isPending: false,
    reset: () => {},
    mutate: () => {},
    mutateAsync: async (input: Record<string, unknown>) => {
      routerCalls.push({ name, input });
      const caller = callerRef.current;
      if (!caller) throw new Error("no router caller");
      const [group, procedure] = name.split(".") as ["tutor" | "recitation", string];
      const out = await (caller[group] as Record<string, (value: unknown) => Promise<unknown>>)[procedure](input);
      if (name === "recitation.startLive") {
        const answer = out as { stream?: { streamId: string } | null };
        if (answer.stream) (globalThis as { __streamId?: string | null }).__streamId = answer.stream.streamId;
      }
      return out;
    },
  });

  return {
    trpc: {
      quran: { index: { useQuery: ready(FAKE_INDEX) }, surah: { useQuery: ready(FAKE_SURAH) } },
      auth: { me: { useQuery: empty } },
      recitation: {
        evaluate: { useMutation: noop },
        evaluateWithTutor: { useMutation: live("recitation.evaluateWithTutor") },
        ingestChunk: { useMutation: noop },
        startLive: { useMutation: live("recitation.startLive") },
        ingestLiveAudio: { useMutation: live("recitation.ingestLiveAudio") },
      },
      tutor: {
        start: { useMutation: live("tutor.start") },
        turn: { useMutation: live("tutor.turn") },
      },
      learner: {
        syncProgress: { useMutation: noop },
        syncQaidaProgress: { useMutation: noop },
        recordMemorizationAttempt: { useMutation: noop },
        getReviewQueue: { useQuery: empty },
      },
    },
  };
});

import Home from "./Home";
import { LocaleProvider } from "@/contexts/LocaleContext";

/* --------------------------------------------------- the network beyond it */

const originalFetch = global.fetch;
/** Transcripts the stubbed provider will return, in order. */
let transcripts: string[] = [];
const transcribed: string[] = [];

function stubNetwork() {
  global.fetch = vi.fn(async (target: RequestInfo | URL) => {
    const url = typeof target === "string" ? target : target.toString();
    if (url.includes("api.quran.com/api/v4/verses/by_chapter/1?")) {
      return new Response(JSON.stringify({
        verses: SURAH_TEXT.map((arabic, index) => ({
          verse_number: index + 1, verse_key: `1:${index + 1}`, text_uthmani: arabic, translations: [],
        })),
        pagination: { next_page: null },
      }), { status: 200 });
    }
    if (url.includes("/audio/transcriptions")) {
      const text = transcripts.shift() ?? "";
      transcribed.push(text);
      return new Response(JSON.stringify({ task: "transcribe", language: "ar", duration: 1, text, segments: [] }), { status: 200 });
    }
    if (url.includes("/chat/completions")) {
      return new Response(JSON.stringify({
        id: "chatcmpl-live", created: 0, model: "gpt-5-mini",
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ encouragement: "", nextStep: "", spokenGuidance: "" }) }, finish_reason: "stop" }],
      }), { status: 200 });
    }
    throw new Error(`Unexpected request to ${url}`);
  }) as unknown as typeof fetch;
}

function context(): TrpcContext {
  return {
    req: { headers: {}, socket: { remoteAddress: "203.0.113.90" } },
    res: {},
    user: {
      id: 90, openId: "live-user", name: null, email: null, loginMethod: null, role: "user",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
  } as TrpcContext;
}

/* ---------------------------------------------------------- the audio rig */

const played: string[] = [];
const tracks: { stopped: boolean }[] = [];
let inputLevel = 0;
let clock = 0;
/** Interval timers, with their own periods, driven by `pump`. */
const timers = new Map<number, { fn: () => void; period: number; due: number }>();
let nextTimerId = 1;

class FakeAnalyser {
  fftSize = 1024;
  smoothingTimeConstant = 0.6;
  getByteTimeDomainData(buffer: Uint8Array) {
    const amplitude = Math.round(inputLevel * 128);
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] = 128 + (index % 2 === 0 ? amplitude : -amplitude);
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
class FakeAudio {
  src = ""; currentTime = 0; playbackRate = 1; volume = 1;
  error: { code: number } | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play() { played.push(this.src); setTimeout(() => this.onended?.(), 0); return Promise.resolve(); }
  pause() {} load() {} removeAttribute() {}
}

/** Enough bytes per slice that the route's base64 minimum is comfortably met. */
let sliceCounter = 0;
function slice(): Blob {
  sliceCounter += 1;
  // Distinct content per slice, so a cumulative chunk genuinely grows. Identical
  // audio would be caught by the server's own digest as a retry — correctly, and
  // it would make this fixture test nothing.
  return new Blob([`slice-${sliceCounter}-${"x".repeat(64)}`], { type: "audio/webm" });
}

/**
 * A recorder that emits a timeslice on the fake clock, as a real one does.
 *
 * `start(250)` registers itself with the same timer table `pump` drives, so
 * rolling audio accumulates at the rate the hook asked for rather than all
 * arriving at once.
 */
class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported(type: string) { return type === "audio/webm"; }
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private timerId: number | null = null;
  constructor() { FakeRecorder.instances.push(this); }
  start(timeslice?: number) {
    this.state = "recording";
    this.ondataavailable?.({ data: slice() });
    const period = Math.max(1, timeslice ?? 250);
    this.timerId = nextTimerId;
    nextTimerId += 1;
    timers.set(this.timerId, {
      fn: () => { if (this.state === "recording") this.ondataavailable?.({ data: slice() }); },
      period, due: clock + period,
    });
  }
  stop() {
    this.state = "inactive";
    if (this.timerId !== null) { timers.delete(this.timerId); this.timerId = null; }
    // The browser order: one last blob with the tail, then the stop event.
    this.ondataavailable?.({ data: slice() });
    this.onstop?.();
  }
}

const VOICE = 0.25;
const QUIET = 0.001;

/**
 * Advance the fake clock and fire whichever interval timers are due.
 *
 * Each timer keeps its own period, so the analyser's 50ms frames and the
 * rolling-audio cut at `interimChunkMs` fire at their real relative rates
 * rather than together.
 */
async function pump(ms: number, level: number) {
  inputLevel = level;
  const frame = VOICE_ACTIVITY_DEFAULTS.frameMs;
  // Frames are cheap; letting the event loop run is not, and a chunk's round
  // trip through the real router is the expensive part. So frames advance in
  // small batches and the loop is given a turn between batches, which is what
  // lets a chunk request actually reach the server before the next one is cut.
  const batch = 4;
  let sinceFlush = 0;
  for (let elapsed = 0; elapsed < ms; elapsed += frame) {
    clock += frame;
    sinceFlush += 1;
    const flush = sinceFlush >= batch;
    if (flush) sinceFlush = 0;
    await act(async () => {
      for (const timer of Array.from(timers.values())) {
        if (clock < timer.due) continue;
        timer.due = clock + timer.period;
        timer.fn();
      }
      if (flush) await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function until(predicate: () => boolean, budgetMs = 2_500): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    if (predicate()) return true;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
  return predicate();
}

/* --------------------------------------------------------------- harness */

let container: HTMLDivElement;
let root: Root;
let realSetInterval: typeof setInterval;
let realClearInterval: typeof clearInterval;
let realPerformanceNow: () => number;

beforeAll(async () => {
  for (const code of SUPPORTED_LANGUAGE_CODES) await loadLocale(code);
});

async function settle(turns = 6) {
  for (let turn = 0; turn < turns; turn += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  }
}

beforeEach(async () => {
  window.localStorage.clear();
  document.documentElement.dir = "ltr";
  routerCalls.length = 0;
  played.length = 0;
  tracks.length = 0;
  transcribed.length = 0;
  transcripts = [];
  inputLevel = 0;
  clock = 0;
  timers.clear();
  nextTimerId = 1;
  sliceCounter = 0;
  openedStreamId = null;
  (globalThis as { __streamId?: string | null }).__streamId = null;
  FakeRecorder.instances.length = 0;

  resetContinuousTutorStreamsForTests();
  resetLiveTutorSessionsForTests();
  resetRecitationRateLimitForTests();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("QURAN_EVALUATOR_URL", "");
  vi.stubEnv("QURAN_EVALUATOR_API_KEY", "");
  vi.stubEnv("RECITATION_RATE_LIMIT_REDIS_REST_URL", "");
  vi.stubEnv("RECITATION_RATE_LIMIT_REDIS_REST_TOKEN", "");
  stubNetwork();
  const { appRouter } = await import("../../../server/routers");
  callerRef.current = appRouter.createCaller(context());

  realSetInterval = globalThis.setInterval;
  realClearInterval = globalThis.clearInterval;
  realPerformanceNow = performance.now.bind(performance);
  globalThis.setInterval = ((handler: () => void, period?: number) => {
    const id = nextTimerId;
    nextTimerId += 1;
    const every = Math.max(1, period ?? 0);
    timers.set(id, { fn: handler, period: every, due: clock + every });
    return id as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
  globalThis.clearInterval = ((id: number) => { timers.delete(id); }) as typeof clearInterval;
  performance.now = () => realPerformanceNow() + clock;

  (globalThis as { Audio?: unknown }).Audio = FakeAudio;
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  (window as unknown as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  (globalThis as { speechSynthesis?: unknown }).speechSynthesis = {
    speak: (utterance: { onend?: (() => void) | null }) => utterance?.onend?.(),
    cancel: () => {}, getVoices: () => [{ lang: "en-US", name: "Test English" }],
  };
  (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = class {
    voice: unknown = null; lang = ""; rate = 1;
    onend: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor(public text: string) {}
  };
  Object.defineProperty(window, "MediaRecorder", { value: FakeRecorder, configurable: true, writable: true });
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
  for (const method of ["play", "pause", "load"] as const) {
    Object.defineProperty(HTMLMediaElement.prototype, method, {
      configurable: true, writable: true,
      value: function value(this: HTMLMediaElement) {
        if (method === "play") { played.push(this.getAttribute("src") ?? ""); return Promise.resolve(); }
        return undefined;
      },
    });
  }
  window.HTMLElement.prototype.scrollIntoView = () => {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
  performance.now = realPerformanceNow;
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
  callerRef.current = null;
});

async function mount() {
  await act(async () => { root.render(<LocaleProvider><Home /></LocaleProvider>); });
  await settle();
}

const text = () => container.textContent ?? "";
const inState = (state: string) => () => (container.querySelector(".handsfree")?.className ?? "").includes(`is-${state}`);
const stateLine = () => container.querySelector(".handsfree-state")?.textContent ?? "";
const callsTo = (name: string) => routerCalls.filter((call) => call.name === name);
/**
 * The open chunks this test's own component sent.
 *
 * Filtered by stream id because a chunk from the previous test's component can
 * still be in flight when this one starts; the server answers it `lost-stream`,
 * which is correct, and it is not this test's traffic.
 */
const interimChunks = () => {
  const streamId = callsTo("recitation.startLive").length
    ? (routerCalls.find((call) => call.name === "recitation.ingestLiveAudio" && call.input.streamId)?.input.streamId as string | undefined)
    : undefined;
  const mine = callsTo("recitation.ingestLiveAudio").filter((call) => call.input.turnComplete === false);
  const current = currentStreamId();
  return current ? mine.filter((call) => call.input.streamId === current) : mine.filter((call) => call.input.streamId === streamId);
};
/** The stream id the server generated for this test, once one exists. */
let openedStreamId: string | null = null;
const currentStreamId = () => (globalThis as { __streamId?: string | null }).__streamId ?? openedStreamId;


async function click(node: HTMLElement | null | undefined) {
  await act(async () => { node!.click(); });
  await settle();
}

async function openLesson() {
  const tab = Array.from(container.querySelectorAll<HTMLButtonElement>(".mode-tab"))
    .find((node) => (node.textContent ?? "").includes(en.strings["mode.study"]!));
  await click(tab);
  await click(container.querySelectorAll<HTMLButtonElement>(".study-pagination .dot")[AYAH_NUMBER - 1]);
}

async function startLiveTutor() {
  await click(container.querySelector<HTMLButtonElement>(".handsfree-begin"));
  await until(() => inState("learner-listening")() || inState("learner-speaking")());
}

/** The learner recites for this long, then stops until the turn is answered. */
async function reciteAndStop(speechMs = 4_500) {
  await pump(speechMs, VOICE);
  await pump(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 300, QUIET);
  await until(() => inState("learner-listening")() || inState("learner-speaking")() || inState("waiting")());
}

/* ------------------------------------------------- 1: the stream is real */

describe("the hands-free session opens a real live stream", () => {
  it("binds a server-generated stream to the trusted lesson", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();

    const [opened] = callsTo("recitation.startLive");
    expect(opened).toBeTruthy();
    // Reference only. The browser names the lesson; the server owns it.
    expect(Object.keys(opened.input)).toEqual(["session"]);
    expect(Object.keys(opened.input.session as object).sort()).toEqual(["revision", "sessionId"]);
  });

  it("sends the stream id the server generated, never one of its own", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();
    await pump(HANDS_FREE_TIMING.interimChunkMs * 2, VOICE);
    await until(() => interimChunks().length > 0);

    const streamIds = Array.from(new Set(interimChunks().map((call) => String(call.input.streamId))));
    expect(streamIds).toHaveLength(1);
    expect(streamIds[0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

/* --------------------------------------- 2: rolling audio, before silence */

describe("rolling audio reaches the server while the learner is still reciting", () => {
  it("sends several ordered chunks before any silence", async () => {
    transcripts = ["الحمد", "الحمد لله", "الحمد لله ال"];
    await mount();
    await openLesson();
    await startLiveTutor();

    // Four and a half seconds of recitation, and not a moment of silence.
    await pump(4_500, VOICE);
    await until(() => interimChunks().length >= 3);

    const chunks = interimChunks();
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    // Strictly increasing, exactly as the server's one-in-flight reservation
    // requires. Nothing was sent concurrently.
    const sequences = chunks.map((call) => call.input.sequence as number);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(new Set(sequences).size).toBe(sequences.length);
    // Still the learner's turn: nothing has been finalised.
    expect(callsTo("recitation.evaluateWithTutor")).toHaveLength(0);
    expect(inState("learner-speaking")()).toBe(true);
  });

  it("sends audio and identifiers, and nothing about the Quran", async () => {
    transcripts = ["الحمد", "الحمد لله"];
    await mount();
    await openLesson();
    await startLiveTutor();
    await pump(HANDS_FREE_TIMING.interimChunkMs * 2, VOICE);
    await until(() => interimChunks().length > 0);

    const sent = interimChunks()[0].input;
    expect(Object.keys(sent).sort()).toEqual([
      "attemptScope", "audioBase64", "captureEndedAtMs", "captureStartedAtMs", "chunkId",
      "learningLevel", "mimeType", "sequence", "session", "stability", "streamId",
      "turnComplete", "turnId", "uiLanguage",
    ]);
    for (const forbidden of ["expectedArabic", "expectedWordIndex", "missedWord", "targetWordIndex", "shouldAdvance", "correctionTarget", "transcript", "surah", "ayah"]) {
      expect(sent, forbidden).not.toHaveProperty(forbidden);
    }
    expect(sent.attemptScope).toBe("ayah");
    expect(sent.stability).toBe("interim");
    expect(sent.turnComplete).toBe(false);
  });
});

/* ------------------------------- 3 & 4: one observation is not a correction */

describe("the server decides when an omission is real", () => {
  it("does not interrupt on the first sight of a skipped word", async () => {
    // Word 3 absent, word 4 present, seen once. The tracker can reach
    // `possible-skip` from this and nothing more.
    transcripts = ["الحمد", "الحمد لله", "الحمد لله العالمين"];
    await mount();
    await openLesson();
    await startLiveTutor();
    await pump(HANDS_FREE_TIMING.interimChunkMs * 3 + 200, VOICE);
    await until(() => interimChunks().length >= 3);

    // The learner is still reciting, undisturbed, and nothing on the screen
    // says anything about a word.
    expect(inState("learner-speaking")()).toBe(true);
    expect(container.querySelector(".tutor-target")).toBeNull();
    expect(text()).not.toContain(en.strings["tutor.wordMissed"]);
  });

  it("interrupts mid-ayah once the omission is stable", async () => {
    // The same absence twice running. That is the server's rule, applied by
    // the server: two consecutive ordered observations of the target missing
    // with a later word aligned after it.
    transcripts = ["الحمد", "الحمد لله", "الحمد لله العالمين", "الحمد لله العالمين"];
    await mount();
    await openLesson();
    await startLiveTutor();

    await pump(HANDS_FREE_TIMING.interimChunkMs * 4 + 400, VOICE);
    // No silence has happened. The learner is still going.
    await until(() => played.includes(WORD_AUDIO_URL));

    // Capture stopped on the server's word, not on a pause, and the teaching
    // sequence started: the trusted recording of رَبِّ played.
    expect(played).toContain(WORD_AUDIO_URL);
    expect(await until(() => text().includes(TARGET))).toBe(true);
    // The partial turn was never submitted: asking the evaluator about speech
    // the server has already ruled on could produce a second, different answer.
    expect(callsTo("recitation.evaluateWithTutor")).toHaveLength(0);
  });

  it("re-opens the microphone for the one word, by itself", async () => {
    transcripts = ["الحمد", "الحمد لله", "الحمد لله العالمين", "الحمد لله العالمين"];
    await mount();
    await openLesson();
    await startLiveTutor();
    await pump(HANDS_FREE_TIMING.interimChunkMs * 4 + 400, VOICE);

    expect(await until(() => inState("learner-listening")())).toBe(true);
    expect(text()).toContain(en.strings["handsfree.scopeWord"]);
    // No press was needed anywhere in that.
    expect(container.querySelectorAll(".tutor-control")).toHaveLength(0);
  });
});

/* ---------------------------- 5 & 6: what the interruption must not allow */

describe("an interrupted turn is over", () => {
  it("submits nothing when the detector reports silence afterwards", async () => {
    transcripts = ["الحمد", "الحمد لله", "الحمد لله العالمين", "الحمد لله العالمين"];
    await mount();
    await openLesson();
    await startLiveTutor();
    await pump(HANDS_FREE_TIMING.interimChunkMs * 4 + 400, VOICE);
    await until(() => played.includes(WORD_AUDIO_URL));

    const before = callsTo("recitation.evaluateWithTutor").length;
    // The frames the detector still had queued behind the interruption,
    // arriving as "the learner has stopped".
    await pump(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 600, QUIET);
    await settle(4);

    expect(callsTo("recitation.evaluateWithTutor")).toHaveLength(before);
  });

  it("stops streaming rolling audio while the correction is running", async () => {
    transcripts = ["الحمد", "الحمد لله", "الحمد لله العالمين", "الحمد لله العالمين"];
    await mount();
    await openLesson();
    await startLiveTutor();
    await pump(HANDS_FREE_TIMING.interimChunkMs * 4 + 400, VOICE);
    await until(() => played.includes(WORD_AUDIO_URL));
    await until(() => inState("learner-listening")());

    const before = interimChunks().length;
    // The learner is answering with the one word. The live route refuses an
    // open chunk during a correction, so the browser does not send one.
    await pump(HANDS_FREE_TIMING.interimChunkMs * 3, VOICE);
    expect(interimChunks()).toHaveLength(before);
  });
});

/* ------------------------------------- 10: a retry cannot correct twice */

describe("a repeated chunk cannot produce a second interruption", () => {
  it("keeps one correction however many times the same audio arrives", async () => {
    transcripts = [
      "الحمد", "الحمد لله", "الحمد لله العالمين", "الحمد لله العالمين",
      "الحمد لله العالمين", "الحمد لله العالمين",
    ];
    await mount();
    await openLesson();
    await startLiveTutor();
    await pump(HANDS_FREE_TIMING.interimChunkMs * 4 + 400, VOICE);
    await until(() => played.includes(WORD_AUDIO_URL));

    const target = container.querySelectorAll(".tutor-target");
    expect(target).toHaveLength(1);

    // Whatever else arrives, the lesson holds one correction on one word.
    await pump(HANDS_FREE_TIMING.interimChunkMs * 3, VOICE);
    await settle(4);
    expect(container.querySelectorAll(".tutor-target")).toHaveLength(1);
    expect(container.querySelector(".tutor-target p")?.textContent).toBe(TARGET);
  });
});

/* ------------------------------------------------- 11: failing closed */

describe("a lesson the server no longer has", () => {
  it("stops everything rather than inventing a correction", async () => {
    transcripts = ["الحمد", "الحمد لله"];
    await mount();
    await openLesson();
    await startLiveTutor();
    await pump(HANDS_FREE_TIMING.interimChunkMs * 2, VOICE);
    await until(() => interimChunks().length > 0);

    // The process-local session and stream are gone — a serverless instance was
    // recycled mid-lesson.
    resetLiveTutorSessionsForTests();
    resetContinuousTutorStreamsForTests();

    // The next rolling chunk is answered `lost-stream`, and the browser stops
    // streaming rather than talking to a stream nobody holds.
    await pump(HANDS_FREE_TIMING.interimChunkMs + 200, VOICE);
    const afterLoss = interimChunks().length;
    await pump(HANDS_FREE_TIMING.interimChunkMs * 2, VOICE);
    expect(interimChunks()).toHaveLength(afterLoss);

    // The learner finishes their turn. The trusted route has no lesson to apply
    // it to, so nothing is applied and the tutor reports the loss.
    await pump(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 200, QUIET);
    expect(await until(() => inState("session-lost")(), 3_000)).toBe(true);
    expect(stateLine()).toContain(en.strings["handsfree.stateReconnect"]);
    expect(container.querySelector(".handsfree-lost")).toBeTruthy();

    // The Quran did not move and nothing was marked complete.
    expect(container.querySelector(".study-index")?.textContent).toBe("02");
    expect(container.querySelector(".tutor-target")).toBeNull();
  });
});

/* ------------------- 7, 8, 9: the correction, through the real server */

describe("the correction runs to completion on the real routes", () => {
  it("takes the word as a completed turn, then the ayah, then moves", async () => {
    transcripts = [
      // Rolling audio: the learner skips رَبِّ, and the tracker sees it twice.
      "الحمد", "الحمد لله", "الحمد لله العالمين", "الحمد لله العالمين",
      // The learner says the word the teacher asked for.
      "ربي",
      // And then the whole ayah, correctly.
      "الحمد لله رب العالمين",
    ];
    await mount();
    await openLesson();
    await startLiveTutor();

    await pump(HANDS_FREE_TIMING.interimChunkMs * 4 + 400, VOICE);
    expect(await until(() => played.includes(WORD_AUDIO_URL))).toBe(true);
    expect(await until(() => inState("learner-listening")())).toBe(true);

    // The learner answers with the one word. A focused attempt is never
    // streamed: the live contract requires it to be a completed turn, and half
    // of a one-word answer is not an answer.
    await pump(900, VOICE);
    await pump(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 300, QUIET);
    expect(await until(() => callsTo("recitation.evaluateWithTutor").length >= 1)).toBe(true);
    expect(interimChunks().every((call) => call.input.attemptScope === "ayah")).toBe(true);

    const wordAttempt = callsTo("recitation.evaluateWithTutor")[0];
    expect(wordAttempt).toBeTruthy();
    expect((wordAttempt.input.attempt as { attemptScope: string }).attemptScope).toBe("word");
    // The teacher heard it and asked for the whole ayah, and the microphone
    // came back for that — with no press anywhere in between.
    expect(await until(() => inState("learner-listening")())).toBe(true);
    expect(text()).toContain(en.strings["handsfree.scopeAyah"]);
    expect(container.querySelectorAll(".tutor-control")).toHaveLength(0);

    // The learner recites the whole ayah.
    await pump(2_000, VOICE);
    await pump(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 300, QUIET);
    expect(await until(() => callsTo("recitation.evaluateWithTutor").length >= 2)).toBe(true);

    const scopes = callsTo("recitation.evaluateWithTutor")
      .map((call) => (call.input.attempt as { attemptScope: string }).attemptScope);
    expect(scopes).toEqual(["word", "ayah"]);
    // The screen moved, and only because the server's own evaluation of the
    // full ayah completed it.
    expect(await until(() => container.querySelector(".study-index")?.textContent === "03")).toBe(true);
  });
});

/* --------------------------------------- 14: the app never records itself */

describe("the app's own audio is never the learner's", () => {
  it("streams nothing while the trusted word is playing", async () => {
    transcripts = ["الحمد", "الحمد لله", "الحمد لله العالمين", "الحمد لله العالمين"];
    await mount();
    await openLesson();
    await startLiveTutor();
    await pump(HANDS_FREE_TIMING.interimChunkMs * 4 + 400, VOICE);
    await until(() => played.includes(WORD_AUDIO_URL));

    const before = interimChunks().length;
    const submitted = callsTo("recitation.evaluateWithTutor").length;
    // A loud room while the app is the thing making the noise — which is what
    // a phone speaker playing رَبِّ into an open microphone looks like.
    await pump(900, VOICE);
    expect(interimChunks()).toHaveLength(before);
    expect(callsTo("recitation.evaluateWithTutor")).toHaveLength(submitted);
  });
});
