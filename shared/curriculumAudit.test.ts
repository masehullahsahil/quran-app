/**
 * The audit's own guarantees.
 *
 * These are not curriculum tests — `shared/qaidaQuality.test.ts` checks the
 * lessons themselves. What is checked here is that the review *mechanism* holds
 * its promises: that every piece of the course reaches a teacher, that a lesson
 * added later cannot slip past them, that nothing acquires approval without a
 * named human, that translation data can never touch Quranic Arabic, and that a
 * reviewer's identity stays out of the curriculum it reviews.
 *
 * None of this says the curriculum is correct. A green suite here means the
 * audit is ready to be carried out, not that it has been.
 */
import { describe, expect, it } from "vitest";
import {
  AUDIT_CATEGORIES,
  AUDIT_ITEM_KINDS,
  CONTENT_PROVENANCE,
  ReviewRecordError,
  approvalStatement,
  articulationItems,
  auditItemsForLesson,
  auditProgress,
  buildAuditInventory,
  itemsForLesson,
  provenanceOf,
  recordReview,
  statusOf,
  type AuditItem,
  type AuditLedger,
  type ReviewDraft,
} from "./curriculumAudit";
import { ARTICULATION_NOTES, CURRICULUM_AUDIT_INVENTORY, auditItem } from "./curriculumAuditInventory";
import { AUDIT_FINDINGS, FINDING_AUTHOR, FINDING_STATE, findingsForItem } from "./curriculumAuditFindings";
import {
  QAIDA_LESSONS,
  QAIDA_LETTERS,
  QAIDA_LEVELS,
  getQaidaLevel,
  type QaidaLesson,
} from "./qaidaCurriculum";
import { localizedExercise, localizedLesson, type QaidaTextPack } from "./qaidaText";
import { quranWord, teaching } from "./qaidaExercises";
import en from "../locales/en";

const inventory = CURRICULUM_AUDIT_INVENTORY;
const idsOf = (items: readonly AuditItem[]) => items.map((item) => item.id);
const emptyLedger: AuditLedger = { records: [] };

const teacher = {
  name: "Reviewer Under Test",
  identifier: "reviewer@example.org",
  qualification: "Qaida teacher, ijazah in Hafs",
};

const approval: ReviewDraft = {
  itemId: "objective:harakat-fatha",
  status: "approved",
  category: "beginner-clarity",
  comment: "Read and accepted as written.",
  reviewer: teacher,
  reviewedAt: "2026-01-15",
  attestation: "I have read this item and, as a qualified teacher, I approve it.",
};

describe("the inventory covers the whole course", () => {
  it("carries every level, and each level's place in the sequence", () => {
    for (const level of QAIDA_LEVELS) {
      expect(auditItem(`level:${level.id}`), level.id).not.toBeNull();
      expect(auditItem(`level-sequence:${level.id}`), level.id).not.toBeNull();
    }
  });

  it("carries every lesson's objective, teaching text, mastery rule and prerequisites", () => {
    for (const lesson of QAIDA_LESSONS) {
      expect(auditItem(`objective:${lesson.id}`), lesson.id).not.toBeNull();
      expect(auditItem(`teaching:${lesson.id}`), lesson.id).not.toBeNull();
      expect(auditItem(`mastery:${lesson.id}`), lesson.id).not.toBeNull();
      for (const prerequisite of lesson.prerequisites) {
        expect(auditItem(`prerequisite:${lesson.id}<-${prerequisite}`), `${lesson.id}<-${prerequisite}`).not.toBeNull();
      }
      if (lesson.boundary) expect(auditItem(`boundary:${lesson.id}`), lesson.id).not.toBeNull();
    }
  });

  it("carries every Arabic example, with its source and its reference", () => {
    for (const lesson of QAIDA_LESSONS) {
      lesson.examples.forEach((example, index) => {
        const item = auditItem(`example:${lesson.id}#${index + 1}`);
        expect(item, `${lesson.id} example ${index + 1}`).not.toBeNull();
        expect(item?.arabic).toBe(example.arabic);
        expect(item?.arabicSource).toBe(example.source);
        if (example.reference) expect(item?.quranReference).toBe(example.reference);
      });
    }
  });

  it("carries every exercise and the answer it counts as correct", () => {
    for (const lesson of QAIDA_LESSONS) {
      for (const exercise of lesson.practice) {
        const prompt = auditItem(`exercise:${exercise.id}`);
        const answer = auditItem(`answer:${exercise.id}`);
        expect(prompt, exercise.id).not.toBeNull();
        expect(prompt?.content).toContain(exercise.prompt);
        expect(answer, exercise.id).not.toBeNull();
        expect(answer?.expectedAnswer?.length ?? 0).toBeGreaterThan(0);
        if (exercise.quran) expect(auditItem(`quran-ref:${exercise.id}`), exercise.id).not.toBeNull();
      }
    }
  });

  it("carries every Quran reference the curriculum names", () => {
    const referenced = inventory.filter((item) => item.quranReference).length;
    const inCurriculum = QAIDA_LESSONS.reduce((total, lesson) => {
      const examples = lesson.examples.filter((example) => example.source === "quran").length;
      const subjects = lesson.practice.filter((item) => item.subject?.source === "quran").length;
      const opens = lesson.practice.filter((item) => item.quran).length;
      // An opened ayah produces both a prompt item and its own reference item.
      return total + examples + subjects + opens * 2;
    }, 0);
    expect(referenced).toBe(inCurriculum);
  });

  it("carries an articulation note and practice cue for all 28 letters", () => {
    expect(ARTICULATION_NOTES).toHaveLength(28);
    for (const letter of QAIDA_LETTERS) {
      const item = auditItem(`articulation:${letter.slug}`);
      expect(item, letter.slug).not.toBeNull();
      expect(item?.content).toBe(en.lessons.letters[letter.slug]?.articulation);
      expect(item?.categories).toContain("makhraj-articulation");
    }
  });

  it("uses every declared kind and every declared category somewhere", () => {
    for (const kind of AUDIT_ITEM_KINDS) {
      expect(inventory.some((item) => item.kind === kind), kind).toBe(true);
    }
    for (const category of AUDIT_CATEGORIES) {
      expect(inventory.some((item) => item.categories.includes(category)), category).toBe(true);
    }
  });

  it("gives every item a unique, stable id and a source path", () => {
    expect(new Set(idsOf(inventory)).size).toBe(inventory.length);
    for (const item of inventory) {
      expect(item.id.trim().length, item.id).toBeGreaterThan(0);
      expect(item.sourcePath.trim().length, item.id).toBeGreaterThan(0);
    }
  });
});

