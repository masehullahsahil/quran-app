/**
 * Client for the Quran.com content API (api.quran.com/api/v4).
 *
 * Everything that knows an upstream field name lives in this file. The rest of
 * the app consumes the reshaped types in shared/quran.ts, so an upstream change
 * is a change here and nowhere else.
 *
 * The API is public and needs no key, but it is a shared community service, so
 * every response goes through the TTL cache in quranCache.ts — a reader paging
 * back and forth through a surah costs one upstream fetch chain, not one per
 * view.
 */
import { ENV } from "./_core/env";
import { TtlCache } from "./quranCache";
import type { Ayah, JuzSummary, QuranIndex, Reciter, SurahContent, SurahSummary } from "@shared/quran";

/**
 * Ayah audio URLs come back relative to this host (e.g. "Alafasy/mp3/001001.mp3").
 * Some resources already carry an absolute URL, so absoluteAudioUrl() handles both.
 */
const AUDIO_CDN_BASE = "https://verses.quran.com/";

/**
 * Translation resources requested alongside the Arabic text.
 *
 * 131 is Dr. Mustafa Khattab's "The Clear Quran", which matches the English
 * register the reader already used. 57 is the Latin transliteration, which the
 * study and memorise panels show under the Arabic. Both are optional in the
 * response path below: if either resource stops being served, the ayah still
 * renders with its Arabic text and audio, and the missing line is hidden.
 */
const TRANSLATION_RESOURCE_ID = 131;
const TRANSLITERATION_RESOURCE_ID = 57;

/** The API caps per_page at 50; the longest surah (al-Baqarah) is 286 ayahs. */
const VERSES_PER_PAGE = 50;
const MAX_VERSE_PAGES = 20;

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

const cache = new TtlCache();

/** Exposed so tests can start from a cold cache. */
export function clearQuranCache(): void {
  cache.clear();
}

/**
 * The reciters the app offers, in the order they appear in the picker.
 *
 * Each entry carries both a known recitation id and a name pattern. The ids are
 * used as-is when the upstream recitation list is unavailable; when it is
 * available the pattern wins, so a renumbering upstream cannot silently swap
 * Husary's audio for someone else's. `preferStyle` disambiguates reciters who
 * have both a murattal and a mujawwad recording — the measured murattal reading
 * is the one to learn from.
 */
const CURATED_RECITERS: Array<{
  fallbackId: number;
  name: string;
  pattern: RegExp;
  preferStyle: RegExp;
}> = [
  { fallbackId: 7, name: "Mishari Rashid al-Afasy", pattern: /afasy/i, preferStyle: /murattal/i },
  { fallbackId: 6, name: "Mahmoud Khalil Al-Husary", pattern: /husary/i, preferStyle: /murattal/i },
  { fallbackId: 8, name: "Mohamed Siddiq al-Minshawi", pattern: /minsh[aā]w/i, preferStyle: /murattal/i },
];

export const DEFAULT_RECITER_ID = CURATED_RECITERS[0].fallbackId;

