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
      recordOpts: { attemptId?: string | null; correlationId?: string | null } = {},
    ) {
      return record("playback.started", { playbackSource: source }, recordOpts);
    },
    recordPlaybackEnded(
      source: "tutor" | "qari",
      recordOpts: { attemptId?: string | null; correlationId?: string | null } = {},
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
