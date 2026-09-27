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
 *   node scripts/score-muaalem-benchmark.mjs <bundle.json> [--labels labels.json] [--attempts attempts.json]
 *   node scripts/score-muaalem-benchmark.mjs --self-test
 *   node scripts/score-muaalem-benchmark.mjs --self-test-detection
 *
 * `--attempts` takes a `quran.validation.attempts.v1` export (staff HTTP or
 * `pnpm export:validation-attempts`). When given, or when bundle rows carry
 * `researchPhonemes`, an additive "Phoneme-sequence detection" section is
 * appended after the unchanged scorecard. See that section's code comment.
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
// Phoneme-sequence detection (research, opt-in, ADDITIVE)
// ---------------------------------------------------------------------------
//
// For attempt rows carrying a consent-gated `researchPhonemes` record (PR #99
// service store, joined into the attempts export by PR #100), inspect the
// decoded Muaalem phoneme sequence and report whether the planted deviation
// for that benchmark card is present in the tokens.
//
// Scope and caveats — read before quoting a number:
// - Offline scoring of the repository owner's own self-consented planted-error
//   takes. A detection here is a statement about decoded model tokens for a
//   scripted take, NEVER a pronunciation verdict about a learner.
// - `tokenPosteriors` are raw greedy CTC posteriors, not calibrated correctness
//   scores. They are printed only as a confidence hint beside token presence /
//   absence and never decide an outcome on their own.
// - Rows without `researchPhonemes` are reported as "no research data" in this
//   section only. They add no failures and change nothing in the scorecard
//   above, whose output and verdicts are untouched.
// - Output stays ASCII: enums, counts, and numbers. Decoded tokens and the
//   reference strings below are never printed.
//
// Token vocabulary assumptions (verify against the real model output):
// - The phoneme level uses the Quran phonetic script alphabet of
//   `quran-transcript` 0.6.4 (`alphabet.phonetics`), which Muaalem v3.2 was
//   trained on. Checks run on the concatenation of the level's tokens, so they
//   hold whether tokens are single characters or multi-character groups.
// - Shaddah is a doubled consonant (e.g. raa raa), madd length is a run of
//   madd letters (alif / yaa-madd / waw-madd, 2 per 2 counts), a stop on a
//   qalqala letter emits the qalqala marker U+0687.
// - Exported levels carry no level name (the PR #100 read contract copies only
//   tokens / tokenPosteriors / meanPosterior), so the phoneme level is the
//   level whose tokens are all phonetic-alphabet characters. Sifat levels use
//   Latin class names ("hams", "jahr", ...) and never qualify.

const PH = {
  hamza: "ء",
  alif: "ا",
  raa: "ر",
  sheen: "ش",
  qaf: "ق",
  kaf: "ك",
  lam: "ل",
  meem: "م",
  noon: "ن",
  yaaMadd: "ۦ",
  qalqala: "ڇ",
};

/** quran-transcript 0.6.4 phonetic groups `core` + `residuals`. */
const PHONETIC_CORE =
  "ءبتثجحخدذرزسشصضطظعغفقكلمنهوياۥۦ۾ںـٲ";
const PHONETIC_RESIDUALS = "َُِڇؙ۪ۜ";
const PHONETIC_ALPHABET = new Set([...PHONETIC_CORE, ...PHONETIC_RESIDUALS]);
const HARAKAT = new Set(["َ", "ُ", "ِ"]);

/**
 * Canonical phoneme sequences (spaces removed) from quran-transcript 0.6.4
 * `quran_phonetizer`, rewaya Hafs, murattal, madd 4/4/4/4 (monfasel,
 * mottasel, mottasel-waqf, aared), full-ayah recitation stopping at the ayah
 * end. Used only for the edit-distance diagnostic and to anchor checks.
 */
export const REFERENCE_PHONEMES = {
  "112:1": "قُلهُوَللَااهُءَحَدڇ",
  "1:4": "مَاالِكِيَومِددِۦۦۦۦن",
  "1:7": "صِرَااطَللَذِۦۦنَءَنعَمتَعَلَيهِمغَيرِلمَغضُۥۥبِعَلَيهِموَلَضضَااااااللِۦۦۦۦن",
  "113:2": "مِںںںشَررِمَااخَلَقڇ",
  "1:2": "ءَلحَمدُلِللَااهِرَببِلعَاالَمِۦۦۦۦن",
};

/** Minimum raw posterior below which the hint is marked "low". Display only. */
export const LOW_POSTERIOR_HINT = 0.5;

