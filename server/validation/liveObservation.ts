/**
 * Live-router validation observation wiring.
 *
 * ADDITIVE ONLY. This module observes the responses of
 * `recitation.startLive` and `recitation.ingestLiveAudio` and records
 * structural measurements into the active validation run's ledger. It never
 * changes Quran correctness algorithms, alignment rules, advancement rules,
 * correction semantics, scoring, tajweed, or trusted-audio policy.
 *
 * Guarded by an active validation run: a request is observed only when it
 * carries a well-formed `x-validation-run-id` header naming a run that staff
 * activated via `activateValidationRun()`. With no active run, nothing is
 * recorded and router behavior is byte-for-byte unchanged.
 *
 * Safety rules for recorded payloads (enforced by the ledger's sanitizer):
 * - No audio bytes, no base64 audio, no raw transcripts (word indexes only).
 * - No Quran Arabic text — positions are surah/ayah/wordIndex only.
 * - No tokens, secrets, passwords, cookies, or authorization material.
 * - No PII.
 */
import type { TrpcContext } from "../_core/context";
import type { QuranEvaluatorDiagnostics } from "../quranEvaluator";
import {
  ValidationLedger,
  captureBuildInfo,
  createAttemptId,
  isRunId,
  type DeviceMetadata,
  type PositionCheckpoint,
  type ValidationLedgerExport,
} from "./validationRun";

/** Client-supplied header carrying the validation run ID. */
export const VALIDATION_RUN_HEADER = "x-validation-run-id";
/** Fallback header for request correlation when ctx.requestId is absent. */
export const REQUEST_ID_HEADER = "x-request-id";
/** Env flag that enables the staff-only validation-run HTTP endpoints. */
export const STAFF_API_ENV_VAR = "QURAN_VALIDATION_STAFF_API";

/**
 * Whether the staff-only validation-run HTTP endpoints may be registered.
 * Explicit opt-in: only the exact value "1" enables them. Never enabled by
 * default, so production deployments never expose run activation.
 */
export function isStaffValidationApiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[STAFF_API_ENV_VAR] === "1";
}

export type ActiveValidationRun = {
  runId: string;
  ledger: ValidationLedger;
  activatedAt: string;
};

const activeRuns = new Map<string, ActiveValidationRun>();

/**
 * Activates a validation run on this server instance. Staff call this before a
 * real-device session (Wave 0 readiness rehearsal and later waves); the
 * validation client then sends the run ID back on every live-tutor request
 * via the `x-validation-run-id` header. Re-activating an already-active run
 * returns the existing entry. Throws on a malformed run ID.
 */
export function activateValidationRun(
  runId: string,
  opts: { deviceMetadata?: DeviceMetadata } = {},
): ActiveValidationRun {
  if (!isRunId(runId)) {
    throw new Error(`activateValidationRun: refusing malformed run ID "${runId}"`);
  }
  const existing = activeRuns.get(runId);
  if (existing) return existing;
  const entry: ActiveValidationRun = {
    runId,
    ledger: new ValidationLedger({
      runId,
      build: captureBuildInfo(),
      deviceMetadata: opts.deviceMetadata,
    }),
    activatedAt: new Date().toISOString(),
  };
  activeRuns.set(runId, entry);
  entry.ledger.record("session.start", { source: "server", origin: "run-activated" });
  return entry;
}

export function getActiveValidationRun(runId: string): ActiveValidationRun | undefined {
  return activeRuns.get(runId);
}

/**
 * Deactivates a run and returns it so staff can export the ledger
 * (`entry.ledger.toJSON()`) for offline joining with the client log on
 * runId / correlationId.
 */
export function deactivateValidationRun(runId: string): ActiveValidationRun | undefined {
  const entry = activeRuns.get(runId);
  if (entry) activeRuns.delete(runId);
  return entry;
}

/** Exports the active run's ledger, or null when the run is not active. */
export function exportValidationRun(runId: string): ValidationLedgerExport | null {
  const entry = activeRuns.get(runId);
  return entry ? entry.ledger.toJSON() : null;
}

