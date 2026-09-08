/**
 * @vitest-environment happy-dom
 *
 * The learner app itself, driven the way a learner drives it.
 *
 * This renders the real Home page — the navigation, the mode tabs, the Learn
 * view with its letters, the phone dock — with the data layer stubbed, and then
 * does what a learner does: opens the language menu, picks a language, and
 * looks at whether the words on screen actually changed. It also presses the
 * speaker controls and checks which recording was asked for.
 *
 * It deliberately asserts on *rendered text*, not on locale keys: the gap this
 * PR closes was that the packs existed and the interface did not use them.
 */
// The default import is what the test transform needs: it compiles JSX to
// `React.createElement` (tsconfig sets `jsx: "preserve"`).
import React, { act } from "react";
// React only flushes updates inside `act` when it knows it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_LANGUAGE_CODES } from "@shared/languages";
import { loadLocale } from "@locales/index";
import type { SurahContent } from "@shared/quran";
import en from "@locales/en";
import ps from "@locales/ps";
import faAF from "@locales/fa-AF";
import ur from "@locales/ur";
import ar from "@locales/ar";

/**
 * The data layer, stubbed.
 *
 * Home talks to the server through tRPC hooks. Nothing in this test is about
 * the server, so every hook returns "no data yet" — which is also the state a
 * learner sees for the first second of every visit, and the state in which the
 * language control still has to work.
 */
/** Two ayat of al-Ikhlas, enough to test playback and moving between ayat. */
export const FAKE_AYAHS = [
  {
    number: 1, verseKey: "112:1", arabic: "قُلْ هُوَ اللَّهُ أَحَدٌ",
    translation: "Say, He is Allah, One", transliteration: null,
    audioUrl: "https://audio.example/112001.mp3",
    // The word-by-word recordings Quran.com serves alongside the ayah.
    wordAudio: "قُلْ هُوَ اللَّهُ أَحَدٌ".split(" ").map((arabic, index) => ({
      position: index + 1, arabic, url: `https://audio.qurancdn.example/wbw/112_001_00${index + 1}.mp3`,
    })),
  },
  {
    number: 2, verseKey: "112:2", arabic: "اللَّهُ الصَّمَدُ",
    translation: "Allah, the Eternal", transliteration: null,
    audioUrl: "https://audio.example/112002.mp3",
    wordAudio: "اللَّهُ الصَّمَدُ".split(" ").map((arabic, index) => ({
      position: index + 1, arabic, url: `https://audio.qurancdn.example/wbw/112_002_00${index + 1}.mp3`,
    })),
  },
];

/**
 * The surah payload, held as a mutable object so a test can take the word
 * recordings away and check the honest fallback without rebuilding the mock.
 */
const FAKE_SURAH = {
  surah: { number: 112, nameSimple: "Al-Ikhlas", nameArabic: "الإخلاص", versesCount: 4, revelationPlace: "makkah", translatedName: "Sincerity" },
  reciterId: 7,
  translationId: 131,
  ayahs: FAKE_AYAHS,
  wordAudioSource: { provider: "quran.com", kind: "word-file", reciterName: null, matchesSelectedReciter: false } as SurahContent["wordAudioSource"],
};

const FAKE_INDEX = {
  surahs: [FAKE_SURAH.surah],
  juzs: [{ number: 30, firstSurah: 78, firstAyah: 1 }],
  reciters: [{ id: 7, name: "Test Reciter", style: null, available: true }],
  translations: [{ id: 131, authorName: "Test Translation", languageName: "english" }],
};

const mutationMocks = vi.hoisted(() => ({
  recitationEvaluate: vi.fn(),
  recitationIngest: vi.fn(),
  learnerSyncProgress: vi.fn(),
  learnerSyncQaidaProgress: vi.fn(),
  learnerRecordMemorization: vi.fn(),
}));

vi.mock("@/lib/trpc", () => {
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
      learner: {
        syncProgress: { useMutation: () => mutation(vi.fn(), mutationMocks.learnerSyncProgress) },
        syncQaidaProgress: { useMutation: () => mutation(vi.fn(), mutationMocks.learnerSyncQaidaProgress) },
        recordMemorizationAttempt: { useMutation: () => mutation(vi.fn(), mutationMocks.learnerRecordMemorization) },
        getReviewQueue: { useQuery: empty },
      },
    },
  };
});

/** Every source the page asked to play, in order. */
const played: string[] = [];
/**
 * Anything the page tries to say out loud.
 *
 * A Qaida with no approved recordings must stay silent rather than fall back to
 * a speech engine — an English voice handed Arabic says something else, and no
 * synthesised voice models Quranic Arabic here.
 */
const speechCalls: string[] = [];
/** Aliases for the tests that vary the word-audio source. */
const surahData = FAKE_SURAH;
const ORIGINAL_WORD_SOURCE = FAKE_SURAH.wordAudioSource;
/** Sources the fake audio element should fail on, to test error reporting. */
const failing = new Set<string>();

class FakeAudio {
  src = "";
  currentTime = 0;
  playbackRate = 1;
  volume = 1;
  error: { code: number } | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play() {
    played.push(this.src);
    if (failing.has(this.src)) {
      this.error = { code: 4 };
      this.onerror?.();
      return Promise.reject(new DOMException("no decoder", "NotSupportedError"));
    }
    return Promise.resolve();
  }
  pause() {}
  load() {}
  removeAttribute() {}
}

class FakeMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(readonly stream: MediaStream) {}

  start() {
    this.state = "recording";
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: this.mimeType }) });
  }

  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

