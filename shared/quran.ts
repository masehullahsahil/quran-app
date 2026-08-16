/**
 * Types shared between the Quran.com API client on the server and the reader UI.
 *
 * The server reshapes api.quran.com responses into these before they reach the
 * client, so the upstream field names (`text_uthmani`, `verse_key`, …) stay
 * inside server/quranApi.ts and the UI only deals with this vocabulary.
 */

export type SurahSummary = {
  number: number;
  nameSimple: string;
  nameArabic: string;
  translatedName: string;
  versesCount: number;
  revelationPlace: string;
  /** True when the surah is preceded by a basmala that is not counted as ayah 1. */
  bismillahPre: boolean;
};

export type JuzSummary = {
  number: number;
  /** First ayah of the juz, used as the jump target for juz navigation. */
  firstSurah: number;
  firstAyah: number;
  /** Surah numbers this juz spans, in order. */
  surahs: number[];
};

export type Reciter = {
  id: number;
  name: string;
  style: string | null;
};

/** One translation resource advertised by the API, e.g. a Pashto translation. */
export type Translation = {
  id: number;
  /** Display name of the translation itself. */
  name: string;
  /** Translator, used as the option label within a language group. */
  authorName: string;
  /** Language this translation is written in, title-cased for grouping. */
  languageName: string;
  /** ISO code when the API supplies one, for matching against a locale pack. */
  languageCode: string | null;
};

export type Ayah = {
  number: number;
  /** "2:255" — the canonical Quran.com identifier for the ayah. */
  verseKey: string;
  arabic: string;
  translation: string | null;
  transliteration: string | null;
  /** Absolute audio URL, or null when the reciter has no file for this ayah. */
  audioUrl: string | null;
};

export type SurahContent = {
  surah: SurahSummary;
  reciterId: number;
  /** The translation the ayah text below was fetched with. */
  translationId: number;
  ayahs: Ayah[];
};

export type QuranIndex = {
  surahs: SurahSummary[];
  juzs: JuzSummary[];
  reciters: Reciter[];
  /**
   * Every translation the API offers, straight from it rather than a curated
   * list — a language added upstream shows up with no code change. Empty when
   * the metadata call failed; the reader still gets its default translation.
   */
  translations: Translation[];
};
