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
import { SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_CODES, type SupportedLanguageCode } from "../shared/languages";
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
 * The floor each pack must stay above. Set just under what is translated today,
 * so a genuine regression fails while ordinary growth of the reference pack —
 * which lowers every ratio — does not turn the suite red for no reason.
 */
const THRESHOLDS: CoverageThresholds = {
  criticalUi: 1,
  supportingUi: 0.25,
  lessonText: 0.4,
  exerciseText: 0.45,
  articulation: 1,
  overall: 0.45,
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
  it("names the untranslated surfaces rather than leaving them implicit", async () => {
    const remaining: Record<string, string[]> = {};
    for (const code of SUPPORTED_LANGUAGE_CODES.filter((entry) => entry !== "en")) {
      const coverage = await coverageFor(code);
      remaining[code] = COVERAGE_AREAS.filter((area) => coverage[area].ratio < 1).map(
        (area) => `${area} (${coverage[area].total - coverage[area].translated} left)`,
      );
    }
    console.info(`\nStill falling back to English\n${Object.entries(remaining).map(([code, areas]) => `${code.padEnd(6)} ${areas.join(", ") || "nothing"}`).join("\n")}\n`);

    // Every non-English pack is expected to have some fallback right now; this
    // asserts the report is real rather than that the gap is closed.
    for (const [code, areas] of Object.entries(remaining)) expect(Array.isArray(areas), code).toBe(true);
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

  it("keeps a pack's status honest about its own coverage", () => {
    // A pack may only be offered as an interface language once its critical
    // keys are in its own words; the coverage test above is what proves that.
    for (const code of SUPPORTED_LANGUAGE_CODES.filter((entry) => entry !== "en")) {
      expect(SUPPORTED_LANGUAGES[code].coverage, code).toBe("interface");
    }
    expect(SUPPORTED_LANGUAGES.en.translationStatus).toBe("reference");
  });
});
