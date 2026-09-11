import { describe, expect, it } from "vitest";
import {
  captureBuildInfo,
  createAttemptId,
  createRunId,
  isAttemptId,
  isRunId,
  renderMarkdownReport,
  sanitizeDetails,
  ValidationLedger,
} from "./validationRun";

function makeLedger() {
  return new ValidationLedger({
    runId: createRunId(),
    build: captureBuildInfo(),
    deviceMetadata: { deviceName: "pilot-phone-1", network: "wifi" },
  });
}

describe("run/attempt IDs", () => {
  it("generates prefixed, well-formed, unique IDs", () => {
    const runs = new Set(Array.from({ length: 500 }, () => createRunId()));
    const attempts = new Set(Array.from({ length: 500 }, () => createAttemptId()));
    expect(runs.size).toBe(500);
    expect(attempts.size).toBe(500);
    for (const id of runs) {
      expect(isRunId(id)).toBe(true);
      expect(isAttemptId(id)).toBe(false);
    }
    for (const id of attempts) {
      expect(isAttemptId(id)).toBe(true);
      expect(isRunId(id)).toBe(false);
    }
    expect(isRunId("run_short")).toBe(false);
    expect(isAttemptId("bogus")).toBe(false);
  });
});

describe("build/version capture", () => {
  it("never throws and always returns safe fallbacks", () => {
    const info = captureBuildInfo({});
    expect(typeof info.appVersion).toBe("string");
    expect(typeof info.commit).toBe("string");
    expect(typeof info.nodeEnv).toBe("string");
    expect(info.capturedAt).not.toBe("");
  });

  it("reads the app version from package.json", () => {
    expect(captureBuildInfo().appVersion).toBe("1.0.0");
  });

  it("prefers explicit commit env vars and never leaks values", () => {
    const info = captureBuildInfo({ VERCEL_GIT_COMMIT_SHA: "abc123", VERCEL_ENV: "production" } as NodeJS.ProcessEnv);
    expect(info.commit).toBe("abc123");
    expect(info.vercelEnv).toBe("production");
  });
});

describe("ledger", () => {
  it("appends events with incrementing seq and links run/attempt/correlation IDs", () => {
    const ledger = makeLedger();
    const attemptId = createAttemptId();
    const first = ledger.record("session.start", {}, { correlationId: "corr-1" });
    const second = ledger.record("position.checkpoint", { surah: 1, ayah: 1, wordIndex: 2 }, { attemptId, correlationId: "corr-1" });
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(second.runId).toBe(ledger.runId);
    expect(second.attemptId).toBe(attemptId);
    expect(second.correlationId).toBe("corr-1");
    expect(ledger.events).toHaveLength(2);
  });

  it("redacts secrets, audio payloads, transcripts, and PII from details", () => {
    const ledger = makeLedger();
    const event = ledger.record("note", {
      apiKey: "sk-secret",
      audioBase64: "AAA...",
      transcriptReturned: "بِسْمِ اللَّهِ",
      nested: { password: "hunter2", email: "a@b.c" },
      surah: 1,
      wordIndex: 3,
      audioDerived: true,
    });
    const json = JSON.stringify(event.details);
    expect(json).not.toContain("sk-secret");
    expect(json).not.toContain("AAA...");
    expect(json).not.toContain("بِسْمِ");
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain("a@b.c");
    expect(event.details.surah).toBe(1);
    expect(event.details.wordIndex).toBe(3);
    expect(event.details.audioDerived).toBe(true);
    expect(event.details.apiKey).toBe("[redacted]");
  });

  it("exports JSON without leaking redacted values", () => {
    const ledger = makeLedger();
    ledger.record("device.metadata", { token: "tok-123", deviceName: "pilot-phone-1" });
    const exported = JSON.stringify(ledger.toJSON());
    expect(exported).not.toContain("tok-123");
    expect(exported).toContain("pilot-phone-1");
    expect(ledger.toJSON().eventCount).toBe(1);
  });
});

describe("timing computation", () => {
  it("computes correction → interruption → playback → mic-reopen latencies", () => {
    const ledger = makeLedger();
    const attemptId = createAttemptId();
    const base = Date.parse("2026-09-11T00:00:00.000Z");
    const at = (ms: number) => new Date(base + ms).toISOString();
    ledger.record("correction.decided", {}, { attemptId, t: at(0) });
    ledger.record("tutor.interrupted", {}, { attemptId, t: at(400) });
    ledger.record("playback.started", {}, { attemptId, t: at(700) });
    ledger.record("playback.ended", {}, { attemptId, t: at(2700) });
    ledger.record("mic.reopened", {}, { attemptId, t: at(3100) });

    const timings = ledger.computeTimings();
    expect(timings.perAttempt).toHaveLength(1);
    const row = timings.perAttempt[0];
    expect(row.attemptId).toBe(attemptId);
    expect(row.correctionToInterruptionMs).toBe(400);
    expect(row.interruptionToPlaybackStartMs).toBe(300);
    expect(row.playbackDurationMs).toBe(2000);
    expect(row.playbackEndToMicReopenMs).toBe(400);
    expect(row.correctionToMicReopenMs).toBe(3100);
  });

  it("returns nulls when stages are missing", () => {
    const ledger = makeLedger();
    ledger.record("correction.decided", {}, { attemptId: createAttemptId() });
    const row = ledger.computeTimings().perAttempt[0];
    expect(row.correctionToInterruptionMs).toBeNull();
  });
});

