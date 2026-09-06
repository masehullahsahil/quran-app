/**
 * The separation the benchmark depends on.
 *
 * The property being tested is simple to state and easy to lose: nothing a model
 * trained on may appear in anything it is measured on. These check the boundary
 * at speaker, session, recording-family and file level, plus the two consent
 * conditions that make a sample ineligible regardless of which split it sits in.
 *
 * Synthetic fixtures only. No recording exists behind any sample here.
 */
import { describe, expect, it } from "vitest";
import {
  DATASET_SPLITS,
  EVALUATION_SPLITS,
  evaluationSamples,
  explainLeakage,
  isCleanSplit,
  isEvaluationSplit,
  leakageReport,
  splitForSample,
  splitSummary,
  trainingSamples,
  type SplitPlan,
} from "./pronunciationDatasetSplits";
import type { LabeledSample } from "./pronunciationDataset";
import {
  FIXTURE_AGREED,
  FIXTURE_DISPUTED,
  FIXTURE_SAMPLE_FATIHA,
  FIXTURE_SAMPLE_IKHLAS,
  FIXTURE_SAMPLE_IKHLAS_RETAKE,
  FIXTURE_UNCERTAIN,
} from "./pronunciationDatasetFixtures";

const cleanPlan: SplitPlan = {
  version: "test-1",
  assignments: [
    { speakerAnonymizedId: "speaker-fixture-001", split: "training", assignedAt: "2026-01-03" },
    { speakerAnonymizedId: "speaker-fixture-002", split: "test", assignedAt: "2026-01-03" },
  ],
};

/** Three samples: two from the training speaker, one from the test speaker. */
const dataset: LabeledSample[] = [FIXTURE_AGREED, FIXTURE_UNCERTAIN, FIXTURE_DISPUTED];

describe("the split model", () => {
  it("declares four splits and names the three that hold out data", () => {
    expect([...DATASET_SPLITS]).toEqual(["training", "validation", "test", "production-benchmark"]);
    expect([...EVALUATION_SPLITS]).toEqual(["validation", "test", "production-benchmark"]);
    expect(isEvaluationSplit("training")).toBe(false);
    for (const split of EVALUATION_SPLITS) expect(isEvaluationSplit(split), split).toBe(true);
  });

  it("assigns by speaker, so every recording of a speaker follows", () => {
    expect(splitForSample(cleanPlan, FIXTURE_SAMPLE_IKHLAS)).toBe("training");
    expect(splitForSample(cleanPlan, FIXTURE_SAMPLE_IKHLAS_RETAKE)).toBe("training");
    expect(splitForSample(cleanPlan, FIXTURE_SAMPLE_FATIHA)).toBe("test");
  });

  it("reports a clean plan as clean, with counts per split", () => {
    expect(leakageReport(dataset, cleanPlan)).toEqual([]);
    expect(isCleanSplit(dataset, cleanPlan)).toBe(true);

    const summary = splitSummary(dataset, cleanPlan);
    expect(summary.counts.training).toBe(2);
    expect(summary.counts.test).toBe(1);
    expect(summary.speakerCounts.training).toBe(1);
    expect(summary.unassigned).toBe(0);
  });
});

