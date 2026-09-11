/**
 * @vitest-environment happy-dom
 *
 * The hands-free lesson, end to end, on the ayah it was designed around.
 *
 * The learner presses one button. After that they recite `الحمد لله العالمين`,
 * leaving `رَبِّ` out, and everything else happens on its own: the turn ends on
 * silence, the teacher says one sentence, the trusted recording of the word
 * plays, the teacher asks for it, the microphone re-opens in word scope, the
 * word goes through, the teacher asks for the ayah, the microphone re-opens in
 * ayah scope, the ayah is accepted, and the screen moves to Ayah 3.
 *
 * Every tutor turn in here comes from the real engine in `shared/liveTutor.ts`,
 * reached through the real `tutorRouter` procedures with their real schemas.
 * Nothing in this file decides that a word was missed or heard; the tests feed
 * the engine the evidence a review would produce and let it answer.
 *
 * ## What this is not
 *
 * It is not a microphone test. There is no microphone in this environment and
 * no real voice anywhere in it: the analyser is fake and the levels it reports
 * are chosen by the test. What is established here is that the *rules* hold —
 * silence ends a turn once, an interrupt beats a stale silence event, the app's
 * own audio is never collected, the scope follows the server. Whether the
 * detector's thresholds suit a real learner in a real room is a question for a
 * physical device, and it has not been answered here.
 *
 * The clock is driven rather than waited on. The analyser's frame timer is
 * pumped by the test and `performance.now` moves with it, so "1.8 seconds of
 * silence" is exact and costs nothing.
 */
import React, { act } from "react";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTrustedTutorRecitation,
  getTrustedTutorSession,
  rejectTrustedTutorRecitation,
  resetLiveTutorSessionsForTests,
  tutorRouter,
} from "../../../server/tutorRouter";
import type { VerseFollowingResult } from "@shared/verseFollowing";
import { normalizeForSpeech } from "@/lib/coachSpeechProvider";
import { SUPPORTED_LANGUAGE_CODES, directionFor } from "@shared/languages";
import { loadLocale, type LocaleCode } from "@locales/index";
import en from "@locales/en";
import ps from "@locales/ps";
import faAF from "@locales/fa-AF";
import ur from "@locales/ur";
import ar from "@locales/ar";
import { VOICE_ACTIVITY_DEFAULTS } from "@/lib/voiceActivity";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ------------------------------------------------------- the Quran fixture */

const AYAH_NUMBER = 2;
const AYAH_ARABIC = "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ";
const AYAH_WORDS = AYAH_ARABIC.split(" ");
const TARGET = AYAH_WORDS[2];
const TOTAL_AYAHS = 3;
const WORD_AUDIO_URL = "https://audio.qurancdn.example/wbw/001_002_003.mp3";

const mutationMocks = vi.hoisted(() => ({
  recitationEvaluate: vi.fn(),
  recitationEvaluateWithTutor: vi.fn(),
  recitationIngest: vi.fn(),
  tutorStart: vi.fn(),
  tutorTurn: vi.fn(),
}));

