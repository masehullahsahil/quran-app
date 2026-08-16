import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearQuranCache, getQuranIndex, getSurahContent, listJuzs, listReciters, listTranslations } from "./quranApi";

const originalFetch = global.fetch;

beforeEach(() => {
  clearQuranCache();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const chapter = (id: number, versesCount: number, bismillahPre = true) => ({
  id,
  name_simple: `Surah ${id}`,
  name_arabic: `سورة ${id}`,
  verses_count: versesCount,
  revelation_place: "makkah",
  bismillah_pre: bismillahPre,
  translated_name: { name: `The ${id}` },
});

const verse = (surah: number, number: number) => ({
  verse_number: number,
  verse_key: `${surah}:${number}`,
  text_uthmani: `arabic-${surah}-${number}`,
  translations: [
    { resource_id: 131, text: `meaning-${number} <sup foot_note="1">1</sup>` },
    { resource_id: 57, text: `translit-${number}` },
  ],
});

/**
 * Serves plausible Quran.com payloads and records every request, so a test can
 * assert both the reshaping and how many times the upstream was actually hit.
 */
function stubQuranApi(options: {
  chapters?: unknown[];
  versesPerPage?: Record<number, ReturnType<typeof verse>[][]>;
  audioFiles?: Array<{ verse_key: string; url: string }>;
  recitations?: Array<{ id: number; reciter_name: string; style?: string | null }>;
  translationResources?: Array<Record<string, unknown>>;
  failRecitations?: boolean;
  failTranslations?: boolean;
  failAudio?: boolean;
} = {}) {
  const calls: string[] = [];

  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);

    if (url.includes("/chapters")) {
      return new Response(JSON.stringify({ chapters: options.chapters ?? [chapter(1, 7, false), chapter(2, 286)] }));
    }

    if (url.includes("/juzs")) {
      return new Response(JSON.stringify({
        juzs: [
          { id: 1, juz_number: 1, verse_mapping: { "1": "1-7", "2": "1-141" } },
          { id: 2, juz_number: 2, verse_mapping: { "2": "142-252" } },
        ],
      }));
    }

    if (url.includes("/resources/translations")) {
      if (options.failTranslations) return new Response("nope", { status: 503 });
      return new Response(JSON.stringify({
        translations: options.translationResources ?? [
          { id: 131, name: "The Clear Quran", author_name: "Dr. Mustafa Khattab", language_name: "english", iso_code: "en" },
          { id: 57, name: "Transliteration", author_name: "Transliteration", language_name: "english", iso_code: "en" },
          { id: 97, name: "Jalandhari", author_name: "Fateh Muhammad Jalandhari", language_name: "urdu", iso_code: "ur" },
          { id: 118, name: "Pashto", author_name: "Zakaria Abulsalam", language_name: "pashto", iso_code: "ps" },
          { id: 210, name: "Dari", author_name: "Muhammad Anwar Badakhshani", language_name: "dari", iso_code: "prs" },
        ],
      }));
    }

    if (url.includes("/resources/recitations")) {
      if (options.failRecitations) return new Response("nope", { status: 503 });
      return new Response(JSON.stringify({
        recitations: options.recitations ?? [
          { id: 1, reciter_name: "AbdulBaset AbdulSamad", style: "Mujawwad" },
          { id: 61, reciter_name: "Mahmoud Khalil Al-Husary", style: "Murattal" },
          { id: 62, reciter_name: "Mishari Rashid al-`Afasy", style: "Murattal" },
          { id: 63, reciter_name: "Mohamed Siddiq al-Minshawi", style: "Mujawwad" },
          { id: 64, reciter_name: "Mohamed Siddiq al-Minshawi", style: "Murattal" },
        ],
      }));
    }

    if (url.includes("/verses/by_chapter/")) {
      const surah = Number(url.match(/by_chapter\/(\d+)/)?.[1]);
      const page = Number(new URL(url).searchParams.get("page") ?? "1");
      const pages = options.versesPerPage?.[surah] ?? [[verse(surah, 1), verse(surah, 2)]];
      const current = pages[page - 1] ?? [];
      return new Response(JSON.stringify({
        verses: current,
        pagination: { next_page: page < pages.length ? page + 1 : null },
      }));
    }

    if (url.includes("/quran/recitations/")) {
      if (options.failAudio) return new Response("nope", { status: 503 });
      return new Response(JSON.stringify({
        audio_files: options.audioFiles ?? [
          { verse_key: "1:1", url: "Alafasy/mp3/001001.mp3" },
          { verse_key: "1:2", url: "Alafasy/mp3/001002.mp3" },
        ],
      }));
    }

    throw new Error(`Unexpected request to ${url}`);
  }) as unknown as typeof fetch;

  return calls;
}

