/**
 * Client-side capture for real-device validation runs.
 *
 * Additive-only and inert in production: nothing here changes transport
 * behavior, the LiveTutorPanel, or any hook. Validation builds opt in by
 * calling these helpers (e.g. when `?validation=1` is present or the
 * `quran.validationMode` localStorage flag is set).
 *
 * Position checkpoints recorded here are copied verbatim from SERVER
 * responses (`source: "server-response"`); the client never claims a Quran
 * position of its own.
 */
import type { LiveRecitationStreamSnapshot } from "@shared/liveRecitation";

export type NetworkMetadata = {
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean | null;
};

export type DeviceMetadata = {
  collectedAt: string;
  browserName: string | null;
  browserVersion: string | null;
  userAgentTruncated: string | null;
  platform: string | null;
  connection: NetworkMetadata | null;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
  locale: string | null;
  timeZone: string | null;
  screenWidth: number | null;
  screenHeight: number | null;
  devicePixelRatio: number | null;
  interfaceLanguage: string | null;
  validationMode: boolean;
};

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function parseBrowser(userAgent: string): { name: string | null; version: string | null } {
  const patterns: Array<[RegExp, string]> = [
    [/(edg|edge)\/([\d.]+)/i, "Edge"],
    [/(chrome|crios)\/([\d.]+)/i, "Chrome"],
    [/firefox\/([\d.]+)/i, "Firefox"],
    [/version\/([\d.]+).*safari/i, "Safari"],
    [/(opera|opr)\/([\d.]+)/i, "Opera"],
  ];
  for (const [pattern, name] of patterns) {
    const match = userAgent.match(pattern);
    if (match) return { name, version: match[match.length - 1] ?? null };
  }
  return { name: null, version: null };
}

/**
 * Collects device/browser/network/environment metadata. Never throws; every
 * field degrades to null when the API is unavailable (e.g. non-browser env).
 */
export function collectDeviceMetadata(interfaceLanguage?: string): DeviceMetadata {
  return safe<DeviceMetadata>(
    () => {
      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      const userAgent = nav?.userAgent ?? null;
      const { name, version } = userAgent ? parseBrowser(userAgent) : { name: null, version: null };
      const connection = (nav as unknown as
        | { connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } }
        | undefined)?.connection;
      return {
        collectedAt: new Date().toISOString(),
        browserName: name,
        browserVersion: version,
        userAgentTruncated: userAgent ? userAgent.slice(0, 300) : null,
        platform: nav?.platform ?? null,
        connection: connection
          ? {
              effectiveType: connection.effectiveType ?? null,
              downlinkMbps: typeof connection.downlink === "number" ? connection.downlink : null,
              rttMs: typeof connection.rtt === "number" ? connection.rtt : null,
              saveData: typeof connection.saveData === "boolean" ? connection.saveData : null,
            }
          : null,
        deviceMemoryGb:
          typeof (nav as unknown as { deviceMemory?: number } | undefined)?.deviceMemory === "number"
            ? (nav as unknown as { deviceMemory: number }).deviceMemory
            : null,
        hardwareConcurrency: typeof nav?.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
        locale: nav?.language ?? null,
        timeZone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? null, null),
        screenWidth: typeof screen !== "undefined" ? (screen.width ?? null) : null,
        screenHeight: typeof screen !== "undefined" ? (screen.height ?? null) : null,
        devicePixelRatio:
          typeof window !== "undefined" && typeof window.devicePixelRatio === "number"
            ? window.devicePixelRatio
            : null,
        interfaceLanguage: interfaceLanguage ?? nav?.language ?? null,
        validationMode: isValidationMode(),
      };
    },
    {
      collectedAt: new Date().toISOString(),
      browserName: null,
      browserVersion: null,
      userAgentTruncated: null,
      platform: null,
      connection: null,
      deviceMemoryGb: null,
      hardwareConcurrency: null,
      locale: null,
      timeZone: null,
      screenWidth: null,
      screenHeight: null,
      devicePixelRatio: null,
      interfaceLanguage: interfaceLanguage ?? null,
      validationMode: false,
    },
  );
}

