/**
 * Learn-mode behaviour: what happens as a learner works through a lesson.
 *
 * These drive the same pure transitions the Learn view calls, so they cover the
 * lesson flow without needing a DOM renderer.
 */
import { describe, expect, it } from "vitest";
import {
  FIRST_LESSON_ID,
  QAIDA_LESSONS,
  getQaidaLesson,
  nextIncompleteLesson,
  type QaidaLesson,
} from "@shared/qaidaCurriculum";
import { correctChoice, isReadExercise } from "@shared/qaidaExercises";
import {
  answerItem,
  continueSession,
  currentItem,
  isLessonMastered,
  isSessionFinished,
  retrySession,
  startSession,
} from "./qaidaSession";
import { completeLesson, emptyQaidaProgress, openLesson } from "./qaidaProgress";

const firstLesson = getQaidaLesson(FIRST_LESSON_ID) as QaidaLesson;

/** Answers every practice item of a lesson correctly, in order. */
function completeEveryItem(lesson: QaidaLesson) {
  let session = startSession(lesson);
  for (let step = 0; step < lesson.practice.length; step += 1) {
    const item = currentItem(lesson, session);
    expect(item, `item ${step}`).not.toBeNull();
    session = answerItem(lesson, session, isReadExercise(item!.type) ? null : correctChoice(item!)?.id ?? null);
    expect(session.result).toBe("correct");
    session = continueSession(lesson, session);
  }
  return session;
}

describe("working through a lesson", () => {
  it("starts on the first practice item with nothing answered", () => {
    const session = startSession(firstLesson);

    expect(session).toMatchObject({ lessonId: firstLesson.id, itemIndex: 0, correctIds: [], attemptedIds: [], result: null });
    expect(currentItem(firstLesson, session)?.id).toBe(firstLesson.practice[0].id);
    expect(isSessionFinished(firstLesson, session)).toBe(false);
  });

  it("accepts the correct choice and moves on", () => {
    const item = firstLesson.practice[0];
    const answered = answerItem(firstLesson, startSession(firstLesson), correctChoice(item)?.id ?? null);

    expect(answered.result).toBe("correct");
    expect(answered.correctIds).toEqual([item.id]);

    const next = continueSession(firstLesson, answered);
    expect(next.itemIndex).toBe(1);
    expect(next.result).toBeNull();
    expect(next.selectedChoiceId).toBeNull();
  });

  it("keeps a wrong answer on the same item and loses nothing", () => {
    const wrong = answerItem(firstLesson, startSession(firstLesson), "option-does-not-exist");

    expect(wrong.result).toBe("retry");
    expect(wrong.correctIds).toEqual([]);
    expect(wrong.attemptedIds).toEqual([firstLesson.practice[0].id]);
    expect(currentItem(firstLesson, wrong)?.id).toBe(firstLesson.practice[0].id);

    const again = retrySession(wrong);
    expect(again.result).toBeNull();
    expect(again.itemIndex).toBe(0);
    expect(again.attemptedIds).toEqual(wrong.attemptedIds);
  });

  it("lets a learner recover on the same item after a wrong answer", () => {
    const item = firstLesson.practice[0];
    let session = answerItem(firstLesson, startSession(firstLesson), "option-does-not-exist");
    session = retrySession(session);
    session = answerItem(firstLesson, session, correctChoice(item)?.id ?? null);

    expect(session.result).toBe("correct");
    expect(session.correctIds).toEqual([item.id]);
    // Attempting the same item twice still counts as one item attempted.
    expect(session.attemptedIds).toEqual([item.id]);
  });

  it("completes a read exercise by confirming it was read aloud", () => {
    const readLesson = QAIDA_LESSONS.find((lesson) => lesson.practice.every((item) => isReadExercise(item.type)));
    expect(readLesson).toBeDefined();

    const session = answerItem(readLesson!, startSession(readLesson!), null);
    expect(session.result).toBe("correct");
  });

  it("reaches mastery once every item is answered correctly", () => {
    const session = completeEveryItem(firstLesson);

    expect(isLessonMastered(firstLesson, session)).toBe(true);
    expect(isSessionFinished(firstLesson, session)).toBe(true);
    expect(session.correctIds).toHaveLength(firstLesson.practice.length);
  });

  it("is not mastered part-way through", () => {
    let session = startSession(firstLesson);
    const item = currentItem(firstLesson, session)!;
    session = continueSession(firstLesson, answerItem(firstLesson, session, correctChoice(item)?.id ?? null));

    expect(isLessonMastered(firstLesson, session)).toBe(false);
    expect(isSessionFinished(firstLesson, session)).toBe(false);
  });

  it("does not run past the last item", () => {
    let session = completeEveryItem(firstLesson);
    session = continueSession(firstLesson, session);

    expect(session.itemIndex).toBe(firstLesson.practice.length);
    expect(currentItem(firstLesson, session)).toBeNull();
    expect(answerItem(firstLesson, session, "option-1")).toBe(session);
  });
});

describe("moving between lessons", () => {
  it("carries a finished lesson into progress and opens the next one", () => {
    const session = completeEveryItem(firstLesson);
    expect(isLessonMastered(firstLesson, session)).toBe(true);

    const progress = completeLesson(emptyQaidaProgress(), firstLesson.id);
    expect(progress.completedLessons).toEqual([firstLesson.id]);
    expect(progress.currentLessonId).toBe(QAIDA_LESSONS[1].id);
    expect(nextIncompleteLesson(progress.completedLessons)?.id).toBe(QAIDA_LESSONS[1].id);
  });

  it("restarts practice when the lesson changes, including for review", () => {
    const second = QAIDA_LESSONS[1];
    const finished = completeEveryItem(firstLesson);
    const reviewing = startSession(second);

    expect(reviewing.lessonId).toBe(second.id);
    expect(reviewing.itemIndex).toBe(0);
    expect(reviewing.correctIds).toEqual([]);
    expect(finished.lessonId).toBe(firstLesson.id);
  });

  it("lets a learner reopen a completed lesson and work it again", () => {
    const progress = openLesson(completeLesson(emptyQaidaProgress(), firstLesson.id), firstLesson.id);
    expect(progress.currentLessonId).toBe(firstLesson.id);
    expect(progress.completedLessons).toContain(firstLesson.id);

    const session = completeEveryItem(firstLesson);
    expect(isLessonMastered(firstLesson, session)).toBe(true);
    // Re-completing does not duplicate the record.
    expect(completeLesson(progress, firstLesson.id).completedLessons).toEqual([firstLesson.id]);
  });

  it("walks a beginner through the first three lessons end to end", () => {
    let progress = emptyQaidaProgress();
    const visited: string[] = [];

    for (let step = 0; step < 3; step += 1) {
      const lesson = getQaidaLesson(progress.currentLessonId)!;
      visited.push(lesson.id);
      const session = completeEveryItem(lesson);
      expect(isLessonMastered(lesson, session), lesson.id).toBe(true);
      progress = completeLesson(progress, lesson.id);
    }

    expect(visited).toEqual(QAIDA_LESSONS.slice(0, 3).map((lesson) => lesson.id));
    expect(progress.completedLessons).toEqual(visited);
    expect(progress.currentLessonId).toBe(QAIDA_LESSONS[3].id);
  });
});
