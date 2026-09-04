import type { MemorizationAttempt } from "@shared/memorization";

export interface MemorizationHistoryRepository {
  list(): MemorizationAttempt[];
  save(attempt: MemorizationAttempt): boolean;
}

export class LocalMemorizationHistoryRepository
  implements MemorizationHistoryRepository
{
  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem">,
    private readonly key = "miqra-memorization-history-v1"
  ) {}
  list(): MemorizationAttempt[] {
    try {
      const value = JSON.parse(this.storage.getItem(this.key) ?? "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }
  save(attempt: MemorizationAttempt): boolean {
    const attempts = this.list();
    if (attempts.some(item => item.id === attempt.id)) return false;
    this.storage.setItem(this.key, JSON.stringify([...attempts, attempt]));
    return true;
  }
}