/** True when the page was opened for a validation run. Never throws. */
export function isValidationMode(): boolean {
  return safe(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("validation") === "1") return true;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("quran.validationMode") === "1";
    }
    return false;
  }, false);
}

/**
 * Validation run ID propagation for live-tutor requests.
 *
 * When a staff validation run is active, every live-tutor request
 * (recitation.startLive, recitation.ingestLiveAudio) must carry the same
 * run identity so client-side and server-side evidence can be joined
 * offline on runId + correlationId.
 *
 * Authority boundary: the browser-supplied run ID is ONLY an
 * observation/run-correlation identifier. It never becomes authority for
 * Quran position, expected words, correctness, advancement, correction
 * targets, or session state — the server remains authoritative for all
 * Quran state (see server/validation/liveObservation.ts).
 *
 * Safety: this sends only the run ID header. No Quran text, no audio, no
 * transcripts, no PII ever go in validation headers.
 */

/** Header name shared with server/validation/liveObservation.ts. Must stay in sync. */
export const VALIDATION_RUN_HEADER = "x-validation-run-id";
/** localStorage key for the staff validation run ID. */
export const VALIDATION_RUN_ID_STORAGE_KEY = "quran.validationRunId";

/** Well-formed run IDs look like run_<24 hex chars> (see server validationRun.isRunId). */
export function isValidationRunIdFormat(value: unknown): value is string {
  return typeof value === "string" && /^run_[0-9a-f]{24}$/.test(value);
}

/**
 * Reads the staff validation run ID from the URL (?validationRunId=run_…)
 * or localStorage, when well-formed. Returns null when absent or malformed.
 * Never throws. Does NOT check validation mode — use getActiveValidationRunId
 * for the gated version.
 */
export function getValidationRunId(): string | null {
  return safe(() => {
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const fromUrl =
          params.get("validationRunId") ?? params.get("validation-run-id") ?? params.get("x-validation-run-id");
        if (fromUrl && isValidationRunIdFormat(fromUrl)) return fromUrl;
        // A malformed run ID in the URL fails safely: ignore it, don't send it.
      } catch {
        // URL parsing unavailable — fall through to storage.
      }
    }
    if (typeof localStorage !== "undefined") {
      try {
        const stored = localStorage.getItem(VALIDATION_RUN_ID_STORAGE_KEY);
        if (stored && isValidationRunIdFormat(stored)) return stored;
      } catch {
        // Storage unavailable — fail safe with null.
      }
    }
    return null;
  }, null);
}

/**
 * The run ID to send on live-tutor requests, or null when validation is not
 * active. Gated by isValidationMode(): ordinary production use never sends
 * the header, even if a run ID happens to be stored.
 */
export function getActiveValidationRunId(): string | null {
  try {
    if (!isValidationMode()) return null;
    return getValidationRunId();
  } catch {
    return null;
  }
}

/**
 * Builds the validation headers for the tRPC client. Returns
 * `{ "x-validation-run-id": runId }` when a validation run is active,
 * otherwise an empty object. Never throws.
 */
export function buildValidationHeaders(): Record<string, string> {
  try {
    const runId = getActiveValidationRunId();
    if (runId) return { [VALIDATION_RUN_HEADER]: runId };
    return {};
  } catch {
    return {};
  }
}

export type ClientValidationEventType =
  | "session.start"
  | "device.metadata"
  | "position.checkpoint"
  | "playback.started"
  | "playback.ended"
  | "mic.reopened"
  | "client.event"
  | "attempt.lifecycle"
  | "note";

/**
 * Client-side pipeline instrumentation, carried on the generic `client.event`
 * channel. Numeric only — no raw audio, no transcripts — per the ledger
 * policy. These exist so a real-device run can distinguish the three failure
 * classes: CAPTURE (the mic/VAD never delivered audio), TRANSCRIPTION (audio
 * arrived but Whisper failed), and MATCHING/DECISION (the server abstained on
 * weak evidence, working as designed).
 */