vi.mock("@/lib/trpc", () => {
  const words = "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ".split(" ");
  const ayahs = [
    {
      number: 1, verseKey: "1:1", arabic: "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
      translation: "In the name of Allah", transliteration: null,
      audioUrl: "https://audio.example/001001.mp3", wordAudio: [],
    },
    {
      number: 2, verseKey: "1:2", arabic: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ",
      translation: "All praise is for Allah, Lord of all worlds", transliteration: null,
      audioUrl: "https://audio.example/001002.mp3",
      wordAudio: words.map((arabic, index) => ({
        position: index + 1, arabic, url: `https://audio.qurancdn.example/wbw/001_002_00${index + 1}.mp3`,
      })),
    },
    {
      number: 3, verseKey: "1:3", arabic: "ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
      translation: "the Most Compassionate, Most Merciful", transliteration: null,
      audioUrl: "https://audio.example/001003.mp3", wordAudio: [],
    },
  ];
  const surah = { number: 1, nameSimple: "Al-Fatiha", nameArabic: "الفاتحة", versesCount: 3, revelationPlace: "makkah", translatedName: "The Opening" };
  const FAKE_SURAH = {
    surah, reciterId: 7, translationId: 131, ayahs,
    wordAudioSource: { provider: "quran.com", kind: "word-file", reciterName: null, matchesSelectedReciter: false },
  };
  const FAKE_INDEX = {
    surahs: [surah],
    juzs: [{ number: 30, firstSurah: 78, firstAyah: 1 }],
    reciters: [{ id: 7, name: "Test Reciter", style: null, available: true }],
    translations: [{ id: 131, authorName: "Test Translation", languageName: "english" }],
  };
  const mutation = (mutateAsync = vi.fn(), mutate = vi.fn()) => ({ mutateAsync, mutate, isPending: false, reset: vi.fn() });
  const empty = () => ({ data: undefined, isSuccess: false, isLoading: false, isError: false, error: null, refetch: vi.fn() });
  const ready = (data: unknown) => () => ({ data, isSuccess: true, isLoading: false, isError: false, error: null, refetch: vi.fn() });
  return {
    trpc: {
      quran: { index: { useQuery: ready(FAKE_INDEX) }, surah: { useQuery: ready(FAKE_SURAH) } },
      auth: { me: { useQuery: empty } },
      recitation: {
        evaluate: { useMutation: () => mutation(mutationMocks.recitationEvaluate) },
        evaluateWithTutor: { useMutation: () => mutation(mutationMocks.recitationEvaluateWithTutor) },
        ingestChunk: { useMutation: () => mutation(mutationMocks.recitationIngest) },
      },
      tutor: {
        start: { useMutation: () => mutation(mutationMocks.tutorStart) },
        turn: { useMutation: () => mutation(mutationMocks.tutorTurn) },
      },
      learner: {
        syncProgress: { useMutation: () => mutation(vi.fn(), vi.fn()) },
        syncQaidaProgress: { useMutation: () => mutation(vi.fn(), vi.fn()) },
        recordMemorizationAttempt: { useMutation: () => mutation(vi.fn(), vi.fn()) },
        getReviewQueue: { useQuery: empty },
      },
    },
  };
});

import Home from "./Home";
import { LocaleProvider } from "@/contexts/LocaleContext";

/* ------------------------------------------------------ the fake audio rig */

/** Every recording the app played, in order. */
const played: string[] = [];
/** Every sentence handed to the speech synthesiser. */
const spokenText: string[] = [];
/** Every attempt submitted, with the scope it was submitted under. */
const attempts: string[] = [];
/** Microphone tracks handed out, so a leak is visible. */
const tracks: { stopped: boolean }[] = [];
let getUserMediaCalls = 0;
let permissionDenied = false;

/**
 * The level the fake analyser is reporting.
 *
 * The one dial this test turns. Nothing else about the audio is simulated,
 * because nothing else about it is what the rules depend on.
 */
let inputLevel = 0;
/** The fake monotonic clock, advanced by `pump`. */
let clock = 0;
const frameTimers = new Map<number, () => void>();
let nextTimerId = 1;