describe("getSurahContent", () => {
  it("merges Arabic text, translations and per-ayah audio", async () => {
    stubQuranApi();

    const content = await getSurahContent(1, 7);

    expect(content.surah.number).toBe(1);
    expect(content.surah.versesCount).toBe(7);
    expect(content.ayahs).toEqual([
      {
        number: 1,
        verseKey: "1:1",
        arabic: "arabic-1-1",
        translation: "meaning-1",
        transliteration: "translit-1",
        audioUrl: "https://verses.quran.com/Alafasy/mp3/001001.mp3",
      },
      {
        number: 2,
        verseKey: "1:2",
        arabic: "arabic-1-2",
        translation: "meaning-2",
        transliteration: "translit-2",
        audioUrl: "https://verses.quran.com/Alafasy/mp3/001002.mp3",
      },
    ]);
  });

  // Longer surahs exceed the API's 50-per-page cap; al-Baqarah needs six pages.
  it("follows pagination until the last page of a long surah", async () => {
    const pages = [
      [verse(2, 1), verse(2, 2)],
      [verse(2, 3)],
    ];
    const calls = stubQuranApi({ versesPerPage: { 2: pages }, audioFiles: [] });

    const content = await getSurahContent(2, 7);

    expect(content.ayahs.map((ayah) => ayah.number)).toEqual([1, 2, 3]);
    expect(calls.filter((url) => url.includes("/verses/by_chapter/2")).length).toBe(2);
  });

  it("leaves already-absolute audio URLs untouched", async () => {
    stubQuranApi({
      audioFiles: [{ verse_key: "1:1", url: "https://audio.qurancdn.com/Alafasy/mp3/001001.mp3" }],
    });

    const content = await getSurahContent(1, 7);

    expect(content.ayahs[0].audioUrl).toBe("https://audio.qurancdn.com/Alafasy/mp3/001001.mp3");
  });

  // The text is the point; a reciter with no recording should not hide it.
  it("still returns the text when the audio request fails", async () => {
    stubQuranApi({ failAudio: true });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const content = await getSurahContent(1, 7);

    expect(content.ayahs[0].arabic).toBe("arabic-1-1");
    expect(content.ayahs.every((ayah) => ayah.audioUrl === null)).toBe(true);
  });

  it("requests the chosen translation and reports it back", async () => {
    const calls = stubQuranApi();

    const content = await getSurahContent(1, 7, 97);

    expect(content.translationId).toBe(97);
    const verseCall = calls.find((url) => url.includes("/verses/by_chapter/"));
    // The transliteration rides along with whatever translation was chosen.
    expect(verseCall).toContain("translations=97%2C57");
  });

  // The Arabic is identical either way, but the text under it is not, so the two
  // must not share a cache entry.
  it("caches text per translation, not just per surah", async () => {
    const calls = stubQuranApi();

    await getSurahContent(1, 7, 131);
    await getSurahContent(1, 7, 97);
    await getSurahContent(1, 7, 131);

    const textCalls = calls.filter((url) => url.includes("/verses/by_chapter/"));
    expect(textCalls).toHaveLength(2);
  });

  it("fetches a surah's text once across repeated reads and reciter switches", async () => {
    const calls = stubQuranApi();

    await getSurahContent(1, 7);
    await getSurahContent(1, 7);
    await getSurahContent(1, 6);

    const textCalls = calls.filter((url) => url.includes("/verses/by_chapter/"));
    const audioCalls = calls.filter((url) => url.includes("/quran/recitations/"));
    expect(textCalls.length).toBe(1);
    // One per reciter: the text is shared, the recitation is not.
    expect(audioCalls.length).toBe(2);
  });
});

