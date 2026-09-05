import { describe, expect, it } from "vitest";
import { FIRST_LESSON_ID, QAIDA_LESSONS } from "@shared/qaidaCurriculum";
import type { MemorizationAttempt } from "@shared/memorization";
import { LocalMemorizationHistoryRepository } from "./memorizationHistory";
import {
  QAIDA_PROGRESS_KEY,
  readQaidaProgress,
  writeQaidaProgress,
  type QaidaProgress,
} from "./qaidaProgress";
import {
  synchronizeLearnerPersistence,
  type LearnerSnapshot,
} from "./learnerPersistence";

const attempt = (id: string, timestamp: string): MemorizationAttempt => ({
  id,
  sessionId: `session-${id}`,
  surah: 1,
  ayah: 1,
  timestamp,
  result: "completed",
  matchedCount: 4,
  totalExpectedWords: 4,
  score: 100,
  correctionWordIndexes: [],
  errors: [],
  attemptsRequired: 1,
  eventuallyAdvanced: true,
});
const store = (seed: Record<string, string> = {}) => {
  const data = new Map(Object.entries(seed));
  return {
    data,
    storage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    },
  };
};

describe("signed-in learner persistence across sessions", () => {
  it("merges stale session B with newer server state without moving Qaida backwards or resetting locale", async () => {
    const serverAttempts = [
      attempt("server-attempt", "2026-01-02T00:00:00.000Z"),
    ];
    const later = QAIDA_LESSONS[2].id;
    const { data, storage } = store({
      "miqra-locale": "ur",
      [QAIDA_PROGRESS_KEY]: JSON.stringify({
        completedLessons: [],
        currentLessonId: FIRST_LESSON_ID,
      }),
    });
    const repository = new LocalMemorizationHistoryRepository(
      storage as Storage
    );
    const sync = async (input: {
      qaida: QaidaProgress;
      memorizationAttempts: Array<MemorizationAttempt & { stability: "final" }>;
    }): Promise<LearnerSnapshot> => ({
      qaida: {
        completedLessons: Array.from(
          new Set([FIRST_LESSON_ID, ...input.qaida.completedLessons])
        ),
        currentLessonId: later,
      },
      memorizationAttempts: Array.from(
        new Map(
          [...serverAttempts, ...input.memorizationAttempts].map(item => [
            item.id,
            item,
          ])
        ).values()
      ),
    });

    await synchronizeLearnerPersistence(repository, sync, storage as Storage);

    expect(readQaidaProgress(storage as Storage)).toEqual({
      completedLessons: [FIRST_LESSON_ID],
      currentLessonId: later,
    });
    expect(repository.list()).toEqual(serverAttempts);
    expect(data.get("miqra-locale")).toBe("ur");
  });

  it("uploads newer local progress and a pending attempt, then safely deduplicates the retry", async () => {
    const { storage } = store();
    const repository = new LocalMemorizationHistoryRepository(
      storage as Storage
    );
    const localAttempt = attempt("local-attempt", "2026-01-03T00:00:00.000Z");
    repository.save(localAttempt);
    repository.enqueue(localAttempt);
    const later = QAIDA_LESSONS[3].id;
    writeQaidaProgress(
      { completedLessons: [FIRST_LESSON_ID], currentLessonId: later },
      storage as Storage
    );
    const durable = new Map<string, MemorizationAttempt>();
    let serverQaida = {
      completedLessons: [] as string[],
      currentLessonId: FIRST_LESSON_ID,
    };
    const sync = async (input: {
      qaida: QaidaProgress;
      memorizationAttempts: Array<MemorizationAttempt & { stability: "final" }>;
    }): Promise<LearnerSnapshot> => {
      input.memorizationAttempts.forEach(item => durable.set(item.id, item));
      serverQaida = {
        completedLessons: Array.from(
          new Set([
            ...serverQaida.completedLessons,
            ...input.qaida.completedLessons,
          ])
        ),
        currentLessonId: later,
      };
      return {
        qaida: serverQaida,
        memorizationAttempts: [...durable.values()],
      };
    };

    await expect(
      synchronizeLearnerPersistence(
        repository,
        async () => {
          throw new Error("offline");
        },
        storage as Storage
      )
    ).rejects.toThrow("offline");
    expect(repository.pending()).toEqual([localAttempt]);
    expect(repository.list()).toEqual([localAttempt]);
    await synchronizeLearnerPersistence(repository, sync, storage as Storage);
    await synchronizeLearnerPersistence(repository, sync, storage as Storage);

    expect(repository.pending()).toEqual([]);
    expect(durable.size).toBe(1);
    expect(readQaidaProgress(storage as Storage)).toEqual({
      completedLessons: [FIRST_LESSON_ID],
      currentLessonId: later,
    });
  });
});
