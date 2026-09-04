/** Deterministic textual-recall history. It makes no claim about sound quality. */
export const MASTERY_STATES = [
  "new",
  "learning",
  "needs_review",
  "strong",
  "mastered",
] as const;
export type MasteryState = (typeof MASTERY_STATES)[number];
export type MemorizationResult =
  | "completed"
  | "partial"
  | "corrected"
  | "uncertain";
export type MemorizationErrorType =
  | "omission"
  | "substitution_review"
  | "extra"
  | "repetition";

export type MemorizationError = {
  type: MemorizationErrorType;
  /** One-based Quran expected-word position; null for an unanchored extra. */
  wordIndex: number | null;
};

export type MemorizationAttempt = {
  /** Stable client-generated key makes retried writes idempotent. */
  id: string;
  sessionId: string;
  surah: number;
  ayah: number;
  timestamp: string;
  result: MemorizationResult;
  matchedCount: number;
  totalExpectedWords: number;
  score: number;
  correctionWordIndexes: number[];
  errors: MemorizationError[];
  attemptsRequired: number;
  eventuallyAdvanced: boolean;
};

export type MemorizationConfig = {
  intervalsDays: {
    learning: number;
    firstSuccess: number;
    secondSuccess: number;
    thirdSuccess: number;
    strong: number;
    mastered: number;
  };
  recentAttemptLimit: number;
  recurringWindow: number;
  recurringThreshold: number;
};

export const DEFAULT_MEMORIZATION_CONFIG: MemorizationConfig = {
  intervalsDays: {
    learning: 0,
    firstSuccess: 1,
    secondSuccess: 3,
    thirdSuccess: 7,
    strong: 14,
    mastered: 30,
  },
  recentAttemptLimit: 5,
  recurringWindow: 5,
  recurringThreshold: 3,
};

export type WordErrorSummary = {
  wordIndex: number;
  omissionCount: number;
  substitutionReviewCount: number;
  recentErrorCount: number;
  lastErrorAt: string;
};

export type AyahMemory = {
  surah: number;
  ayah: number;
  attempts: number;
  successfulCompletions: number;
  consecutiveSuccesses: number;
  recentScores: number[];
  corrections: number;
  lastPracticedAt: string | null;
  lastSuccessfulAt: string | null;
  mastery: MasteryState;
  nextReviewAt: string | null;
  wordErrors: WordErrorSummary[];
};

const isSuccess = (attempt: MemorizationAttempt) =>
  attempt.result === "completed" || attempt.result === "corrected";
const isSignificantFailure = (attempt: MemorizationAttempt) =>
  attempt.result === "uncertain" || attempt.score < 70;

/**
 * Rules: any first attempt enters learning. Two consecutive successful reviews
 * make an ayah strong, and five total successes with three consecutive make it
 * mastered. A significant failure moves learning to needs_review; strong or
 * mastered history is only demoted after two consecutive significant failures.
 */
