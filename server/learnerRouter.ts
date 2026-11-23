import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { buildReviewQueue, deriveAyahMemory, findRecurringErrors } from "@shared/memorization";
import { getQaidaLesson } from "@shared/qaidaCurriculum";
import { getLearnerSnapshot, insertMemorizationAttempt, mergeQaidaProgress } from "./db";

const lessonId = z.string().min(1).max(128).refine(value => Boolean(getQaidaLesson(value)), "Unknown Qaida lesson");
const errorInput = z.object({
  type: z.enum(["omission", "substitution_review", "extra", "repetition"]),
  wordIndex: z.number().int().min(1).max(1000).nullable(),
});
const memorizationAttemptInput = z.object({
  id: z.string().min(8).max(200),
  sessionId: z.string().min(1).max(200),
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  timestamp: z.iso.datetime({ offset: true }),
  result: z.enum(["completed", "partial", "corrected", "uncertain"]),
  matchedCount: z.number().int().min(0).max(1000),
  totalExpectedWords: z.number().int().min(1).max(1000),
  score: z.number().int().min(0).max(100),
  correctionWordIndexes: z.array(z.number().int().min(1).max(1000)).max(1000),
  errors: z.array(errorInput).max(1000),
  attemptsRequired: z.number().int().min(1).max(1000),
  eventuallyAdvanced: z.boolean(),
  stability: z.literal("final"),
}).superRefine((attempt, ctx) => {
  if (attempt.matchedCount > attempt.totalExpectedWords) ctx.addIssue({ code: "custom", path: ["matchedCount"], message: "Matched words cannot exceed total words" });
  attempt.correctionWordIndexes.forEach((word, index) => {
    if (word > attempt.totalExpectedWords) ctx.addIssue({ code: "custom", path: ["correctionWordIndexes", index], message: "Word index exceeds total words" });
  });
  attempt.errors.forEach((error, index) => {
    if (error.wordIndex !== null && error.wordIndex > attempt.totalExpectedWords) ctx.addIssue({ code: "custom", path: ["errors", index, "wordIndex"], message: "Word index exceeds total words" });
  });
});

const durableAttempt = memorizationAttemptInput.transform(({ stability: _stability, ...attempt }) => attempt);

/**
 * Signed-in learner records. Every procedure takes the learner id from the
 * authenticated context, never from the browser (docs/learner-persistence.md).
 */
export const learnerRouter = router({
  getProgress: protectedProcedure.query(({ ctx }) => getLearnerSnapshot(ctx.user.id)),
  syncQaidaProgress: protectedProcedure.input(z.object({
    completedLessons: z.array(lessonId).max(500),
    currentLessonId: lessonId,
  })).mutation(async ({ ctx, input }) => {
    await mergeQaidaProgress(ctx.user.id, input);
    return getLearnerSnapshot(ctx.user.id);
  }),
  recordMemorizationAttempt: protectedProcedure.input(durableAttempt).mutation(async ({ ctx, input }) => {
    const inserted = await insertMemorizationAttempt(ctx.user.id, input);
    const snapshot = await getLearnerSnapshot(ctx.user.id);
    return { inserted, memory: deriveAyahMemory(input.surah, input.ayah, snapshot.memorizationAttempts) };
  }),
  syncProgress: protectedProcedure.input(z.object({
    qaida: z.object({ completedLessons: z.array(lessonId).max(500), currentLessonId: lessonId }),
    memorizationAttempts: z.array(durableAttempt).max(500),
  })).mutation(async ({ ctx, input }) => {
    await mergeQaidaProgress(ctx.user.id, input.qaida);
    for (const attempt of input.memorizationAttempts) await insertMemorizationAttempt(ctx.user.id, attempt);
    return getLearnerSnapshot(ctx.user.id);
  }),
  getMemorizationHistory: protectedProcedure.query(async ({ ctx }) => (await getLearnerSnapshot(ctx.user.id)).memorizationAttempts),
  getReviewQueue: protectedProcedure.query(async ({ ctx }) => {
    const attempts = (await getLearnerSnapshot(ctx.user.id)).memorizationAttempts;
    return { queue: buildReviewQueue(attempts), recurringErrors: findRecurringErrors(attempts) };
  }),
});
