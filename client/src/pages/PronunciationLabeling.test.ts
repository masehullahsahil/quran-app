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
import PronunciationLabeling from "./PronunciationLabeling";
import { LABEL_DEFINITIONS, PRONUNCIATION_LABELS, SEVERITY_LEVELS } from "@shared/pronunciationDataset";
import { FIXTURE_SAMPLE_IKHLAS, FIXTURE_SAMPLES } from "@shared/pronunciationDatasetFixtures";

const markup = renderToStaticMarkup(createElement(PronunciationLabeling));

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
