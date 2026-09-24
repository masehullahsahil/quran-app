/**
 * Per-attempt Muaalem shadow export for one validation run.
 *
 * READ-ONLY PROJECTION. Turns one run's ledger export into flat rows, one per
 * finalized attempt, for the correctness benchmark's scoring script. It
 * observes what the ledger already recorded; it never changes Quran matching,
 * scoring, advancement, correction thresholds, or acoustic algorithms.
 *
 * Strict allowlist: every value is re-validated as a finite number, a closed
 * enum, a token-shaped identifier, or an ISO timestamp. Anything else becomes
 * null, so audio, transcripts, Quran text, secrets and learner identity cannot
 * appear in a row even if a ledger file on disk was edited by hand.
 *
 * `verdict` is the acoustic evaluator's own verdict for the attempt, never a
 * pronunciation claim: the evaluator abstains rather than confirm a correct
 * recitation, and the Muaalem shadow never drives learner corrections.
 */
import { isRunId } from "./validationRun";

export const ATTEMPT_EXPORT_SCHEMA = "quran.validation.attempts.v1" as const;

export type AttemptVerdict =
  | "findings_reported"
  /** Evaluator ran and reported zero findings — a clean run, not a non-run. */
  | "no_findings"
  | "abstained"
  | "unavailable"
  | "not_run"
  | "request_failed";

export type AttemptPosition = { surah: number; ayah: number; wordIndex: number };

export type ValidationAttemptExportRow = {
  runId: string;
  attemptId: string | null;
  correlationId: string | null;
  route: "study" | "tutor" | "live" | null;
  outcome: "responded" | "not-applied" | "failed" | null;
  /** The ayah sent to the evaluator, as "surah:ayah"; null when not evaluated. */
  ayahRef: string | null;
  /** Server-held position after the attempt (verse following output). */
  position: AttemptPosition | null;
  /** Same as `position.wordIndex` (1-based), for flat joins. */
  wordIndex: number | null;
  muaalemStatus: string | null;
  muaalemModelId: string | null;
  /** The shadow worker's average posterior over decoded phoneme tokens (0..1). */
  muaalemRawPosterior: number | null;
  muaalemPhonemeTokens: number | null;
  muaalemDecodedLevels: number | null;
  muaalemLatencyMs: number | null;
  evaluatorStatus: string | null;
  evaluatorHttpStatus: number | null;
  evaluatorLatencyMs: number | null;
  primaryCorrectionsEnabled: boolean | null;
  alignmentConfidence: number | null;
  findingsCount: number | null;
  abstentionReason: "insufficient_reliable_evidence" | null;
  verdict: AttemptVerdict;
  tutorOutcome: string | null;
  shouldAdvance: boolean | null;
  verseFollowingReason: string | null;
  reviewMessageCode: string | null;
  matchedCount: number | null;
  totalWords: number | null;
  score: number | null;
  errorCode: string | null;
  startedAt: string | null;
  evidenceReadyAt: string | null;
  completedAt: string | null;
};

