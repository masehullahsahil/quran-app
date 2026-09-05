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
    private readonly key = "miqra-memorization-history-v1",
    private readonly pendingKey = "miqra-memorization-pending-v1"
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

  pending(): MemorizationAttempt[] {
    try {
      const value = JSON.parse(this.storage.getItem(this.pendingKey) ?? "[]");
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }
  enqueue(attempt: MemorizationAttempt): void {
    const pending = this.pending();
    if (pending.some(item => item.id === attempt.id)) return;
    // A lightweight bounded retry queue, not an unbounded offline event log.
    this.storage.setItem(this.pendingKey, JSON.stringify([...pending, attempt].slice(-500)));
  }
  acknowledge(id: string): void {
    this.storage.setItem(this.pendingKey, JSON.stringify(this.pending().filter(item => item.id !== id)));
  }
  replace(attempts: MemorizationAttempt[]): void {
    const unique = Array.from(new Map(attempts.map(attempt => [attempt.id, attempt])).values());
    this.storage.setItem(this.key, JSON.stringify(unique));
  }
}
