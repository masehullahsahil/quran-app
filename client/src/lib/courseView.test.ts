import { describe, expect, it } from "vitest";
import {
  FIRST_LESSON_ID,
  QAIDA_LESSONS,
  QAIDA_LETTERS,
  QAIDA_LEVELS,
  firstLetterIndexForLesson,
  lessonsForLevel,
} from "@shared/qaidaCurriculum";
import { ARABIC_LETTERS } from "@shared/arabicLetters";
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

  it("marks the first level current and gives every level a target", () => {
    expect(view.levels).toHaveLength(QAIDA_LEVELS.length);
    expect(view.levels[0]).toMatchObject({ isCurrent: true, isDone: false, completed: 0 });
    expect(view.levels[0].target).toBe(FIRST_LESSON_ID);

    for (const chip of view.levels.slice(1)) {
      expect(chip.target, chip.level.id).toBe(lessonsForLevel(chip.level.id)[0].id);
      expect(chip.isCurrent, chip.level.id).toBe(false);
      expect(chip.isDone, chip.level.id).toBe(false);
    }
  });

  it("unlocks every lesson of the level list", () => {
    expect(view.lessonsOfLevel[0]).toMatchObject({ unlocked: true, done: false, isCurrent: true });
    expect(view.lessonsOfLevel.slice(1).every((entry) => entry.unlocked)).toBe(true);
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

  it("marks a finished level done and moves to the next one", () => {
    const firstLevelLessons = lessonsForLevel(QAIDA_LEVELS[0].id).length;
    const view = describeCourseView(progressAfter(firstLevelLessons));

    expect(view.levels[0]).toMatchObject({ isDone: true, isCurrent: false });
    expect(view.levels[1]).toMatchObject({ isCurrent: true, isDone: false });
    expect(view.levels[1].target).not.toBeNull();
    expect(view.level.id).toBe(QAIDA_LEVELS[1].id);
  });
});