function countChar(chars, ch) {
  let n = 0;
  for (const c of chars) if (c === ch) n += 1;
  return n;
}

/** Length of the run of `ch` starting at `from`. */
function runLength(chars, from, ch) {
  let i = from;
  while (i < chars.length && chars[i] === ch) i += 1;
  return i - from;
}

function skipHarakat(chars, from) {
  let i = from;
  while (i < chars.length && HARAKAT.has(chars[i])) i += 1;
  return i;
}

function minPosterior(posteriors, from, to) {
  let min = null;
  for (let i = from; i < to; i += 1) {
    const p = posteriors[i];
    if (typeof p === "number" && (min === null || p < min)) min = p;
  }
  return min;
}

/** Plain Levenshtein distance over code points. */
export function editDistance(a, b) {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= y.length; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[y.length];
}

/**
 * Validate a `researchPhonemes` record. Returns the levels or null when the
 * record is absent or malformed (tokens and posteriors must be parallel).
 */
export function researchLevels(research) {
  if (!isRecord(research) || !Array.isArray(research.levels)) return null;
  const levels = [];
  for (const level of research.levels) {
    if (
      !isRecord(level) ||
      !Array.isArray(level.tokens) ||
      !level.tokens.every((t) => typeof t === "string") ||
      !Array.isArray(level.tokenPosteriors) ||
      level.tokenPosteriors.length !== level.tokens.length ||
      !level.tokenPosteriors.every((p) => typeof p === "number" && Number.isFinite(p))
    ) {
      return null;
    }
    levels.push(level);
  }
  return levels;
}

/**
 * Pick the phoneme level and flatten it to characters, each carrying the raw
 * posterior of the token it came from. Prefers an explicit `level:
 * "phonemes"` name when present (service-side records); otherwise the level
 * with the most tokens whose characters are all in the phonetic alphabet.
 */
export function phonemeSequence(levels) {
  const qualifies = (level) =>
    level.tokens.length > 0 &&
    level.tokens.every((t) => {
      const chars = [...t.replace(/\s+/g, "")];
      return chars.length > 0 && chars.every((c) => PHONETIC_ALPHABET.has(c));
    });
  let chosen = levels.find((l) => l.level === "phonemes" && qualifies(l)) ?? null;
  if (!chosen) {
    for (const level of levels) {
      if (qualifies(level) && (!chosen || level.tokens.length > chosen.tokens.length)) chosen = level;
    }
  }
  if (!chosen) return null;
  const chars = [];
  const posteriors = [];
  chosen.tokens.forEach((token, i) => {
    for (const c of token.replace(/\s+/g, "")) {
      chars.push(c);
      posteriors.push(chosen.tokenPosteriors[i]);
    }
  });
  return { chars, posteriors };
}

const inconclusive = (evidence) => ({ outcome: "inconclusive", evidence, hintPosterior: null });

/**
 * Card-level planted-deviation checks, keyed "surah:ayah". Each returns
 * { outcome: "deviation_present" | "deviation_absent" | "inconclusive",
 *   evidence: ASCII string, hintPosterior: number | null }.
 */
