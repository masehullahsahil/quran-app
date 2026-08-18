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
import type { Ayah, JuzSummary, QuranIndex, Reciter, SurahContent, SurahSummary, Translation } from "@shared/quran";

/**
 * Ayah audio URLs come back relative to this host (e.g. "Alafasy/mp3/001001.mp3").
 * Some resources already carry an absolute URL, so absoluteAudioUrl() handles both.
 */
const AUDIO_CDN_BASE = "https://verses.quran.com/";

/**
 * The translation shown under each ayah is chosen by the reader from the list
 * the API advertises, so no translation id is hardcoded here. This is only the
 * fallback used when no choice has been made yet: Dr. Mustafa Khattab's "The
 * Clear Quran", which matches the English register the reader already used.
 */
export const DEFAULT_TRANSLATION_ID = 131;

/**
 * The Latin transliteration is not a translation choice — it is the same
 * romanisation of the Arabic whichever language a reader has selected, so it is
 * always requested alongside whatever translation they picked.
 *
 * Both are optional in the response path below: if either resource stops being
 * served, the ayah still renders with its Arabic text and audio, and the
 * missing line is hidden.
 */
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

const RECITER_ABDUL_BASIT = /abdul[\s-]*ba[sz][ei]t/i;
const RECITER_SHURAIM = /shura[iy]m/i;

/**
 * The reciters the app offers, in the order they appear in the picker.
 *
 * A reciter is matched by *name* against /resources/recitations, and whichever
 * of their recordings actually serves audio is what gets offered — see
 * rankRecitations() for the ordering and resolveReciter() for the probe. Nothing
 * here is trusted to work simply because it is written down.
 *
 * `fallbackId` is a recitation id already known to serve audio, used only when
 * the recitations list itself is unreachable. It is deliberately absent for
 * reciters whose id has not been confirmed: an unverified id is worse than none,
 * because a wrong one points at a different reciter's audio instead of failing
 * honestly. Those entries resolve by name from the live API, or are not offered.
 *
 * Al-Husary was removed after his recordings kept resolving to recitations that
 * serve no audio. To bring him back, add him the way the id-less entries below
 * are written — by name, and let the probe decide.
 */
const CURATED_RECITERS: Array<{
  fallbackId?: number;
  name: string;
  pattern: RegExp;
  preferStyle: RegExp;
}> = [
  // Written "Alafasy", "al-`Afasy" and "Al-Afasy" upstream at different times.
  { fallbackId: 7, name: "Mishari Rashid al-Afasy", pattern: /afasy/i, preferStyle: /murattal/i },
  // "AbdulBaset AbdulSamad" upstream; also written "Abdul Basit Abdul Samad".
  // He has both a mujawwad and a murattal reading; the murattal is the measured
  // one to learn from, which is what preferStyle selects.
  { name: "AbdulBaset AbdulSamad", pattern: RECITER_ABDUL_BASIT, preferStyle: /murattal/i },
  // "Saud ash-Shuraym" / "Saud Al-Shuraim".
  { name: "Saud Al-Shuraim", pattern: RECITER_SHURAIM, preferStyle: /murattal/i },
  { fallbackId: 8, name: "Mohamed Siddiq al-Minshawi", pattern: /minsh[a\u0101]w/i, preferStyle: /murattal/i },
];

export const DEFAULT_RECITER_ID = CURATED_RECITERS[0].fallbackId ?? 7;

/**
 * Order a reciter's recordings by how well they suit this app, best first.
 *
 * A reciter appears several times in the API with different `style` values.
 * Husary is the case that matters: alongside his standard reading there is a
 * *Muallim* recording — a teaching take that repeats each word for the learner
 * to copy. It is a fine thing to study with, but it is not the same recitation,
 * and it sits badly with a listen-then-repeat loop that assumes one clean
 * reading of the ayah.
 *
 * This returns an ordered list rather than one pick, because a recitation being
 * listed is not the same as it serving audio — see resolveReciter(), which
 * walks this order and takes the first that actually has files.
 *
 *   1. the preferred style, when the API labels one;
 *   2. the entry with no style — a reciter's unlabelled recording is their
 *      standard reading;
 *   3. any other style, last. Offered only if nothing better serves audio, and
 *      labelled with its real style so it never promises a reading it is not.
 */
export function rankRecitations<T extends { style?: string | null }>(
  matches: T[],
  preferStyle: RegExp,
): T[] {
  const preferred: T[] = [];
  const unstyled: T[] = [];
  const other: T[] = [];

  for (const option of matches) {
    if (preferStyle.test(option.style ?? "")) preferred.push(option);
    else if (!option.style?.trim()) unstyled.push(option);
    else other.push(option);
  }

  return [...preferred, ...unstyled, ...other];
}

/**
 * Chapters probed when confirming a recitation actually serves audio.
 *
 * Spread across the mushaf rather than clustered at the front, because "surah 1
 * works" was exactly the assumption that let a broken reciter ship. Kept short —
 * al-Fatiha (7 ayahs), Ya-Sin (83), al-Ikhlas (4) — so the check stays cheap,
 * and the responses go through the same cache the reader uses, so probing warms
 * it rather than wasting it.
 */
const AUDIO_PROBE_CHAPTERS = [1, 36, 112];

/** Whether a recitation id serves audio for every probed chapter. */
async function recitationServesAudio(reciterId: number): Promise<boolean> {
  const probes = await Promise.all(
    AUDIO_PROBE_CHAPTERS.map(async (surah) => {
      try {
        return Object.keys(await listAudioByVerseKey(surah, reciterId)).length > 0;
      } catch {
        return false;
      }
    }),
  );
  return probes.every(Boolean);
}

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