export type ClientInstrumentationKind =
  /** One coach TTS step: how it resolved and how long it was audible. */
  | "tts.step"
  /**
   * One trusted-recording step that never became audible (the playback
   * give-up): kept as a numeric trace, never an ECHO-01 interval.
   */
  | "qari.step"
  /** A VAD turn opened: the room the detector thinks it is in. */
  | "vad.turnOpened"
  /** A VAD turn ended: why, and how much voice it held. */
  | "vad.turnEnded"
  /** A captured turn settled: what the recorder actually produced. */
  | "capture.turnSettled"
  /** The live interim stream gave up after bounded retries. */
  | "interim.abandoned";

/** How one coach TTS step resolved. `display` is a shown-only sentence. */
export type TtsStepResolution = "onend" | "onerror" | "backstop" | "silent-immediate" | "display";

/** Additive instrumentation callback for hooks. Ignored when unset. */
export type ClientInstrumentFn = (
  kind: ClientInstrumentationKind | "mic.reopened",
  details: Record<string, unknown>,
) => void;

export type ClientValidationEvent = {
  seq: number;
  t: string;
  runId: string;
  attemptId: string | null;
  correlationId: string | null;
  type: ClientValidationEventType;
  details: Record<string, unknown>;
};

/**
 * In-memory client event log for a validation run. The analysis step joins
 * this with the server ledger on runId/correlationId.
 */
export function createClientValidationLog(opts: { runId: string; correlationId?: string | null }) {
  const runId = opts.runId;
  const defaultCorrelationId = opts.correlationId ?? null;
  let seq = 1;
  const events: ClientValidationEvent[] = [];

  function record(
    type: ClientValidationEventType,
    details: Record<string, unknown> = {},
    recordOpts: { attemptId?: string | null; correlationId?: string | null; t?: string } = {},
  ): ClientValidationEvent {
    const event: ClientValidationEvent = {
      seq: seq++,
      t: recordOpts.t ?? new Date().toISOString(),
      runId,
      attemptId: recordOpts.attemptId ?? null,
      correlationId: recordOpts.correlationId ?? defaultCorrelationId,
      type,
      details,
    };
    events.push(event);
    return event;
  }

  return {
    record,
    recordDeviceMetadata(metadata: DeviceMetadata, recordOpts?: { correlationId?: string | null }) {
      return record("device.metadata", { ...metadata }, recordOpts);
    },
    recordPlaybackStarted(
      source: "tutor" | "qari",
      recordOpts: { attemptId?: string | null; correlationId?: string | null; t?: string } = {},
    ) {
      return record("playback.started", { playbackSource: source }, recordOpts);
    },
    recordPlaybackEnded(
      source: "tutor" | "qari",
      recordOpts: { attemptId?: string | null; correlationId?: string | null; t?: string } = {},
    ) {
      return record("playback.ended", { playbackSource: source }, recordOpts);
    },
    recordMicReopened(
      scope?: string,
      recordOpts: { attemptId?: string | null; correlationId?: string | null } = {},
      extraDetails: Record<string, unknown> = {},
    ) {
      return record("mic.reopened", { ...(scope ? { scope } : {}), ...extraDetails }, recordOpts);
    },
    /**
     * Generic pipeline instrumentation on the `client.event` channel. Numeric
     * only — callers must not put audio, transcripts, or PII in `details`.
     */
    recordInstrumentation(
      kind: ClientInstrumentationKind,
      details: Record<string, unknown> = {},
      recordOpts: { attemptId?: string | null; correlationId?: string | null } = {},
    ) {
      return record("client.event", { kind, ...details }, recordOpts);
    },
    /**
     * One step of an attempt's submission lifecycle. Details are passed
     * through {@link sanitizeAttemptTraceDetails}: anything outside the
     * allow-list (audio, transcripts, messages, keys) is dropped here, so a
     * careless caller still cannot put it in the log.
     */
    recordAttemptLifecycle(input: AttemptTraceInput) {
      return record(
        "attempt.lifecycle",
        { stage: input.stage, path: input.path, ...sanitizeAttemptTraceDetails(input.details ?? {}) },
        { attemptId: input.attemptId, correlationId: input.correlationId ?? null },
      );
    },
    /** Aggregate view of every attempt lifecycle recorded so far. */
    attemptLifecycleSummary(): AttemptLifecycleSummary {
      return summarizeAttemptLifecycles(events);
    },
    /**
     * Records the SERVER's held position from a live stream snapshot carried
     * by a server event. The values are the server's claim, copied verbatim.
     */
    recordPositionCheckpoint(
      snapshot: LiveRecitationStreamSnapshot | null,
      recordOpts: { attemptId?: string | null; correlationId?: string | null } = {},
    ) {
      if (!snapshot) return null;
      return record(
        "position.checkpoint",
        {
          surah: snapshot.tracker.surah,
          ayah: snapshot.tracker.ayah,
          wordIndex: snapshot.tracker.expectedWordIndex,
          source: "server-response",
          streamId: snapshot.streamId,
          phase: snapshot.phase,
        },
        recordOpts,
      );
    },
    get events(): ClientValidationEvent[] {
      return [...events];
    },
    toJSON() {
      return {
        runId,
        exportedAt: new Date().toISOString(),
        eventCount: events.length,
        events: [...events],
      };
    },
  };
}