describe("all levels open from the start", () => {
  it("gives all 12 level chips a target with fresh progress", () => {
    const view = describeCourseView(emptyQaidaProgress());

    expect(QAIDA_LEVELS).toHaveLength(12);
    expect(view.levels).toHaveLength(12);
    for (const chip of view.levels) {
      expect(chip.target, chip.level.id).toBe(lessonsForLevel(chip.level.id)[0].id);
    }
  });

  it("unlocks all lessons of every level with fresh progress", () => {
    for (const level of QAIDA_LEVELS) {
      const firstLesson = lessonsForLevel(level.id)[0];
      const view = describeCourseView(openLesson(emptyQaidaProgress(), firstLesson.id));

      expect(view.level.id).toBe(level.id);
      expect(view.lessonsOfLevel).toHaveLength(lessonsForLevel(level.id).length);
      expect(view.lessonsOfLevel.every((entry) => entry.unlocked), level.id).toBe(true);
      expect(view.lessonsOfLevel.every((entry) => !entry.done), level.id).toBe(true);
    }
  });

  it("still marks completion and counts progress with every level open", () => {
    const view = describeCourseView(progressAfter(3));

    expect(view.percentComplete).toBe(Math.round((3 / QAIDA_LESSONS.length) * 100));
    expect(view.lessonsOfLevel.filter((entry) => entry.done)).toHaveLength(3);
    expect(view.levels[0]).toMatchObject({ completed: 3, isDone: false });
    for (const chip of view.levels) {
      expect(chip.target, chip.level.id).not.toBeNull();
    }
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

describe("the finish button names the lesson finishing opens", () => {
  it("skips an already-completed next lesson in both the label and the landing", () => {
    const [a, b, c] = QAIDA_LESSONS.slice(10, 13);
    const progress: QaidaProgress = { completedLessons: [b.id], currentLessonId: a.id };

    expect(describeCourseView(progress).nextLesson?.id).toBe(c.id);
    expect(completeLesson(progress, a.id).currentLessonId).toBe(c.id);
  });

  it("falls back to the first incomplete lesson in both when nothing after is left", () => {
    const last = QAIDA_LESSONS[QAIDA_LESSONS.length - 1];
    const earliestUndone = QAIDA_LESSONS[5];
    const completedLessons = QAIDA_LESSONS.map((lesson) => lesson.id).filter(
      (id) => id !== earliestUndone.id && id !== last.id,
    );
    const progress: QaidaProgress = { completedLessons, currentLessonId: last.id };

    expect(describeCourseView(progress).nextLesson?.id).toBe(earliestUndone.id);
    expect(completeLesson(progress, last.id).currentLessonId).toBe(earliestUndone.id);
  });

  it("finishes the course when the viewed lesson is the only one left", () => {
    const remaining = QAIDA_LESSONS[5];
    const completedLessons = QAIDA_LESSONS.map((lesson) => lesson.id).filter(
      (id) => id !== remaining.id,
    );
    const progress: QaidaProgress = { completedLessons, currentLessonId: remaining.id };

    expect(describeCourseView(progress).nextLesson).toBeNull();
    expect(completeLesson(progress, remaining.id).currentLessonId).toBe(remaining.id);
  });

  it("has no next lesson and stays put once the course is fully complete", () => {
    const last = QAIDA_LESSONS[QAIDA_LESSONS.length - 1];
    const progress: QaidaProgress = {
      completedLessons: QAIDA_LESSONS.map((lesson) => lesson.id),
      currentLessonId: last.id,
    };

    expect(describeCourseView(progress).nextLesson).toBeNull();
    expect(completeLesson(progress, last.id).currentLessonId).toBe(last.id);
  });

  it("names the second lesson for a learner working in order", () => {
    const progress = emptyQaidaProgress();

    expect(describeCourseView(progress).nextLesson?.id).toBe(QAIDA_LESSONS[1].id);
    expect(completeLesson(progress, FIRST_LESSON_ID).currentLessonId).toBe(QAIDA_LESSONS[1].id);
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

describe("which letter a lesson teaches", () => {
  it("focuses the first letter of each letters lesson", () => {
    // The groups, in course order: Alif's group opens the course, Jeem's is
    // second, and the last group starts at Kaaf. A revision lesson focuses
    // the first letter of its first contrast group — Baa, for the dots.
    expect(firstLetterIndexForLesson("letters-alif-ba-ta-tha")).toBe(0);
    expect(QAIDA_LETTERS[0].slug).toBe("alif");
    expect(firstLetterIndexForLesson("letters-jeem-hha-kha")).toBe(4);
    expect(QAIDA_LETTERS[4].slug).toBe("jeem");
    expect(firstLetterIndexForLesson("letters-kaf-to-ya")).toBe(21);
    expect(QAIDA_LETTERS[21].slug).toBe("kaf");
    expect(firstLetterIndexForLesson("letters-similar")).toBe(1);
    expect(QAIDA_LETTERS[1].slug).toBe("ba");
  });

  it("has no letter for a lesson that is not about letters", () => {
    // Level 5, "Short against long": long vowels, no single letter to focus.
    expect(firstLetterIndexForLesson("madd-short-vs-long")).toBeNull();
    expect(firstLetterIndexForLesson("no-such-lesson")).toBeNull();
  });

  it("focuses the first letter every letters lesson shows", () => {
    for (const lesson of lessonsForLevel("letters")) {
      const index = firstLetterIndexForLesson(lesson.id);
      expect(index, lesson.id).not.toBeNull();
      expect(QAIDA_LETTERS[index!].glyph, lesson.id).toBe(lesson.examples[0].arabic.split(" ")[0]);
    }
  });

  it("resolves every one of the 28 letters through its lesson", () => {
    // A letters lesson teaches a group, so its first letter is the focus and
    // the rest of the group follows in the same lesson: the ranges
    // [first index, first index + letters in the lesson) must cover the whole
    // alphabet exactly once, with no gaps and no overlaps. Revision lessons
    // show contrast groups instead of one letter per example, so they are
    // covered by the test above and excluded here.
    const groupLessons = lessonsForLevel("letters").filter((lesson) =>
      lesson.examples.every((example) => example.arabic.length === 1),
    );
    expect(groupLessons).toHaveLength(10);
    const covered = new Set<number>();
    for (const lesson of groupLessons) {
      const index = firstLetterIndexForLesson(lesson.id);
      expect(index, lesson.id).not.toBeNull();
      for (let offset = 0; offset < lesson.examples.length; offset += 1) {
        expect(covered.has(index! + offset), `${lesson.id} overlaps another lesson`).toBe(false);
        covered.add(index! + offset);
      }
    }
    expect([...covered].sort((a, b) => a - b)).toEqual(
      QAIDA_LETTERS.map((_, index) => index),
    );
  });

  it("indexes the same alphabet the Learn view renders", () => {
    // Home's selectedLetter indexes ARABIC_LETTERS; the helper indexes
    // QAIDA_LETTERS. If the two orders ever drift, the focus would land on
    // the wrong letter, so the shared order is pinned here.
    expect(QAIDA_LETTERS.map((letter) => letter.slug)).toEqual(
      ARABIC_LETTERS.map((letter) => letter.slug),
    );
  });
});
