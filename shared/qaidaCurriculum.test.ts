import { describe, expect, it } from "vitest";
import {
  FIRST_LESSON_ID,
  QAIDA_LESSONS,
  QAIDA_LESSON_STAGES,
  QAIDA_LEVELS,
  QAIDA_LEVEL_IDS,
  curriculumProgressPercent,
  evaluateLessonAttempt,
  followingLesson,
  getQaidaLesson,
  isLessonUnlocked,
  lessonOrder,
  lessonsForLevel,
  levelProgress,
  nextIncompleteLesson,
  usedExerciseTypes,
} from "./qaidaCurriculum";
import {
  QAIDA_EXERCISE_TYPES,
  correctChoice,
  isChoiceExercise,
  isCorrectAnswer,
  isReadExercise,
} from "./qaidaExercises";

describe("levels", () => {
  it("defines every level exactly once, in a stable order", () => {
    expect(QAIDA_LEVELS.map((level) => level.id)).toEqual([...QAIDA_LEVEL_IDS]);
    expect(QAIDA_LEVELS.map((level) => level.order)).toEqual(QAIDA_LEVELS.map((_, index) => index + 1));
    expect(new Set(QAIDA_LEVELS.map((level) => level.id)).size).toBe(QAIDA_LEVELS.length);
  });

  it("gives every level a title and an objective", () => {
    for (const level of QAIDA_LEVELS) {
      expect(level.title.length, level.id).toBeGreaterThan(3);
      expect(level.objective.length, level.id).toBeGreaterThan(20);
      expect(level.arabicTitle, level.id).toMatch(/[ء-ي]/);
    }
  });

  it("has at least one lesson in every level", () => {
    for (const level of QAIDA_LEVELS) {
      expect(lessonsForLevel(level.id).length, level.id).toBeGreaterThan(0);
    }
  });

  it("keeps lessons of a level contiguous and in level order", () => {
    const levelSequence: string[] = [];
    for (const lesson of QAIDA_LESSONS) {
      if (levelSequence[levelSequence.length - 1] !== lesson.level) levelSequence.push(lesson.level);
    }
    expect(levelSequence).toEqual([...QAIDA_LEVEL_IDS]);
  });
});

describe("lessons", () => {
  it("gives every lesson a unique id", () => {
    const ids = QAIDA_LESSONS.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every lesson a title, an objective and teaching content", () => {
    for (const lesson of QAIDA_LESSONS) {
      expect(lesson.title.length, lesson.id).toBeGreaterThan(3);
      expect(lesson.objective.length, lesson.id).toBeGreaterThan(20);
      expect(lesson.teaching.length, lesson.id).toBeGreaterThan(40);
      expect(lesson.stages.length, lesson.id).toBeGreaterThan(0);
      for (const stage of lesson.stages) expect(QAIDA_LESSON_STAGES, lesson.id).toContain(stage);
    }
  });

  it("starts with a lesson that has no prerequisite", () => {
    expect(QAIDA_LESSONS[0].id).toBe(FIRST_LESSON_ID);
    expect(QAIDA_LESSONS[0].prerequisites).toEqual([]);
    expect(QAIDA_LESSONS.filter((lesson) => lesson.prerequisites.length === 0)).toHaveLength(1);
  });

  it("ends with a lesson that has no next lesson", () => {
    const last = QAIDA_LESSONS[QAIDA_LESSONS.length - 1];
    expect(last.next).toBeNull();
    expect(followingLesson(last.id)).toBeNull();
    expect(QAIDA_LESSONS.filter((lesson) => lesson.next === null)).toHaveLength(1);
  });

  it("links each lesson to the one after it in course order", () => {
    for (let index = 0; index < QAIDA_LESSONS.length - 1; index += 1) {
      expect(QAIDA_LESSONS[index].next).toBe(QAIDA_LESSONS[index + 1].id);
      expect(followingLesson(QAIDA_LESSONS[index].id)?.id).toBe(QAIDA_LESSONS[index + 1].id);
    }
  });

  it("points every prerequisite at a lesson that exists and comes earlier", () => {
    for (const lesson of QAIDA_LESSONS) {
      for (const prerequisite of lesson.prerequisites) {
        expect(getQaidaLesson(prerequisite), `${lesson.id} -> ${prerequisite}`).not.toBeNull();
        expect(lessonOrder(prerequisite), `${lesson.id} -> ${prerequisite}`).toBeLessThan(lessonOrder(lesson.id));
      }
    }
  });

  it("has no circular prerequisite chain", () => {
    // Walking prerequisites can never revisit a lesson: a cycle would recur.
    const walk = (lessonId: string, seen: string[]): void => {
      expect(seen, `cycle through ${lessonId}`).not.toContain(lessonId);
      for (const prerequisite of getQaidaLesson(lessonId)?.prerequisites ?? []) {
        walk(prerequisite, [...seen, lessonId]);
      }
    };
    for (const lesson of QAIDA_LESSONS) walk(lesson.id, []);
  });

  it("reaches every lesson from the first one by completing lessons in order", () => {
    const completed: string[] = [];
    for (const lesson of QAIDA_LESSONS) {
      expect(isLessonUnlocked(lesson.id, completed), lesson.id).toBe(true);
      completed.push(lesson.id);
    }
    expect(completed).toHaveLength(QAIDA_LESSONS.length);
  });
});

