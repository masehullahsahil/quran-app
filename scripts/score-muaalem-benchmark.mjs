#!/usr/bin/env node
/**
 * Muaalem benchmark scorecard — read-only analysis of one evidence bundle.
 *
 * Reads a validation evidence bundle produced by the client's
 * "Finish & download bundle" flow (see
 * client/src/components/ValidationEvidencePanel.tsx):
 *
 *   {
 *     "schemaVersion": 1,
 *     "runId": "run_…",
 *     "exportedAt": "…",
 *     "client": { "runId": "…", "exportedAt": "…", "eventCount": N, "events": […] },
 *     "server": { …, "attemptDiagnostics": [ … ] }
 *   }
 *
 * The benchmark is a controlled session: scripted known-correct recitations
 * (controls) and intentionally-incorrect recitations labeled by error type.
 * Labels ride on client `note` events whose `details.benchmarkLabel` is
 *
 *   { variant: "correct" | "incorrect",
 *     errorType: "wrong-word" | "omitted-word" | "mispronounced-letter"
 *              | "extra-word" | "word-order-swap" | null,
 *     surah: <number>, ayah: <number> }
 *
 * keyed by the client attempt id. A `--labels <file>` JSON array (or object
 * keyed by attempt id) with the same shape overrides / supplements notes.
 *
 * What "flagged" means — read this before quoting a rate: the server ledger
 * records aggregate Muaalem shadow diagnostics per attempt
 * (`shadowStatus`, `shadowAveragePosterior`, decoded-level / phoneme-token
 * counts, latencies). It does NOT record whether the shadow service emitted
 * specific findings. So:
 *
 *   flagged    = shadowStatus "available"  (the service returned an
 *                assessment it did not abstain from)
 *   quiet      = shadowStatus "abstained"   (the service declined)
 *   unassessed = shadowStatus "unavailable" | "not_run" | "not_configured"
 *                (or no shadow diagnostics at all)
 *
 * "flagged" is the service's own status claim, not proof that a specific
 * finding was recorded. Treat every rate below as descriptive telemetry for
 * a qualified reviewer, not as a verdict.
 *
 * Analysis rules (Real-Device Validation Plan): counts and denominators sit
 * beside every percentage. This script never encodes pilot thresholds and
 * never emits a GO / NO-GO / CONDITIONAL verdict. No transcripts, audio,
 * Quran text, secrets, or PII are read or printed — only identifiers, enums,
 * counts, and numeric aggregates.
 *
 * Usage:
 *   node scripts/score-muaalem-benchmark.mjs <bundle.json> [--labels labels.json]
 *   node scripts/score-muaalem-benchmark.mjs --self-test
 *
 * Exit codes: 0 scored (even when data is thin — the report says so);
 * 2 unusable input (missing file, bad JSON, wrong schema, zero labels).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const EXPECTED_SCHEMA_VERSION = 1;

/** Intentionally-incorrect variants the benchmark script uses. */
export const ERROR_TYPES = [
  "wrong-word",
  "omitted-word",
  "mispronounced-letter",
  "extra-word",
  "word-order-swap",
];

/** Shadow statuses that count as "the service assessed this attempt". */
const ASSESSED_SHADOW_STATUSES = new Set(["available", "abstained"]);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonEmptyString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function pct(numerator, denominator) {
  if (!denominator || denominator <= 0) return "n/a";
  return `${((100 * numerator) / denominator).toFixed(1)}%`;
}

/** "3/8 (37.5%)" — a count and its denominator beside every percentage. */
export function countPct(numerator, denominator) {
  return `${numerator}/${denominator} (${pct(numerator, denominator)})`;
}

/** Linear-interpolated percentile of a non-empty numeric array. */
export function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const rank = (p / 100) * (sortedAsc.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sortedAsc[low];
  const frac = rank - low;
  return sortedAsc[low] * (1 - frac) + sortedAsc[high] * frac;
}

function summarize(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return { n: 0, p50: null, p95: null, min: null, max: null };
  return {
    n: nums.length,
    p50: percentile(nums, 50),
    p95: percentile(nums, 95),
    min: nums[0],
    max: nums[nums.length - 1],
  };
}

