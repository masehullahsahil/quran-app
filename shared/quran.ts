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
  ayahs: Ayah[];
};

export type QuranIndex = {
  surahs: SurahSummary[];
  juzs: JuzSummary[];
  reciters: Reciter[];
};