export function deriveAyahMemory(
  surah: number,
  ayah: number,
  allAttempts: readonly MemorizationAttempt[],
  config = DEFAULT_MEMORIZATION_CONFIG
): AyahMemory {
  const attempts = allAttempts
    .filter(item => item.surah === surah && item.ayah === ayah)
    .sort(
      (a, b) =>
        a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)
    );
  let mastery: MasteryState = "new";
  let successes = 0;
  let consecutiveSuccesses = 0;
  let consecutiveFailures = 0;
  for (const attempt of attempts) {
    if (isSuccess(attempt)) {
      successes += 1;
      consecutiveSuccesses += 1;
      consecutiveFailures = 0;
      mastery =
        successes >= 5 && consecutiveSuccesses >= 3
          ? "mastered"
          : consecutiveSuccesses >= 2
            ? "strong"
            : "learning";
    } else {
      consecutiveSuccesses = 0;
      if (isSignificantFailure(attempt)) consecutiveFailures += 1;
      else consecutiveFailures = 0;
      if (
        (mastery === "strong" || mastery === "mastered") &&
        consecutiveFailures < 2
      )
        continue;
      mastery = isSignificantFailure(attempt) ? "needs_review" : "learning";
    }
  }

  const recent = attempts.slice(-config.recentAttemptLimit);
  const wordMap = new Map<number, WordErrorSummary>();
  for (const attempt of attempts) {
    for (const error of attempt.errors) {
      if (
        error.wordIndex === null ||
        (error.type !== "omission" && error.type !== "substitution_review")
      )
        continue;
      const current = wordMap.get(error.wordIndex) ?? {
        wordIndex: error.wordIndex,
        omissionCount: 0,
        substitutionReviewCount: 0,
        recentErrorCount: 0,
        lastErrorAt: attempt.timestamp,
      };
      if (error.type === "omission") current.omissionCount += 1;
      if (error.type === "substitution_review")
        current.substitutionReviewCount += 1;
      current.lastErrorAt = attempt.timestamp;
      wordMap.set(error.wordIndex, current);
    }
  }
  for (const attempt of recent) {
    for (const error of attempt.errors) {
      if (
        error.wordIndex !== null &&
        (error.type === "omission" || error.type === "substitution_review")
      ) {
        const summary = wordMap.get(error.wordIndex);
        if (summary) summary.recentErrorCount += 1;
      }
    }
  }
  const latest = attempts.at(-1) ?? null;
  return {
    surah,
    ayah,
    attempts: attempts.length,
    successfulCompletions: successes,
    consecutiveSuccesses,
    recentScores: recent.map(item => item.score),
    corrections: attempts.reduce((sum, item) => sum + item.errors.length, 0),
    lastPracticedAt: latest?.timestamp ?? null,
    lastSuccessfulAt:
      [...attempts].reverse().find(isSuccess)?.timestamp ?? null,
    mastery,
    nextReviewAt: latest ? scheduleNextReview(attempts, mastery, config) : null,
    wordErrors: Array.from(wordMap.values()).sort(
      (a, b) => a.wordIndex - b.wordIndex
    ),
  };
}

function addDays(timestamp: string, days: number): string {
  return new Date(
    new Date(timestamp).getTime() + days * 86_400_000
  ).toISOString();
}

export function scheduleNextReview(
  attempts: readonly MemorizationAttempt[],
  mastery: MasteryState,
  config = DEFAULT_MEMORIZATION_CONFIG
): string | null {
  const latest = attempts.at(-1);
  if (!latest) return null;
  const successes = attempts.filter(isSuccess).length;
  let days = config.intervalsDays.learning;
  if (isSuccess(latest)) {
    days =
      mastery === "mastered"
        ? config.intervalsDays.mastered
        : mastery === "strong" && successes >= 4
          ? config.intervalsDays.strong
          : successes >= 3
            ? config.intervalsDays.thirdSuccess
            : successes === 2
              ? config.intervalsDays.secondSuccess
              : config.intervalsDays.firstSuccess;
  }
  return addDays(latest.timestamp, days);
}

export type RecurringError = {
  kind: "repeated_omission" | "repeated_substitution";
  surah: number;
  ayah: number;
  wordIndex: number;
  occurrences: number;
};

export function findRecurringErrors(
  attempts: readonly MemorizationAttempt[],
  config = DEFAULT_MEMORIZATION_CONFIG
): RecurringError[] {
  const grouped = new Map<string, MemorizationAttempt[]>();
  for (const attempt of attempts) {
    const key = `${attempt.surah}:${attempt.ayah}`;
    grouped.set(key, [...(grouped.get(key) ?? []), attempt]);
  }
  const found: RecurringError[] = [];
  for (const group of Array.from(grouped.values())) {
    const recent = group
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .slice(-config.recurringWindow);
    for (const type of ["omission", "substitution_review"] as const) {
      const counts = new Map<number, number>();
      for (const attempt of recent)
        for (const error of attempt.errors)
          if (error.type === type && error.wordIndex !== null)
            counts.set(error.wordIndex, (counts.get(error.wordIndex) ?? 0) + 1);
      for (const [wordIndex, occurrences] of Array.from(counts.entries()))
        if (occurrences >= config.recurringThreshold)
          found.push({
            kind:
              type === "omission"
                ? "repeated_omission"
                : "repeated_substitution",
            surah: recent[0].surah,
            ayah: recent[0].ayah,
            wordIndex,
            occurrences,
          });
    }
  }
  return found.sort(
    (a, b) =>
      a.surah - b.surah ||
      a.ayah - b.ayah ||
      a.wordIndex - b.wordIndex ||
      a.kind.localeCompare(b.kind)
  );
}

