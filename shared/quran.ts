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
  /**
   * Whether this recitation was confirmed to serve audio. False means every
   * recitation listed under the reciter's name came back empty, so the picker
   * should say so rather than offer a control that cannot work.
   */
  available: boolean;
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

/**
 * One word of an ayah, and the recording of that word.
 *
 * Quran.com serves a word-by-word recitation as one small file per word. This
 * is that file, and the word it belongs to — the word text is carried so the
 * client can check the recording it is about to play is the word it means to
 * play, rather than trusting a position alone.
 *
 * It is a *recording of a reciter*, not a synthesised voice: no Quranic Arabic
 * is ever generated anywhere in this app. See docs/quran-word-audio.md.
 */
export type WordAudio = {
  /** 1-based position within the ayah, counting only words. */
  position: number;
  /** The word as the source gives it. Used to verify the position, not shown. */
  arabic: string;
  /** Absolute URL of the recording of this one word. */
  url: string;
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
  /**
   * The word-by-word recordings for this ayah, empty when the source served
   * none. Never a reason to hide the ayah: a missing word recording degrades to
   * the whole-ayah recitation the learner already had.
   */
  wordAudio: WordAudio[];
};

/**
 * What the word recordings actually are, so the interface can say so.
 *
 * Quran.com's word-by-word audio is a single recitation set that is not
 * selectable per reciter, so it is generally *not* the reciter the learner
 * chose for the ayah. The interface says which it is rather than letting a
 * learner assume the two voices are the same person.
 */
export type WordAudioSource = {
  /** The service the recordings come from. */
  provider: "quran.com";
  /** Separate files per word, as opposed to timed segments of an ayah file. */
  kind: "word-file";
  /**
   * The reciter, when the source names one. Quran.com does not name a reciter
   * on the word objects it serves, so this is null and the interface says
   * "word-by-word reference recitation" rather than inventing an attribution.
   */
  reciterName: string | null;
  /** Whether these recordings are by the reciter selected for the ayah. */
  matchesSelectedReciter: boolean;
};

export type SurahContent = {
  surah: SurahSummary;
  reciterId: number;
  /** The translation the ayah text below was fetched with. */
  translationId: number;
  ayahs: Ayah[];
  /** What the ayahs' `wordAudio` is, or null when none was served. */
  wordAudioSource: WordAudioSource | null;
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
