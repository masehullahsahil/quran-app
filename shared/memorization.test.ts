import { describe, expect, it } from "vitest";
import {
  buildReviewQueue,
  deriveAyahMemory,
  findRecurringErrors,
  type MemorizationAttempt,
} from "./memorization";

const at = (day: number) => new Date(Date.UTC(2026, 0, day)).toISOString();
function attempt(
  id: string,
  day: number,
  options: Partial<MemorizationAttempt> = {}
): MemorizationAttempt {
  return {
    id,
    sessionId: `session-${id}`,
    surah: 1,
    ayah: 1,
    timestamp: at(day),
    result: "completed",
    matchedCount: 4,
    totalExpectedWords: 4,
    score: 100,
    correctionWordIndexes: [],
    errors: [],
    attemptsRequired: 1,
    eventuallyAdvanced: true,
    ...options,
  };
}

describe("deterministic memorization mastery", () => {
  it("starts new, then keeps a first success in learning", () => {
    expect(deriveAyahMemory(1, 1, []).mastery).toBe("new");
    expect(deriveAyahMemory(1, 1, [attempt("a", 1)]).mastery).toBe("learning");
  });

  it("moves a first failed attempt to needs_review", () => {
    expect(
      deriveAyahMemory(1, 1, [
        attempt("a", 1, {
          result: "uncertain",
          score: 20,
          eventuallyAdvanced: false,
        }),
      ]).mastery
    ).toBe("needs_review");
  });

  it("strengthens repeated successful reviews without prematurely mastering", () => {
    const attempts = [1, 2, 3, 4, 5].map(day => attempt(String(day), day));
    expect(deriveAyahMemory(1, 1, attempts.slice(0, 2)).mastery).toBe("strong");
    expect(deriveAyahMemory(1, 1, attempts.slice(0, 4)).mastery).toBe("strong");
    expect(deriveAyahMemory(1, 1, attempts).mastery).toBe("mastered");
  });

  it("requires repeated significant failures to erase strong history", () => {
    const good = [attempt("a", 1), attempt("b", 2)];
    const failure = (id: string, day: number) =>
      attempt(id, day, {
        result: "uncertain",
        score: 30,
        eventuallyAdvanced: false,
      });
    expect(deriveAyahMemory(1, 1, [...good, failure("c", 3)]).mastery).toBe(
      "strong"
    );
    expect(
      deriveAyahMemory(1, 1, [...good, failure("c", 3), failure("d", 4)])
        .mastery
    ).toBe("needs_review");
  });
});

describe("scheduling and recommendation", () => {
  it("uses 1, 3, and 7 day successful intervals and resets failure to now", () => {
    const a = attempt("a", 1);
    const b = attempt("b", 2);
    const c = attempt("c", 3);
    expect(deriveAyahMemory(1, 1, [a]).nextReviewAt).toBe(at(2));
    expect(deriveAyahMemory(1, 1, [a, b]).nextReviewAt).toBe(at(5));
    expect(deriveAyahMemory(1, 1, [a, b, c]).nextReviewAt).toBe(at(10));
    expect(
      deriveAyahMemory(1, 1, [
        a,
        b,
        attempt("f", 4, { result: "uncertain", score: 10 }),
      ]).nextReviewAt
    ).toBe(at(4));
  });

  it("raises overdue weak work above strong future work and excludes future from due reasoning", () => {
    const weak = attempt("weak", 1, {
      ayah: 2,
      result: "uncertain",
      score: 20,
    });
    const strong = [
      attempt("s1", 9, { ayah: 1 }),
      attempt("s2", 10, { ayah: 1 }),
    ];
    const queue = buildReviewQueue([weak, ...strong], new Date(at(11)));
    expect(queue[0]).toMatchObject({
      ayah: 2,
      priority: "high",
      reason: "recent_failure",
    });
    expect(queue.find(item => item.ayah === 1)?.reason).toBe(
      "scheduled_review"
    );
  });

  it("represents new memorization, has stable Quran-order ties, and handles empty history", () => {
    expect(buildReviewQueue([])).toEqual([]);
    expect(
      buildReviewQueue([], new Date(at(2)), { surah: 2, ayah: 3 })[0]
    ).toMatchObject({ reason: "new_memorization" });
    const tied = [
      attempt("b", 1, { ayah: 2, result: "partial", score: 80 }),
      attempt("a", 1, { ayah: 1, result: "partial", score: 80 }),
    ];
    expect(
      buildReviewQueue(tied, new Date(at(1))).map(item => item.ayah)
    ).toEqual([1, 2]);
  });
});

describe("textual error memory", () => {
  it("detects repeated omission and substitution at one-based Quran word indexes", () => {
    const attempts = [1, 2, 3].flatMap(day => [
      attempt(`o${day}`, day, {
        errors: [{ type: "omission", wordIndex: 4 }],
        correctionWordIndexes: [4],
        score: 75,
        result: "partial",
      }),
      attempt(`r${day}`, day, {
        ayah: 2,
        errors: [{ type: "substitution_review", wordIndex: 3 }],
        correctionWordIndexes: [3],
        score: 75,
        result: "partial",
      }),
    ]);
    expect(findRecurringErrors(attempts)).toEqual([
      {
        kind: "repeated_omission",
        surah: 1,
        ayah: 1,
        wordIndex: 4,
        occurrences: 3,
      },
      {
        kind: "repeated_substitution",
        surah: 1,
        ayah: 2,
        wordIndex: 3,
        occurrences: 3,
      },
    ]);
    expect(buildReviewQueue(attempts, new Date(at(3)))[0].priority).toBe(
      "high"
    );
  });

  it("does not create word error summaries for correct words or unanchored extras", () => {
    const memory = deriveAyahMemory(1, 1, [
      attempt("a", 1),
      attempt("b", 2, { errors: [{ type: "extra", wordIndex: null }] }),
    ]);
    expect(memory.wordErrors).toEqual([]);
  });
});