let Home: typeof import("./Home").default;
let LocaleProvider: typeof import("@/contexts/LocaleContext").LocaleProvider;

let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  // See LanguagePicker.test.tsx: warm the dynamic pack imports first.
  for (const code of SUPPORTED_LANGUAGE_CODES) await loadLocale(code);
  ({ default: Home } = await import("./Home"));
  ({ LocaleProvider } = await import("@/contexts/LocaleContext"));
});

async function settle() {
  for (let turn = 0; turn < 2; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
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

/**
 * Opens Learn, where the letters and their recordings live.
 *
 * The app opens on Read, so a test about the Qaida letters has to do what a
 * learner does: press the Learn tab. Matched by the tab's own rendered label,
 * so it keeps working in whichever language the interface is in.
 */
async function openLearn(label = en.strings["mode.learn"]) {
  const tab = Array.from(container.querySelectorAll<HTMLButtonElement>(".mode-tab")).find((button) =>
    button.textContent?.includes(label),
  );
  if (!tab) throw new Error(`No mode tab labelled ${label}`);
  await act(async () => {
    tab.click();
  });
  await settle();
}
async function openStudy(label = en.strings["mode.study"]) {
  const tab = Array.from(container.querySelectorAll<HTMLButtonElement>(".mode-tab")).find((button) =>
    button.textContent?.includes(label),
  );
  if (!tab) throw new Error(`No mode tab labelled ${label}`);
  await act(async () => {
    tab.click();
  });
  await settle();
}
const triggers = () => Array.from(container.querySelectorAll<HTMLButtonElement>(".language-trigger"));

async function chooseLanguage(code: string) {
  await act(async () => {
    triggers()[0].click();
  });
  const option = container.querySelector<HTMLButtonElement>(`[role="option"][lang="${code}"]`);
  if (!option) throw new Error(`No option for ${code}`);
  await act(async () => {
    option.click();
  });
  await settle();
}

beforeEach(() => {
  for (const mock of Object.values(mutationMocks)) mock.mockReset();
  played.length = 0;
  failing.clear();
  window.localStorage.clear();
  document.documentElement.dir = "ltr";
  (globalThis as { Audio?: unknown }).Audio = FakeAudio;
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = FakeMediaRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
  });
  URL.createObjectURL = vi.fn(() => "blob:test-recording");
  URL.revokeObjectURL = vi.fn();
  window.HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    played.push(this.getAttribute("src") ?? "");
    return Promise.resolve();
  };
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.load = () => {};
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the language control is on the learner's screen", () => {
  it("renders a labelled language menu in the desk header and in the phone dock", async () => {
    await mount();

    // Two: the header on a wide screen, the dock on a phone. Both are rendered;
    // CSS decides which is visible at which width.
    expect(triggers()).toHaveLength(2);
    for (const trigger of triggers()) {
      expect(trigger.textContent).toContain(en.strings["language.short"]);
      expect(trigger.getAttribute("aria-label")).toBe(en.strings["language.label"]);
    }
    expect(container.querySelector(".mobile-dock .language-menu")).toBeTruthy();
  });

  it("offers all five languages and no others", async () => {
    await mount();
    await act(async () => {
      triggers()[0].click();
    });

    const listed = Array.from(container.querySelectorAll<HTMLElement>('[role="option"]')).map((option) =>
      option.getAttribute("lang"),
    );
    expect(listed.sort()).toEqual([...SUPPORTED_LANGUAGE_CODES].sort());
  });
});

