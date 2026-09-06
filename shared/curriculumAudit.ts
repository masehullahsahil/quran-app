/**
 * The curriculum audit model: how a qualified teacher reviews this course.
 *
 * The Qaida curriculum in shared/qaidaCurriculum.ts was written by a software
 * team. It has never been checked by a Qari or a Qaida teacher, and no test in
 * this repository can stand in for that: a passing suite says the data is
 * well-formed, not that the teaching is right. This module is the machinery for
 * the review that *can* say so — an inventory of everything a teacher has to
 * look at, the states an item moves through as they look at it, and the record
 * they leave behind.
 *
 * Three rules shape everything here:
 *
 *  1. **The audit never edits the curriculum.** An inventory item is a
 *     read-only view of content that lives elsewhere; a review record is a
 *     separate object keyed by the item's id. Nothing in this file can change
 *     what a lesson teaches, and a test asserts the two stay apart.
 *  2. **Nothing becomes approved on its own.** `pending-review` is the only
 *     state an item can hold without a named human behind it. Approval requires
 *     a reviewer, a date and an explicit attestation, and `recordReview`
 *     refuses to build one without them.
 *  3. **AI drafting is not review.** `provenanceOf` returns `ai-drafted` until a
 *     teacher record exists, and `teacher-approved` only for an approval as
 *     defined above. Structural tests, `pnpm verify:qaida` and any model-written
 *     text are all `ai-drafted` as far as this module is concerned.
 */
import {
  QAIDA_LESSONS,
  QAIDA_LEVELS,
  lessonsForLevel,
  type QaidaLesson,
  type QaidaLevel,
  type QaidaLevelId,
} from "./qaidaCurriculum";
import { correctChoice, isReadExercise, type QaidaExercise } from "./qaidaExercises";

// ---------------------------------------------------------------------------
// What a teacher reviews
// ---------------------------------------------------------------------------

/**
 * The kinds of content the audit covers. Every piece of the course a learner
 * can read or answer belongs to exactly one of these, so "did the teacher see
 * all of it?" is a question with an answer.
 */
export const AUDIT_ITEM_KINDS = [
  /** A level: its title, its objective, and its place in the course. */
  "level",
  /** One lesson's stated objective. */
  "lesson-objective",
  /** One lesson's teaching explanation. */
  "lesson-teaching",
  /** A piece of Arabic shown as an example, teaching-built or Quranic. */
  "arabic-example",
  /** A practice item's question or instruction. */
  "exercise-prompt",
  /** What that practice item counts as the correct answer. */
  "expected-answer",
  /** One lesson's dependency on an earlier lesson. */
  "prerequisite",
  /** The counting rule that lets a learner complete a lesson. */
  "mastery-rule",
  /** A written articulation note for one letter. */
  "articulation-note",
  /** A sentence naming a rule of recitation. */
  "tajweed-explanation",
  /** A pointer at a surah and ayah, or a quoted Quranic word. */
  "quran-reference",
  /** A note stating what the app does not judge. */
  "boundary-note",
] as const;

export type AuditItemKind = (typeof AUDIT_ITEM_KINDS)[number];

/**
 * The categories a finding is filed under. A teacher picks one when they leave
 * a comment; the inventory also suggests the ones an item obviously touches, so
 * a reviewer can work category by category rather than only lesson by lesson.
 */
export const AUDIT_CATEGORIES = [
  /** Does the quoted text belong to the ayah named, spelled as the mushaf has it? */
  "quran-accuracy",
  /** Are the letters, harakat and marks written correctly? */
  "letter-harakat-accuracy",
  /** Is anything said or implied about where a sound is made? */
  "makhraj-articulation",
  /** Are the names of the rules used correctly? */
  "tajweed-terminology",
  /** Is this taught in the right order, after what it depends on? */
  "instructional-sequence",
  /** Is the question answerable, and is the marked answer the right one? */
  "exercise-correctness",
  /** Would a beginner understand this as written? */
  "beginner-clarity",
  /** Is the rule for completing a lesson a reasonable standard? */
  "mastery-progression",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** Human labels, for the review interface and the printed report. */
export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  "quran-accuracy": "Quran text / reference accuracy",
  "letter-harakat-accuracy": "Arabic letter & harakat accuracy",
  "makhraj-articulation": "Makhraj / articulation",
  "tajweed-terminology": "Tajweed terminology",
  "instructional-sequence": "Instructional sequence",
  "exercise-correctness": "Exercise correctness",
  "beginner-clarity": "Beginner clarity",
  "mastery-progression": "Mastery / progression criteria",
};

