import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARD_CHECKS,
  REFERENCE_PHONEMES,
  buildClientToServerMap,
  buildSyntheticBundle,
  buildSyntheticDetectionFixture,
  editDistance,
  parseAttemptExport,
  phonemeSequence,
  renderDetectionMarkdown,
  researchLevels,
  scoreDetection,
  bucket01,
  collectLabels,
  countPct,
  isValidLabel,
  normalizeAttemptExportRow,
  parseBundle,
  percentile,
  renderMarkdown,
  resolveRow,
  scoreBenchmark,
  selectScorecardRows,
  shadowCategory,
} from "../../scripts/score-muaalem-benchmark.mjs";

function scored() {
  const bundle = buildSyntheticBundle();
  const { runId, exportedAt, clientEvents, serverRows } = parseBundle(bundle);
  const { labels } = collectLabels(clientEvents, null);
  const idMap = buildClientToServerMap(clientEvents);
  const metrics = scoreBenchmark({ labels, idMap, serverRows, clientEvents });
  return { bundle, metrics, runId, exportedAt };
}

describe("parseBundle", () => {
  it("rejects a non-object and an unsupported schema version", () => {
    expect(() => parseBundle(null)).toThrow();
    expect(() => parseBundle({ schemaVersion: 2, runId: "run_x" })).toThrow(/schemaVersion/);
  });

  it("accepts the synthetic bundle and finds client events + server rows", () => {
    const { clientEvents, serverRows, runId } = parseBundle(buildSyntheticBundle());
    expect(runId).toBe("run_abcdef0123456789abcdef01");
    expect(clientEvents.length).toBeGreaterThan(0);
    expect(serverRows.length).toBe(9); // 8 labeled attempts + 1 unlabeled row
  });
});

describe("labels", () => {
  it("accepts correct/incorrect variants and the five benchmark error types", () => {
    expect(isValidLabel({ variant: "correct", errorType: null })).toBe(true);
    expect(
      isValidLabel({ variant: "incorrect", errorType: "mispronounced-letter" }),
    ).toBe(true);
    expect(isValidLabel({ variant: "maybe" })).toBe(false);
    expect(isValidLabel({ variant: "incorrect", errorType: "typo" })).toBe(false);
  });

  it("collects labels from client note events", () => {
    const { clientEvents } = parseBundle(buildSyntheticBundle());
    const { labels, invalidNoteCount } = collectLabels(clientEvents, null);
    expect(labels.size).toBe(9);
    expect(invalidNoteCount).toBe(0);
    expect(labels.get("c-inc-1")).toMatchObject({
      variant: "incorrect",
      errorType: "wrong-word",
    });
  });

  it("lets the --labels file override note labels", () => {
    const { clientEvents } = parseBundle(buildSyntheticBundle());
    const { labels } = collectLabels(clientEvents, [
      { attemptId: "c-inc-1", variant: "correct", errorType: null, surah: 1, ayah: 4 },
    ]);
    expect(labels.get("c-inc-1")).toMatchObject({ variant: "correct" });
    expect(labels.size).toBe(9);
  });

  it("ignores invalid labels and counts them", () => {
    const { clientEvents } = parseBundle(buildSyntheticBundle());
    const { labels, invalidFileCount } = collectLabels(clientEvents, [
      { attemptId: "c-inc-1", variant: "bogus" },
    ]);
    expect(invalidFileCount).toBe(1);
    expect(labels.get("c-inc-1")).toMatchObject({ variant: "incorrect" });
  });
});

describe("client → server join", () => {
  it("resolves a labeled attempt through the lifecycle trace's server id", () => {
    const { clientEvents, serverRows } = parseBundle(buildSyntheticBundle());
    const { labels } = collectLabels(clientEvents, null);
    const idMap = buildClientToServerMap(clientEvents);
    const row = resolveRow(labels.get("c-inc-2"), idMap, serverRows);
    expect(row?.correlationId).toBe("req_inc2");
    expect(row?.acoustic.shadowStatus).toBe("available");
  });

  it("returns null for a labeled attempt with no server row", () => {
    const { clientEvents, serverRows } = parseBundle(buildSyntheticBundle());
    const { labels } = collectLabels(clientEvents, null);
    const idMap = buildClientToServerMap(clientEvents);
    expect(resolveRow(labels.get("c-lost-1"), idMap, serverRows)).toBeNull();
  });
});