describe("ECHO-01 playback-leak computation", () => {
  it("computes the playback-leak false-evidence rate", () => {
    const ledger = makeLedger();
    const attemptId = createAttemptId();
    const base = Date.parse("2026-09-11T00:00:00.000Z");
    const at = (ms: number) => new Date(base + ms).toISOString();
    ledger.record("playback.started", { playbackSource: "qari" }, { attemptId, t: at(0) });
    ledger.recordPosition(
      { surah: 1, ayah: 1, wordIndex: 2, source: "server", evidenceSource: "learner-audio", audioDerived: true },
      { attemptId, t: at(500) },
    );
    ledger.record("playback.ended", { playbackSource: "qari" }, { attemptId, t: at(1000) });
    // Outside playback: must not count.
    ledger.recordPosition(
      { surah: 1, ayah: 1, wordIndex: 3, source: "server", evidenceSource: "learner-audio", audioDerived: true },
      { attemptId, t: at(1500) },
    );

    const echo = ledger.computeEchoLeak();
    expect(echo.intervals).toHaveLength(1);
    expect(echo.offendingEvents).toHaveLength(1);
    expect(echo.playbackLeakFalseEvidenceRate).toBe(1);
    expect(echo.mutationsDuringPlayback).toHaveLength(0);
  });

  it("flags Quran-state mutation during playback as a blocker-grade finding", () => {
    const ledger = makeLedger();
    const attemptId = createAttemptId();
    const base = Date.parse("2026-09-11T00:00:00.000Z");
    const at = (ms: number) => new Date(base + ms).toISOString();
    ledger.record("playback.started", { playbackSource: "tutor" }, { attemptId, t: at(0) });
    ledger.recordPosition(
      {
        surah: 1,
        ayah: 2,
        wordIndex: 0,
        source: "server",
        evidenceSource: "learner-audio",
        audioDerived: true,
        quranStateMutation: "advance",
      },
      { attemptId, t: at(300) },
    );
    ledger.record("playback.ended", { playbackSource: "tutor" }, { attemptId, t: at(900) });

    const echo = ledger.computeEchoLeak();
    expect(echo.mutationsDuringPlayback).toHaveLength(1);

    ledger.recordSafetyOutcome(
      {
        severity: "blocker",
        code: "echo-playback-caused-advance",
        description: "Tutor playback advanced the learner during ECHO-01.",
      },
      { attemptId },
    );
    expect(ledger.computeVerdict().status).toBe("fail");
    expect(ledger.computeVerdict().blockerCount).toBe(1);
  });

  it("returns a null rate when no playback occurred", () => {
    const ledger = makeLedger();
    ledger.record("position.checkpoint", { surah: 1, ayah: 1, wordIndex: 1 });
    expect(ledger.computeEchoLeak().playbackLeakFalseEvidenceRate).toBeNull();
  });
});

describe("verdict", () => {
  it("fails only on recorded blockers, never on thresholds", () => {
    const ledger = makeLedger();
    ledger.recordSafetyOutcome({ severity: "serious", code: "s1", description: "serious thing" });
    ledger.recordSafetyOutcome({ severity: "info", code: "i1", description: "info thing" });
    const verdict = ledger.computeVerdict();
    expect(verdict.status).toBe("pass");
    expect(verdict.seriousCount).toBe(1);
    expect(verdict.blockerCount).toBe(0);
  });
});

describe("markdown report", () => {
  it("renders all sections and labels pilot targets as provisional", () => {
    const ledger = makeLedger();
    const attemptId = createAttemptId();
    ledger.record("session.start", { sampleCount: 1 });
    ledger.recordPosition({ surah: 1, ayah: 1, wordIndex: 0, source: "harness" }, { attemptId });
    ledger.recordSafetyOutcome({ severity: "info", code: "ok", description: "all good" });

    const md = renderMarkdownReport(ledger, {
      pilotTargets: { noFalseCorrectionRate: 0.98, maxCorrectionLatencyMs: 1500 },
    });
    expect(md).toContain("## Build / version");
    expect(md).toContain("## Device / environment metadata");
    expect(md).toContain("## Correction / interruption / playback timing");
    expect(md).toContain("## Position checkpoints (server-held)");
    expect(md).toContain("## ECHO-01");
    expect(md).toContain("## Safety outcomes");
    expect(md).toContain("## Verdict");
    expect(md).toContain("PROVISIONAL PILOT TARGET");
    expect(md).toContain("NOT claims about current app performance");
    expect(md).toContain("0.98");
  });

  it("omits the pilot-target section when none are provided", () => {
    const md = renderMarkdownReport(makeLedger());
    expect(md).not.toContain("## Provisional pilot targets");
    expect(md).toContain("**PASS**");
  });
});

describe("sanitizeDetails", () => {
  it("handles nesting, arrays, and long strings without throwing", () => {
    const out = sanitizeDetails({
      list: [{ secret: "x" }, "ok"],
      long: "a".repeat(5000),
      deep: { a: { b: { c: { d: { e: { f: { g: "too-deep" } } } } } } },
    });
    expect((out.list as unknown[])[0]).toEqual({ secret: "[redacted]" });
    expect((out.long as string).endsWith("[truncated]")).toBe(true);
    expect(JSON.stringify(out)).not.toContain("too-deep");
  });
});
