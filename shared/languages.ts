/**
 * The languages the app is built to teach in.
 *
 * This is the single source of truth for which languages exist, what they are
 * called, and which way their text runs. The locale registry, the language
 * picker, the document direction and the tests all read it from here.
 *
 * It describes the **instruction layer only** — the language a learner is
 * taught in. It says nothing about the Quran: the Arabic text, the ayah
 * recitations and the Arabic letter recordings are the same in every language
 * and are never translated. Changing the interface language must never change
 * a single letter of the Quran on screen.
 */

/**
 * Locale identifiers, BCP 47.
 *
 * `fa-AF` is the deliberate choice for Dari. Dari is the Afghan variety of
 * Persian; BCP 47 has no separate primary subtag for it (`prs` exists in some
 * registries but is not what browsers and `Intl` accept), so the region-tagged
 * Persian code is what interoperates: `Intl.NumberFormat("fa-AF")` and
 * `navigator.language` both understand it, and it degrades to Persian rather
 * than to nothing. `fa` alone would claim Iranian Persian, which is a different
 * register. This convention is documented in docs/localization.md and must not
 * be changed without migrating stored learner preferences.
 */
export const SUPPORTED_LANGUAGE_CODES = ["en", "ps", "fa-AF", "ur", "ar"] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export type TextDirection = "ltr" | "rtl";

/**
 * Where a pack's text came from, and how far it has been checked.
 *
 * This is a provenance record, not a quality score. `ai-drafted` says plainly
 * that a language model wrote the strings and the team read them — which is
 * what they are — and only a speaker of the language can move a pack past
 * `internally-checked`. Nothing in the app may present an unreviewed pack as
 * authoritative, least of all on religious terms.
 */
export type TranslationStatus = "reference" | "ai-drafted" | "internally-checked" | "native-reviewed";

/**
 * How much of the interface a pack currently carries in its own words.
 *
 * Honest labelling matters more than a full-looking picker: a learner choosing
 * Pashto should know the buttons are Pashto and the long lesson text is still
 * English, and a reviewer should know which packs have been read by a speaker
 * of the language.
 */
export type TranslationCoverage =
  /** The reference language. Everything originates here. */
  | "reference"
  /** Interface, teacher instructions and controls translated; long-form text falls back. */
  | "interface"
  /** A scaffold only: a few strings at most, mostly English fallback. */
  | "scaffold";

export type SupportedLanguage = {
  code: SupportedLanguageCode;
  /** The language's name in itself, for the picker. */
  name: string;
  /** The language's name in English, for documentation and debugging. */
  englishName: string;
  direction: TextDirection;
  coverage: TranslationCoverage;
  /**
   * Which of Quran.com's translation languages to offer this learner first.
   * A preference for the *translation of meaning*, never for the Arabic itself.
   * Matched case-insensitively against the API's `language_name`.
   */
  preferredTranslationLanguage: string;
  /** Spoken instruction audio in this language, served from client/public. */
  instructionAudioDir: string;
  /**
   * Whether a speaker of this language has reviewed the pack. Every non-English
   * pack starts false: the strings were written with care but not by a native
   * speaker, and saying so is the difference between a draft and a claim.
   */
  nativeReviewed: boolean;
  /** How this pack's text came to exist. See TranslationStatus. */
  translationStatus: TranslationStatus;
};

export const SUPPORTED_LANGUAGES: Record<SupportedLanguageCode, SupportedLanguage> = {
  en: {
    code: "en",
    name: "English",
    englishName: "English",
    direction: "ltr",
    coverage: "reference",
    preferredTranslationLanguage: "english",
    instructionAudioDir: "/audio/instruction/en",
    nativeReviewed: true,
    translationStatus: "reference",
  },
  ps: {
    code: "ps",
    name: "پښتو",
    englishName: "Pashto",
    direction: "rtl",
    coverage: "interface",
    preferredTranslationLanguage: "pashto",
    instructionAudioDir: "/audio/instruction/ps",
    nativeReviewed: false,
    translationStatus: "ai-drafted",
  },
  "fa-AF": {
    code: "fa-AF",
    name: "دری",
    englishName: "Dari",
    direction: "rtl",
    coverage: "interface",
    preferredTranslationLanguage: "persian",
    instructionAudioDir: "/audio/instruction/fa-AF",
    nativeReviewed: false,
    translationStatus: "ai-drafted",
  },
  ur: {
    code: "ur",
    name: "اردو",
    englishName: "Urdu",
    direction: "rtl",
    coverage: "interface",
    preferredTranslationLanguage: "urdu",
    instructionAudioDir: "/audio/instruction/ur",
    nativeReviewed: false,
    translationStatus: "ai-drafted",
  },
  ar: {
    code: "ar",
    name: "العربية",
    englishName: "Arabic",
    direction: "rtl",
    coverage: "interface",
    preferredTranslationLanguage: "arabic",
    instructionAudioDir: "/audio/instruction/ar",
    nativeReviewed: false,
    translationStatus: "ai-drafted",
  },
};

export const REFERENCE_LANGUAGE: SupportedLanguageCode = "en";

export function isSupportedLanguage(code: string): code is SupportedLanguageCode {
  return (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code);
}

/** The picker's order: the reference language first, then the rest by name. */
export function languagePickerOrder(): SupportedLanguage[] {
  return SUPPORTED_LANGUAGE_CODES.map((code) => SUPPORTED_LANGUAGES[code]).sort((left, right) =>
    left.code === REFERENCE_LANGUAGE ? -1 : right.code === REFERENCE_LANGUAGE ? 1 : left.englishName.localeCompare(right.englishName),
  );
}

/**
 * The direction the *interface* runs in. Quranic Arabic carries its own
 * `dir="rtl"` at the element level and is unaffected by this.
 */
export function directionFor(code: string): TextDirection {
  return isSupportedLanguage(code) ? SUPPORTED_LANGUAGES[code].direction : SUPPORTED_LANGUAGES[REFERENCE_LANGUAGE].direction;
}

/**
 * A best match for a browser's language list, or the reference language.
 * `fa` and `fa-IR` resolve to Dari here — the closest pack the app carries —
 * rather than falling all the way back to English.
 */
export function matchSupportedLanguage(preferred: readonly string[]): SupportedLanguageCode {
  for (const raw of preferred) {
    const tag = raw.trim();
    if (!tag) continue;
    if (isSupportedLanguage(tag)) return tag;
    const exact = SUPPORTED_LANGUAGE_CODES.find((code) => code.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
    const primary = tag.split("-")[0].toLowerCase();
    if (primary === "fa") return "fa-AF";
    const byPrimary = SUPPORTED_LANGUAGE_CODES.find((code) => code.split("-")[0].toLowerCase() === primary);
    if (byPrimary) return byPrimary;
  }
  return REFERENCE_LANGUAGE;
}
