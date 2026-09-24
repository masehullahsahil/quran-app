import { describe, expect, it } from "vitest";
import {
  buildClientToServerMap,
  buildSyntheticBundle,
  bucket01,
  collectLabels,
  countPct,
  isValidLabel,
  parseBundle,
  percentile,
  renderMarkdown,
  resolveRow,
  scoreBenchmark,
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