export type ClientValidationLog = ReturnType<typeof createClientValidationLog>;

/** One app-audible interval reconstructed from a client validation log. */
export type PlaybackInterval = {
  /** Which app audio was audible: the tutor's voice, or a trusted recording. */
  source: "tutor" | "qari";
  /** ISO timestamps, backdated from the step's measured audible duration. */
  startedAt: string;
  endedAt: string;
  /** Event sequence numbers, for ordering against mic.reopened and the join. */
  startSeq: number;
  endSeq: number;
};

/**
 * Reconstructs playback intervals from client validation events, for ECHO-01
 * analysis. Pairs each `playback.started` with the next `playback.ended` of
 * the same source, in event order. A start with no matching end is dropped:
 * an interval with no end is not evidence. Never throws; malformed events
 * are skipped rather than trusted.
 */
export function extractPlaybackIntervals(events: ClientValidationEvent[]): PlaybackInterval[] {
  const intervals: PlaybackInterval[] = [];
  const open = new Map<"tutor" | "qari", ClientValidationEvent>();
  for (const event of events) {
    const source = event.details["playbackSource"];
    if (source !== "tutor" && source !== "qari") continue;
    if (event.type === "playback.started") {
      open.set(source, event);
    } else if (event.type === "playback.ended") {
      const start = open.get(source);
      open.delete(source);
      if (!start) continue;
      if (start.t > event.t) continue;
      intervals.push({
        source,
        startedAt: start.t,
        endedAt: event.t,
        startSeq: start.seq,
        endSeq: event.seq,
      });
    }
  }
  return intervals;
}

/**
 * Per-attempt submission lifecycle tracing.
 *
 * Answers one question for a validation run: for each learner attempt, did
 * its audio reach a submission, and if not, which step stopped it? Only the
 * `final` path (a finalised turn sent to `recitation.evaluateWithTutor` /
 * `recitation.evaluate` with ayah scope) can reach the shadow acoustic
 * evaluator; the `interim` path (rolling chunks to `ingestLiveAudio`) is
 * traced so its drops are not confused with missing final submissions.
 *
 * Privacy: identifiers, enums, byte counts, and durations only. Never raw
 * audio, base64, transcripts, Quran text, error messages, API keys, or
 * secrets — {@link sanitizeAttemptTraceDetails} enforces an allow-list.
 * Observation only: emitting a trace never changes what is submitted.
 */

/** Which submission route the attempt's audio was heading for. */
export type AttemptTracePath = "final" | "interim";

export type AttemptLifecycleStage =
  | "capture.started"
  | "capture.finalized"
  | "submission.eligible"
  | "submission.started"
  | "submission.responded"
  | "submission.failed"
  | "submission.skipped";