/** Test-only reset. Never call from production code paths. */
export function resetValidationRunsForTests(): void {
  activeRuns.clear();
}

function readHeader(ctx: TrpcContext, name: string): string | null {
  const headers = (ctx as { req?: { headers?: unknown } }).req?.headers;
  if (!headers || typeof headers !== "object") return null;
  const value = (headers as Record<string, unknown>)[name];
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === "string" && item.length > 0);
    return first ?? null;
  }
  return null;
}

/**
 * Returns the active run for this request, or null when the request carries
 * no well-formed run ID or the named run was never activated. Never throws.
 */
export function activeValidationRunFromCtx(ctx: TrpcContext): ActiveValidationRun | null {
  try {
    const runId = readHeader(ctx, VALIDATION_RUN_HEADER);
    if (!runId || !isRunId(runId)) return null;
    return getActiveValidationRun(runId) ?? null;
  } catch {
    return null;
  }
}

/** Request correlation ID: the middleware-set requestId, else x-request-id. */
export function correlationIdFromCtx(ctx: TrpcContext): string | null {
  try {
    if (typeof ctx.requestId === "string" && ctx.requestId.length > 0) return ctx.requestId;
    return readHeader(ctx, REQUEST_ID_HEADER);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-attempt scope
// ---------------------------------------------------------------------------

/**
 * Server-side state for one observed request inside an active validation
 * run. The observation middleware creates it and hands it to the procedure
 * through the tRPC context; the procedure fills in the acoustic diagnostics
 * the response deliberately does not carry. Exists only during an active
 * run, so ordinary requests never collect anything.
 */
export type ValidationAttemptScope = {
  attemptId: string;
  correlationId: string | null;
  acoustic: QuranEvaluatorDiagnostics | null;
  /** When the observed request entered the procedure (ISO). */
  startedAt: string;
  /** When the evaluator's aggregate diagnostics arrived (ISO), or null. */
  evidenceReadyAt: string | null;
};

/** Client turn/chunk IDs are accepted as attempt IDs only if token-shaped. */
const SAFE_CLIENT_ATTEMPT_ID = /^[A-Za-z0-9_.:-]{1,80}$/;

/**
 * The attempt ID for one observed request. A live turn keeps the client's own
 * turn ID so server checkpoints, corrections and the client's playback events
 * for that turn group together; every other request gets a fresh server
 * `att_…` ID. Never null.
 */
export function validationAttemptIdFor(path: string, rawInput: unknown): string {
  if (path === "recitation.ingestLiveAudio") {
    const turnId = asRecord(rawInput)?.turnId;
    if (typeof turnId === "string" && SAFE_CLIENT_ATTEMPT_ID.test(turnId)) return turnId;
  }
  return createAttemptId();
}

export function createValidationAttemptScope(
  ctx: TrpcContext,
  path: string,
  rawInput: unknown,
): ValidationAttemptScope {
  return {
    attemptId: validationAttemptIdFor(path, rawInput),
    correlationId: correlationIdFromCtx(ctx),
    acoustic: null,
    startedAt: new Date().toISOString(),
    evidenceReadyAt: null,
  };
}

/** Stores the evaluator's aggregate diagnostics on the scope. */
export function recordAttemptAcoustic(
  scope: ValidationAttemptScope,
  diagnostics: QuranEvaluatorDiagnostics,
): void {
  scope.acoustic = diagnostics;
  // Null-when-not-called semantics: when the evaluator never ran (e.g.
  // QURAN_EVALUATOR_URL unset), the attempt must not report an
  // evidence-arrival time — a timestamp here would imply acoustic evidence
  // was produced.
  scope.evidenceReadyAt = diagnostics.evaluatorCalled ? new Date().toISOString() : null;
}

/** Recorded when a finalized attempt never reached the acoustic evaluator. */
export const ACOUSTIC_NOT_RUN: Readonly<QuranEvaluatorDiagnostics> = Object.freeze({
  evaluatorCalled: false,
  evaluatorStatus: "not_configured",
  evaluatorHttpStatus: null,
  evaluatorLatencyMs: null,
  primaryCorrectionsEnabled: false,
  shadowStatus: "not_run",
  shadowProvider: null,
  shadowModelId: null,
  shadowDecodedLevels: 0,
  shadowPhonemeTokens: 0,
  shadowAveragePosterior: null,
  shadowLatencyMs: null,
  evaluatedSurah: null,
  evaluatedAyah: null,
  alignmentConfidence: null,
  findingsCount: 0,
  abstentionReason: null,
});

/**
 * Copies only the known aggregate fields, so an unexpected property on the
 * diagnostics object can never ride into the ledger.
 */
export function acousticAttemptDetails(
  diagnostics: QuranEvaluatorDiagnostics | null | undefined,
): QuranEvaluatorDiagnostics {
  const d = diagnostics ?? ACOUSTIC_NOT_RUN;
  return {
    evaluatorCalled: d.evaluatorCalled === true,
    evaluatorStatus: d.evaluatorStatus,
    evaluatorHttpStatus: asNumber(d.evaluatorHttpStatus),
    evaluatorLatencyMs: asNumber(d.evaluatorLatencyMs),
    primaryCorrectionsEnabled: d.primaryCorrectionsEnabled === true,
    shadowStatus: d.shadowStatus,
    shadowProvider: safeToken(d.shadowProvider, 80),
    shadowModelId: safeToken(d.shadowModelId, 160),
    shadowDecodedLevels: asNumber(d.shadowDecodedLevels) ?? 0,
    shadowPhonemeTokens: asNumber(d.shadowPhonemeTokens) ?? 0,
    shadowAveragePosterior: asNumber(d.shadowAveragePosterior),
    shadowLatencyMs: asNumber(d.shadowLatencyMs),
    evaluatedSurah: asNumber(d.evaluatedSurah),
    evaluatedAyah: asNumber(d.evaluatedAyah),
    alignmentConfidence: asNumber(d.alignmentConfidence),
    findingsCount: asNumber(d.findingsCount) ?? 0,
    abstentionReason: d.abstentionReason === "insufficient_reliable_evidence" ? d.abstentionReason : null,
  };
}

/** Why the tutor held or advanced, from the response's structural fields. */
export type AttemptDecisionDetails = {
  verseFollowingReason: string | null;
  verseFollowingState: string | null;
  shouldAdvance: boolean | null;
  reviewMessageCode: string | null;
  matchedCount: number | null;
  totalWords: number | null;
  score: number | null;
  tutorOutcome: string | null;
  tutorActionKind: string | null;
  tutorActionReason: string | null;
  /** Server-held position after this attempt (verse following output), numbers only. */
  positionAfter: { surah: number; ayah: number; wordIndex: number } | null;
};

/** Identifier-shaped strings only: an enum value or model ID, never prose. */
const SAFE_TOKEN = /^[A-Za-z0-9_.:/@+-]+$/;

function safeToken(value: unknown, maxLength = 64): string | null {
  return typeof value === "string" && value.length <= maxLength && SAFE_TOKEN.test(value) ? value : null;
}

export function attemptDecisionDetails(
  recitation: Record<string, unknown> | null,
  outer: Record<string, unknown> | null,
): AttemptDecisionDetails {
  const verseFollowing = asRecord(recitation?.verseFollowing);
  const action = asRecord(asRecord(outer?.tutor)?.action);
  const shouldAdvance = verseFollowing?.shouldAdvance;
  const surah = asNumber(verseFollowing?.currentSurah);
  const ayah = asNumber(verseFollowing?.currentAyah);
  const wordIndex = asNumber(verseFollowing?.expectedWordIndex);
  return {
    verseFollowingReason: safeToken(verseFollowing?.reason),
    verseFollowingState: safeToken(verseFollowing?.state),
    shouldAdvance: typeof shouldAdvance === "boolean" ? shouldAdvance : null,
    reviewMessageCode: safeToken(recitation?.reviewMessageCode),
    matchedCount: asNumber(recitation?.matchedCount),
    totalWords: asNumber(recitation?.totalWords),
    score: asNumber(recitation?.score),
    tutorOutcome: safeToken(outer?.outcome),
    tutorActionKind: safeToken(action?.kind),
    tutorActionReason: safeToken(action?.reason),
    positionAfter: surah !== null && ayah !== null && wordIndex !== null ? { surah, ayah, wordIndex } : null,
  };
}

// ---------------------------------------------------------------------------
// Response observation
// ---------------------------------------------------------------------------

/** Live router paths whose responses are observed. */
export const OBSERVED_LIVE_PATHS = ["recitation.startLive", "recitation.ingestLiveAudio"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

type ObservedTracker = { surah: number; ayah: number; expectedWordIndex: number };

function trackerOf(stream: unknown): ObservedTracker | null {
  const tracker = asRecord(asRecord(stream)?.tracker);
  const surah = asNumber(tracker?.surah);
  const ayah = asNumber(tracker?.ayah);
  const expectedWordIndex = asNumber(tracker?.expectedWordIndex);
  return surah === null || ayah === null || expectedWordIndex === null
    ? null
    : { surah, ayah, expectedWordIndex };
}

/** Tutor action kinds that direct trusted Qari playback. */
const PLAYBACK_ACTION_KINDS = new Set(["play-target-word", "play-current-ayah"]);
/** Tutor hint kinds that direct trusted Qari audio playback. */
const PLAYBACK_HINT_KINDS = new Set(["trusted-word-audio", "trusted-ayah-audio"]);

export type PlaybackDirective = {
  actionKind: string;
  hintKind: string | null;
  targetWordIndex: number | null;
};

/**
 * Extracts the server's playback directive from a tutor action, if any. This
 * is ECHO-01 evidence: it marks that trusted-audio playback was directed
 * alongside this response, so offline analysis can join it with the client's
 * actual playback intervals and detect playback leaking into the mic.
 */
export function playbackDirectiveOf(action: unknown): PlaybackDirective | null {
  const record = asRecord(action);
  const actionKind = asString(record?.kind);
  if (!actionKind) return null;
  const hintKind = asString(asRecord(record?.hint)?.kind);
  const directsPlayback =
    PLAYBACK_ACTION_KINDS.has(actionKind) || (hintKind !== null && PLAYBACK_HINT_KINDS.has(hintKind));
  if (!directsPlayback) return null;
  return {
    actionKind,
    hintKind,
    targetWordIndex: asNumber(record?.targetWordIndex),
  };
}

export type ObserveOptions = {
  correlationId?: string | null;
  /** Server attempt ID for every event this request records. */
  attemptId?: string | null;
  /** Aggregate acoustic diagnostics collected during the request. */
  acoustic?: QuranEvaluatorDiagnostics | null;
  /** When the request entered the procedure (ISO). */
  startedAt?: string | null;
  /** When the evaluator diagnostics arrived (ISO). */
  evidenceReadyAt?: string | null;
};

/** Attempt timestamps recorded on terminal events; ISO strings or null. */
function attemptTiming(opts: ObserveOptions): { startedAt: string | null; evidenceReadyAt: string | null } {
  return { startedAt: opts.startedAt ?? null, evidenceReadyAt: opts.evidenceReadyAt ?? null };
}

function recordOptions(opts: ObserveOptions) {
  return { correlationId: opts.correlationId ?? null, attemptId: opts.attemptId ?? null };
}

/** Finalized recitation routes that can reach the shadow acoustic evaluator. */
export const OBSERVED_FINAL_RECITATION_PATHS = [
  "recitation.evaluate",
  "recitation.evaluateWithTutor",
] as const;

function isObservedFinalRecitationPath(
  path: string,
): path is (typeof OBSERVED_FINAL_RECITATION_PATHS)[number] {
  return (OBSERVED_FINAL_RECITATION_PATHS as readonly string[]).includes(path);
}

function checkpointDetails(
  tracker: ObservedTracker,
  checkpoint: Omit<PositionCheckpoint, "surah" | "ayah" | "wordIndex">,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const details: Record<string, unknown> = {
    surah: tracker.surah,
    ayah: tracker.ayah,
    wordIndex: tracker.expectedWordIndex,
    ...checkpoint,
  };
  for (const [key, value] of Object.entries(context)) {
    if (value !== null && value !== undefined) details[key] = value;
  }
  return details;
}

function observeStartLive(run: ActiveValidationRun, result: unknown, opts: ObserveOptions): void {
  const stream = asRecord(asRecord(result)?.stream);
  const tracker = trackerOf(stream);
  if (!tracker) return;
  run.ledger.record(
    "position.checkpoint",
    checkpointDetails(
      tracker,
      {
        source: "server",
        evidenceSource: "none",
        audioDerived: false,
        quranStateMutation: null,
        note: "recitation.startLive initial server-held position",
      },
      { streamId: asString(stream?.streamId) },
    ),
    recordOptions(opts),
  );
}

const WORD_OMITTED_EVIDENCE = new Set(["finalized-later-word", "repeated-stable-later-word"]);

function observeIngestLiveAudio(run: ActiveValidationRun, result: unknown, opts: ObserveOptions): void {
  const response = asRecord(result);
  const acknowledgement = asRecord(response?.acknowledgement);
  const applied = acknowledgement?.status === "applied";
  const stream = asRecord(response?.stream);
  const tracker = trackerOf(stream);
  const tutor = asRecord(response?.tutor);
  const action = asRecord(tutor?.action);
  const directive = playbackDirectiveOf(action);
  const verseFollowing = asRecord(asRecord(response?.recitation)?.verseFollowing);
  const audioDerived = response?.recognitionStatus === "transcribed";
  const ackContext: Record<string, unknown> = {};
  const ackStreamId = asString(stream?.streamId);
  const ackTurnId = asString(acknowledgement?.turnId);
  const ackChunkId = asString(acknowledgement?.chunkId);
  const ackSequence = asNumber(acknowledgement?.sequence);
  if (ackStreamId) ackContext.streamId = ackStreamId;
  if (ackTurnId) ackContext.turnId = ackTurnId;
  if (ackChunkId) ackContext.chunkId = ackChunkId;
  if (ackSequence !== null) ackContext.sequence = ackSequence;

  if (tracker) {
    run.ledger.record(
      "position.checkpoint",
      checkpointDetails(
        tracker,
        {
          source: "server",
          evidenceSource: "learner-audio",
          audioDerived,
          // Only an actually-committed input can mutate Quran state. Replays
          // (duplicate/stale/rejected/out-of-order) return the same snapshot
          // without committing, so they must never fabricate a mutation.
          quranStateMutation: applied && verseFollowing?.shouldAdvance === true ? "advance" : null,
          ...(directive ? { playbackDirective: directive } : {}),
        },
        ackContext,
      ),
      recordOptions(opts),
    );
  }

  // A finalized live turn is a full evaluated attempt: record why the tutor
  // held or advanced and what the acoustic shadow saw. A replayed duplicate
  // carries the same recitation without evaluating again, so only an
  // applied input records it.
  const recitation = asRecord(response?.recitation);
  if (applied && recitation) {
    run.ledger.record(
      "attempt.diagnostics",
      {
        route: "live",
        attemptScope: asString(recitation.attemptScope),
        reviewStatus: asString(recitation.reviewStatus),
        acousticStatus: asString(asRecord(recitation.quranAwareReview)?.status),
        decision: attemptDecisionDetails(recitation, response),
        acoustic: acousticAttemptDetails(opts.acoustic),
        timing: attemptTiming(opts),
        ...ackContext,
      },
      recordOptions(opts),
    );
  }

  // A confirmed word-omitted event on an applied input is the server's exact
  // correction decision. Duplicates replay the same event without deciding
  // again, so they must not double-record the decision.
  const event = asRecord(response?.event);
  if (applied && event?.type === "word-omitted") {
    const targetWordIndex = asNumber(event?.targetWordIndex);
    if (targetWordIndex === null) return;
    const evidence = asString(event?.evidence);
    run.ledger.record(
      "correction.decided",
      {
        eventType: "word-omitted",
        surah: asNumber(event?.surah) ?? tracker?.surah ?? null,
        ayah: asNumber(event?.ayah) ?? tracker?.ayah ?? null,
        targetWordIndex,
        ...(evidence && WORD_OMITTED_EVIDENCE.has(evidence) ? { evidence } : {}),
        heardThroughWordIndex: asNumber(event?.heardThroughWordIndex),
        audioDerived: true,
        decisionKind: "repeat-word",
        ...(directive ? { playbackDirective: directive } : {}),
        ...ackContext,
      },
      recordOptions(opts),
    );
  }
}

/**
 * Records the structural observations for one live-router response. Never
 * throws and never mutates the result: observation must not break the Tutor.
 */
export function observeLiveRouterResult(
  run: ActiveValidationRun,
  path: string,
  result: unknown,
  opts: ObserveOptions = {},
): void {
  try {
    if (path === "recitation.startLive") observeStartLive(run, result, opts);
    else if (path === "recitation.ingestLiveAudio") observeIngestLiveAudio(run, result, opts);
  } catch {
    // Observation is best-effort; the live Tutor must never fail because of it.
  }
}

/**
 * Records one privacy-safe terminal event for a finalized recitation request.
 *
 * This is the server half of the client attempt lifecycle trace. The two logs
 * join on runId + correlationId; no audio, transcript, Quran text, learner
 * identity, or error message is copied into the ledger.
 */
export function observeFinalRecitationResult(
  run: ActiveValidationRun,
  path: string,
  result: unknown,
  opts: ObserveOptions = {},
): void {
  try {
    if (!isObservedFinalRecitationPath(path)) return;
    const outer = asRecord(result);
    const recitation = path === "recitation.evaluateWithTutor"
      ? asRecord(outer?.recitation)
      : outer;
    const tutor = path === "recitation.evaluateWithTutor" ? asRecord(outer?.tutor) : null;
    const quranAwareReview = asRecord(recitation?.quranAwareReview);
    run.ledger.record(
      "attempt.completed",
      {
        route: path === "recitation.evaluateWithTutor" ? "tutor" : "study",
        outcome: recitation ? "responded" : "not-applied",
        recitationReturned: Boolean(recitation),
        attemptScope: asString(recitation?.attemptScope),
        reviewStatus: asString(recitation?.reviewStatus),
        acousticStatus: asString(quranAwareReview?.status),
        tutorStatus: asString(tutor?.status),
        decision: attemptDecisionDetails(recitation, outer),
        acoustic: acousticAttemptDetails(opts.acoustic),
        timing: attemptTiming(opts),
      },
      recordOptions(opts),
    );
  } catch {
    // Observation is best-effort; a review must never fail because of it.
  }
}

/** Records a failed finalized request by stable error code only. */
export function observeFinalRecitationFailure(
  run: ActiveValidationRun,
  path: string,
  error: unknown,
  opts: ObserveOptions = {},
): void {
  try {
    if (!isObservedFinalRecitationPath(path)) return;
    const code = asString(asRecord(error)?.code) ?? "UNKNOWN";
    run.ledger.record(
      "attempt.completed",
      {
        route: path === "recitation.evaluateWithTutor" ? "tutor" : "study",
        outcome: "failed",
        errorCode: safeToken(code) ?? "UNKNOWN",
        acoustic: acousticAttemptDetails(opts.acoustic),
        timing: attemptTiming(opts),
      },
      recordOptions(opts),
    );
  } catch {
    // Observation is best-effort; preserve the original procedure failure.
  }
}
