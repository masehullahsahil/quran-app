import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const qaidaProgress = mysqlTable("qaida_progress", {
  userId: int("userId").notNull().primaryKey().references(() => users.id, { onDelete: "cascade" }),
  currentLessonId: varchar("currentLessonId", { length: 128 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const qaidaLessonCompletions = mysqlTable("qaida_lesson_completions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: varchar("lessonId", { length: 128 }).notNull(),
  completedAt: timestamp("completedAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("qaida_completion_user_lesson_uq").on(table.userId, table.lessonId),
  index("qaida_completion_user_idx").on(table.userId),
]);

/** Auditable source of truth. Mastery and review state are derived from these rows. */
export const memorizationAttempts = mysqlTable("memorization_attempts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  idempotencyKey: varchar("idempotencyKey", { length: 200 }).notNull(),
  sessionId: varchar("sessionId", { length: 200 }).notNull(),
  surah: int("surah").notNull(),
  ayah: int("ayah").notNull(),
  attemptedAt: timestamp("attemptedAt").notNull(),
  result: mysqlEnum("result", ["completed", "partial", "corrected", "uncertain"]).notNull(),
  score: int("score").notNull(),
  matchedCount: int("matchedCount").notNull(),
  totalWords: int("totalWords").notNull(),
  correctionWordIndexesJson: text("correctionWordIndexesJson").notNull(),
  errorsJson: text("errorsJson").notNull(),
  attemptsRequired: int("attemptsRequired").notNull(),
  eventuallyAdvanced: int("eventuallyAdvanced").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("memorization_attempt_user_key_uq").on(table.userId, table.idempotencyKey),
  index("memorization_attempt_user_ayah_idx").on(table.userId, table.surah, table.ayah),
]);