describe("shadowCategory", () => {
  const row = (shadowStatus) => ({ acoustic: { shadowStatus } });
  it("maps available/abstained to flagged/quiet and the rest to unassessed", () => {
    expect(shadowCategory(row("available"))).toBe("flagged");
    expect(shadowCategory(row("abstained"))).toBe("quiet");
    expect(shadowCategory(row("unavailable"))).toBe("unassessed");
    expect(shadowCategory(row("not_run"))).toBe("unassessed");
    expect(shadowCategory(row("not_configured"))).toBe("unassessed");
    expect(shadowCategory({})).toBe("unassessed");
  });
});

describe("scoreBenchmark on the synthetic bundle", () => {
  it("counts detection per error type with denominators", () => {
    const { metrics } = scored();
    expect(metrics.incorrect).toMatchObject({ n: 6, assessed: 4, flagged: 3, quiet: 1 });
    expect(metrics.correct).toMatchObject({ n: 3, assessed: 2, flagged: 1, quiet: 1 });
    expect(metrics.unjoined).toBe(1);
    expect(metrics.unlabeledServerRows).toBe(1);
    expect(metrics.incorrect.byErrorType.get("wrong-word")).toMatchObject({
      n: 2,
      assessed: 1,
      flagged: 1,
      quiet: 0,
      unassessed: 1,
    });
    expect(metrics.incorrect.byErrorType.get("word-order-swap")).toMatchObject({
      n: 1,
      assessed: 0,
      unassessed: 1,
    });
  });

  it("breaks abstention down by server review context", () => {
    const { metrics } = scored();
    expect(metrics.abstentionContext.get("uncertain-verse-match")).toBe(2);
  });

  it("separates posteriors by variant and outcome for reviewer inspection", () => {
    const { metrics } = scored();
    expect(metrics.posteriors.incorrectFlagged).toEqual([0.97, 0.88, 0.76]);
    expect(metrics.posteriors.incorrectQuiet).toEqual([0.3]);
    expect(metrics.posteriors.correct).toEqual([0.42, 0.98]);
  });
});

describe("helpers", () => {
  it("countPct always shows the denominator", () => {
    expect(countPct(3, 4)).toBe("3/4 (75.0%)");
    expect(countPct(0, 0)).toBe("0/0 (n/a)");
  });

  it("percentile interpolates", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([], 50)).toBeNull();
  });

  it("bucket01 clusters 0–1 values", () => {
    const buckets = bucket01([0.2, 0.6, 0.8, 0.95, 0.99]);
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 2]);
  });
});