export const CARD_CHECKS = {
  "112:1": {
    id: "qaf-to-kaf",
    description: "qul recited as kul: kaf instead of qaf in the opening phonemes",
    run({ chars, posteriors }) {
      // Reference opens qaf, damma, lam and contains no kaf anywhere.
      const head = chars.slice(0, 4);
      const k = head.indexOf(PH.kaf);
      const q = head.indexOf(PH.qaf);
      const kafElsewhere = countChar(chars, PH.kaf) - (k >= 0 ? 1 : 0);
      const extra = `; kaf elsewhere: ${kafElsewhere}`;
      if (k >= 0 && q < 0) {
        return { outcome: "deviation_present", evidence: `kaf in opening, no qaf${extra}`, hintPosterior: posteriors[k] };
      }
      if (q >= 0 && k < 0) {
        return { outcome: "deviation_absent", evidence: `qaf in opening, no kaf${extra}`, hintPosterior: posteriors[q] };
      }
      return inconclusive(k >= 0 ? `both qaf and kaf in opening${extra}` : `neither qaf nor kaf in opening${extra}`);
    },
  },
  "113:2": {
    id: "dropped-shaddah-raa",
    description: "sharri with the shaddah dropped: single raa where a doubled raa is expected",
    run({ chars, posteriors }) {
      // Reference: ...sheen fatha raa raa kasra... (shaddah = doubled consonant).
      const s = chars.indexOf(PH.sheen);
      if (s < 0) return inconclusive("anchor sheen not decoded");
      const r = skipHarakat(chars, s + 1);
      const run = runLength(chars, r, PH.raa);
      if (run === 0) return inconclusive("no raa after anchor sheen");
      const hint = minPosterior(posteriors, r, r + run);
      return run === 1
        ? { outcome: "deviation_present", evidence: "raa run after sheen = 1 (expected 2)", hintPosterior: hint }
        : { outcome: "deviation_absent", evidence: `raa run after sheen = ${run} (expected 2)`, hintPosterior: hint };
    },
  },
  "1:4": {
    id: "shortened-madd",
    description:
      "maaliki natural madd (2 alifs after meem) shortened, or the final aared madd run below its 2-count minimum",
    run({ chars, posteriors }) {
      // Reference: meem fatha alif alif lam ... and ends yaa-madd run + noon.
      const m = chars.slice(0, 3).indexOf(PH.meem);
      if (m < 0) return inconclusive("anchor meem not decoded in opening");
      const a = skipHarakat(chars, m + 1);
      const alifRun = runLength(chars, a, PH.alif);
      if (chars[a + alifRun] !== PH.lam) return inconclusive(`no lam after opening alif run (${alifRun})`);
      let tailRun = 0;
      let tailStart = chars.length;
      if (chars[chars.length - 1] === PH.noon) {
        let i = chars.length - 2;
        while (i >= 0 && chars[i] === PH.yaaMadd) i -= 1;
        tailStart = i + 1;
        tailRun = chars.length - 1 - tailStart;
      }
      const evidence = `maaliki alif run = ${alifRun} (expected 2); final yaa-madd run = ${tailRun} (valid 2/4/6)`;
      if (alifRun < 2) {
        return { outcome: "deviation_present", evidence, hintPosterior: alifRun ? minPosterior(posteriors, a, a + alifRun) : posteriors[a] ?? null };
      }
      if (tailRun < 2) {
        return { outcome: "deviation_present", evidence, hintPosterior: minPosterior(posteriors, tailStart, chars.length) };
      }
      return { outcome: "deviation_absent", evidence, hintPosterior: minPosterior(posteriors, a, a + alifRun) };
    },
  },
  "1:7": {
    id: "misplaced-waqf",
    description:
      "mid-ayah stop: qalqala stop marker (reference has none) or an extra hamza from restarting with hamzat al-wasl",
    run({ chars, posteriors }) {
      // Reference 1:7 has 0 qalqala markers and exactly 1 hamza. A stop on
      // taa-mofakhama or baa emits the qalqala marker; resuming at alladhina /
      // almaghdubi begins with an extra hamza. A stop on a non-qalqala letter
      // followed by plain continuation leaves no signature here.
      const qalqala = countChar(chars, PH.qalqala);
      const extraHamza = countChar(chars, PH.hamza) - 1;
      const evidence = `qalqala stop markers = ${qalqala} (reference 0); extra hamza = ${Math.max(0, extraHamza)} (reference 0)`;
      if (qalqala === 0 && extraHamza <= 0) {
        return { outcome: "deviation_absent", evidence, hintPosterior: null };
      }
      const signature = new Set([PH.qalqala, ...(extraHamza > 0 ? [PH.hamza] : [])]);
      let hint = null;
      chars.forEach((c, i) => {
        if (signature.has(c) && (hint === null || posteriors[i] < hint)) hint = posteriors[i];
      });
      return { outcome: "deviation_present", evidence, hintPosterior: hint };
    },
  },
  "1:2": {
    id: "noisy-abstention",
    description: "report only: noisy take, shadow abstention is the expected outcome",
    reportOnly: true,
  },
};

/** Parse a `quran.validation.attempts.v1` export (or a bare row array). */
export function parseAttemptExport(data) {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data) && Array.isArray(data.attempts)) return data.attempts.filter(isRecord);
  throw new Error("attempts export has no `attempts` array");
}

function cardKey(label) {
  return typeof label.surah === "number" && typeof label.ayah === "number"
    ? `${label.surah}:${label.ayah}`
    : null;
}

/**
 * Additive detection pass over labeled attempts. `attemptRows` are rows of an
 * attempts export; bundle `serverRows` carrying `researchPhonemes` are used as
 * a fallback. Does not read or alter the scorecard metrics.
 */