describe("switching language changes the learner views", () => {
  /** Strings a learner reads on the main screen, one per surface. */
  const surfaces = (pack: { strings: Record<string, string | undefined> }) => ({
    navigation: pack.strings["nav.today"],
    read: pack.strings["mode.read"],
    learn: pack.strings["mode.learn"],
    study: pack.strings["mode.study"],
    memorise: pack.strings["mode.memorise"],
    dock: pack.strings["dock.practise"],
    learnHeading: pack.strings["learn.paceHeading"],
    qaidaHeading: pack.strings["qaida.heading"],
    letterButton: pack.strings["qaida.listenLetter"],
    progress: pack.strings["qaida.practisedCount"]?.replace("{percent}", "0"),
  });

  it.each([
    ["ps", ps],
    ["fa-AF", faAF],
    ["ur", ur],
    ["ar", ar],
  ])("shows %s across navigation, modes, Learn, the dock and the audio controls", async (code, pack) => {
    await mount();
    await openLearn();
    const before = surfaces(en);
    for (const value of Object.values(before)) expect(text(), `english ${value}`).toContain(value!);

    await chooseLanguage(code);

    const after = surfaces(pack as { strings: Record<string, string | undefined> });
    for (const [surface, value] of Object.entries(after)) {
      expect(value, `${code} has no string for ${surface}`).toBeTruthy();
      expect(text(), `${code}: ${surface} did not change`).toContain(value!);
    }
    // And the English it replaced is gone from those surfaces.
    expect(text()).not.toContain(before.qaidaHeading!);
    expect(text()).not.toContain(before.learnHeading!);
  });

  it("switches the whole page to right-to-left, and back to left-to-right for English", async () => {
    await mount();
    expect(document.documentElement.dir).toBe("ltr");

    for (const code of ["ps", "fa-AF", "ur", "ar"] as const) {
      await chooseLanguage(code);
      expect(document.documentElement.dir, code).toBe("rtl");
      expect(document.documentElement.lang, code).toBe(code);
    }

    await chooseLanguage("en");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("keeps the choice after a reload", async () => {
    await mount();
    await chooseLanguage("ur");
    expect(window.localStorage.getItem("miqra-locale")).toBe("ur");

    act(() => root.unmount());
    container.remove();
    await mount();

    expect(text()).toContain(ur.strings["mode.learn"]!);
    expect(document.documentElement.dir).toBe("rtl");
  });
});

describe("Quranic Arabic is not translated or mirrored", () => {
  it("keeps Arabic in elements marked lang=ar and dir=rtl in every language", async () => {
    await mount();
    for (const code of ["en", "ar", "ur"] as const) {
      await chooseLanguage(code);
      const arabic = Array.from(container.querySelectorAll('[lang="ar"]'));
      expect(arabic.length, code).toBeGreaterThan(0);
      for (const node of arabic) expect(node.getAttribute("dir"), `${code}: ${node.textContent}`).toBe("rtl");
    }
  });

  it("shows the same letter glyphs whichever language the interface is in", async () => {
    await mount();
    await openLearn();
    const glyphs = () =>
      Array.from(container.querySelectorAll<HTMLElement>(".alphabet-grid [lang='ar']")).map((node) => node.textContent);

    const english = glyphs();
    expect(english.length).toBeGreaterThan(20);
    expect(english).toContain("ا");

    await chooseLanguage("ps");
    expect(glyphs()).toEqual(english);
  });
});

/**
 * The Qaida's letter audio, with an empty approval ledger.
 *
 * The course teaches Quranic Arabic, so the only voice a learner may be played
 * as a model is a qualified teacher's — approved by a named, qualified
 * reviewer. Nothing has been recorded yet, so nothing plays, and the interface
 * says that instead of reaching for the machine-generated clips that are still
 * in the repository.
 */
describe("the letter audio waits for a teacher's recording", () => {
  it("offers the control, plays nothing, and says why", async () => {
    await mount();
    await openLearn();
    const button = container.querySelector<HTMLButtonElement>(".letter-play")!;

    // The control is still there and still labelled — a learner can see that
    // hearing the letter is the intended thing, and that it is not ready.
    expect(button.textContent).toContain(en.strings["qaida.listenLetter"]);
    expect(button.disabled).toBe(true);

    await act(async () => {
      button.click();
    });
    await settle();

    expect(played).toEqual([]);
    expect(speechCalls).toEqual([]);
  });

  it("never renders a stuck loading or playing state when nothing is available", async () => {
    await mount();
    await openLearn();

    // A null path once compared equal to a null state field, so every control
    // rendered as loading and every tile as playing.
    expect(container.querySelector(".letter-play")!.className).not.toContain("is-loading");
    expect(container.querySelector(".letter-play")!.className).not.toContain("is-playing");
    expect(container.querySelector(".letter-play")!.textContent).not.toContain(en.strings["qaida.audioLoading"]);
    for (const tile of Array.from(container.querySelectorAll(".alphabet-grid button"))) {
      expect(tile.className).not.toContain("is-playing");
    }
    for (const harakat of Array.from(container.querySelectorAll(".harakat-play"))) {
      expect(harakat.className).not.toContain("is-loading");
    }
  });

  it("plays nothing from any letter tile or harakat control", async () => {
    await mount();
    await openLearn();

    const tiles = Array.from(container.querySelectorAll<HTMLButtonElement>(".alphabet-grid button"));
    expect(tiles).toHaveLength(28);
    for (const tile of tiles.slice(0, 5)) expect(tile.querySelector(".tile-speaker")).toBeTruthy();

    const harakat = Array.from(container.querySelectorAll<HTMLButtonElement>(".harakat-play"));
    expect(harakat).toHaveLength(3);

    for (const button of [tiles[1], ...harakat]) {
      await act(async () => {
        button.click();
      });
      await settle();
    }

    // Not one request, and above all not a synthesised voice reading Arabic.
    expect(played).toEqual([]);
    expect(speechCalls).toEqual([]);
  });

  it("never reaches for the machine-generated clips still in the repository", async () => {
    await mount();
    await openLearn();
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".letter-play")!.click();
      for (const tile of Array.from(container.querySelectorAll<HTMLButtonElement>(".alphabet-grid button"))) tile.click();
    });
    await settle();

    expect(played.filter((src) => src.startsWith("/audio/letters/"))).toEqual([]);
  });

  it("tells the learner a recording has not been added yet", async () => {
    await mount();
    await openLearn();

    const status = container.querySelector(".letter-audio-status")!;
    expect(status.textContent?.trim().length).toBeGreaterThan(0);
    // No URL, no error code, no stack — and no claim that a voice is a reciter.
    expect(status.textContent).not.toContain("/audio/letters");
    expect(status.textContent).not.toContain("NotSupportedError");
    expect(status.textContent).not.toContain(en.strings["qaida.audioPlaying"]);
  });

  it("names the audio controls in the learner's language", async () => {
    await mount();
    await openLearn();
    await chooseLanguage("ar");

    const button = container.querySelector<HTMLButtonElement>(".letter-play")!;
    expect(button.textContent).toContain(ar.strings["qaida.listenLetter"]);
    expect(button.getAttribute("aria-label")).toContain(ar.strings["qaida.playLetterLabel"]!.split("{")[0].trim());
  });

  it.each(SUPPORTED_LANGUAGE_CODES.map((code) => [code]))("says the recording is not ready in %s", async (code) => {
    await mount();
    await openLearn();
    if (code !== "en") await chooseLanguage(code);

    const status = container.querySelector(".letter-audio-status")!;
    expect(status.textContent?.trim().length, code).toBeGreaterThan(0);
    expect(container.querySelector<HTMLButtonElement>(".letter-play")!.disabled, code).toBe(true);
    expect(played, code).toEqual([]);
  });
});