describe("renderMarkdown", () => {
  it("prints counts with denominators and no thresholds or verdicts", () => {
    const { metrics, runId, exportedAt } = scored();
    const md = renderMarkdown(metrics, { runId, exportedAt });
    expect(md).toContain("3/4 (75.0%)"); // detection on incorrect variants
    expect(md).toContain("1/2 (50.0%)"); // false flags on correct controls
    expect(md).toContain("uncertain-verse-match");
    expect(md).not.toMatch(/98%/);
    expect(md).not.toMatch(/85%/);
    expect(md).not.toMatch(/^## (GO|Verdict|Decision)/m);
    expect(md).toContain("Descriptive telemetry only");
  });

  it("never prints transcripts, audio, or Quran text", () => {
    const { metrics, runId, exportedAt } = scored();
    const md = renderMarkdown(metrics, { runId, exportedAt });
    expect(md).toContain("no transcripts, audio, or Quran text");
    expect(md.toLowerCase()).not.toContain("base64");
    // Attempt identifiers are fine; Quranic Arabic words are not.
    expect(md).not.toMatch(/[\u0600-\u06FF]/);
  });
});

// ---------------------------------------------------------------------------
// Phoneme-sequence detection (additive). All inputs below are SYNTHETIC
// fixtures exercising the code path; none of it is a benchmark result.
// ---------------------------------------------------------------------------

function detectionFromFixture() {
  const { bundle, attemptsExport } = buildSyntheticDetectionFixture();
  const { clientEvents, serverRows } = parseBundle(bundle);
  const { labels } = collectLabels(clientEvents, null);
  const idMap = buildClientToServerMap(clientEvents);
  return {
    bundle,
    attemptsExport,
    labels,
    idMap,
    serverRows,
    clientEvents,
    detection: scoreDetection({
      labels,
      idMap,
      serverRows,
      attemptRows: parseAttemptExport(attemptsExport),
    }),
  };
}

const seq = (text: string, posterior = 0.9) => ({
  chars: [...text],
  posteriors: [...text].map(() => posterior),
});
const KAF = "\u0643";
const RAA = "\u0631";
const ALIF = "\u0627";
const HAMZA = "\u0621";
const YAA_MADD = "\u06E6";

describe("phoneme-sequence detection on the synthetic fixture", () => {
  it("finds each planted deviation and none on the matching controls", () => {
    const { detection } = detectionFromFixture();
    const byId = new Map(detection.attempts.map((a: any) => [a.label.attemptId, a]));
    for (const id of ["d-112-dev", "d-113-dev", "d-104-dev", "d-107-dev"]) {
      expect(byId.get(id).outcome).toBe("deviation_present");
    }
    for (const id of ["d-112-ctl", "d-113-ctl", "d-104-ctl", "d-107-ctl"]) {
      expect(byId.get(id).outcome).toBe("deviation_absent");
      expect(byId.get(id).editDistance).toBe(0);
    }
    expect(byId.get("d-102-noisy").outcome).toBe("report_only");
    expect(byId.get("d-112-miss").outcome).toBe("no_research_data");
    const card = detection.cards.get("112:1");
    expect(card.deviation).toMatchObject({ n: 2, retained: 1, present: 1, inconclusive: 0 });
  });

  it("leaves the scorecard metrics identical with or without research data", () => {
    const { labels, idMap, serverRows, clientEvents, attemptsExport } = detectionFromFixture();
    const research = new Map(
      parseAttemptExport(attemptsExport).map((r: any) => [r.attemptId, r.researchPhonemes])
    );
    const withResearch = serverRows.map((row: any) =>
      research.get(row.attemptId) ? { ...row, researchPhonemes: research.get(row.attemptId) } : row
    );
    expect(withResearch.some((r: any) => r.researchPhonemes)).toBe(true);
    const a = scoreBenchmark({ labels, idMap, serverRows, clientEvents });
    const b = scoreBenchmark({ labels, idMap, serverRows: withResearch, clientEvents });
    expect(renderMarkdown(a, { runId: "r", exportedAt: null })).toBe(
      renderMarkdown(b, { runId: "r", exportedAt: null })
    );
  });

  it("scores every row as no_research_data, never as a failure, when nothing was retained", () => {
    const { labels, idMap, serverRows, attemptsExport } = detectionFromFixture();
    const rows = parseAttemptExport(attemptsExport).map(({ researchPhonemes, ...row }: any) => row);
    const detection = scoreDetection({ labels, idMap, serverRows, attemptRows: rows });
    const outcomes = new Set(detection.attempts.map((a: any) => a.outcome));
    expect([...outcomes].sort()).toEqual(["no_research_data", "report_only"]);
    for (const card of detection.cards.values()) {
      expect(card.deviation.present + card.control.present).toBe(0);
      expect(card.deviation.inconclusive + card.control.inconclusive).toBe(0);
    }
  });

  it("renders ASCII-only evidence: no decoded tokens or Quran text", () => {
    const md = renderDetectionMarkdown(detectionFromFixture().detection);
    expect(md).toContain("## Phoneme-sequence detection (research, opt-in)");
    expect(md).toContain("not a pronunciation verdict");
    expect(md).not.toMatch(/[\u0600-\u06FF]/);
    expect(md).not.toMatch(/^## (GO|Verdict|Decision)/m);
  });
});

describe("phoneme level selection", () => {
  it("ignores sifat levels and picks the phonetic-alphabet level", () => {
    const levels = researchLevels({
      levels: [
        { tokens: ["hams", "jahr"], tokenPosteriors: [0.9, 0.9], meanPosterior: 0.9 },
        { tokens: [KAF, "\u064F"], tokenPosteriors: [0.4, 0.8], meanPosterior: 0.6 },
      ],
    });
    expect(phonemeSequence(levels!)).toEqual({ chars: [KAF, "\u064F"], posteriors: [0.4, 0.8] });
  });

  it("flattens multi-character tokens, keeping each token's posterior", () => {
    const levels = researchLevels({
      levels: [{ tokens: [RAA + RAA, ALIF], tokenPosteriors: [0.7, 0.9], meanPosterior: 0.8 }],
    });
    expect(phonemeSequence(levels!)).toEqual({ chars: [RAA, RAA, ALIF], posteriors: [0.7, 0.7, 0.9] });
  });

  it("rejects malformed records as inconclusive", () => {
    expect(researchLevels({ levels: [{ tokens: [KAF], tokenPosteriors: [], meanPosterior: 1 }] })).toBeNull();
    expect(researchLevels(undefined)).toBeNull();
    expect(phonemeSequence([{ tokens: ["hams"], tokenPosteriors: [1], meanPosterior: 1 }])).toBeNull();
  });
});

describe("card checks", () => {
  it("never lets a posterior decide the outcome", () => {
    const planted = KAF + REFERENCE_PHONEMES["112:1"].slice(1);
    expect(CARD_CHECKS["112:1"].run(seq(planted, 0.01)).outcome).toBe("deviation_present");
    expect(CARD_CHECKS["112:1"].run(seq(REFERENCE_PHONEMES["112:1"], 0.01)).outcome).toBe("deviation_absent");
    expect(CARD_CHECKS["112:1"].run(seq(planted, 0.01)).hintPosterior).toBe(0.01);
  });

  it("is inconclusive when the anchor phonemes are missing or ambiguous", () => {
    const ref112 = REFERENCE_PHONEMES["112:1"];
    expect(CARD_CHECKS["112:1"].run(seq(ref112[0] + KAF + ref112.slice(1))).outcome).toBe("inconclusive");
    expect(CARD_CHECKS["113:2"].run(seq(REFERENCE_PHONEMES["1:4"])).outcome).toBe("inconclusive");
    expect(CARD_CHECKS["1:4"].run(seq(REFERENCE_PHONEMES["113:2"])).outcome).toBe("inconclusive");
  });

  it("flags a final aared madd shortened below its 2-count minimum on 1:4", () => {
    const ref = REFERENCE_PHONEMES["1:4"];
    const shortTail = ref.replace(YAA_MADD.repeat(4), YAA_MADD);
    expect(CARD_CHECKS["1:4"].run(seq(shortTail)).outcome).toBe("deviation_present");
    const twoCount = ref.replace(YAA_MADD.repeat(4), YAA_MADD.repeat(2));
    expect(CARD_CHECKS["1:4"].run(seq(twoCount)).outcome).toBe("deviation_absent");
  });

  it("treats an extra hamza alone as misplaced-waqf evidence on 1:7", () => {
    const ref = REFERENCE_PHONEMES["1:7"];
    const restarted = ref.slice(0, 8) + HAMZA + "\u064E" + ref.slice(8);
    expect(CARD_CHECKS["1:7"].run(seq(restarted)).outcome).toBe("deviation_present");
  });

  it("computes edit distance", () => {
    expect(editDistance("", "")).toBe(0);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});

describe("CLI detection section", () => {
  const script = path.resolve(__dirname, "../../scripts/score-muaalem-benchmark.mjs");

  it("appends the section after an unchanged scorecard only when --attempts is given", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "muaalem-detect-"));
    try {
      const { bundle, attemptsExport } = buildSyntheticDetectionFixture();
      const bundlePath = path.join(dir, "bundle.json");
      const attemptsPath = path.join(dir, "attempts.json");
      writeFileSync(bundlePath, JSON.stringify(bundle));
      writeFileSync(attemptsPath, JSON.stringify(attemptsExport));
      const plain = execFileSync("node", [script, bundlePath], { encoding: "utf8" });
      expect(plain).not.toContain("Phoneme-sequence detection");
      const withDetection = execFileSync("node", [script, "--attempts", attemptsPath, bundlePath], { encoding: "utf8" });
      expect(withDetection.startsWith(plain)).toBe(true);
      expect(withDetection.slice(plain.length)).toContain("## Phoneme-sequence detection (research, opt-in)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("labels the detection self-test as a synthetic fixture", () => {
    const out = execFileSync("node", [script, "--self-test-detection"], { encoding: "utf8" });
    expect(out.startsWith("> SYNTHETIC FIXTURE")).toBe(true);
    expect(out).toContain("NOT benchmark results");
  });
});

// ---------------------------------------------------------------------------
// Attempts-export fallback (Step 1B). The September 2026 bundle was empty on
// both sides while the attempts export held all 17 rows; the scorecard read
// only the bundle and printed 0/0. All fixtures below are SYNTHETIC.
// ---------------------------------------------------------------------------

/** One flat attempts-export row, shaped like `rowOf` in attemptExport.ts. */
const flatRow = (overrides: Record<string, any> = {}) => ({
  runId: "run_synth_fallback",
  attemptId: "att_synth_1",
  correlationId: "synth-take-1",
  route: "tutor",
  outcome: "responded",
  ayahRef: "1:1",
  position: null,
  wordIndex: null,
  muaalemStatus: "available",
  muaalemModelId: "obadx/muaalem-model-v3_2",
  muaalemRawPosterior: 0.95,
  muaalemPhonemeTokens: 31,
  muaalemDecodedLevels: 11,
  muaalemLatencyMs: 120,
  evaluatorStatus: "abstained",
  evaluatorHttpStatus: 200,
  evaluatorLatencyMs: 1500,
  primaryCorrectionsEnabled: false,
  alignmentConfidence: 0.9,
  findingsCount: 0,
  abstentionReason: "insufficient_reliable_evidence",
  verdict: "abstained",
  tutorOutcome: "listening",
  shouldAdvance: false,
  verseFollowingReason: "matched",
  reviewMessageCode: "none",
  matchedCount: 7,
  totalWords: 7,
  score: 0.9,
  errorCode: null,
  startedAt: null,
  evidenceReadyAt: null,
  completedAt: null,
  ...overrides,
});

/** 9 correct + 8 incorrect takes, labels keyed by correlationId, empty bundle. */
function syntheticFallbackCase() {
  const labels: Record<string, { variant: string; errorType: string | null; surah: number; ayah: number }> = {};
  const attempts: Record<string, any>[] = [];
  for (let i = 0; i < 17; i += 1) {
    const incorrect = i >= 9;
    const correlationId = `synth-take-${String(i + 1).padStart(2, "0")}`;
    labels[correlationId] = {
      variant: incorrect ? "incorrect" : "correct",
      errorType: incorrect ? "mispronounced-letter" : null,
      surah: 1,
      ayah: 1,
    };
    attempts.push(
      flatRow({
        attemptId: `att_synth_${i + 1}`,
        correlationId,
        score: incorrect ? 0.4 : 0.9,
      }),
    );
  }
  const bundle = {
    schemaVersion: 1,
    runId: "run_synth_fallback",
    exportedAt: "2026-09-27T04:55:00Z",
    client: { runId: "run_synth_fallback", exportedAt: "2026-09-27T04:55:00Z", eventCount: 0, events: [] },
    server: { runId: "run_synth_fallback", attemptDiagnostics: [] },
  };
  return { bundle, labels, attempts };
}

describe("attempts-export fallback", () => {
  it("rebuilds a flat export row into the nested bundle-row shape", () => {
    const research = { levels: [] };
    const nested: any = normalizeAttemptExportRow(flatRow({ researchPhonemes: research }));
    expect(nested.attemptId).toBe("att_synth_1");
    expect(nested.correlationId).toBe("synth-take-1");
    expect(nested.evaluatorLatencyMs).toBe(1500);
    expect(nested.acoustic).toMatchObject({
      shadowStatus: "available",
      shadowModelId: "obadx/muaalem-model-v3_2",
      shadowAveragePosterior: 0.95,
      shadowPhonemeTokens: 31,
      shadowDecodedLevels: 11,
      shadowLatencyMs: 120,
      evaluatorStatus: "abstained",
      evaluatorHttpStatus: 200,
      evaluatorLatencyMs: 1500,
      primaryCorrectionsEnabled: false,
      alignmentConfidence: 0.9,
      findingsCount: 0,
      abstentionReason: "insufficient_reliable_evidence",
    });
    expect(nested.decision).toMatchObject({
      tutorOutcome: "listening",
      shouldAdvance: false,
      verseFollowingReason: "matched",
      reviewMessageCode: "none",
      matchedCount: 7,
      totalWords: 7,
      score: 0.9,
    });
    expect(nested.researchPhonemes).toBe(research);
  });

  it("maps missing flat fields to null and omits researchPhonemes when absent", () => {
    const nested: any = normalizeAttemptExportRow({ attemptId: "att_x", correlationId: "synth-x" });
    expect(nested.acoustic.shadowStatus).toBeNull();
    expect(nested.decision.score).toBeNull();
    expect(nested.evaluatorLatencyMs).toBeNull();
    expect("researchPhonemes" in nested).toBe(false);
  });

  it("keeps bundle rows untouched when the bundle has any", () => {
    const { serverRows } = parseBundle(buildSyntheticBundle());
    expect(selectScorecardRows(serverRows, [flatRow()])).toBe(serverRows);
  });

  it("scores 17/17 from the export when the bundle is empty", () => {
    const { bundle, labels, attempts } = syntheticFallbackCase();
    const { clientEvents, serverRows } = parseBundle(bundle);
    const { labels: collected } = collectLabels(clientEvents, labels);
    expect(collected.size).toBe(17);
    const idMap = buildClientToServerMap(clientEvents);
    const rows = selectScorecardRows(serverRows, attempts);
    expect(rows.length).toBe(17);
    const metrics = scoreBenchmark({ labels: collected, idMap, serverRows: rows, clientEvents });
    expect(metrics.unjoined).toBe(0);
    expect(metrics.incorrect).toMatchObject({ n: 8, assessed: 8, flagged: 8 });
    expect(metrics.correct).toMatchObject({ n: 9, assessed: 9, flagged: 9 });
  });

  it("scores 0 assessed from raw flat rows — the normalizer is required", () => {
    const { bundle, labels, attempts } = syntheticFallbackCase();
    const { clientEvents } = parseBundle(bundle);
    const { labels: collected } = collectLabels(clientEvents, labels);
    const idMap = buildClientToServerMap(clientEvents);
    const metrics = scoreBenchmark({ labels: collected, idMap, serverRows: attempts, clientEvents });
    expect(metrics.unjoined).toBe(0);
    expect(metrics.incorrect.assessed + metrics.correct.assessed).toBe(0);
  });
});

describe("CLI fallback and fail-loudly", () => {
  const script = path.resolve(__dirname, "../../scripts/score-muaalem-benchmark.mjs");

  it("scores the fallback export end to end: 17/17 joined and assessed", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "muaalem-fallback-"));
    try {
      const { bundle, labels, attempts } = syntheticFallbackCase();
      const bundlePath = path.join(dir, "bundle.json");
      const labelsPath = path.join(dir, "labels.json");
      const attemptsPath = path.join(dir, "attempts.json");
      writeFileSync(bundlePath, JSON.stringify(bundle));
      writeFileSync(labelsPath, JSON.stringify(labels));
      writeFileSync(
        attemptsPath,
        JSON.stringify({ schema: "quran.validation.attempts.v1", runId: "run_synth_fallback", attempts }),
      );
      const res = spawnSync("node", [script, bundlePath, "--labels", labelsPath, "--attempts", attemptsPath], {
        encoding: "utf8",
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Labeled attempts scored: 17");
      expect(res.stdout).toContain("Labeled attempts with no matching server diagnostics: 0");
      expect(res.stdout).toContain("8/8 (100.0%)");
      expect(res.stdout).toContain("9/9 (100.0%)");
      expect(res.stdout).not.toContain("no server row");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 2 with no report when the bundle is empty and no export is given", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "muaalem-fallback-"));
    try {
      const { bundle, labels } = syntheticFallbackCase();
      const bundlePath = path.join(dir, "bundle.json");
      const labelsPath = path.join(dir, "labels.json");
      writeFileSync(bundlePath, JSON.stringify(bundle));
      writeFileSync(labelsPath, JSON.stringify(labels));
      const res = spawnSync("node", [script, bundlePath, "--labels", labelsPath], { encoding: "utf8" });
      expect(res.status).toBe(2);
      expect(res.stdout).toBe("");
      expect(res.stderr).toContain("refusing to emit a 0/0 report");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 2 with no report when zero attempts are assessed", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "muaalem-fallback-"));
    try {
      // Bundle rows exist but carry no readable shadow diagnostics.
      const bundle: any = buildSyntheticBundle();
      for (const row of bundle.server.attemptDiagnostics) {
        row.acoustic.shadowStatus = "not_run";
        row.acoustic.shadowAveragePosterior = null;
      }
      const bundlePath = path.join(dir, "bundle.json");
      writeFileSync(bundlePath, JSON.stringify(bundle));
      const res = spawnSync("node", [script, bundlePath], { encoding: "utf8" });
      expect(res.status).toBe(2);
      expect(res.stdout).toBe("");
      expect(res.stderr).toContain("refusing to emit a 0/0 report");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still exits 0 with one unjoined attempt on the healthy synthetic bundle", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "muaalem-fallback-"));
    try {
      const bundlePath = path.join(dir, "bundle.json");
      writeFileSync(bundlePath, JSON.stringify(buildSyntheticBundle()));
      const res = spawnSync("node", [script, bundlePath], { encoding: "utf8" });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Labeled attempts with no matching server diagnostics: 1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
