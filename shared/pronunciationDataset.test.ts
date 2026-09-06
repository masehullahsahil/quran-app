/**
 * The guarantees the labeling model has to hold.
 *
 * These are not tests of pronunciation, of a model, or of anything acoustic —
 * none of that exists. They test the properties that decide whether a future
 * dataset would be worth anything: that a machine's opinion cannot become a
 * teacher's, that "I don't know" survives, that a disagreement is not quietly
 * resolved, that evaluation data cannot slip into training, that the Quran text
 * cannot be edited by labeling, that a reviewer's identity is preserved, and
 * that a label can name the exact word, letter and millisecond it is about.
 *
 * All data here is synthetic. No recording exists behind any fixture.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKFLOW_POLICY,
  LABEL_DEFINITIONS,
  LabelingError,
  PRONUNCIATION_LABELS,
  SEVERITY_LEVELS,
  SEVERITY_STATUS,
  TAXONOMY_STATUS,
  TEACHER_ONLY_LABELS,
  addReview,
  adjudicate,
  assertObservationFits,
  attachMachineOutput,
  disagreements,
  groundTruthFor,
  isUncertainLabel,
  mayDriveLearnerFacingCorrection,
  observationsAtMs,
  observationsForWord,
  reviewsAgree,
  workflowState,
  type LabeledSample,
  type LabelObservation,
  type TaxonomyApproval,
  type TeacherReview,
} from "./pronunciationDataset";
import {
  FIXTURE_ADJUDICATED,
  FIXTURE_ADJUDICATION,
  FIXTURE_AGREED,
  FIXTURE_DISPUTED,
  FIXTURE_MACHINE_LAYERS,
  FIXTURE_REVIEWERS,
  FIXTURE_REVIEW_AGREEING_A,
  FIXTURE_REVIEW_DISAGREEING_A,
  FIXTURE_REVIEW_DISAGREEING_B,
  FIXTURE_REVIEW_UNCERTAIN,
  FIXTURE_SAMPLE_IKHLAS,
  FIXTURE_UNCERTAIN,
  FIXTURE_UNREVIEWED,
} from "./pronunciationDatasetFixtures";

describe("the taxonomy is offered as a proposal", () => {
  it("carries 21 categories, each with a definition and allowed scopes", () => {
    expect(PRONUNCIATION_LABELS).toHaveLength(21);
    for (const label of PRONUNCIATION_LABELS) {
      const definition = LABEL_DEFINITIONS[label];
      expect(definition, label).toBeTruthy();
      expect(definition.summary.trim().length, label).toBeGreaterThan(20);
      expect(definition.scopes.length, label).toBeGreaterThan(0);
    }
  });

  it("marks the categories only a qualified teacher may assert", () => {
    expect(TEACHER_ONLY_LABELS).toHaveLength(14);
    for (const label of [
      "harakah-vowel-error",
      "sukoon-error",
      "shaddah-error",
      "madd-duration-issue",
      "ghunnah-issue",
      "qalqalah-issue",
      "makhraj-articulation-issue",
      "letter-substitution",
      "waqf-stop-issue",
      "ibtida-start-issue",
    ] as const) {
      expect(LABEL_DEFINITIONS[label].requiresQualifiedTeacher, label).toBe(true);
    }
    // Clerical, transcript-visible categories do not need a Qari to assert.
    expect(LABEL_DEFINITIONS["word-omission"].requiresQualifiedTeacher).toBe(false);
    expect(LABEL_DEFINITIONS["uncertain-cannot-classify"].requiresQualifiedTeacher).toBe(false);
  });

  it("says in code that it is unapproved and possibly incomplete", () => {
    expect(TAXONOMY_STATUS).toBe("proposed-pending-qualified-teacher-approval");
    expect(SEVERITY_STATUS).toBe("proposed-pending-qualified-teacher-approval");
  });

  it("does not let the severity taxonomy drive learner-facing behaviour unapproved", () => {
    expect(mayDriveLearnerFacingCorrection([])).toBe(false);
    expect(
      mayDriveLearnerFacingCorrection([
        { taxonomy: "labels", approvedBy: "A Teacher", qualification: "Qari", approvedAt: "2026-01-01", attestation: "I approve." },
      ]),
    ).toBe(false);

    const approval: TaxonomyApproval = {
      taxonomy: "severity",
      approvedBy: "A Teacher",
      qualification: "Qari, ijazah in Hafs",
      approvedAt: "2026-01-01",
      attestation: "I have read this taxonomy and approve it for learner-facing correction.",
    };
    expect(mayDriveLearnerFacingCorrection([approval])).toBe(true);
    expect(mayDriveLearnerFacingCorrection([{ ...approval, attestation: "" }])).toBe(false);
    expect(mayDriveLearnerFacingCorrection([{ ...approval, qualification: "" }])).toBe(false);
  });

  it("keeps the severity levels ordered from informational to blocking", () => {
    expect([...SEVERITY_LEVELS]).toEqual(["informational", "minor", "meaningful", "blocking-correction"]);
  });
});

describe("teacher labels are separate from machine predictions", () => {
  it("returns no ground truth for a sample with machine output but no review", () => {
    const truth = groundTruthFor(FIXTURE_UNREVIEWED);

    expect(FIXTURE_UNREVIEWED.machine.prediction?.observations.length).toBeGreaterThan(0);
    expect(truth.source).toBe("none");
    expect(truth.overallLabel).toBeNull();
    expect(truth.observations).toEqual([]);
  });

  it("keeps a confident prediction out of the ground truth even when it is right", () => {
    // The fixture model predicts the same omission the teachers later record.
    // Being right is not the same as being ground truth.
    const truth = groundTruthFor(FIXTURE_AGREED);
    expect(truth.source).toBe("agreed-reviews");
    expect(truth.reviewIds).toEqual([FIXTURE_REVIEW_AGREEING_A.reviewId, "review-fixture-a2"]);
    expect(truth.observations).toBe(FIXTURE_REVIEW_AGREEING_A.observations);
  });

  it("cannot write machine output into a teacher layer", () => {
    const attached = attachMachineOutput(FIXTURE_AGREED, {
      prediction: {
        provider: "other-model",
        modelVersion: "9.9.9",
        producedAt: "2026-02-01T00:00:00.000Z",
        abstained: false,
        confidence: 0.99,
        observations: [
          {
            id: "pred-x",
            label: "correct-recitation",
            location: { scope: "recording" },
            severity: "informational",
            confidence: "confident",
          },
        ],
      },
    });

    expect(attached.reviews).toBe(FIXTURE_AGREED.reviews);
    expect(attached.adjudication).toBe(FIXTURE_AGREED.adjudication);
    expect(groundTruthFor(attached).overallLabel).toBe("word-omission");
    expect(JSON.stringify(attached.reviews)).not.toContain("other-model");
  });

  it("keeps the transcript, the alignment and the prediction in three fields", () => {
    expect(Object.keys(FIXTURE_MACHINE_LAYERS).sort()).toEqual(["alignment", "prediction", "transcript"]);
    // The alignment is timings and word status only — it carries no label.
    const alignmentJson = JSON.stringify(FIXTURE_MACHINE_LAYERS.alignment);
    for (const label of TEACHER_ONLY_LABELS) expect(alignmentJson, label).not.toContain(label);
  });
});

describe("uncertain labels remain uncertain", () => {
  it("reports an uncertain review as uncertain ground truth, never as correct", () => {
    const truth = groundTruthFor(FIXTURE_UNCERTAIN);

    expect(truth.source).toBe("single-review");
    expect(truth.overallLabel).toBe("uncertain-cannot-classify");
    expect(truth.uncertain).toBe(true);
    expect(truth.overallLabel).not.toBe("correct-recitation");
  });

  it("treats both meta labels as uncertainty", () => {
    expect(isUncertainLabel("uncertain-cannot-classify")).toBe(true);
    expect(isUncertainLabel("audio-quality-insufficient")).toBe(true);
    expect(isUncertainLabel("correct-recitation")).toBe(false);
  });

  it("keeps uncertainty through adjudication", () => {
    const truth = groundTruthFor(FIXTURE_ADJUDICATED);
    expect(truth.source).toBe("adjudicated");
    expect(truth.overallLabel).toBe("uncertain-cannot-classify");
    expect(truth.uncertain).toBe(true);
  });

  it("does not let a second, confident reviewer overwrite an uncertain one", () => {
    const confident: TeacherReview = {
      ...FIXTURE_REVIEW_AGREEING_A,
      reviewId: "review-confident",
      sampleId: FIXTURE_UNCERTAIN.sample.sampleId,
      reviewer: FIXTURE_REVIEWERS.second,
      overallLabel: "correct-recitation",
      observations: [],
    };
    const both = addReview(FIXTURE_UNCERTAIN, confident);

    expect(both.reviews).toHaveLength(2);
    expect(groundTruthFor(both).source).toBe("none");
    expect(workflowState(both)).toBe("adjudication-required");
  });
});

describe("disagreements cannot automatically become ground truth", () => {
  it("produces no ground truth while two reviews differ", () => {
    const truth = groundTruthFor(FIXTURE_DISPUTED);

    expect(reviewsAgree(FIXTURE_DISPUTED.reviews)).toBe(false);
    expect(truth.source).toBe("none");
    expect(truth.overallLabel).toBeNull();
    // The reviews are still recorded — nothing was dropped to reach that answer.
    expect(truth.reviewIds).toEqual([FIXTURE_REVIEW_DISAGREEING_A.reviewId, FIXTURE_REVIEW_DISAGREEING_B.reviewId]);
  });

  it("names each point of disagreement for the adjudicator", () => {
    const conflicts = disagreements(FIXTURE_DISPUTED.reviews);

    expect(conflicts.some((conflict) => conflict.kind === "overall-label")).toBe(true);
    const positions = conflicts[0].positions;
    expect(positions[FIXTURE_REVIEWERS.first.reviewerId]).toBe("madd-duration-issue");
    expect(positions[FIXTURE_REVIEWERS.second.reviewerId]).toBe("correct-recitation");
  });

  it("routes a disagreement to adjudication rather than to a merge", () => {
    expect(workflowState(FIXTURE_DISPUTED, DEFAULT_WORKFLOW_POLICY)).toBe("adjudication-required");
    expect(workflowState(FIXTURE_DISPUTED, { ...DEFAULT_WORKFLOW_POLICY, adjudicationRequiredOnDisagreement: false })).toBe(
      "disagreement",
    );
  });

  it("refuses an adjudication with no adjudicator, qualification, rationale or considered reviews", () => {
    const base = FIXTURE_ADJUDICATION;
    expect(() => adjudicate(FIXTURE_DISPUTED, { ...base, rationale: "  " })).toThrow(LabelingError);
    expect(() =>
      adjudicate(FIXTURE_DISPUTED, { ...base, adjudicator: { reviewerId: "", qualification: "Qari" } }),
    ).toThrow(LabelingError);
    expect(() =>
      adjudicate(FIXTURE_DISPUTED, { ...base, adjudicator: { reviewerId: "reviewer-9", qualification: "" } }),
    ).toThrow(LabelingError);
    expect(() => adjudicate(FIXTURE_DISPUTED, { ...base, consideredReviewIds: [] })).toThrow(LabelingError);
    expect(() => adjudicate(FIXTURE_DISPUTED, { ...base, consideredReviewIds: ["review-that-does-not-exist"] })).toThrow(
      LabelingError,
    );
  });

  it("keeps the original reviews untouched after adjudication", () => {
    const resolved = adjudicate(FIXTURE_DISPUTED, FIXTURE_ADJUDICATION);

    expect(resolved.reviews).toBe(FIXTURE_DISPUTED.reviews);
    expect(resolved.reviews[0]).toEqual(FIXTURE_REVIEW_DISAGREEING_A);
    expect(resolved.reviews[1]).toEqual(FIXTURE_REVIEW_DISAGREEING_B);
    expect(groundTruthFor(resolved).source).toBe("adjudicated");
  });

  it("counts reviews as agreeing only when the observations match too", () => {
    const sameLabelDifferentPlace: TeacherReview = {
      ...FIXTURE_REVIEW_AGREEING_A,
      reviewId: "review-elsewhere",
      reviewer: FIXTURE_REVIEWERS.second,
      observations: [
        {
          id: "obs-elsewhere",
          label: "word-omission",
          location: { scope: "word", surah: 112, ayah: 1, wordIndex: 3 },
          severity: "meaningful",
          confidence: "confident",
        },
      ],
    };
    expect(reviewsAgree([FIXTURE_REVIEW_AGREEING_A, sameLabelDifferentPlace])).toBe(false);
  });
});

describe("Quranic expected text is immutable through labeling", () => {
  const expectedBefore = FIXTURE_SAMPLE_IKHLAS.expectedText;

  it("carries the expected text unchanged through a review", () => {
    const withReview = addReview(FIXTURE_UNREVIEWED, {
      ...FIXTURE_REVIEW_AGREEING_A,
      reviewId: "review-new",
      correction: { heardText: "قُلْ اللَّهُ أَحَدٌ", guidance: "Repeat from the second word." },
    });

    expect(withReview.sample.expectedText).toBe(expectedBefore);
    expect(withReview.sample).toBe(FIXTURE_UNREVIEWED.sample);
  });

  it("keeps a teacher's correction out of the expected text", () => {
    const withReview = addReview(FIXTURE_UNREVIEWED, {
      ...FIXTURE_REVIEW_AGREEING_A,
      reviewId: "review-correction",
      correction: { heardText: "not the ayah at all" },
    });

    expect(withReview.sample.expectedText).toBe(expectedBefore);
    expect(withReview.reviews[0].correction?.heardText).toBe("not the ayah at all");
  });

  it("carries it unchanged through adjudication and machine attachment", () => {
    const withMachine = attachMachineOutput(FIXTURE_ADJUDICATED, FIXTURE_MACHINE_LAYERS);
    const resolved = adjudicate(withMachine, FIXTURE_ADJUDICATION);

    expect(resolved.sample.expectedText).toBe(FIXTURE_DISPUTED.sample.expectedText);
    expect(FIXTURE_SAMPLE_IKHLAS.expectedText).toBe(expectedBefore);
  });

  it("offers no label field that holds a replacement scripture text", () => {
    const reviewFields = Object.keys(FIXTURE_REVIEW_AGREEING_A);
    for (const forbidden of ["expectedText", "quranText", "ayahText"]) {
      expect(reviewFields, forbidden).not.toContain(forbidden);
    }
    expect(Object.keys(FIXTURE_REVIEW_AGREEING_A.correction ?? {}).sort()).toEqual(["guidance", "heardText"]);
  });
});

describe("reviewer metadata is preserved", () => {
  it("refuses a review with no reviewer id, no qualification or no date", () => {
    const base = { ...FIXTURE_REVIEW_AGREEING_A, reviewId: "review-metadata" };
    expect(() => addReview(FIXTURE_UNREVIEWED, { ...base, reviewer: { reviewerId: "", qualification: "Qari" } })).toThrow(
      LabelingError,
    );
    expect(() =>
      addReview(FIXTURE_UNREVIEWED, { ...base, reviewer: { reviewerId: "reviewer-9", qualification: "  " } }),
    ).toThrow(LabelingError);
    expect(() => addReview(FIXTURE_UNREVIEWED, { ...base, reviewedAt: "" })).toThrow(LabelingError);
  });

  it("keeps each reviewer's identity, riwayah and date on their own review", () => {
    const truth = groundTruthFor(FIXTURE_DISPUTED);
    expect(truth.source).toBe("none");

    for (const review of FIXTURE_DISPUTED.reviews) {
      expect(review.reviewer.reviewerId).toMatch(/^reviewer-/);
      expect(review.reviewer.qualification.length).toBeGreaterThan(0);
      expect(review.reviewer.riwayah).toBe("Hafs");
      expect(review.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });

  it("records who adjudicated, when, why, and on the basis of which reviews", () => {
    expect(FIXTURE_ADJUDICATION.adjudicator.reviewerId).toBe(FIXTURE_REVIEWERS.adjudicator.reviewerId);
    expect(FIXTURE_ADJUDICATION.rationale.length).toBeGreaterThan(20);
    expect(FIXTURE_ADJUDICATION.consideredReviewIds).toHaveLength(2);
    expect(FIXTURE_ADJUDICATION.adjudicatedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("keeps reviewer identity out of the recording record", () => {
    const sampleJson = JSON.stringify(FIXTURE_SAMPLE_IKHLAS);
    expect(sampleJson).not.toContain(FIXTURE_REVIEWERS.first.reviewerId);
    for (const forbidden of ["reviewer", "reviewedAt", "overallLabel", "observations"]) {
      expect(Object.keys(FIXTURE_SAMPLE_IKHLAS), forbidden).not.toContain(forbidden);
    }
  });

  it("refuses the same review id twice, so a resubmission cannot overwrite a review", () => {
    const once = addReview(FIXTURE_UNREVIEWED, { ...FIXTURE_REVIEW_AGREEING_A, reviewId: "review-dupe" });
    expect(() => addReview(once, { ...FIXTURE_REVIEW_AGREEING_A, reviewId: "review-dupe" })).toThrow(LabelingError);
  });
});

describe("timestamps identify exact word and letter segments", () => {
  const letterObservation: LabelObservation = {
    id: "obs-letter",
    label: "letter-substitution",
    location: {
      scope: "letter",
      surah: 112,
      ayah: 1,
      wordIndex: 4,
      letterIndex: 2,
      grapheme: "ح",
      timeRange: { startMs: 2620, endMs: 2810 },
    },
    severity: "meaningful",
    confidence: "confident",
    expected: "ح",
    heard: "ه",
    confusionPairId: "ha-ha",
  };

  const secondOnSameWord: LabelObservation = {
    id: "obs-same-word",
    label: "madd-duration-issue",
    location: { scope: "word", surah: 112, ayah: 1, wordIndex: 4, timeRange: { startMs: 2620, endMs: 4100 } },
    severity: "minor",
    confidence: "probable",
  };

  it("addresses a single letter of a single word", () => {
    expect(() => assertObservationFits(letterObservation)).not.toThrow();
    const location = letterObservation.location;
    expect(location.scope).toBe("letter");
    if (location.scope === "letter") {
      expect(location.wordIndex).toBe(4);
      expect(location.letterIndex).toBe(2);
      expect(location.grapheme).toBe("ح");
      expect(location.timeRange).toEqual({ startMs: 2620, endMs: 2810 });
    }
  });

  it("finds every observation on one word, however many there are", () => {
    const found = observationsForWord([letterObservation, secondOnSameWord], 112, 1, 4);
    expect(found).toHaveLength(2);
    expect(found.map((observation) => observation.label).sort()).toEqual([
      "letter-substitution",
      "madd-duration-issue",
    ]);
  });

  it("finds the observations covering a moment in the recording", () => {
    const at = observationsAtMs([letterObservation, secondOnSameWord], 2700);
    expect(at.map((observation) => observation.id).sort()).toEqual(["obs-letter", "obs-same-word"]);
    expect(observationsAtMs([letterObservation, secondOnSameWord], 900)).toEqual([]);
  });

  it("rejects a label attached at a scope its definition does not allow", () => {
    expect(() =>
      assertObservationFits({
        id: "obs-bad-scope",
        label: "letter-substitution",
        location: { scope: "ayah", surah: 112, ayah: 1 },
        severity: "minor",
        confidence: "probable",
      }),
    ).toThrow(LabelingError);
  });

  it("rejects a time range that ends before it starts", () => {
    expect(() =>
      assertObservationFits({
        id: "obs-bad-time",
        label: "word-omission",
        location: { scope: "word", surah: 112, ayah: 1, wordIndex: 2, timeRange: { startMs: 900, endMs: 400 } },
        severity: "minor",
        confidence: "probable",
      }),
    ).toThrow(LabelingError);
  });

  it("still accepts a whole-recording observation with no timing at all", () => {
    const coarse: LabeledSample = addReview(FIXTURE_UNREVIEWED, {
      ...FIXTURE_REVIEW_AGREEING_A,
      reviewId: "review-coarse",
      overallLabel: "audio-quality-insufficient",
      observations: [
        {
          id: "obs-coarse",
          label: "audio-quality-insufficient",
          location: { scope: "recording" },
          severity: "informational",
          confidence: "confident",
        },
      ],
    });
    expect(groundTruthFor(coarse).uncertain).toBe(true);
  });
});
