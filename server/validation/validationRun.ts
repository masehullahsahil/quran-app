/**
 * Validation instrumentation for the Quran app's real-device validation plan.
 *
 * ADDITIVE ONLY. This module observes; it never decides Quran correctness,
 * alignment, advancement, or correction semantics. It records raw measurements
 * into an append-only ledger and renders reports. Any numeric threshold
 * comparison lives in the report layer, labeled as a provisional pilot target,
 * and never in release logic.
 *
 * Safety rules for recorded payloads:
 * - No audio bytes, no base64 audio, no raw transcripts (word indexes only).
 * - No tokens, secrets, passwords, cookies, or authorization material.
 * - No PII (emails, phone numbers, IP addresses).
 * See sanitizeDetails() for the enforced denylist.
 */
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Run / attempt IDs
// ---------------------------------------------------------------------------

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

/** One validation run (e.g. one device session through the plan's scenarios). */
export function createRunId(): string {
  return `run_${randomHex(12)}`;
}

/** One recitation attempt inside a run (e.g. one ayah recitation). */
export function createAttemptId(): string {
  return `att_${randomHex(12)}`;
}

export function isRunId(value: string): boolean {
  return /^run_[0-9a-f]{24}$/.test(value);
}

export function isAttemptId(value: string): boolean {
  return /^att_[0-9a-f]{24}$/.test(value);
}

// ---------------------------------------------------------------------------
// Build / version capture
// ---------------------------------------------------------------------------

export type BuildInfo = {
  appVersion: string;
  commit: string;
  vercelEnv: string;
  nodeEnv: string;
  capturedAt: string;
};

let cachedAppVersion: string | null = null;

function readAppVersion(): string {
  if (cachedAppVersion) return cachedAppVersion;
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let depth = 0; depth < 6; depth++) {
      try {
        const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
          name?: string;
          version?: string;
        };
        if (pkg.name && typeof pkg.version === "string") {
          cachedAppVersion = pkg.version;
          return cachedAppVersion;
        }
      } catch {
        // Keep walking up.
      }
      dir = path.dirname(dir);
    }
  } catch {
    // Fall through to "unknown".
  }
  cachedAppVersion = "unknown";
  return cachedAppVersion;
}

