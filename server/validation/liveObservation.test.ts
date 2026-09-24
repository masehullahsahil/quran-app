import { describe, expect, it, beforeEach } from "vitest";
import {
  ACOUSTIC_NOT_RUN,
  activateValidationRun,
  activeValidationRunFromCtx,
  correlationIdFromCtx,
  deactivateValidationRun,
  exportValidationRun,
  getActiveValidationRun,
  observeFinalRecitationFailure,
  observeFinalRecitationResult,
  observeLiveRouterResult,
  playbackDirectiveOf,
  resetValidationRunsForTests,
  VALIDATION_RUN_HEADER,
  validationAttemptIdFor,
} from "./liveObservation";
import { createRunId, isAttemptId } from "./validationRun";
import type { TrpcContext } from "../_core/context";

function ctxWith(headers: Record<string, string>, requestId?: string): TrpcContext {
  return { req: { headers }, res: {}, requestId } as TrpcContext;
}

beforeEach(() => {
  resetValidationRunsForTests();
});

describe("validation run registry", () => {
  it("activates a run with a fresh ledger and a session.start event", () => {
    const runId = createRunId();
    const run = activateValidationRun(runId, { deviceMetadata: { device: "pilot" } });
    expect(run.runId).toBe(runId);
    expect(getActiveValidationRun(runId)).toBe(run);
    const starts = run.ledger.eventsOfType("session.start");
    expect(starts).toHaveLength(1);
    expect(starts[0].runId).toBe(runId);
  });

  it("re-activation returns the existing run without duplicating session.start", () => {
    const runId = createRunId();
    const first = activateValidationRun(runId);
    const second = activateValidationRun(runId);
    expect(second).toBe(first);
    expect(first.ledger.eventsOfType("session.start")).toHaveLength(1);
  });

  it("refuses malformed run IDs", () => {
    expect(() => activateValidationRun("not-a-run-id")).toThrow(/malformed run ID/);
    expect(() => activateValidationRun("")).toThrow(/malformed run ID/);
  });

  it("deactivates and exports the ledger for offline joining", () => {
    const runId = createRunId();
    const run = activateValidationRun(runId);
    run.ledger.record("note", { hello: "world" });
    const exported = exportValidationRun(runId);
    expect(exported?.runId).toBe(runId);
    expect(exported?.eventCount).toBe(2);
    const removed = deactivateValidationRun(runId);
    expect(removed).toBe(run);
    expect(getActiveValidationRun(runId)).toBeUndefined();
    expect(exportValidationRun(runId)).toBeNull();
  });
});

describe("request run lookup", () => {
  it("resolves an active run from the header and the correlation ID from ctx", () => {
    const runId = createRunId();
    const run = activateValidationRun(runId);
    const ctx = ctxWith({ [VALIDATION_RUN_HEADER]: runId }, "req-123");
    expect(activeValidationRunFromCtx(ctx)).toBe(run);
    expect(correlationIdFromCtx(ctx)).toBe("req-123");
  });

  it("falls back to the x-request-id header when ctx.requestId is absent", () => {
    const runId = createRunId();
    activateValidationRun(runId);
    const ctx = ctxWith({ [VALIDATION_RUN_HEADER]: runId, "x-request-id": "req-hdr-1" });
    expect(correlationIdFromCtx(ctx)).toBe("req-hdr-1");
  });

  it("returns null for missing, malformed, or inactive run IDs", () => {
    expect(activeValidationRunFromCtx(ctxWith({}))).toBeNull();
    expect(activeValidationRunFromCtx(ctxWith({ [VALIDATION_RUN_HEADER]: "bogus" }))).toBeNull();
    expect(activeValidationRunFromCtx(ctxWith({ [VALIDATION_RUN_HEADER]: createRunId() }))).toBeNull();
  });

  it("never throws on hostile context shapes", () => {
    expect(activeValidationRunFromCtx({} as TrpcContext)).toBeNull();
    expect(activeValidationRunFromCtx({ req: null } as unknown as TrpcContext)).toBeNull();
    expect(correlationIdFromCtx({} as TrpcContext)).toBeNull();
  });
});

