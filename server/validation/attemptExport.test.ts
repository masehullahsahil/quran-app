/**
 * Per-attempt Muaalem shadow export: run scoping, redaction, and staff gating.
 */
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { createApp } from "../_core/app";
import {
  ATTEMPT_EXPORT_SCHEMA,
  buildAttemptExport,
  ledgerFromSavedFile,
  type ValidationAttemptExport,
} from "./attemptExport";
import {
  activateValidationRun,
  deactivateValidationRun,
  exportValidationRun,
  observeFinalRecitationFailure,
  observeFinalRecitationResult,
  observeLiveRouterResult,
  resetValidationRunsForTests,
  STAFF_API_ENV_VAR,
  type ActiveValidationRun,
} from "./liveObservation";
import { registerStaffValidationEndpoints } from "./staffEndpoints";
import { createRunId } from "./validationRun";
import type { QuranEvaluatorDiagnostics } from "../quranEvaluator";

const savedEnv = { ...process.env };

beforeEach(() => {
  resetValidationRunsForTests();
  process.env = { ...savedEnv, LOG_LEVEL: "error" };
});

afterEach(() => {
  process.env = { ...savedEnv };
  resetValidationRunsForTests();
});

const ARABIC = /[؀-ۿ]/;

const muaalem: QuranEvaluatorDiagnostics = {
  evaluatorCalled: true,
  evaluatorStatus: "abstained",
  evaluatorHttpStatus: 200,
  evaluatorLatencyMs: 1432,
  primaryCorrectionsEnabled: false,
  shadowStatus: "available",
  shadowProvider: "muaalem-shadow",
  shadowModelId: "obadx/muaalem-model-v3_2",
  shadowDecodedLevels: 11,
  shadowPhonemeTokens: 37,
  shadowAveragePosterior: 0.91,
  shadowLatencyMs: 812,
  evaluatedSurah: 1,
  evaluatedAyah: 2,
  alignmentConfidence: 0.62,
  findingsCount: 0,
  abstentionReason: "insufficient_reliable_evidence",
};

function recordTutorAttempt(run: ActiveValidationRun, attemptId: string, correlationId: string) {
  observeFinalRecitationResult(
    run,
    "recitation.evaluateWithTutor",
    {
      recitation: {
        attemptScope: "ayah",
        reviewStatus: "available",
        matchedCount: 2,
        totalWords: 4,
        score: 50,
        verseFollowing: {
          reason: "mistake_to_correct",
          state: "correcting",
          shouldAdvance: false,
          currentSurah: 1,
          currentAyah: 2,
          expectedWordIndex: 3,
        },
        quranAwareReview: { status: "abstained" },
        transcript: "الحمد لله",
        audioBase64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEA",
        expectedWords: [{ expected: "ٱلْحَمْدُ", heard: "الحمد" }],
      },
      tutor: { status: "updated", action: { kind: "ask-target-word", reason: "missed-word" } },
      outcome: "correction_required",
    },
    {
      correlationId,
      attemptId,
      acoustic: muaalem,
      startedAt: "2026-09-24T10:00:00.000Z",
      evidenceReadyAt: "2026-09-24T10:00:01.432Z",
    },
  );
}

