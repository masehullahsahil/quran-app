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
import {
  ValidationLedger,
  captureBuildInfo,
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
};

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
    { correlationId: opts.correlationId ?? null },
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
      { correlationId: opts.correlationId ?? null },
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
      { correlationId: opts.correlationId ?? null },
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
