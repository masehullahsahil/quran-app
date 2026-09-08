/**
 * @vitest-environment happy-dom
 *
 * The Live Tutor, mounted in the real Study screen.
 *
 * The panel and the conversation layer are tested in isolation (#54); the
 * adapter is tested as data. What is checked here is the thing that was
 * missing: that a learner opening Study actually meets the tutor, that it is
 * the dominant surface rather than one voice among several, and that the
 * للّٰه‑ةwork underneath it — the recorder's scope, the trusted audio, the
 * server's authority over the lesson — is unchanged by putting a teacher in
 * front of it.
 *
 * Every turn in these tests comes from the real engine in `shared/liveTutor.ts`.
 * Nothing here decides that a word was missed or heard: the tests feed the
 * engine the evidence a review would produce and render whatever it says.
 */
// The default import is what the test transform needs: it compiles JSX to
// `React.createElement` (tsconfig sets `jsx: "preserve"`).
import React, { act } from "react";
// React only flushes updates inside `act` when it knows it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyLiveTutorEvent,
  createLiveTutorSession,
  type LiveTutorEvent,
  type LiveTutorTurn,
} from "@shared/liveTutor";
import type { VerseFollowingResult } from "@shared/verseFollowing";
import { SUPPORTED_LANGUAGE_CODES, directionFor } from "@shared/languages";
import { loadLocale, type LocaleCode } from "@locales/index";
import en from "@locales/en";
import ps from "@locales/ps";
import faAF from "@locales/fa-AF";
import ur from "@locales/ur";
import ar from "@locales/ar";

/* ------------------------------------------------------------ the server */

/** Al-Fatiha 1:2 — four words, the third of which the learner leaves out. */
const AYAH_ARABIC = "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ";
const AYAH_WORDS = AYAH_ARABIC.split(" ");
const TARGET = AYAH_WORDS[2];

/**
 * The tutor engine, in the test process.
 *
 * A real session, advanced by the real `applyLiveTutorEvent`, so the states
 * these tests render are the engine's own rather than a fixture's idea of them.
 */
const tutorSessions = new Map<string, LiveTutorTurn>();

const mutationMocks = vi.hoisted(() => ({
  recitationEvaluate: vi.fn(),
  recitationIngest: vi.fn(),
  tutorStart: vi.fn(),
  tutorTurn: vi.fn(),
}));

/** The ayah audio the reciter serves, for the assertions below. */
const AYAH_AUDIO_URL = "https://audio.example/001001.mp3";

vi.mock("@/lib/trpc", () => {
  // Hoisted above the module body, so the fixtures live inside the factory.
  const words = "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ".split(" ");
  const ayahs = [
    {
      number: 1, verseKey: "1:1", arabic: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ",
      translation: "All praise is for Allah, Lord of all worlds", transliteration: null,
      audioUrl: "https://audio.example/001001.mp3",
      wordAudio: words.map((arabic, index) => ({
        position: index + 1, arabic, url: `https://audio.qurancdn.example/wbw/001_001_00${index + 1}.mp3`,
      })),
    },
    {
      number: 2, verseKey: "1:2", arabic: "ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
      translation: "the Most Compassionate, Most Merciful", transliteration: null,
      audioUrl: "https://audio.example/001002.mp3", wordAudio: [],
    },
  ];
  const surah = { number: 1, nameSimple: "Al-Fatiha", nameArabic: "الفاتحة", versesCount: 7, revelationPlace: "makkah", translatedName: "The Opening" };
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

/* ---------------------------------------------------------- the recorder */

const played: string[] = [];
const speechCalls: string[] = [];
/** Every attempt the page submitted, with the scope it submitted it under. */
const attempts: string[] = [];

class FakeAudio {
  src = ""; currentTime = 0; playbackRate = 1; volume = 1;
  error: { code: number } | null = null;
  onended: (() => void) | null = null; onerror: (() => void) | null = null;
  play() { played.push(this.src); return Promise.resolve(); }
  pause() {} load() {} removeAttribute() {}
}

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() { FakeRecorder.instances.push(this); }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  for (const code of SUPPORTED_LANGUAGE_CODES) await loadLocale(code);
});