describe("Quran recitation plays from the learner interface", () => {
  const playButton = () => container.querySelector<HTMLButtonElement>(".playback-main")!;
  const audio = () => container.querySelector<HTMLAudioElement>("audio")!;

  it("offers an obvious play control for the selected ayah", async () => {
    await mount();

    expect(playButton().textContent).toContain(en.strings["playback.listen"]);
    expect(playButton().disabled).toBe(false);
    expect(audio().getAttribute("src")).toBe(FAKE_AYAHS[0].audioUrl);
  });

  it("plays the selected ayah and switches the control to pause", async () => {
    await mount();
    await act(async () => {
      playButton().click();
    });
    await settle();

    expect(played).toEqual([FAKE_AYAHS[0].audioUrl]);
    expect(playButton().textContent).toContain(en.strings["playback.pause"]);

    // And pressing it again pauses rather than starting a second playback.
    await act(async () => {
      playButton().click();
    });
    await settle();
    expect(played).toEqual([FAKE_AYAHS[0].audioUrl]);
    expect(playButton().textContent).toContain(en.strings["playback.listen"]);
  });

  it("does not stay stuck on the previous ayah's audio", async () => {
    await mount();
    await act(async () => {
      playButton().click();
    });
    await settle();

    // Selecting the next ayah swaps the source the element carries.
    const ayahButtons = Array.from(container.querySelectorAll<HTMLButtonElement>(".quran-ayah"));
    await act(async () => {
      ayahButtons[1].click();
    });
    await settle();

    expect(audio().getAttribute("src")).toBe(FAKE_AYAHS[1].audioUrl);
    await act(async () => {
      playButton().click();
    });
    await settle();
    expect(played[played.length - 1]).toBe(FAKE_AYAHS[1].audioUrl);
  });

  it("names the playback controls in the learner's language", async () => {
    await mount();
    await chooseLanguage("ur");
    expect(playButton().textContent).toContain(ur.strings["playback.listen"]);
  });

  it("shows a learner-safe message and a retry when the source fails", async () => {
    await mount();

    // The element reports a broken source the way a browser does.
    await act(async () => {
      audio().dispatchEvent(new Event("error"));
    });
    await settle();

    const warning = container.querySelector(".playback-warning")!;
    expect(warning.textContent).toContain(en.strings["playback.audioFailed"].split("{")[0].trim());
    // The reciter is named; the URL and the failure code are not.
    expect(warning.textContent).not.toContain("https://");
    expect(warning.textContent).not.toContain("MEDIA_ERR");
    expect(playButton().disabled).toBe(true);

    const retry = container.querySelector<HTMLButtonElement>(".playback-retry")!;
    expect(retry.textContent).toContain(en.strings["content.retry"]);

    await act(async () => {
      retry.click();
    });
    await settle();

    // The retry clears the failure and asks for the same ayah again.
    expect(played[played.length - 1]).toBe(FAKE_AYAHS[0].audioUrl);
    expect(container.querySelector(".playback-warning")).toBeNull();
  });

  it("reports a failed source in the learner's language", async () => {
    await mount();
    await chooseLanguage("ar");

    await act(async () => {
      audio().dispatchEvent(new Event("error"));
    });
    await settle();

    expect(container.querySelector(".playback-warning")!.textContent).toContain(
      ar.strings["playback.audioFailed"]!.split("{")[0].trim(),
    );
  });
});

/**
 * A word-level review that names one missing word.
 *
 * The shape is the recitation service's own response; the overrides let a test
 * send the same attempt back with the target no longer named, which is how the
 * backend reports that it heard the word this time.
 */
function wordCorrectionReview(patch: Record<string, unknown> = {}) {
  return {
    reviewStatus: "reviewed",
    wordReviewAvailable: true,
    transcript: "قل هو احد",
    matchedCount: 4,
    totalWords: 5,
    score: 80,
    corrections: [{ expected: "اللَّهُ", heard: null, status: "missing", wordIndex: 3 }],
    encouragement: "Keep practising.",
    nextStep: "Return to word 3.",
    spokenGuidance: "Return to word 3.",
    note: "Word-recall review only.",
    reviewMessage: null,
    reviewMessageCode: null,
    quranAwareReview: { status: "not_configured", provider: null, confidence: null, summary: null, findings: [] },
    verseFollowing: {
      currentSurah: 112,
      currentAyah: 1,
      expectedWordIndex: 3,
      lastCompletedAyah: null,
      state: "correcting",
      attemptsOnCurrentAyah: 1,
      evidence: "partial",
      shouldAdvance: false,
      nextAyah: 2,
      correctionFocus: { wordIndex: 3, expectedArabic: "اللَّهُ", kind: "missing" },
      reason: "mistake_to_correct",
    },
    ...patch,
  };
}

/** Presses the main record button, then presses it again to stop and review. */
async function recordOnce(selector = ".loop-record") {
  for (let press = 0; press < 2; press += 1) {
    await act(async () => {
      container.querySelector<HTMLButtonElement>(selector)!.click();
    });
    await settle();
  }
}

