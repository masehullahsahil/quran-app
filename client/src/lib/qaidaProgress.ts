/**
 * Persistence for Qaida curriculum progress.
 *
 * Same approach as the rest of the learner's local state: a JSON value in
 * localStorage, read defensively, written on change. The parse step is
 * deliberately tolerant — a value written by an older build, or a lesson id that
 * no longer exists, degrades to "not completed" rather than throwing on load.
 */
import { FIRST_LESSON_ID, getQaidaLesson, nextIncompleteLesson } from "@shared/qaidaCurriculum";

export const QAIDA_PROGRESS_KEY = "miqra-qaida-progress";

export type QaidaProgress = {
  /** Lesson ids the learner has completed, in the order they completed them. */
  completedLessons: string[];
  /** The lesson the Learn view should open on. */
  currentLessonId: string;
};

/** Just enough of the Storage interface to be faked in a test. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function emptyQaidaProgress(): QaidaProgress {
  return { completedLessons: [], currentLessonId: FIRST_LESSON_ID };
}

/**
 * Parses stored progress, dropping anything the curriculum no longer defines.
 * A current lesson that has disappeared falls back to the next incomplete one.
 */
export function parseQaidaProgress(raw: string | null): QaidaProgress {
  if (!raw) return emptyQaidaProgress();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyQaidaProgress();
    const record = parsed as { completedLessons?: unknown; currentLessonId?: unknown };
    const completedLessons = Array.isArray(record.completedLessons)
      ? record.completedLessons.filter(
          (value, index, all): value is string =>
            typeof value === "string" && Boolean(getQaidaLesson(value)) && all.indexOf(value) === index,
        )
      : [];
    const stored = typeof record.currentLessonId === "string" ? record.currentLessonId : null;
    const currentLessonId = stored && getQaidaLesson(stored)
      ? stored
      : nextIncompleteLesson(completedLessons)?.id ?? FIRST_LESSON_ID;
    return { completedLessons, currentLessonId };
  } catch {
    return emptyQaidaProgress();
  }
}

export function serializeQaidaProgress(progress: QaidaProgress): string {
  return JSON.stringify(progress);
}

export function readQaidaProgress(storage: StorageLike | undefined = safeStorage()): QaidaProgress {
  if (!storage) return emptyQaidaProgress();
  try {
    return parseQaidaProgress(storage.getItem(QAIDA_PROGRESS_KEY));
  } catch {
    return emptyQaidaProgress();
  }
}

export function writeQaidaProgress(progress: QaidaProgress, storage: StorageLike | undefined = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(QAIDA_PROGRESS_KEY, serializeQaidaProgress(progress));
  } catch {
    // A full or blocked store must not break the lesson the learner is in.
  }
}

/** Records a completed lesson and moves the learner on, without losing review access. */
export function completeLesson(progress: QaidaProgress, lessonId: string): QaidaProgress {
  if (!getQaidaLesson(lessonId)) return progress;
  const completedLessons = progress.completedLessons.includes(lessonId)
    ? progress.completedLessons
    : [...progress.completedLessons, lessonId];
  return {
    completedLessons,
    currentLessonId: nextIncompleteLesson(completedLessons)?.id ?? lessonId,
  };
}

/** Opens a lesson — including one already completed, for review. */
export function openLesson(progress: QaidaProgress, lessonId: string): QaidaProgress {
  return getQaidaLesson(lessonId) ? { ...progress, currentLessonId: lessonId } : progress;
}

function safeStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
