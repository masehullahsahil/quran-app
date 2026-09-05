/**
 * Translating the Qaida course without duplicating it.
 *
 * The curriculum in shared/qaidaCurriculum.ts is one structure: lesson order,
 * prerequisites, exercise logic, answer correctness and every piece of Arabic
 * live there once and are the same in every language. What a *language pack*
 * may carry is the prose around that structure — a lesson's title, its
 * objective, its teaching text, and an exercise's prompt — keyed by the stable
 * ids the curriculum already has.
 *
 * That means a translator adds a map, not a copy of the course; a lesson added
 * to the curriculum appears in every language immediately, in English until
 * someone translates its four strings; and no translation can change what a
 * lesson teaches, which answer is correct, or which Arabic is shown.
 *
 * The Arabic examples, the Quran references and the glosses attached to them
 * are deliberately **not** translatable here: the Arabic is content, and a
 * gloss that drifted from it would be a second source of truth.
 */
import type { QaidaExercise } from "./qaidaExercises";
import type { QaidaLesson } from "./qaidaCurriculum";

/** The four fields of a lesson a pack may translate. */
export type QaidaLessonText = {
  title?: string;
  objective?: string;
  teaching?: string;
  boundary?: string;
};

/** Prompts and notes, keyed by exercise id. */
export type QaidaExerciseText = {
  prompt?: string;
  note?: string;
};

export type QaidaTextPack = {
  lessons?: Record<string, QaidaLessonText>;
  exercises?: Record<string, QaidaExerciseText>;
};

/** A lesson's prose in the learner's language, falling back per field. */
export function localizedLesson(lesson: QaidaLesson, pack: QaidaTextPack | undefined) {
  const text = pack?.lessons?.[lesson.id];
  return {
    title: text?.title ?? lesson.title,
    objective: text?.objective ?? lesson.objective,
    teaching: text?.teaching ?? lesson.teaching,
    boundary: text?.boundary ?? lesson.boundary,
  };
}

/** An exercise's prose in the learner's language, falling back per field. */
export function localizedExercise(exercise: QaidaExercise, pack: QaidaTextPack | undefined) {
  const text = pack?.exercises?.[exercise.id];
  return {
    prompt: text?.prompt ?? exercise.prompt,
    note: text?.note ?? exercise.note,
  };
}

/** How much of the course prose a pack carries, for the coverage report. */
export function qaidaCoverage(lessons: readonly QaidaLesson[], pack: QaidaTextPack | undefined): number {
  if (!lessons.length) return 1;
  const translated = lessons.filter((lesson) => Boolean(pack?.lessons?.[lesson.id]?.title)).length;
  return translated / lessons.length;
}