export function scoreDetection({ labels, idMap, serverRows, attemptRows = [] }) {
  const attempts = [];
  for (const label of labels.values()) {
    const key = cardKey(label);
    const check = key ? CARD_CHECKS[key] ?? null : null;
    const exportRow = resolveRow(label, idMap, attemptRows);
    const bundleRow = resolveRow(label, idMap, serverRows);
    const research = exportRow?.researchPhonemes ?? bundleRow?.researchPhonemes;
    const base = {
      label,
      card: key ?? "n/a",
      checkId: check?.id ?? null,
      retained: research !== undefined,
      editDistance: null,
      referenceLength: key && REFERENCE_PHONEMES[key] ? [...REFERENCE_PHONEMES[key]].length : null,
      decodedLength: null,
      hintPosterior: null,
      evidence: "",
    };
    if (check?.reportOnly) {
      const sequence = research !== undefined ? phonemeSequence(researchLevels(research) ?? []) : null;
      attempts.push({
        ...base,
        outcome: "report_only",
        decodedLength: sequence ? sequence.chars.length : null,
        evidence: research === undefined ? "no research record (expected when the shadow abstains)" : "research record present",
      });
      continue;
    }
    if (research === undefined) {
      attempts.push({ ...base, outcome: "no_research_data", evidence: "no researchPhonemes on this row" });
      continue;
    }
    const levels = researchLevels(research);
    const sequence = levels ? phonemeSequence(levels) : null;
    if (!sequence) {
      attempts.push({ ...base, outcome: "inconclusive", evidence: levels ? "no phoneme-alphabet level" : "malformed research record" });
      continue;
    }
    const decoded = sequence.chars.join("");
    const withSeq = {
      ...base,
      decodedLength: sequence.chars.length,
      editDistance: key && REFERENCE_PHONEMES[key] ? editDistance(decoded, REFERENCE_PHONEMES[key]) : null,
    };
    if (!check) {
      attempts.push({ ...withSeq, outcome: "no_check", evidence: "no planted-deviation check for this card" });
      continue;
    }
    const result = check.run(sequence);
    attempts.push({ ...withSeq, ...result });
  }

  const cards = new Map();
  for (const a of attempts) {
    if (!cards.has(a.card)) {
      const check = CARD_CHECKS[a.card];
      cards.set(a.card, {
        checkId: check?.id ?? null,
        description: check?.description ?? "no check defined",
        deviation: { n: 0, retained: 0, present: 0, absent: 0, inconclusive: 0, reportOnly: 0 },
        control: { n: 0, retained: 0, present: 0, absent: 0, inconclusive: 0, reportOnly: 0 },
      });
    }
    const group = cards.get(a.card)[a.label.variant === "incorrect" ? "deviation" : "control"];
    group.n += 1;
    if (a.retained) group.retained += 1;
    if (a.outcome === "deviation_present") group.present += 1;
    else if (a.outcome === "deviation_absent") group.absent += 1;
    else if (a.outcome === "inconclusive") group.inconclusive += 1;
    else if (a.outcome === "report_only") group.reportOnly += 1;
  }
  return { attempts, cards };
}