class FakeAnalyser {
  fftSize = 1024;
  smoothingTimeConstant = 0.6;
  getByteTimeDomainData(buffer: Uint8Array) {
    // RMS of alternating ±amplitude about the 128 centre line is amplitude/128,
    // so this reports exactly `inputLevel` back to the detector.
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
  play() {
    played.push(this.src);
    // Trusted recordings are short. Ending on the next tick is what lets the
    // sequence carry on to "Now you say it."
    setTimeout(() => this.onended?.(), 0);
    return Promise.resolve();
  }
  pause() {} load() {} removeAttribute() {}
}

/** One recorder per turn. The stream behind them is the same one throughout. */
class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static stream: unknown = null;
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(stream: unknown) {
    FakeRecorder.instances.push(this);
    FakeRecorder.stream = stream;
  }
  static isTypeSupported(type: string) { return type === "audio/webm"; }
  start() {
    this.state = "recording";
    // A slice arrives immediately, as a real recorder started with a timeslice
    // would deliver one.
    this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

const VOICE = 0.25;
const QUIET = 0.001;

/**
 * Advance the fake clock and fire the analyser's frame timer.
 *
 * `performance.now` follows, so the detector sees exactly the timings named
 * here — 1.8 seconds of silence is 1.8 seconds, not "however long the test
 * happened to take".
 */
async function pump(ms: number, level: number) {
  inputLevel = level;
  const frame = VOICE_ACTIVITY_DEFAULTS.frameMs;
  // Every frame of the span in one commit. The detector sees each one
  // separately, which is what matters; React does not need a render between
  // two frames of the same silence.
  await act(async () => {
    for (let elapsed = 0; elapsed < ms; elapsed += frame) {
      clock += frame;
      for (const tick of Array.from(frameTimers.values())) tick();
    }
  });
  await settle(1);
}

/**
 * Wait for something to become true, or give up.
 *
 * The sequence has real beats in it — the pause between the teacher finishing
 * and the microphone opening is a product decision, not a test artefact — so
 * the tests wait for the state they are about to assert rather than for a fixed
 * number of milliseconds. A budget that runs out is a failure in the assertion
 * that follows, with the actual state named.
 */
async function until(predicate: () => boolean, budgetMs = 4_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    if (predicate()) return true;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
  return predicate();
}

/** The class the component carries for one audio state. */
const inState = (state: string) => () => (container.querySelector(".handsfree")?.className ?? "").includes(`is-${state}`);

/** Wait until the microphone is open again and the learner's turn is theirs. */
async function untilListening(budgetMs = 4_000) {
  return until(() => inState("learner-listening")() || inState("learner-speaking")(), budgetMs);
}

/** The learner recites for this long, then stops until the turn ends. */
async function recite(speechMs = 1_200) {
  await pump(speechMs, VOICE);
  await pump(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 300, QUIET);
  // The recording goes to the server, the teacher answers, the sequence plays,
  // and the microphone opens again. All of that is what "the learner recites"
  // costs in a hands-free lesson.
  await untilListening();
}

/* ------------------------------------------------------------- the server */

const tutorCaller = tutorRouter.createCaller({} as never);
/** The lesson the router opened, so a live event can name it. */
let openedSession: { sessionId: string; revision: number } | null = null;

function follow(patch: Partial<VerseFollowingResult> = {}): VerseFollowingResult {
  return {
    currentSurah: 1, currentAyah: AYAH_NUMBER, expectedWordIndex: 3, lastCompletedAyah: null,
    state: "correcting", attemptsOnCurrentAyah: 1, evidence: "partial", shouldAdvance: false,
    nextAyah: AYAH_NUMBER + 1, correctionFocus: { wordIndex: 3, expectedArabic: TARGET, kind: "missing" },
    reason: "mistake_to_correct", totalAyahs: TOTAL_AYAHS, ...patch,
  } as VerseFollowingResult;
}

const review = (patch: Record<string, unknown> = {}) => ({
  reviewStatus: "reviewed", wordReviewAvailable: true, transcript: "الحمد لله العالمين",
  matchedCount: 3, totalWords: 4, score: 75, attemptScope: "ayah", recitationScoreScope: "ayah",
  corrections: [{ expected: TARGET, heard: null, status: "missing", wordIndex: 3 }],
  encouragement: "", nextStep: "", spokenGuidance: "", note: "",
  reviewMessage: null, reviewMessageCode: null,
  quranAwareReview: { status: "not_configured", provider: null, confidence: null, summary: null, findings: [] },
  verseFollowing: follow(),
  correctionSession: {
    surah: 1, ayah: AYAH_NUMBER, targetWordIndex: 3, targetArabic: TARGET,
    stage: "say-word", recognition: "not-recognised",
  },
  focusedWordResult: null,
  ...patch,
});

/** Turn 2: the learner says the word and the server recognises it. */
const wordRecognised = () => review({
  attemptScope: "word", recitationScoreScope: "none", corrections: [], transcript: "ربي",
  correctionSession: { surah: 1, ayah: AYAH_NUMBER, targetWordIndex: 3, targetArabic: TARGET, stage: "recite-ayah", recognition: "recognised" },
  focusedWordResult: { recognition: "recognised", reason: "target_recognised" },
});

/** Turn 3: the whole ayah, correct, so the server completes it. */
const ayahCompleted = () => review({
  corrections: [], transcript: "الحمد لله رب العالمين", matchedCount: 4, score: 100,
  correctionSession: null,
  verseFollowing: follow({
    currentAyah: AYAH_NUMBER + 1, expectedWordIndex: 1, lastCompletedAyah: AYAH_NUMBER,
    state: "following", evidence: "strong", shouldAdvance: true,
    nextAyah: AYAH_NUMBER + 2, correctionFocus: null, reason: "ayah_completed",
  }),
});

/**
 * A hold the evaluator waits on before answering.
 *
 * The mocked server answers instantly, which is exactly what the checking state
 * is not: it is the moment while the teacher is listening back. Holding the
 * answer is the only way to observe that moment at all.
 */
let evaluatorGate: Promise<void> | null = null;
let releaseEvaluator: (() => void) | null = null;
function holdTheEvaluator() {
  evaluatorGate = new Promise((resolve) => { releaseEvaluator = resolve; });
}
function letTheEvaluatorAnswer() {
  releaseEvaluator?.();
  evaluatorGate = null;
  releaseEvaluator = null;
}

type EvaluatorAnswer = (scope: "ayah" | "word") => Record<string, unknown>;
const answerByScope: EvaluatorAnswer = (scope) => (scope === "word" ? wordRecognised() : review());
let evaluatorAnswers: EvaluatorAnswer[] = [];
function evaluatorWillReturn(...answers: EvaluatorAnswer[]) { evaluatorAnswers = answers; }
function nextEvaluatorAnswer(scope: "ayah" | "word") {
  const answer = evaluatorAnswers.length > 1 ? evaluatorAnswers.shift()! : evaluatorAnswers[0] ?? answerByScope;
  return answer(scope);
}

/** The trusted route, assembled the way the real one assembles it. */
async function trustedRecitation(input: {
  session: { sessionId: string; revision: number };
  attempt: { attemptScope: "ayah" | "word" };
}) {
  if (evaluatorGate) await evaluatorGate;
  const lookup = getTrustedTutorSession(input.session);
  if (lookup.status !== "current") return { recitation: null, tutor: lookup.handoff };
  if (input.attempt.attemptScope === "word" && !lookup.session.activeCorrection) {
    return { recitation: null, tutor: rejectTrustedTutorRecitation(input.session) };
  }
  attempts.push(input.attempt.attemptScope);
  const recitation = nextEvaluatorAnswer(input.attempt.attemptScope) as Parameters<typeof applyTrustedTutorRecitation>[1]["result"];
  const tutor = applyTrustedTutorRecitation(input.session, {
    surah: lookup.session.surah,
    ayah: lookup.session.ayah,
    result: { ...recitation, attemptScope: input.attempt.attemptScope },
  });
  return tutor.status === "updated" ? { recitation, tutor } : { recitation: null, tutor };
}

/* --------------------------------------------------------------- the page */

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
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dir = "ltr";
  document.documentElement.lang = "en";
  played.length = 0;
  spokenText.length = 0;
  attempts.length = 0;
  tracks.length = 0;
  getUserMediaCalls = 0;
  permissionDenied = false;
  inputLevel = 0;
  clock = 0;
  frameTimers.clear();
  nextTimerId = 1;
  evaluatorWillReturn(answerByScope);
  letTheEvaluatorAnswer();
  openedSession = null;
  resetLiveTutorSessionsForTests();
  FakeRecorder.instances.length = 0;
  FakeRecorder.stream = null;
  for (const mock of Object.values(mutationMocks)) mock.mockReset();

  mutationMocks.tutorStart.mockImplementation(async (input: never) => {
    const opened = await tutorCaller.start(input);
    openedSession = { sessionId: opened.session.sessionId, revision: opened.session.revision };
    return opened;
  });
  mutationMocks.tutorTurn.mockImplementation((input: never) => tutorCaller.turn(input));
  mutationMocks.recitationEvaluateWithTutor.mockImplementation(trustedRecitation);
  mutationMocks.recitationEvaluate.mockImplementation(async (input: { attemptScope?: string }) => {
    attempts.push(input.attemptScope ?? "ayah");
    return review();
  });

  // Only the analyser's frame timer is taken over; `setTimeout` stays real so
  // promises, the file reader and the sequence's own beats behave normally.
  realSetInterval = globalThis.setInterval;
  realClearInterval = globalThis.clearInterval;
  realPerformanceNow = performance.now.bind(performance);
  if (!process.env.NO_TIMER_PATCH) globalThis.setInterval = ((handler: () => void) => {
    const id = nextTimerId;
    nextTimerId += 1;
    frameTimers.set(id, handler);
    return id as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
  globalThis.clearInterval = ((id: number) => { frameTimers.delete(id); }) as typeof clearInterval;
  // Offset rather than replaced: the clock stays monotonic and still advances
  // in real time, so React's scheduler and the test runner are unaffected, and
  // `pump` adds exactly the milliseconds it says it is adding.
  performance.now = () => realPerformanceNow() + clock;

  (globalThis as { Audio?: unknown }).Audio = FakeAudio;
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  (window as unknown as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  (globalThis as { speechSynthesis?: unknown }).speechSynthesis = {
    speak: (utterance: { text?: string; onend?: (() => void) | null }) => {
      spokenText.push(utterance?.text ?? "");
      utterance?.onend?.();
    },
    cancel: () => {},
    // One English voice installed, which is what the default lesson language
    // asks for.
    getVoices: () => [{ lang: "en-US", name: "Test English" }],
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
        getUserMediaCalls += 1;
        if (permissionDenied) throw new DOMException("denied", "NotAllowedError");
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
});

async function mount() {
  await act(async () => {
    root.render(<LocaleProvider><Home /></LocaleProvider>);
  });
  await settle();
}

const text = () => container.textContent ?? "";
const handsfree = () => container.querySelector(".handsfree");
const stateLine = () => container.querySelector(".handsfree-state")?.textContent ?? "";
const teacherLine = () => container.querySelector(".handsfree-line")?.textContent ?? "";
const tutorControls = () => Array.from(container.querySelectorAll<HTMLButtonElement>(".tutor-control"));

async function click(node: HTMLElement | null | undefined) {
  await act(async () => { node!.click(); });
  await settle();
}

function byText(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    (button.textContent ?? "").includes(label));
}

async function openStudy(label = en.strings["mode.study"]) {
  await click(byText(label!));
}

async function chooseAyah(number: number) {
  await click(container.querySelectorAll<HTMLButtonElement>(".study-pagination .dot")[number - 1]);
}

async function openLesson() {
  await openStudy();
  await chooseAyah(AYAH_NUMBER);
}

/** The only press in the whole lesson. */
async function startLiveTutor() {
  await click(container.querySelector<HTMLButtonElement>(".handsfree-begin"));
  await untilListening();
}

/* ---------------------------------------------------- 1: starting the session */

describe("starting the Live Tutor", () => {
  it("offers one action, and says what the microphone is for", async () => {
    await mount();
    await openLesson();

    expect(handsfree()).toBeTruthy();
    expect(container.querySelector(".handsfree-begin")?.textContent).toContain(en.strings["handsfree.start"]);
    const privacy = container.querySelector(".handsfree-privacy")?.textContent ?? "";
    expect(privacy).toBe(en.strings["handsfree.privacy"]);
    // No claim of listening outside the session, anywhere on the screen.
    expect(privacy.toLowerCase()).toContain("only while this session is running");
  });

  it("asks for the microphone once and keeps it across every turn", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();
    expect(getUserMediaCalls).toBe(1);

    await recite();
    await recite(700);
    await recite();

    // Three turns, three recorders, one stream, and not one further permission
    // prompt. This is the difference between a lesson and a recording form.
    expect(getUserMediaCalls).toBe(1);
    expect(FakeRecorder.instances.length).toBeGreaterThanOrEqual(3);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].stopped).toBe(false);
  });

  it("opens the microphone by itself once the session starts", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();

    expect(stateLine()).toContain(en.strings["handsfree.stateListening"]);
    expect(FakeRecorder.instances).toHaveLength(1);
  });
});

