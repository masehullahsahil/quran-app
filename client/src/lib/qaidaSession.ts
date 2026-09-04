/**
 * One sitting with one Qaida lesson.
 *
 * The Learn view holds this as state and renders it; every transition is a pure
 * function here, so lesson behaviour — answering, retrying, advancing, reaching
 * mastery — is testable without a browser.
 *
 * Nothing here grades sound. A read exercise completes when the learner says
 * they read it; that is an attempt record, not an assessment of how it sounded.
 */
import { evaluateLessonAttempt, type QaidaLesson } from "@shared/qaidaCurriculum";
import { isCorrectAnswer, type QaidaExercise } from "@shared/qaidaExercises";

export type QaidaAnswerResult = "correct" | "retry";

export type QaidaSession = {
  lessonId: string;
  /** Index of the practice item on screen. */
  itemIndex: number;
  /** Items answered correctly. An item repeated for review never counts twice. */
  correctIds: string[];
  attemptedIds: string[];
  selectedChoiceId: string | null;
  result: QaidaAnswerResult | null;
};

export function startSession(lesson: QaidaLesson): QaidaSession {
  return { lessonId: lesson.id, itemIndex: 0, correctIds: [], attemptedIds: [], selectedChoiceId: null, result: null };
}

export function currentItem(lesson: QaidaLesson, session: QaidaSession): QaidaExercise | null {
  return lesson.practice[session.itemIndex] ?? null;
}

/**
 * Records an answer. A wrong answer keeps the learner on the same item with a
 * "try again" — it never resets the lesson or takes progress away.
 */
export function answerItem(lesson: QaidaLesson, session: QaidaSession, choiceId: string | null): QaidaSession {
  const item = currentItem(lesson, session);
  if (!item) return session;

  const correct = isCorrectAnswer(item, choiceId);
  return {
    ...session,
    selectedChoiceId: choiceId,
    result: correct ? "correct" : "retry",
    correctIds: correct && !session.correctIds.includes(item.id) ? [...session.correctIds, item.id] : session.correctIds,
    attemptedIds: session.attemptedIds.includes(item.id) ? session.attemptedIds : [...session.attemptedIds, item.id],
  };
}

/** Moves to the next practice item, clearing the answer shown. */
export function continueSession(lesson: QaidaLesson, session: QaidaSession): QaidaSession {
  return {
    ...session,
    itemIndex: Math.min(session.itemIndex + 1, lesson.practice.length),
    selectedChoiceId: null,
    result: null,
  };
}

/** Clears a wrong answer so the same item can be tried again. */
export function retrySession(session: QaidaSession): QaidaSession {
  return { ...session, selectedChoiceId: null, result: null };
}

/** Whether this sitting has met the lesson's mastery requirement. */
export function isLessonMastered(lesson: QaidaLesson, session: QaidaSession): boolean {
  return evaluateLessonAttempt(lesson, {
    correctCount: session.correctIds.length,
    attemptedCount: session.attemptedIds.length,
  }).met;
}

/** True once there is nothing left to show: mastery met, or items exhausted. */
export function isSessionFinished(lesson: QaidaLesson, session: QaidaSession): boolean {
  return isLessonMastered(lesson, session) || currentItem(lesson, session) === null;
}
