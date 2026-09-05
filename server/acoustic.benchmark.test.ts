import { describe, expect, it } from "vitest";
import { QURAN_PRONUNCIATION_CONFUSIONS } from "@shared/quranAcoustic";
import { ACOUSTIC_BENCHMARK_FIXTURES } from "./acoustic.benchmark-fixtures";
import { formatAcousticBenchmarkReport, runAcousticBenchmark, validateAcousticFixtures } from "./acoustic.benchmark";

describe("acoustic benchmark foundation", () => {
  it("has unique confusion taxonomy ids and grapheme sets", () => {
    const ids = QURAN_PRONUNCIATION_CONFUSIONS.map(item => item.id);
    const sets = QURAN_PRONUNCIATION_CONFUSIONS.map(item => [...item.graphemes].sort().join("/"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(sets).size).toBe(sets.length);
  });

  it("validates fixture integrity and all required categories", () => {
    expect(validateAcousticFixtures(ACOUSTIC_BENCHMARK_FIXTURES)).toEqual([]);
  });

  it("reports absent acoustic evidence as not evaluated deterministically", () => {
    const first = formatAcousticBenchmarkReport(runAcousticBenchmark());
    const second = formatAcousticBenchmarkReport(runAcousticBenchmark());
    expect(first).toBe(second);
    expect(first).toContain("Evaluated: 0 | Not evaluated: 6");
    expect(first).toContain("Acoustic accuracy: not evaluated");
  });

  it("checks confidence, finding, and abstention expectations", () => {
    const report = runAcousticBenchmark({
      "fatiha-noisy": { status: "abstained", confidence: 0.3, findingKind: null },
      "ikhlas-phoneme": { status: "available", confidence: 0.9, findingKind: "phoneme" },
    });
    expect(report.evaluatedCases).toBe(2);
    expect(report.matchedCases).toBe(2);
  });
});