describe("listTranslations", () => {
  // The point of the change: the list is whatever the API serves, so a language
  // added upstream needs no code change here.
  it("returns every language the API advertises, not a curated subset", async () => {
    stubQuranApi();

    const translations = await listTranslations();
    const languages = translations.map((item) => item.languageName);

    expect(languages).toContain("English");
    expect(languages).toContain("Urdu");
    expect(languages).toContain("Pashto");
    expect(languages).toContain("Dari");
  });

  it("picks up a language the API adds without a code change", async () => {
    stubQuranApi({
      translationResources: [
        { id: 900, name: "Brand New", author_name: "A Translator", language_name: "sindhi", iso_code: "sd" },
      ],
    });

    const translations = await listTranslations();

    expect(translations).toEqual([
      { id: 900, name: "Brand New", authorName: "A Translator", languageName: "Sindhi", languageCode: "sd" },
    ]);
  });

  // Transliteration is shown alongside every translation, so it is not one of
  // the choices offered.
  it("excludes the transliteration resource from the choices", async () => {
    stubQuranApi();
    const translations = await listTranslations();
    expect(translations.some((item) => item.id === 57)).toBe(false);
  });

  it("sorts by language then translator", async () => {
    stubQuranApi();
    const translations = await listTranslations();
    const languages = translations.map((item) => item.languageName);
    expect(languages).toEqual([...languages].sort((a, b) => a.localeCompare(b)));
  });

  it("titles-cases the API's lowercase language names", async () => {
    stubQuranApi({
      translationResources: [
        { id: 1, name: "x", author_name: "x", language_name: "chinese traditional" },
      ],
    });
    expect((await listTranslations())[0].languageName).toBe("Chinese Traditional");
  });

  it("leaves the reader with the Quran when the translation list fails", async () => {
    stubQuranApi({ failTranslations: true });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const index = await getQuranIndex();

    expect(index.translations).toEqual([]);
    expect(index.surahs.length).toBeGreaterThan(0);
  });
});

describe("listReciters", () => {
  it("resolves the curated reciters by name and prefers the murattal reading", async () => {
    const reciters = await (async () => {
      stubQuranApi();
      return listReciters();
    })();

    expect(reciters).toEqual([
      { id: 62, name: "Mishari Rashid al-`Afasy", style: "Murattal" },
      { id: 61, name: "Mahmoud Khalil Al-Husary", style: "Murattal" },
      { id: 64, name: "Mohamed Siddiq al-Minshawi", style: "Murattal" },
    ]);
  });

  it("falls back to known ids when the recitation list is unavailable", async () => {
    stubQuranApi({ failRecitations: true });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const reciters = await listReciters();

    expect(reciters.map((reciter) => reciter.id)).toEqual([7, 6, 8]);
    expect(reciters[0].name).toContain("Afasy");
  });
});

describe("listJuzs", () => {
  it("exposes each juz with the ayah it starts at", async () => {
    stubQuranApi();

    const juzs = await listJuzs();

    expect(juzs).toEqual([
      { number: 1, firstSurah: 1, firstAyah: 1, surahs: [1, 2] },
      { number: 2, firstSurah: 2, firstAyah: 142, surahs: [2] },
    ]);
  });
});

describe("getQuranIndex", () => {
  it("returns the surah, juz and reciter lists together", async () => {
    stubQuranApi();

    const index = await getQuranIndex();

    expect(index.surahs.map((surah) => surah.number)).toEqual([1, 2]);
    expect(index.juzs.map((juz) => juz.number)).toEqual([1, 2]);
    expect(index.reciters.length).toBe(3);
    expect(index.translations.map((item) => item.languageName)).toContain("Pashto");
    // Al-Fatiha's basmala is ayah 1, so it gets no separate basmala line.
    expect(index.surahs[0].bismillahPre).toBe(false);
    expect(index.surahs[1].bismillahPre).toBe(true);
  });
});