describe("observeLiveRouterResult", () => {
  it("records the initial server-held position for startLive", () => {
    const run = activateValidationRun(createRunId());
    observeLiveRouterResult(
      run,
      "recitation.startLive",
      { stream: { streamId: "s-1", tracker: { surah: 1, ayah: 2, expectedWordIndex: 0 } }, tutor: null },
      { correlationId: "req-start" },
    );
    const checkpoints = run.ledger.eventsOfType("position.checkpoint");
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].correlationId).toBe("req-start");
    expect(checkpoints[0].details).toMatchObject({
      surah: 1,
      ayah: 2,
      wordIndex: 0,
      source: "server",
      evidenceSource: "none",
      audioDerived: false,
      quranStateMutation: null,
      streamId: "s-1",
    });
  });

  it("records a checkpoint and an exact correction decision for an applied omission", () => {
    const run = activateValidationRun(createRunId());
    observeLiveRouterResult(
      run,
      "recitation.ingestLiveAudio",
      {
        acknowledgement: { status: "applied", turnId: "t-1", chunkId: "c-1", sequence: 4 },
        stream: { streamId: "s-1", tracker: { surah: 1, ayah: 2, expectedWordIndex: 3 } },
        recognitionStatus: "transcribed",
        event: { type: "word-omitted", surah: 1, ayah: 2, targetWordIndex: 3, evidence: "finalized-later-word", heardThroughWordIndex: 5 },
        tutor: { action: { kind: "play-target-word", targetWordIndex: 3, hint: null } },
        recitation: null,
      },
      { correlationId: "req-4" },
    );
    const checkpoints = run.ledger.eventsOfType("position.checkpoint");
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].details).toMatchObject({
      source: "server",
      evidenceSource: "learner-audio",
      audioDerived: true,
      quranStateMutation: null,
      playbackDirective: { actionKind: "play-target-word", targetWordIndex: 3 },
    });
    const decisions = run.ledger.eventsOfType("correction.decided");
    expect(decisions).toHaveLength(1);
    expect(decisions[0].correlationId).toBe("req-4");
    expect(decisions[0].details).toMatchObject({
      eventType: "word-omitted",
      surah: 1,
      ayah: 2,
      targetWordIndex: 3,
      evidence: "finalized-later-word",
      heardThroughWordIndex: 5,
      audioDerived: true,
      decisionKind: "repeat-word",
      playbackDirective: { actionKind: "play-target-word" },
      sequence: 4,
    });
    // Word indexes only: no Quran text, no transcript in the ledger.
    expect(decisions[0].details).not.toHaveProperty("targetArabic");
    expect(decisions[0].details).not.toHaveProperty("transcript");
  });

  it("marks the advance mutation only for applied inputs that actually advance", () => {
    const run = activateValidationRun(createRunId());
    const appliedAdvance = {
      acknowledgement: { status: "applied", sequence: 6 },
      stream: { tracker: { surah: 1, ayah: 3, expectedWordIndex: 0 } },
      recognitionStatus: "transcribed",
      event: null,
      tutor: { action: { kind: "continue-recitation" } },
      recitation: { verseFollowing: { shouldAdvance: true } },
    };
    observeLiveRouterResult(run, "recitation.ingestLiveAudio", appliedAdvance, {});
    // A duplicate replay returns the same snapshot without committing: it must
    // not fabricate a second mutation or a second correction decision.
    observeLiveRouterResult(
      run,
      "recitation.ingestLiveAudio",
      { ...appliedAdvance, acknowledgement: { status: "duplicate", sequence: 7 } },
      {},
    );
    const mutations = run.ledger
      .eventsOfType("position.checkpoint")
      .filter((event) => (event.details as { quranStateMutation?: unknown }).quranStateMutation === "advance");
    expect(mutations).toHaveLength(1);
    expect(run.ledger.eventsOfType("correction.decided")).toHaveLength(0);
  });

  it("does not record correction.decided for a duplicate replay of an omission", () => {
    const run = activateValidationRun(createRunId());
    const omission = {
      acknowledgement: { status: "duplicate", sequence: 5 },
      stream: { tracker: { surah: 1, ayah: 2, expectedWordIndex: 3 } },
      recognitionStatus: "transcribed",
      event: { type: "word-omitted", surah: 1, ayah: 2, targetWordIndex: 3, evidence: "repeated-stable-later-word", heardThroughWordIndex: 5 },
      tutor: { action: { kind: "play-target-word" } },
    };
    observeLiveRouterResult(run, "recitation.ingestLiveAudio", omission, {});
    expect(run.ledger.eventsOfType("correction.decided")).toHaveLength(0);
  });

  it("ignores unknown paths and hostile results without throwing", () => {
    const run = activateValidationRun(createRunId());
    expect(() => {
      observeLiveRouterResult(run, "recitation.evaluate", { stream: {} }, {});
      observeLiveRouterResult(run, "recitation.startLive", null, {});
      observeLiveRouterResult(run, "recitation.startLive", { stream: { tracker: "nope" } }, {});
      observeLiveRouterResult(run, "recitation.ingestLiveAudio", { acknowledgement: 42 }, {});
    }).not.toThrow();
    expect(run.ledger.events).toHaveLength(1); // only session.start
  });
});

