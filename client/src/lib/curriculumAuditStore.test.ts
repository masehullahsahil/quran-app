/**
 * The review ledger's storage rules.
 *
 * The point of these is what happens to a record that did *not* come from the
 * review form: a file someone edited by hand, an export from another machine, a
 * value left by an older build. An approval is the one record worth forging, so
 * the parser applies the same conditions the recorder does, and a record that
 * fails them is dropped rather than shown as a teacher's sign-off.
 */
import { describe, expect, it } from "vitest";
import {
  AUDIT_LEDGER_KEY,
  AUDIT_REVIEWER_KEY,
  appendRecord,
  mergeLedgers,
  parseLedger,
  parseRecord,
  parseReviewer,
  readLedger,
  readReviewer,
  serializeLedger,
  writeLedger,
  writeReviewer,
} from "./curriculumAuditStore";
import { provenanceOf, recordReview, statusOf, type ReviewRecord } from "@shared/curriculumAudit";

const teacher = { name: "Reviewer Under Test", qualification: "Qaida teacher" };

const approved: ReviewRecord = recordReview({
  itemId: "objective:harakat-fatha",
  status: "approved",
  category: "beginner-clarity",
  comment: "Accepted as written.",
  reviewer: teacher,
  reviewedAt: "2026-01-15T09:00:00.000Z",
  attestation: "I approve this item as a qualified teacher.",
});

const correction: ReviewRecord = recordReview({
  itemId: "teaching:harakat-fatha",
  status: "correction-requested",
  category: "tajweed-terminology",
  severity: "major",
  impact: "curriculum-logic",
  comment: "This needs rewording before it is taught.",
  reviewer: teacher,
  reviewedAt: "2026-01-16T09:00:00.000Z",
});

function fakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

describe("the review ledger round-trips", () => {
  it("writes and reads a record unchanged", () => {
    const storage = fakeStorage();
    writeLedger({ records: [correction] }, storage);
    const read = readLedger(storage);

    expect(read.records).toEqual([correction]);
    expect(statusOf(correction.itemId, read)).toBe("correction-requested");
    expect(provenanceOf(correction.itemId, read)).toBe("teacher-reviewed");
  });

  it("reads an empty, absent or corrupt store as an empty ledger", () => {
    expect(parseLedger(null).records).toEqual([]);
    expect(parseLedger("not json").records).toEqual([]);
    expect(parseLedger('{"records":"nope"}').records).toEqual([]);
    expect(readLedger(undefined).records).toEqual([]);
    expect(readLedger(fakeStorage({ [AUDIT_LEDGER_KEY]: "{" })).records).toEqual([]);
  });

  it("accepts a bare array, as an exported file might carry", () => {
    expect(parseLedger(JSON.stringify([correction])).records).toEqual([correction]);
  });

  it("keeps earlier records when a later one is appended", () => {
    const ledger = appendRecord(appendRecord({ records: [] }, correction), approved);
    expect(ledger.records).toHaveLength(2);
    expect(statusOf(correction.itemId, ledger)).toBe("correction-requested");
    expect(statusOf(approved.itemId, ledger)).toBe("approved");
  });

  it("merges an imported file without duplicating what is already held", () => {
    const current = { records: [correction] };
    const merged = mergeLedgers(current, { records: [correction, approved] });
    expect(merged.records).toEqual([correction, approved]);
  });

  it("serialises as readable JSON, so a reviewer can keep the file", () => {
    expect(serializeLedger({ records: [approved] })).toContain("\n");
    expect(JSON.parse(serializeLedger({ records: [approved] }))).toEqual({ records: [approved] });
  });
});

describe("a forged approval is not an approval", () => {
  it("drops a stored approval with no attestation", () => {
    const forged = { ...approved, attestation: undefined };
    expect(parseRecord(forged)).toBeNull();
    expect(parseLedger(JSON.stringify({ records: [forged] })).records).toEqual([]);
  });

  it("drops a stored approval whose reviewer has no recorded qualification", () => {
    expect(parseRecord({ ...approved, reviewer: { name: "Anonymous" } })).toBeNull();
  });

  it("drops a record with no reviewer, no date or an unknown status", () => {
    expect(parseRecord({ ...correction, reviewer: { name: "" } })).toBeNull();
    expect(parseRecord({ ...correction, reviewedAt: "" })).toBeNull();
    expect(parseRecord({ ...correction, status: "auto-approved" })).toBeNull();
    expect(parseRecord({ ...correction, category: "vibes" })).toBeNull();
    expect(parseRecord({ ...correction, impact: "everything" })).toBeNull();
    expect(parseRecord(null)).toBeNull();
    expect(parseRecord(["approved"])).toBeNull();
  });

  it("keeps the valid records when one entry in a file is bad", () => {
    const raw = JSON.stringify({ records: [{ ...approved, attestation: undefined }, correction] });
    expect(parseLedger(raw).records).toEqual([correction]);
  });

  it("survives a storage that refuses to write", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(() => writeLedger({ records: [approved] }, throwing)).not.toThrow();
    expect(() => writeReviewer(teacher, throwing)).not.toThrow();
  });
});

describe("the reviewer's details are stored apart from the ledger", () => {
  it("uses its own key, and carries no review data", () => {
    const storage = fakeStorage();
    writeReviewer({ name: "A Teacher", identifier: "t@example.org", qualification: "Qari" }, storage);

    expect(storage.values.has(AUDIT_REVIEWER_KEY)).toBe(true);
    expect(storage.values.has(AUDIT_LEDGER_KEY)).toBe(false);
    expect(readReviewer(storage)).toEqual({ name: "A Teacher", identifier: "t@example.org", qualification: "Qari" });
  });

  it("reads an absent or corrupt value as an unnamed reviewer", () => {
    expect(parseReviewer(null)).toEqual({ name: "" });
    expect(parseReviewer("[]")).toEqual({ name: "" });
    expect(parseReviewer("{")).toEqual({ name: "" });
    expect(readReviewer(undefined)).toEqual({ name: "" });
  });

  it("does not let a later rename rewrite a review already recorded", () => {
    const storage = fakeStorage();
    writeLedger({ records: [approved] }, storage);
    writeReviewer({ name: "Someone Else", qualification: "Qari" }, storage);

    expect(readLedger(storage).records[0].reviewer.name).toBe(teacher.name);
  });
});
