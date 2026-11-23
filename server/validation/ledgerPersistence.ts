/**
 * Filesystem persistence for the server validation ledger (staff server only).
 *
 * The active-run registry in `liveObservation.ts` is process-local memory:
 * if the staff server stops before the operator downloads the ledger, the
 * run's evidence is gone (the September 2026 loss). This module is the
 * server-side equivalent of the client validation log, which already
 * persists to sessionStorage: every ledger mutation rewrites a live file,
 * and deactivation writes a `-final` file once.
 *
 * Staff-only and inert everywhere else:
 * - The directory comes from `QURAN_VALIDATION_LEDGER_DIR` when set, else
 *   from the default `<repo-root>/.validation-ledgers` — but only when the
 *   staff API is enabled (`QURAN_VALIDATION_STAFF_API=1`). With the staff
 *   API off and no env dir set, persistence is DISABLED: no directories are
 *   created and no files are written. Production/Vercel deployments never
 *   enable the staff API, so this module never activates there.
 * - No run can exist without the staff API (activation is a staff endpoint),
 *   so even an explicitly set env dir cannot persist anything on a server
 *   that never activates a run.
 *
 * Failure semantics (hard requirement): persistence is best-effort and must
 * NEVER throw and NEVER fail a request. A failed disk write logs via the
 * existing `logger` and the run continues in memory.
 *
 * No automatic deletion: staff delete a run's directory when its evidence
 * is no longer needed (see docs/wave0-rehearsal.md). The ledger payload is
 * sanitizer-enforced (no audio, no transcripts, no Quran text, no secrets,
 * no PII) and the files live on the staff operator's own machine.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isRunId, type ValidationLedgerExport } from "./validationRun";
import { logger } from "../_core/logger";

/** Env var overriding the ledger directory (absolute or relative-to-CWD). */
export const LEDGER_DIR_ENV_VAR = "QURAN_VALIDATION_LEDGER_DIR";

/**
 * Staff-API env var name. Mirrors `STAFF_API_ENV_VAR` in liveObservation.ts;
 * kept as a local literal so this module does not import from the module
 * that imports it (no module cycle).
 */
const STAFF_API_ENV_VAR = "QURAN_VALIDATION_STAFF_API";

/** Default ledger directory name under the repo root. */
export const DEFAULT_LEDGER_DIR_NAME = ".validation-ledgers";

/** The deactivation envelope: exactly what POST /deactivate returns. */
export type ValidationDeactivationExport = {
  runId: string;
  deactivated: true;
  ledger: ValidationLedgerExport;
};

function findRepoRoot(): string {
  // Same walk-up pattern as readAppVersion() in validationRun.ts: walk up
  // from this module to the package.json.
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let depth = 0; depth < 6; depth++) {
      try {
        const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
          name?: string;
          version?: string;
        };
        if (pkg.name && typeof pkg.version === "string") return dir;
      } catch {
        // Keep walking up.
      }
      dir = path.dirname(dir);
    }
  } catch {
    // Fall through to process.cwd().
  }
  return process.cwd();
}

/**
 * Resolves the ledger directory, or null when persistence is disabled
 * (staff API off and no env dir set). An explicitly set env dir is honored
 * even with the staff API off — but no run can exist without the staff API,
 * so nothing is ever written in that case.
 */
export function resolveLedgerDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env[LEDGER_DIR_ENV_VAR]?.trim();
  if (override) return path.resolve(override);
  if (env[STAFF_API_ENV_VAR] !== "1") return null;
  return path.join(findRepoRoot(), DEFAULT_LEDGER_DIR_NAME);
}

/** Live file: the raw ledger export, rewritten on every ledger mutation. */
export function liveLedgerFileName(runId: string): string {
  return `quran-validation-server-${runId}.json`;
}

/** Final file: the deactivation envelope, written once on deactivate. */
export function finalLedgerFileName(runId: string): string {
  return `quran-validation-server-${runId}-final.json`;
}

/** Absolute path of the live file for a run, or null when disabled. */
export function liveLedgerPath(runId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isRunId(runId)) return null;
  const dir = resolveLedgerDir(env);
  return dir ? path.join(dir, runId, liveLedgerFileName(runId)) : null;
}

/** Absolute path of the final file for a run, or null when disabled. */
export function finalLedgerPath(runId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isRunId(runId)) return null;
  const dir = resolveLedgerDir(env);
  return dir ? path.join(dir, runId, finalLedgerFileName(runId)) : null;
}

/**
 * Writes JSON atomically: temp file in the same directory + rename, so a
 * crash can never leave a torn file. Throws on failure; callers catch.
 */
function atomicWriteJson(targetPath: string, value: unknown): void {
  const dir = path.dirname(targetPath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.${path.basename(targetPath)}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`,
  );
  try {
    writeFileSync(tmpPath, JSON.stringify(value, null, 2), "utf8");
    renameSync(tmpPath, targetPath);
  } catch (error) {
    try {
      rmSync(tmpPath, { force: true });
    } catch {
      // Best-effort temp cleanup; the original error is what matters.
    }
    throw error;
  }
}

function logPersistFailure(operation: string, runId: string): void {
  logger.warn({
    subsystem: "validation",
    operation,
    status: "error",
    message: "could not persist validation ledger to disk; the run continues in memory",
    details: { runId },
  });
}

/**
 * Persists the live ledger file for a run. Returns true when written.
 * Never throws: a malformed runId, a disabled directory, or a failed disk
 * write all return false, and the caller keeps the in-memory ledger.
 */
export function persistLiveLedger(
  runId: string,
  ledger: ValidationLedgerExport,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    const target = liveLedgerPath(runId, env);
    if (!target) return false;
    atomicWriteJson(target, ledger);
    return true;
  } catch {
    logPersistFailure("ledger.persistLive", runId);
    return false;
  }
}

/**
 * Persists the `-final` file for a run. Written once on deactivate and
 * never overwritten afterward (an existing final file is left alone).
 * Returns true when written. Never throws; a failed write still lets the
 * caller return the ledger over HTTP.
 */
export function persistFinalLedger(
  runId: string,
  deactivationExport: ValidationDeactivationExport,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    if (deactivationExport.runId !== runId) return false;
    const target = finalLedgerPath(runId, env);
    if (!target) return false;
    if (existsSync(target)) return false;
    atomicWriteJson(target, deactivationExport);
    return true;
  } catch {
    logPersistFailure("ledger.persistFinal", runId);
    return false;
  }
}