/** Fixed 0–1 buckets, so a human can see where posteriors cluster. */
export function bucket01(values) {
  const buckets = [
    { label: "< 0.50", count: 0 },
    { label: "0.50–0.74", count: 0 },
    { label: "0.75–0.89", count: 0 },
    { label: "≥ 0.90", count: 0 },
  ];
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (v < 0.5) buckets[0].count += 1;
    else if (v < 0.75) buckets[1].count += 1;
    else if (v < 0.9) buckets[2].count += 1;
    else buckets[3].count += 1;
  }
  return buckets;
}

function fmtNum(value, digits = 3) {
  if (value === null || value === undefined) return "n/a";
  return Number(value).toFixed(digits);
}

function fmtMs(value) {
  if (value === null || value === undefined) return "n/a";
  return `${Math.round(value)} ms`;
}

// ---------------------------------------------------------------------------
// Bundle parsing
// ---------------------------------------------------------------------------

/**
 * Splits a bundle into client events + server attempt-diagnostic rows.
 * Throws a descriptive Error when the bundle is unusable. Never throws on
 * missing *optional* parts: absent server diagnostics just score as zero.
 */
export function parseBundle(bundle) {
  if (!isRecord(bundle)) throw new Error("bundle is not a JSON object");
  if (bundle.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `unsupported schemaVersion ${JSON.stringify(bundle.schemaVersion)} (expected ${EXPECTED_SCHEMA_VERSION})`,
    );
  }
  const runId = asNonEmptyString(bundle.runId) ?? "(unknown run)";
  const client = isRecord(bundle.client) ? bundle.client : {};
  const clientEvents = Array.isArray(client.events) ? client.events.filter(isRecord) : [];
  const server = isRecord(bundle.server) ? bundle.server : {};
  const rows = Array.isArray(server.attemptDiagnostics)
    ? server.attemptDiagnostics.filter(isRecord)
    : [];
  return { runId, exportedAt: asNonEmptyString(bundle.exportedAt), clientEvents, serverRows: rows };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function isValidLabel(label) {
  if (!isRecord(label)) return false;
  if (label.variant !== "correct" && label.variant !== "incorrect") return false;
  if (label.variant === "incorrect" && label.errorType != null && !ERROR_TYPES.includes(label.errorType)) {
    return false;
  }
  return true;
}

/**
 * Labels keyed by client attempt id. Sources, in precedence order:
 * 1. the --labels file (when given),
 * 2. client `note` events with details.benchmarkLabel.
 */
export function collectLabels(clientEvents, labelsFileEntries) {
  const labels = new Map();
  let noteLabelCount = 0;
  let invalidNoteCount = 0;
  for (const event of clientEvents) {
    if (event.type !== "note") continue;
    const candidate = isRecord(event.details) ? event.details.benchmarkLabel : undefined;
    if (candidate === undefined) continue;
    const attemptId = asNonEmptyString(event.attemptId);
    if (!attemptId || !isValidLabel(candidate)) {
      invalidNoteCount += 1;
      continue;
    }
    labels.set(attemptId, { attemptId, ...candidate });
    noteLabelCount += 1;
  }
  let fileLabelCount = 0;
  let invalidFileCount = 0;
  const entries = normalizeLabelsFile(labelsFileEntries);
  for (const entry of entries) {
    const attemptId = asNonEmptyString(entry.attemptId);
    if (!attemptId || !isValidLabel(entry)) {
      invalidFileCount += 1;
      continue;
    }
    labels.set(attemptId, { attemptId, ...entry });
    fileLabelCount += 1;
  }
  return { labels, noteLabelCount, fileLabelCount, invalidNoteCount, invalidFileCount };
}

function normalizeLabelsFile(data) {
  if (data == null) return [];
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data)) {
    return Object.entries(data).map(([attemptId, label]) =>
      isRecord(label) ? { attemptId, ...label } : { attemptId },
    );
  }
  return [];
}

// ---------------------------------------------------------------------------
// Client attempt id → server diagnostics join
// ---------------------------------------------------------------------------

