/**
 * The audit inventory as it actually stands for this course.
 *
 * shared/curriculumAudit.ts describes *how* an audit works; this module binds
 * it to the content that exists today — every level and lesson from the
 * curriculum, plus the written articulation notes a learner reads beside the
 * letters, which live in the English reference pack rather than in the
 * curriculum module.
 *
 * It builds one list, once, so the review interface, the printed report and the
 * tests are all looking at the same inventory. A lesson added to the curriculum
 * appears here on the next import with no edit to this file — which is the
 * property the "new lessons cannot escape review" test relies on.
 */
import en from "../locales/en";
import { QAIDA_LETTERS } from "./qaidaCurriculum";
import { buildAuditInventory, type ArticulationNote, type AuditItem } from "./curriculumAudit";

const LETTER_PACK_SOURCE = "locales/en/index.ts";

/**
 * The articulation notes, joined to the letters the course teaches.
 *
 * The English pack is the reference: every other language is a translation of
 * these sentences, so a correction here is a correction in five languages, and
 * the audit says that plainly rather than asking a teacher to review the same
 * note five times.
 */
export const ARTICULATION_NOTES: ArticulationNote[] = QAIDA_LETTERS.flatMap((letter) => {
  const lesson = en.lessons.letters[letter.slug];
  if (!lesson) return [];
  return [
    {
      slug: letter.slug,
      glyph: letter.glyph,
      name: letter.name,
      articulation: lesson.articulation,
      ...(lesson.tip ? { tip: lesson.tip } : {}),
      sourcePath: LETTER_PACK_SOURCE,
    },
  ];
});

/** Every item a qualified teacher has to look at, in review order. */
export const CURRICULUM_AUDIT_INVENTORY: AuditItem[] = buildAuditInventory(ARTICULATION_NOTES);

const BY_ID = new Map(CURRICULUM_AUDIT_INVENTORY.map((item) => [item.id, item]));

export function auditItem(id: string): AuditItem | null {
  return BY_ID.get(id) ?? null;
}
