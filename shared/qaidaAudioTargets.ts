/**
 * Everything in the Qaida a learner may need to hear.
 *
 * The inventory is **derived from the curriculum**, never hand-listed. A lesson
 * added to `qaidaCurriculum.ts` appears here on the next build, which is what
 * keeps the recording list and the course from drifting apart — a hand-written
 * list would be correct on the day it was written and wrong by the next lesson.
 *
 * Two kinds of target, deliberately kept apart:
 *
 * - **instructional** — letters, vowelled letters, and the teaching syllables
 *   and combinations the Qaida builds to practise a shape. These are what a
 *   qualified teacher or Qari is asked to record for this app.
 * - **quran** — actual Quranic words the curriculum quotes. These are *not*
 *   recorded for us. Quran recitation comes from the app's own Quran audio
 *   source, and where no trustworthy recording of a word exists the target is
 *   simply unavailable. Nobody records a replacement Quran recitation casually,
 *   and nothing is synthesised. See docs/qaida-audio.md.
 *
 * Targets are deduplicated by their exact Arabic: one recording of `بَ` serves
 * every lesson that shows it, and the entry lists all of them.
 */
import { ARABIC_LETTERS, HARAKAT, type Harakat } from "./arabicLetters";
import { QAIDA_LESSONS, QAIDA_LEVELS, type QaidaLevelId } from "./qaidaCurriculum";

/**
 * What kind of thing is being said.
 *
 * Derived from the level that teaches it, so the categories track the
 * curriculum's own structure rather than a second opinion about it. Quranic
 * text is always `quran-word`, whichever level quotes it.
 */
export type QaidaAudioCategory =
  | "letter"
  | "letter-harakat"
  | "joined-form"
  | "short-vowel"
  | "tanween"
  | "long-vowel"
  | "sukoon"
  | "shaddah"
  | "definite-article"
  | "hamzah"
  | "tajweed-pattern"
  | "mushaf-symbol"
  | "combination"
  | "quran-word";

const CATEGORY_BY_LEVEL: Record<QaidaLevelId, QaidaAudioCategory> = {
  letters: "letter",
  forms: "joined-form",
  harakat: "short-vowel",
  tanween: "tanween",
  madd: "long-vowel",
  sukoon: "sukoon",
  shaddah: "shaddah",
  lam: "definite-article",
  hamzah: "hamzah",
  "tajweed-patterns": "tajweed-pattern",
  "mushaf-symbols": "mushaf-symbol",
  "quran-reading": "combination",
};

export type QaidaAudioTargetKind = "instructional" | "quran";

export type QaidaAudioTarget = {
  /** Stable id. Survives lessons being added around it. */
  id: string;
  /** Exactly what is to be said, in the curriculum's own Arabic. */
  arabic: string;
  category: QaidaAudioCategory;
  kind: QaidaAudioTargetKind;
  /** The earliest level that needs it, and every level that does. */
  level: QaidaLevelId;
  levels: QaidaLevelId[];
  /** Every lesson that shows this target. */
  lessonIds: string[];
  /** The letter recording this target is, when it is one. */
  letter?: { slug: string; harakat?: Harakat };
  /** "1:1" style reference, for a Quranic word. */
  reference?: string;
  /** How the target reads, or what it means. Never a tajwid ruling. */
  gloss: string;
};

/** The letter targets: 28 letters alone, and each carrying each short vowel. */
function letterTargets(): QaidaAudioTarget[] {
  const targets: QaidaAudioTarget[] = [];
  for (const letter of ARABIC_LETTERS) {
    targets.push({
      id: `letter:${letter.slug}`,
      arabic: letter.letter,
      category: "letter",
      kind: "instructional",
      level: "letters",
      levels: ["letters"],
      lessonIds: [],
      letter: { slug: letter.slug },
      gloss: `${letter.name} — the letter on its own`,
    });
    for (const harakat of HARAKAT) {
      targets.push({
        id: `letter:${letter.slug}:${harakat.id}`,
        arabic: `${letter.letter}${harakat.mark}`,
        category: "letter-harakat",
        kind: "instructional",
        level: "harakat",
        levels: ["harakat"],
        lessonIds: [],
        letter: { slug: letter.slug, harakat: harakat.id },
        gloss: `${letter.name} with ${harakat.label.toLowerCase()} — ${harakat.hint}`,
      });
    }
  }
  return targets;
}