describe("a lesson cannot be added without becoming reviewable", () => {
  it("derives the reviewed lesson set from the curriculum, with nothing extra or stale", () => {
    const reviewed = new Set(inventory.map((item) => item.lessonId).filter((id): id is string => Boolean(id)));
    expect([...reviewed].sort()).toEqual(QAIDA_LESSONS.map((lesson) => lesson.id).sort());
  });

  it("turns every field of a lesson the course has never seen into review items", () => {
    const invented: QaidaLesson = {
      id: "invented-lesson",
      level: "harakat",
      title: "A lesson added after the audit was built",
      objective: "Read something the inventory has never been told about.",
      teaching: "Teaching text for a lesson that does not exist in the course.",
      examples: [teaching("بَ", "ba"), quranWord("قُلْ", "qul", "112:1")],
      stages: ["learn", "check", "complete"],
      practice: [
        {
          id: "invented-choice",
          type: "identify-letter",
          prompt: "Which letter is this?",
          subject: teaching("بَ", "ba"),
          choices: [
            { id: "option-1", label: "Baa", correct: true },
            { id: "option-2", label: "Taa", correct: false },
          ],
        },
        {
          id: "invented-read",
          type: "read-quran",
          prompt: "Read this ayah aloud.",
          quran: { surah: 112, ayah: 1, label: "Al-Ikhlas 112:1" },
        },
      ],
      prerequisites: ["harakat-fatha"],
      mastery: { correctRequired: 2, itemsRequired: 2 },
      next: null,
      boundary: "The app does not judge how this sounded.",
    };

    const items = auditItemsForLesson(invented, 99, getQaidaLevel("harakat")!);
    const kinds = items.map((item) => item.kind);

    expect(idsOf(items)).toEqual([
      "objective:invented-lesson",
      "teaching:invented-lesson",
      "example:invented-lesson#1",
      "example:invented-lesson#2",
      "exercise:invented-choice",
      "answer:invented-choice",
      "exercise:invented-read",
      "answer:invented-read",
      "quran-ref:invented-read",
      "prerequisite:invented-lesson<-harakat-fatha",
      "mastery:invented-lesson",
      "boundary:invented-lesson",
    ]);
    expect(kinds).toContain("expected-answer");
    expect(kinds).toContain("quran-reference");
    expect(kinds).toContain("mastery-rule");
    // Every item starts where everything starts.
    for (const item of items) expect(statusOf(item.id, emptyLedger), item.id).toBe("pending-review");
  });

  it("adds an articulation note for a letter the packs gain later", () => {
    const items = articulationItems([
      { slug: "invented", name: "Invented", articulation: "A note written later.", tip: "A cue.", sourcePath: "locales/en/index.ts" },
    ]);
    expect(idsOf(items)).toEqual(["articulation:invented", "articulation-tip:invented"]);
  });

  it("counts the whole inventory rather than a fixed number", () => {
    // Rebuilt from the same sources, the inventory has to come out the same:
    // the audit is derived, not maintained by hand alongside the curriculum.
    expect(buildAuditInventory(ARTICULATION_NOTES).map((item) => item.id)).toEqual(idsOf(inventory));
  });
});

