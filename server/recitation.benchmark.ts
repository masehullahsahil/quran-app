import { assessRecitationTranscript } from "./recitation";
import {
  RECITATION_BENCHMARK_CASES,
  type RecitationBenchmarkCase,
} from "./recitation.benchmark-fixtures";

export type BenchmarkCaseResult = {
  benchmarkCase: RecitationBenchmarkCase;
  actual: ReturnType<typeof assessRecitationTranscript>;
  statusSequencePassed: boolean;
  scorePassed: boolean;
  correctionWordIndexesPassed: boolean;
  extrasPassed: boolean;
  passed: boolean;
};

export type RecitationBenchmarkReport = {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  exactStatusSequenceAccuracy: number;
  scoreAccuracy: number;
  correctionWordIndexAccuracy: number;
  extraSequenceAccuracy: number;
  categories: Record<
    string,
    { total: number; passed: number; accuracy: number }
  >;
  results: BenchmarkCaseResult[];
};

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
const percentage = (passed: number, total: number) =>
  total === 0 ? 0 : Math.round((passed / total) * 10_000) / 100;

export function runRecitationBenchmark(
  cases: readonly RecitationBenchmarkCase[] = RECITATION_BENCHMARK_CASES
): RecitationBenchmarkReport {
  const results = cases.map((benchmarkCase): BenchmarkCaseResult => {
    const actual = assessRecitationTranscript(
      benchmarkCase.expectedArabic,
      benchmarkCase.transcript
    );
    const actualStatuses = actual.expectedWords.map(({ status }) => status);
    const actualIndexes = actual.corrections.map(({ wordIndex }) => wordIndex);
    const actualExtras = actual.extraWords.map(({ heard }) => heard ?? "");
    const scoreExpectation = benchmarkCase.expected.score;
    const scorePassed =
      typeof scoreExpectation === "number"
        ? actual.score === scoreExpectation
        : actual.score >= scoreExpectation.min &&
          actual.score <= scoreExpectation.max;
    const statusSequencePassed = same(
      actualStatuses,
      benchmarkCase.expected.statuses
    );
    const correctionWordIndexesPassed = same(
      actualIndexes,
      benchmarkCase.expected.correctionWordIndexes
    );
    const extrasPassed = same(actualExtras, benchmarkCase.expected.extras);
    return {
      benchmarkCase,
      actual,
      statusSequencePassed,
      scorePassed,
      correctionWordIndexesPassed,
      extrasPassed,
      passed:
        statusSequencePassed &&
        scorePassed &&
        correctionWordIndexesPassed &&
        extrasPassed,
    };
  });
  const categories: RecitationBenchmarkReport["categories"] = {};
  for (const result of results) {
    const category = result.benchmarkCase.category;
    const aggregate = categories[category] ?? {
      total: 0,
      passed: 0,
      accuracy: 0,
    };
    aggregate.total += 1;
    aggregate.passed += Number(result.passed);
    aggregate.accuracy = percentage(aggregate.passed, aggregate.total);
    categories[category] = aggregate;
  }
  const count = (
    field: keyof Pick<
      BenchmarkCaseResult,
      | "passed"
      | "statusSequencePassed"
      | "scorePassed"
      | "correctionWordIndexesPassed"
      | "extrasPassed"
    >
  ) => results.filter(result => result[field]).length;
  return {
    totalCases: results.length,
    passedCases: count("passed"),
    failedCases: results.length - count("passed"),
    exactStatusSequenceAccuracy: percentage(
      count("statusSequencePassed"),
      results.length
    ),
    scoreAccuracy: percentage(count("scorePassed"), results.length),
    correctionWordIndexAccuracy: percentage(
      count("correctionWordIndexesPassed"),
      results.length
    ),
    extraSequenceAccuracy: percentage(count("extrasPassed"), results.length),
    categories,
    results,
  };
}

export function formatRecitationBenchmarkReport(
  report: RecitationBenchmarkReport
): string {
  const lines = [
    `Recitation textual-alignment benchmark: ${report.passedCases}/${report.totalCases} passed`,
    `Status sequences: ${report.exactStatusSequenceAccuracy}% | Scores: ${report.scoreAccuracy}% | Correction indexes: ${report.correctionWordIndexAccuracy}% | Extras: ${report.extraSequenceAccuracy}%`,
    "Categories:",
    ...Object.entries(report.categories).map(
      ([name, value]) =>
        `  ${name}: ${value.passed}/${value.total} (${value.accuracy}%)`
    ),
  ];
  for (const result of report.results.filter(({ passed }) => !passed)) {
    lines.push(
      "",
      `Case: ${result.benchmarkCase.id}`,
      `Expected statuses: ${result.benchmarkCase.expected.statuses.join(", ")}`,
      `Actual statuses: ${result.actual.expectedWords.map(({ status }) => status).join(", ")}`,
      `Expected extras: ${JSON.stringify(result.benchmarkCase.expected.extras)}`,
      `Actual extras: ${JSON.stringify(result.actual.extraWords.map(({ heard }) => heard))}`,
      `Expected correction wordIndexes: ${JSON.stringify(result.benchmarkCase.expected.correctionWordIndexes)}`,
      `Actual correction wordIndexes: ${JSON.stringify(result.actual.corrections.map(({ wordIndex }) => wordIndex))}`,
      `Expected score: ${JSON.stringify(result.benchmarkCase.expected.score)}`,
      `Actual score: ${result.actual.score}`
    );
  }
  return lines.join("\n");
}