/* ------------------------------------------- 2: the hands-free رَبِّ journey */

describe("the hands-free رَبِّ journey", () => {
  it("runs the whole correction without a single press after Start", async () => {
    evaluatorWillReturn(() => review(), () => wordRecognised(), () => ayahCompleted());
    await mount();
    await openLesson();
    await startLiveTutor();

    // The learner recites `الحمد لله العالمين`, leaving the word out.
    await recite();

    // The server found the omission. The teacher says one sentence, the
    // trusted recording of `رَبِّ` plays, and the teacher asks for it.
    expect(attempts).toEqual(["ayah"]);
    expect(played).toContain(WORD_AUDIO_URL);
    expect(spokenText).toContain(normalizeForSpeech(en.strings["tutor.wordMissed"]));
    expect(spokenText).toContain(normalizeForSpeech(en.strings["handsfree.nowYouSayIt"]));
    // The word was never read by the synthesiser — it was played.
    expect(spokenText.join(" ")).not.toContain(TARGET);
    // And the microphone re-opened by itself, for one word.
    expect(stateLine()).toContain(en.strings["handsfree.stateListening"]);
    expect(text()).toContain(en.strings["handsfree.scopeWord"]);

    // The learner says the word.
    await recite(700);

    expect(attempts).toEqual(["ayah", "word"]);
    expect(spokenText).toContain(normalizeForSpeech(en.strings["tutor.wordRecognised"]));
    expect(spokenText).toContain(normalizeForSpeech(en.strings["tutor.reciteFullAyah"]));
    expect(text()).toContain(en.strings["handsfree.scopeAyah"]);

    // The learner recites the whole ayah.
    await recite();

    expect(attempts).toEqual(["ayah", "word", "ayah"]);
    // Only now does the screen move, and only because the server said so.
    expect(container.querySelector(".study-index")?.textContent).toBe("03");
    expect(spokenText).toContain(normalizeForSpeech(en.strings["handsfree.goodContinue"]));
    // Still listening, on the new ayah.
    expect(stateLine()).toContain(en.strings["handsfree.stateListening"]);
  });

  it("presses nothing: the panel offers no controls while it runs", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();

    // The Done / Try again / Hear the word row is gone. There is nothing to
    // press, so there is nothing offering to be pressed.
    expect(tutorControls()).toHaveLength(0);
    expect(text()).not.toContain(en.strings["tutor.doDone"]);
    await recite();
    expect(tutorControls()).toHaveLength(0);
    expect(text()).not.toContain(en.strings["tutor.doDone"]);
  });

  it("keeps the two controls that stop things, and nothing else", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();

    const controls = Array.from(container.querySelectorAll(".handsfree-control")).map((node) => node.textContent);
    expect(controls).toHaveLength(2);
    expect(controls[0]).toContain(en.strings["handsfree.pause"]);
    expect(controls[1]).toContain(en.strings["handsfree.stop"]);
    // The recovery options exist, and they are folded away.
    const options = container.querySelector<HTMLDetailsElement>("details.handsfree-options");
    expect(options).toBeTruthy();
    expect(options!.open).toBe(false);
  });
});