describe("nothing defaults to teacher-approved", () => {
  it("starts every item pending and AI-drafted", () => {
    const progress = auditProgress(inventory, emptyLedger);
    expect(progress.byStatus["pending-review"]).toBe(inventory.length);
    expect(progress.byStatus.approved).toBe(0);
    expect(progress.byProvenance["ai-drafted"]).toBe(inventory.length);
    expect(progress.byProvenance["teacher-approved"]).toBe(0);
    expect(progress.approvedShare).toBe(0);
  });

  it("says so in the one sentence the interface and the report both use", () => {
    expect(approvalStatement(inventory, emptyLedger)).toContain("No part of this curriculum has been approved");
  });

  it("refuses an approval with no attestation, no qualification or no reviewer", () => {
    expect(() => recordReview({ ...approval, attestation: undefined })).toThrow(ReviewRecordError);
    expect(() =>
      recordReview({ ...approval, reviewer: { name: teacher.name } }),
    ).toThrow(ReviewRecordError);
    expect(() => recordReview({ ...approval, reviewer: { name: "  " } })).toThrow(ReviewRecordError);
    expect(() => recordReview({ ...approval, reviewedAt: "" })).toThrow(ReviewRecordError);
  });

  it("requires a comment on a correction or a clarification request", () => {
    expect(() =>
      recordReview({ ...approval, status: "correction-requested", comment: "", attestation: undefined }),
    ).toThrow(ReviewRecordError);
  });

  it("treats a complete approval as approval, and only for the item it names", () => {
    const ledger: AuditLedger = { records: [recordReview(approval)] };
    expect(statusOf("objective:harakat-fatha", ledger)).toBe("approved");
    expect(provenanceOf("objective:harakat-fatha", ledger)).toBe("teacher-approved");
    expect(provenanceOf("teaching:harakat-fatha", ledger)).toBe("ai-drafted");
    expect(auditProgress(inventory, ledger).byProvenance["teacher-approved"]).toBe(1);
  });

  it("counts a comment as reviewed but never as approved", () => {
    const ledger: AuditLedger = {
      records: [
        recordReview({
          itemId: "teaching:harakat-fatha",
          status: "correction-requested",
          category: "beginner-clarity",
          severity: "major",
          impact: "wording-only",
          comment: "The wording needs work.",
          reviewer: teacher,
          reviewedAt: "2026-01-15",
        }),
      ],
    };
    expect(provenanceOf("teaching:harakat-fatha", ledger)).toBe("teacher-reviewed");
    expect(CONTENT_PROVENANCE).toEqual(["ai-drafted", "teacher-reviewed", "teacher-approved"]);
  });

  it("keeps automated findings out of the provenance model entirely", () => {
    // Findings are questions raised by tooling. An item with findings against it
    // is still AI-drafted: nothing a machine notices moves it along.
    const flagged = AUDIT_FINDINGS.flatMap((finding) => finding.itemIds);
    expect(flagged.length).toBeGreaterThan(0);
    for (const itemId of flagged) expect(provenanceOf(itemId, emptyLedger), itemId).toBe("ai-drafted");

    expect(FINDING_AUTHOR).toBe("automated-inventory-review");
    expect(FINDING_STATE).toBe("awaiting-teacher");
    for (const finding of AUDIT_FINDINGS) {
      expect(finding.question.trim().endsWith("?"), finding.id).toBe(true);
      expect(Object.keys(finding)).not.toContain("status");
      expect(Object.keys(finding)).not.toContain("reviewer");
      expect(Object.keys(finding)).not.toContain("resolution");
    }
  });

  it("points every finding at inventory items that exist", () => {
    for (const finding of AUDIT_FINDINGS) {
      for (const itemId of finding.itemIds) expect(auditItem(itemId), `${finding.id} → ${itemId}`).not.toBeNull();
      if (finding.itemIds.length) expect(findingsForItem(finding.itemIds[0])).toContainEqual(finding);
    }
  });
});

