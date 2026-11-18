/**
 * @vitest-environment happy-dom
 *
 * The "Keep Your Place" panel, driven the way a learner drives it.
 *
 * This renders the real Home page with the data layer stubbed (same harness
 * shape as Home.learner.test.tsx) and checks the three panel fixes: Save
 * actually saves the place, the panel opens as a drawer, and Study view no
 * longer mirrors the ayah in the panel. It asserts on rendered text and on
 * the drawer classes, since jsdom cannot evaluate media queries.
 */
import React, { act } from "react";
// React only flushes updates inside `act` when it knows it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_LANGUAGE_CODES } from "@shared/languages";
import { loadLocale } from "@locales/index";
import type { SurahContent } from "@shared/quran";
import en from "@locales/en";
import { SAVED_PLACE_KEY } from "@/lib/savedPlace";

/** Two ayat of al-Fatihah, enough to test saving and moving between ayat. */
export const FAKE_AYAHS = [
  {
    number: 1, verseKey: "1:1", arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    translation: "In the name of Allah, the Entirely Merciful, the Especially Merciful", transliteration: null,
    audioUrl: "https://audio.example/001001.mp3",
    wordAudio: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ".split(" ").map((arabic, index) => ({
      position: index + 1, arabic, url: `https://audio.qurancdn.example/wbw/001_001_00${index + 1}.mp3`,
    })),
  },
  {
    number: 2, verseKey: "1:2", arabic: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
    translation: "All praise is due to Allah, Lord of the worlds", transliteration: null,
    audioUrl: "https://audio.example/001002.mp3",
    wordAudio: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ".split(" ").map((arabic, index) => ({
      position: index + 1, arabic, url: `https://audio.qurancdn.example/wbw/001_002_00${index + 1}.mp3`,
    })),
  },
];

/** Three ayat of al-Baqarah, so "Go there" can land in another surah. */
const FAKE_AYAHS_2 = [
  {
    number: 1, verseKey: "2:1", arabic: "الم",
    translation: "Alif, Lam, Meem", transliteration: null,
    audioUrl: "https://audio.example/002001.mp3",
    wordAudio: "الم".split(" ").map((arabic, index) => ({
      position: index + 1, arabic, url: `https://audio.qurancdn.example/wbw/002_001_00${index + 1}.mp3`,
    })),
  },
  {
    number: 2, verseKey: "2:2", arabic: "ذَٰلِكَ الْكِتَابُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ",
    translation: "This is the Book about which there is no doubt, a guidance for those conscious of Allah", transliteration: null,
    audioUrl: "https://audio.example/002002.mp3",
    wordAudio: "ذَٰلِكَ الْكِتَابُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ".split(" ").map((arabic, index) => ({
      position: index + 1, arabic, url: `https://audio.qurancdn.example/wbw/002_002_00${index + 1}.mp3`,
    })),
  },
  {
    number: 3, verseKey: "2:3", arabic: "الَّذِينَ يُؤْمِنُونَ بِالْغَيْبِ وَيُقِيمُونَ الصَّلَاةَ وَمِمَّا رَزَقْنَاهُمْ يُنفِقُونَ",
    translation: "Who believe in the unseen, establish prayer, and spend out of what We have provided for them", transliteration: null,
    audioUrl: "https://audio.example/002003.mp3",
    wordAudio: "الَّذِينَ يُؤْمِنُونَ بِالْغَيْبِ وَيُقِيمُونَ الصَّلَاةَ وَمِمَّا رَزَقْنَاهُمْ يُنفِقُونَ".split(" ").map((arabic, index) => ({
      position: index + 1, arabic, url: `https://audio.qurancdn.example/wbw/002_003_00${index + 1}.mp3`,
    })),
  },
];

const FAKE_SURAH = {
  surah: { number: 1, nameSimple: "Al-Fatihah", nameArabic: "الفاتحة", versesCount: 7, revelationPlace: "makkah", translatedName: "The Opener" },
  reciterId: 7,
  translationId: 131,
  ayahs: FAKE_AYAHS,
  wordAudioSource: { provider: "quran.com", kind: "word-file", reciterName: null, matchesSelectedReciter: false } as SurahContent["wordAudioSource"],
};

const FAKE_SURAH_2 = {
  surah: { number: 2, nameSimple: "Al-Baqarah", nameArabic: "البقرة", versesCount: 286, revelationPlace: "madinah", translatedName: "The Cow" },
  reciterId: 7,
  translationId: 131,
  ayahs: FAKE_AYAHS_2,
  wordAudioSource: { provider: "quran.com", kind: "word-file", reciterName: null, matchesSelectedReciter: false } as SurahContent["wordAudioSource"],
};