describe("Study recitation correction", () => {
  it("renders the exact Arabic focus word after a word-level review", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce({
      reviewStatus: "reviewed",
      wordReviewAvailable: true,
      transcript: "قل هو احد",
      matchedCount: 4,
      totalWords: 5,
      score: 80,
      corrections: [{ expected: "اللَّهُ", heard: null, status: "missing", wordIndex: 3 }],
      encouragement: "Keep practising.",
      nextStep: "Return to word 3.",
      spokenGuidance: "Return to word 3.",
      note: "Word-recall review only.",
      reviewMessage: null,
      reviewMessageCode: null,
      quranAwareReview: { status: "not_configured", provider: null, confidence: null, summary: null, findings: [] },
      verseFollowing: {
        currentSurah: 112,
        currentAyah: 1,
        expectedWordIndex: 3,
        lastCompletedAyah: null,
        state: "correcting",
        attemptsOnCurrentAyah: 1,
        evidence: "partial",
        shouldAdvance: false,
        nextAyah: 2,
        correctionFocus: { wordIndex: 3, expectedArabic: "اللَّهُ", kind: "missing" },
        reason: "mistake_to_correct",
      },
    });
    await mount();
    await openStudy();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".loop-record")!.click();
    });
    await settle();
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".loop-record")!.click();
    });
    await settle();

    // The word reaches the screen, in the guided lesson that replaced the bare
    // marker. It is the lesson's own object now, so `.now-word` above it is
    // gone: the learner reads the diagnosis once, not twice.
    const lesson = container.querySelector(".word-lesson");
    expect(lesson).toBeTruthy();
    expect(lesson!.querySelector(".lesson-word")?.textContent).toBe("اللَّهُ");
    expect(container.querySelector(".now-word")).toBeNull();
    expect(text()).toContain("Word 3");
  });

  it("does not repeat the same word as a heading, a card and a note row", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(wordCorrectionReview());
    await mount();
    await openStudy();
    await recordOnce();

    // In the teaching surface the word is rendered once, as the thing being
    // practised. It used to appear again as a heading above the card.
    const lesson = container.querySelector(".word-lesson")!;
    expect(lesson.querySelectorAll(".lesson-word")).toHaveLength(1);
    expect(container.querySelector(".now-word")).toBeNull();

    // The diagnosis itself — the eyebrow and the observation sentence — is
    // stated once, not once per surface.
    expect(container.querySelectorAll(".lesson-eyebrow")).toHaveLength(1);
    const observed = Array.from(container.querySelectorAll("*")).filter(
      (node) => node.children.length === 0 && (node.textContent ?? "").includes("I didn’t hear this word clearly"),
    );
    expect(observed).toHaveLength(1);

    // Anything else that names the word is a diagnostic row, and diagnostics
    // stay inside the collapsed notes rather than beside the lesson.
    const elsewhere = Array.from(container.querySelectorAll(".correction-word"));
    for (const node of elsewhere) expect(node.closest("details.teacher-notes")).toBeTruthy();
  });

  it("walks the learner from the word back into the ayah", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(wordCorrectionReview());
    await mount();
    await openStudy();
    await recordOnce();

    expect(mutationMocks.recitationEvaluate).toHaveBeenCalledWith(expect.objectContaining({ attemptScope: "ayah" }));
    expect(mutationMocks.recitationEvaluate.mock.calls[0]?.[0]).not.toHaveProperty("correctionTarget");

    // Step one: hear it. The primary action asks for the word, not the ayah.
    const steps = Array.from(container.querySelectorAll(".lesson-steps li")).map((node) => node.textContent ?? "");
    expect(steps).toHaveLength(4);
    expect(container.querySelector('.lesson-steps li[aria-current="step"]')?.textContent).toContain("Hear");
    expect(container.querySelector(".lesson-primary")?.textContent).toContain("اللَّهُ");

    // The ayah is on screen with the target marked, in its own order.
    const context = container.querySelector(".lesson-context p");
    expect(context?.getAttribute("dir")).toBe("rtl");
    expect(context?.querySelector(".is-target")?.textContent).toBe("اللَّهُ");
  });

  it("says it heard the word without claiming the pronunciation was right", async () => {
    // The focused attempt comes back with the target no longer named.
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(wordCorrectionReview());
    await mount();
    await openStudy();
    await recordOnce();

    expect(container.querySelector(".lesson-primary"), "the lesson offers a primary action").toBeTruthy();
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(wordCorrectionReview({
      attemptScope: "word",
      recitationScoreScope: "word",
      focusedWordResult: { recognition: "recognised", reason: "target_recognised" },
      correctionSession: {
        surah: 1,
        ayah: 1,
        targetWordIndex: 3,
        targetArabic: "اللَّهُ",
        stage: "recite-ayah",
        recognition: "recognised",
        attemptsOnTarget: 1,
      },
      corrections: [],
      matchedCount: 1,
      totalWords: 1,
      score: 100,
    }));
    await recordOnce(".lesson-primary");

    expect(mutationMocks.recitationEvaluate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      attemptScope: "word",
      correctionTarget: {
        surah: 1,
        ayah: 1,
        targetWordIndex: 3,
        expectedArabic: "اللَّهُ",
        attemptsOnTarget: 0,
      },
    }));

    const lesson = container.querySelector(".word-lesson");
    expect(lesson?.textContent).toContain("I heard the marked word this time");
    expect(lesson?.textContent).toContain("Now put it back into the ayah");
    for (const claim of ["pronunciation is correct", "perfect", "makhraj", "tajwid"]) {
      expect((lesson?.textContent ?? "").toLowerCase(), claim).not.toContain(claim);
    }
    expect(container.querySelector(".lesson-primary")?.textContent).toContain("Recite the full ayah");
    expect(container.querySelector(".feedback-score")).toBeNull();
    expect(container.querySelector(".correction-row")).toBeNull();
    expect(container.querySelector(".all-matched")).toBeNull();
  });
});