function readGitCommit(): string {
  try {
    const out = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[0-9a-f]{40}$/i.test(out) ? out : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Captures build/version metadata. Never throws and never fails the run when
 * git metadata is unavailable (falls back to "unknown").
 */
export function captureBuildInfo(env: NodeJS.ProcessEnv = process.env): BuildInfo {
  let commit = "unknown";
  let vercelEnv = "unknown";
  try {
    commit = env.VERCEL_GIT_COMMIT_SHA || env.BUILD_COMMIT_SHA || readGitCommit();
    vercelEnv = env.VERCEL_ENV || "unknown";
  } catch {
    // Keep "unknown" fallbacks.
  }
  return {
    appVersion: readAppVersion(),
    commit,
    vercelEnv,
    nodeEnv: env.NODE_ENV || "unknown",
    capturedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Event model
// ---------------------------------------------------------------------------

export const VALIDATION_EVENT_TYPES = [
  "session.start",
  "device.metadata",
  "position.checkpoint",
  "correction.decided",
  "tutor.interrupted",
  "playback.started",
  "playback.ended",
  "mic.reopened",
  "attempt.completed",
  "safety.outcome",
  "blocker.recorded",
  "client.event",
  "note",
] as const;

export type ValidationEventType = (typeof VALIDATION_EVENT_TYPES)[number];

export type ValidationEvent = {
  seq: number;
  t: string;
  runId: string;
  attemptId: string | null;
  correlationId: string | null;
  type: ValidationEventType;
  details: Record<string, unknown>;
};

/**
 * Server-held Quran position. `source` records where the checkpoint was read:
 * - "server": recorded directly on the server from its held state.
 * - "server-response": copied verbatim from a server response (tRPC/transport)
 *   by the validation client. This is the server's claim, never a client claim.
 * - "harness": from the offline validation harness driving the server pipeline.
 */
export type PositionCheckpoint = {
  surah: number;
  ayah: number;
  wordIndex: number | null;
  source: "server" | "server-response" | "harness";
  /** Where the evidence for this position came from, when known. */
  evidenceSource?: "learner-audio" | "sample-audio" | "none";
  /** True when this checkpoint was derived from audio (used by ECHO-01). */
  audioDerived?: boolean;
  /** Quran-state mutation attributed with this checkpoint, when known. */
  quranStateMutation?: "advance" | "correction-satisfied" | "position-change" | null;
  note?: string;
};

export type SafetySeverity = "blocker" | "serious" | "info";

export type SafetyOutcome = {
  severity: SafetySeverity;
  code: string;
  description: string;
  evidence?: Record<string, unknown>;
};

export type DeviceMetadata = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Payload sanitization
// ---------------------------------------------------------------------------

/** Normalized key names that must never appear in the ledger. Exact match. */
const REDACTED_KEYS = new Set([
  // Secrets / credentials.
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "secret",
  "clientsecret",
  "password",
  "passwd",
  "apikey",
  "apisecret",
  "authorization",
  "cookie",
  "cookies",
  "sessionid",
  "sessiontoken",
  // Audio payloads.
  "audiobase64",
  "audiobytes",
  "audiobuffer",
  "audiodata",
  // Raw transcripts (the ledger keeps word indexes only).
  "transcript",
  "transcripttext",
  "transcriptreturned",
  "normalizedtranscript",
  "rawtranscript",
  // PII.
  "email",
  "emailaddress",
  "phone",
  "phonenumber",
  "ipaddress",
]);

const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_LENGTH = 200;
const MAX_DEPTH = 6;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[truncated: max depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}[truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, depth + 1));
    return value.length > MAX_ARRAY_LENGTH ? [...items, `[truncated: ${value.length - MAX_ARRAY_LENGTH} more]`] : items;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(normalizeKey(key)) ? "[redacted]" : sanitizeValue(entry, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Deep-sanitizes an event details payload. Never throws. */
export function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  try {
    return sanitizeValue(details, 0) as Record<string, unknown>;
  } catch {
    return { sanitizeError: true };
  }
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export type RecordOptions = {
  attemptId?: string | null;
  correlationId?: string | null;
  /** Explicit event time (ISO string). Defaults to now. */
  t?: string;
};

export class ValidationLedger {
  readonly runId: string;
  readonly build: BuildInfo;
  readonly deviceMetadata: DeviceMetadata;
  readonly startedAt: string;

  private eventsList: ValidationEvent[] = [];
  private nextSeq = 1;

  constructor(opts: {
    runId: string;
    build: BuildInfo;
    deviceMetadata?: DeviceMetadata;
    startedAt?: string;
  }) {
    this.runId = opts.runId;
    this.build = opts.build;
    this.deviceMetadata = sanitizeDetails(opts.deviceMetadata ?? {});
    this.startedAt = opts.startedAt ?? new Date().toISOString();
  }

  record(
    type: ValidationEventType,
    details: Record<string, unknown> = {},
    opts: RecordOptions = {},
  ): ValidationEvent {
    const event: ValidationEvent = {
      seq: this.nextSeq++,
      t: opts.t ?? new Date().toISOString(),
      runId: this.runId,
      attemptId: opts.attemptId ?? null,
      correlationId: opts.correlationId ?? null,
      type,
      details: sanitizeDetails(details),
    };
    this.eventsList.push(event);
    return event;
  }

  recordPosition(checkpoint: PositionCheckpoint, opts: RecordOptions = {}): ValidationEvent {
    return this.record("position.checkpoint", { ...checkpoint }, opts);
  }

  recordSafetyOutcome(outcome: SafetyOutcome, opts: RecordOptions = {}): ValidationEvent {
    const type: ValidationEventType = outcome.severity === "blocker" ? "blocker.recorded" : "safety.outcome";
    return this.record(type, { ...outcome, evidence: outcome.evidence ?? {} }, opts);
  }

  get events(): ValidationEvent[] {
    return [...this.eventsList];
  }

  eventsOfType(type: ValidationEventType): ValidationEvent[] {
    return this.eventsList.filter((event) => event.type === type);
  }

  // -- Derived analyses ----------------------------------------------------

  computeTimings(): TimingSummary {
    const byAttempt = new Map<string, ValidationEvent[]>();
    for (const event of this.eventsList) {
      const key = event.attemptId ?? "__run__";
      const list = byAttempt.get(key) ?? [];
      list.push(event);
      byAttempt.set(key, list);
    }
    const perAttempt: AttemptTimings[] = [];
    byAttempt.forEach((attemptEvents, attemptId) => {
      const at = (type: ValidationEventType): ValidationEvent | undefined =>
        attemptEvents.find((event) => event.type === type);
      const decided = at("correction.decided");
      const interrupted = at("tutor.interrupted");
      const playbackStart = at("playback.started");
      const playbackEnd = at("playback.ended");
      const micReopened = at("mic.reopened");
      const ms = (a?: ValidationEvent, b?: ValidationEvent): number | null =>
        a && b ? Date.parse(b.t) - Date.parse(a.t) : null;
      perAttempt.push({
        attemptId: attemptId === "__run__" ? null : attemptId,
        correctionToInterruptionMs: ms(decided, interrupted),
        interruptionToPlaybackStartMs: ms(interrupted, playbackStart),
        playbackDurationMs: ms(playbackStart, playbackEnd),
        playbackEndToMicReopenMs: ms(playbackEnd, micReopened),
        correctionToMicReopenMs: ms(decided, micReopened),
      });
    });
    return { perAttempt };
  }

  computeEchoLeak(): EchoLeakResult {
    const intervals: PlaybackInterval[] = [];
    const byAttempt = new Map<string, ValidationEvent[]>();
    for (const event of this.eventsList) {
      const key = event.attemptId ?? "__run__";
      const list = byAttempt.get(key) ?? [];
      list.push(event);
      byAttempt.set(key, list);
    }
    for (const attemptEvents of Array.from(byAttempt.values())) {
      const ordered = [...attemptEvents].sort((a, b) => Date.parse(a.t) - Date.parse(b.t) || a.seq - b.seq);
      let open: ValidationEvent | null = null;
      for (const event of ordered) {
        if (event.type === "playback.started" && !open) {
          open = event;
        } else if (event.type === "playback.ended" && open) {
          intervals.push({ startedAt: open.t, endedAt: event.t, attemptId: open.attemptId });
          open = null;
        }
      }
      if (open) intervals.push({ startedAt: open.t, endedAt: null, attemptId: open.attemptId });
    }

    const learnerEvidenceTypes: ValidationEventType[] = [
      "position.checkpoint",
      "correction.decided",
      "tutor.interrupted",
      "attempt.completed",
    ];
    const offendingEvents: ValidationEvent[] = [];
    const mutationsDuringPlayback: ValidationEvent[] = [];
    for (const interval of intervals) {
      const start = Date.parse(interval.startedAt);
      const end = interval.endedAt ? Date.parse(interval.endedAt) : Number.POSITIVE_INFINITY;
      for (const event of this.eventsList) {
        const t = Date.parse(event.t);
        if (!(t > start && t <= end)) continue;
        if (event.attemptId !== interval.attemptId && interval.attemptId !== null) continue;
        const details = event.details as { audioDerived?: unknown; quranStateMutation?: unknown };
        if (learnerEvidenceTypes.includes(event.type) && details.audioDerived === true) {
          offendingEvents.push(event);
        }
        if (details.quranStateMutation) {
          mutationsDuringPlayback.push(event);
        }
      }
    }

    return {
      intervals,
      offendingEvents,
      mutationsDuringPlayback,
      playbackLeakFalseEvidenceRate:
        intervals.length === 0 ? null : offendingEvents.length / intervals.length,
    };
  }

  computeVerdict(): ValidationVerdict {
    const blockers = this.eventsOfType("blocker.recorded");
    const serious = this.eventsOfType("safety.outcome").filter(
      (event) => (event.details as { severity?: string }).severity === "serious",
    );
    return {
      status: blockers.length > 0 ? "fail" : "pass",
      blockerCount: blockers.length,
      seriousCount: serious.length,
      blockers: blockers.map((event) => event.details as SafetyOutcome & Record<string, unknown>),
    };
  }

  toJSON(): ValidationLedgerExport {
    return {
      runId: this.runId,
      build: this.build,
      deviceMetadata: this.deviceMetadata,
      startedAt: this.startedAt,
      exportedAt: new Date().toISOString(),
      eventCount: this.eventsList.length,
      events: this.events,
      timings: this.computeTimings(),
      echo: {
        intervals: this.computeEchoLeak().intervals,
        offendingEventCount: this.computeEchoLeak().offendingEvents.length,
        mutationsDuringPlaybackCount: this.computeEchoLeak().mutationsDuringPlayback.length,
        playbackLeakFalseEvidenceRate: this.computeEchoLeak().playbackLeakFalseEvidenceRate,
      },
      verdict: this.computeVerdict(),
    };
  }
}

// ---------------------------------------------------------------------------
// Derived-analysis types
// ---------------------------------------------------------------------------

export type AttemptTimings = {
  attemptId: string | null;
  correctionToInterruptionMs: number | null;
  interruptionToPlaybackStartMs: number | null;
  playbackDurationMs: number | null;
  playbackEndToMicReopenMs: number | null;
  correctionToMicReopenMs: number | null;
};

export type TimingSummary = {
  perAttempt: AttemptTimings[];
};

export type PlaybackInterval = {
  startedAt: string;
  endedAt: string | null;
  attemptId: string | null;
};

export type EchoLeakResult = {
  intervals: PlaybackInterval[];
  offendingEvents: ValidationEvent[];
  mutationsDuringPlayback: ValidationEvent[];
  /** Offending learner-evidence events per playback interval. Null when no playback occurred. */
  playbackLeakFalseEvidenceRate: number | null;
};

export type ValidationVerdict = {
  status: "pass" | "fail";
  blockerCount: number;
  seriousCount: number;
  blockers: Array<SafetyOutcome & Record<string, unknown>>;
};

export type ValidationLedgerExport = {
  runId: string;
  build: BuildInfo;
  deviceMetadata: DeviceMetadata;
  startedAt: string;
  exportedAt: string;
  eventCount: number;
  events: ValidationEvent[];
  timings: TimingSummary;
  echo: {
    intervals: PlaybackInterval[];
    offendingEventCount: number;
    mutationsDuringPlaybackCount: number;
    playbackLeakFalseEvidenceRate: number | null;
  };
  verdict: ValidationVerdict;
};

// ---------------------------------------------------------------------------
// Markdown report
// ---------------------------------------------------------------------------

/**
 * Provisional pilot targets. These are NEVER release gates and NEVER claims
 * about current app performance. They exist only so a human reviewer can
 * compare raw measurements against the plan's proposed numbers.
 */
export type PilotTargets = {
  noFalseCorrectionRate?: number;
  clearOmissionDetectionRate?: number;
  maxCorrectionLatencyMs?: number;
  maxPlaybackResumeLatencyMs?: number;
  minPositionAccuracy?: number;
};

const PROVISIONAL_LABEL = "PROVISIONAL PILOT TARGET";

function fmtMs(value: number | null): string {
  return value === null || Number.isNaN(value) ? "n/a" : `${Math.round(value)} ms`;
}

function metadataRows(metadata: DeviceMetadata): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return "_none recorded_\n";
  return entries.map(([key, value]) => `| ${key} | ${JSON.stringify(value) ?? "n/a"} |`).join("\n");
}

/**
 * Renders a human-readable markdown validation report. Raw measurements only;
 * any threshold comparison is labeled as a provisional pilot target.
 */
export function renderMarkdownReport(
  ledger: ValidationLedger,
  opts: { title?: string; pilotTargets?: PilotTargets } = {},
): string {
  const title = opts.title ?? "Quran App — Real-Device Validation Report";
  const timings = ledger.computeTimings();
  const echo = ledger.computeEchoLeak();
  const verdict = ledger.computeVerdict();
  const checkpoints = ledger.eventsOfType("position.checkpoint");
  const safetyEvents = ledger.events.filter(
    (event) => event.type === "safety.outcome" || event.type === "blocker.recorded",
  );

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- Run ID: \`${ledger.runId}\``);
  lines.push(`- Started: ${ledger.startedAt}`);
  lines.push(`- Events recorded: ${ledger.events.length}`);
  lines.push("");

  lines.push("## Build / version");
  lines.push("");
  lines.push(`- App version: \`${ledger.build.appVersion}\``);
  lines.push(`- Commit: \`${ledger.build.commit}\``);
  lines.push(`- Vercel env: \`${ledger.build.vercelEnv}\``);
  lines.push(`- Node env: \`${ledger.build.nodeEnv}\``);
  lines.push(`- Captured at: ${ledger.build.capturedAt}`);
  lines.push("");

  lines.push("## Device / environment metadata");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("| --- | --- |");
  lines.push(metadataRows(ledger.deviceMetadata));
  lines.push("");

  lines.push("## Correction / interruption / playback timing");
  lines.push("");
  lines.push(
    "| Attempt | Correction → interrupt | Interrupt → playback | Playback duration | Playback end → mic reopen | Correction → mic reopen |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- |");
  if (timings.perAttempt.length === 0) {
    lines.push("| _none_ | n/a | n/a | n/a | n/a | n/a |");
  } else {
    for (const row of timings.perAttempt) {
      lines.push(
        `| \`${row.attemptId ?? "run"}\` | ${fmtMs(row.correctionToInterruptionMs)} | ${fmtMs(row.interruptionToPlaybackStartMs)} | ${fmtMs(row.playbackDurationMs)} | ${fmtMs(row.playbackEndToMicReopenMs)} | ${fmtMs(row.correctionToMicReopenMs)} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Position checkpoints (server-held)");
  lines.push("");
  lines.push(
    "Checkpoints record the SERVER's held position (`source` shows where the value was read). A wrong server-held position that could cause a wrong correction or advance is a serious safety issue.",
  );
  lines.push("");
  lines.push("| # | Time | Attempt | Surah | Ayah | Word index | Source | Audio-derived | State mutation |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  if (checkpoints.length === 0) {
    lines.push("| _none_ | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |");
  } else {
    checkpoints.forEach((event, index) => {
      const d = event.details as unknown as PositionCheckpoint;
      lines.push(
        `| ${index + 1} | ${event.t} | \`${event.attemptId ?? "—"}\` | ${d.surah} | ${d.ayah} | ${d.wordIndex ?? "n/a"} | ${d.source} | ${d.audioDerived === true ? "yes" : "no"} | ${d.quranStateMutation ?? "none"} |`,
      );
    });
  }
  lines.push("");

  lines.push("## ECHO-01 — speaker-to-microphone feedback / echo");
  lines.push("");
  lines.push(`- Playback intervals observed: ${echo.intervals.length}`);
  lines.push(
    `- Playback-leak false-evidence rate: ${echo.playbackLeakFalseEvidenceRate === null ? "n/a (no playback intervals)" : echo.playbackLeakFalseEvidenceRate.toFixed(3)} (learner-evidence events derived from audio during playback ÷ playback intervals)`,
  );
  lines.push(`- Offending learner-evidence events during playback: ${echo.offendingEvents.length}`);
  lines.push(`- Quran-state mutations during playback: ${echo.mutationsDuringPlayback.length}`);
  if (echo.mutationsDuringPlayback.length > 0) {
    lines.push(
      "- **BLOCKER:** Tutor/Qari playback caused Quran-state mutation. Playback must never advance the learner, satisfy a correction, or become learner evidence.",
    );
    for (const event of echo.mutationsDuringPlayback) {
      lines.push(
        `  - seq ${event.seq} at ${event.t} (attempt \`${event.attemptId ?? "—"}\`): ${JSON.stringify(event.details.quranStateMutation)}`,
      );
    }
  }
  lines.push("");

  lines.push("## Safety outcomes");
  lines.push("");
  if (safetyEvents.length === 0) {
    lines.push("_none recorded_");
  } else {
    lines.push("| Severity | Code | Description |");
    lines.push("| --- | --- | --- |");
    for (const event of safetyEvents) {
      const d = event.details as unknown as SafetyOutcome;
      lines.push(`| ${d.severity} | \`${d.code}\` | ${d.description} |`);
    }
  }
  lines.push("");

  if (opts.pilotTargets) {
    lines.push("## Provisional pilot targets (NOT release gates)");
    lines.push("");
    lines.push(
      `> ${PROVISIONAL_LABEL}: the numbers below are proposed pilot targets from the validation plan. They are NOT claims about current app performance, NOT hard-coded release logic, and NOT gates. The first real-device baseline may revise them with qualified Quran-reviewer and product/engineering approval.`,
    );
    lines.push("");
    const t = opts.pilotTargets;
    lines.push("| Target | Value |");
    lines.push("| --- | --- |");
    if (t.noFalseCorrectionRate !== undefined)
      lines.push(`| No-false-correction rate (${PROVISIONAL_LABEL}) | ${t.noFalseCorrectionRate} |`);
    if (t.clearOmissionDetectionRate !== undefined)
      lines.push(`| Clear-omission detection rate (${PROVISIONAL_LABEL}) | ${t.clearOmissionDetectionRate} |`);
    if (t.maxCorrectionLatencyMs !== undefined)
      lines.push(`| Max correction latency (${PROVISIONAL_LABEL}) | ${t.maxCorrectionLatencyMs} ms |`);
    if (t.maxPlaybackResumeLatencyMs !== undefined)
      lines.push(`| Max playback-resume latency (${PROVISIONAL_LABEL}) | ${t.maxPlaybackResumeLatencyMs} ms |`);
    if (t.minPositionAccuracy !== undefined)
      lines.push(`| Min position accuracy (${PROVISIONAL_LABEL}) | ${t.minPositionAccuracy} |`);
    lines.push("");
  }

  lines.push("## Verdict");
  lines.push("");
  lines.push(`- Status: **${verdict.status.toUpperCase()}**`);
  lines.push(`- Blockers: ${verdict.blockerCount}`);
  lines.push(`- Serious: ${verdict.seriousCount}`);
  lines.push("");
  lines.push(
    "Verdict reflects recorded blocker outcomes only. It does not apply numeric thresholds; threshold comparison happens above, labeled as provisional pilot targets.",
  );
  lines.push("");

  return lines.join("\n");
}
