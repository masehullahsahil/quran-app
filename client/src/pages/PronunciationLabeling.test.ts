/**
 * What the labeling prototype shows a teacher when they open it.
 *
 * Rendered to static markup with no session loaded — the state every reviewer
 * starts from. The assertions are about honesty and about the workflow being
 * visible: that the page says the samples are synthetic, that the taxonomy is
 * marked unapproved, that the expected ayah and the alignment timings are on
 * screen, that a machine prediction is shown as a prediction, and that the
 * disagreement case offers adjudication rather than a merge.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PronunciationLabeling, {
  BENCHMARK_TEACHER_LABELS,
  BenchmarkLabeling,
  buildBenchmarkReview,
  emptyBenchmarkDraft,
  parseBenchmarkReviews,
  serializeBenchmarkReviews,
  type BenchmarkDraft,
} from "./PronunciationLabeling";
import {
  LABEL_DEFINITIONS,
  PRONUNCIATION_LABELS,
  SEVERITY_LEVELS,
  type TeacherReviewer,
} from "@shared/pronunciationDataset";
import { FIXTURE_SAMPLE_IKHLAS, FIXTURE_SAMPLES } from "@shared/pronunciationDatasetFixtures";

const markup = renderToStaticMarkup(createElement(PronunciationLabeling));
const benchmarkMarkup = renderToStaticMarkup(createElement(BenchmarkLabeling));

describe("the prototype opens honestly", () => {
  it("says the samples are synthetic and no audio is stored", () => {
    expect(markup).toContain("Synthetic fixtures");
    expect(markup).toContain("no learner audio is stored in this repository");
    expect(markup).toContain("never uploaded, stored or attached to the labels");
  });

  it("marks both taxonomies as proposed and unapproved", () => {
    expect(markup).toContain("proposed-pending-qualified-teacher-approval");
    expect(markup).toContain("not religiously complete");
    // mayDriveLearnerFacingCorrection([]) is rendered, and it is false.
    expect(markup).toContain("may not drive learner-facing correction behaviour: false");
  });

  it("bundles no audio and embeds no recording", () => {
    expect(markup).not.toContain("data:audio");
    expect(markup).not.toContain(".mp3");
    expect(markup).not.toContain(".webm");
    expect(markup).toContain("No audio is bundled with this prototype");
  });
});

describe("a teacher can see what they are labeling", () => {
  it("shows the expected ayah, unmirrored, with its reference", () => {
    expect(markup).toContain(FIXTURE_SAMPLE_IKHLAS.expectedText);
    expect(markup).toContain('lang="ar" dir="rtl"');
    expect(markup).toContain(`Surah ${FIXTURE_SAMPLE_IKHLAS.surah}, ayah ${FIXTURE_SAMPLE_IKHLAS.ayah}`);
  });

  it("says the expected text is never edited by labeling", () => {
    expect(markup).toContain("Labeling never edits it");
  });

  it("shows the alignment timings in milliseconds", () => {
    expect(markup).toContain("Alignment (machine) — timings only, not a judgement");
    expect(markup).toContain("200–880 ms");
    expect(markup).toContain("aligner confidence");
  });

  it("shows a machine prediction as a prediction, never as an answer", () => {
    expect(markup).toContain("Machine prediction — not ground truth, never pre-filled");
    expect(markup).toContain("fixture-model");
  });

  it("offers every word, and the letters inside the selected word, as targets", () => {
    // Words of the fixture ayah are rendered as selectable targets.
    for (const word of FIXTURE_SAMPLE_IKHLAS.expectedText.split(/\s+/)) expect(markup, word).toContain(word);
    expect(markup).toContain("word 1");
    expect(markup).toContain("no word selected");
  });
});

describe("the review form covers the workflow", () => {
  it("offers all 21 labels, marking the ones needing a qualified teacher", () => {
    for (const label of PRONUNCIATION_LABELS) expect(markup, label).toContain(LABEL_DEFINITIONS[label].title);
    expect(markup).toContain("(qualified teacher)");
  });

  it("offers the four severity levels and the three confidence levels", () => {
    for (const level of SEVERITY_LEVELS) expect(markup, level).toContain(level);
    expect(markup).toContain("uncertain");
    expect(markup).toContain("probable");
  });

  it("lets a reviewer record uncertainty as an outcome", () => {
    expect(markup).toContain("I could not reach a judgement (stays uncertain)");
  });

  it("requires reviewer identity, and says a review without a qualification is refused", () => {
    expect(markup).toContain("A review without a qualification is refused");
    expect(markup).toContain("Reviewer ID");
  });

  it("says reviews are independent and never merged", () => {
    expect(markup).toContain("Submit your independent review");
    expect(markup).toContain("yours are never merged");
  });

  it("allows more than one observation on the same word", () => {
    expect(markup).toContain("More than one observation may sit on the same word");
  });
});

describe("the fixture set covers each workflow state", () => {
  it("lists a sample for every state a reviewer will meet", () => {
    expect(FIXTURE_SAMPLES.length).toBeGreaterThanOrEqual(4);
    expect(markup).toContain("Pending review");
    expect(markup).toContain("Adjudication required");
    expect(markup).toContain("Adjudicated");
  });

  it("shows no ground truth for the sample nobody has reviewed", () => {
    // The first fixture is machine-output-only; its ground truth must read as none.
    expect(markup).toContain("none yet");
  });
});

describe("the benchmark review workflow", () => {
  it("captures the six required benchmark fields", () => {
    expect(benchmarkMarkup).toContain("Sample ID");
    expect(benchmarkMarkup).toContain("Surah");
    expect(benchmarkMarkup).toContain("Ayah");
    expect(benchmarkMarkup).toContain("Correct — no pronunciation issue heard");
    expect(benchmarkMarkup).toContain("Known pronunciation issue");
    expect(benchmarkMarkup).toContain("Insufficient evidence");
    expect(benchmarkMarkup).toContain("Reviewer notes");
    // The scope controls appear once "Known pronunciation issue" is chosen; the
    // initial render states the scope vocabulary in the label summary instead.
    expect(benchmarkMarkup).toContain("a word (by word index) or a phoneme");
    expect(benchmarkMarkup).toContain("Consent and retention confirmed");
    expect(benchmarkMarkup).toContain("Record benchmark label");
    expect(benchmarkMarkup).toContain("Benchmark labels recorded (0)");
  });

  it("says abstention is not accuracy evidence and measures nothing", () => {
    expect(benchmarkMarkup).toContain("A labeling tool only");
    expect(benchmarkMarkup).toContain("does not evaluate pronunciation");
    expect(benchmarkMarkup).toContain("does not measure model accuracy");
    expect(benchmarkMarkup).toContain("abstention is not evidence");
    expect(benchmarkMarkup).toContain("not accuracy evidence");
  });

  it("bundles no audio and plays consented recordings locally only", () => {
    expect(benchmarkMarkup).not.toContain("data:audio");
    expect(benchmarkMarkup).not.toContain(".mp3");
    expect(benchmarkMarkup).toContain("bundles no samples and no audio");
    expect(benchmarkMarkup).toContain("never uploaded, stored or attached");
    expect(benchmarkMarkup).toContain("Open a consented recording locally");
  });

  it("offers exactly the three benchmark teacher labels", () => {
    expect(BENCHMARK_TEACHER_LABELS).toEqual(["correct", "issue", "insufficient"]);
  });
});

describe("benchmark review validation", () => {
  const reviewer: TeacherReviewer = { reviewerId: "qari-1", qualification: "Ijazah holder" };

  function draft(overrides: Partial<BenchmarkDraft>): BenchmarkDraft {
    return {
      ...emptyBenchmarkDraft(),
      sampleId: "shadow-bench-001",
      surah: "1",
      ayah: "2",
      label: "correct",
      consentConfirmed: true,
      ...overrides,
    };
  }

  it("records a valid review with every field intact", () => {
    const { review, errors } = buildBenchmarkReview(
      draft({ label: "issue", scope: "word", scopeDetail: "word 3", notes: "lengthened" }),
      reviewer,
    );
    expect(errors).toEqual([]);
    expect(review).not.toBeNull();
    const recorded = review!;
    expect(recorded.sampleId).toBe("shadow-bench-001");
    expect(recorded.surah).toBe(1);
    expect(recorded.ayah).toBe(2);
    expect(recorded.label).toBe("issue");
    expect(recorded.scope).toBe("word");
    expect(recorded.scopeDetail).toBe("word 3");
    expect(recorded.notes).toBe("lengthened");
    expect(recorded.consentConfirmed).toBe(true);
    expect(recorded.reviewer.reviewerId).toBe("qari-1");
    expect(recorded.reviewedAt).toBeTruthy();
  });

  it("refuses a review missing sample ID, surah/ayah, label, or consent", () => {
    expect(buildBenchmarkReview(draft({ sampleId: "" }), reviewer).review).toBeNull();
    expect(buildBenchmarkReview(draft({ surah: "" }), reviewer).review).toBeNull();
    expect(buildBenchmarkReview(draft({ ayah: "0" }), reviewer).review).toBeNull();
    const noLabel = buildBenchmarkReview(draft({ label: "" }), reviewer);
    expect(noLabel.review).toBeNull();
    expect(noLabel.errors.join(" ")).toContain("teacher label");
    const noConsent = buildBenchmarkReview(draft({ consentConfirmed: false }), reviewer);
    expect(noConsent.review).toBeNull();
    expect(noConsent.errors.join(" ")).toContain("Consent/retention confirmation");
  });

  it("refuses a review without reviewer identity or qualification", () => {
    const { review, errors } = buildBenchmarkReview(draft({}), { reviewerId: "", qualification: "" });
    expect(review).toBeNull();
    expect(errors.join(" ")).toContain("qualification");
  });

  it("keeps the issue scope optional: an issue without a scope still records", () => {
    const { review, errors } = buildBenchmarkReview(draft({ label: "issue", scope: "" }), reviewer);
    expect(errors).toEqual([]);
    expect(review!.scope).toBeNull();
  });

  it("round-trips through export and drops malformed entries", () => {
    const { review } = buildBenchmarkReview(draft({}), reviewer);
    const restored = parseBenchmarkReviews(serializeBenchmarkReviews([review!]));
    expect(restored).toHaveLength(1);
    expect(restored[0].sampleId).toBe("shadow-bench-001");
    expect(restored[0].consentConfirmed).toBe(true);
    expect(parseBenchmarkReviews(serializeBenchmarkReviews([review!, { bogus: true } as never]))).toHaveLength(1);
    expect(parseBenchmarkReviews("not json")).toEqual([]);
    expect(parseBenchmarkReviews(null)).toEqual([]);
  });
});
