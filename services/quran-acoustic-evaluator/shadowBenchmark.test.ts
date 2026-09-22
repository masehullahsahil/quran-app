import { describe, expect, it } from "vitest";
import {
  formatShadowBenchmark,
  summarizeShadowBenchmark,
} from "./shadowBenchmark";

describe("Muaalem shadow runtime benchmark", () => {
  it("reports runtime coverage without converting posteriors into accuracy", () => {
    const report = summarizeShadowBenchmark([
      {
        status: "available",
        latencyMs: 100,
        audioDurationMs: 1_000,
        decodedLevelCount: 11,
        phonemeTokenCount: 9,
        averagePosterior: 0.8,
      },
      {
        status: "abstained",
        latencyMs: 200,
        audioDurationMs: 2_000,
        decodedLevelCount: 0,
        phonemeTokenCount: 0,
        averagePosterior: null,
      },
      {
        status: "unavailable",
        latencyMs: 300,
        audioDurationMs: null,
        decodedLevelCount: 0,
        phonemeTokenCount: 0,
        averagePosterior: null,
      },
    ]);
    expect(report).toMatchObject({
      attempted: 3,
      available: 1,
      abstained: 1,
      unavailable: 1,
      latencyP50Ms: 200,
      latencyP95Ms: 300,
      meanDecodedLevels: 11,
      meanPhonemeTokens: 9,
      meanPosterior: 0.8,
      costSampleCount: 2,
      measuredAudioMinutes: 0.05,
      processingRealTimeFactor: 0.1,
      gpuHourlyUsd: null,
      estimatedGpuUsdPerAudioHour: null,
      projectedDeepReviewMinutesPerLearnerMonth: null,
      projectedGpuUsdPerLearnerMonth: null,
      maximumGpuUsdPerAudioHour: null,
      costGate: "not_evaluated",
    });
    const text = formatShadowBenchmark(report);
    expect(text).toContain("INFERENCE COVERAGE ONLY");
    expect(text).toContain("not a correctness probability");
    expect(text).not.toContain("accuracy=");
  });

  it("estimates active GPU cost and applies the configured affordability gate", () => {
    const report = summarizeShadowBenchmark(
      [
        {
          status: "available",
          latencyMs: 10_000,
          audioDurationMs: 60_000,
          decodedLevelCount: 11,
          phonemeTokenCount: 9,
          averagePosterior: 0.8,
        },
      ],
      {
        gpuHourlyUsd: 0.69,
        projectedDeepReviewMinutesPerLearnerMonth: 15,
        maximumGpuUsdPerAudioHour: 0.15,
      }
    );

    expect(report.processingRealTimeFactor).toBeCloseTo(1 / 6);
    expect(report.estimatedGpuUsdPerAudioHour).toBeCloseTo(0.115);
    expect(report.projectedGpuUsdPerLearnerMonth).toBeCloseTo(0.02875);
    expect(report.costGate).toBe("pass");
    const text = formatShadowBenchmark(report);
    expect(text).toContain("COST ESTIMATE ONLY");
    expect(text).toContain("Cost gate (maximum $0.1500/audio hour): PASS");
  });

  it("fails the affordability gate without treating it as an accuracy result", () => {
    const report = summarizeShadowBenchmark(
      [
        {
          status: "available",
          latencyMs: 60_000,
          audioDurationMs: 60_000,
          decodedLevelCount: 11,
          phonemeTokenCount: 9,
          averagePosterior: 0.8,
        },
      ],
      {
        gpuHourlyUsd: 0.69,
        maximumGpuUsdPerAudioHour: 0.5,
      }
    );

    expect(report.estimatedGpuUsdPerAudioHour).toBeCloseTo(0.69);
    expect(report.costGate).toBe("fail");
    expect(formatShadowBenchmark(report)).toContain(
      "no pronunciation, makhraj, or tajweed accuracy is measured"
    );
  });

  it("reports unmeasured aggregates honestly for an empty run", () => {
    const text = formatShadowBenchmark(summarizeShadowBenchmark([]));
    expect(text).toContain("Attempts: 0");
    expect(text).toContain("not evaluated");
    expect(text).not.toContain("not evaluatedx");
  });
});
