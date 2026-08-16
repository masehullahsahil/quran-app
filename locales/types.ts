/**
 * The shape of an instruction-language pack.
 *
 * A pack carries the *instruction layer* only — the language a learner is
 * taught in. It never carries Quranic content. The Arabic text of the Quran,
 * the ayah recitations, and the letter recordings are shared by every pack and
 * live outside this directory:
 *
 *   Quran text & ayah audio   Quran.com API, via server/quranApi.ts
 *   Arabic letter recordings  client/public/audio/letters/, one shared set
 *
 * A pack holds three things:
 *
 *   strings   UI labels, buttons, status messages
 *   lessons   teaching text — how a letter is articulated, what a step covers
 *   manifest  the language's own metadata, including where its instruction
 *             audio lives (spoken explanations *in that language*, which is a
 *             different thing from the shared Arabic recordings)
 */

/** BCP 47 code, e.g. "en", "ur", "tr", "id". */
export type LocaleCode = string;

export type LocaleManifest = {
  code: LocaleCode;
  /** The language's name in itself, for the picker: "English", "اردو". */
  name: string;
  /** The language's name in English, for documentation and debugging. */
  englishName: string;
  /** Writing direction of the instruction text. Arabic content sets its own. */
  direction: "ltr" | "rtl";
  /**
   * Directory holding spoken instruction audio in this language, served from
   * client/public. Shared Arabic letter recordings do NOT live here — those
   * stay in /audio/letters/ for every pack.
   */
  instructionAudioDir: string;
};

/** Teaching text for one Arabic letter. Keyed by the slug in arabicLetters.ts. */
export type LetterLesson = {
  /** Where and how the letter is articulated, in the instruction language. */
  articulation: string;
  /** Optional practice cue shown under the articulation note. */
  tip?: string;
};

export type LocaleLessons = {
  letters: Record<string, LetterLesson>;
};

/**
 * A pack other than the reference may leave any key out; the loader falls back
 * to English per key. `strings` is typed against the English key set in
 * locales/en, so a misspelled key is a compile error rather than a silent
 * fallback at runtime.
 */
export type LocalePack<TStrings extends Record<string, string> = Record<string, string>> = {
  manifest: LocaleManifest;
  strings: TStrings;
  lessons: LocaleLessons;
};