/* ------------------------------------------------- 3: turn boundary behaviour */

describe("turn boundaries", () => {
  it("does not end a turn on a pause for breath", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();

    await pump(900, VOICE);
    await pump(VOICE_ACTIVITY_DEFAULTS.shortPauseMs + 150, QUIET);
    await settle(2);

    // The pause between `ٱلْحَمْدُ لِلَّهِ` and `رَبِّ ٱلْعَـٰلَمِينَ`. Nothing was
    // submitted and the microphone is still open.
    expect(attempts).toEqual([]);
    await pump(900, VOICE);
    expect(attempts).toEqual([]);
  });

  it("reports the learner speaking, in words", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();

    await pump(600, VOICE);
    expect(stateLine()).toContain(en.strings["handsfree.stateSpeaking"]);
  });

  it("submits a finished turn exactly once, however much silence follows", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();

    await pump(1_200, VOICE);
    await pump(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs * 3, QUIET);
    await settle(14);

    expect(attempts).toEqual(["ayah"]);
  });

  it("shows a brief checking state rather than a report card", async () => {
    holdTheEvaluator();
    await mount();
    await openLesson();
    await startLiveTutor();
    await pump(1_200, VOICE);
    await pump(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 100, QUIET);
    expect(await until(inState("checking"), 2_000)).toBe(true);

    // Between the turn ending and the teacher answering: a quiet state, and
    // nothing else. No score, no percentage, no transcript, no report card.
    expect(text()).not.toMatch(/\d+%/);
    expect(container.querySelector(".heard-transcript")).toBeNull();
    expect(stateLine()).toContain(en.strings["handsfree.stateChecking"]);

    // And it goes away when the teacher answers, rather than being a screen the
    // learner has to get past.
    letTheEvaluatorAnswer();
    await untilListening();
    expect(inState("checking")()).toBe(false);
  });
});