describe("practice items", () => {
  it("gives every practice item a unique id, a known type and a prompt", () => {
    const ids = QAIDA_LESSONS.flatMap((lesson) => lesson.practice.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);

    for (const lesson of QAIDA_LESSONS) {
      expect(lesson.practice.length, lesson.id).toBeGreaterThan(0);
      for (const item of lesson.practice) {
        expect(QAIDA_EXERCISE_TYPES, item.id).toContain(item.type);
        expect(item.prompt.length, item.id).toBeGreaterThan(10);
      }
    }
  });

  it("gives every choice exercise at least two options and exactly one correct answer", () => {
    for (const lesson of QAIDA_LESSONS) {
      for (const item of lesson.practice) {
        if (!isChoiceExercise(item.type)) continue;
        expect(item.choices?.length ?? 0, item.id).toBeGreaterThanOrEqual(2);
        expect(item.choices?.filter((choice) => choice.correct), item.id).toHaveLength(1);
        // Two options that read identically would have no right answer.
        const labels = (item.choices ?? []).map((choice) => choice.label ?? choice.arabic ?? "");
        expect(new Set(labels).size, item.id).toBe(labels.length);
        for (const choice of item.choices ?? []) {
          expect(Boolean(choice.label || choice.arabic), `${item.id}/${choice.id}`).toBe(true);
        }
      }
    }
  });

  it("gives every read exercise something to read", () => {
    for (const lesson of QAIDA_LESSONS) {
      for (const item of lesson.practice) {
        if (!isReadExercise(item.type)) continue;
        expect(Boolean(item.subject?.arabic || item.quran), item.id).toBe(true);
        if (item.quran) {
          expect(item.quran.surah, item.id).toBeGreaterThanOrEqual(1);
          expect(item.quran.surah, item.id).toBeLessThanOrEqual(114);
          expect(item.quran.ayah, item.id).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("grades a choice exercise by its correct option and a read exercise by attempting it", () => {
    const choiceItem = QAIDA_LESSONS[0].practice[0];
    const answer = correctChoice(choiceItem);
    expect(answer).not.toBeNull();
    expect(isCorrectAnswer(choiceItem, answer?.id ?? null)).toBe(true);
    expect(isCorrectAnswer(choiceItem, "option-does-not-exist")).toBe(false);
    expect(isCorrectAnswer(choiceItem, null)).toBe(false);

    const readItem = QAIDA_LESSONS.flatMap((lesson) => lesson.practice).find((item) => isReadExercise(item.type));
    expect(readItem).toBeDefined();
    expect(isCorrectAnswer(readItem!, null)).toBe(true);
  });

  it("uses every exercise type the curriculum declares", () => {
    expect(usedExerciseTypes().sort()).toEqual([...QAIDA_EXERCISE_TYPES].sort());
  });
});

describe("Quran and teaching text", () => {
  const everyText = QAIDA_LESSONS.flatMap((lesson) => [
    ...lesson.examples,
    ...lesson.practice.map((item) => item.subject),
    ...lesson.practice.flatMap((item) => item.choices ?? []).map(() => undefined),
  ]).filter((text): text is NonNullable<typeof text> => Boolean(text));

  it("marks every piece of Arabic as teaching text or as Quran", () => {
    for (const text of everyText) {
      expect(["teaching", "quran"], text.arabic).toContain(text.source);
      expect(text.arabic.trim().length, text.gloss).toBeGreaterThan(0);
      expect(text.gloss.trim().length, text.arabic).toBeGreaterThan(0);
    }
  });

  it("carries a surah:ayah reference on every piece of Quran text, and none on teaching text", () => {
    for (const text of everyText) {
      if (text.source === "quran") {
        expect(text.reference, text.arabic).toMatch(/^\d{1,3}:\d{1,3}$/);
        const [surah, ayah] = (text.reference ?? "").split(":").map(Number);
        expect(surah, text.arabic).toBeGreaterThanOrEqual(1);
        expect(surah, text.arabic).toBeLessThanOrEqual(114);
        expect(ayah, text.arabic).toBeGreaterThanOrEqual(1);
      } else {
        expect(text.reference, text.arabic).toBeUndefined();
      }
    }
  });

  it("practises whole ayat by reference rather than by copying ayah text", () => {
    const quranReading = QAIDA_LESSONS.filter((lesson) => lesson.level === "quran-reading");
    const readQuran = quranReading.flatMap((lesson) => lesson.practice).filter((item) => item.type === "read-quran");
    expect(readQuran.length).toBeGreaterThan(0);
    for (const item of readQuran) {
      expect(item.quran, item.id).toBeDefined();
      expect(item.subject, item.id).toBeUndefined();
    }
  });

  it("makes no acoustic claim in any lesson's teaching text", () => {
    // Tajwid terms may be *named* — the curriculum teaches them — but no lesson
    // may claim the app judges how the learner sounded.
    // The negative lookahead lets a *disclaimer* through ("the app does not
    // assess ghunnah") while still catching an assertion that it does.
    const claim = /\b(we|the app|this app|miqra)\b(?![^.]{0,40}\b(?:not|never|cannot|nor)\b)[^.]{0,60}\b(assess|judge|measure|grade|score|evaluate)\b[^.]{0,40}\b(tajwid|tajweed|makhraj|pronunciation|madd|ghunnah)/i;
    for (const lesson of QAIDA_LESSONS) {
      const text = [lesson.teaching, lesson.objective, lesson.boundary ?? "", ...lesson.practice.map((item) => item.note ?? "")].join(" ");
      expect(text, lesson.id).not.toMatch(claim);
    }
  });

  it("attaches a boundary note to every lesson that names a tajwid rule", () => {
    const tajwidLevels = QAIDA_LESSONS.filter((lesson) => lesson.level === "tajweed-patterns" || lesson.level === "madd");
    for (const lesson of tajwidLevels) {
      expect(lesson.boundary, lesson.id).toBeTruthy();
    }
  });
});

describe("progression helpers", () => {
  it("unlocks the first lesson and locks a later one for a new learner", () => {
    expect(isLessonUnlocked(FIRST_LESSON_ID, [])).toBe(true);
    expect(isLessonUnlocked(QAIDA_LESSONS[3].id, [])).toBe(false);
    expect(isLessonUnlocked("no-such-lesson", [])).toBe(false);
  });

  it("unlocks a lesson once its prerequisites are complete", () => {
    const second = QAIDA_LESSONS[1];
    expect(isLessonUnlocked(second.id, [])).toBe(false);
    expect(isLessonUnlocked(second.id, [FIRST_LESSON_ID])).toBe(true);
  });

  it("keeps a completed lesson unlocked for review", () => {
    const completed = [FIRST_LESSON_ID, QAIDA_LESSONS[1].id];
    expect(isLessonUnlocked(FIRST_LESSON_ID, completed)).toBe(true);
    // Even out of order: a lesson already finished never re-locks.
    expect(isLessonUnlocked(QAIDA_LESSONS[1].id, [QAIDA_LESSONS[1].id])).toBe(true);
  });

  it("names the next incomplete lesson, and nothing once the course is finished", () => {
    expect(nextIncompleteLesson([])?.id).toBe(FIRST_LESSON_ID);
    expect(nextIncompleteLesson([FIRST_LESSON_ID])?.id).toBe(QAIDA_LESSONS[1].id);
    expect(nextIncompleteLesson(QAIDA_LESSONS.map((lesson) => lesson.id))).toBeNull();
  });

  it("walks a beginner through a sample sequence in order", () => {
    let completed: string[] = [];
    const walked: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      const lesson = nextIncompleteLesson(completed);
      expect(lesson).not.toBeNull();
      walked.push(lesson!.id);
      completed = [...completed, lesson!.id];
    }
    expect(walked).toEqual(QAIDA_LESSONS.slice(0, 6).map((lesson) => lesson.id));
  });

  it("reports progress within a level and across the course", () => {
    const lettersLessons = lessonsForLevel("letters");
    const half = lettersLessons.slice(0, Math.floor(lettersLessons.length / 2)).map((lesson) => lesson.id);

    const progress = levelProgress("letters", half);
    expect(progress?.completed).toBe(half.length);
    expect(progress?.total).toBe(lettersLessons.length);
    expect(progress?.percent).toBe(Math.round((half.length / lettersLessons.length) * 100));
    expect(progress?.unlocked).toBe(true);

    expect(levelProgress("quran-reading", [])?.unlocked).toBe(false);
    expect(curriculumProgressPercent([])).toBe(0);
    expect(curriculumProgressPercent(QAIDA_LESSONS.map((lesson) => lesson.id))).toBe(100);
    // An id the curriculum no longer defines never counts towards progress.
    expect(curriculumProgressPercent(["retired-lesson"])).toBe(0);
  });
});

describe("mastery", () => {
  const lesson = QAIDA_LESSONS[0];

  it("requires the lesson's correct answers and attempts", () => {
    expect(evaluateLessonAttempt(lesson, { correctCount: 0, attemptedCount: 0 })).toEqual({
      met: false,
      remainingCorrect: lesson.mastery.correctRequired,
      remainingItems: lesson.mastery.itemsRequired,
    });

    expect(
      evaluateLessonAttempt(lesson, {
        correctCount: lesson.mastery.correctRequired,
        attemptedCount: lesson.mastery.itemsRequired,
      }).met,
    ).toBe(true);
  });

  it("does not go negative when a learner does more than the lesson asks", () => {
    const result = evaluateLessonAttempt(lesson, { correctCount: 99, attemptedCount: 99 });
    expect(result).toEqual({ met: true, remainingCorrect: 0, remainingItems: 0 });
  });

  it("asks for a real count rather than a confidence score", () => {
    for (const item of QAIDA_LESSONS) {
      expect(Number.isInteger(item.mastery.correctRequired), item.id).toBe(true);
      expect(item.mastery.correctRequired, item.id).toBeGreaterThan(0);
      expect(item.mastery.correctRequired, item.id).toBeLessThanOrEqual(item.practice.length);
      expect(item.mastery.itemsRequired, item.id).toBeLessThanOrEqual(item.practice.length);
    }
  });
});
