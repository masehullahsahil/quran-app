/**
 * What the Learn panel shows for a given saved progress state.
 *
 * The component renders this; it derives nothing itself. Curriculum ordering,
 * prerequisites and mastery all stay where they are — this only answers the
 * three questions the panel has to answer on screen: which level, which lesson,
 * and how far through.
 */
import {
  QAIDA_LESSONS,
  QAIDA_LEVELS,
  curriculumProgressPercent,
  followingLesson,
  getQaidaLesson,
  getQaidaLevel,
  isLessonUnlocked,
  lessonsForLevel,
  levelProgress,
  type QaidaLesson,
  type QaidaLevel,
  type QaidaLevelId,
} from "@shared/qaidaCurriculum";
import type { QaidaProgress } from "./qaidaProgress";

export type CourseLevelChip = {
  level: QaidaLevel;
  /** The lesson this chip opens, or null when the level is still locked. */
  target: string | null;
  isCurrent: boolean;
  /** Every lesson of the level is complete. */
  isDone: boolean;
  completed: number;
  total: number;
};

export type CourseView = {
  lesson: QaidaLesson;
  level: QaidaLevel;
  /** 1-based position of the lesson within its level. */
  positionInLevel: number;
  lessonsInLevel: number;
  /** Whether this lesson has already been completed and is being reviewed. */
  isReview: boolean;
  /** Course completion, as a whole-number percentage. */
  percentComplete: number;
  nextLesson: QaidaLesson | null;
  levels: CourseLevelChip[];
  /** The lessons of the current level, with their state, for the review list. */
  lessonsOfLevel: Array<{ lesson: QaidaLesson; unlocked: boolean; done: boolean; isCurrent: boolean }>;
};

/**
 * Resolves the panel's state. An unknown or missing current lesson falls back to
 * the first lesson of the course rather than rendering nothing.
 */
export function describeCourseView(progress: QaidaProgress): CourseView {
  const lesson = getQaidaLesson(progress.currentLessonId) ?? QAIDA_LESSONS[0];
  const level = getQaidaLevel(lesson.level) ?? QAIDA_LEVELS[0];
  const levelLessons = lessonsForLevel(lesson.level);

  return {
    lesson,
    level,
    positionInLevel: levelLessons.findIndex((entry) => entry.id === lesson.id) + 1,
    lessonsInLevel: levelLessons.length,
    isReview: progress.completedLessons.includes(lesson.id),
    percentComplete: curriculumProgressPercent(progress.completedLessons),
    nextLesson: followingLesson(lesson.id),
    levels: QAIDA_LEVELS.map((entry) => chipFor(entry.id, lesson.level, progress)),
    lessonsOfLevel: levelLessons.map((entry) => ({
      lesson: entry,
      unlocked: isLessonUnlocked(entry.id, progress.completedLessons),
      done: progress.completedLessons.includes(entry.id),
      isCurrent: entry.id === lesson.id,
    })),
  };
}

function chipFor(levelId: QaidaLevelId, currentLevelId: QaidaLevelId, progress: QaidaProgress): CourseLevelChip {
  const summary = levelProgress(levelId, progress.completedLessons);
  const level = getQaidaLevel(levelId) ?? QAIDA_LEVELS[0];
  const target = lessonsForLevel(levelId).find((candidate) =>
    isLessonUnlocked(candidate.id, progress.completedLessons),
  );

  return {
    level,
    target: target?.id ?? null,
    isCurrent: levelId === currentLevelId,
    isDone: summary !== null && summary.total > 0 && summary.completed === summary.total,
    completed: summary?.completed ?? 0,
    total: summary?.total ?? 0,
  };
}