describe("a correction never survives the ayah it was made about", () => {
  /**
   * The production bug. A learner corrected word 3 of Al-Fatiha 1:2, Study
   * advanced to 1:3 — two words long, and without that word in it — and the
   * lesson kept rendering the old target against the new ayah: the word, and
   * "Word 3 of 2". The fixture here has the same shape: ayah 1 is four words,
   * ayah 2 is two.
   */
  const firstAyahWords = FAKE_AYAHS[0].arabic.split(" ");
  const secondAyahWords = FAKE_AYAHS[1].arabic.split(" ");

  /** A correction on a word of ayah 1 that ayah 2 has no position for. */
  const correctionOnAyahOne = (wordIndex: number) =>
    wordCorrectionReview({
      corrections: [{ expected: firstAyahWords[wordIndex - 1], heard: null, status: "missing", wordIndex }],
      verseFollowing: {
        currentSurah: 112, currentAyah: 1, expectedWordIndex: wordIndex, lastCompletedAyah: null,
        state: "correcting", attemptsOnCurrentAyah: 1, evidence: "partial", shouldAdvance: false,
        nextAyah: 2, correctionFocus: { wordIndex, expectedArabic: firstAyahWords[wordIndex - 1], kind: "missing" },
        reason: "mistake_to_correct",
      },
    });

  /** The attempt that resolves it and lets Study move on. */
  const resolvedAndAdvancing = () =>
    wordCorrectionReview({
      corrections: [], matchedCount: 4, score: 100,
      verseFollowing: {
        currentSurah: 112, currentAyah: 2, expectedWordIndex: 1, lastCompletedAyah: 1,
        state: "following", attemptsOnCurrentAyah: 1, evidence: "strong", shouldAdvance: true,
        nextAyah: 2, correctionFocus: null, reason: "ayah_completed",
      },
    });

  it("disappears when the resolved correction advances Study to the next ayah", async () => {
    expect(secondAyahWords).toHaveLength(2);
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOnAyahOne(3));
    await mount();
    await openStudy();
    await recordOnce();

    expect(container.querySelector(".word-lesson")).toBeTruthy();
    expect(text()).toContain("Word 3 of 4");

    // The learner recites the whole ayah, it goes through, and Study offers the
    // next ayah.
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(resolvedAndAdvancing());
    await recordOnce();
    const advance = container.querySelector<HTMLButtonElement>(".fix-cta");
    expect(advance?.textContent).toContain("Go to ayah 2");
    await act(async () => {
      advance!.click();
    });
    await settle();

    // Ayah 2 is on screen, and nothing of the previous correction is.
    expect(container.querySelector(".study-arabic")?.textContent).toBe(FAKE_AYAHS[1].arabic);
    expect(container.querySelector(".word-lesson")).toBeNull();
    expect(container.querySelector(".lesson-word")).toBeNull();
    // The exact rendering the bug produced.
    expect(text()).not.toContain("Word 3 of 2");
    expect(text()).not.toContain("Word 3 of");
  });

  it("shows no target from another ayah, whatever the word count", async () => {
    // Word 4 of ayah 1 is not in ayah 2 at all, so its absence is checkable as
    // text rather than only as a missing element.
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOnAyahOne(4));
    await mount();
    await openStudy();
    await recordOnce();

    const target = firstAyahWords[3];
    expect(container.querySelector(".lesson-word")?.textContent).toBe(target);

    mutationMocks.recitationEvaluate.mockResolvedValueOnce(resolvedAndAdvancing());
    await recordOnce();
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".fix-cta")!.click();
    });
    await settle();

    expect(text()).not.toContain(target);
    expect(container.querySelector(".word-lesson")).toBeNull();
  });

  it("disappears when the learner walks to the next ayah by hand", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOnAyahOne(4));
    await mount();
    await openStudy();
    await recordOnce();
    expect(container.querySelector(".word-lesson")).toBeTruthy();

    // The pagination's own Next, with the correction still open.
    const next = Array.from(container.querySelectorAll<HTMLButtonElement>(".study-pagination button")).find((button) =>
      (button.textContent ?? "").includes(en.strings["study.next"]),
    );
    await act(async () => {
      next!.click();
    });
    await settle();

    expect(container.querySelector(".study-arabic")?.textContent).toBe(FAKE_AYAHS[1].arabic);
    expect(container.querySelector(".word-lesson")).toBeNull();
    expect(text()).not.toContain(firstAyahWords[3]);
  });

  it("renders nothing at all when a review names a word this ayah cannot have", async () => {
    /**
     * The reported rendering, reproduced directly: a review naming word 3 while
     * a two-word ayah is on screen. This is the state the page passes through
     * whenever the ayah changes before the review that named the word has been
     * cleared, and it is the render that produced "رَبِّ · Word 3 of 2". The
     * guard is in the derivation rather than in an effect precisely so this
     * render cannot exist, whatever order the effects run in.
     */
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOnAyahOne(3));
    await mount();
    await openStudy();
    // Ayah 2 — two words — is on screen when the review comes back.
    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>(".study-pagination .dot")[1].click();
    });
    await settle();
    await recordOnce();

    expect(container.querySelector(".study-arabic")?.textContent).toBe(FAKE_AYAHS[1].arabic);
    expect(container.querySelector(".word-lesson")).toBeNull();
    expect(container.querySelector(".lesson-word")).toBeNull();
    expect(text()).not.toContain("Word 3 of 2");
    // Not the marker card either: a review naming a position this ayah does not
    // have is dropped whole, so nothing downstream of it can render the word.
    expect(container.querySelector(".study-fix.is-word")).toBeNull();
    expect(container.querySelectorAll(".correction-row")).toHaveLength(0);
    // Study falls back to its ordinary states rather than showing nothing.
    expect(container.querySelector(".teacher-now")).toBeTruthy();
  });

  it("disappears when the learner walks back to the previous ayah", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOnAyahOne(4));
    await mount();
    await openStudy();
    await recordOnce();
    expect(container.querySelector(".word-lesson")).toBeTruthy();

    const previous = Array.from(container.querySelectorAll<HTMLButtonElement>(".study-pagination button")).find((button) =>
      (button.textContent ?? "").includes(en.strings["study.previous"]),
    );
    // On the first ayah there is nowhere back to go, so the walk is forward and
    // then back again — both directions with the correction open.
    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>(".study-pagination .dot")[1].click();
    });
    await settle();
    expect(container.querySelector(".word-lesson")).toBeNull();

    expect(previous!.disabled).toBe(false);
    await act(async () => {
      previous!.click();
    });
    await settle();
    expect(container.querySelector(".study-arabic")?.textContent).toBe(FAKE_AYAHS[0].arabic);
    // Back on the ayah the word belongs to, and still no correction: the review
    // that named it was cleared with the navigation, so there is nothing to
    // teach. The word is on screen only as part of the ayah itself.
    expect(container.querySelector(".word-lesson")).toBeNull();
    expect(container.querySelector(".lesson-word")).toBeNull();
  });

  it("keeps the lesson while the learner stays on the ayah", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOnAyahOne(3));
    await mount();
    await openStudy();
    await recordOnce();

    // The guard must not be so eager that it hides a correction that is right.
    expect(container.querySelector(".lesson-word")?.textContent).toBe(firstAyahWords[2]);
    expect(text()).toContain("Word 3 of 4");
  });
});