describe("evaluation records cannot silently enter training data", () => {
  it("hands a training loader only training-split, training-usable, training-consented samples", () => {
    const forTraining = trainingSamples(dataset, cleanPlan);
    expect(forTraining.map((entry) => entry.sample.sampleId)).toEqual([
      FIXTURE_SAMPLE_IKHLAS.sampleId,
      FIXTURE_SAMPLE_IKHLAS_RETAKE.sampleId,
    ]);
    expect(forTraining.every((entry) => entry.sample.usability.training)).toBe(true);
    expect(forTraining.some((entry) => entry.sample.sampleId === FIXTURE_SAMPLE_FATIHA.sampleId)).toBe(false);
  });

  it("keeps a held-out sample out of training even if its usability flag says otherwise", () => {
    const mislabelled: LabeledSample = {
      ...FIXTURE_DISPUTED,
      sample: { ...FIXTURE_SAMPLE_FATIHA, usability: { training: true, evaluation: true } },
    };
    const samples = [FIXTURE_AGREED, mislabelled];

    // The loader refuses it because the plan puts the speaker in `test` …
    expect(trainingSamples(samples, cleanPlan).map((entry) => entry.sample.sampleId)).toEqual([
      FIXTURE_SAMPLE_IKHLAS.sampleId,
    ]);
    // … and the contradiction is reported rather than silently tolerated.
    const findings = leakageReport(samples, cleanPlan);
    expect(findings.map((finding) => finding.kind)).toContain("evaluation-sample-marked-trainable");
  });

  it("refuses to train on a sample whose consent does not permit it", () => {
    const withoutConsent: LabeledSample = {
      ...FIXTURE_AGREED,
      sample: {
        ...FIXTURE_SAMPLE_IKHLAS,
        consent: { ...FIXTURE_SAMPLE_IKHLAS.consent, permittedUses: ["teacher-review"] },
      },
    };

    expect(trainingSamples([withoutConsent], cleanPlan)).toEqual([]);
    const findings = leakageReport([withoutConsent], cleanPlan);
    expect(findings.map((finding) => finding.kind)).toContain("training-use-not-permitted");
  });

  it("hands an evaluation split only samples consented for that use", () => {
    expect(evaluationSamples(dataset, cleanPlan, "test").map((entry) => entry.sample.sampleId)).toEqual([
      FIXTURE_SAMPLE_FATIHA.sampleId,
    ]);
    // The benchmark split asks for benchmark consent specifically.
    const benchmarkPlan: SplitPlan = {
      version: "test-2",
      assignments: [{ speakerAnonymizedId: "speaker-fixture-002", split: "production-benchmark", assignedAt: "2026-01-03" }],
    };
    expect(evaluationSamples([FIXTURE_DISPUTED], benchmarkPlan, "production-benchmark")).toHaveLength(1);

    const withoutBenchmarkConsent: LabeledSample = {
      ...FIXTURE_DISPUTED,
      sample: {
        ...FIXTURE_SAMPLE_FATIHA,
        consent: { ...FIXTURE_SAMPLE_FATIHA.consent, permittedUses: ["teacher-review", "evaluation"] },
      },
    };
    expect(evaluationSamples([withoutBenchmarkConsent], benchmarkPlan, "production-benchmark")).toEqual([]);
  });

  it("never returns training samples for an evaluation query, or the reverse", () => {
    expect(evaluationSamples(dataset, cleanPlan, "training")).toEqual([]);
    const trainingIds = new Set(trainingSamples(dataset, cleanPlan).map((entry) => entry.sample.sampleId));
    for (const split of EVALUATION_SPLITS) {
      for (const entry of evaluationSamples(dataset, cleanPlan, split)) {
        expect(trainingIds.has(entry.sample.sampleId), entry.sample.sampleId).toBe(false);
      }
    }
  });
});

describe("leakage is named, not repaired", () => {
  it("catches one speaker appearing in two splits", () => {
    const leakyPlan: SplitPlan = {
      version: "leaky",
      assignments: [
        { speakerAnonymizedId: "speaker-fixture-001", split: "training", assignedAt: "2026-01-03" },
        { speakerAnonymizedId: "speaker-fixture-002", split: "test", assignedAt: "2026-01-03" },
      ],
    };
    // The retake is re-attributed to the test speaker: same recording family and
    // session as a training sample, different speaker id.
    const leaked: LabeledSample = {
      ...FIXTURE_UNCERTAIN,
      sample: { ...FIXTURE_SAMPLE_IKHLAS_RETAKE, speakerAnonymizedId: "speaker-fixture-002" },
    };

    const kinds = leakageReport([FIXTURE_AGREED, leaked], leakyPlan).map((finding) => finding.kind);
    expect(kinds).toContain("session-across-splits");
    expect(kinds).toContain("family-across-splits");
  });

  it("catches the same audio hash on both sides of the boundary", () => {
    const hash = "a".repeat(64);
    const trainingCopy: LabeledSample = {
      ...FIXTURE_AGREED,
      sample: { ...FIXTURE_SAMPLE_IKHLAS, audioRef: { ...FIXTURE_SAMPLE_IKHLAS.audioRef, sha256: hash } },
    };
    const testCopy: LabeledSample = {
      ...FIXTURE_DISPUTED,
      sample: { ...FIXTURE_SAMPLE_FATIHA, audioRef: { ...FIXTURE_SAMPLE_FATIHA.audioRef, sha256: hash } },
    };

    const findings = leakageReport([trainingCopy, testCopy], cleanPlan);
    const duplicate = findings.find((finding) => finding.kind === "duplicate-audio-across-splits");
    expect(duplicate).toBeTruthy();
    expect(duplicate?.splits).toEqual(["test", "training"]);
  });

  it("catches a sample that belongs to no split at all", () => {
    const findings = leakageReport(dataset, { version: "partial", assignments: [] });
    expect(findings.every((finding) => finding.kind === "unassigned-sample")).toBe(true);
    expect(findings).toHaveLength(dataset.length);
  });

  it("explains every leakage kind it can report", () => {
    for (const finding of leakageReport(dataset, { version: "partial", assignments: [] })) {
      expect(explainLeakage(finding.kind).length).toBeGreaterThan(20);
      expect(finding.detail.length).toBeGreaterThan(20);
    }
  });

  it("changes nothing about the data it inspects", () => {
    const before = JSON.stringify(dataset);
    leakageReport(dataset, cleanPlan);
    trainingSamples(dataset, cleanPlan);
    evaluationSamples(dataset, cleanPlan, "test");
    expect(JSON.stringify(dataset)).toBe(before);
  });
});