async function fetchJson<T>(path: string): Promise<T> {
  const base = ENV.quranApiBaseUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Quran.com request failed (${response.status} ${response.statusText}) for ${path}`);
  }

  return (await response.json()) as T;
}

type ChapterResponse = {
  chapters: Array<{
    id: number;
    name_simple: string;
    name_arabic: string;
    verses_count: number;
    revelation_place: string;
    bismillah_pre: boolean;
    translated_name?: { name?: string };
  }>;
};

export async function listSurahs(): Promise<SurahSummary[]> {
  return cache.fetch("chapters", DAY_MS, async () => {
    const payload = await fetchJson<ChapterResponse>("/chapters?language=en");
    return payload.chapters.map((chapter) => ({
      number: chapter.id,
      nameSimple: chapter.name_simple,
      nameArabic: chapter.name_arabic,
      translatedName: chapter.translated_name?.name ?? chapter.name_simple,
      versesCount: chapter.verses_count,
      revelationPlace: chapter.revelation_place,
      bismillahPre: chapter.bismillah_pre,
    }));
  });
}

type JuzResponse = {
  juzs: Array<{
    id: number;
    juz_number: number;
    /** Surah number → ayah range, e.g. { "2": "142-252" }. */
    verse_mapping: Record<string, string>;
  }>;
};

export async function listJuzs(): Promise<JuzSummary[]> {
  return cache.fetch("juzs", DAY_MS, async () => {
    const payload = await fetchJson<JuzResponse>("/juzs");

    // The API returns one entry per juz, but juz 1 has historically been split
    // across two rows in some responses. Merging by juz_number keeps the picker
    // at exactly 30 entries either way.
    const byNumber = new Map<number, string[]>();
    for (const juz of payload.juzs) {
      const surahs = byNumber.get(juz.juz_number) ?? [];
      for (const key of Object.keys(juz.verse_mapping ?? {})) {
        const surah = Number(key);
        if (Number.isInteger(surah) && !surahs.includes(key)) surahs.push(key);
      }
      byNumber.set(juz.juz_number, surahs);
    }

    const firstAyahOf = (juzNumber: number, surahKey: string): number => {
      const entry = payload.juzs.find((juz) => juz.juz_number === juzNumber);
      const range = entry?.verse_mapping?.[surahKey] ?? "1";
      const start = Number(range.split("-")[0]);
      return Number.isInteger(start) && start > 0 ? start : 1;
    };

    return Array.from(byNumber.entries())
      .map(([number, surahKeys]: [number, string[]]) => {
        const surahs = surahKeys.map(Number).sort((a, b) => a - b);
        const firstSurah = surahs[0] ?? 1;
        return {
          number,
          firstSurah,
          firstAyah: firstAyahOf(number, String(firstSurah)),
          surahs,
        };
      })
      .sort((a, b) => a.number - b.number);
  });
}

type RecitationResponse = {
  recitations: Array<{
    id: number;
    reciter_name: string;
    style?: string | null;
    translated_name?: { name?: string };
  }>;
};

export async function listReciters(): Promise<Reciter[]> {
  return cache.fetch("reciters", DAY_MS, async () => {
    const fallback = CURATED_RECITERS.map((entry) => ({
      id: entry.fallbackId,
      name: entry.name,
      style: null,
    }));

    let available: RecitationResponse["recitations"];
    try {
      available = (await fetchJson<RecitationResponse>("/resources/recitations?language=en")).recitations;
    } catch (error) {
      // The recitation list is metadata, not content. If it is unavailable the
      // known ids still resolve to real audio, so the reader keeps working.
      console.warn("[quran] Recitation list unavailable; using known reciter ids", error);
      return fallback;
    }

    return CURATED_RECITERS.map((entry, index) => {
      const matches = available.filter((option) => entry.pattern.test(option.reciter_name));
      const preferred = matches.find((option) => entry.preferStyle.test(option.style ?? "")) ?? matches[0];
      if (!preferred) return fallback[index];
      return {
        id: preferred.id,
        name: preferred.reciter_name,
        style: preferred.style?.trim() ? preferred.style : null,
      };
    });
  });
}

type VerseResponse = {
  verses: Array<{
    verse_number: number;
    verse_key: string;
    text_uthmani?: string;
    text_imlaei?: string;
    translations?: Array<{ resource_id: number; text: string }>;
  }>;
  pagination?: { next_page: number | null };
};

/** Translations arrive as light HTML (footnote superscripts); the reader shows plain text. */
function stripMarkup(text: string): string {
  return text
    .replace(/<sup[^>]*>.*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type VerseText = Omit<Ayah, "audioUrl">;

async function listVerseText(surah: number): Promise<VerseText[]> {
  return cache.fetch(`verses:${surah}`, DAY_MS, async () => {
    const collected: VerseText[] = [];
    let page: number | null = 1;

    while (page !== null && page <= MAX_VERSE_PAGES) {
      const query = new URLSearchParams({
        fields: "text_uthmani",
        translations: `${TRANSLATION_RESOURCE_ID},${TRANSLITERATION_RESOURCE_ID}`,
        per_page: String(VERSES_PER_PAGE),
        page: String(page),
      });
      const payload: VerseResponse = await fetchJson<VerseResponse>(
        `/verses/by_chapter/${surah}?${query.toString()}`,
      );

      for (const verse of payload.verses) {
        const translations = verse.translations ?? [];
        const byResource = (id: number) => {
          const text = translations.find((item) => item.resource_id === id)?.text;
          const cleaned = text ? stripMarkup(text) : "";
          return cleaned || null;
        };
        collected.push({
          number: verse.verse_number,
          verseKey: verse.verse_key,
          arabic: verse.text_uthmani ?? verse.text_imlaei ?? "",
          translation: byResource(TRANSLATION_RESOURCE_ID),
          transliteration: byResource(TRANSLITERATION_RESOURCE_ID),
        });
      }

      page = payload.pagination?.next_page ?? null;
    }

    if (!collected.length) throw new Error(`Quran.com returned no verses for surah ${surah}`);
    return collected.sort((a, b) => a.number - b.number);
  });
}

type AudioResponse = {
  audio_files: Array<{ verse_key?: string; url?: string | null }>;
};

function absoluteAudioUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${AUDIO_CDN_BASE}${url.replace(/^\/+/, "")}`;
}

async function listAudioByVerseKey(surah: number, reciterId: number): Promise<Record<string, string>> {
  return cache.fetch(`audio:${reciterId}:${surah}`, DAY_MS, async () => {
    const payload = await fetchJson<AudioResponse>(
      `/quran/recitations/${reciterId}?chapter_number=${surah}`,
    );
    const byVerseKey: Record<string, string> = {};
    for (const file of payload.audio_files ?? []) {
      if (file.verse_key && file.url) byVerseKey[file.verse_key] = absoluteAudioUrl(file.url);
    }
    return byVerseKey;
  });
}

export async function getQuranIndex(): Promise<QuranIndex> {
  const [surahs, juzs, reciters] = await Promise.all([listSurahs(), listJuzs(), listReciters()]);
  return { surahs, juzs, reciters };
}

/**
 * Arabic text, translations and per-ayah audio for one surah.
 *
 * Text and audio are cached separately because the text is the same whichever
 * reciter is selected — switching reciter refetches audio only.
 */
export async function getSurahContent(surah: number, reciterId: number): Promise<SurahContent> {
  const [surahs, verses] = await Promise.all([listSurahs(), listVerseText(surah)]);
  const summary = surahs.find((chapter) => chapter.number === surah);
  if (!summary) throw new Error(`Unknown surah ${surah}`);

  // A reciter with no recording for this surah should not cost the reader the
  // text as well, so audio failures degrade to a silent ayah.
  let audio: Record<string, string> = {};
  try {
    audio = await listAudioByVerseKey(surah, reciterId);
  } catch (error) {
    console.warn(`[quran] Audio unavailable for surah ${surah} (reciter ${reciterId})`, error);
  }

  return {
    surah: summary,
    reciterId,
    ayahs: verses.map((verse) => ({ ...verse, audioUrl: audio[verse.verseKey] ?? null })),
  };
}
