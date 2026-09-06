import { describe, expect, it } from "vitest";
import { LocalMemorizationHistoryRepository } from "./memorizationHistory";
import type { MemorizationAttempt } from "@shared/memorization";

const value: MemorizationAttempt = {
  id: "final-1",
  sessionId: "session-1",
  surah: 1,
  ayah: 1,
  timestamp: "2026-01-01T00:00:00.000Z",
  result: "completed",
  matchedCount: 4,
  totalExpectedWords: 4,
  score: 100,
  correctionWordIndexes: [],
  errors: [],
  attemptsRequired: 1,
  eventuallyAdvanced: true,
};

describe("memorization history repository", () => {
  it("persists attempts and makes duplicate finalized outcomes idempotent", () => {
    const data = new Map<string, string>();
    const repository = new LocalMemorizationHistoryRepository({
      getItem: key => data.get(key) ?? null,
      setItem: (key, item) => {
        data.set(key, item);
      },
    });
    expect(repository.save(value)).toBe(true);
    expect(repository.save(value)).toBe(false);
    expect(repository.list()).toEqual([value]);
  });

  it("stores no history unless the finalized outcome is explicitly saved", () => {
    const data = new Map<string, string>();
    const repository = new LocalMemorizationHistoryRepository({
      getItem: key => data.get(key) ?? null,
      setItem: (key, item) => {
        data.set(key, item);
      },
    });
    // Interim and duplicate live chunks never call this repository.
    expect(repository.list()).toEqual([]);
  });

  it("keeps a failed write queued until it is acknowledged", () => {
    const data = new Map<string, string>();
    const repository = new LocalMemorizationHistoryRepository({
      getItem: key => data.get(key) ?? null,
      setItem: (key, item) => { data.set(key, item); },
    });
    repository.save(value);
    repository.enqueue(value);
    repository.enqueue(value);
    expect(repository.pending()).toEqual([value]);
    repository.acknowledge(value.id);
    expect(repository.pending()).toEqual([]);
    expect(repository.list()).toEqual([value]);
  });

  it("deduplicates a merged server snapshot", () => {
    const data = new Map<string, string>();
    const repository = new LocalMemorizationHistoryRepository({
      getItem: key => data.get(key) ?? null,
      setItem: (key, item) => { data.set(key, item); },
    });
    repository.replace([value, value]);
    expect(repository.list()).toEqual([value]);
  });

  it("bounds the retry queue and retains the newest 500 attempts", () => {
    const data = new Map<string, string>();
    const repository = new LocalMemorizationHistoryRepository({
      getItem: key => data.get(key) ?? null,
      setItem: (key, item) => { data.set(key, item); },
    });
    for (let index = 0; index < 501; index += 1) repository.enqueue({ ...value, id: `attempt-${index}` });
    expect(repository.pending()).toHaveLength(500);
    expect(repository.pending()[0]?.id).toBe("attempt-1");
    expect(repository.pending().at(-1)?.id).toBe("attempt-500");
  });
});
