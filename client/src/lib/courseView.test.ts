import { describe, expect, it } from "vitest";
import { FIRST_LESSON_ID, QAIDA_LESSONS, QAIDA_LEVELS, lessonsForLevel } from "@shared/qaidaCurriculum";
import { completeLesson, emptyQaidaProgress, openLesson, type QaidaProgress } from "./qaidaProgress";
import { describeCourseView } from "./courseView";

/** Completes lessons in course order, the way a learner works through them. */
function progressAfter(lessonCount: number): QaidaProgress {
  let progress = emptyQaidaProgress();
  for (const lesson of QAIDA_LESSONS.slice(0, lessonCount)) progress = completeLesson(progress, lesson.id);
  return progress;
}

describe("what the panel shows a new learner", () => {
  const view = describeCourseView(emptyQaidaProgress());

  it("opens on the first lesson of the first level", () => {
    expect(view.lesson.id).toBe(FIRST_LESSON_ID);
    expect(view.level.id).toBe(QAIDA_LEVELS[0].id);
    expect(view.positionInLevel).toBe(1);
    expect(view.lessonsInLevel).toBe(lessonsForLevel(QAIDA_LEVELS[0].id).length);
    expect(view.isReview).toBe(false);
    expect(view.percentComplete).toBe(0);
    expect(view.nextLesson?.id).toBe(QAIDA_LESSONS[1].id);
  });

  it("marks the first level current and every later level locked", () => {
    expect(view.levels).toHaveLength(QAIDA_LEVELS.length);
    expect(view.levels[0]).toMatchObject({ isCurrent: true, isDone: false, completed: 0 });
    expect(view.levels[0].target).toBe(FIRST_LESSON_ID);

    for (const chip of view.levels.slice(1)) {
      expect(chip.target, chip.level.id).toBeNull();
      expect(chip.isCurrent, chip.level.id).toBe(false);
      expect(chip.isDone, chip.level.id).toBe(false);
    }
  });

  it("unlocks only the first lesson of the level list", () => {
    expect(view.lessonsOfLevel[0]).toMatchObject({ unlocked: true, done: false, isCurrent: true });
    expect(view.lessonsOfLevel.slice(1).every((entry) => !entry.unlocked)).toBe(true);
  });
});

describe("what it shows part-way through", () => {
  it("moves the current lesson and counts what is done", () => {
    const view = describeCourseView(progressAfter(3));

    expect(view.lesson.id).toBe(QAIDA_LESSONS[3].id);
    expect(view.positionInLevel).toBe(4);
    expect(view.isReview).toBe(false);
    expect(view.percentComplete).toBe(Math.round((3 / QAIDA_LESSONS.length) * 100));
    expect(view.levels[0].completed).toBe(3);
    expect(view.lessonsOfLevel.filter((entry) => entry.done)).toHaveLength(3);
    expect(view.lessonsOfLevel[3]).toMatchObject({ unlocked: true, isCurrent: true });
  });

  it("marks a finished level done and unlocks the next one", () => {
    const firstLevelLessons = lessonsForLevel(QAIDA_LEVELS[0].id).length;
    const view = describeCourseView(progressAfter(firstLevelLessons));

    expect(view.levels[0]).toMatchObject({ isDone: true, isCurrent: false });
    expect(view.levels[1]).toMatchObject({ isCurrent: true, isDone: false });
    expect(view.levels[1].target).not.toBeNull();
    expect(view.level.id).toBe(QAIDA_LEVELS[1].id);
  });
});

describe("reviewing a completed lesson", () => {
  it("reports it as review without changing what is completed", () => {
    const progress = openLesson(progressAfter(3), FIRST_LESSON_ID);
    const view = describeCourseView(progress);

    expect(view.lesson.id).toBe(FIRST_LESSON_ID);
    expect(view.isReview).toBe(true);
    expect(view.percentComplete).toBe(Math.round((3 / QAIDA_LESSONS.length) * 100));
    expect(view.lessonsOfLevel.filter((entry) => entry.done)).toHaveLength(3);
    // A completed lesson opened for review is still unlocked and still current.
    expect(view.lessonsOfLevel[0]).toMatchObject({ unlocked: true, done: true, isCurrent: true });
  });
});

describe("the end of the course", () => {
  it("has no next lesson and reports full completion", () => {
    const view = describeCourseView(progressAfter(QAIDA_LESSONS.length));

    expect(view.percentComplete).toBe(100);
    expect(view.levels.every((chip) => chip.isDone)).toBe(true);
    expect(describeCourseView({ completedLessons: QAIDA_LESSONS.map((l) => l.id), currentLessonId: QAIDA_LESSONS.at(-1)!.id }).nextLesson).toBeNull();
  });
});

describe("bad state", () => {
  it("falls back to the first lesson rather than rendering nothing", () => {
    const view = describeCourseView({ completedLessons: [], currentLessonId: "no-such-lesson" });

    expect(view.lesson.id).toBe(FIRST_LESSON_ID);
    expect(view.level.id).toBe(QAIDA_LEVELS[0].id);
  });
});