/* -------------------------------------------- 4: the app never records itself */

describe("the app cannot record its own audio", () => {
  it("collects nothing while the trusted word is playing", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();
    await pump(1_200, VOICE);
    await pump(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 100, QUIET);
    await settle(2);

    const before = attempts.length;
    // The word is playing, and the room is loud — which is exactly what a
    // phone speaker playing `رَبِّ` into an open microphone looks like.
    await pump(2_000, VOICE);
    await pump(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 200, QUIET);

    // Nothing was captured from it, so nothing was submitted as the learner's
    // attempt at the word the app had just said.
    expect(attempts.length).toBe(before);
    await settle(14);
  });

  it("names the two states in which the app is the one making sound", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();
    await recite();

    // The sequence has finished by now, but both states are reachable and both
    // are spelled out for a reader rather than shown as a colour.
    expect(en.strings["handsfree.stateTeacher"]).toBeTruthy();
    expect(en.strings["handsfree.stateReciter"]).toBeTruthy();
  });
});

/* --------------------------------------------------- 5: pause, stop, navigate */

describe("stopping", () => {
  it("suspends capture on Pause without marking anything complete", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();
    await pump(800, VOICE);

    await click(byText(en.strings["handsfree.pause"]!));
    expect(stateLine()).toContain(en.strings["handsfree.statePaused"]);

    // A learner stepping away is not an attempt.
    await pump(3_000, VOICE);
    await pump(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 200, QUIET);
    expect(attempts).toEqual([]);
    // And the ayah has not moved.
    expect(container.querySelector(".study-index")?.textContent).toBe("02");
  });

  it("keeps the lesson's place across Pause and Carry on", async () => {
    evaluatorWillReturn(() => review());
    await mount();
    await openLesson();
    await startLiveTutor();
    await recite();

    // Mid-correction: the teacher is holding `رَبِّ`.
    const targetBefore = container.querySelector(".tutor-target p")?.textContent;
    expect(targetBefore).toBe(TARGET);

    await click(byText(en.strings["handsfree.pause"]!));
    await click(byText(en.strings["handsfree.resume"]!));
    await settle(8);

    expect(container.querySelector(".tutor-target p")?.textContent).toBe(TARGET);
    expect(container.querySelector(".study-index")?.textContent).toBe("02");
  });

  it("releases the microphone on Finish", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();
    expect(tracks[0].stopped).toBe(false);

    await click(byText(en.strings["handsfree.stop"]!));

    expect(tracks[0].stopped).toBe(true);
    expect(container.querySelector(".handsfree-begin")).toBeTruthy();
  });

  it("releases the microphone when the learner leaves Study", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();
    expect(tracks[0].stopped).toBe(false);

    const readTab = Array.from(container.querySelectorAll<HTMLButtonElement>(".mode-tab"))
      .find((tab) => (tab.textContent ?? "").includes(en.strings["mode.read"]!));
    await click(readTab);
    await settle(4);

    expect(container.querySelector(".study-layout")).toBeNull();
    expect(tracks[0].stopped).toBe(true);
  });
});