/**
 * One thing to review.
 *
 * Every field is a copy taken from the curriculum for display. The item is
 * addressed by `id`, which is derived from the curriculum's own ids so a review
 * record written today still points at the same content tomorrow.
 */
export type AuditItem = {
  id: string;
  kind: AuditItemKind;
  levelId: QaidaLevelId;
  /** 1-based level position, for sequential review. */
  levelOrder: number;
  /** The lesson this belongs to, or null for a level-scope item. */
  lessonId: string | null;
  /** 1-based course position of that lesson; 0 for a level-scope item. */
  lessonOrder: number;
  /** Short label naming what this is. */
  label: string;
  /** The English text under review, if any. */
  content: string;
  /** Arabic to show prominently, if any. */
  arabic?: string;
  /** The curriculum's own gloss for that Arabic. */
  gloss?: string;
  /** Whether the Arabic is Quranic or a teaching combination. */
  arabicSource?: "quran" | "teaching";
  /** "1:1"-style reference, where the item names one. */
  quranReference?: string;
  /** What the course treats as correct, for an exercise. */
  expectedAnswer?: string;
  /** Categories this item obviously touches. A teacher may file under any. */
  categories: AuditCategory[];
  /** Where the content lives, so a correction can be applied to the source. */
  sourcePath: string;
};

// ---------------------------------------------------------------------------
// Review state
// ---------------------------------------------------------------------------

/**
 * Where an item stands.
 *
 * `pending-review` is the starting state of everything and the only state that
 * exists without a named reviewer. There is deliberately no "auto-approved",
 * "validated" or "checked by tests" state: none of those is a teacher.
 */
export const REVIEW_STATUSES = ["pending-review", "approved", "correction-requested", "needs-clarification"] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  "pending-review": "Pending review",
  approved: "Approved by teacher",
  "correction-requested": "Correction requested",
  "needs-clarification": "Needs clarification",
};

/** How much a finding matters, in the reviewer's judgement. */
export const REVIEW_SEVERITIES = ["blocking", "major", "minor", "note"] as const;

export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

/**
 * Whether acting on a comment changes what the course *does* or only how it
 * reads. A wording fix is a text edit; a logic change moves lessons, changes an
 * answer, or alters what unlocks what, and needs the curriculum's own tests
 * re-run.
 */
export const CORRECTION_IMPACTS = ["wording-only", "curriculum-logic"] as const;

export type CorrectionImpact = (typeof CORRECTION_IMPACTS)[number];

/**
 * Who reviewed. Kept as its own object, never merged into curriculum data:
 * reviewer identity is a fact about a person, and it does not belong in a
 * lesson definition. A test asserts the separation holds.
 */
export type Reviewer = {
  /** The reviewer's name as they wish to be credited. */
  name: string;
  /** Optional stable identifier — an email, an ijazah number, a staff id. */
  identifier?: string;
  /** Their qualification, in their own words. Recorded, never validated here. */
  qualification?: string;
};

/**
 * One review of one item.
 *
 * A record is append-only in spirit: a later record on the same item supersedes
 * an earlier one for status purposes, and both are kept so the audit shows how
 * a decision was reached.
 */
export type ReviewRecord = {
  itemId: string;
  status: ReviewStatus;
  category: AuditCategory;
  severity: ReviewSeverity;
  /** What the teacher observed. */
  comment: string;
  /** The correction they propose, in their words. Never applied automatically. */
  proposedCorrection?: string;
  impact: CorrectionImpact;
  reviewer: Reviewer;
  /** ISO 8601 date or timestamp of the review. */
  reviewedAt: string;
  /**
   * Present only on an approval: the reviewer stating, in the first person,
   * that they are qualified to approve this content. Approval without it is
   * rejected by `recordReview`.
   */
  attestation?: string;
};

/** The whole audit so far. Stored outside the curriculum, exported as JSON. */
export type AuditLedger = {
  records: ReviewRecord[];
};

export const EMPTY_LEDGER: AuditLedger = { records: [] };