/** Why an attempt's audio was not submitted. */
export type AttemptSkipReason =
  /** Capture: the server interrupted the turn; its audio is discarded by design. */
  | "capture-interrupted"
  /** Capture: no speech, a recorder error, playback, pause, or stop closed the turn. */
  | "capture-abandoned"
  /** Final: no ayah was loaded when the turn arrived. */
  | "no-active-verse"
  /** Final: the recorder produced zero bytes. */
  | "no-audio"
  /** Final: over the upload limit; rejected before encoding. */
  | "too-large"
  /** Final/interim: the audio could not be read as base64. Nothing was sent. */
  | "encode-failed"
  /** Interim: no live stream is open (or the route is unavailable). */
  | "no-stream"
  /** Interim: the server's current directive refuses open chunks. */
  | "directive-refused"
  /** Interim: only ayah turns are streamed. */
  | "not-ayah-scope"
  /** Interim: a previous chunk's outcome is still unknown; this one is dropped. */
  | "request-outstanding"
  /** Interim: the stream closed or changed while the chunk was encoding. */
  | "stream-changed";

/** The only detail fields a lifecycle trace may carry. */
export type AttemptTraceDetails = {
  scope?: "ayah" | "word";
  /** Why a capture ended (`silence`, `max-turn`, `manual`, `interrupt`, `abandoned`). */
  endReason?: string;
  skipReason?: AttemptSkipReason;
  /** Which server route: `tutor` (trusted), `study` (plain), `live` (interim). */
  route?: "tutor" | "study" | "live";
  /** True when this submission can reach the acoustic evaluator (final + ayah). */
  acousticEligible?: boolean;
  mimeType?: string;
  bytes?: number;
  durationMs?: number;
  /** Time from `submission.started` to its answer or failure. */
  elapsedMs?: number;
  /** 1-based send attempt (interim retries reuse the same payload). */
  attempt?: number;
  sequence?: number;
  willRetry?: boolean;
  /** The server returned a recitation review (false: stale/lost session). */
  recitationReturned?: boolean;
  tutorStatus?: string;
  /** `quranAwareReview.status` — whether the acoustic evaluator ran. */
  acousticStatus?: string;
  reviewStatus?: string;
  recognitionStatus?: string;
  acknowledgementStatus?: string;
  /** tRPC error code or error class name. Never the message. */
  errorCode?: string;
};

export type AttemptTraceInput = {
  stage: AttemptLifecycleStage;
  path: AttemptTracePath;
  attemptId: string | null;
  correlationId?: string | null;
  details?: AttemptTraceDetails;
};

/** Additive tracing callback for hooks. Ignored when unset. */
export type AttemptTraceFn = (input: AttemptTraceInput) => void;

const TRACE_NUMBER_KEYS = ["bytes", "durationMs", "elapsedMs", "attempt", "sequence"] as const;
const TRACE_BOOLEAN_KEYS = ["acousticEligible", "willRetry", "recitationReturned"] as const;
const TRACE_ENUM_KEYS = [
  "endReason",
  "skipReason",
  "mimeType",
  "tutorStatus",
  "acousticStatus",
  "reviewStatus",
  "recognitionStatus",
  "acknowledgementStatus",
  "errorCode",
] as const;
/** Short identifier-like tokens only: no spaces, so no sentences or payloads. */
const TRACE_TOKEN = /^[A-Za-z0-9_.:/+-]{1,48}$/;

/**
 * Keeps only allow-listed, well-typed detail fields. Strings must be short
 * identifier-like tokens, so a message, transcript, or base64 payload can
 * never pass through. Never throws.
 */
export function sanitizeAttemptTraceDetails(raw: Record<string, unknown>): AttemptTraceDetails {
  const out: Record<string, unknown> = {};
  try {
    for (const key of TRACE_NUMBER_KEYS) {
      const value = raw[key];
      if (typeof value === "number" && Number.isFinite(value)) out[key] = Math.round(value);
    }
    for (const key of TRACE_BOOLEAN_KEYS) {
      if (typeof raw[key] === "boolean") out[key] = raw[key];
    }
    for (const key of TRACE_ENUM_KEYS) {
      const value = raw[key];
      if (typeof value === "string" && TRACE_TOKEN.test(value)) out[key] = value;
    }
    if (raw["scope"] === "ayah" || raw["scope"] === "word") out["scope"] = raw["scope"];
    if (raw["route"] === "tutor" || raw["route"] === "study" || raw["route"] === "live") out["route"] = raw["route"];
  } catch {
    /* a hostile getter: keep whatever was already copied */
  }
  return out as AttemptTraceDetails;
}

