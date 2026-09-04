import { describe, expect, it } from "vitest";
import {
  RECITATION_BENCHMARK_CASES,
  RECITATION_BENCHMARK_CATEGORIES,
} from "./recitation.benchmark-fixtures";
import {
  formatRecitationBenchmarkReport,
  runRecitationBenchmark,
} from "./recitation.benchmark";

describe("recitation textual-alignment benchmark", () => {
  it("contains a stable, representative fixture set", () => {
    expect(RECITATION_BENCHMARK_CASES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(RECITATION_BENCHMARK_CASES.map(({ id }) => id)).size).toBe(
      RECITATION_BENCHMARK_CASES.length
    );
    expect(
      new Set(RECITATION_BENCHMARK_CASES.map(({ category }) => category))
    ).toEqual(new Set(RECITATION_BENCHMARK_CATEGORIES));
  });

  it("meets every explicit alignment expectation", () => {
    const report = runRecitationBenchmark();
    expect(report.failedCases, formatRecitationBenchmarkReport(report)).toBe(0);
    expect(report.passedCases).toBe(report.totalCases);
    expect(report.exactStatusSequenceAccuracy).toBe(100);
    expect(report.scoreAccuracy).toBe(100);
    expect(report.correctionWordIndexAccuracy).toBe(100);
    expect(report.extraSequenceAccuracy).toBe(100);
    expect(
      Object.values(report.categories).every(({ accuracy }) => accuracy === 100)
    ).toBe(true);
  });

  it("prints actionable differences for a failing case", () => {
    const changed = [
      {
        ...RECITATION_BENCHMARK_CASES[0],
        expected: {
          ...RECITATION_BENCHMARK_CASES[0].expected,
          statuses: ["missing" as const],
        },
      },
    ];
    const output = formatRecitationBenchmarkReport(
      runRecitationBenchmark(changed)
    );
    expect(output).toContain("Case: perfect-01");
    expect(output).toContain("Expected statuses: missing");
    expect(output).toContain(
      "Actual statuses: matched, matched, matched, matched"
    );
    expect(output).toContain("Expected extras: []");
  });
});