/**
 * Provenance, as the interface must state it.
 *
 * These three are not degrees of the same thing. `ai-drafted` is where all this
 * content starts; `teacher-reviewed` means a qualified reviewer has looked and
 * said something; `teacher-approved` means one has signed off. Automated tests
 * never move an item between them.
 */
export const CONTENT_PROVENANCE = ["ai-drafted", "teacher-reviewed", "teacher-approved"] as const;

export type ContentProvenance = (typeof CONTENT_PROVENANCE)[number];

export const PROVENANCE_LABELS: Record<ContentProvenance, string> = {
  "ai-drafted": "AI-drafted — not reviewed by a teacher",
  "teacher-reviewed": "Teacher-reviewed — comments recorded",
  "teacher-approved": "Teacher-approved",
};

// ---------------------------------------------------------------------------
// Building a review record
// ---------------------------------------------------------------------------

export class ReviewRecordError extends Error {}

export type ReviewDraft = {
  itemId: string;
  status: ReviewStatus;
  category: AuditCategory;
  severity?: ReviewSeverity;
  comment: string;
  proposedCorrection?: string;
  impact?: CorrectionImpact;
  reviewer: Reviewer;
  reviewedAt: string;
  attestation?: string;
};

const nonEmpty = (value: string | undefined): boolean => typeof value === "string" && value.trim().length > 0;

/**
 * Builds a review record, refusing the ones that would misrepresent the audit.
 *
 * The checks are deliberately about *who said it*, not about whether the
 * comment is any good: an unnamed approval, an approval with no attestation, or
 * a record with no date is a claim the audit cannot support, and is rejected
 * here rather than being written and later believed.
 */
export function recordReview(draft: ReviewDraft): ReviewRecord {
  if (!nonEmpty(draft.itemId)) throw new ReviewRecordError("A review must name the item it reviews.");
  if (!nonEmpty(draft.reviewer?.name)) throw new ReviewRecordError("A review must name its reviewer.");
  if (!nonEmpty(draft.reviewedAt)) throw new ReviewRecordError("A review must carry the date it was made.");

  if (draft.status === "approved") {
    if (!nonEmpty(draft.attestation)) {
      throw new ReviewRecordError(
        "Approval requires the reviewer's own attestation that they are qualified to approve this content.",
      );
    }
    if (!nonEmpty(draft.reviewer.qualification)) {
      throw new ReviewRecordError("Approval requires the reviewer's qualification to be recorded.");
    }
  }

  if (draft.status !== "approved" && !nonEmpty(draft.comment)) {
    throw new ReviewRecordError("A correction or clarification request must say what the reviewer observed.");
  }

  return {
    itemId: draft.itemId,
    status: draft.status,
    category: draft.category,
    severity: draft.severity ?? "note",
    comment: draft.comment.trim(),
    ...(nonEmpty(draft.proposedCorrection) ? { proposedCorrection: draft.proposedCorrection!.trim() } : {}),
    impact: draft.impact ?? "wording-only",
    reviewer: {
      name: draft.reviewer.name.trim(),
      ...(nonEmpty(draft.reviewer.identifier) ? { identifier: draft.reviewer.identifier!.trim() } : {}),
      ...(nonEmpty(draft.reviewer.qualification) ? { qualification: draft.reviewer.qualification!.trim() } : {}),
    },
    reviewedAt: draft.reviewedAt,
    ...(nonEmpty(draft.attestation) ? { attestation: draft.attestation!.trim() } : {}),
  };
}

/** Every record for one item, oldest first. */
export function recordsFor(itemId: string, ledger: AuditLedger): ReviewRecord[] {
  return ledger.records.filter((record) => record.itemId === itemId);
}

/** The record that decides an item's current state, or null. */
export function latestRecord(itemId: string, ledger: AuditLedger): ReviewRecord | null {
  const records = recordsFor(itemId, ledger);
  return records.length ? records[records.length - 1] : null;
}

/** An item's status. Absent a record, it is pending — never anything better. */
export function statusOf(itemId: string, ledger: AuditLedger): ReviewStatus {
  return latestRecord(itemId, ledger)?.status ?? "pending-review";
}