/**
 * A privacy-safe code for a failed request: the tRPC error code when there is
 * one, otherwise the error's class name. The message is never read.
 */
export function attemptErrorCode(error: unknown): string {
  return safe(() => {
    const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
    if (typeof code === "string" && TRACE_TOKEN.test(code)) return code;
    const name = (error as { name?: unknown } | null)?.name;
    if (typeof name === "string" && TRACE_TOKEN.test(name)) return name;
    return "unknown";
  }, "unknown");
}

/**
 * Calls a tracing callback without letting it affect the caller: a missing
 * callback is a no-op and a throwing one is swallowed.
 */
export function emitAttemptTrace(fn: AttemptTraceFn | undefined, input: AttemptTraceInput): void {
  if (!fn) return;
  try {
    fn(input);
  } catch {
    /* tracing is observation only */
  }
}

/** How one attempt's lifecycle ended, as far as the log can tell. */
export type AttemptLifecycleOutcome = "responded" | "failed" | "skipped" | "incomplete";

export type AttemptLifecycleRecord = {
  attemptId: string;
  correlationId: string | null;
  path: AttemptTracePath;
  stages: AttemptLifecycleStage[];
  outcome: AttemptLifecycleOutcome;
  skipReason: AttemptSkipReason | null;
  acousticEligible: boolean;
  acousticStatus: string | null;
};

type StageCounts = Record<AttemptLifecycleStage, number>;

export type AttemptLifecycleSummary = {
  attempts: AttemptLifecycleRecord[];
  /** Event counts per path and stage (anonymous skips included). */
  stageCounts: Record<AttemptTracePath, StageCounts>;
  skipReasons: Record<AttemptTracePath, Partial<Record<AttemptSkipReason, number>>>;
  /** Final ayah submissions by the acoustic status the server reported. */
  acousticStatuses: Record<string, number>;
};

const LIFECYCLE_STAGES: AttemptLifecycleStage[] = [
  "capture.started",
  "capture.finalized",
  "submission.eligible",
  "submission.started",
  "submission.responded",
  "submission.failed",
  "submission.skipped",
];

function emptyStageCounts(): StageCounts {
  return Object.fromEntries(LIFECYCLE_STAGES.map((stage) => [stage, 0])) as StageCounts;
}

/**
 * Groups `attempt.lifecycle` events by attempt, in log order. An attempt's
 * outcome is its last terminal stage: a response, a failure with no retry
 * left, or a skip; anything else is `incomplete` (e.g. a capture that never
 * finalised because the microphone was released). Never throws.
 */
