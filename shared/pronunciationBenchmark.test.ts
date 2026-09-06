/**
 * The benchmark definitions, and the claims they must not make.
 *
 * There is no model and no dataset, so there is nothing to score. What these
 * check is that the definitions are complete enough to argue with, that every
 * number in them is marked as a placeholder, and that nothing in the module can
 * be read as a measured result.
 */
import { describe, expect, it } from "vitest";
import {
  BENCHMARK_METRICS,
  BENCHMARK_METRIC_IDS,
  BENCHMARK_READINESS_STATEMENT,
  hasApprovedTarget,
  proposedTargets,
  unmetPrerequisites,
} from "./pronunciationBenchmark";
import { PRONUNCIATION_LABELS } from "./pronunciationDataset";

describe("the metrics the task asks for are defined", () => {
  it("covers all nine, each with a definition, a computation and a caveat", () => {
    expect([...BENCHMARK_METRIC_IDS]).toEqual([
      "word-position-accuracy",
      "omission-detection",
      "insertion-detection",
      "substitution-detection",
      "letter-phoneme-error-detection",
      "false-correction-rate",
      "missed-correction-rate",
      "latency-to-correction",
      "confidence-calibration",
    ]);

    for (const id of BENCHMARK_METRIC_IDS) {
      const metric = BENCHMARK_METRICS[id];
      expect(metric.definition.length, id).toBeGreaterThan(30);
      expect(metric.computation.length, id).toBeGreaterThan(30);
      expect(metric.caveat.length, id).toBeGreaterThan(20);
      expect(metric.learnerImpact.length, id).toBeGreaterThan(20);
      expect(metric.requires.length, id).toBeGreaterThan(0);
    }
  });

  it("names the direction of every metric, so a lower error is not read as worse", () => {
    expect(BENCHMARK_METRICS["false-correction-rate"].direction).toBe("lower-is-better");
    expect(BENCHMARK_METRICS["missed-correction-rate"].direction).toBe("lower-is-better");
    expect(BENCHMARK_METRICS["latency-to-correction"].direction).toBe("lower-is-better");
    expect(BENCHMARK_METRICS["confidence-calibration"].direction).toBe("lower-is-better");
    expect(BENCHMARK_METRICS["word-position-accuracy"].direction).toBe("higher-is-better");
  });

  it("reads only labels the taxonomy actually defines", () => {
    for (const id of BENCHMARK_METRIC_IDS) {
      for (const label of BENCHMARK_METRICS[id].labels) {
        expect(PRONUNCIATION_LABELS, `${id}/${label}`).toContain(label);
      }
    }
  });

  it("reports the false-correction rate beside the missed-correction rate", () => {
    // Each has to name the other's failure mode, because either alone is gameable.
    expect(BENCHMARK_METRICS["false-correction-rate"].caveat).toContain("abstaining");
    expect(BENCHMARK_METRICS["missed-correction-rate"].learnerImpact).toContain("conservative");
  });
});

describe("no accuracy is claimed", () => {
  it("marks every proposed target as a placeholder, and approves none", () => {
    const targets = proposedTargets();
    expect(targets.length).toBeGreaterThan(0);
    for (const { metric, target } of targets) {
      expect(target.status, metric).toBe("proposed-placeholder");
      expect(target.rationale.toLowerCase(), metric).toContain("placeholder");
    }
    for (const id of BENCHMARK_METRIC_IDS) expect(hasApprovedTarget(id), id).toBe(false);
  });

  it("leaves metrics without a defensible number with no number at all", () => {
    for (const id of ["insertion-detection", "substitution-detection", "letter-phoneme-error-detection", "missed-correction-rate", "latency-to-correction"] as const) {
      expect(BENCHMARK_METRICS[id].proposedTarget, id).toBeNull();
    }
  });

  it("states that nothing has been measured", () => {
    expect(BENCHMARK_READINESS_STATEMENT).toContain("No pronunciation benchmark has been run");
    expect(BENCHMARK_READINESS_STATEMENT).toContain("no accuracy claim");
  });

  it("lists prerequisites that do not exist yet", () => {
    const missing = unmetPrerequisites();
    expect(missing).toContain("A teacher-labeled, consented dataset with held-out speakers");
    expect(missing).toContain("Adjudicated ground truth for every sample counted");
    expect(missing.length).toBeGreaterThan(3);
  });

  it("caps letter-level scoring at the teacher agreement ceiling", () => {
    expect(BENCHMARK_METRICS["letter-phoneme-error-detection"].caveat).toContain("agreement");
    expect(BENCHMARK_METRICS["letter-phoneme-error-detection"].requires).toContain(
      "Measured inter-rater agreement at letter scope",
    );
  });
});
