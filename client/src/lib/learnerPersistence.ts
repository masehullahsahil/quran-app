import type { MemorizationAttempt } from "@shared/memorization";
import type { QaidaProgress, StorageLike } from "./qaidaProgress";
import { readQaidaProgress, writeQaidaProgress } from "./qaidaProgress";
import type { LocalMemorizationHistoryRepository } from "./memorizationHistory";

export type LearnerSnapshot = {
  qaida: QaidaProgress & { updatedAt?: string | null };
  memorizationAttempts: MemorizationAttempt[];
};

/** One deterministic sign-in/reconnect pass. Local data is only cleared after the merged snapshot arrives. */
export async function synchronizeLearnerPersistence(
  repository: LocalMemorizationHistoryRepository,
  sync: (input: {
    qaida: QaidaProgress;
    memorizationAttempts: Array<MemorizationAttempt & { stability: "final" }>;
  }) => Promise<LearnerSnapshot>,
  storage?: StorageLike
): Promise<LearnerSnapshot> {
  const pending = repository.pending();
  const attempts = Array.from(
    new Map(
      [...repository.list(), ...pending].map(attempt => [attempt.id, attempt])
    ).values()
  );
  const snapshot = await sync({
    qaida: readQaidaProgress(storage),
    memorizationAttempts: attempts.map(attempt => ({
      ...attempt,
      stability: "final" as const,
    })),
  });
  repository.replace(snapshot.memorizationAttempts);
  pending.forEach(attempt => repository.acknowledge(attempt.id));
  writeQaidaProgress(snapshot.qaida, storage);
  return snapshot;
}