async function settle(turns = 4) {
  for (let turn = 0; turn < turns; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

function follow(patch: Partial<VerseFollowingResult> = {}): VerseFollowingResult {
  return {
    currentSurah: 1, currentAyah: 1, expectedWordIndex: 3, lastCompletedAyah: null,
    state: "correcting", attemptsOnCurrentAyah: 1, evidence: "partial", shouldAdvance: false,
    nextAyah: 2, correctionFocus: { wordIndex: 3, expectedArabic: TARGET, kind: "missing" },
    reason: "mistake_to_correct", totalAyahs: 7, ...patch,
  } as VerseFollowingResult;
}

/** A review naming the third word, as the recitation service would return it. */
const review = (patch: Record<string, unknown> = {}) => ({
  reviewStatus: "reviewed", wordReviewAvailable: true, transcript: "قل هو احد",
  matchedCount: 3, totalWords: 4, score: 75, recitationScoreScope: "ayah",
  corrections: [{ expected: TARGET, heard: null, status: "missing", wordIndex: 3 }],
  encouragement: "", nextStep: "", spokenGuidance: "", note: "",
  reviewMessage: null, reviewMessageCode: null,
  quranAwareReview: { status: "not_configured", provider: null, confidence: null, summary: null, findings: [] },
  verseFollowing: follow(),
  correctionSession: {
    surah: 1, ayah: 1, targetWordIndex: 3, targetArabic: TARGET,
    stage: "say-word", recognition: "not-recognised",
  },
  focusedWordResult: null,
  ...patch,
});

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dir = "ltr";
  document.documentElement.lang = "en";
  played.length = 0;
  speechCalls.length = 0;
  attempts.length = 0;
  tutorSessions.clear();
  FakeRecorder.instances.length = 0;
  for (const mock of Object.values(mutationMocks)) mock.mockReset();

  // The engine, run for real against a server-owned session.
  mutationMocks.tutorStart.mockImplementation(async (input: Record<string, unknown>) => {
    const turn = createLiveTutorSession({ sessionId: "test-session", ...(input as Record<string, never>) } as Parameters<typeof createLiveTutorSession>[0]);
    tutorSessions.set(turn.session.sessionId, turn);
    return turn;
  });
  mutationMocks.tutorTurn.mockImplementation(async ({ session, event }: { session: { sessionId: string }; event: LiveTutorEvent }) => {
    const held = tutorSessions.get(session.sessionId)!;
    const next = applyLiveTutorEvent(held.session, event);
    if (next.accepted) tutorSessions.set(next.session.sessionId, next);
    return next;
  });
  mutationMocks.recitationEvaluate.mockImplementation(async (input: { attemptScope?: string }) => {
    attempts.push(input.attemptScope ?? "ayah");
    return review();
  });

  (globalThis as { Audio?: unknown }).Audio = FakeAudio;
  (globalThis as { speechSynthesis?: unknown }).speechSynthesis = {
    speak: (utterance: { text?: string }) => speechCalls.push(utterance?.text ?? ""),
    cancel: () => {}, getVoices: () => [],
  };
  Object.defineProperty(window, "MediaRecorder", { value: FakeRecorder, configurable: true, writable: true });
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) },
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
});

async function mount() {
  await act(async () => {
    root.render(
      <LocaleProvider>
        <Home />
      </LocaleProvider>,
    );
  });
  await settle();
}

const text = () => container.textContent ?? "";
const panel = () => container.querySelector(".live-tutor");
const message = () => container.querySelector(".tutor-message");
const controls = () => Array.from(container.querySelectorAll<HTMLButtonElement>(".tutor-control"));
const tutorTarget = () => container.querySelector(".tutor-target");

async function click(node: HTMLElement | null | undefined) {
  await act(async () => {
    node!.click();
  });
  await settle();
}

async function openStudy(label = en.strings["mode.study"]) {
  const tab = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    (button.textContent ?? "").includes(label!),
  );
  await click(tab);
}

async function chooseLanguage(code: string) {
  await click(container.querySelector<HTMLButtonElement>(".language-trigger"));
  const option = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
    (node) => node.getAttribute("lang") === code,
  );
  await click(option);
}

/**
 * One attempt, the way a learner makes it: press the primary control to open
 * the microphone, then Done to close it and let the teacher check.
 */
