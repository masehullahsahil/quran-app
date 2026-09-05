import { describe, expect, it } from "vitest";
import { calibrationMetrics, performanceByConfusionPair, performanceByRule } from "./acousticMetrics";

describe("acoustic calibration metrics", () => {
  it("calculates precision, recall, false-positive rate, and abstention rate", () => {
    expect(calibrationMetrics({ truePositive: 8, falsePositive: 2, trueNegative: 18, falseNegative: 2, abstained: 10, total: 40 })).toEqual({ precision: 0.8, recall: 0.8, falsePositiveRate: 0.1, abstentionRate: 0.25 });
  });
  it("returns zero for metrics with no denominator", () => {
    expect(calibrationMetrics({ truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0, abstained: 0, total: 0 })).toEqual({ precision: 0, recall: 0, falsePositiveRate: 0, abstentionRate: 0 });
  });
  it("groups performance deterministically by confusion pair and rule", () => {
    const outcomes = [
      { group: "ق/ك", expectedPositive: true, predictedPositive: true, abstained: false },
      { group: "ق/ك", expectedPositive: false, predictedPositive: true, abstained: false },
      { group: "madd", expectedPositive: true, predictedPositive: false, abstained: true },
    ];
    expect(performanceByConfusionPair(outcomes)["ق/ك"].precision).toBe(0.5);
    expect(performanceByRule(outcomes).madd.abstentionRate).toBe(1);
    expect(Object.keys(performanceByRule(outcomes))).toEqual(["madd", "ق/ك"]);
  });
});
