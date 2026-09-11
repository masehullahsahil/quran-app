/**
 * Integration test for the extended validate-real-recitation flow.
 *
 * Runs the real (pure) evaluation pipeline — alignment, verse following,
 * teacher decision — against a fixture transcript with FAKE audio loading,
 * transcription, and acoustic evaluation. No live services, no network.
 *
 * Importing the script module must NOT execute its CLI main flow (that would
 * hit the network); this file passing at all proves the guard works.
 */
import { describe, expect, it } from "vitest";
import {
  parseCliArgs,
  runSample,
  samples,
  toSampleAttemptSummary,
  type SamplePipelineDeps,
} from "../../scripts/validate-real-recitation";
import { recordSampleAttempt } from "./attemptRecorder";
import {
  captureBuildInfo,
  createAttemptId,
  createRunId,
  renderMarkdownReport,
  ValidationLedger,
} from "./validationRun";

const FATIHA_1_1 = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";

const fakeDeps: SamplePipelineDeps = {
  loadAudio: async () => Buffer.from("fake-audio-bytes"),
  transcribe: async () => ({
    task: "transcribe",
    language: "ar",
    duration: 2,
    text: FATIHA_1_1,
    segments: [],
  }),
  evaluateAcoustic: async () => ({
    status: "not_configured",
    provider: null,
    confidence: null,
    summary: null,
    findings: [],
  }),
};

describe("validate-real-recitation with injected fakes (no network, no live services)", () => {
  it("evaluates the correct-ayah fixture end to end and records a ledger", async () => {
    const sample = samples[0];
    expect(sample.kind).toBe("correct_ayah");

    const report = await runSample(sample, fakeDeps);
    expect(report.evaluationAbstained).toBe(false);
    expect(report.totalExpectedWords).toBeGreaterThan(0);
    expect(report.matchedWords).toBe(report.totalExpectedWords);

    const ledger = new ValidationLedger({
      runId: createRunId(),
      build: captureBuildInfo(),
      deviceMetadata: { deviceName: "integration-fixture", network: "none" },
    });
    const attemptId = createAttemptId();
    ledger.record("session.start", { sampleCount: 1 }, { correlationId: "corr-int-1" });
    const { correctionDecided } = recordSampleAttempt(ledger, toSampleAttemptSummary(sample, report), {
      attemptId,
      correlationId: "corr-int-1",
    });

    expect(correctionDecided).toBe(false);

    const checkpoints = ledger.eventsOfType("position.checkpoint");
    expect(checkpoints).toHaveLength(1);
    const checkpoint = checkpoints[0].details as unknown as {
      surah: number;
      ayah: number;
      source: string;
    };
    expect(checkpoint.surah).toBe(1);
    expect(checkpoint.ayah).toBe(1);
    expect(checkpoint.source).toBe("harness");
    expect(checkpoints[0].attemptId).toBe(attemptId);
    expect(checkpoints[0].correlationId).toBe("corr-int-1");

    const completed = ledger.eventsOfType("attempt.completed");
    expect(completed).toHaveLength(1);

    // The ledger must never carry raw transcripts, audio, or secrets.
    const exported = JSON.stringify(ledger.toJSON());
    expect(exported).not.toContain("transcriptReturned");
    expect(exported).not.toContain("normalizedTranscript");
    expect(exported).not.toContain("audioBase64");
    expect(exported).toContain("integration-fixture");

    const md = renderMarkdownReport(ledger, {
      pilotTargets: { noFalseCorrectionRate: 0.98, clearOmissionDetectionRate: 0.85 },
    });
    expect(md).toContain(ledger.runId);
    expect(md).toContain("## ECHO-01");
    expect(md).toContain("PROVISIONAL PILOT TARGET");
    expect(ledger.computeVerdict().status).toBe("pass");
  });

  it("records a serious safety outcome for a false correction on a correct sample", async () => {
    const sample = samples[0];
    const report = await runSample(sample, fakeDeps);
    const summary = toSampleAttemptSummary(sample, report);
    // Simulate a correction decision on the known-correct sample.
    const ledger = new ValidationLedger({ runId: createRunId(), build: captureBuildInfo() });
    recordSampleAttempt(
      ledger,
      { ...summary, teacherDecisionKind: "repeat-word", teacherDecisionFocusWordIndex: 2 },
      { attemptId: createAttemptId() },
    );
    const serious = ledger
      .eventsOfType("safety.outcome")
      .filter((event) => (event.details as { severity?: string }).severity === "serious");
    expect(serious).toHaveLength(1);
    expect((serious[0].details as { code?: string }).code).toBe("false-correction-on-correct-sample");
    // Serious is not a blocker: verdict still passes.
    expect(ledger.computeVerdict().status).toBe("pass");
  });

  it("fails the verdict when a blocker is recorded", async () => {
    const ledger = new ValidationLedger({ runId: createRunId(), build: captureBuildInfo() });
    ledger.recordSafetyOutcome({
      severity: "blocker",
      code: "echo-playback-caused-advance",
      description: "Playback advanced the learner.",
    });
    expect(ledger.computeVerdict().status).toBe("fail");
  });
});

describe("CLI arg parsing", () => {
  it("parses run/device/correlation/output flags with sane defaults", () => {
    const cli = parseCliArgs([
      "--run-id",
      "run_abc",
      "--correlation-id",
      "corr-9",
      "--device-name",
      "pilot-phone",
      "--network",
      "4g",
    ]);
    expect(cli.runId).toBe("run_abc");
    expect(cli.correlationId).toBe("corr-9");
    expect(cli.deviceMetadata.deviceName).toBe("pilot-phone");
    expect(cli.deviceMetadata.network).toBe("4g");
    expect(cli.ledgerOut).toContain("run_abc");
    expect(cli.reportOut).toContain("run_abc");
  });

  it("generates a run ID and parses --device-json", () => {
    const cli = parseCliArgs(["--device-json", '{"deviceName":"x","browser":"Chrome"}']);
    expect(cli.runId.startsWith("run_")).toBe(true);
    expect(cli.deviceMetadata.deviceName).toBe("x");
    expect(cli.deviceMetadata.browser).toBe("Chrome");
  });

  it("ignores invalid --device-json without throwing", () => {
    const cli = parseCliArgs(["--device-json", "not-json"]);
    expect(cli.deviceMetadata).toEqual({});
  });
});