export function renderDetectionMarkdown(detection) {
  const L = [];
  L.push("## Phoneme-sequence detection (research, opt-in)");
  L.push("");
  L.push(
    "> Offline check of decoded Muaalem phoneme tokens against each card's planted deviation, for the " +
      "owner's self-consented scripted takes only. A detection is a statement about decoded model tokens, " +
      "not a pronunciation verdict about any learner. Posteriors are raw greedy CTC posteriors shown as a " +
      "confidence hint only; they never decide an outcome. Rows without retained research phonemes are " +
      "listed as `no_research_data` and do not affect the scorecard above.",
  );
  L.push("");
  L.push("| Card | Check | Deviation takes | Retained | Present | Absent | Inconclusive | Controls | Retained | Present on control | Absent | Inconclusive |");
  L.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  if (detection.cards.size === 0) {
    L.push("| _none_ | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |");
  }
  for (const [card, c] of detection.cards) {
    const d = c.deviation;
    const k = c.control;
    const check = c.checkId ?? "none";
    if (CARD_CHECKS[card]?.reportOnly) {
      L.push(`| ${card} | ${check} (report only) | ${d.n} | ${d.retained} | — | — | — | ${k.n} | ${k.retained} | — | — | — |`);
      continue;
    }
    L.push(
      `| ${card} | ${check} | ${d.n} | ${d.retained} | ${countPct(d.present, d.retained)} | ${d.absent} | ${d.inconclusive} | ${k.n} | ${k.retained} | ${countPct(k.present, k.retained)} | ${k.absent} | ${k.inconclusive} |`,
    );
  }
  L.push("");
  L.push("Present = planted deviation found in the decoded tokens ÷ takes with retained research phonemes.");
  L.push("");
  L.push("| # | Card | Variant | Check | Outcome | Evidence | Posterior hint | Edit distance to reference |");
  L.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  if (detection.attempts.length === 0) {
    L.push("| _none_ | — | — | — | — | — | — | — |");
  }
  detection.attempts.forEach((a, i) => {
    const hint =
      a.hintPosterior === null
        ? "n/a"
        : `${fmtNum(a.hintPosterior)}${a.hintPosterior < LOW_POSTERIOR_HINT ? " (low)" : ""}`;
    const distance =
      a.editDistance === null ? "n/a" : `${a.editDistance} (decoded ${a.decodedLength} / reference ${a.referenceLength})`;
    L.push(
      `| ${i + 1} | ${a.card} | ${a.label.variant} | ${a.checkId ?? "—"} | ${a.outcome} | ${a.evidence} | ${hint} | ${distance} |`,
    );
  });
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

/**
 * SYNTHETIC detection fixture: a bundle plus an attempts export whose
 * `researchPhonemes` are hand-built from REFERENCE_PHONEMES with the planted
 * deviations applied. It exercises the detection code path only; its numbers
 * are NOT benchmark results and must never be quoted as such.
 */
export function buildSyntheticDetectionFixture() {
  const base = Date.UTC(2026, 8, 27, 12, 0, 0);
  const runId = "run_detection0123456789abcd";
  const ref = REFERENCE_PHONEMES;
  const fatha = "َ";
  const taaMofakhama = "ط";
  const planted = {
    "112:1": PH.kaf + ref["112:1"].slice(1),
    "113:2": ref["113:2"].replace(PH.raa + PH.raa, PH.raa),
    "1:4": ref["1:4"].replace(PH.alif + PH.alif, ""),
    // Stop after the first word (qalqala on taa-mofakhama), restart with hamzat al-wasl.
    "1:7": ref["1:7"].slice(0, 4) + PH.alif.repeat(4) + taaMofakhama + PH.qalqala + PH.hamza + fatha + ref["1:7"].slice(8),
  };
  const plantedChar = { "112:1": PH.kaf, "1:7": PH.qalqala };
  const research = (correlationId, card, sequence) => {
    const chars = [...sequence];
    return {
      correlationId,
      timestamp: new Date(base).toISOString(),
      provider: "muaalem-shadow",
      modelId: "obadx/muaalem-model-v3_2",
      levels: [
        // A sifat-style level first: never mistaken for the phoneme level.
        { tokens: ["hams", "jahr", "jahr"], tokenPosteriors: [0.8, 0.9, 0.7], meanPosterior: 0.8 },
        {
          tokens: chars,
          tokenPosteriors: chars.map((c) => (c === plantedChar[card] ? 0.41 : 0.93)),
          meanPosterior: 0.9,
        },
      ],
      purpose: "synthetic fixture",
      retainUntil: new Date(base + 30 * 86_400_000).toISOString(),
    };
  };
  // [clientId, card, variant, sequence | null (no retained research), shadowStatus]
  const takes = [
    ["d-112-dev", "112:1", "incorrect", planted["112:1"], "available"],
    ["d-112-ctl", "112:1", "correct", ref["112:1"], "available"],
    ["d-112-miss", "112:1", "incorrect", null, "available"],
    ["d-113-dev", "113:2", "incorrect", planted["113:2"], "available"],
    ["d-113-ctl", "113:2", "correct", ref["113:2"], "available"],
    ["d-104-dev", "1:4", "incorrect", planted["1:4"], "available"],
    ["d-104-ctl", "1:4", "correct", ref["1:4"], "available"],
    ["d-107-dev", "1:7", "incorrect", planted["1:7"], "available"],
    ["d-107-ctl", "1:7", "correct", ref["1:7"], "available"],
    ["d-102-noisy", "1:2", "correct", null, "abstained"],
  ];
  const events = [];
  const serverRows = [];
  const attemptRows = [];
  takes.forEach(([clientId, card, variant, sequence, shadowStatus], i) => {
    const [surah, ayah] = card.split(":").map(Number);
    const serverId = `srv-${clientId}`;
    const correlationId = `req_${clientId.replace(/-/g, "_")}`;
    const t = new Date(base + i * 5000).toISOString();
    events.push({ seq: events.length + 1, t, runId, attemptId: clientId, correlationId: null, type: "note", details: { benchmarkLabel: { variant, errorType: null, surah, ayah } } });
    events.push({ seq: events.length + 1, t, runId, attemptId: clientId, correlationId, type: "attempt.lifecycle", details: { stage: "submission.responded", elapsedMs: 2000, serverAttemptId: serverId } });
    serverRows.push({ attemptId: serverId, correlationId, acoustic: { shadowStatus, shadowAveragePosterior: shadowStatus === "available" ? 0.9 : null }, decision: { score: 0.9 } });
    attemptRows.push({
      runId,
      attemptId: serverId,
      correlationId,
      ayahRef: card,
      muaalemStatus: shadowStatus,
      ...(sequence ? { researchPhonemes: research(correlationId, card, sequence) } : {}),
    });
  });
  return {
    bundle: {
      schemaVersion: EXPECTED_SCHEMA_VERSION,
      runId,
      exportedAt: new Date(base + 100_000).toISOString(),
      client: { runId, eventCount: events.length, events },
      server: { runId, attemptDiagnostics: serverRows },
    },
    attemptsExport: { schema: "quran.validation.attempts.v1", runId, attempts: attemptRows },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsageAndExit(code) {
  process.stderr.write(
    "Usage: node scripts/score-muaalem-benchmark.mjs <bundle.json> [--labels labels.json] [--attempts attempts-export.json]\n" +
      "       node scripts/score-muaalem-benchmark.mjs --self-test\n" +
      "       node scripts/score-muaalem-benchmark.mjs --self-test-detection\n",
  );
  process.exit(code);
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes("--self-test-detection")) {
    const { bundle, attemptsExport } = buildSyntheticDetectionFixture();
    const { runId, exportedAt, clientEvents, serverRows } = parseBundle(bundle);
    const { labels } = collectLabels(clientEvents, null);
    const idMap = buildClientToServerMap(clientEvents);
    const metrics = scoreBenchmark({ labels, idMap, serverRows, clientEvents });
    const detection = scoreDetection({ labels, idMap, serverRows, attemptRows: parseAttemptExport(attemptsExport) });
    process.stdout.write(
      `> SYNTHETIC FIXTURE: code-path self-test only. These are NOT benchmark results.\n\n` +
        `${renderMarkdown(metrics, { runId, exportedAt })}\n${renderDetectionMarkdown(detection)}\n`,
    );
    return;
  }
  if (args.includes("--self-test")) {
    const bundle = buildSyntheticBundle();
    const { runId, exportedAt, clientEvents, serverRows } = parseBundle(bundle);
    const { labels } = collectLabels(clientEvents, null);
    const idMap = buildClientToServerMap(clientEvents);
    const metrics = scoreBenchmark({ labels, idMap, serverRows, clientEvents });
    process.stdout.write(`${renderMarkdown(metrics, { runId, exportedAt })}\n`);
    return;
  }
  const labelsIdx = args.indexOf("--labels");
  const labelsPath = labelsIdx >= 0 ? args[labelsIdx + 1] : null;
  if (labelsIdx >= 0 && !labelsPath) {
    process.stderr.write("error: --labels needs a file path\n");
    process.exit(2);
  }
  const attemptsIdx = args.indexOf("--attempts");
  const attemptsPath = attemptsIdx >= 0 ? args[attemptsIdx + 1] : null;
  if (attemptsIdx >= 0 && !attemptsPath) {
    process.stderr.write("error: --attempts needs a file path\n");
    process.exit(2);
  }
  const flagValues = new Set([labelsIdx + 1, attemptsIdx + 1].filter((i) => i > 0));
  const bundlePath = args.find((a, i) => !a.startsWith("--") && !flagValues.has(i));
  if (!bundlePath) printUsageAndExit(2);

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

  // Additive, opt-in detection section: only when research data can exist.
  let attemptRows = [];
  if (attemptsPath) {
    try {
      attemptRows = parseAttemptExport(JSON.parse(readFileSync(attemptsPath, "utf8")));
    } catch (cause) {
      process.stderr.write(`error: cannot read attempts export: ${cause.message}\n`);
      process.exit(2);
    }
  }
  if (attemptsPath || parsed.serverRows.some((r) => r.researchPhonemes !== undefined)) {
    const detection = scoreDetection({ labels, idMap, serverRows: parsed.serverRows, attemptRows });
    process.stdout.write(`\n${renderDetectionMarkdown(detection)}\n`);
  }
}

const invokedAsScript =
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (invokedAsScript) main(process.argv);
