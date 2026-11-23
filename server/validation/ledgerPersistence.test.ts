/**
 * Unit tests for the persisted validation ledger (server/validation/ledgerPersistence.ts).
 *
 * Everything here writes to tmp dirs only. The default directory
 * (<repo-root>/.validation-ledgers) is resolved but never written to by
 * these tests — the write tests always pass an explicit env dir.
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ValidationLedger,
  captureBuildInfo,
  createRunId,
} from "./validationRun";
import {
  LEDGER_DIR_ENV_VAR,
  finalLedgerFileName,
  finalLedgerPath,
  liveLedgerFileName,
  liveLedgerPath,
  persistFinalLedger,
  persistLiveLedger,
  resolveLedgerDir,
} from "./ledgerPersistence";

const savedEnv = { ...process.env };
const repoRoot = path.resolve(__dirname, "../..");

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ledger-persistence-"));
  // Keep failure-path logging out of the test output.
  process.env = { ...savedEnv, LOG_LEVEL: "error" };
});

afterEach(() => {
  process.env = { ...savedEnv };
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

function makeExport(runId: string, eventCount = 1) {
  const ledger = new ValidationLedger({
    runId,
    build: captureBuildInfo(),
    deviceMetadata: {},
  });
  for (let i = 0; i < eventCount; i++) ledger.record("note", { i });
  return ledger.toJSON();
}

describe("resolveLedgerDir", () => {
  it("honors the env override, absolute or relative-to-CWD", () => {
    expect(resolveLedgerDir({ [LEDGER_DIR_ENV_VAR]: "/tmp/ledgers" })).toBe("/tmp/ledgers");
    expect(resolveLedgerDir({ [LEDGER_DIR_ENV_VAR]: "relative/ledgers" })).toBe(
      path.resolve("relative/ledgers"),
    );
    expect(resolveLedgerDir({ [LEDGER_DIR_ENV_VAR]: "   " })).toBeNull();
  });

  it("defaults to <repo-root>/.validation-ledgers when the staff API is on", () => {
    expect(resolveLedgerDir({ QURAN_VALIDATION_STAFF_API: "1" })).toBe(
      path.join(repoRoot, ".validation-ledgers"),
    );
  });

  it("is disabled when the staff API is off and no env dir is set", () => {
    expect(resolveLedgerDir({})).toBeNull();
    expect(resolveLedgerDir({ QURAN_VALIDATION_STAFF_API: "0" })).toBeNull();
    expect(resolveLedgerDir({ QURAN_VALIDATION_STAFF_API: "true" })).toBeNull();
  });
});

describe("persistLiveLedger", () => {
  it("writes valid JSON on every mutation and leaves no temp files", () => {
    const runId = createRunId();
    const env = { [LEDGER_DIR_ENV_VAR]: dir };
    expect(persistLiveLedger(runId, makeExport(runId, 1), env)).toBe(true);
    const target = path.join(dir, runId, liveLedgerFileName(runId));
    expect(JSON.parse(readFileSync(target, "utf8")).eventCount).toBe(1);
    expect(persistLiveLedger(runId, makeExport(runId, 3), env)).toBe(true);
    expect(JSON.parse(readFileSync(target, "utf8")).eventCount).toBe(3);
    expect(readdirSync(path.join(dir, runId))).toEqual([liveLedgerFileName(runId)]);
  });

  it("refuses malformed run IDs without throwing or writing outside the dir", () => {
    const env = { [LEDGER_DIR_ENV_VAR]: dir };
    for (const bad of ["../evil", "run_xxx", "", "run_0123456789abcdef01234567/..", "..\\evil"]) {
      expect(persistLiveLedger(bad, makeExport(createRunId()), env)).toBe(false);
      expect(persistFinalLedger(bad, { runId: bad, deactivated: true, ledger: makeExport(createRunId()) }, env)).toBe(false);
    }
    expect(readdirSync(dir)).toEqual([]);
    expect(liveLedgerPath("../evil", env)).toBeNull();
    expect(finalLedgerPath("", env)).toBeNull();
  });

  it("returns false without throwing when the directory is unwritable", () => {
    const blocker = path.join(dir, "blocker");
    writeFileSync(blocker, "x");
    const env = { [LEDGER_DIR_ENV_VAR]: path.join(blocker, "ledgers") };
    const runId = createRunId();
    expect(persistLiveLedger(runId, makeExport(runId), env)).toBe(false);
    expect(persistFinalLedger(runId, { runId, deactivated: true, ledger: makeExport(runId) }, env)).toBe(false);
  });

  it("does nothing when persistence is disabled", () => {
    const runId = createRunId();
    expect(persistLiveLedger(runId, makeExport(runId), {})).toBe(false);
    expect(persistFinalLedger(runId, { runId, deactivated: true, ledger: makeExport(runId) }, {})).toBe(false);
    // Nothing was created for this run under the default directory.
    expect(existsSync(path.join(repoRoot, ".validation-ledgers", runId))).toBe(false);
  });
});

describe("persistFinalLedger", () => {
  it("writes the envelope once and never overwrites it", () => {
    const runId = createRunId();
    const env = { [LEDGER_DIR_ENV_VAR]: dir };
    const first = { runId, deactivated: true as const, ledger: makeExport(runId, 2) };
    expect(persistFinalLedger(runId, first, env)).toBe(true);
    const target = path.join(dir, runId, finalLedgerFileName(runId));
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual(JSON.parse(JSON.stringify(first)));
    // A second write — even with different content — leaves the file alone.
    const second = { runId, deactivated: true as const, ledger: makeExport(runId, 9) };
    expect(persistFinalLedger(runId, second, env)).toBe(false);
    expect(JSON.parse(readFileSync(target, "utf8")).ledger.eventCount).toBe(2);
  });

  it("refuses an envelope whose runId does not match the path", () => {
    const runId = createRunId();
    const env = { [LEDGER_DIR_ENV_VAR]: dir };
    expect(
      persistFinalLedger(runId, { runId: createRunId(), deactivated: true, ledger: makeExport(runId) }, env),
    ).toBe(false);
    expect(existsSync(path.join(dir, runId))).toBe(false);
  });

  it("creates the run directory on demand", () => {
    const runId = createRunId();
    const env = { [LEDGER_DIR_ENV_VAR]: dir };
    expect(existsSync(path.join(dir, runId))).toBe(false);
    expect(persistLiveLedger(runId, makeExport(runId), env)).toBe(true);
    expect(existsSync(path.join(dir, runId, liveLedgerFileName(runId)))).toBe(true);
  });
});
