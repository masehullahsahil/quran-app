import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIRST_LESSON_ID, QAIDA_LESSONS } from "@shared/qaidaCurriculum";
import type { MemorizationAttempt } from "@shared/memorization";

const state = vi.hoisted(() => new Map<number, { currentLessonId: string; completedLessons: string[]; attempts: MemorizationAttempt[] }>());

vi.mock("./db", () => ({
  getLearnerSnapshot: vi.fn(async (userId: number) => {
    const value = state.get(userId) ?? { currentLessonId: FIRST_LESSON_ID, completedLessons: [], attempts: [] };
    return { qaida: { currentLessonId: value.currentLessonId, completedLessons: value.completedLessons, updatedAt: null }, memorizationAttempts: value.attempts };
  }),
  mergeQaidaProgress: vi.fn(async (userId: number, input: { currentLessonId: string; completedLessons: string[] }) => {
    const value = state.get(userId) ?? { currentLessonId: FIRST_LESSON_ID, completedLessons: [], attempts: [] };
    const rank = (id: string) => QAIDA_LESSONS.findIndex(lesson => lesson.id === id);
    state.set(userId, {
      ...value,
      currentLessonId: rank(input.currentLessonId) > rank(value.currentLessonId) ? input.currentLessonId : value.currentLessonId,
      completedLessons: Array.from(new Set([...value.completedLessons, ...input.completedLessons])),
    });
  }),
  insertMemorizationAttempt: vi.fn(async (userId: number, attempt: MemorizationAttempt) => {
    const value = state.get(userId) ?? { currentLessonId: FIRST_LESSON_ID, completedLessons: [], attempts: [] };
    if (value.attempts.some(item => item.id === attempt.id)) return false;
    state.set(userId, { ...value, attempts: [...value.attempts, attempt] });
    return true;
  }),
}));

import { appRouter } from "./routers";

const user = (id: number) => ({ id, openId: `open-${id}`, name: null, email: null, loginMethod: null, role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
const caller = (id: number) => appRouter.createCaller({ user: user(id), req: {} as never, res: {} as never });
const attempt = (overrides: Partial<MemorizationAttempt> = {}) => ({
  id: "attempt-key-0001", sessionId: "session-1", surah: 1, ayah: 1,
  timestamp: "2026-01-01T00:00:00.000Z", result: "completed" as const,
  matchedCount: 4, totalExpectedWords: 4, score: 100, correctionWordIndexes: [], errors: [],
  attemptsRequired: 1, eventuallyAdvanced: true, ...overrides, stability: "final" as const,
});

describe("learner router", () => {
  beforeEach(() => state.clear());

  it("scopes all reads and writes to the authenticated user", async () => {
    await caller(1).learner.recordMemorizationAttempt(attempt());
    expect(await caller(1).learner.getMemorizationHistory()).toHaveLength(1);
    expect(await caller(2).learner.getMemorizationHistory()).toEqual([]);
  });

  it("saves current lesson, unions completions, and never moves progress backwards", async () => {
    const later = QAIDA_LESSONS[2].id;
    await caller(1).learner.syncQaidaProgress({ currentLessonId: later, completedLessons: [FIRST_LESSON_ID] });
    const merged = await caller(1).learner.syncQaidaProgress({ currentLessonId: FIRST_LESSON_ID, completedLessons: [QAIDA_LESSONS[1].id] });
    expect(merged.qaida.currentLessonId).toBe(later);
    expect(merged.qaida.completedLessons).toEqual([FIRST_LESSON_ID, QAIDA_LESSONS[1].id]);
  });

  it("records a finalized attempt once and derives its mastery", async () => {
    const first = await caller(1).learner.recordMemorizationAttempt(attempt());
    const duplicate = await caller(1).learner.recordMemorizationAttempt(attempt());
    expect(first.inserted).toBe(true);
    expect(first.memory.mastery).toBe("learning");
    expect(duplicate.inserted).toBe(false);
    expect(await caller(1).learner.getMemorizationHistory()).toHaveLength(1);
  });

  it.each([
    ["interim outcome", { ...attempt(), stability: "interim" }],
    ["invalid surah", attempt({ surah: 115 })],
    ["invalid ayah", attempt({ ayah: 0 })],
    ["invalid score", attempt({ score: 101 })],
  ])("rejects %s", async (_label, input) => {
    await expect(caller(1).learner.recordMemorizationAttempt(input as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("makes local-to-account migration idempotent and computes review from durable history", async () => {
    const payload = { qaida: { currentLessonId: QAIDA_LESSONS[1].id, completedLessons: [FIRST_LESSON_ID] }, memorizationAttempts: [attempt()] };
    await caller(1).learner.syncProgress(payload);
    const merged = await caller(1).learner.syncProgress(payload);
    expect(merged.memorizationAttempts).toHaveLength(1);
    expect(merged.qaida.completedLessons).toEqual([FIRST_LESSON_ID]);
    const review = await caller(1).learner.getReviewQueue();
    expect(review.queue[0]).toMatchObject({ surah: 1, ayah: 1 });
  });

  it("preserves the full Learn-to-Study path for a fresh authenticated session", async () => {
    const nextLesson = QAIDA_LESSONS[1].id;
    const sessionA = caller(1);
    await sessionA.learner.syncQaidaProgress({ currentLessonId: nextLesson, completedLessons: [FIRST_LESSON_ID] });
    const finalized = attempt({ id: "study-finalized-1", result: "corrected", score: 86, matchedCount: 3,
      correctionWordIndexes: [4], errors: [{ type: "omission", wordIndex: 4 }], eventuallyAdvanced: true });
    await sessionA.learner.recordMemorizationAttempt(finalized);

    // A new caller represents a new cookie/browser session for the same user.
    const sessionB = caller(1);
    const restored = await sessionB.learner.getProgress();
    const review = await sessionB.learner.getReviewQueue();
    expect(restored.qaida).toMatchObject({ currentLessonId: nextLesson, completedLessons: [FIRST_LESSON_ID] });
    expect(restored.memorizationAttempts).toEqual([expect.objectContaining({ id: "study-finalized-1", result: "corrected" })]);
    expect(review.queue).toEqual([expect.objectContaining({ surah: 1, ayah: 1 })]);
    await sessionB.learner.recordMemorizationAttempt(finalized);
    expect(await sessionB.learner.getMemorizationHistory()).toHaveLength(1);
  });
});