export function summarizeAttemptLifecycles(events: ClientValidationEvent[]): AttemptLifecycleSummary {
  const summary: AttemptLifecycleSummary = {
    attempts: [],
    stageCounts: { final: emptyStageCounts(), interim: emptyStageCounts() },
    skipReasons: { final: {}, interim: {} },
    acousticStatuses: {},
  };
  const byId = new Map<string, AttemptLifecycleRecord>();
  for (const event of events) {
    if (event.type !== "attempt.lifecycle") continue;
    const stage = event.details["stage"] as AttemptLifecycleStage;
    const path = event.details["path"] as AttemptTracePath;
    if (!LIFECYCLE_STAGES.includes(stage) || (path !== "final" && path !== "interim")) continue;
    summary.stageCounts[path][stage] += 1;
    const skipReason = (event.details["skipReason"] as AttemptSkipReason | undefined) ?? null;
    if (stage === "submission.skipped" && skipReason) {
      summary.skipReasons[path][skipReason] = (summary.skipReasons[path][skipReason] ?? 0) + 1;
    }
    const acousticStatus = typeof event.details["acousticStatus"] === "string" ? event.details["acousticStatus"] : null;
    if (stage === "submission.responded" && path === "final" && acousticStatus) {
      summary.acousticStatuses[acousticStatus] = (summary.acousticStatuses[acousticStatus] ?? 0) + 1;
    }
    if (!event.attemptId) continue;
    let entry = byId.get(event.attemptId);
    if (!entry) {
      entry = {
        attemptId: event.attemptId,
        correlationId: event.correlationId,
        path,
        stages: [],
        outcome: "incomplete",
        skipReason: null,
        acousticEligible: false,
        acousticStatus: null,
      };
      byId.set(event.attemptId, entry);
      summary.attempts.push(entry);
    }
    entry.stages.push(stage);
    if (event.details["acousticEligible"] === true) entry.acousticEligible = true;
    if (stage === "submission.responded") {
      entry.outcome = "responded";
      entry.acousticStatus = acousticStatus;
    } else if (stage === "submission.failed") {
      if (event.details["willRetry"] !== true) entry.outcome = "failed";
    } else if (stage === "submission.skipped") {
      entry.outcome = "skipped";
      entry.skipReason = skipReason;
    }
  }
  return summary;
}

/** The parts of a review answer the final-path trace reads. Enums only. */
export type FinalAttemptAnswer = {
  recitation?: { quranAwareReview?: { status?: string } | null; reviewStatus?: string } | null;
  tutor?: { status?: string } | null;
};

/**
 * The lifecycle trace for one finalised recording on its way to
 * `recitation.evaluateWithTutor` (route `tutor`) or `recitation.evaluate`
 * (route `study`) — the only routes that can reach the acoustic evaluator.
 * Holds the timing and answered state so the caller's code stays one call
 * per step. Every method is a no-op when `fn` is unset and never throws.
 */
export function createFinalAttemptTrace(
  fn: AttemptTraceFn | undefined,
  ids: { attemptId: string; correlationId: string | null; scope: "ayah" | "word" },
  now: () => number = Date.now,
) {
  let startedAtMs: number | null = null;
  let answered = false;
  const emit = (stage: AttemptLifecycleStage, details: AttemptTraceDetails = {}) =>
    emitAttemptTrace(fn, {
      stage,
      path: "final",
      attemptId: ids.attemptId,
      correlationId: ids.correlationId,
      details: { scope: ids.scope, ...details },
    });
  const elapsed = () => (startedAtMs === null ? undefined : now() - startedAtMs);
  return {
    skipped(skipReason: AttemptSkipReason, details: AttemptTraceDetails = {}) {
      emit("submission.skipped", { ...details, skipReason });
    },
    /** Passed the client's own checks; the audio is about to be encoded. */
    eligible(blob: { size: number; type: string }) {
      emit("submission.eligible", {
        bytes: blob.size,
        mimeType: blob.type.split(";")[0] || undefined,
        acousticEligible: ids.scope === "ayah",
      });
    },
    started(route: "tutor" | "study") {
      startedAtMs = now();
      emit("submission.started", { route, acousticEligible: ids.scope === "ayah" });
    },
    responded(route: "tutor" | "study", answer: FinalAttemptAnswer | null | undefined) {
      answered = true;
      const recitation = answer?.recitation ?? null;
      emit("submission.responded", {
        route,
        elapsedMs: elapsed(),
        recitationReturned: Boolean(recitation),
        tutorStatus: answer?.tutor?.status,
        acousticStatus: recitation?.quranAwareReview?.status,
        reviewStatus: recitation?.reviewStatus,
      });
    },
    /**
     * The review threw. Before `started` nothing was sent (the audio could
     * not be encoded); after an answer the failure is the page's, not the
     * submission's, and is not traced as one.
     */
    failed(error: unknown) {
      if (startedAtMs === null) {
        emit("submission.skipped", { skipReason: "encode-failed" });
        return;
      }
      if (answered) return;
      emit("submission.failed", { elapsedMs: elapsed(), errorCode: attemptErrorCode(error), willRetry: false });
    },
  };
}
