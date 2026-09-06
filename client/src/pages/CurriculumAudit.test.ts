/**
 * What the teacher actually sees.
 *
 * The audit model is tested in shared/curriculumAudit.test.ts; this renders the
 * workspace itself, because the guarantees that matter here are visual ones: an
 * unreviewed course must *say* it is unreviewed on the screen a reviewer opens,
 * the Arabic must be present and marked with its source, and the questions
 * raised by tooling must be shown as questions rather than as findings a teacher
 * made. A model that is right and a screen that implies approval would still be
 * a failure.
 *
 * Rendered to static markup, with no ledger loaded — the state every reviewer
 * starts from.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CurriculumAudit from "./CurriculumAudit";
import { CURRICULUM_AUDIT_INVENTORY } from "@shared/curriculumAuditInventory";
import { AUDIT_FINDINGS } from "@shared/curriculumAuditFindings";
import { QAIDA_LESSONS, QAIDA_LEVELS, lessonsForLevel } from "@shared/qaidaCurriculum";

// `createElement` rather than JSX: this file is rendered by whichever JSX
// runtime the test config happens to apply, and the assertions below are about
// the markup, not about the transform.
const markup = renderToStaticMarkup(createElement(CurriculumAudit));

describe("the review workspace opens honestly", () => {
  it("states that nothing has been approved by a qualified teacher", () => {
    expect(markup).toContain("No part of this curriculum has been approved by a qualified teacher");
    expect(markup).toContain(`${CURRICULUM_AUDIT_INVENTORY.length} items are drafted and awaiting review`);
  });

  it("says that passing tests are not review", () => {
    expect(markup).toContain("they say nothing about whether the teaching is correct");
  });

  it("marks every item on the opening level as AI-drafted and pending", () => {
    expect(markup).toContain("AI-drafted — not reviewed by a teacher");
    expect(markup).toContain("Pending review");
    expect(markup).not.toContain("Teacher-approved");
  });

  it("offers no way to approve without a named, qualified reviewer", () => {
    // The attestation field is what approval needs, and it only appears once the
    // reviewer has chosen that status — never as a default.
    expect(markup).toContain("Required before you can approve anything");
    expect(markup).not.toContain("audit-attestation");
  });
});

describe("the first level is reviewable in place", () => {
  const firstLevel = [...QAIDA_LEVELS].sort((left, right) => left.order - right.order)[0];

  it("shows every lesson of the level it opens on", () => {
    for (const lesson of lessonsForLevel(firstLevel.id)) {
      expect(markup, lesson.id).toContain(lesson.title);
      expect(markup, lesson.id).toContain(lesson.objective);
    }
  });

  it("shows the Arabic, the expected answer and the completion rule", () => {
    const lesson = lessonsForLevel(firstLevel.id)[0];
    expect(markup).toContain(lesson.examples[0].arabic);
    expect(markup).toContain("Counted correct:");
    expect(markup).toContain("Complete after");
    expect(markup).toContain('lang="ar" dir="rtl"');
  });

  it("labels teaching combinations and Quranic text differently", () => {
    expect(markup).toContain("Teaching example");
    expect(markup).toContain("audit-arabic");
  });

  it("lists all twelve levels so the review can run in sequence", () => {
    for (const level of QAIDA_LEVELS) expect(markup, level.id).toContain(level.title);
    expect(markup).toContain(`Level 1 of ${QAIDA_LEVELS.length}`);
    expect(markup).toContain(`of ${QAIDA_LESSONS.length}`);
  });

  it("names the review categories each item falls under", () => {
    // Level 1 is the letters: no Quranic text, so the categories shown here are
    // the ones its items actually touch. The full category vocabulary is
    // asserted against the model in shared/curriculumAudit.test.ts.
    expect(markup).toContain("Makhraj / articulation");
    expect(markup).toContain("Instructional sequence");
    expect(markup).toContain("Exercise correctness");
    expect(markup).toContain("Mastery / progression criteria");
    expect(markup).not.toContain("Quran text / reference accuracy");
  });

  it("shows where each item's content lives, so a correction can be applied", () => {
    expect(markup).toContain("shared/qaidaCurriculum.ts");
    expect(markup).toContain("locales/en/index.ts");
  });
});

describe("questions raised by tooling are shown as questions", () => {
  const shownOnFirstLevel = AUDIT_FINDINGS.filter((finding) =>
    finding.itemIds.some((id) => id.includes("identify-ta") || id.includes("similar-ha-hha")),
  );

  it("renders them with the teacher as the one who decides", () => {
    expect(shownOnFirstLevel.length).toBeGreaterThan(0);
    expect(markup).toContain("For you to decide:");
    expect(markup).toContain("Raised automatically while building this inventory — not a teacher&#x27;s opinion.");
  });

  it("never renders one as a correction already made", () => {
    expect(markup).not.toContain("Correction applied");
    expect(markup).not.toContain("Approved by teacher</span>");
  });
});
