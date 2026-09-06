/**
 * Where a teacher's review records live while the audit is in progress.
 *
 * Deliberately the same shape as the rest of the app's local state: a JSON
 * value in localStorage, parsed defensively, written on change. Two reasons it
 * is not in the database. The audit is a document a named person signs, so it
 * has to be exportable as a file they can keep, attach to an email and hand
 * back — not a row only this app can read. And review records must never sit in
 * the same store as curriculum content, where an editing tool could later treat
 * them as one thing; keeping them in a separate, exportable ledger makes that
 * mistake impossible rather than merely discouraged.
 *
 * Nothing here can approve anything. The store round-trips records that
 * `recordReview` has already validated, and a record that arrives malformed —
 * from an older build, a hand-edited file, or an import from elsewhere — is
 * dropped rather than trusted.
 */
import {
  AUDIT_CATEGORIES,
  CORRECTION_IMPACTS,
  EMPTY_LEDGER,
  REVIEW_SEVERITIES,
  REVIEW_STATUSES,
  type AuditLedger,
  type Reviewer,
  type ReviewRecord,
} from "@shared/curriculumAudit";

export const AUDIT_LEDGER_KEY = "miqra-curriculum-audit";

/** Just enough of the Storage interface to be faked in a test. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isMember = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

/**
 * Validates one stored record.
 *
 * The checks mirror `recordReview`, because a record read back from storage has
 * exactly the same weight as one just written: an approval with no attestation
 * or no named reviewer is not an approval, wherever it came from.
 */
export function parseRecord(value: unknown): ReviewRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<ReviewRecord> & { reviewer?: Partial<ReviewRecord["reviewer"]> };

  if (!isNonEmptyString(record.itemId)) return null;
  if (!isMember(REVIEW_STATUSES, record.status)) return null;
  if (!isMember(AUDIT_CATEGORIES, record.category)) return null;
  if (!isMember(REVIEW_SEVERITIES, record.severity)) return null;
  if (!isMember(CORRECTION_IMPACTS, record.impact)) return null;
  if (typeof record.comment !== "string") return null;
  if (!isNonEmptyString(record.reviewedAt)) return null;
  if (!record.reviewer || !isNonEmptyString(record.reviewer.name)) return null;

  const approved = record.status === "approved";
  if (approved && !(isNonEmptyString(record.attestation) && isNonEmptyString(record.reviewer.qualification))) {
    return null;
  }

  return {
    itemId: record.itemId,
    status: record.status,
    category: record.category,
    severity: record.severity,
    comment: record.comment,
    ...(isNonEmptyString(record.proposedCorrection) ? { proposedCorrection: record.proposedCorrection } : {}),
    impact: record.impact,
    reviewer: {
      name: record.reviewer.name,
      ...(isNonEmptyString(record.reviewer.identifier) ? { identifier: record.reviewer.identifier } : {}),
      ...(isNonEmptyString(record.reviewer.qualification) ? { qualification: record.reviewer.qualification } : {}),
    },
    reviewedAt: record.reviewedAt,
    ...(isNonEmptyString(record.attestation) ? { attestation: record.attestation } : {}),
  };
}

export function parseLedger(raw: string | null): AuditLedger {
  if (!raw) return { ...EMPTY_LEDGER, records: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    const records = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? (parsed as { records?: unknown }).records
        : null;
    if (!Array.isArray(records)) return { records: [] };
    return { records: records.map(parseRecord).filter((record): record is ReviewRecord => record !== null) };
  } catch {
    return { records: [] };
  }
}

export function serializeLedger(ledger: AuditLedger): string {
  return JSON.stringify(ledger, null, 2);
}

function safeStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readLedger(storage: StorageLike | undefined = safeStorage()): AuditLedger {
  if (!storage) return { records: [] };
  try {
    return parseLedger(storage.getItem(AUDIT_LEDGER_KEY));
  } catch {
    return { records: [] };
  }
}

export function writeLedger(ledger: AuditLedger, storage: StorageLike | undefined = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(AUDIT_LEDGER_KEY, serializeLedger(ledger));
  } catch {
    // A full or blocked store must not lose the review in progress on screen;
    // the export button is the reviewer's durable copy either way.
  }
}

/** Appends a record. Earlier records are kept, so the audit shows its history. */
export function appendRecord(ledger: AuditLedger, record: ReviewRecord): AuditLedger {
  return { records: [...ledger.records, record] };
}

/** Merges an imported ledger, dropping duplicates of records already held. */
export function mergeLedgers(current: AuditLedger, incoming: AuditLedger): AuditLedger {
  const seen = new Set(current.records.map((record) => JSON.stringify(record)));
  const added = incoming.records.filter((record) => !seen.has(JSON.stringify(record)));
  return { records: [...current.records, ...added] };
}

/**
 * The reviewer's own details, stored under their own key.
 *
 * Kept apart from both the curriculum and the ledger: it is a fact about a
 * person, it is convenience only (so a reviewer does not retype their name on
 * every item), and a review record carries its own copy of it at the moment it
 * was made — so editing this later cannot rewrite the attribution of a review
 * already recorded.
 */
export const AUDIT_REVIEWER_KEY = "miqra-curriculum-audit-reviewer";

export function parseReviewer(raw: string | null): Reviewer {
  if (!raw) return { name: "" };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { name: "" };
    const record = parsed as Partial<Reviewer>;
    return {
      name: typeof record.name === "string" ? record.name : "",
      ...(isNonEmptyString(record.identifier) ? { identifier: record.identifier } : {}),
      ...(isNonEmptyString(record.qualification) ? { qualification: record.qualification } : {}),
    };
  } catch {
    return { name: "" };
  }
}

export function readReviewer(storage: StorageLike | undefined = safeStorage()): Reviewer {
  if (!storage) return { name: "" };
  try {
    return parseReviewer(storage.getItem(AUDIT_REVIEWER_KEY));
  } catch {
    return { name: "" };
  }
}

export function writeReviewer(reviewer: Reviewer, storage: StorageLike | undefined = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(AUDIT_REVIEWER_KEY, JSON.stringify(reviewer));
  } catch {
    // Convenience only — losing it costs the reviewer a retype, nothing more.
  }
}