const FAKE_INDEX = {
  surahs: [FAKE_SURAH.surah, FAKE_SURAH_2.surah],
  juzs: [{ number: 30, firstSurah: 78, firstAyah: 1 }],
  reciters: [{ id: 7, name: "Test Reciter", style: null, available: true }],
  translations: [{ id: 131, authorName: "Test Translation", languageName: "english" }],
};

const mutationMocks = vi.hoisted(() => ({
  recitationEvaluate: vi.fn(),
  recitationEvaluateWithTutor: vi.fn(),
  tutorStart: vi.fn(),
  tutorTurn: vi.fn(),
  recitationIngest: vi.fn(),
  learnerSyncProgress: vi.fn(),
  learnerSyncQaidaProgress: vi.fn(),
  learnerRecordMemorization: vi.fn(),
}));

vi.mock("@/lib/trpc", () => {
  const mutation = (mutateAsync = vi.fn(), mutate = vi.fn()) => ({ mutateAsync, mutate, isPending: false, reset: vi.fn() });
  const empty = () => ({ data: undefined, isSuccess: false, isLoading: false, isError: false, error: null, refetch: vi.fn() });
  const ready = (data: unknown) => () => ({ data, isSuccess: true, isLoading: false, isError: false, error: null, refetch: vi.fn() });
  // The surah query answers for the surah asked for, so navigating to a
  // saved place in another surah really lands there.
  const surahQuery = (input: { surah?: number }) => {
    const data = input?.surah === 2 ? FAKE_SURAH_2 : FAKE_SURAH;
    return { data, isSuccess: true, isLoading: false, isError: false, error: null, refetch: vi.fn() };
  };
  return {
    trpc: {
      useUtils: () => ({ auth: { me: { setData: vi.fn(), invalidate: vi.fn() } } }),
      quran: { index: { useQuery: ready(FAKE_INDEX) }, surah: { useQuery: surahQuery } },
      auth: { me: { useQuery: empty }, logout: { useMutation: () => mutation() } },
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

const panel = () => container.querySelector<HTMLElement>("#study-panel");
const saveButton = () => container.querySelector<HTMLButtonElement>(".save-button");
const toggleButton = () => container.querySelector<HTMLButtonElement>(".panel-toggle");
const closeButton = () => container.querySelector<HTMLButtonElement>(".panel-close");

async function clickSave() {
  const button = saveButton();
  if (!button) throw new Error("No save button");
  await act(async () => {
    button.click();
  });
  await settle();
}

async function clickAyah(arabic: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>(".quran-ayah")).find((candidate) =>
    candidate.textContent?.includes(arabic),
  );
  if (!button) throw new Error(`No ayah button for ${arabic}`);
  await act(async () => {
    button.click();
  });
  await settle();
}

async function openDrawer() {
  const toggle = toggleButton();
  if (!toggle) throw new Error("No panel toggle");
  await act(async () => {
    toggle.click();
  });
  await settle();
}

async function openView(label: string) {
  const tab = Array.from(container.querySelectorAll<HTMLButtonElement>(".mode-tab")).find((button) =>
    button.textContent?.includes(label),
  );
  if (!tab) throw new Error(`No mode tab labelled ${label}`);
  await act(async () => {
    tab.click();
  });
  await settle();
}

function seedSavedPlace(surah: number, ayah: number) {
  window.localStorage.setItem(
    SAVED_PLACE_KEY,
    JSON.stringify({ surah, ayah, savedAt: "2026-11-18T22:00:00.000Z" }),
  );
}

beforeEach(() => {
  for (const mock of Object.values(mutationMocks)) mock.mockReset();
  played.length = 0;
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

describe("Save actually saves the place", () => {
  it("persists the current ayah and reads Saved", async () => {
    await mount();
    await clickAyah("الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ");
    await clickSave();

    const stored = JSON.parse(window.localStorage.getItem(SAVED_PLACE_KEY) ?? "null") as
      | { surah: number; ayah: number }
      | null;
    expect(stored?.surah).toBe(1);
    expect(stored?.ayah).toBe(2);
    expect(saveButton()?.textContent).toContain(en.strings["panel.saved"]);
    expect(saveButton()?.getAttribute("aria-pressed")).toBe("true");
  });

  it("restores Saved on a fresh mount on the saved ayah, and Save elsewhere", async () => {
    // The app opens on Al-Fatihah ayah 1, so the seeded place is that ayah.
    seedSavedPlace(1, 1);
    await mount();

    expect(saveButton()?.getAttribute("aria-pressed")).toBe("true");
    expect(saveButton()?.textContent).toContain(en.strings["panel.saved"]);

    await clickAyah("الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ");

    expect(saveButton()?.getAttribute("aria-pressed")).toBe("false");
    expect(saveButton()?.textContent).not.toContain(en.strings["panel.saved"]);
    // The saved place is offered, with a way back to it.
    expect(container.querySelector(".saved-place")?.textContent).toContain("Al-Fatihah, Ayah 1");
    expect(container.querySelector(".saved-place button")?.textContent).toContain(en.strings["panel.savedPlaceGo"]);
  });

  it("tapping Save again on the saved ayah clears it", async () => {
    await mount();
    await clickAyah("الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ");
    await clickSave();
    expect(window.localStorage.getItem(SAVED_PLACE_KEY)).not.toBeNull();

    await clickSave();

    expect(window.localStorage.getItem(SAVED_PLACE_KEY)).toBeNull();
    expect(saveButton()?.getAttribute("aria-pressed")).toBe("false");
  });

  it("saving a different ayah replaces the stored place", async () => {
    seedSavedPlace(1, 2);
    await mount();
    await clickAyah("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ");
    await clickSave();

    const stored = JSON.parse(window.localStorage.getItem(SAVED_PLACE_KEY) ?? "null") as
      | { surah: number; ayah: number }
      | null;
    expect(stored).toEqual({ surah: 1, ayah: 1, savedAt: expect.any(String) });
  });

  it("Go there lands on the saved surah and ayah", async () => {
    seedSavedPlace(2, 2);
    await mount();

    // Starts on Al-Fatihah ayah 1; the saved place is offered, not the current one.
    expect(container.querySelector(".saved-place")?.textContent).toContain("Al-Baqarah, Ayah 2");
    const goThere = container.querySelector<HTMLButtonElement>(".saved-place button");
    if (!goThere) throw new Error("No Go there button");
    await act(async () => {
      goThere.click();
    });
    await settle();

    // Landed on Al-Baqarah ayah 2: the panel shows that ayah, and Save reads Saved.
    expect(container.querySelector(".study-panel .selected-ayah")?.textContent).toContain("ذَٰلِكَ الْكِتَابُ لَا رَيْبَ");
    expect(container.querySelector(".study-panel .ayah-reference")?.textContent).toContain("Al-Baqarah");
    expect(saveButton()?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".saved-place")).toBeNull();
  });
});

describe("the panel drawer", () => {
  it("renders a toggle that opens the drawer and moves focus into it", async () => {
    await mount();

    const toggle = toggleButton();
    expect(toggle?.textContent).toContain(en.strings["panel.openPlace"]);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(panel()?.classList.contains("is-open")).toBe(false);

    await openDrawer();

    expect(panel()?.classList.contains("is-open")).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".panel-backdrop")).not.toBeNull();
    expect(document.activeElement).toBe(closeButton());
  });

  it("closes on backdrop click and returns focus to the toggle", async () => {
    await mount();
    await openDrawer();

    const backdrop = container.querySelector(".panel-backdrop");
    if (!backdrop) throw new Error("No backdrop");
    await act(async () => {
      (backdrop as HTMLElement).click();
    });
    await settle();

    expect(panel()?.classList.contains("is-open")).toBe(false);
    expect(container.querySelector(".panel-backdrop")).toBeNull();
    expect(document.activeElement).toBe(toggleButton());
  });

  it("closes on Escape and returns focus to the toggle", async () => {
    await mount();
    await openDrawer();

    const close = closeButton();
    if (!close) throw new Error("No close button");
    await act(async () => {
      close.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();

    expect(panel()?.classList.contains("is-open")).toBe(false);
    expect(document.activeElement).toBe(toggleButton());
  });
});

describe("Study view does not mirror the ayah in the panel", () => {
  it("keeps the ayah in the panel in Read view and out of it in Study view", async () => {
    await mount();

    // Read view: the panel mirrors the selected ayah — it is the only place
    // the translation shows, since the manuscript flow is Arabic-only.
    expect(container.querySelector(".study-panel .selected-ayah")).not.toBeNull();

    await openView(en.strings["mode.study"]);

    // Study view: the same ayah already shows large in the study card, so
    // the panel mirror is gone — but the panel's other blocks stay.
    expect(container.querySelector(".study-panel .selected-ayah")).toBeNull();
    expect(container.querySelector(".study-card .study-arabic")?.textContent).toContain("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ");
    expect(container.querySelector(".study-panel .audio-module")).not.toBeNull();
    expect(container.querySelector(".study-panel .completion-card")).not.toBeNull();
  });
});