/**
 * Resolve one curated reciter to a recitation that actually plays.
 *
 * Being listed by the API is not the same as serving audio — that gap is what
 * left Husary silent. So each candidate is probed in rank order and the first
 * that serves files across AUDIO_PROBE_CHAPTERS wins. The label always reports
 * the style of whatever was chosen, so the picker cannot promise a reading the
 * reader is not getting.
 */
async function resolveReciter(
  entry: (typeof CURATED_RECITERS)[number],
  available: RecitationResponse["recitations"],
): Promise<Reciter | null> {
  const matches = available.filter((option) => entry.pattern.test(option.reciter_name));
  const ranked = rankRecitations(matches, entry.preferStyle);

  for (const candidate of ranked) {
    if (await recitationServesAudio(candidate.id)) {
      return {
        id: candidate.id,
        name: candidate.reciter_name,
        style: candidate.style?.trim() ? candidate.style : null,
        available: true,
      };
    }
    console.warn(
      `[quran] ${entry.name}: recitation ${candidate.id} (${candidate.style ?? "unstyled"}) serves no audio; trying the next`,
    );
  }

  // Nothing the API listed under this name plays. A known-good id is the last
  // thing to try — it predates the list and may still serve files.
  if (entry.fallbackId !== undefined) {
    if (await recitationServesAudio(entry.fallbackId)) {
      return { id: entry.fallbackId, name: entry.name, style: null, available: true };
    }
    console.warn(
      `[quran] ${entry.name}: no recitation serves audio (tried ${[...ranked.map((c) => c.id), entry.fallbackId].join(", ")})`,
    );
    return { id: entry.fallbackId, name: entry.name, style: null, available: false };
  }

  // No confirmed id to fall back to, so there is nothing honest to show. Leave
  // the reciter out rather than offer a control pointing at a guess.
  console.warn(
    `[quran] ${entry.name}: not offered — nothing under that name serves audio${
      ranked.length ? ` (tried ${ranked.map((c) => c.id).join(", ")})` : " and the API lists none"
    }`,
  );
  return null;
}

export async function listReciters(): Promise<Reciter[]> {
  return cache.fetch("reciters", DAY_MS, async () => {
    let available: RecitationResponse["recitations"] = [];
    try {
      available = (await fetchJson<RecitationResponse>("/resources/recitations?language=en")).recitations;
    } catch (error) {
      // The recitation list is metadata, not content. Without it the known ids
      // are all we have, but they are still probed below rather than trusted.
      console.warn("[quran] Recitation list unavailable; falling back to known reciter ids", error);
    }

    const resolved = await Promise.all(CURATED_RECITERS.map((entry) => resolveReciter(entry, available)));
    return resolved.filter((reciter): reciter is Reciter => reciter !== null);
  });
}

type TranslationResponse = {
  translations: Array<{
    id: number;
    name: string;
    author_name?: string;
    slug?: string;
    language_name?: string;
    iso_code?: string;
    translated_name?: { name?: string };
  }>;
};

/** "english" → "English", "chinese traditional" → "Chinese Traditional". */
function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Every translation the API advertises, grouped by language on the client.
 *
 * Deliberately unfiltered: the reader offers whatever Quran.com serves, so a
 * language added upstream — Pashto, Dari, or anything else — appears here with
 * no code change. The only entry removed is the Latin transliteration, which is
 * shown alongside every translation rather than being one of them.
 */
export async function listTranslations(): Promise<Translation[]> {
  return cache.fetch("translations", DAY_MS, async () => {
    const payload = await fetchJson<TranslationResponse>("/resources/translations?language=en");

    return payload.translations
      .filter((item) => item.id !== TRANSLITERATION_RESOURCE_ID)
      .map((item) => {
        const languageName = item.language_name?.trim();
        return {
          id: item.id,
          name: item.translated_name?.name?.trim() || item.name,
          authorName: item.author_name?.trim() || item.name,
          languageName: languageName ? titleCase(languageName) : "Other",
          languageCode: item.iso_code?.trim() || null,
        };
      })
      .sort((a, b) => (
        a.languageName.localeCompare(b.languageName) || a.authorName.localeCompare(b.authorName)
      ));
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

async function listVerseText(surah: number, translationId: number): Promise<VerseText[]> {
  // The translation is part of the cache key: the Arabic is the same either way,
  // but the text under it is not, so two readers on different translations must
  // not share an entry.
  return cache.fetch(`verses:${surah}:${translationId}`, DAY_MS, async () => {
    const collected: VerseText[] = [];
    let page: number | null = 1;

    while (page !== null && page <= MAX_VERSE_PAGES) {
      const query = new URLSearchParams({
        fields: "text_uthmani",
        translations: `${translationId},${TRANSLITERATION_RESOURCE_ID}`,
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
          translation: byResource(translationId),
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
  const [surahs, juzs, reciters, translations] = await Promise.all([
    listSurahs(),
    listJuzs(),
    listReciters(),
    // The translation list is metadata: losing it should cost the reader the
    // picker, not the Quran. The default translation still resolves without it.
    listTranslations().catch((error) => {
      console.warn("[quran] Translation list unavailable", error);
      return [] as Translation[];
    }),
  ]);
  return { surahs, juzs, reciters, translations };
}

/**
 * Arabic text, translations and per-ayah audio for one surah.
 *
 * Text and audio are cached separately because the text is the same whichever
 * reciter is selected — switching reciter refetches audio only.
 */
export async function getSurahContent(
  surah: number,
  reciterId: number,
  translationId: number = DEFAULT_TRANSLATION_ID,
): Promise<SurahContent> {
  const [surahs, verses] = await Promise.all([listSurahs(), listVerseText(surah, translationId)]);
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
    translationId,
    ayahs: verses.map((verse) => ({ ...verse, audioUrl: audio[verse.verseKey] ?? null })),
  };
}