export type ValidationAttemptExport = {
  schema: typeof ATTEMPT_EXPORT_SCHEMA;
  runId: string;
  exportedAt: string;
  attemptCount: number;
  attempts: ValidationAttemptExportRow[];
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** ASCII identifier-shaped strings only: enums, model IDs, request IDs. */
const SAFE_TOKEN = /^[A-Za-z0-9_.:/@+-]+$/;

function token(value: unknown, maxLength = 80): string | null {
  return typeof value === "string" && value.length <= maxLength && SAFE_TOKEN.test(value) ? value : null;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

function timestamp(value: unknown): string | null {
  return typeof value === "string" && ISO_TIMESTAMP.test(value) ? value : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

const ROUTES = ["study", "tutor", "live"] as const;
const OUTCOMES = ["responded", "not-applied", "failed"] as const;
const EVALUATOR_STATUSES = ["not_configured", "available", "abstained", "unavailable"] as const;
const SHADOW_STATUSES = ["not_run", "not_configured", "available", "abstained", "unavailable"] as const;

function position(value: unknown): AttemptPosition | null {
  const record = asRecord(value);
  const surah = int(record?.surah);
  const ayah = int(record?.ayah);
  const wordIndex = int(record?.wordIndex);
  return surah !== null && ayah !== null && wordIndex !== null ? { surah, ayah, wordIndex } : null;
}

function verdictOf(
  outcome: ValidationAttemptExportRow["outcome"],
  evaluatorCalled: boolean,
  evaluatorStatus: string | null,
  findingsCount: number | null,
): AttemptVerdict {
  if (outcome === "failed") return "request_failed";
  if (!evaluatorCalled) return "not_run";
  // A clean review is still a run: labeling it "not_run" corrupts the
  // benchmark's control takes, which are expected to have zero findings.
  if (evaluatorStatus === "available") return (findingsCount ?? 0) > 0 ? "findings_reported" : "no_findings";
  if (evaluatorStatus === "abstained") return "abstained";
  if (evaluatorStatus === "unavailable") return "unavailable";
  return "not_run";
}

/** Projects one terminal ledger event into a row, or null if it is not one. */
function rowOf(runId: string, event: UnknownRecord): ValidationAttemptExportRow | null {
  if (event.type !== "attempt.completed" && event.type !== "attempt.diagnostics") return null;
  const details = asRecord(event.details);
  // Harness samples record their own attempt shape without these blocks.
  if (!details || (!("acoustic" in details) && !("decision" in details))) return null;
  const acoustic = asRecord(details.acoustic);
  const decision = asRecord(details.decision);
  const timing = asRecord(details.timing);

  const outcome =
    oneOf(details.outcome, OUTCOMES) ?? (event.type === "attempt.diagnostics" ? "responded" : null);
  const evaluatorStatus = oneOf(acoustic?.evaluatorStatus, EVALUATOR_STATUSES);
  const findingsCount = int(acoustic?.findingsCount);
  const surah = int(acoustic?.evaluatedSurah);
  const ayah = int(acoustic?.evaluatedAyah);
  const after = position(decision?.positionAfter);

  return {
    runId,
    attemptId: token(event.attemptId),
    correlationId: token(event.correlationId, 128),
    route: oneOf(details.route, ROUTES),
    outcome,
    ayahRef: surah !== null && ayah !== null ? `${surah}:${ayah}` : null,
    position: after,
    wordIndex: after?.wordIndex ?? null,
    muaalemStatus: oneOf(acoustic?.shadowStatus, SHADOW_STATUSES),
    muaalemModelId: token(acoustic?.shadowModelId, 160),
    muaalemRawPosterior: num(acoustic?.shadowAveragePosterior),
    muaalemPhonemeTokens: int(acoustic?.shadowPhonemeTokens),
    muaalemDecodedLevels: int(acoustic?.shadowDecodedLevels),
    muaalemLatencyMs: num(acoustic?.shadowLatencyMs),
    evaluatorStatus,
    evaluatorHttpStatus: int(acoustic?.evaluatorHttpStatus),
    evaluatorLatencyMs: num(acoustic?.evaluatorLatencyMs),
    primaryCorrectionsEnabled: bool(acoustic?.primaryCorrectionsEnabled),
    alignmentConfidence: num(acoustic?.alignmentConfidence),
    findingsCount,
    abstentionReason: oneOf(acoustic?.abstentionReason, ["insufficient_reliable_evidence"] as const),
    verdict: verdictOf(outcome, acoustic?.evaluatorCalled === true, evaluatorStatus, findingsCount),
    tutorOutcome: token(decision?.tutorOutcome),
    shouldAdvance: bool(decision?.shouldAdvance),
    verseFollowingReason: token(decision?.verseFollowingReason),
    reviewMessageCode: token(decision?.reviewMessageCode),
    matchedCount: int(decision?.matchedCount),
    totalWords: int(decision?.totalWords),
    score: num(decision?.score),
    errorCode: token(details.errorCode),
    startedAt: timestamp(timing?.startedAt),
    evidenceReadyAt: timestamp(timing?.evidenceReadyAt),
    completedAt: timestamp(event.t),
  };
}

/**
 * Builds the per-attempt export from a ledger export (`ledger.toJSON()`, the
 * `/ledger` response, or the `ledger` inside a `/deactivate` response). Only
 * events stamped with the ledger's own run ID are exported, so a merged or
 * hand-edited file can never leak another run's attempts. Returns null when
 * the input is not a ledger export with a well-formed run ID.
 */
export function buildAttemptExport(ledgerExport: unknown, now: Date = new Date()): ValidationAttemptExport | null {
  const ledger = asRecord(ledgerExport);
  const runId = typeof ledger?.runId === "string" && isRunId(ledger.runId) ? ledger.runId : null;
  if (!runId || !Array.isArray(ledger?.events)) return null;
  const attempts: ValidationAttemptExportRow[] = [];
  for (const raw of ledger.events) {
    const event = asRecord(raw);
    if (!event || event.runId !== runId) continue;
    const row = rowOf(runId, event);
    if (row) attempts.push(row);
  }
  return {
    schema: ATTEMPT_EXPORT_SCHEMA,
    runId,
    exportedAt: now.toISOString(),
    attemptCount: attempts.length,
    attempts,
  };
}

/**
 * Finds the ledger export in a saved staff file: a raw ledger export, a
 * `/deactivate` response (`{ ledger }`), or a client evidence bundle
 * (`{ server: { ledger } }`).
 */
export function ledgerFromSavedFile(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return null;
  if (Array.isArray(record.events)) return record;
  const ledger = asRecord(record.ledger);
  if (ledger) return ledger;
  return asRecord(asRecord(record.server)?.ledger);
}
