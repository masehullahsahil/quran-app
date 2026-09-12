/**
 * Connects the existing client validation capture to the real live Tutor
 * flow. Wave 0 wiring: no new validation system, no behavior change.
 *
 * When a staff validation run is active (`?validation=1&validationRunId=…`),
 * this hook creates one {@link ClientValidationLog} and returns drop-in
 * instrumentation callbacks for the hooks that already expose an additive
 * `onInstrument` channel:
 *
 * - `useTutorPlaybackOrchestrator` → `instrumentPlayback`
 *   - `tts.step` with `spoken: true` → a `tutor` playback interval
 *     (`playback.started` / `playback.ended`, backdated from `audibleMs`)
 *   - `qari.step` with `audible: true` → a `qari` playback interval
 *   - non-audible steps → a numeric `client.event` trace, never an interval
 *   - `mic.reopened` → `mic.reopened` with the resume scope and the measured
 *     gap since playback ended
 * - `useLiveRecitationStream` → `instrumentLive`
 *   - `interim.abandoned` → a numeric `client.event` trace
 *
 * Outside a validation run every callback is `undefined` and no log exists,
 * so ordinary sessions are byte-for-byte unaffected: the hooks treat an
 * unset `onInstrument` as "do not instrument".
 *
 * What is recorded is timing and enums only: playback source
 * (`tutor`/`qari`), resume scope (`word`/`ayah`), durations in milliseconds.
 * Locale message keys, Quran text, transcripts, audio, and PII are never
 * forwarded — the mapping picks known-numeric fields explicitly rather than
 * spreading the hook's details object.
 *
 * The log is observation-only and in-memory. It never calls the network, so
 * recording playback evidence cannot mutate Quran state: the server remains
 * the sole authority for position, correction, and advancement.
 *
 * Staff export (validation mode only): the log is exposed as
 * `window.__quranValidationLog`; the rehearsal runbook copies
 * `JSON.stringify(window.__quranValidationLog.toJSON())` from the devtools
 * console and joins it with the server ledger on `runId` (+ `correlationId`
 * where the server echoed one).
 */
import { useRef } from "react";
import {
  collectDeviceMetadata,
  createClientValidationLog,
  getActiveValidationRunId,
  type ClientValidationLog,
} from "@/lib/validationCapture";

/** The orchestrator kinds this wiring accepts. Mirrors its `onInstrument`. */
export type PlaybackInstrumentKind = "tts.step" | "qari.step" | "mic.reopened";
/** The live-stream kinds this wiring accepts. Mirrors its `onInstrument`. */
export type LiveInstrumentKind = "interim.abandoned";

export type ClientValidationWiring = {
  /** The run log, or null outside a staff validation run. */
  log: ClientValidationLog | null;
  /**
   * Drop-in for `useTutorPlaybackOrchestrator`'s `onInstrument`. `undefined`
   * when no validation run is active.
   */
  instrumentPlayback:
    | ((kind: PlaybackInstrumentKind, details: Record<string, unknown>) => void)
    | undefined;
  /**
   * Drop-in for `useLiveRecitationStream`'s `onInstrument`. `undefined` when
   * no validation run is active.
   */
  instrumentLive:
    | ((kind: LiveInstrumentKind, details: Record<string, unknown>) => void)
    | undefined;
};

/** Finite numbers pass; everything else is not evidence. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * One playback interval, backdated from the step's measured audible
 * duration. The orchestrator reports the step at resolution time; the
 * interval is [resolution − audibleMs, resolution].
 */
function recordInterval(log: ClientValidationLog, source: "tutor" | "qari", audibleMs: number): void {
  const endedAt = Date.now();
  const startedAt = endedAt - Math.max(0, audibleMs);
  log.recordPlaybackStarted(source, { t: new Date(startedAt).toISOString() });
  log.recordPlaybackEnded(source, { t: new Date(endedAt).toISOString() });
}

/** Validation-mode-only staff handle for exporting the log. Never in production. */
function exposeForStaffExport(log: ClientValidationLog): void {
  try {
    if (typeof window !== "undefined") {
      (window as unknown as { __quranValidationLog?: ClientValidationLog }).__quranValidationLog = log;
    }
  } catch {
    /* a locked-down embedder: export is then unavailable, recording continues */
  }
}

function createWiring(): ClientValidationWiring {
  const runId = getActiveValidationRunId();
  if (!runId) {
    return { log: null, instrumentPlayback: undefined, instrumentLive: undefined };
  }
  const log = createClientValidationLog({ runId });
  log.recordDeviceMetadata(collectDeviceMetadata());
  exposeForStaffExport(log);

  const instrumentPlayback = (kind: PlaybackInstrumentKind, details: Record<string, unknown>): void => {
    if (kind === "tts.step") {
      // Only an actually-spoken sentence is app audio. A shown-only sentence
      // holds the mic closed but makes no sound: no ECHO-01 interval.
      // The locale message key is deliberately not forwarded.
      if (details["spoken"] === true) {
        recordInterval(log, "tutor", num(details["audibleMs"]) ?? 0);
      } else {
        log.recordInstrumentation("tts.step", { audibleMs: 0 });
      }
      return;
    }
    if (kind === "qari.step") {
      if (details["audible"] === true) {
        recordInterval(log, "qari", num(details["audibleMs"]) ?? 0);
      } else {
        log.recordInstrumentation("qari.step", { audibleMs: 0 });
      }
      return;
    }
    // mic.reopened — the microphone actually opened, and how long after
    // playback ended. Only the resume scope and the numeric gap are kept.
    const scope = details["scope"];
    const extra: Record<string, unknown> = {};
    const gapMs = num(details["msSincePlaybackEnd"]);
    if (gapMs !== null) extra["msSincePlaybackEnd"] = gapMs;
    log.recordMicReopened(scope === "word" || scope === "ayah" ? scope : undefined, undefined, extra);
  };

  const instrumentLive = (kind: LiveInstrumentKind, details: Record<string, unknown>): void => {
    if (kind === "interim.abandoned") {
      const extra: Record<string, unknown> = {};
      const attempts = num(details["attempts"]);
      if (attempts !== null) extra["attempts"] = attempts;
      log.recordInstrumentation("interim.abandoned", extra);
    }
  };

  return { log, instrumentPlayback, instrumentLive };
}

/**
 * The validation wiring for the live Tutor flow. Created once per mount;
 * stable across renders. Outside a staff validation run this returns nulls
 * and undefineds — the instrumented hooks then behave exactly as uninstrumented.
 */
export function useClientValidationWiring(): ClientValidationWiring {
  const stateRef = useRef<ClientValidationWiring | null>(null);
  if (stateRef.current === null) {
    stateRef.current = createWiring();
  }
  return stateRef.current;
}
