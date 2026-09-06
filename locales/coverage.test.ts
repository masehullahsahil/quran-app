/**
 * Translation coverage, per language and per surface.
 *
 * The point of measuring five surfaces separately is that a single percentage
 * hides the gap that matters: a pack can be most of the way done and still show
 * English on every lesson a beginner opens. These tests print the breakdown and
 * hold a floor under it, so coverage cannot quietly regress when the reference
 * pack grows.
 *
 * They count text. They cannot tell whether a translation is natural Pashto or
 * accurate Dari — that needs a speaker of the language, and until one has read
 * a pack it stays `nativeReviewed: false`.
 */
import { describe, expect, it } from "vitest";
import en from "./en";
import { CRITICAL_STRING_KEYS } from "./critical";
import { LOCALES } from "./index";
import { QAIDA_LESSONS } from "../shared/qaidaCurriculum";
import { LEARNING_LEVELS, LEARNING_PLAN_TEXT_KEYS } from "../shared/learningPath";
import { SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_CODES, languageNoteKey, type SupportedLanguageCode } from "../shared/languages";
import {
  COVERAGE_AREAS,
  coverageShortfalls,
  formatCoverage,
  measureCoverage,
  type CoverageThresholds,
  type LanguageCoverage,
} from "../shared/localizationCoverage";

const criticalKeys = CRITICAL_STRING_KEYS as readonly string[];
const supportingKeys = Object.keys(en.strings).filter((key) => !criticalKeys.includes(key));
const letterSlugs = Object.keys(en.lessons.letters);

async function coverageFor(code: SupportedLanguageCode): Promise<LanguageCoverage> {
  const pack = await LOCALES[code].load();
  return measureCoverage({
    code,
    criticalKeys,
    supportingKeys,
    strings: pack.strings,
    letterSlugs,
    letters: pack.lessons?.letters ?? {},
    lessons: QAIDA_LESSONS,
    qaida: pack.qaida,
    isReference: code === "en",
  });
}

/**
 * The floor each pack must stay above. Every surface is now translated in every
 * shipped language, so the floor is the whole thing: a key added to the
 * reference pack without a translation in each of the four fails here, which is
 * the point — a gap is meant to be visible the day it appears, not counted as
 * acceptable slippage.
 */
const THRESHOLDS: CoverageThresholds = {
  criticalUi: 1,
  supportingUi: 1,
  lessonText: 1,
  exerciseText: 1,
  articulation: 1,
  overall: 1,
};

/**
 * Words a pack keeps in Latin script on purpose, per language.
 *
 * Requirement 9 asks for structural coverage to be measured *and* for anything
 * deliberately left un-translated to be reported apart from it, rather than
 * quietly inflating the percentage. These are unit symbols and interpolation
 * placeholders — a translated string is still allowed to say "MB", because
 * every one of these languages writes it that way. Anything else in Latin
 * script is an untranslated English fragment and fails the test below.
 */
const RETAINED_LATIN_TERMS: Record<string, readonly string[]> = {
  ps: ["MB"],
  "fa-AF": ["MB"],
  ur: ["MB"],
  ar: ["MB"],
};

describe("coverage by language", () => {
  it("reports every surface for every language", async () => {
    const lines: string[] = [];
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      const coverage = await coverageFor(code);
      lines.push(`${formatCoverage(coverage)}  (${SUPPORTED_LANGUAGES[code].translationStatus})`);
    }
    // Printed so the breakdown is visible in test output rather than buried.
    console.info(`\nTranslation coverage\n${lines.join("\n")}\n`);
    expect(lines).toHaveLength(SUPPORTED_LANGUAGE_CODES.length);
  });

  it("has English complete on every surface", async () => {
    const coverage = await coverageFor("en");
    for (const area of COVERAGE_AREAS) expect(coverage[area].ratio, area).toBe(1);
  });

  it.each(SUPPORTED_LANGUAGE_CODES.filter((code) => code !== "en"))("%s stays above its floor", async (code) => {
    const coverage = await coverageFor(code);
    expect(coverageShortfalls(coverage, THRESHOLDS)).toEqual([]);
  });

  it.each(SUPPORTED_LANGUAGE_CODES.filter((code) => code !== "en"))(
    "%s translates the foundational levels a beginner opens first",
    async (code) => {
      const pack = await LOCALES[code].load();
      const foundational = QAIDA_LESSONS.filter((lesson) =>
        ["letters", "forms", "harakat", "tanween"].includes(lesson.level),
      );

      const untranslated = foundational.filter((lesson) => !pack.qaida?.lessons?.[lesson.id]?.teaching);
      expect(untranslated.map((lesson) => lesson.id), `${code} has untranslated foundational lessons`).toEqual([]);
    },
  );

  it("counts a partly translated lesson as partly translated", () => {
    const coverage = measureCoverage({
      code: "test",
      criticalKeys: [],
      supportingKeys: [],
      strings: {},
      letterSlugs: [],
      letters: {},
      lessons: QAIDA_LESSONS.slice(0, 1),
      qaida: { lessons: { [QAIDA_LESSONS[0].id]: { title: "…" } } },
    });

    expect(coverage.lessonText.translated).toBe(1);
    expect(coverage.lessonText.total).toBeGreaterThan(1);
    expect(coverage.lessonText.ratio).toBeLessThan(1);
  });

  it("treats blank text as untranslated rather than as coverage", () => {
    const coverage = measureCoverage({
      code: "test",
      criticalKeys: ["a"],
      supportingKeys: [],
      strings: { a: "   " },
      letterSlugs: ["alif"],
      letters: { alif: { articulation: "" } },
      lessons: [],
      qaida: undefined,
    });

    expect(coverage.criticalUi.ratio).toBe(0);
    expect(coverage.articulation.ratio).toBe(0);
  });
});