/* ------------------------------------------------------------ 6: fallbacks */

describe("falling back", () => {
  it("puts a refused microphone back on the manual path, and does not call it hands-free", async () => {
    permissionDenied = true;
    await mount();
    await openLesson();
    await startLiveTutor();

    const message = container.querySelector(".handsfree-fallback")?.textContent ?? "";
    expect(message).toBe(en.strings["handsfree.micDenied"]);
    expect(stateLine()).toContain(en.strings["handsfree.stateMicUnavailable"]);
    // Study's own controls are the way forward, and they are there.
    expect(tutorControls().length).toBeGreaterThan(0);
    expect(tracks).toHaveLength(0);
  });

  it("offers nothing at all where the browser cannot analyse audio", async () => {
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;

    await mount();
    await openLesson();

    // Not a disabled promise, and not a "hands-free unavailable" banner for a
    // feature the learner never saw. Study, exactly as it was.
    expect(container.querySelector(".handsfree-begin")).toBeNull();
    expect(tutorControls().length).toBeGreaterThan(0);
    expect(text()).toContain(en.strings["tutor.doStart"]);
  });
});

/* --------------------------------------------------------- 7: five languages */

describe("the lesson teaches in five languages", () => {
  async function chooseLanguage(code: string) {
    await click(container.querySelector<HTMLButtonElement>(".language-trigger"));
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
      (node) => node.getAttribute("lang") === code);
    await click(option);
  }

  const packs: Record<string, Record<string, string | undefined>> = {
    en: en.strings, ps: ps.strings, "fa-AF": faAF.strings, ur: ur.strings, ar: ar.strings,
  };

  it.each(SUPPORTED_LANGUAGE_CODES)("renders the hands-free states in %s", async (code) => {
    await mount();
    await openLesson();
    if (code !== "en") await chooseLanguage(code);

    const strings = packs[code];
    expect(container.querySelector(".handsfree-begin")?.textContent).toContain(strings["handsfree.start"]);
    expect(container.querySelector(".handsfree-privacy")?.textContent).toBe(strings["handsfree.privacy"]);
    expect(handsfree()?.getAttribute("aria-label")).toBe(strings["handsfree.label"]);

    await startLiveTutor();
    expect(stateLine()).toContain(strings["handsfree.stateListening"]);
    expect(Array.from(container.querySelectorAll(".handsfree-control")).map((node) => node.textContent).join(" "))
      .toContain(strings["handsfree.pause"]);
  });

  it.each(SUPPORTED_LANGUAGE_CODES)("keeps the page direction and the Quran's own in %s", async (code) => {
    await mount();
    await openLesson();
    if (code !== "en") await chooseLanguage(code);

    expect(document.documentElement.dir).toBe(directionFor(code as LocaleCode));
    // Whatever the interface is doing, the Quran is Arabic and right-to-left.
    const ayah = container.querySelector(".tutor-ayah p");
    expect(ayah?.getAttribute("lang")).toBe("ar");
    expect(ayah?.getAttribute("dir")).toBe("rtl");
    expect(ayah?.textContent).toBe(AYAH_ARABIC);
  });

  it("shows a coaching sentence it could not speak, rather than reading it in English", async () => {
    await mount();
    await openLesson();
    await chooseLanguage("ps");
    await startLiveTutor();
    await recite();

    // Only an English voice is installed and the lesson is in Pashto, so the
    // teacher's sentence is on the screen and marked as shown. Nothing was read
    // aloud in a language the learner did not choose.
    expect(teacherLine()).toContain(ps.strings["handsfree.nowYouSayIt"]);
    expect(container.querySelector(".handsfree-shown-only")?.textContent).toBe(ps.strings["handsfree.voiceShown"]);
    expect(spokenText).toEqual([]);
    // The trusted recording still played: the Quran is never the thing that
    // goes missing.
    expect(played).toContain(WORD_AUDIO_URL);
  });
});