/**
 * An item's provenance.
 *
 * Approval is the narrow case: the deciding record says `approved`, carries an
 * attestation, and names a reviewer with a qualification. Anything else a
 * teacher has said makes the item `teacher-reviewed`; silence leaves it
 * `ai-drafted`, which is where every line of this course stands today.
 */
export function provenanceOf(itemId: string, ledger: AuditLedger): ContentProvenance {
  const record = latestRecord(itemId, ledger);
  if (!record) return "ai-drafted";
  const approved =
    record.status === "approved" && nonEmpty(record.attestation) && nonEmpty(record.reviewer.qualification);
  if (approved) return "teacher-approved";
  return "teacher-reviewed";
}

// ---------------------------------------------------------------------------
// The inventory
// ---------------------------------------------------------------------------

const CURRICULUM_SOURCE = "shared/qaidaCurriculum.ts";

/** Names a rule of recitation, so the sentence needs a tajwid reading. */
const TAJWEED_LEVELS: QaidaLevelId[] = ["tajweed-patterns", "mushaf-symbols"];

function describeExpectedAnswer(exercise: QaidaExercise): string {
  if (isReadExercise(exercise.type)) {
    return "Read aloud — the learner confirms they read it; the app does not grade the sound.";
  }
  const correct = correctChoice(exercise);
  if (!correct) return "No correct option is declared.";
  return [correct.arabic, correct.label].filter(Boolean).join(" — ");
}

function exerciseCategories(exercise: QaidaExercise, lesson: QaidaLesson): AuditCategory[] {
  const categories: AuditCategory[] = ["exercise-correctness", "beginner-clarity"];
  if (exercise.subject?.source === "quran" || exercise.quran) categories.unshift("quran-accuracy");
  if (TAJWEED_LEVELS.includes(lesson.level)) categories.push("tajweed-terminology");
  return categories;
}

/** One articulation note, as the letter reference shows it to a learner. */
export type ArticulationNote = {
  slug: string;
  /** The letter's glyph, where the caller has it. */
  glyph?: string;
  /** The letter's display name, where the caller has it. */
  name?: string;
  articulation: string;
  tip?: string;
  sourcePath: string;
};

function levelItems(level: QaidaLevel): AuditItem[] {
  const lessons = lessonsForLevel(level.id);
  return [
    {
      id: `level:${level.id}`,
      kind: "level",
      levelId: level.id,
      levelOrder: level.order,
      lessonId: null,
      lessonOrder: 0,
      label: `Level ${level.order} — ${level.title}`,
      content: level.objective,
      arabic: level.arabicTitle,
      categories: ["instructional-sequence", "beginner-clarity"],
      sourcePath: CURRICULUM_SOURCE,
    },
    {
      id: `level-sequence:${level.id}`,
      kind: "prerequisite",
      levelId: level.id,
      levelOrder: level.order,
      lessonId: null,
      lessonOrder: 0,
      label: `Placement of level ${level.order} in the course`,
      content: `Level ${level.order} of ${QAIDA_LEVELS.length}, containing ${lessons.length} lesson(s): ${lessons
        .map((lesson) => lesson.title)
        .join("; ")}.`,
      categories: ["instructional-sequence"],
      sourcePath: CURRICULUM_SOURCE,
    },
  ];
}

/**
 * Every review item one lesson produces.
 *
 * Exported so a test can hand it a lesson the course does not contain and check
 * that each field of it becomes reviewable — the property that stops a lesson
 * added next month from quietly bypassing the audit.
 */