async function recordThroughTutor() {
  // Whichever control opens the microphone in this state: "Start" at the
  // beginning, "Try again" once the teacher has said something. In a
  // correction the primary control is "Hear the word" — the teacher says
  // listen first — so the recording control is not always the first one.
  const record = controls().find((control) => {
    const label = control.textContent ?? "";
    return label.includes(en.strings["tutor.doStart"]!) || label.includes(en.strings["tutor.doAgain"]!);
  });
  await click(record ?? controls()[0]);
  const done = controls().find((control) => (control.textContent ?? "").includes(en.strings["tutor.doDone"]!));
  await click(done ?? controls()[0]);
}

/* ------------------------------------------------------ 1: it is mounted */

describe("the learner meets the tutor in Study", () => {
  it("mounts the Live Tutor when Study opens", async () => {
    await mount();
    await openStudy();

    expect(panel()).toBeTruthy();
    expect(panel()?.getAttribute("aria-label")).toBe(en.strings["tutor.label"]);
    expect(mutationMocks.tutorStart).toHaveBeenCalledTimes(1);
    // Study opens on the reader's current place — surah 1 by default here.
    expect(mutationMocks.tutorStart.mock.calls[0][0]).toMatchObject({ ayah: 1, mode: "guided-recitation" });
  });

  it("does not mount it on the reading page", async () => {
    await mount();
    expect(panel()).toBeNull();
  });

  it("puts the ayah, one sentence and one action in front of the learner", async () => {
    await mount();
    await openStudy();

    const ayah = panel()!.querySelector(".tutor-ayah p")!;
    expect(ayah.textContent).toBe(AYAH_ARABIC);
    expect(ayah.getAttribute("lang")).toBe("ar");
    expect(ayah.getAttribute("dir")).toBe("rtl");
    expect(message()?.textContent).toBe(en.strings["tutor.ready"]);
    expect(controls()).toHaveLength(1);
    expect(controls()[0].textContent).toContain(en.strings["tutor.doStart"]);
  });

  it("falls back to the old surfaces when the tutor cannot be reached", async () => {
    mutationMocks.tutorStart.mockRejectedValue(new Error("offline"));
    await mount();
    await openStudy();

    expect(panel()).toBeNull();
    // Study still works: the instruction block it had before is there.
    expect(container.querySelector(".teacher-now")).toBeTruthy();
  });
});

/* --------------------------------------- 5: one teacher, not several */

describe("the tutor is the dominant surface", () => {
  it("replaces the competing instruction blocks rather than joining them", async () => {
    await mount();
    await openStudy();

    // Not deleted — these are what Study shows without a tutor. Not shown
    // beside it, saying the same thing in a second voice.
    expect(container.querySelector(".teacher-now")).toBeNull();
    expect(container.querySelector(".study-fix")).toBeNull();
    expect(container.querySelector(".word-lesson")).toBeNull();
    expect(container.querySelector(".loop-message")).toBeNull();
  });

  it("keeps the teacher's notes available but collapsed", async () => {
    await mount();
    await openStudy();

    const notes = container.querySelector<HTMLDetailsElement>("details.teacher-notes");
    expect(notes).toBeTruthy();
    expect(notes!.open).toBe(false);
  });

  it("shows no score or transcript in front of the learner", async () => {
    await mount();
    await openStudy();
    expect(panel()?.textContent).not.toMatch(/\d+%/);
    expect(container.querySelector(".heard-transcript")).toBeNull();
  });
});

/* -------------------------- 2, 3, 4: the states, from the engine's turns */