/* ---------------------------------------------------------- 8: accessibility */

describe("every audio state is readable", () => {
  it("announces the state in a live region rather than by colour", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();

    const status = container.querySelector(".handsfree-state");
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent?.trim()).not.toBe("");
    // The meter carries nothing the sentence does not.
    expect(container.querySelector(".handsfree-meter")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("names the section for a screen reader", async () => {
    await mount();
    await openLesson();
    expect(handsfree()?.getAttribute("aria-label")).toBe(en.strings["handsfree.label"]);
  });
});

/* ------------------------------------- 11: what the browser is allowed to say */

describe("the browser never sends a judgement about the Quran", () => {
  it("sends a session reference and audio, and nothing that names a word", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();
    await recite();

    const [payload] = mutationMocks.recitationEvaluateWithTutor.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(payload).sort()).toEqual(["attempt", "session"]);
    expect(Object.keys(payload.session as object).sort()).toEqual(["revision", "sessionId"]);
    // The attempt carries the recording and how to read it. Not the expected
    // text, not the surah, not the ayah, not the position, not the target.
    const attempt = payload.attempt as Record<string, unknown>;
    for (const forbidden of ["expectedArabic", "surah", "ayah", "position", "correctionTarget", "totalAyahs", "previousAyahArabic", "nextAyahArabic"]) {
      expect(attempt, forbidden).not.toHaveProperty(forbidden);
    }
    expect(attempt.attemptScope).toBe("ayah");
  });
});

/* ------------------------------------------------------------- 12: on a phone */

/**
 * happy-dom has no layout engine, so nothing here can measure a pixel. What it
 * can check is the two things that actually cause a 390px screen to scroll
 * sideways: a row of buttons that has to fit, and a stylesheet with no rule for
 * a narrow viewport. The rendering at 390×844 was looked at separately, and the
 * PR says so rather than implying this test did it.
 */
describe("on a 390px screen", () => {
  const css = readFileSync(join(process.cwd(), "client/src/index.css"), "utf8");

  it("keeps at most two controls on screen at once", async () => {
    await mount();
    await openLesson();
    await startLiveTutor();
    await recite();

    // Two, whatever the lesson is doing. The rest are inside a disclosure.
    expect(container.querySelectorAll(".handsfree-control").length).toBeLessThanOrEqual(2);
    expect(container.querySelectorAll(".tutor-control")).toHaveLength(0);
  });

  it("stacks the recovery options rather than letting them run off the side", () => {
    expect(css).toMatch(/@media \(max-width: 420px\) \{[^}]*\.handsfree \{/);
    expect(css).toMatch(/\.handsfree-option-row \{ flex-direction: column; \}/);
  });

  it("does not carry any state by motion alone", () => {
    // The meter is the only animated thing, it is aria-hidden, and it stops
    // transitioning under reduced motion. Every state is a sentence.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.handsfree-meter \{ transition: none; \} \}/);
  });
});