export function auditItemsForLesson(lesson: QaidaLesson, lessonOrder: number, level: QaidaLevel): AuditItem[] {
  const base = {
    levelId: lesson.level,
    levelOrder: level.order,
    lessonId: lesson.id,
    lessonOrder,
    sourcePath: CURRICULUM_SOURCE,
  };
  const teachesRule = TAJWEED_LEVELS.includes(lesson.level);

  const items: AuditItem[] = [
    {
      ...base,
      id: `objective:${lesson.id}`,
      kind: "lesson-objective",
      label: `${lesson.title} — objective`,
      content: lesson.objective,
      categories: teachesRule
        ? ["instructional-sequence", "tajweed-terminology", "beginner-clarity"]
        : ["instructional-sequence", "beginner-clarity"],
    },
    {
      ...base,
      id: `teaching:${lesson.id}`,
      kind: teachesRule ? "tajweed-explanation" : "lesson-teaching",
      label: `${lesson.title} — teaching text`,
      content: lesson.teaching,
      categories: teachesRule
        ? ["tajweed-terminology", "beginner-clarity", "letter-harakat-accuracy"]
        : ["beginner-clarity", "letter-harakat-accuracy"],
    },
  ];

  lesson.examples.forEach((example, index) => {
    items.push({
      ...base,
      id: `example:${lesson.id}#${index + 1}`,
      kind: example.source === "quran" ? "quran-reference" : "arabic-example",
      label: `${lesson.title} — example ${index + 1}`,
      content: example.gloss,
      arabic: example.arabic,
      gloss: example.gloss,
      arabicSource: example.source,
      ...(example.reference ? { quranReference: example.reference } : {}),
      categories:
        example.source === "quran"
          ? ["quran-accuracy", "letter-harakat-accuracy"]
          : ["letter-harakat-accuracy", "beginner-clarity"],
    });
  });

  for (const exercise of lesson.practice) {
    items.push({
      ...base,
      id: `exercise:${exercise.id}`,
      kind: "exercise-prompt",
      label: `${lesson.title} — ${exercise.type}`,
      content: [exercise.prompt, exercise.note].filter(Boolean).join(" · "),
      ...(exercise.subject ? { arabic: exercise.subject.arabic, gloss: exercise.subject.gloss, arabicSource: exercise.subject.source } : {}),
      ...(exercise.subject?.reference ? { quranReference: exercise.subject.reference } : {}),
      ...(exercise.quran ? { quranReference: `${exercise.quran.surah}:${exercise.quran.ayah}` } : {}),
      categories: exerciseCategories(exercise, lesson),
    });
    items.push({
      ...base,
      id: `answer:${exercise.id}`,
      kind: "expected-answer",
      label: `${lesson.title} — expected answer`,
      content: describeExpectedAnswer(exercise),
      ...(exercise.subject ? { arabic: exercise.subject.arabic } : {}),
      expectedAnswer: describeExpectedAnswer(exercise),
      categories: ["exercise-correctness", "letter-harakat-accuracy"],
    });

    if (exercise.quran) {
      items.push({
        ...base,
        id: `quran-ref:${exercise.id}`,
        kind: "quran-reference",
        label: `${lesson.title} — ${exercise.quran.label}`,
        content: `Opens ${exercise.quran.label} from the app's Quran data. No ayah text is stored in the curriculum.`,
        quranReference: `${exercise.quran.surah}:${exercise.quran.ayah}`,
        categories: ["quran-accuracy", "instructional-sequence"],
      });
    }
  }

  for (const prerequisite of lesson.prerequisites) {
    items.push({
      ...base,
      id: `prerequisite:${lesson.id}<-${prerequisite}`,
      kind: "prerequisite",
      label: `${lesson.title} — requires "${prerequisite}"`,
      content: `This lesson unlocks only once "${prerequisite}" is complete.`,
      categories: ["instructional-sequence", "mastery-progression"],
    });
  }

  items.push({
    ...base,
    id: `mastery:${lesson.id}`,
    kind: "mastery-rule",
    label: `${lesson.title} — completion rule`,
    content: `Complete after ${lesson.mastery.correctRequired} correct answer(s) and ${lesson.mastery.itemsRequired} attempted item(s), out of ${lesson.practice.length}. Counting only — no acoustic or confidence input.`,
    categories: ["mastery-progression", "instructional-sequence"],
  });

  if (lesson.boundary) {
    items.push({
      ...base,
      id: `boundary:${lesson.id}`,
      kind: "boundary-note",
      label: `${lesson.title} — boundary note`,
      content: lesson.boundary,
      categories: ["makhraj-articulation", "tajweed-terminology", "beginner-clarity"],
    });
  }

  return items;
}

/**
 * Articulation notes as review items.
 *
 * These live in the instruction-language packs rather than the curriculum, but
 * a learner reads them beside the letters, and they are the one place the app
 * says anything at all about how a letter is made — so they are the part a
 * teacher most needs to see.
 */