describe("what still falls back to English", () => {
  it("has no English fallback left on any surface, in any shipped language", async () => {
    const remaining: Record<string, string[]> = {};
    for (const code of SUPPORTED_LANGUAGE_CODES.filter((entry) => entry !== "en")) {
      const coverage = await coverageFor(code);
      remaining[code] = COVERAGE_AREAS.filter((area) => coverage[area].ratio < 1).map(
        (area) => `${area} (${coverage[area].total - coverage[area].translated} left)`,
      );
    }
    console.info(
      `\nStill falling back to English\n${Object.entries(remaining)
        .map(([code, areas]) => `${code.padEnd(6)} ${areas.join(", ") || "nothing"}`)
        .join("\n")}\n`,
    );

    for (const [code, areas] of Object.entries(remaining)) {
      expect(areas, `${code} still falls back to English on these surfaces`).toEqual([]);
    }
  });

  it("names every reference key each pack leaves undefined", async () => {
    for (const code of SUPPORTED_LANGUAGE_CODES.filter((entry) => entry !== "en")) {
      const pack = await LOCALES[code].load();
      const undefinedKeys = Object.keys(en.strings).filter((key) => {
        const value = (pack.strings as Record<string, string | undefined>)[key];
        return typeof value !== "string" || value.trim().length === 0;
      });
      expect(undefinedKeys, `${code} leaves these reference keys undefined`).toEqual([]);
    }
  });

  it("translates every lesson and every exercise the curriculum declares", async () => {
    for (const code of SUPPORTED_LANGUAGE_CODES.filter((entry) => entry !== "en")) {
      const pack = await LOCALES[code].load();
      const untranslated: string[] = [];

      for (const lesson of QAIDA_LESSONS) {
        const text = pack.qaida?.lessons?.[lesson.id];
        for (const field of ["title", "objective", "teaching"] as const) {
          if (!text?.[field]?.trim()) untranslated.push(`${lesson.id}.${field}`);
        }
        if (lesson.boundary && !text?.boundary?.trim()) untranslated.push(`${lesson.id}.boundary`);

        for (const item of lesson.practice) {
          const itemText = pack.qaida?.exercises?.[item.id];
          if (!itemText?.prompt?.trim()) untranslated.push(`${item.id}.prompt`);
          if (item.note && !itemText?.note?.trim()) untranslated.push(`${item.id}.note`);
        }
      }

      expect(untranslated, `${code} has untranslated course text`).toEqual([]);
    }
  });
});

describe("the coaching plan reads in the learner's language", () => {
  it("names only keys the reference pack defines", () => {
    for (const level of LEARNING_LEVELS) {
      const keys = LEARNING_PLAN_TEXT_KEYS[level];
      for (const key of [keys.title, keys.focus, keys.lessonGoal, keys.boundary, ...keys.practiceLoop]) {
        expect(en.strings[key as keyof typeof en.strings], `${level}/${key}`).toBeTruthy();
      }
    }
  });

  it("carries the plan in every pack rather than falling back to English", async () => {
    for (const code of SUPPORTED_LANGUAGE_CODES.filter((entry) => entry !== "en")) {
      const pack = await LOCALES[code].load();
      for (const level of LEARNING_LEVELS) {
        const keys = LEARNING_PLAN_TEXT_KEYS[level];
        for (const key of [keys.title, keys.focus, keys.lessonGoal, keys.boundary, ...keys.practiceLoop]) {
          expect((pack.strings as Record<string, string | undefined>)[key]?.trim(), `${code}/${key}`).toBeTruthy();
        }
      }
    }
  });
});