describe("final recitation observation", () => {
  it("records only structural evaluator status with the genuine request correlation", () => {
    const run = activateValidationRun(createRunId());
    observeFinalRecitationResult(
      run,
      "recitation.evaluateWithTutor",
      {
        recitation: {
          attemptScope: "ayah",
          reviewStatus: "available",
          quranAwareReview: { status: "abstained" },
          transcript: "must not enter the ledger",
          audioBase64: "must-not-enter",
        },
        tutor: { status: "updated" },
      },
      { correlationId: "req-final-1" },
    );
    const events = run.ledger.eventsOfType("attempt.completed");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ correlationId: "req-final-1" });
    expect(events[0].details).toEqual({
      route: "tutor",
      outcome: "responded",
      recitationReturned: true,
      attemptScope: "ayah",
      reviewStatus: "available",
      acousticStatus: "abstained",
      tutorStatus: "updated",
      decision: {
        verseFollowingReason: null,
        verseFollowingState: null,
        shouldAdvance: null,
        reviewMessageCode: null,
        matchedCount: null,
        totalWords: null,
        score: null,
        tutorOutcome: null,
        tutorActionKind: null,
        tutorActionReason: null,
        positionAfter: null,
      },
      acoustic: ACOUSTIC_NOT_RUN,
      timing: { startedAt: null, evidenceReadyAt: null },
    });
    expect(JSON.stringify(events[0])).not.toContain("must not enter");
  });

  it("records not-applied and failed requests without messages or payloads", () => {
    const run = activateValidationRun(createRunId());
    observeFinalRecitationResult(
      run,
      "recitation.evaluateWithTutor",
      { recitation: null, tutor: { status: "stale" } },
      { correlationId: "req-stale-1" },
    );
    observeFinalRecitationFailure(
      run,
      "recitation.evaluate",
      { code: "TOO_MANY_REQUESTS", message: "private details" },
      { correlationId: "req-failed-1" },
    );
    const events = run.ledger.eventsOfType("attempt.completed");
    expect(events[0].details).toMatchObject({
      route: "tutor",
      outcome: "not-applied",
      recitationReturned: false,
      tutorStatus: "stale",
    });
    expect(events[1].details).toEqual({
      route: "study",
      outcome: "failed",
      errorCode: "TOO_MANY_REQUESTS",
      acoustic: ACOUSTIC_NOT_RUN,
      timing: { startedAt: null, evidenceReadyAt: null },
    });
    expect(JSON.stringify(events)).not.toContain("private details");
  });

  it("ignores unrelated routes", () => {
    const run = activateValidationRun(createRunId());
    observeFinalRecitationResult(run, "learner.syncProgress", {}, { correlationId: "req-x" });
    observeFinalRecitationFailure(run, "learner.syncProgress", {}, { correlationId: "req-y" });
    expect(run.ledger.eventsOfType("attempt.completed")).toHaveLength(0);
  });
});

