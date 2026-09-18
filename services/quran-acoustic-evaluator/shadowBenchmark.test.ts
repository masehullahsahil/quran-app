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
        decodedLevelCount: 11,
        phonemeTokenCount: 9,
        averagePosterior: 0.8,
      },
      {
        status: "abstained",
        latencyMs: 200,
        decodedLevelCount: 0,
        phonemeTokenCount: 0,
        averagePosterior: null,
      },
      {
        status: "unavailable",
        latencyMs: 300,
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
    });
    const text = formatShadowBenchmark(report);
    expect(text).toContain("INFERENCE COVERAGE ONLY");
    expect(text).toContain("not a correctness probability");
    expect(text).not.toContain("accuracy=");
  });

  it("reports unmeasured aggregates honestly for an empty run", () => {
    const text = formatShadowBenchmark(summarizeShadowBenchmark([]));
    expect(text).toContain("Attempts: 0");
    expect(text).toContain("not evaluated");
  });
});