/** A filename-safe, stable id for a piece of Arabic the curriculum shows. */
function textId(arabic: string): string {
  let hash = 2166136261;
  for (let index = 0; index < arabic.length; index += 1) {
    hash ^= arabic.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

/**
 * Every target the course needs a recording of, deduplicated.
 *
 * Order is deterministic: letters first in teaching order, then the curriculum's
 * own text in lesson order. A report or a hand-off list built from this reads
 * the same way every time it is generated.
 */
export function qaidaAudioTargets(): QaidaAudioTarget[] {
  const byId = new Map<string, QaidaAudioTarget>();
  const byArabic = new Map<string, string>();

  for (const target of letterTargets()) {
    byId.set(target.id, target);
    // First writer wins: a letter target is the canonical recording of that
    // glyph, so a lesson later showing the same glyph joins it rather than
    // asking for a second recording of the same sound.
    if (!byArabic.has(target.arabic)) byArabic.set(target.arabic, target.id);
  }

  const levelOrder = new Map(QAIDA_LEVELS.map((level) => [level.id, level.order]));

  const add = (
    arabic: string,
    gloss: string,
    source: "teaching" | "quran",
    level: QaidaLevelId,
    lessonId: string,
    reference?: string,
  ) => {
    const existingId = byArabic.get(arabic);
    if (existingId) {
      const existing = byId.get(existingId)!;
      if (!existing.lessonIds.includes(lessonId)) existing.lessonIds.push(lessonId);
      if (!existing.levels.includes(level)) existing.levels.push(level);
      // The earliest level that needs it is the one it is listed under.
      if ((levelOrder.get(level) ?? 99) < (levelOrder.get(existing.level) ?? 99)) existing.level = level;
      return;
    }
    const kind: QaidaAudioTargetKind = source === "quran" ? "quran" : "instructional";
    const id = `${kind === "quran" ? "quran" : "text"}:${textId(arabic)}`;
    byId.set(id, {
      id,
      arabic,
      category: kind === "quran" ? "quran-word" : CATEGORY_BY_LEVEL[level],
      kind,
      level,
      levels: [level],
      lessonIds: [lessonId],
      gloss,
      ...(reference ? { reference } : {}),
    });
    byArabic.set(arabic, id);
  };

  for (const lesson of QAIDA_LESSONS) {
    for (const example of lesson.examples) {
      add(example.arabic, example.gloss, example.source, lesson.level, lesson.id, example.reference);
    }
    for (const item of lesson.practice) {
      if (item.subject) {
        add(item.subject.arabic, item.subject.gloss, item.subject.source, lesson.level, lesson.id, item.subject.reference);
      }
      // An exercise that names a letter recording binds that recording to this
      // lesson, so the letter entries carry the lessons that use them.
      if (item.audio) {
        const id = `letter:${item.audio.letterSlug}${item.audio.harakat ? `:${item.audio.harakat}` : ""}`;
        const target = byId.get(id);
        if (target && !target.lessonIds.includes(lesson.id)) {
          target.lessonIds.push(lesson.id);
          if (!target.levels.includes(lesson.level)) target.levels.push(lesson.level);
        }
      }
    }
  }

  return Array.from(byId.values());
}

/** The instructional half — what a teacher is asked to record for this app. */
export function instructionalTargets(): QaidaAudioTarget[] {
  return qaidaAudioTargets().filter((target) => target.kind === "instructional");
}

/** The Quranic half — served by the Quran audio source, never recorded here. */
export function quranTargets(): QaidaAudioTarget[] {
  return qaidaAudioTargets().filter((target) => target.kind === "quran");
}
