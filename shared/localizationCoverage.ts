/**
 * How much of the learner's experience is actually in their language.
 *
 * A single "percent translated" number hides the thing that matters: a pack can
 * be 90% complete and still show English on every lesson a beginner opens. This
 * measures the five surfaces separately, so the report says where the English
 * still is rather than only how much of it there is.
 *
 * It counts, it does not judge. Whether a translation is *good* — natural
 * Pashto rather than Persianised, Afghan Dari rather than Iranian, an accurate
 * makhraj description — is a question for a speaker of the language, and no
 * test here can stand in for that.
 */
import type { QaidaLesson } from "./qaidaCurriculum";
import type { QaidaTextPack } from "./qaidaText";

export const COVERAGE_AREAS = [
  /** The strings a learner meets constantly; every pack must carry all of them. */
  "criticalUi",
  /** Everything else in the interface: panels, notes, headings, statuses. */
  "supportingUi",
  /** Qaida lesson prose: title, objective, teaching, boundary. */
  "lessonText",
  /** The prompt and note on each practice item. */
  "exerciseText",
  /** How each of the 28 letters is articulated. */
  "articulation",
] as const;

export type CoverageArea = (typeof COVERAGE_AREAS)[number];

export type AreaCoverage = {
  translated: number;
  total: number;
  /** 0–1. A `total` of zero counts as fully covered, not as a gap. */
  ratio: number;
};

export type LanguageCoverage = Record<CoverageArea, AreaCoverage> & {
  code: string;
  /** Every surface weighted by how many items it has. */
  overall: AreaCoverage;
};

const ratioOf = (translated: number, total: number): AreaCoverage => ({
  translated,
  total,
  ratio: total === 0 ? 1 : translated / total,
});

/** A value counts as translated only when the pack supplies non-empty text. */
function has(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export type CoverageInput = {
  code: string;
  /** Keys the reference pack defines, split into the two interface tiers. */
  criticalKeys: readonly string[];
  supportingKeys: readonly string[];
  /** The pack's own strings, before fallback. */
  strings: Readonly<Record<string, string | undefined>>;
  /** Letter slugs the reference pack teaches. */
  letterSlugs: readonly string[];
  /** The pack's own letter lessons, before fallback. */
  letters: Readonly<Record<string, { articulation?: string } | undefined>>;
  lessons: readonly QaidaLesson[];
  qaida: QaidaTextPack | undefined;
  /**
   * True for the language the curriculum itself is written in. Its lesson and
   * exercise text needs no pack: the course *is* that language, so counting it
   * as untranslated would report English as 0% translated into English.
   */
  isReference?: boolean;
};

export function measureCoverage(input: CoverageInput): LanguageCoverage {
  const criticalUi = ratioOf(input.criticalKeys.filter((key) => has(input.strings[key])).length, input.criticalKeys.length);
  const supportingUi = ratioOf(input.supportingKeys.filter((key) => has(input.strings[key])).length, input.supportingKeys.length);
  const articulation = ratioOf(
    input.letterSlugs.filter((slug) => has(input.letters[slug]?.articulation)).length,
    input.letterSlugs.length,
  );

  // Lesson prose is counted field by field: a lesson with a translated title
  // and an English explanation is half done, and should read as half done.
  let lessonFields = 0;
  let lessonTranslated = 0;
  let exerciseFields = 0;
  let exerciseTranslated = 0;

  for (const lesson of input.lessons) {
    const text = input.qaida?.lessons?.[lesson.id];
    const fields: Array<[string, unknown]> = [
      ["title", text?.title],
      ["objective", text?.objective],
      ["teaching", text?.teaching],
    ];
    if (lesson.boundary) fields.push(["boundary", text?.boundary]);
    lessonFields += fields.length;
    lessonTranslated += fields.filter(([, value]) => has(value)).length;

    for (const item of lesson.practice) {
      const itemText = input.qaida?.exercises?.[item.id];
      exerciseFields += 1;
      if (has(itemText?.prompt)) exerciseTranslated += 1;
      if (item.note) {
        exerciseFields += 1;
        if (has(itemText?.note)) exerciseTranslated += 1;
      }
    }
  }

  const areas = {
    criticalUi,
    supportingUi,
    lessonText: input.isReference ? ratioOf(lessonFields, lessonFields) : ratioOf(lessonTranslated, lessonFields),
    exerciseText: input.isReference ? ratioOf(exerciseFields, exerciseFields) : ratioOf(exerciseTranslated, exerciseFields),
    articulation,
  } satisfies Record<CoverageArea, AreaCoverage>;

  const translated = COVERAGE_AREAS.reduce((sum, area) => sum + areas[area].translated, 0);
  const total = COVERAGE_AREAS.reduce((sum, area) => sum + areas[area].total, 0);

  return { code: input.code, ...areas, overall: ratioOf(translated, total) };
}

/** A fixed-width line per language, for the coverage report and test output. */
export function formatCoverage(coverage: LanguageCoverage): string {
  const percent = (area: AreaCoverage) => `${Math.round(area.ratio * 100)}%`.padStart(4);
  return [
    coverage.code.padEnd(6),
    `overall ${percent(coverage.overall)}`,
    `critical ${percent(coverage.criticalUi)}`,
    `ui ${percent(coverage.supportingUi)}`,
    `lessons ${percent(coverage.lessonText)}`,
    `exercises ${percent(coverage.exerciseText)}`,
    `articulation ${percent(coverage.articulation)}`,
  ].join(" | ");
}

/** What a pack must reach before it may be shipped as an interface language. */
export type CoverageThresholds = Partial<Record<CoverageArea | "overall", number>>;

/** Areas falling below their threshold, for a test to fail on. */
export function coverageShortfalls(coverage: LanguageCoverage, thresholds: CoverageThresholds): string[] {
  const shortfalls: string[] = [];
  for (const [area, minimum] of Object.entries(thresholds) as Array<[CoverageArea | "overall", number]>) {
    const measured = coverage[area].ratio;
    if (measured + 1e-9 < minimum) {
      shortfalls.push(`${coverage.code}/${area}: ${(measured * 100).toFixed(0)}% < ${(minimum * 100).toFixed(0)}%`);
    }
  }
  return shortfalls;
}