describe("buildAttemptExport", () => {
  it("returns one flat row per finalized attempt with the benchmark fields", () => {
    const runId = createRunId();
    const run = activateValidationRun(runId);
    recordTutorAttempt(run, "att_0123456789abcdef01234567", "req_abcdefgh1234");

    const exported = buildAttemptExport(exportValidationRun(runId))!;
    expect(exported.schema).toBe(ATTEMPT_EXPORT_SCHEMA);
    expect(exported.runId).toBe(runId);
    expect(exported.attemptCount).toBe(1);
    const [row] = exported.attempts;
    expect(row).toMatchObject({
      runId,
      attemptId: "att_0123456789abcdef01234567",
      correlationId: "req_abcdefgh1234",
      route: "tutor",
      outcome: "responded",
      ayahRef: "1:2",
      position: { surah: 1, ayah: 2, wordIndex: 3 },
      wordIndex: 3,
      muaalemStatus: "available",
      muaalemModelId: "obadx/muaalem-model-v3_2",
      muaalemRawPosterior: 0.91,
      muaalemPhonemeTokens: 37,
      alignmentConfidence: 0.62,
      findingsCount: 0,
      abstentionReason: "insufficient_reliable_evidence",
      verdict: "abstained",
      primaryCorrectionsEnabled: false,
      tutorOutcome: "correction_required",
      shouldAdvance: false,
      startedAt: "2026-09-24T10:00:00.000Z",
      evidenceReadyAt: "2026-09-24T10:00:01.432Z",
    });
    expect(row.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes failed and live attempts, and labels verdicts without pronunciation claims", () => {
    const runId = createRunId();
    const run = activateValidationRun(runId);
    observeFinalRecitationFailure(run, "recitation.evaluate", { code: "TIMEOUT" }, {
      correlationId: "req_failed12345",
      attemptId: "att_aaaaaaaaaaaaaaaaaaaaaaaa",
    });
    observeLiveRouterResult(
      run,
      "recitation.ingestLiveAudio",
      {
        acknowledgement: { status: "applied", turnId: "turn-9", chunkId: "turn-9:1", sequence: 3 },
        stream: { streamId: "s-1", tracker: { surah: 1, ayah: 3, expectedWordIndex: 1 } },
        recognitionStatus: "transcribed",
        recitation: {
          attemptScope: "ayah",
          verseFollowing: { reason: "ayah_complete", shouldAdvance: true, currentSurah: 1, currentAyah: 3, expectedWordIndex: 1 },
        },
        outcome: "accepted",
      },
      {
        correlationId: "req_live12345",
        attemptId: "turn-9",
        acoustic: { ...muaalem, evaluatorStatus: "available", findingsCount: 1, abstentionReason: null },
      },
    );
    const rows = buildAttemptExport(exportValidationRun(runId))!.attempts;
    expect(rows.map((row) => [row.attemptId, row.route, row.verdict])).toEqual([
      ["att_aaaaaaaaaaaaaaaaaaaaaaaa", "study", "request_failed"],
      ["turn-9", "live", "findings_reported"],
    ]);
    expect(rows[0]).toMatchObject({ errorCode: "TIMEOUT", ayahRef: null, muaalemStatus: "not_run" });
  });

  it("labels a clean evaluator run 'no_findings' instead of 'not_run' (Codex P1)", () => {
    const runId = createRunId();
    const run = activateValidationRun(runId);
    observeLiveRouterResult(
      run,
      "recitation.ingestLiveAudio",
      {
        acknowledgement: { status: "applied", turnId: "turn-9", chunkId: "turn-9:1", sequence: 3 },
        stream: { streamId: "s-1", tracker: { surah: 1, ayah: 3, expectedWordIndex: 1 } },
        recognitionStatus: "transcribed",
        recitation: {
          attemptScope: "ayah",
          verseFollowing: { reason: "ayah_complete", shouldAdvance: true, currentSurah: 1, currentAyah: 3, expectedWordIndex: 1 },
        },
        outcome: "accepted",
      },
      {
        correlationId: "req_clean12345",
        attemptId: "turn-clean-1",
        acoustic: { ...muaalem, evaluatorStatus: "available", findingsCount: 0, abstentionReason: null },
      },
    );
    const [row] = buildAttemptExport(exportValidationRun(runId))!.attempts;
    expect(row).toMatchObject({ evaluatorStatus: "available", findingsCount: 0, verdict: "no_findings" });
  });

  it("scopes rows to one run: no cross-run leakage", () => {
    const runA = activateValidationRun(createRunId());
    const runB = activateValidationRun(createRunId());
    recordTutorAttempt(runA, "att_aaaaaaaaaaaaaaaaaaaaaaaa", "req_run_a_000001");
    recordTutorAttempt(runB, "att_bbbbbbbbbbbbbbbbbbbbbbbb", "req_run_b_000001");
    recordTutorAttempt(runB, "att_cccccccccccccccccccccccc", "req_run_b_000002");

    const a = buildAttemptExport(exportValidationRun(runA.runId))!;
    const b = buildAttemptExport(exportValidationRun(runB.runId))!;
    expect(a.attempts.map((row) => row.attemptId)).toEqual(["att_aaaaaaaaaaaaaaaaaaaaaaaa"]);
    expect(b.attempts.map((row) => row.attemptId)).toEqual([
      "att_bbbbbbbbbbbbbbbbbbbbbbbb",
      "att_cccccccccccccccccccccccc",
    ]);
    expect(JSON.stringify(a)).not.toContain("req_run_b");

    // A merged or hand-edited ledger file cannot smuggle another run's events.
    const merged = exportValidationRun(runA.runId)!;
    merged.events.push(...exportValidationRun(runB.runId)!.events);
    const fromMerged = buildAttemptExport(merged)!;
    expect(fromMerged.attempts.every((row) => row.runId === runA.runId)).toBe(true);
    expect(fromMerged.attemptCount).toBe(1);
  });

  it("redacts: no audio, transcript, Quran text, secrets or identity even from a tampered ledger", () => {
    const runId = createRunId();
    const run = activateValidationRun(runId);
    recordTutorAttempt(run, "att_0123456789abcdef01234567", "req_abcdefgh1234");
    const ledger = exportValidationRun(runId)!;
    const terminal = ledger.events.find((event) => event.type === "attempt.completed")!;
    // Simulate a hand-edited file carrying forbidden values in allowed slots.
    terminal.correlationId = "Bearer sk-live-secret ٱلْحَمْدُ";
    Object.assign(terminal.details, {
      transcript: "الحمد لله رب العالمين",
      audioBase64: "UklGRiQAAABXQVZF",
      errorCode: "رب العالمين",
      acoustic: {
        ...(terminal.details.acoustic as object),
        shadowModelId: "model ٱلْحَمْدُ",
        tokens: ["ا", "ل"],
        apiKey: "sk-live-secret",
      },
      decision: {
        ...(terminal.details.decision as object),
        tutorOutcome: "الحمد",
        email: "learner@example.com",
      },
    });

    const exported = buildAttemptExport(ledger)!;
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toMatch(ARABIC);
    for (const forbidden of ["sk-live-secret", "UklGR", "learner@example.com", "transcript", "audio", "tokens", "apiKey"]) {
      expect(serialized).not.toContain(forbidden);
    }
    const [row] = exported.attempts;
    expect(row.correlationId).toBeNull();
    expect(row.muaalemModelId).toBeNull();
    expect(row.tutorOutcome).toBeNull();
    expect(row.errorCode).toBeNull();
    // Every value is a number, boolean, null, a short token or a position.
    for (const value of Object.values(row)) {
      if (value === null || typeof value === "number" || typeof value === "boolean") continue;
      if (typeof value === "object") continue;
      expect(value).toMatch(/^[A-Za-z0-9_.:/@+-]{1,160}$/);
    }
  });

  it("rejects non-ledgers and finds the ledger in saved staff files", () => {
    expect(buildAttemptExport(null)).toBeNull();
    expect(buildAttemptExport({ runId: "run_nope", events: [] })).toBeNull();
    const runId = createRunId();
    activateValidationRun(runId);
    const ledger = exportValidationRun(runId)!;
    expect(ledgerFromSavedFile(ledger)).toBe(ledger);
    expect(ledgerFromSavedFile({ runId, deactivated: true, ledger })).toBe(ledger);
    expect(ledgerFromSavedFile({ schemaVersion: 1, client: {}, server: { ledger } })).toBe(ledger);
  });
});

async function listen(app: express.Express) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return { port, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

describe("GET /api/validation/runs/:runId/attempts", () => {
  it("does not exist when the staff API flag is off (unauthorized → 404)", async () => {
    const runId = createRunId();
    recordTutorAttempt(activateValidationRun(runId), "att_0123456789abcdef01234567", "req_abcdefgh1234");
    for (const value of [undefined, "", "0", "true"]) {
      const { [STAFF_API_ENV_VAR]: _drop, ...env } = savedEnv;
      process.env = value === undefined ? { ...env } : { ...env, [STAFF_API_ENV_VAR]: value };
      const { port, close } = await listen(createApp());
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/validation/runs/${runId}/attempts`);
        expect(res.status).toBe(404);
        expect(await res.text()).not.toContain("att_0123456789abcdef01234567");
      } finally {
        await close();
      }
    }
  }, 30_000);

  it("is registered alongside the other staff routes only when enabled", () => {
    const app = express();
    registerStaffValidationEndpoints(app, { [STAFF_API_ENV_VAR]: "1" });
    const routes = ((app._router?.stack ?? []) as Array<{ route?: { path: string } }>)
      .map((layer) => layer.route?.path)
      .filter(Boolean);
    expect(routes).toContain("/api/validation/runs/:runId/attempts");
    const off = express();
    registerStaffValidationEndpoints(off, {});
    expect(off._router?.stack?.some((layer: { route?: unknown }) => layer.route) ?? false).toBe(false);
  });

  it("returns only the named run's attempts, 400 for malformed IDs, 404 once deactivated", async () => {
    process.env = { ...process.env, [STAFF_API_ENV_VAR]: "1" };
    const runA = activateValidationRun(createRunId());
    const runB = activateValidationRun(createRunId());
    recordTutorAttempt(runA, "att_aaaaaaaaaaaaaaaaaaaaaaaa", "req_run_a_000001");
    recordTutorAttempt(runB, "att_bbbbbbbbbbbbbbbbbbbbbbbb", "req_run_b_000001");
    const { port, close } = await listen(createApp());
    const base = `http://127.0.0.1:${port}/api/validation/runs`;
    try {
      const res = await fetch(`${base}/${runA.runId}/attempts`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as ValidationAttemptExport;
      expect(body.runId).toBe(runA.runId);
      expect(body.attempts.map((row) => row.attemptId)).toEqual(["att_aaaaaaaaaaaaaaaaaaaaaaaa"]);
      expect(JSON.stringify(body)).not.toContain(runB.runId);
      expect(JSON.stringify(body)).not.toMatch(ARABIC);

      expect((await fetch(`${base}/not-a-run/attempts`)).status).toBe(400);
      expect((await fetch(`${base}/run_aaaaaaaaaaaaaaaaaaaaaaaa/attempts`)).status).toBe(404);

      deactivateValidationRun(runA.runId);
      expect((await fetch(`${base}/${runA.runId}/attempts`)).status).toBe(404);
    } finally {
      await close();
    }
  }, 20_000);
});