describe("playbackDirectiveOf", () => {
  it("detects trusted-audio playback directives", () => {
    expect(playbackDirectiveOf({ kind: "play-target-word", targetWordIndex: 3, hint: null })).toMatchObject({
      actionKind: "play-target-word",
      targetWordIndex: 3,
    });
    expect(
      playbackDirectiveOf({ kind: "offer-hint", hint: { kind: "trusted-ayah-audio", wordIndex: null } }),
    ).toMatchObject({ actionKind: "offer-hint", hintKind: "trusted-ayah-audio" });
    expect(playbackDirectiveOf({ kind: "listen", hint: null })).toBeNull();
    expect(playbackDirectiveOf({ kind: "ask-full-ayah", hint: { kind: "target-word" } })).toBeNull();
    expect(playbackDirectiveOf(null)).toBeNull();
  });
});

describe("per-attempt Muaalem diagnostics", () => {
  const shadowDiagnostics = {
    evaluatorCalled: true,
    evaluatorStatus: "abstained" as const,
    evaluatorHttpStatus: 200,
    evaluatorLatencyMs: 1432,
    primaryCorrectionsEnabled: false,
    shadowStatus: "available" as const,
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
    abstentionReason: "insufficient_reliable_evidence" as const,
  };

  it("gives every finalized request a server attempt ID and live turns their turn ID", () => {
    expect(isAttemptId(validationAttemptIdFor("recitation.evaluate", {}))).toBe(true);
    expect(isAttemptId(validationAttemptIdFor("recitation.evaluateWithTutor", null))).toBe(true);
    expect(isAttemptId(validationAttemptIdFor("recitation.startLive", {}))).toBe(true);
    expect(validationAttemptIdFor("recitation.ingestLiveAudio", { turnId: "turn-7" })).toBe("turn-7");
    // A hostile or prose-shaped client turn ID is never trusted as a join key.
    const hostile = validationAttemptIdFor("recitation.ingestLiveAudio", { turnId: "بسم الله\nx" });
    expect(isAttemptId(hostile)).toBe(true);
  });

  it("records shadow aggregates and why the tutor held, joined on attempt and correlation", () => {
    const runId = createRunId();
    const run = activateValidationRun(runId);
    observeFinalRecitationResult(
      run,
      "recitation.evaluateWithTutor",
      {
        recitation: {
          attemptScope: "ayah",
          reviewStatus: "available",
          reviewMessageCode: null,
          matchedCount: 2,
          totalWords: 4,
          score: 50,
          verseFollowing: { reason: "mistake_to_correct", state: "correcting", shouldAdvance: false },
          quranAwareReview: { status: "abstained" },
          transcript: "الحمد لله",
          expectedWords: [{ expected: "ٱلْحَمْدُ", heard: "الحمد" }],
        },
        tutor: { status: "updated", action: { kind: "ask-target-word", reason: "missed-word" } },
        outcome: "correction_required",
      },
      { correlationId: "req_abcdefgh1234", attemptId: "att_0123456789abcdef01234567", acoustic: shadowDiagnostics },
    );
    const [event] = run.ledger.eventsOfType("attempt.completed");
    expect(event).toMatchObject({ attemptId: "att_0123456789abcdef01234567", correlationId: "req_abcdefgh1234" });
    expect(event.details.acoustic).toEqual(shadowDiagnostics);
    expect(event.details.decision).toEqual({
      verseFollowingReason: "mistake_to_correct",
      verseFollowingState: "correcting",
      shouldAdvance: false,
      reviewMessageCode: null,
      matchedCount: 2,
      totalWords: 4,
      score: 50,
      tutorOutcome: "correction_required",
      tutorActionKind: "ask-target-word",
      tutorActionReason: "missed-word",
      positionAfter: null,
    });

    const exported = exportValidationRun(runId)!;
    expect(exported.attemptDiagnostics).toEqual([
      expect.objectContaining({
        attemptId: "att_0123456789abcdef01234567",
        correlationId: "req_abcdefgh1234",
        route: "tutor",
        outcome: "responded",
        evaluatorLatencyMs: 1432,
        acoustic: shadowDiagnostics,
      }),
    ]);
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toMatch(/[\u0600-\u06FF]/);
  });

  it("copies only known aggregate fields and drops prose, tokens and identity", () => {
    const run = activateValidationRun(createRunId());
    observeFinalRecitationResult(
      run,
      "recitation.evaluate",
      {
        attemptScope: "ayah",
        reviewStatus: "available",
        reviewMessageCode: "Recite ٱلْحَمْدُ again please",
        verseFollowing: { reason: "ayah_complete", state: "following", shouldAdvance: true },
      },
      {
        correlationId: "req_abcdefgh5678",
        attemptId: "att_0123456789abcdef01234568",
        acoustic: {
          ...shadowDiagnostics,
          shadowModelId: "model with spaces and ٱلْحَمْدُ",
          tokens: ["ا", "ل"],
          levels: { phonemes: { tokens: ["ا"] } },
          openId: "learner-1",
          apiKey: "secret",
        } as typeof shadowDiagnostics,
      },
    );
    const [event] = run.ledger.eventsOfType("attempt.completed");
    const acoustic = event.details.acoustic as Record<string, unknown>;
    expect(Object.keys(acoustic).sort()).toEqual(Object.keys(shadowDiagnostics).sort());
    expect(acoustic.shadowModelId).toBeNull();
    expect((event.details.decision as Record<string, unknown>).reviewMessageCode).toBeNull();
    const serialized = JSON.stringify(run.ledger.toJSON());
    for (const forbidden of ["learner-1", "secret", "ٱلْحَمْدُ", "\"tokens\"", "\"levels\""]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("records a finalized live turn's diagnostics under the client turn ID", () => {
    const run = activateValidationRun(createRunId());
    observeLiveRouterResult(
      run,
      "recitation.ingestLiveAudio",
      {
        acknowledgement: { status: "applied", turnId: "turn-9", chunkId: "turn-9:1", sequence: 3 },
        stream: { streamId: "s-1", tracker: { surah: 1, ayah: 2, expectedWordIndex: 1 } },
        recognitionStatus: "transcribed",
        recitation: {
          attemptScope: "ayah",
          reviewStatus: "available",
          matchedCount: 4,
          totalWords: 4,
          score: 100,
          verseFollowing: { reason: "ayah_complete", state: "following", shouldAdvance: true },
          quranAwareReview: { status: "abstained" },
        },
        tutor: { status: "updated", action: { kind: "continue-recitation", reason: "ayah-completed" } },
        outcome: "accepted",
      },
      { correlationId: "req_live12345", attemptId: "turn-9", acoustic: shadowDiagnostics },
    );
    const events = run.ledger.events.filter((event) => event.type !== "session.start");
    expect(events.map((event) => event.type)).toEqual(["position.checkpoint", "attempt.diagnostics"]);
    for (const event of events) expect(event.attemptId).toBe("turn-9");
    expect(events[1].details).toMatchObject({
      route: "live",
      decision: { verseFollowingReason: "ayah_complete", shouldAdvance: true, tutorOutcome: "accepted" },
      acoustic: { shadowStatus: "available", shadowPhonemeTokens: 37 },
    });
  });
});