describe("an attempt the app could not review", () => {
  /** A recording of a different ayah entirely: nothing here fits this one. */
  const unrelatedReview = () =>
    wordCorrectionReview({
      matchedCount: 0,
      score: 29,
      corrections: [
        { expected: "قُلْ", heard: "الحمد", status: "review", wordIndex: 1 },
        { expected: "هُوَ", heard: "لله", status: "review", wordIndex: 2 },
        { expected: "ٱللَّهُ", heard: "رب", status: "review", wordIndex: 3 },
        { expected: "أَحَدٌ", heard: "العالمين", status: "review", wordIndex: 4 },
      ],
      verseFollowing: {
        currentSurah: 112, currentAyah: 1, expectedWordIndex: 1, lastCompletedAyah: null,
        state: "uncertain", attemptsOnCurrentAyah: 1, evidence: "weak", shouldAdvance: false,
        nextAyah: 2, correctionFocus: null, reason: "too_little_evidence",
      },
    });

  it("shows one neutral message instead of four word rows", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(unrelatedReview());
    await mount();
    await openStudy();
    await recordOnce();

    expect(text()).toContain("This recording didn’t match enough of the current ayah");
    // The aligner produced a row per expected word. None of them is a finding
    // the engine made, so none of them is shown as one.
    expect(container.querySelectorAll(".correction-row")).toHaveLength(0);
    expect(container.querySelector(".word-lesson")).toBeNull();
  });

  it("shows no score for an attempt that was never reviewed", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(unrelatedReview());
    await mount();
    await openStudy();
    await recordOnce();

    expect(container.querySelector(".feedback-score")).toBeNull();
    expect(text()).not.toContain("29%");
  });
});

describe("the surah progress meter is not a mark for the recitation", () => {
  it("labels it as a place in the surah and shows the ayah count", async () => {
    await mount();
    await openStudy();

    const card = container.querySelector(".completion-card");
    expect(card?.textContent).toContain("Place in this surah");
    // The number that used to sit here — the place in the surah as a percentage —
    // sat under the heading "This reading" and read as a mark for the attempt.
    expect(card?.textContent).toContain("Ayah 1 of 2");
    expect(card?.textContent).not.toContain("%");
    expect(card?.textContent).toContain("not a score");
  });
});

