/**
 * Instruction-language registry and loader.
 *
 * English is imported statically because it is the fallback: every other pack
 * is allowed to be incomplete, so English has to be present before any other
 * language can render. Other packs are loaded on demand, so adding a tenth
 * language does not grow the initial bundle.
 */
import en, { type StringKey } from "./en";
import { CRITICAL_STRING_KEYS } from "./critical";
import { REFERENCE_LANGUAGE, SUPPORTED_LANGUAGES, directionFor } from "../shared/languages";
import type { LetterLesson, LocaleCode, LocalePack, LocaleManifest } from "./types";
import type { QaidaTextPack } from "../shared/qaidaText";

export type { LocaleCode, LocaleManifest, LocalePack, LetterLesson, StringKey };
export type TranslatableStrings = Partial<Record<StringKey, string>>;

/**
 * Every language the app offers.
 *
 * `load` is a dynamic import so a pack's strings are only fetched when someone
 * selects that language. To add a language: create locales/<code>/index.ts from
 * the scaffold, then add a row here.
 */
type LocaleEntry = {
  manifest: LocaleManifest;
  load: () => Promise<LocalePack<TranslatableStrings>>;
};

export const REFERENCE_LOCALE: LocaleCode = REFERENCE_LANGUAGE;

/**
 * Every language the app carries, built from the one language model in
 * shared/languages.ts so the registry, the picker and the document direction
 * can never disagree about what exists or which way it runs.
 */
export const LOCALES: Record<LocaleCode, LocaleEntry> = {
  en: { manifest: SUPPORTED_LANGUAGES.en, load: async () => en as LocalePack<TranslatableStrings> },
  ps: { manifest: SUPPORTED_LANGUAGES.ps, load: async () => (await import("./ps")).default as LocalePack<TranslatableStrings> },
  "fa-AF": { manifest: SUPPORTED_LANGUAGES["fa-AF"], load: async () => (await import("./fa-AF")).default as LocalePack<TranslatableStrings> },
  ur: { manifest: SUPPORTED_LANGUAGES.ur, load: async () => (await import("./ur")).default as LocalePack<TranslatableStrings> },
  ar: { manifest: SUPPORTED_LANGUAGES.ar, load: async () => (await import("./ar")).default as LocalePack<TranslatableStrings> },
};

/** The picker's options, reference language first. */
export function availableLocales(): LocaleManifest[] {
  return Object.values(LOCALES)
    .map((entry) => entry.manifest)
    .sort((a, b) => (a.code === REFERENCE_LOCALE ? -1 : b.code === REFERENCE_LOCALE ? 1 : a.englishName.localeCompare(b.englishName)));
}

export function isKnownLocale(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOCALES, code);
}

/**
 * A pack merged over English.
 *
 * The fallback is per key, not per pack: a half-translated language shows its
 * own strings where it has them and English everywhere else, rather than being
 * held back until it is complete. The same applies to `lessons.letters`, where
 * a single letter may be translated while the rest are not.
 */
export type ResolvedLocale = {
  manifest: LocaleManifest;
  /** True where the pack supplied nothing at all and English is standing in. */
  isReference: boolean;
  t: (key: StringKey, values?: Record<string, string | number>) => string;
  letterLesson: (slug: string) => LetterLesson | null;
  /** Instruction audio in this language, falling back to English's directory. */
  instructionAudio: (name: string) => string;
  /** Qaida course prose in this language, if the pack carries any. */
  qaida: QaidaTextPack | undefined;
  /** Keys this pack does not define — English is used for them. */
  missingKeys: StringKey[];
  /** Writing direction of the interface. Quranic Arabic sets its own. */
  direction: "ltr" | "rtl";
  /**
   * How much of this pack is in its own words, so the interface can say so
   * rather than implying a half-written pack is finished.
   */
  coverage: {
    /** Share of all reference keys the pack defines, 0–1. */
    strings: number;
    /** True when every key a learner meets constantly is translated. */
    criticalComplete: boolean;
    /** Critical keys still falling back to English. */
    missingCritical: StringKey[];
  };
};

const PLACEHOLDER = /\{(\w+)\}/g;

function format(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  ));
}

export function resolvePack(pack: LocalePack<TranslatableStrings>): ResolvedLocale {
  const referenceKeys = Object.keys(en.strings) as StringKey[];
  const missingKeys = referenceKeys.filter((key) => {
    const value = pack.strings[key];
    return typeof value !== "string" || value.length === 0;
  });

  const missingCritical = CRITICAL_STRING_KEYS.filter((key) => missingKeys.includes(key));

  return {
    manifest: pack.manifest,
    isReference: pack.manifest.code === REFERENCE_LOCALE,
    missingKeys,
    direction: directionFor(pack.manifest.code),
    coverage: {
      strings: referenceKeys.length ? (referenceKeys.length - missingKeys.length) / referenceKeys.length : 1,
      criticalComplete: missingCritical.length === 0,
      missingCritical: [...missingCritical],
    },
    t: (key, values) => {
      const own = pack.strings[key];
      const template = typeof own === "string" && own.length > 0 ? own : en.strings[key];
      // An unknown key cannot happen through the typed API, but a pack loaded
      // from disk at runtime could still be stale — show the key rather than
      // an empty space, so the gap is visible instead of silent.
      return format(template ?? key, values);
    },
    letterLesson: (slug) => pack.lessons?.letters?.[slug] ?? en.lessons.letters[slug] ?? null,
    qaida: pack.qaida,
    instructionAudio: (name) => {
      const dir = pack.manifest.instructionAudioDir || en.manifest.instructionAudioDir;
      return `${dir.replace(/\/+$/, "")}/${name}`;
    },
  };
}

/** Loads a pack by code, falling back to the reference pack for unknown codes. */
export async function loadLocale(code: LocaleCode): Promise<ResolvedLocale> {
  const entry = LOCALES[code] ?? LOCALES[REFERENCE_LOCALE];
  try {
    return resolvePack(await entry.load());
  } catch (error) {
    console.warn(`[locale] Pack "${code}" could not be loaded; using ${REFERENCE_LOCALE}`, error);
    return resolvePack(en as LocalePack<TranslatableStrings>);
  }
}

export const referencePack = en;