describe("the lesson runs", () => {
  it("moves through listening and checking while the learner recites", async () => {
    await mount();
    await openStudy();

    await click(controls()[0]);
    expect(message()?.textContent).toBe(en.strings["tutor.listening"]);
    expect(container.querySelector(".tutor-presence")?.textContent).toContain(en.strings["tutor.presenceListening"]);
    // With the microphone open the learner needs one thing: a way to say they
    // have finished. Pausing the lesson is not that, and is not offered here.
    expect(controls().map((control) => control.textContent)).toEqual([
      expect.stringContaining(en.strings["tutor.doDone"]!),
      expect.stringContaining(en.strings["tutor.doFromBeginning"]!),
    ]);
  });

  it("asks for the exact word the engine named", async () => {
    await mount();
    await openStudy();
    await recordThroughTutor();

    expect(message()?.textContent).toBe(en.strings["tutor.wordMissed"]);
    expect(tutorTarget()?.querySelector("p")?.textContent).toBe(TARGET);
    expect(tutorTarget()?.querySelector("p")?.getAttribute("dir")).toBe("rtl");
    expect(tutorTarget()?.className).toContain("is-attention");
    expect(text()).toContain("Word 3 of 4");
  });

  it("stops calling the word a problem once the engine says it heard it", async () => {
    await mount();
    await openStudy();
    await recordThroughTutor();

    // The focused attempt goes through. The engine decides this, not the page.
    mutationMocks.recitationEvaluate.mockImplementation(async (input: { attemptScope?: string }) => {
      attempts.push(input.attemptScope ?? "ayah");
      return review({
        corrections: [],
        correctionSession: { surah: 1, ayah: 1, targetWordIndex: 3, targetArabic: TARGET, stage: "recite-ayah", recognition: "recognised" },
        focusedWordResult: { recognition: "recognised", reason: "target_recognised" },
      });
    });
    await recordThroughTutor();

    expect(message()?.textContent).toBe(en.strings["tutor.wordRecognised"]);
    expect(tutorTarget()?.className).toContain("is-resolved");
    expect(tutorTarget()?.className).not.toContain("is-attention");
    // None of the old unresolved-error language survives alongside it.
    expect(text()).not.toContain(en.strings["lesson.eyebrow"]);
    expect(text()).not.toContain(en.strings["recorder.reviewReady"]);
    expect(text()).not.toContain(en.strings["tutor.wordMissed"]);
  });

  it("makes the full ayah the primary action after the word goes through", async () => {
    await mount();
    await openStudy();
    await recordThroughTutor();
    mutationMocks.recitationEvaluate.mockImplementation(async (input: { attemptScope?: string }) => {
      attempts.push(input.attemptScope ?? "ayah");
      return review({
        corrections: [],
        correctionSession: { surah: 1, ayah: 1, targetWordIndex: 3, targetArabic: TARGET, stage: "recite-ayah", recognition: "recognised" },
        focusedWordResult: { recognition: "recognised", reason: "target_recognised" },
      });
    });
    await recordThroughTutor();

    expect(controls()[0].className).toContain("is-primary");
    expect(controls()[0].textContent).toContain(en.strings["tutor.doAgain"]);
    expect(controls().length).toBeLessThanOrEqual(3);
  });

  it("makes no accusation when the engine could not tell", async () => {
    await mount();
    await openStudy();
    mutationMocks.recitationEvaluate.mockImplementation(async (input: { attemptScope?: string }) => {
      attempts.push(input.attemptScope ?? "ayah");
      return review({
        corrections: [],
        correctionSession: null,
        verseFollowing: follow({ state: "uncertain", reason: "noisy_transcript", evidence: "weak", correctionFocus: null }),
      });
    });
    await recordThroughTutor();

    expect(message()?.textContent).toBe(en.strings["tutor.uncertain"]);
    for (const claim of ["wrong", "incorrect", "mistake", "missed"]) {
      expect(text().toLowerCase(), claim).not.toContain(claim);
    }
  });
});

/* ------------------------------------ 11, 12: the recording scope holds */

describe("a word attempt is never submitted as an ayah attempt", () => {
  it("records the ayah while the engine is listening for one", async () => {
    await mount();
    await openStudy();
    await recordThroughTutor();
    expect(attempts).toEqual(["ayah"]);
  });

  it("records the word once the engine asks for the word", async () => {
    await mount();
    await openStudy();
    await recordThroughTutor();

    // The engine is now holding a target; the next attempt is scoped to it.
    await recordThroughTutor();
    expect(attempts).toEqual(["ayah", "word"]);
  });

  it("returns to the ayah scope when the engine asks for the whole ayah", async () => {
    await mount();
    await openStudy();
    await recordThroughTutor();
    mutationMocks.recitationEvaluate.mockImplementation(async (input: { attemptScope?: string }) => {
      attempts.push(input.attemptScope ?? "ayah");
      return review({
        corrections: [],
        correctionSession: { surah: 1, ayah: 1, targetWordIndex: 3, targetArabic: TARGET, stage: "recite-ayah", recognition: "recognised" },
        focusedWordResult: { recognition: "recognised", reason: "target_recognised" },
      });
    });
    await recordThroughTutor();
    await recordThroughTutor();

    expect(attempts).toEqual(["ayah", "word", "ayah"]);
  });
});

/* ------------------------------------------ 14, 15: the audio boundary */