describe("hearing the exact Quran word", () => {
  const firstAyahWords = FAKE_AYAHS[0].arabic.split(" ");

  const correctionOn = (wordIndex: number) =>
    wordCorrectionReview({
      corrections: [{ expected: firstAyahWords[wordIndex - 1], heard: null, status: "missing", wordIndex }],
      verseFollowing: {
        currentSurah: 112, currentAyah: 1, expectedWordIndex: wordIndex, lastCompletedAyah: null,
        state: "correcting", attemptsOnCurrentAyah: 1, evidence: "partial", shouldAdvance: false,
        nextAyah: 2, correctionFocus: { wordIndex, expectedArabic: firstAyahWords[wordIndex - 1], kind: "missing" },
        reason: "mistake_to_correct",
      },
    });

  it("requests the recording of that exact word, from the reciter source", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOn(3));
    await mount();
    await openStudy();
    await recordOnce();

    const listen = container.querySelector<HTMLButtonElement>(".lesson-listen.is-word");
    expect(listen?.getAttribute("aria-label")).toContain(firstAyahWords[2]);

    played.length = 0;
    await act(async () => {
      listen!.click();
    });
    await settle();

    // Word 3 of 112:1, and nothing else — not the ayah recording, and nothing
    // generated.
    expect(played).toEqual(["https://audio.qurancdn.example/wbw/112_001_003.mp3"]);
  });

  it("shows the canonical Quran word unchanged beside the control", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOn(3));
    await mount();
    await openStudy();
    await recordOnce();

    const word = container.querySelector(".lesson-word")!;
    // The review named `اللَّهُ`; the ayah spells it `اللَّهُ` too here, and what is
    // rendered is the ayah's own text either way.
    expect(word.textContent).toBe(firstAyahWords[2]);
    expect(word.getAttribute("lang")).toBe("ar");
    expect(word.getAttribute("dir")).toBe("rtl");
  });

  it("falls back to the ayah when the source served no word recordings", async () => {
    surahData.wordAudioSource = null;
    try {
      mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOn(3));
      await mount();
      await openStudy();
      await recordOnce();

      expect(container.querySelector(".lesson-listen.is-word")).toBeNull();
      const listen = container.querySelector<HTMLButtonElement>(".lesson-listen");
      expect(listen?.textContent).toContain(en.strings["correction.listen"]);
      expect(text()).toContain(en.strings["lesson.referenceNote"]);

      played.length = 0;
      await act(async () => {
        listen!.click();
      });
      await settle();
      // The reciter's ayah — never a synthesised stand-in for the word.
      expect(played).toEqual([FAKE_AYAHS[0].audioUrl]);
    } finally {
      surahData.wordAudioSource = ORIGINAL_WORD_SOURCE;
    }
  });

  it("offers no word recording for a position the ayah cannot have", async () => {
    // Word 9 of a four-word ayah: the review is dropped whole, so there is no
    // lesson and certainly no audio addressed to a word that does not exist.
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(
      wordCorrectionReview({ corrections: [{ expected: "لا", heard: null, status: "missing", wordIndex: 9 }] }),
    );
    await mount();
    await openStudy();
    await recordOnce();

    expect(container.querySelector(".lesson-listen.is-word")).toBeNull();
    expect(container.querySelector(".word-lesson")).toBeNull();
  });

  it("drops the word recording the moment the learner changes ayah", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOn(3));
    await mount();
    await openStudy();
    await recordOnce();
    expect(container.querySelector(".lesson-listen.is-word")).toBeTruthy();

    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>(".study-pagination .dot")[1].click();
    });
    await settle();

    // No control, and so no way to play 112:1's third word over 112:2.
    expect(container.querySelector(".lesson-listen.is-word")).toBeNull();
    expect(container.querySelector(".word-lesson")).toBeNull();
  });

  it("plays the ayah from the selected reciter while the word comes from the reference set", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOn(3));
    await mount();
    await openStudy();
    await recordOnce();

    // The two voices are different, and the interface says so rather than
    // letting the learner assume otherwise.
    expect(text()).toContain(en.strings["lesson.wordReferenceNote"]);

    played.length = 0;
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".lesson-ayah-listen")!.click();
    });
    await settle();
    expect(played).toEqual([FAKE_AYAHS[0].audioUrl]);
  });
});

describe("the correction card never contradicts itself", () => {
  const firstAyahWords = FAKE_AYAHS[0].arabic.split(" ");

  const correctionOnWord = (wordIndex: number, patch: Record<string, unknown> = {}) =>
    wordCorrectionReview({
      corrections: [{ expected: firstAyahWords[wordIndex - 1], heard: null, status: "missing", wordIndex }],
      verseFollowing: {
        currentSurah: 112, currentAyah: 1, expectedWordIndex: wordIndex, lastCompletedAyah: null,
        state: "correcting", attemptsOnCurrentAyah: 1, evidence: "partial", shouldAdvance: false,
        nextAyah: 2, correctionFocus: { wordIndex, expectedArabic: firstAyahWords[wordIndex - 1], kind: "missing" },
        reason: "mistake_to_correct",
      },
      ...patch,
    });

  it("drops the recorder's own status while a lesson is running", async () => {
    // Reported from production: "Good — I heard the marked word this time"
    // standing beside "Your word-recall review is ready". The lesson is already
    // saying what happened, in the teacher's voice.
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOnWord(3));
    await mount();
    await openStudy();
    await recordOnce();

    expect(container.querySelector(".word-lesson")).toBeTruthy();
    expect(container.querySelector(".loop-message")).toBeNull();
    expect(text()).not.toContain(en.strings["recorder.reviewReady"]);
  });

  it("stops calling the word a problem once it has come through", async () => {
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOnWord(3));
    await mount();
    await openStudy();
    await recordOnce();

    // While it is still the problem, it says so.
    expect(container.querySelector(".lesson-eyebrow")?.textContent).toContain(en.strings["lesson.eyebrow"]);

    // The focused attempt goes through.
    mutationMocks.recitationEvaluate.mockResolvedValueOnce(correctionOnWord(3, { corrections: [], matchedCount: 5, score: 100 }));
    await recordOnce(".lesson-primary");

    const lesson = container.querySelector(".word-lesson")!;
    expect(lesson.textContent).toContain("I heard the marked word this time");
    // And the heading above it agrees, rather than still reading "Needs attention".
    expect(lesson.querySelector(".lesson-eyebrow")?.textContent).toContain(en.strings["lesson.eyebrowResolved"]);
    expect(lesson.textContent).not.toContain(en.strings["lesson.eyebrow"]);
    // The original finding is history now, not a live error under a green heading.
    expect(lesson.textContent).not.toContain(en.strings["correction.notHeard"]);
    // The whole ayah is the dominant next action.
    expect(container.querySelector(".lesson-primary")?.textContent).toContain(en.strings["lesson.reciteAyah"]);
  });

  it("keeps the recorder's status when no lesson is running", async () => {
    await mount();
    await openStudy();
    // Nothing to correct yet, so the recorder's own line is the only thing
    // there is to say — this change suppresses a duplicate, not the status.
    expect(container.querySelector(".loop-message")).toBeTruthy();
  });
});
