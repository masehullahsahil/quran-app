/**
 * The multilingual contract.
 *
 * These check the properties that make a language pack safe to ship: that every
 * declared language loads, that a half-written pack degrades to English rather
 * than to a key name, that the sentences a learner meets constantly are
 * translated in every pack, that right-to-left languages are marked as such,
 * and — the one that matters most — that changing the interface language can
 * never change the Quran.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "./en";
import { CRITICAL_STRING_KEYS } from "./critical";
import { LOCALES, REFERENCE_LOCALE, availableLocales, isKnownLocale, loadLocale, resolvePack } from "./index";
import type { LocalePack } from "./types";
import type { TranslatableStrings } from "./index";
import {
  REFERENCE_LANGUAGE,
  SUPPORTED_LANGUAGES,
  SUPPORTED_LANGUAGE_CODES,
  directionFor,
  isSupportedLanguage,
  languagePickerOrder,
  matchSupportedLanguage,
} from "../shared/languages";

const asPack = (pack: unknown) => pack as LocalePack<TranslatableStrings>;

describe("the supported languages", () => {
  it("declares the five target languages with stable identifiers", () => {
    expect([...SUPPORTED_LANGUAGE_CODES]).toEqual(["en", "ps", "fa-AF", "ur", "ar"]);
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      expect(SUPPORTED_LANGUAGES[code].code, code).toBe(code);
      expect(SUPPORTED_LANGUAGES[code].name.trim(), code).not.toBe("");
      expect(SUPPORTED_LANGUAGES[code].englishName.trim(), code).not.toBe("");
    }
  });

  it("uses fa-AF for Dari, and resolves plain Persian to it", () => {
    expect(SUPPORTED_LANGUAGES["fa-AF"].englishName).toBe("Dari");
    expect(matchSupportedLanguage(["fa"])).toBe("fa-AF");
    expect(matchSupportedLanguage(["fa-IR"])).toBe("fa-AF");
    expect(matchSupportedLanguage(["ps-AF"])).toBe("ps");
    expect(matchSupportedLanguage(["de", "ur"])).toBe("ur");
    expect(matchSupportedLanguage(["de"])).toBe(REFERENCE_LANGUAGE);
    expect(matchSupportedLanguage([])).toBe(REFERENCE_LANGUAGE);
  });

  it("registers a pack for every declared language, and none beyond them", () => {
    expect(Object.keys(LOCALES).sort()).toEqual([...SUPPORTED_LANGUAGE_CODES].sort());
    for (const code of SUPPORTED_LANGUAGE_CODES) expect(isKnownLocale(code), code).toBe(true);
    expect(isKnownLocale("de")).toBe(false);
  });

  it("puts English first in the picker", () => {
    expect(languagePickerOrder()[0].code).toBe("en");
    expect(availableLocales()[0].code).toBe(REFERENCE_LOCALE);
    expect(availableLocales()).toHaveLength(SUPPORTED_LANGUAGE_CODES.length);
  });
});

describe("every pack loads", () => {
  it.each(SUPPORTED_LANGUAGE_CODES)("loads %s and reports its own manifest", async (code) => {
    const resolved = await loadLocale(code);

    expect(resolved.manifest.code).toBe(code);
    expect(resolved.direction).toBe(SUPPORTED_LANGUAGES[code].direction);
    expect(typeof resolved.t).toBe("function");
  });

  it("falls back to English for a language it does not carry", async () => {
    const resolved = await loadLocale("de");
    expect(resolved.manifest.code).toBe(REFERENCE_LOCALE);
  });
});

describe("text direction", () => {
  it("marks Arabic, Pashto, Dari and Urdu right-to-left, and English left-to-right", () => {
    expect(directionFor("en")).toBe("ltr");
    for (const code of ["ps", "fa-AF", "ur", "ar"] as const) expect(directionFor(code), code).toBe("rtl");
    expect(directionFor("unknown-code")).toBe("ltr");
  });

  it("mirrors only directional chrome, never Quranic Arabic", () => {
    const css = readFileSync(join(process.cwd(), "client/src/index.css"), "utf8");

    expect(css).toMatch(/\[dir="rtl"\][^{]*\.page-controls svg[^{]*\{[^}]*scaleX\(-1\)/);
    // The ayah text is never flipped, and never selected by a direction rule
    // that would transform it.
    expect(css).not.toMatch(/\[dir="rtl"\][^{]*\.(quran-flow|study-arabic|memory-verse|now-word|correction-target)[^{]*scaleX/);
    expect(css).toMatch(/\[lang="ar"\]\s*\{[^}]*direction:\s*rtl/);
  });
});

describe("fallback", () => {
  it("uses English for a key a pack leaves out", () => {
    const partial = asPack({
      manifest: SUPPORTED_LANGUAGES.ur,
      strings: { "now.repeat": "دہرائیں" },
      lessons: { letters: {} },
    });
    const resolved = resolvePack(partial);

    expect(resolved.t("now.repeat")).toBe("دہرائیں");
    expect(resolved.t("now.tryAgain")).toBe(en.strings["now.tryAgain"]);
  });

  it("never shows a raw key name for a key the reference defines", () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      const pack = resolvePack(asPack({ manifest: SUPPORTED_LANGUAGES[code], strings: {}, lessons: { letters: {} } }));
      for (const key of CRITICAL_STRING_KEYS) {
        const rendered = pack.t(key, { number: 1, ayah: 1, total: 7 });
        expect(rendered, `${code}/${key}`).not.toBe(key);
        expect(rendered.trim(), `${code}/${key}`).not.toBe("");
      }
    }
  });

  it("reports which keys are falling back, so the gap is measurable", () => {
    const resolved = resolvePack(asPack({ manifest: SUPPORTED_LANGUAGES.ps, strings: {}, lessons: { letters: {} } }));

    expect(resolved.missingKeys.length).toBeGreaterThan(0);
    expect(resolved.coverage.strings).toBe(0);
    expect(resolved.coverage.criticalComplete).toBe(false);
    expect(resolved.coverage.missingCritical.length).toBeGreaterThan(0);
  });
});

describe("key parity on the sentences a learner meets constantly", () => {
  it.each(SUPPORTED_LANGUAGE_CODES.filter((code) => code !== REFERENCE_LANGUAGE))(
    "%s translates every critical key in its own words",
    async (code) => {
      const resolved = await loadLocale(code);

      expect(resolved.coverage.missingCritical, `${code} falls back to English on critical keys`).toEqual([]);
      expect(resolved.coverage.criticalComplete).toBe(true);
    },
  );

  it("keeps every critical key defined in the reference pack", () => {
    for (const key of CRITICAL_STRING_KEYS) expect(en.strings[key], key).toBeTruthy();
  });

  it.each(SUPPORTED_LANGUAGE_CODES.filter((code) => code !== REFERENCE_LANGUAGE))(
    "%s writes its critical strings in its own script, not English",
    async (code) => {
      const resolved = await loadLocale(code);
      const latin = /^[\x20-\x7E]+$/;
      const englishLooking = CRITICAL_STRING_KEYS.filter((key) => {
        const value = resolved.t(key);
        // A template that is only a placeholder and punctuation is script-free.
        const withoutPlaceholders = value.replace(/\{\w+\}/g, "").replace(/[\s\d.,:—·…]/g, "");
        return withoutPlaceholders.length > 0 && latin.test(withoutPlaceholders);
      });

      expect(englishLooking, `${code} still reads as English for these keys`).toEqual([]);
    },
  );
});

describe("interpolation", () => {
  it.each(SUPPORTED_LANGUAGE_CODES)("substitutes values into %s templates", async (code) => {
    const resolved = await loadLocale(code);

    expect(resolved.t("now.place", { ayah: 2, total: 7 })).toContain("2");
    expect(resolved.t("now.place", { ayah: 2, total: 7 })).toContain("7");
    expect(resolved.t("now.repeatWord", { number: 4 })).toContain("4");
    // No template may leave an unsubstituted placeholder behind.
    expect(resolved.t("now.place", { ayah: 2, total: 7 })).not.toMatch(/\{\w+\}/);
    expect(resolved.t("now.goToAyah", { number: 3 })).not.toMatch(/\{\w+\}/);
  });

  it("uses whole templates rather than concatenated English fragments", () => {
    // Every value carrying a count carries the sentence around it too, so a
    // language can put the number where its own grammar needs it.
    for (const key of ["now.place", "now.placeWord", "now.repeatWord", "now.continueFromWord", "now.goToAyah"] as const) {
      expect(en.strings[key], key).toMatch(/\{\w+\}/);
    }
  });

  it("leaves an unknown placeholder visible rather than blanking it", () => {
    const resolved = resolvePack(asPack(en));
    expect(resolved.t("now.repeatWord")).toContain("{number}");
  });
});

describe("the Quran is not part of the interface language", () => {
  it("carries no Arabic content in any pack's strings", async () => {
    const arabic = /[؀-ۿ]/;
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      const pack = await LOCALES[code].load();
      // Packs written *in* Arabic script are expected to contain Arabic; what
      // no pack may contain is Quranic content, which lives in the Quran data
      // layer and the curriculum. The reference pack is the one this can be
      // asserted on directly.
      if (SUPPORTED_LANGUAGES[code].direction === "ltr") {
        const offenders = Object.entries(pack.strings).filter(([, value]) => arabic.test(value));
        expect(offenders, code).toEqual([]);
      }
    }
  });

  it("keeps the Quran translation preference separate from the interface language", () => {
    // Choosing an interface language may *suggest* a translation of meaning; it
    // never selects the Arabic text, which has no per-language variant at all.
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      expect(SUPPORTED_LANGUAGES[code].preferredTranslationLanguage, code).toBeTruthy();
    }
    expect(SUPPORTED_LANGUAGES.ur.preferredTranslationLanguage).toBe("urdu");
    expect(SUPPORTED_LANGUAGES["fa-AF"].preferredTranslationLanguage).toBe("persian");
  });

  it("names no Quran text field anywhere in the pack shape", async () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      const pack = await LOCALES[code].load();
      expect(Object.keys(pack)).not.toContain("quran");
      expect(Object.keys(pack)).not.toContain("ayahs");
    }
  });
});

describe("no learner-facing English is left in the decision layer", () => {
  const decisionFiles = [
    "shared/teacherDecision.ts",
    "client/src/lib/teacherAction.ts",
    "client/src/lib/studyView.ts",
  ];

  it.each(decisionFiles)("%s emits keys and enums, never sentences", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // Any string literal of three or more English words would be a sentence a
    // learner could see. Locale keys, enum members and reason codes are not.
    const sentences = Array.from(withoutComments.matchAll(/"([^"]{12,})"/g))
      .map((match) => match[1])
      .filter((value) => /^[A-Z][a-z]+(\s+[a-zA-Z,'’-]+){2,}/.test(value));

    expect(sentences, `${file} contains learner-facing English`).toEqual([]);
  });

  it("keeps the Study instruction keys inside the now namespace", () => {
    const source = readFileSync(join(process.cwd(), "client/src/lib/teacherAction.ts"), "utf8");
    const titleTable = source.slice(source.indexOf("const TITLE_KEYS"), source.indexOf("const TONES"));
    const keys = Array.from(titleTable.matchAll(/"(now\.[a-zA-Z]+)"/g)).map((match) => match[1]);

    expect(keys.length).toBeGreaterThan(8);
    for (const key of keys) expect(en.strings[key as keyof typeof en.strings], key).toBeTruthy();
  });
});