/**
 * The client lifecycle trace records the server-owned attempt id and the
 * request correlation id on its terminal events; the server diagnostics rows
 * are keyed by those same server ids. Rebuild the mapping offline.
 */
export function buildClientToServerMap(clientEvents) {
  const map = new Map();
  for (const event of clientEvents) {
    if (event.type !== "attempt.lifecycle") continue;
    const attemptId = asNonEmptyString(event.attemptId);
    if (!attemptId) continue;
    const details = isRecord(event.details) ? event.details : {};
    const serverAttemptId = asNonEmptyString(details.serverAttemptId);
    const correlationId = asNonEmptyString(event.correlationId);
    if (!serverAttemptId && !correlationId) continue;
    const existing = map.get(attemptId) ?? {};
    map.set(attemptId, {
      serverAttemptId: serverAttemptId ?? existing.serverAttemptId ?? null,
      correlationId: correlationId ?? existing.correlationId ?? null,
    });
  }
  return map;
}

/** Resolve one labeled attempt to its server diagnostics row, if any. */
export function resolveRow(label, idMap, serverRows) {
  const ids = idMap.get(label.attemptId) ?? {};
  // The client id itself can match when the harness wrote it through.
  const candidates = [
    label.attemptId,
    ids.serverAttemptId,
    ids.correlationId,
  ].filter((v) => typeof v === "string");
  for (const candidate of candidates) {
    const row = serverRows.find(
      (r) => r.attemptId === candidate || r.correlationId === candidate,
    );
    if (row) return row;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-attempt classification
// ---------------------------------------------------------------------------

/** flagged | quiet | unassessed — see the module header for the definition. */
export function shadowCategory(row) {
  const acoustic = isRecord(row.acoustic) ? row.acoustic : null;
  const status = acoustic ? asNonEmptyString(acoustic.shadowStatus) : null;
  if (status === "available") return "flagged";
  if (status === "abstained") return "quiet";
  return "unassessed";
}

export function shadowPosterior(row) {
  const acoustic = isRecord(row.acoustic) ? row.acoustic : null;
  return acoustic ? asNumber(acoustic.shadowAveragePosterior) : null;
}

export function reviewScore(row) {
  const decision = isRecord(row.decision) ? row.decision : null;
  return decision ? asNumber(decision.score) : null;
}

function rowLatencies(row, clientElapsedMs) {
  const acoustic = isRecord(row.acoustic) ? row.acoustic : null;
  return {
    evaluatorLatencyMs: asNumber(row.evaluatorLatencyMs) ?? (acoustic ? asNumber(acoustic.evaluatorLatencyMs) : null),
    shadowLatencyMs: acoustic ? asNumber(acoustic.shadowLatencyMs) : null,
    clientSubmissionMs: clientElapsedMs ?? null,
  };
}

/** Elapsed submission time from the client's own lifecycle trace, per attempt. */
export function clientSubmissionElapsedMs(clientEvents) {
  const elapsed = new Map();
  for (const event of clientEvents) {
    if (event.type !== "attempt.lifecycle") continue;
    const attemptId = asNonEmptyString(event.attemptId);
    const details = isRecord(event.details) ? event.details : {};
    if (attemptId && details.stage !== "submission.skipped") {
      const ms = asNumber(details.elapsedMs);
      if (ms !== null) elapsed.set(attemptId, ms);
    }
  }
  return elapsed;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function scoreBenchmark({ labels, idMap, serverRows, clientEvents }) {
  const elapsedByClientAttempt = clientSubmissionElapsedMs(clientEvents);
  const scored = [];
  let unjoined = 0;
  for (const label of labels.values()) {
    const row = resolveRow(label, idMap, serverRows);
    if (!row) {
      unjoined += 1;
      scored.push({ label, row: null, category: "unassessed", posterior: null, score: null, latencies: { evaluatorLatencyMs: null, shadowLatencyMs: null, clientSubmissionMs: null } });
      continue;
    }
    const category = shadowCategory(row);
    const latencies = rowLatencies(row, elapsedByClientAttempt.get(label.attemptId) ?? null);
    scored.push({ label, row, category, posterior: shadowPosterior(row), score: reviewScore(row), latencies });
  }

  const incorrect = scored.filter((s) => s.label.variant === "incorrect");
  const correct = scored.filter((s) => s.label.variant === "correct");

  const assessed = (list) => list.filter((s) => s.category === "flagged" || s.category === "quiet");
  const flagged = (list) => list.filter((s) => s.category === "flagged");
  const quiet = (list) => list.filter((s) => s.category === "quiet");

  const byErrorType = new Map();
  for (const type of [...ERROR_TYPES, "unknown"]) {
    const group = incorrect.filter(
      (s) => (s.label.errorType ?? "unknown") === type,
    );
    if (group.length === 0) continue;
    const a = assessed(group);
    byErrorType.set(type, {
      n: group.length,
      assessed: a.length,
      flagged: flagged(group).length,
      quiet: quiet(group).length,
      unassessed: group.length - a.length,
    });
  }

  const abstentionContext = new Map();
  for (const s of [...incorrect, ...correct].filter((s) => s.category === "quiet" && s.row)) {
    const decision = isRecord(s.row.decision) ? s.row.decision : {};
    const key =
      asNonEmptyString(decision.reviewMessageCode) ??
      asNonEmptyString(decision.verseFollowingReason) ??
      "(no review code)";
    abstentionContext.set(key, (abstentionContext.get(key) ?? 0) + 1);
  }

  const posteriors = {
    incorrectFlagged: scored.filter((s) => s.label.variant === "incorrect" && s.category === "flagged").map((s) => s.posterior),
    incorrectQuiet: scored.filter((s) => s.label.variant === "incorrect" && s.category === "quiet").map((s) => s.posterior),
    correct: scored.filter((s) => s.label.variant === "correct" && (s.category === "flagged" || s.category === "quiet")).map((s) => s.posterior),
  };
  const reviewScores = {
    incorrect: incorrect.filter((s) => s.row).map((s) => s.score),
    correct: correct.filter((s) => s.row).map((s) => s.score),
  };
  const latencies = {
    evaluator: scored.filter((s) => s.row).map((s) => s.latencies.evaluatorLatencyMs),
    shadow: scored.filter((s) => s.row).map((s) => s.latencies.shadowLatencyMs),
    clientSubmission: [...elapsedByClientAttempt.values()],
  };

  return {
    total: scored.length,
    unjoined,
    unlabeledServerRows: countUnlabeledRows(serverRows, labels, idMap),
    incorrect: {
      n: incorrect.length,
      assessed: assessed(incorrect).length,
      flagged: flagged(incorrect).length,
      quiet: quiet(incorrect).length,
      byErrorType,
    },
    correct: {
      n: correct.length,
      assessed: assessed(correct).length,
      flagged: flagged(correct).length,
      quiet: quiet(correct).length,
    },
    abstentionContext,
    posteriors,
    reviewScores,
    latencies,
    attempts: scored,
  };
}

/** Server rows that matched no label — excluded from every rate. */
function countUnlabeledRows(serverRows, labels, idMap) {
  const labeledServerIds = new Set();
  for (const label of labels.values()) {
    const ids = idMap.get(label.attemptId) ?? {};
    for (const id of [label.attemptId, ids.serverAttemptId, ids.correlationId]) {
      if (typeof id === "string") labeledServerIds.add(id);
    }
  }
  return serverRows.filter(
    (r) => !labeledServerIds.has(r.attemptId) && !labeledServerIds.has(r.correlationId),
  ).length;
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderMarkdown(metrics, { runId, exportedAt }) {
  const L = [];
  const { incorrect, correct } = metrics;

  L.push("# Muaalem benchmark — scorecard");
  L.push("");
  L.push(`- Run ID: \`${runId}\``);
  L.push(`- Bundle exported: ${exportedAt ?? "n/a"}`);
  L.push(`- Labeled attempts scored: ${metrics.total}`);
  L.push(`- Labeled attempts with no matching server diagnostics: ${metrics.unjoined}`);
  L.push(`- Server diagnostic rows with no benchmark label (excluded): ${metrics.unlabeledServerRows}`);
  L.push("");
  L.push(
    "> Descriptive telemetry only. Counts and denominators sit beside every percentage. " +
    "This report encodes no pilot thresholds and no release verdict: " +
    "`flagged` = the shadow service returned an assessment it did not abstain from " +
    "(`shadowStatus` \"available\"); the ledger does not record whether specific " +
    "findings were emitted, so treat detection rates as the service's own status " +
    "claims, for a qualified reviewer to interpret.",
  );
  L.push("");

  L.push("## Detection on intentionally-incorrect variants");
  L.push("");
  L.push("| Error type | Attempts | Assessed | Flagged | Quiet (abstained) | Unassessed | Detection = flagged ÷ assessed |");
  L.push("| --- | --- | --- | --- | --- | --- | --- |");
  if (incorrect.n === 0) {
    L.push("| _none labeled_ | 0 | 0 | 0 | 0 | 0 | n/a |");
  } else {
    for (const [type, g] of incorrect.byErrorType) {
      L.push(
        `| ${type} | ${g.n} | ${g.assessed} | ${g.flagged} | ${g.quiet} | ${g.unassessed} | ${countPct(g.flagged, g.assessed)} |`,
      );
    }
    L.push(
      `| **all incorrect** | ${incorrect.n} | ${incorrect.assessed} | ${incorrect.flagged} | ${incorrect.quiet} | ${incorrect.n - incorrect.assessed} | **${countPct(incorrect.flagged, incorrect.assessed)}** |`,
    );
  }
  L.push("");

  L.push("## False flags on known-correct controls");
  L.push("");
  L.push("| Attempts | Assessed | Flagged | Quiet (abstained) | Unassessed | False-flag = flagged ÷ assessed |");
  L.push("| --- | --- | --- | --- | --- | --- |");
  if (correct.n === 0) {
    L.push("| 0 | 0 | 0 | 0 | 0 | n/a |");
  } else {
    L.push(
      `| ${correct.n} | ${correct.assessed} | ${correct.flagged} | ${correct.quiet} | ${correct.n - correct.assessed} | **${countPct(correct.flagged, correct.assessed)}** |`,
    );
  }
  L.push("");

  L.push("## Abstention");
  L.push("");
  const totalQuiet = incorrect.quiet + correct.quiet;
  const totalAssessed = incorrect.assessed + correct.assessed;
  L.push(`- Abstention rate (all labeled attempts): ${countPct(totalQuiet, totalAssessed)}`);
  L.push(`- On incorrect variants: ${countPct(incorrect.quiet, incorrect.assessed)}`);
  L.push(`- On correct controls: ${countPct(correct.quiet, correct.assessed)}`);
  L.push("");
  L.push("Abstention context (server review code / verse-following reason on quiet attempts):");
  L.push("");
  if (metrics.abstentionContext.size === 0) {
    L.push("_none_");
  } else {
    for (const [context, count] of [...metrics.abstentionContext.entries()].sort((a, b) => b[1] - a[1])) {
      L.push(`- \`${context}\`: ${count}`);
    }
  }
  L.push("");

  const distSection = (title, values, note) => {
    const s = summarize(values);
    L.push(`## ${title}`);
    L.push("");
    if (note) L.push(`${note}`);
    if (note) L.push("");
    L.push(`- n = ${s.n}; p50 = ${fmtNum(s.p50)}; p95 = ${fmtNum(s.p95)}; min = ${fmtNum(s.min)}; max = ${fmtNum(s.max)}`);
    const buckets = bucket01(values);
    L.push(`- buckets: ${buckets.map((b) => `${b.label}: ${b.count}`).join(" · ")}`);
    L.push("");
  };

  distSection(
    "Shadow average posterior (raw posterior)",
    metrics.posteriors.incorrectFlagged,
    "Incorrect variants the service flagged.",
  );
  distSection(
    "Shadow average posterior — incorrect variants, quiet (abstained)",
    metrics.posteriors.incorrectQuiet,
    "Incorrect variants the service declined to assess.",
  );
  distSection(
    "Shadow average posterior — correct controls",
    metrics.posteriors.correct,
    "Known-correct recitations (flagged + quiet).",
  );
  distSection(
    "Server review score — incorrect variants",
    metrics.reviewScores.incorrect,
    "The server's own review score is not the acoustic posterior; alignment confidence is not a recorded ledger field.",
  );
  distSection(
    "Server review score — correct controls",
    metrics.reviewScores.correct,
    "",
  );

  const latSection = (title, values) => {
    const s = summarize(values);
    L.push(`## ${title}`);
    L.push("");
    L.push(`- n = ${s.n}; p50 = ${fmtMs(s.p50)}; p95 = ${fmtMs(s.p95)}; min = ${fmtMs(s.min)}; max = ${fmtMs(s.max)}`);
    L.push("");
  };

  latSection("Evaluator call latency (server, per attempt)", metrics.latencies.evaluator);
  latSection("Shadow evaluator latency (server, per attempt)", metrics.latencies.shadow);
  latSection(
    "Client submission round-trip (client lifecycle trace)",
    metrics.latencies.clientSubmission,
  );

  L.push("## Per-attempt ledger");
  L.push("");
  L.push("Identifiers and statuses only — no transcripts, audio, or Quran text.");
  L.push("");
  L.push("| # | Ayah | Variant | Error type | Shadow | Posterior | Server review score | Evaluator latency |");
  L.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  if (metrics.attempts.length === 0) {
    L.push("| _none_ | — | — | — | — | — | — | — |");
  } else {
    metrics.attempts.forEach((s, i) => {
      const ayah =
        typeof s.label.ayah === "number" ? s.label.ayah : "n/a";
      L.push(
        `| ${i + 1} | ${ayah} | ${s.label.variant} | ${s.label.errorType ?? "—"} | ${s.row ? s.category : "no server row"} | ${fmtNum(s.posterior)} | ${fmtNum(s.score)} | ${fmtMs(s.latencies.evaluatorLatencyMs)} |`,
      );
    });
  }
  L.push("");

  return L.join("\n");
}

// ---------------------------------------------------------------------------
// Synthetic fixture (for --self-test and unit tests)
// ---------------------------------------------------------------------------

function iso(base, offsetMs) {
  return new Date(base + offsetMs).toISOString();
}

/**
 * A small, fully labeled synthetic bundle exercising every code path:
 * correct controls (one flagged, one quiet), incorrect variants of each
 * error type (mostly flagged, one quiet, one unassessed), one labeled
 * attempt with no server row, and one unlabeled server row.
 */
export function buildSyntheticBundle() {
  const base = Date.UTC(2026, 8, 24, 12, 0, 0);
  const runId = "run_abcdef0123456789abcdef01";
  const attempts = [
    // [clientAttemptId, serverAttemptId, correlationId, variant, errorType, ayah, shadowStatus, posterior, score, evaluatorLatencyMs]
    ["c-ctrl-1", "srv-ctrl-1", "req_ctrl1", "correct", null, 1, "abstained", 0.42, 0.95, 1100],
    ["c-ctrl-2", "srv-ctrl-2", "req_ctrl2", "correct", null, 2, "available", 0.98, 0.93, 1250],
    ["c-ctrl-3", "srv-ctrl-3", "req_ctrl3", "correct", null, 3, "not_run", null, 0.9, null],
    ["c-inc-1", "srv-inc-1", "req_inc1", "incorrect", "wrong-word", 4, "available", 0.97, 0.4, 1400],
    ["c-inc-2", "srv-inc-2", "req_inc2", "incorrect", "omitted-word", 4, "available", 0.88, 0.35, 1320],
    ["c-inc-3", "srv-inc-3", "req_inc3", "incorrect", "mispronounced-letter", 5, "available", 0.76, 0.5, 1500],
    ["c-inc-4", "srv-inc-4", "req_inc4", "incorrect", "extra-word", 5, "abstained", 0.3, 0.6, 1150],
    ["c-inc-5", "srv-inc-5", "req_inc5", "incorrect", "word-order-swap", 6, "unavailable", null, 0.55, null],
  ];

  const clientEvents = [];
  let seq = 1;
  const note = (attemptId, label, t) =>
    clientEvents.push({
      seq: seq++,
      t: iso(base, t),
      runId,
      attemptId,
      correlationId: null,
      type: "note",
      details: { benchmarkLabel: label },
    });
  const lifecycle = (attemptId, serverAttemptId, correlationId, stage, extra, t) =>
    clientEvents.push({
      seq: seq++,
      t: iso(base, t),
      runId,
      attemptId,
      correlationId,
      type: "attempt.lifecycle",
      details: { stage, path: "final", scope: "ayah", ...(extra ?? {}) },
    });

  let t = 0;
  for (const [clientId, serverId, corr, variant, errorType, ayah, shadowStatus, , ,] of attempts) {
    note(clientId, { variant, errorType, surah: 1, ayah }, t);
    t += 1000;
    lifecycle(clientId, null, null, "capture.started", {}, t);
    t += 500;
    lifecycle(clientId, null, null, "submission.started", { route: "tutor", acousticEligible: true }, t);
    t += 2000;
    lifecycle(
      clientId,
      serverId,
      corr,
      "submission.responded",
      { route: "tutor", acousticEligible: true, elapsedMs: 2000 + (seq % 500), serverAttemptId: serverId, acousticStatus: "responded" },
      t,
    );
    t += 1000;
    void shadowStatus;
  }
  // One labeled attempt whose audio never reached the server: no server row.
  note("c-lost-1", { variant: "incorrect", errorType: "wrong-word", surah: 1, ayah: 7 }, t);
  t += 1000;
  lifecycle("c-lost-1", null, null, "submission.failed", { errorCode: "TIMEOUT", willRetry: false, elapsedMs: 9000 }, t);

  const serverRows = attempts.map(
    ([, serverId, corr, , , ayah, shadowStatus, posterior, score, latency], i) => ({
      attemptId: serverId,
      correlationId: corr,
      t: iso(base, i * 4500),
      route: "tutor",
      outcome: "responded",
      attemptScope: "ayah",
      acousticStatus: "responded",
      evaluatorLatencyMs: latency,
      acoustic: {
        evaluatorCalled: true,
        evaluatorStatus: shadowStatus === "available" ? "available" : shadowStatus === "abstained" ? "abstained" : "unavailable",
        evaluatorHttpStatus: 200,
        evaluatorLatencyMs: latency,
        primaryCorrectionsEnabled: false,
        shadowStatus,
        shadowProvider: "muaalem",
        shadowModelId: "obadx/muaalem-model-v3_2",
        shadowDecodedLevels: shadowStatus === "available" ? 11 : 0,
        shadowPhonemeTokens: shadowStatus === "available" ? 31 : 0,
        shadowAveragePosterior: posterior,
        shadowLatencyMs: latency === null ? null : Math.round(latency * 0.8),
      },
      decision: {
        verseFollowingReason: shadowStatus === "abstained" ? "too_little_evidence" : "matched",
        verseFollowingState: "following",
        shouldAdvance: false,
        reviewMessageCode: shadowStatus === "abstained" ? "uncertain-verse-match" : "none",
        matchedCount: ayah,
        totalWords: 7,
        score,
        tutorOutcome: "listening",
        tutorActionKind: null,
        tutorActionReason: null,
      },
    }),
  );
  // One unlabeled server row: excluded from every rate.
  serverRows.push({
    attemptId: "srv-unlabeled-1",
    correlationId: "req_unlabeled",
    t: iso(base, 99999),
    route: "tutor",
    outcome: "responded",
    attemptScope: "ayah",
    acousticStatus: "responded",
    evaluatorLatencyMs: 1200,
    acoustic: {
      evaluatorCalled: true,
      evaluatorStatus: "available",
      evaluatorHttpStatus: 200,
      evaluatorLatencyMs: 1200,
      primaryCorrectionsEnabled: false,
      shadowStatus: "available",
      shadowProvider: "muaalem",
      shadowModelId: "obadx/muaalem-model-v3_2",
      shadowDecodedLevels: 9,
      shadowPhonemeTokens: 28,
      shadowAveragePosterior: 0.91,
      shadowLatencyMs: 960,
    },
    decision: {
      verseFollowingReason: "matched",
      verseFollowingState: "following",
      shouldAdvance: false,
      reviewMessageCode: "none",
      matchedCount: 5,
      totalWords: 7,
      score: 0.88,
      tutorOutcome: "listening",
      tutorActionKind: null,
      tutorActionReason: null,
    },
  });

  return {
    schemaVersion: EXPECTED_SCHEMA_VERSION,
    runId,
    exportedAt: iso(base, 200000),
    client: { runId, exportedAt: iso(base, 199000), eventCount: clientEvents.length, events: clientEvents },
    server: {
      runId,
      build: { appVersion: "test", commit: "test", vercelEnv: null, nodeEnv: "test", capturedAt: iso(base, 0) },
      deviceMetadata: {},
      startedAt: iso(base, 0),
      exportedAt: iso(base, 199500),
      eventCount: 0,
      events: [],
      timings: { perAttempt: [] },
      echo: { intervals: [], offendingEventCount: 0, mutationsDuringPlaybackCount: 0, playbackLeakFalseEvidenceRate: null },
      verdict: {},
      attemptDiagnostics: serverRows,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsageAndExit(code) {
  process.stderr.write(
    "Usage: node scripts/score-muaalem-benchmark.mjs <bundle.json> [--labels labels.json]\n" +
      "       node scripts/score-muaalem-benchmark.mjs --self-test\n",
  );
  process.exit(code);
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes("--self-test")) {
    const bundle = buildSyntheticBundle();
    const { runId, exportedAt, clientEvents, serverRows } = parseBundle(bundle);
    const { labels } = collectLabels(clientEvents, null);
    const idMap = buildClientToServerMap(clientEvents);
    const metrics = scoreBenchmark({ labels, idMap, serverRows, clientEvents });
    process.stdout.write(`${renderMarkdown(metrics, { runId, exportedAt })}\n`);
    return;
  }
  const bundlePath = args.find((a) => !a.startsWith("--"));
  if (!bundlePath) printUsageAndExit(2);
  const labelsIdx = args.indexOf("--labels");
  const labelsPath = labelsIdx >= 0 ? args[labelsIdx + 1] : null;
  if (labelsIdx >= 0 && !labelsPath) {
    process.stderr.write("error: --labels needs a file path\n");
    process.exit(2);
  }

  let bundleRaw;
  try {
    bundleRaw = readFileSync(bundlePath, "utf8");
  } catch (cause) {
    process.stderr.write(`error: cannot read bundle file: ${cause.message}\n`);
    process.exit(2);
  }
  let bundle;
  try {
    bundle = JSON.parse(bundleRaw);
  } catch (cause) {
    process.stderr.write(`error: bundle is not valid JSON: ${cause.message}\n`);
    process.exit(2);
  }
  let parsed;
  try {
    parsed = parseBundle(bundle);
  } catch (cause) {
    process.stderr.write(`error: ${cause.message}\n`);
    process.exit(2);
  }
  let labelsFile = null;
  if (labelsPath) {
    try {
      labelsFile = JSON.parse(readFileSync(labelsPath, "utf8"));
    } catch (cause) {
      process.stderr.write(`error: cannot read labels file: ${cause.message}\n`);
      process.exit(2);
    }
  }
  const { labels, invalidNoteCount, invalidFileCount } = collectLabels(parsed.clientEvents, labelsFile);
  if (labels.size === 0) {
    process.stderr.write(
      "error: no benchmark labels found — record client `note` events with details.benchmarkLabel, or pass --labels\n",
    );
    process.exit(2);
  }
  const idMap = buildClientToServerMap(parsed.clientEvents);
  const metrics = scoreBenchmark({ labels, idMap, serverRows: parsed.serverRows, clientEvents: parsed.clientEvents });
  if (invalidNoteCount > 0 || invalidFileCount > 0) {
    process.stderr.write(
      `warning: ignored ${invalidNoteCount} invalid note label(s) and ${invalidFileCount} invalid file label(s)\n`,
    );
  }
  process.stdout.write(`${renderMarkdown(metrics, { runId: parsed.runId, exportedAt: parsed.exportedAt })}\n`);
}

const invokedAsScript =
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (invokedAsScript) main(process.argv);