export type ReviewReason =
  | "new_memorization"
  | "overdue_review"
  | "repeated_omission"
  | "repeated_substitution"
  | "low_mastery"
  | "recent_failure"
  | "scheduled_review";
export type ReviewRecommendation = {
  surah: number;
  ayah: number;
  priority: "high" | "medium" | "low";
  reason: ReviewReason;
  focusWordIndexes: number[];
  nextReviewAt: string | null;
};

export function buildReviewQueue(
  attempts: readonly MemorizationAttempt[],
  now = new Date(),
  newMemorization?: { surah: number; ayah: number }
): ReviewRecommendation[] {
  const keys = new Set(attempts.map(item => `${item.surah}:${item.ayah}`));
  if (newMemorization)
    keys.add(`${newMemorization.surah}:${newMemorization.ayah}`);
  const recurring = findRecurringErrors(attempts);
  return Array.from(keys)
    .map(key => {
      const [surah, ayah] = key.split(":").map(Number);
      const memory = deriveAyahMemory(surah, ayah, attempts);
      const errors = recurring.filter(
        item => item.surah === surah && item.ayah === ayah
      );
      const omission = errors.find(item => item.kind === "repeated_omission");
      const substitution = errors.find(
        item => item.kind === "repeated_substitution"
      );
      const due =
        memory.nextReviewAt !== null && new Date(memory.nextReviewAt) <= now;
      const overdueDays = memory.nextReviewAt
        ? Math.max(
            0,
            (now.getTime() - new Date(memory.nextReviewAt).getTime()) /
              86_400_000
          )
        : 0;
      const lastScore = memory.recentScores.at(-1);
      const reason: ReviewReason = omission
        ? "repeated_omission"
        : substitution
          ? "repeated_substitution"
          : memory.mastery === "new"
            ? "new_memorization"
            : lastScore !== undefined && lastScore < 70
              ? "recent_failure"
              : due
                ? "overdue_review"
                : memory.mastery === "needs_review" ||
                    memory.mastery === "learning"
                  ? "low_mastery"
                  : "scheduled_review";
      const score =
        (omission || substitution ? 500 : 0) +
        (due ? 300 + Math.min(100, overdueDays) : 0) +
        { new: 180, needs_review: 220, learning: 140, strong: 30, mastered: 0 }[
          memory.mastery
        ] +
        (lastScore !== undefined && lastScore < 70 ? 100 : 0);
      return {
        item: {
          surah,
          ayah,
          priority:
            score >= 400
              ? ("high" as const)
              : score >= 160
                ? ("medium" as const)
                : ("low" as const),
          reason,
          focusWordIndexes: errors
            .map(item => item.wordIndex)
            .sort((a, b) => a - b),
          nextReviewAt: memory.nextReviewAt,
        },
        score,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.surah - b.item.surah ||
        a.item.ayah - b.item.ayah
    )
    .map(({ item }) => item);
}

export function summarizeReview(
  attempts: readonly MemorizationAttempt[],
  now = new Date()
) {
  const queue = buildReviewQueue(attempts, now);
  const memories = Array.from(
    new Set(attempts.map(item => `${item.surah}:${item.ayah}`))
  ).map(key => {
    const [s, a] = key.split(":").map(Number);
    return deriveAyahMemory(s, a, attempts);
  });
  return {
    dueToday: queue.filter(
      item => item.nextReviewAt && new Date(item.nextReviewAt) <= now
    ),
    weakAyat: memories.filter(
      item => item.mastery === "learning" || item.mastery === "needs_review"
    ),
    strongOrMasteredCount: memories.filter(
      item => item.mastery === "strong" || item.mastery === "mastered"
    ).length,
    nextRecommended: queue[0] ?? null,
  };
}
