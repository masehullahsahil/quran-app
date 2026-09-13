import { describe, expect, it } from "vitest";
import { aggregateAdapter } from "./metrics";
import type { ExpectedResult, PerRecordingResult } from "./types";

function perRecording(
  sampleId: string,
  overrides: Partial<PerRecordingResult> = {},
): PerRecordingResult {
  return {
    sampleId,
    adapterId: "adapter-a",
    skipped: false,
    skipReason: null,
    producedArabic: true,
    rawTranscript: "ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
    normalizedTokens: ["الرحمن", "الرحيم"],
    expectedTokens: ["الرحمن", "الرحيم"],
    alignment: {
      matched: 2,
      total: 2,
      score: 100,
      missingWordIndexes: [],
      extraCount: 0,
      reviewCount: 0,
    },
    falseCorrectionOnCorrect: false,
    omissionDetected: null,
    substitutionDetected: null,
    latencyMs: 100,
    peakRssMb: 4,
    adapterError: null,
    ...overrides,
  };
}

describe("aggregateAdapter", () => {
  it("computes rates over evaluated samples only", () => {
    const expected = new Map<string, ExpectedResult>([
      ["s1", "correct"],
      ["s2", "correct"],
      ["s3", "omission"],
      ["s4", "correct"],
    ]);
    const results = [
      perRecording("s1"),
      perRecording("s2", { falseCorrectionOnCorrect: true }),
      perRecording("s3", {
        omissionDetected: true,
        falseCorrectionOnCorrect: null,
        normalizedTokens: ["الرحمن"],
        rawTranscript: "ٱلرَّحْمَٰنِ",
        alignment: {
          matched: 1, total: 2, score: 50,
          missingWordIndexes: [2], extraCount: 0, reviewCount: 0,
        },
      }),
      { ...perRecording("s4"), skipped: true, skipReason: "no audio" },
    ];
    const metrics = aggregateAdapter("adapter-a", "Adapter A", results, expected);
    expect(metrics.totalSamples).toBe(4);
    expect(metrics.skippedSamples).toBe(1);
    expect(metrics.evaluatedSamples).toBe(3);
    expect(metrics.arabicOutputRate).toBe(1);
    // 2 of 3 evaluated match exactly.
    expect(metrics.exactWordMatchRate).toBeCloseTo(2 / 3);
    // 1 of 2 correct recitations falsely corrected.
    expect(metrics.falseCorrectionRateOnCorrect).toBe(0.5);
    expect(metrics.omissionTruePositiveRate).toBe(1);
    expect(metrics.emptyGarbageRate).toBe(0);
    expect(metrics.medianLatencyMs).toBe(100);
  });

  it("counts empty and non-Arabic output in the garbage rate", () => {
    const expected = new Map<string, ExpectedResult>([["s1", "correct"]]);
    const results = [
      perRecording("s1", {
        producedArabic: false,
        rawTranscript: "hello world",
        normalizedTokens: [],
        alignment: null,
        falseCorrectionOnCorrect: true,
      }),
    ];
    const metrics = aggregateAdapter("adapter-a", "Adapter A", results, expected);
    expect(metrics.emptyGarbageRate).toBe(1);
    expect(metrics.arabicOutputRate).toBe(0);
    expect(metrics.falseCorrectionRateOnCorrect).toBe(1);
    // No usable transcript: WER stays null rather than inventing a number.
    expect(metrics.meanWer).toBeNull();
  });

  it("returns nulls for an empty result set", () => {
    const metrics = aggregateAdapter("adapter-a", "Adapter A", [], new Map());
    expect(metrics.evaluatedSamples).toBe(0);
    expect(metrics.arabicOutputRate).toBeNull();
    expect(metrics.falseCorrectionRateOnCorrect).toBeNull();
    expect(metrics.medianLatencyMs).toBeNull();
  });

  it("computes median and p95 latency", () => {
    const expected = new Map<string, ExpectedResult>();
    const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const results = latencies.map((latencyMs, i) =>
      perRecording(`s${i}`, { latencyMs }),
    );
    for (let i = 0; i < 10; i++) expected.set(`s${i}`, "correct");
    const metrics = aggregateAdapter("adapter-a", "Adapter A", results, expected);
    expect(metrics.medianLatencyMs).toBe(55);
    expect(metrics.p95LatencyMs).toBe(100);
  });

  it("measures repetition handling as extras without broken matches", () => {
    const expected = new Map<string, ExpectedResult>([["s1", "repetition"]]);
    const results = [
      perRecording("s1", {
        falseCorrectionOnCorrect: null,
        normalizedTokens: ["الرحمن", "الرحمن", "الرحيم"],
        rawTranscript: "ٱلرَّحْمَٰنِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
        alignment: {
          matched: 2, total: 2, score: 100,
          missingWordIndexes: [], extraCount: 1, reviewCount: 0,
        },
      }),
    ];
    const metrics = aggregateAdapter("adapter-a", "Adapter A", results, expected);
    expect(metrics.repetitionHandledRate).toBe(1);
  });
});
