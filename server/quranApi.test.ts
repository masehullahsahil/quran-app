import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearQuranCache, getQuranIndex, getSurahContent, listJuzs, listReciters } from "./quranApi";

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
  name_arabic: "سورة",
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
  failRecitations?: boolean;
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
    // Al-Fatiha's basmala is ayah 1, so it gets no separate basmala line.
    expect(index.surahs[0].bismillahPre).toBe(false);
    expect(index.surahs[1].bismillahPre).toBe(true);
  });
});
