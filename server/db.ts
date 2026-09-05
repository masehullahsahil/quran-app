import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, memorizationAttempts, qaidaLessonCompletions, qaidaProgress, users } from "../drizzle/schema";
import type { MemorizationAttempt } from "../shared/memorization";
import { FIRST_LESSON_ID, QAIDA_LESSONS } from "../shared/qaidaCurriculum";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export type LearnerSnapshot = {
  qaida: { completedLessons: string[]; currentLessonId: string; updatedAt: string | null };
  memorizationAttempts: MemorizationAttempt[];
};

const lessonRank = new Map(QAIDA_LESSONS.map((lesson, index) => [lesson.id, index]));
export function furthestLesson(...ids: string[]): string {
  return ids.filter(id => lessonRank.has(id)).sort((a, b) => (lessonRank.get(b) ?? -1) - (lessonRank.get(a) ?? -1))[0] ?? FIRST_LESSON_ID;
}

function decodeAttempt(row: typeof memorizationAttempts.$inferSelect): MemorizationAttempt {
  return {
    id: row.idempotencyKey,
    sessionId: row.sessionId,
    surah: row.surah,
    ayah: row.ayah,
    timestamp: row.attemptedAt.toISOString(),
    result: row.result,
    score: row.score,
    matchedCount: row.matchedCount,
    totalExpectedWords: row.totalWords,
    correctionWordIndexes: JSON.parse(row.correctionWordIndexesJson),
    errors: JSON.parse(row.errorsJson),
    attemptsRequired: row.attemptsRequired,
    eventuallyAdvanced: Boolean(row.eventuallyAdvanced),
  };
}

export async function getLearnerSnapshot(userId: number): Promise<LearnerSnapshot> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [progressRows, completionRows, attemptRows] = await Promise.all([
    db.select().from(qaidaProgress).where(eq(qaidaProgress.userId, userId)).limit(1),
    db.select().from(qaidaLessonCompletions).where(eq(qaidaLessonCompletions.userId, userId)),
    db.select().from(memorizationAttempts).where(eq(memorizationAttempts.userId, userId)),
  ]);
  const progress = progressRows[0];
  return {
    qaida: {
      completedLessons: completionRows.map(row => row.lessonId),
      currentLessonId: progress?.currentLessonId ?? FIRST_LESSON_ID,
      updatedAt: progress?.updatedAt.toISOString() ?? null,
    },
    memorizationAttempts: attemptRows.map(decodeAttempt).sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)),
  };
}

export async function mergeQaidaProgress(userId: number, local: { completedLessons: string[]; currentLessonId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const current = await db.select().from(qaidaProgress).where(eq(qaidaProgress.userId, userId)).limit(1);
  const currentLessonId = furthestLesson(current[0]?.currentLessonId ?? FIRST_LESSON_ID, local.currentLessonId);
  if (local.completedLessons.length) {
    await db.insert(qaidaLessonCompletions).values(local.completedLessons.map(lessonId => ({ userId, lessonId }))).onDuplicateKeyUpdate({ set: { userId } });
  }
  await db.insert(qaidaProgress).values({ userId, currentLessonId }).onDuplicateKeyUpdate({ set: { currentLessonId } });
}

export async function insertMemorizationAttempt(userId: number, attempt: MemorizationAttempt): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await db.select({ id: memorizationAttempts.id }).from(memorizationAttempts)
    .where(and(eq(memorizationAttempts.userId, userId), eq(memorizationAttempts.idempotencyKey, attempt.id))).limit(1);
  if (existing.length) return false;
  await db.insert(memorizationAttempts).values({
    userId, idempotencyKey: attempt.id, sessionId: attempt.sessionId, surah: attempt.surah, ayah: attempt.ayah,
    attemptedAt: new Date(attempt.timestamp), result: attempt.result, score: attempt.score,
    matchedCount: attempt.matchedCount, totalWords: attempt.totalExpectedWords,
    correctionWordIndexesJson: JSON.stringify(attempt.correctionWordIndexes), errorsJson: JSON.stringify(attempt.errors),
    attemptsRequired: attempt.attemptsRequired, eventuallyAdvanced: attempt.eventuallyAdvanced ? 1 : 0,
  }).onDuplicateKeyUpdate({ set: { idempotencyKey: attempt.id } });
  return true;
}