export function articulationItems(notes: readonly ArticulationNote[]): AuditItem[] {
  const level = QAIDA_LEVELS[0];
  return notes.flatMap((note, index) => {
    const base = {
      kind: "articulation-note" as const,
      levelId: level.id,
      levelOrder: level.order,
      lessonId: null,
      lessonOrder: 0,
      categories: ["makhraj-articulation", "beginner-clarity"] as AuditCategory[],
      sourcePath: note.sourcePath,
      ...(note.glyph ? { arabic: note.glyph } : {}),
    };
    const name = note.name ?? note.slug;
    const items: AuditItem[] = [
      {
        ...base,
        id: `articulation:${note.slug}`,
        label: `${name} — articulation note`,
        content: note.articulation,
      },
    ];
    if (note.tip) {
      items.push({
        ...base,
        id: `articulation-tip:${note.slug}`,
        label: `${name} — practice cue`,
        content: note.tip,
      });
    }
    // Index is unused beyond keeping the map total; letters carry their own ids.
    void index;
    return items;
  });
}

/**
 * The whole review inventory, in the order a teacher works through it: level by
 * level, lesson by lesson, and within a lesson objective → teaching → examples
 * → exercises → prerequisites → mastery → boundary.
 */
export function buildAuditInventory(articulation: readonly ArticulationNote[] = []): AuditItem[] {
  const items: AuditItem[] = [];
  const orderOfLesson = new Map(QAIDA_LESSONS.map((lesson, index) => [lesson.id, index + 1]));

  for (const level of [...QAIDA_LEVELS].sort((left, right) => left.order - right.order)) {
    items.push(...levelItems(level));
    for (const lesson of lessonsForLevel(level.id)) {
      items.push(...auditItemsForLesson(lesson, orderOfLesson.get(lesson.id) ?? 0, level));
    }
  }

  items.push(...articulationItems(articulation));
  return items;
}

// ---------------------------------------------------------------------------
// Reading the audit
// ---------------------------------------------------------------------------

export type AuditProgress = {
  total: number;
  byStatus: Record<ReviewStatus, number>;
  byProvenance: Record<ContentProvenance, number>;
  /** 0–1, the share of items a teacher has approved. Not a quality score. */
  approvedShare: number;
};

export function auditProgress(items: readonly AuditItem[], ledger: AuditLedger): AuditProgress {
  const byStatus = Object.fromEntries(REVIEW_STATUSES.map((status) => [status, 0])) as Record<ReviewStatus, number>;
  const byProvenance = Object.fromEntries(CONTENT_PROVENANCE.map((entry) => [entry, 0])) as Record<
    ContentProvenance,
    number
  >;

  for (const item of items) {
    byStatus[statusOf(item.id, ledger)] += 1;
    byProvenance[provenanceOf(item.id, ledger)] += 1;
  }

  return {
    total: items.length,
    byStatus,
    byProvenance,
    approvedShare: items.length ? byProvenance["teacher-approved"] / items.length : 0,
  };
}

/** Items a lesson owns, in review order. */
export function itemsForLesson(items: readonly AuditItem[], lessonId: string): AuditItem[] {
  return items.filter((item) => item.lessonId === lessonId);
}

/** Items belonging to a level, including its own level-scope items. */
export function itemsForLevel(items: readonly AuditItem[], levelId: QaidaLevelId): AuditItem[] {
  return items.filter((item) => item.levelId === levelId);
}

/** Items whose suggested categories include this one. */
export function itemsInCategory(items: readonly AuditItem[], category: AuditCategory): AuditItem[] {
  return items.filter((item) => item.categories.includes(category));
}

/** Records a teacher left, newest first, for an export or a summary. */
export function reviewLog(ledger: AuditLedger): ReviewRecord[] {
  return [...ledger.records].sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt));
}

/**
 * The one sentence the interface, the report and the docs must all be able to
 * say truthfully. It is computed, not written by hand, so it cannot drift from
 * the ledger it describes.
 */
export function approvalStatement(items: readonly AuditItem[], ledger: AuditLedger): string {
  const progress = auditProgress(items, ledger);
  const approved = progress.byProvenance["teacher-approved"];
  if (approved === 0) {
    return `No part of this curriculum has been approved by a qualified teacher. ${progress.total} items are drafted and awaiting review.`;
  }
  if (approved < progress.total) {
    return `${approved} of ${progress.total} items have been approved by a qualified teacher; the rest are not approved.`;
  }
  return `All ${progress.total} items have been approved by a qualified teacher.`;
}