describe("terms deliberately kept in Latin script", () => {
  /** Latin-script words of two letters or more, outside `{placeholders}`. */
  function latinTerms(value: string): string[] {
    return Array.from(value.replace(/\{\w+\}/g, " ").matchAll(/[A-Za-z][A-Za-z'’-]+/g)).map((match) => match[0]);
  }

  it("reports them per language, and allows nothing beyond the list", async () => {
    const report: Record<string, string[]> = {};
    for (const code of SUPPORTED_LANGUAGE_CODES.filter((entry) => entry !== "en")) {
      const pack = await LOCALES[code].load();
      const texts = [
        ...Object.values(pack.strings ?? {}),
        ...Object.values(pack.lessons?.letters ?? {}).flatMap((letter) => [letter?.articulation, letter?.tip]),
        ...Object.values(pack.qaida?.lessons ?? {}).flatMap((lesson) => [lesson.title, lesson.objective, lesson.teaching, lesson.boundary]),
        ...Object.values(pack.qaida?.exercises ?? {}).flatMap((exercise) => [exercise.prompt, exercise.note]),
      ].filter((value): value is string => typeof value === "string");

      const found = [...new Set(texts.flatMap(latinTerms))].sort();
      report[code] = found;
      const unexpected = found.filter((term) => !RETAINED_LATIN_TERMS[code]?.includes(term));
      expect(unexpected, `${code} carries untranslated English`).toEqual([]);
    }

    console.info(
      `\nTerms kept in Latin script\n${Object.entries(report)
        .map(([code, terms]) => `${code.padEnd(6)} ${terms.join(", ") || "none"}`)
        .join("\n")}\n`,
    );
  });

  it("keeps established Arabic terminology rather than inventing a translation", async () => {
    // Tajwid and Qaida terms carry meaning no paraphrase preserves, so a pack
    // is expected to use the Arabic term and explain it in its own words around
    // it. This asserts the terms survived translation; whether the surrounding
    // explanation is natural is a question for a speaker of the language.
    const terms: Record<string, readonly string[]> = {
      ps: ["سکون", "شده", "تنوین", "قلقلې", "غنه", "تجوید", "مخرج"],
      "fa-AF": ["سکون", "شده", "تنوین", "قلقله", "غنه", "تجوید", "مخرج"],
      ur: ["سکون", "شد", "تنوین", "قلقلہ", "غنہ", "تجوید", "مخرج"],
      ar: ["السكون", "الشدة", "التنوين", "القلقلة", "الغنة", "التجويد", "المخارج"],
    };

    for (const [code, expected] of Object.entries(terms)) {
      const pack = await LOCALES[code as SupportedLanguageCode].load();
      const prose = [
        ...Object.values(pack.strings ?? {}),
        ...Object.values(pack.qaida?.lessons ?? {}).flatMap((lesson) => [lesson.title, lesson.objective, lesson.teaching, lesson.boundary]),
      ]
        .filter((value): value is string => typeof value === "string")
        .join(" ");

      for (const term of expected) expect(prose, `${code} dropped the term ${term}`).toContain(term);
    }
  });
});

describe("translation provenance", () => {
  it("does not claim a native review that has not happened", () => {
    for (const code of SUPPORTED_LANGUAGE_CODES.filter((entry) => entry !== "en")) {
      const language = SUPPORTED_LANGUAGES[code];
      expect(language.nativeReviewed, code).toBe(false);
      expect(language.translationStatus, code).toBe("ai-drafted");
    }
  });

  it("says a full pack is full, and still says it is only a draft", () => {
    // Coverage and provenance are separate claims. These packs now carry every
    // string, which the picker may say; none of them has been read by a speaker
    // of the language, which the picker must also say.
    for (const code of SUPPORTED_LANGUAGE_CODES.filter((entry) => entry !== "en")) {
      expect(SUPPORTED_LANGUAGES[code].coverage, code).toBe("full");
      expect(languageNoteKey(code), code).toBe("language.aiDrafted");
    }
    expect(SUPPORTED_LANGUAGES.en.translationStatus).toBe("reference");
    expect(languageNoteKey("en")).toBeNull();
  });

  it("keeps the honest note itself translated in every pack", async () => {
    for (const code of SUPPORTED_LANGUAGE_CODES.filter((entry) => entry !== "en")) {
      const pack = await LOCALES[code].load();
      expect(pack.strings["language.aiDrafted"]?.trim(), code).toBeTruthy();
      expect(pack.strings["language.aiDrafted"], code).not.toBe(en.strings["language.aiDrafted"]);
    }
  });
});