describe("hearing the word", () => {
  it("plays the trusted recording of that exact word", async () => {
    await mount();
    await openStudy();
    await recordThroughTutor();

    played.length = 0;
    const hear = controls().find((control) => (control.textContent ?? "").includes(en.strings["tutor.doHearWord"]!));
    await click(hear);

    // Surah, ayah and word index all match the target the engine named.
    expect(played).toEqual(["https://audio.qurancdn.example/wbw/001_001_003.mp3"]);
    expect(speechCalls).toEqual([]);
  });

  it("offers the ayah honestly when no trusted word recording exists", async () => {
    await mount();
    // Ayah 2 carries no word recordings in this fixture.
    await openStudy();
    await click(container.querySelectorAll<HTMLButtonElement>(".study-pagination .dot")[1]);
    await recordThroughTutor();

    expect(text()).not.toContain(en.strings["tutor.doHearWord"]);
    expect(speechCalls).toEqual([]);
  });

  it("plays the selected reciter for the ayah", async () => {
    await mount();
    await openStudy();
    await recordThroughTutor();

    played.length = 0;
    const hearAyah = controls().find((control) => (control.textContent ?? "").includes(en.strings["tutor.doHearAyah"]!));
    await click(hearAyah);
    expect(played).toEqual([AYAH_AUDIO_URL]);
  });

  it("never reaches for speech synthesis on any path", async () => {
    await mount();
    await openStudy();
    for (const control of controls()) await click(control);
    await recordThroughTutor();
    for (const control of controls()) await click(control);
    expect(speechCalls).toEqual([]);
  });
});

/* --------------------------------- 13: continue cannot skip a correction */

describe("the learner cannot walk past an unresolved correction", () => {
  it("offers no continue while the engine is holding a target", async () => {
    await mount();
    await openStudy();
    await recordThroughTutor();

    expect(controls().map((control) => control.textContent)).not.toContainEqual(
      expect.stringContaining(en.strings["tutor.doContinue"]!),
    );
    // And the ayah on screen has not moved.
    expect(container.querySelector(".tutor-ayah p")?.textContent).toBe(AYAH_ARABIC);
  });
});

/* ------------------------------------------ 16–21: languages and RTL */

describe("the tutor teaches in every language", () => {
  const packs = { en, ps, "fa-AF": faAF, ur, ar } as const;

  it.each(SUPPORTED_LANGUAGE_CODES.map((code) => [code]))("teaches in %s", async (code) => {
    await mount();
    await openStudy();
    if (code !== "en") await chooseLanguage(code);
    await settle();
    const pack = packs[code as keyof typeof packs];

    expect(panel(), code).toBeTruthy();
    expect(message()?.textContent, code).toBe(pack.strings["tutor.ready"]);
    expect(controls()[0].textContent, code).toContain(pack.strings["tutor.doStart"]);
    expect(document.documentElement.dir, code).toBe(directionFor(code));
  });

  it.each(SUPPORTED_LANGUAGE_CODES.map((code) => [code]))("keeps the Quran itself unchanged in %s", async (code) => {
    await mount();
    await openStudy();
    if (code !== "en") await chooseLanguage(code);
    await settle();

    const ayah = container.querySelector(".tutor-ayah p")!;
    expect(ayah.getAttribute("dir"), code).toBe("rtl");
    expect(ayah.getAttribute("lang"), code).toBe("ar");
    // Byte-for-byte: no normalisation, no reordering, no stripped harakat.
    expect(Array.from(ayah.textContent!), code).toEqual(Array.from(AYAH_ARABIC));
  });
});

/* ------------------------------------------------------ accessibility */

describe("accessibility", () => {
  it("announces the teacher's sentence and names the panel", async () => {
    await mount();
    await openStudy();
    expect(message()?.getAttribute("aria-live")).toBe("polite");
    expect(panel()?.getAttribute("aria-label")).toBe(en.strings["tutor.label"]);
  });

  it("gives every control a readable label and a real button", async () => {
    await mount();
    await openStudy();
    await recordThroughTutor();
    for (const control of controls()) {
      expect(control.tagName).toBe("BUTTON");
      expect((control.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("says the listening and checking states in words", async () => {
    await mount();
    await openStudy();
    await click(controls()[0]);
    expect(container.querySelector(".tutor-presence")?.textContent).toContain(en.strings["tutor.presenceListening"]);
  });
});