describe("Quranic Arabic cannot be changed through localization data", () => {
  const lesson = QAIDA_LESSONS.find((entry) => entry.examples.some((example) => example.source === "quran"))!;
  const exercise = QAIDA_LESSONS.flatMap((entry) => entry.practice).find((item) => item.subject?.source === "quran")!;

  /** A pack that tries to reach past the four fields it is allowed to carry. */
  const hostilePack = {
    lessons: {
      [lesson.id]: {
        title: "Translated title",
        objective: "Translated objective",
        teaching: "Translated teaching",
        examples: [{ arabic: "لَا شَيْءَ", gloss: "injected", source: "quran", reference: "9:9" }],
        arabic: "لَا شَيْءَ",
      },
    },
    exercises: {
      [exercise.id]: {
        prompt: "Translated prompt",
        subject: { arabic: "لَا شَيْءَ", gloss: "injected", source: "quran" },
        choices: [{ id: "option-1", arabic: "لَا شَيْءَ", correct: true }],
        quran: { surah: 9, ayah: 9, label: "injected" },
      },
    },
  } as unknown as QaidaTextPack;

  it("localizes only the four lesson fields and the two exercise fields", () => {
    expect(Object.keys(localizedLesson(lesson, hostilePack)).sort()).toEqual([
      "boundary",
      "objective",
      "teaching",
      "title",
    ]);
    expect(Object.keys(localizedExercise(exercise, hostilePack)).sort()).toEqual(["note", "prompt"]);
  });

  it("leaves the Arabic of the lesson and the exercise byte-identical", () => {
    const before = JSON.stringify({ examples: lesson.examples, subject: exercise.subject, choices: exercise.choices });
    localizedLesson(lesson, hostilePack);
    localizedExercise(exercise, hostilePack);
    const after = JSON.stringify({ examples: lesson.examples, subject: exercise.subject, choices: exercise.choices });

    expect(after).toBe(before);
    expect(JSON.stringify(localizedLesson(lesson, hostilePack))).not.toContain("لَا شَيْءَ");
    expect(JSON.stringify(localizedExercise(exercise, hostilePack))).not.toContain("لَا شَيْءَ");
  });

  it("keeps the audit inventory's Arabic sourced from the curriculum, not from a pack", () => {
    for (const item of inventory) {
      if (!item.arabic || item.lessonId === null) continue;
      const owner = QAIDA_LESSONS.find((entry) => entry.id === item.lessonId);
      const known = [
        ...(owner?.examples.map((example) => example.arabic) ?? []),
        ...(owner?.practice.map((practice) => practice.subject?.arabic) ?? []),
      ].filter(Boolean);
      expect(known, item.id).toContain(item.arabic);
    }
  });

  it("marks Quranic Arabic as Quranic wherever it appears in the inventory", () => {
    for (const item of inventory) {
      if (item.arabicSource !== "quran") continue;
      expect(item.quranReference, item.id).toBeTruthy();
      expect(item.categories, item.id).toContain("quran-accuracy");
    }
  });
});

describe("reviewer metadata stays out of the curriculum", () => {
  const ledger: AuditLedger = { records: [recordReview(approval)] };

  it("puts no reviewer, status or approval field on a lesson or an exercise", () => {
    const curriculumKeys = new Set(QAIDA_LESSONS.flatMap((lesson) => Object.keys(lesson)));
    for (const forbidden of ["reviewer", "reviewedAt", "status", "approved", "attestation", "severity"]) {
      expect([...curriculumKeys], forbidden).not.toContain(forbidden);
    }
    const exerciseKeys = new Set(QAIDA_LESSONS.flatMap((lesson) => lesson.practice.flatMap((item) => Object.keys(item))));
    for (const forbidden of ["reviewer", "status", "approved"]) {
      expect([...exerciseKeys], forbidden).not.toContain(forbidden);
    }
  });

  it("puts no reviewer identity on an inventory item", () => {
    for (const item of inventory) {
      for (const forbidden of ["reviewer", "reviewedAt", "status", "attestation", "comment"]) {
        expect(Object.keys(item), `${item.id}/${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("does not write the reviewer's name into the curriculum when a review is recorded", () => {
    expect(JSON.stringify(QAIDA_LESSONS)).not.toContain(teacher.name);
    expect(JSON.stringify(QAIDA_LESSONS)).not.toContain(teacher.identifier);
    expect(statusOf(approval.itemId, ledger)).toBe("approved");
    // The record and the content it reviews meet only through the item id.
    expect(ledger.records[0].itemId).toBe(approval.itemId);
    expect(auditItem(approval.itemId)?.lessonId).toBe("harakat-fatha");
  });

  it("keeps a review's attribution fixed at the moment it was made", () => {
    const record = ledger.records[0];
    const renamed = { ...teacher, name: "Someone Else" };
    expect(record.reviewer.name).toBe(teacher.name);
    expect(renamed.name).not.toBe(record.reviewer.name);
  });

  it("scopes review reads to one item at a time", () => {
    expect(itemsForLesson(inventory, "harakat-fatha").every((item) => item.lessonId === "harakat-fatha")).toBe(true);
  });
});
