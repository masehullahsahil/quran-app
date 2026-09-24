/**
 * Regression tests for wiring the server-side validation instrumentation into
 * the live Tutor router responses (recitation.startLive,
 * recitation.ingestLiveAudio).
 *
 * These prove the plan item "wire the existing server-side validation
 * instrumentation into live router responses": with an active validation run,
 * the live router must record server-held position checkpoints, exact
 * correction decisions, and playback-directive evidence into the run's
 * ledger, correlated by run ID and request ID — without changing any
 * response when no run is active.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import { resetContinuousTutorStreamsForTests } from "../continuousTutor";
import { resetRecitationRateLimitForTests } from "../recitationRateLimit";
import { resetLiveTutorSessionsForTests } from "../tutorRouter";
import {
  activeValidationRunFromCtx,
  resetValidationRunsForTests,
  VALIDATION_RUN_HEADER,
} from "./liveObservation";

const FATIHA = [
  "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ",
  "ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
  "مَـٰلِكِ يَوْمِ ٱلدِّينِ",
  "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
  "ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ",
  "صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ",
];

const originalFetch = global.fetch;

beforeEach(() => {
  resetContinuousTutorStreamsForTests();
  resetLiveTutorSessionsForTests();
  resetRecitationRateLimitForTests();
  resetValidationRunsForTests();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("QURAN_EVALUATOR_URL", "");
  vi.stubEnv("QURAN_EVALUATOR_API_KEY", "");
  vi.stubEnv("RECITATION_RATE_LIMIT_REDIS_REST_URL", "");
  vi.stubEnv("RECITATION_RATE_LIMIT_REDIS_REST_TOKEN", "");
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
  resetValidationRunsForTests();
});

function stubServices(transcripts: string[]) {
  const remaining = [...transcripts];
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("api.quran.com/api/v4/verses/by_chapter/1?")) {
      return new Response(JSON.stringify({
        verses: FATIHA.map((arabic, index) => ({
          verse_number: index + 1,
          verse_key: `1:${index + 1}`,
          text_uthmani: arabic,
          translations: [],
        })),
        pagination: { next_page: null },
      }), { status: 200 });
    }
    if (url.includes("/audio/transcriptions")) {
      return new Response(JSON.stringify({
        task: "transcribe",
        language: "ar",
        duration: 1,
        text: remaining.shift() ?? "",
        segments: [],
      }), { status: 200 });
    }
    if (url.includes("/chat/completions")) {
      return new Response(JSON.stringify({
        id: "chatcmpl-live",
        created: 0,
        model: "gpt-5-mini",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              encouragement: "Keep going.",
              nextStep: "Continue at the current place.",
              spokenGuidance: "Continue at the current place.",
            }),
          },
          finish_reason: "stop",
        }],
      }), { status: 200 });
    }
    throw new Error(`Unexpected request to ${url}`);
  }) as unknown as typeof fetch;
}

type EvaluatorCall = { headers: Record<string, string>; body: Record<string, unknown> };

/**
 * Like stubServices, plus a Quran acoustic evaluator that answers the way the
 * RunPod service does: an abstaining learner review whose `measurements`
 * carry aligned Quran words and Muaalem shadow aggregates.
 */
function stubServicesWithEvaluator(transcripts: string[]): EvaluatorCall[] {
  stubServices(transcripts);
  const base = global.fetch;
  const calls: EvaluatorCall[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("https://evaluator.example.test/")) {
      calls.push({
        headers: { ...(init?.headers as Record<string, string>) },
        body: JSON.parse(String(init?.body ?? "{}")),
      });
      return new Response(JSON.stringify({
        status: "abstained",
        provider: "quran-acoustic-prototype",
        confidence: 0.4,
        summary: null,
        findings: [],
        measurements: {
          audioDurationMs: 2100,
          alignmentConfidence: 0.4,
          words: [{ wordIndex: 1, arabic: "ٱلْحَمْدُ", startMs: 0, endMs: 400 }],
          uncertainRegions: [],
          shadow: {
            status: "available",
            provider: "muaalem-shadow",
            modelId: "obadx/muaalem-model-v3_2",
            decodedLevelCount: 2,
            phonemeTokenCount: 5,
            averagePosterior: 0.85,
            latencyMs: 640,
            tokens: ["ا", "ل", "ح"],
          },
        },
      }), { status: 200 });
    }
    return base(input, init);
  }) as unknown as typeof fetch;
  return calls;
}

function context(opts: { runId?: string; requestId?: string } = {}): TrpcContext {
  const headers: Record<string, string> = {};
  if (opts.runId) headers[VALIDATION_RUN_HEADER] = opts.runId;
  return {
    req: { headers, socket: { remoteAddress: "203.0.113.90" } },
    res: {},
    requestId: opts.requestId,
    user: {
      id: 91,
      openId: "validation-user",
      name: null,
      email: null,
      loginMethod: null,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  } as TrpcContext;
}

function reference(session: { sessionId: string; revision: number }) {
  return { sessionId: session.sessionId, revision: session.revision };
}

function audio(sequence: number) {
  return Buffer.alloc(64, sequence).toString("base64");
}

function liveInput(input: {
  streamId: string;
  session: { sessionId: string; revision: number };
  sequence: number;
  chunkId?: string;
  turnId?: string;
  turnComplete?: boolean;
  transcriptStability?: "interim" | "final";
}) {
  return {
    session: input.session,
    streamId: input.streamId,
    turnId: input.turnId ?? "turn-1",
    chunkId: input.chunkId ?? `chunk-${input.sequence}`,
    sequence: input.sequence,
    attemptScope: "ayah" as const,
    stability: input.transcriptStability ?? "interim" as const,
    turnComplete: input.turnComplete ?? false,
    captureStartedAtMs: 1_000 + input.sequence * 100,
    captureEndedAtMs: 1_050 + input.sequence * 100,
    audioBase64: audio(input.sequence),
    mimeType: "audio/webm" as const,
    learningLevel: "qaida" as const,
    uiLanguage: "en" as const,
  };
}

type Router = typeof import("../routers")["appRouter"];
type Caller = ReturnType<Router["createCaller"]>;

/**
 * Dynamic module setup. The suite resets the module registry between tests
 * (matching liveRecitation.router.test.ts), so the router and the validation
 * registry must be imported together here — otherwise the run activated on
 * one module instance would be invisible to the router's instance.
 */
async function setup() {
  const { appRouter } = await import("../routers");
  const liveObservation = await import("./liveObservation");
  const { createRunId } = await import("./validationRun");
  return { appRouter, liveObservation, createRunId };
}

async function start(caller: Caller) {
  const tutor = await caller.tutor.start({
    mode: "guided-recitation",
    surah: 1,
    ayah: 2,
    totalAyahs: 7,
    learnerLanguage: "en",
  });
  const live = await caller.recitation.startLive({ session: reference(tutor.session) });
  if (!live.stream) throw new Error("Expected a live stream");
  return { tutor, stream: live.stream };
}

describe("live router validation wiring", () => {
  it("emits no server ledger events when no validation run is active", async () => {
    stubServices(["الحمد"]);
    const { appRouter } = await setup();
    const caller = appRouter.createCaller(context());
    const started = await start(caller);
    const result = await caller.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(started.tutor.session),
      sequence: 1,
    }));
    expect(result.acknowledgement.status).toBe("applied");
    // No run was ever activated, so there is nothing to record into.
    expect(activeValidationRunFromCtx(context())).toBeNull();
  });

  it("records server position checkpoints with request correlation for an active run", async () => {
    stubServices(["الحمد"]);
    const { appRouter, liveObservation, createRunId } = await setup();
    const runId = createRunId();
    liveObservation.activateValidationRun(runId);

    const caller = appRouter.createCaller(context({ runId, requestId: "req-start" }));
    const started = await start(caller);

    const ledger = liveObservation.getActiveValidationRun(runId)?.ledger;
    if (!ledger) throw new Error("Expected an active validation run");
    let checkpoints = ledger.eventsOfType("position.checkpoint");
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].runId).toBe(runId);
    expect(checkpoints[0].correlationId).toBe("req-start");
    expect(checkpoints[0].details).toMatchObject({
      surah: 1,
      ayah: 2,
      source: "server",
      evidenceSource: "none",
      audioDerived: false,
    });
    expect(typeof checkpoints[0].details.wordIndex).toBe("number");

    const chunkCaller = appRouter.createCaller(context({ runId, requestId: "req-chunk-1" }));
    await chunkCaller.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(started.tutor.session),
      sequence: 1,
    }));
    checkpoints = ledger.eventsOfType("position.checkpoint");
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[1].correlationId).toBe("req-chunk-1");
    expect(checkpoints[1].details).toMatchObject({
      surah: 1,
      ayah: 2,
      source: "server",
      evidenceSource: "learner-audio",
      audioDerived: true,
      quranStateMutation: null,
      sequence: 1,
    });
  });

  it("records the exact correction decision once, without Quran text", async () => {
    stubServices(["الحمد", "الحمد لله", "الحمد لله العالمين", "الحمد لله العالمين"]);
    const { appRouter, liveObservation, createRunId } = await setup();
    const runId = createRunId();
    liveObservation.activateValidationRun(runId);
    const caller = appRouter.createCaller(context({ runId, requestId: "req-omission" }));
    const started = await start(caller);
    const base = { streamId: started.stream.streamId, session: reference(started.tutor.session) };

    await caller.recitation.ingestLiveAudio(liveInput({ ...base, sequence: 1 }));
    await caller.recitation.ingestLiveAudio(liveInput({ ...base, sequence: 2 }));
    await caller.recitation.ingestLiveAudio(liveInput({ ...base, sequence: 3 }));
    const interrupted = await caller.recitation.ingestLiveAudio(
      liveInput({ ...base, sequence: 4, chunkId: "chunk-omission" }),
    );
    expect(interrupted).toMatchObject({
      acknowledgement: { status: "applied", appliedSequence: 4 },
      event: { type: "word-omitted", targetWordIndex: 3 },
    });

    const ledger = liveObservation.getActiveValidationRun(runId)?.ledger;
    if (!ledger) throw new Error("Expected an active validation run");
    const decisions = ledger.eventsOfType("correction.decided");
    expect(decisions).toHaveLength(1);
    expect(decisions[0].correlationId).toBe("req-omission");
    expect(decisions[0].details).toMatchObject({
      eventType: "word-omitted",
      surah: 1,
      ayah: 2,
      targetWordIndex: 3,
      audioDerived: true,
      decisionKind: "repeat-word",
      playbackDirective: { actionKind: "play-target-word", targetWordIndex: 3 },
    });
    // Word indexes only: no Quran Arabic text, no transcript in the ledger.
    expect(decisions[0].details).not.toHaveProperty("targetArabic");
    expect(decisions[0].details).not.toHaveProperty("transcript");

    // The duplicate retry replays the same omission without deciding again:
    // the decision must not be double-recorded.
    const retry = await caller.recitation.ingestLiveAudio({
      ...liveInput({ ...base, sequence: 5, chunkId: "chunk-omission" }),
    });
    expect(retry.acknowledgement.status).toBe("duplicate");
    expect(ledger.eventsOfType("correction.decided")).toHaveLength(1);
    const mutations = ledger
      .eventsOfType("position.checkpoint")
      .filter((event) => (event.details as { quranStateMutation?: unknown }).quranStateMutation);
    expect(mutations).toHaveLength(0);
  });

  it("marks the advance mutation exactly once for an applied turn-complete", async () => {
    stubServices(["الحمد لله رب العالمين"]);
    const { appRouter, liveObservation, createRunId } = await setup();
    const runId = createRunId();
    liveObservation.activateValidationRun(runId);
    const caller = appRouter.createCaller(context({ runId, requestId: "req-complete" }));
    const started = await start(caller);
    const input = liveInput({
      streamId: started.stream.streamId,
      session: reference(started.tutor.session),
      sequence: 1,
      turnComplete: true,
      transcriptStability: "final",
    });
    const first = await caller.recitation.ingestLiveAudio(input);
    expect(first).toMatchObject({
      acknowledgement: { status: "applied" },
      recitation: { verseFollowing: { shouldAdvance: true } },
    });

    const ledger = liveObservation.getActiveValidationRun(runId)?.ledger;
    if (!ledger) throw new Error("Expected an active validation run");
    const advances = () =>
      ledger
        .eventsOfType("position.checkpoint")
        .filter((event) => (event.details as { quranStateMutation?: unknown }).quranStateMutation === "advance");
    expect(advances()).toHaveLength(1);
    expect(advances()[0].correlationId).toBe("req-complete");

    // The duplicate retry replays the advance without committing it again.
    const duplicate = await caller.recitation.ingestLiveAudio({ ...input, sequence: 2, chunkId: "retry-final" });
    expect(duplicate.acknowledgement.status).toBe("duplicate");
    expect(advances()).toHaveLength(1);
  });

  it("ignores malformed and inactive run IDs without changing responses", async () => {
    stubServices(["الحمد"]);
    const { appRouter, liveObservation, createRunId } = await setup();

    const malformed = appRouter.createCaller(context({ runId: "not-a-run-id", requestId: "req-x" }));
    const started = await start(malformed);
    expect(started.stream.streamId).toEqual(expect.any(String));
    expect(activeValidationRunFromCtx(context({ runId: "not-a-run-id" }))).toBeNull();

    const inactive = appRouter.createCaller(context({ runId: createRunId(), requestId: "req-y" }));
    const result = await inactive.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(started.tutor.session),
      sequence: 1,
    }));
    expect(result.acknowledgement.status).toBe("applied");
    expect(liveObservation.getActiveValidationRun(createRunId())).toBeUndefined();
  });

  it("correlates a finalized Study attempt with its server ledger event", async () => {
    stubServices([FATIHA[1]]);
    const { appRouter, liveObservation, createRunId } = await setup();
    const runId = createRunId();
    liveObservation.activateValidationRun(runId);
    const caller = appRouter.createCaller(context({ runId, requestId: "req-final-study" }));

    const result = await caller.recitation.evaluate({
      expectedArabic: FATIHA[1],
      audioBase64: audio(21),
      mimeType: "audio/webm",
      surah: 1,
      ayah: 2,
      totalAyahs: 7,
      learningLevel: "qaida",
      uiLanguage: "en",
      attemptScope: "ayah",
    });

    expect(result.validationCorrelationId).toBe("req-final-study");
    const events = liveObservation.getActiveValidationRun(runId)?.ledger.eventsOfType("attempt.completed") ?? [];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ correlationId: "req-final-study" });
    expect(events[0].details).toMatchObject({
      route: "study",
      outcome: "responded",
      recitationReturned: true,
      attemptScope: "ayah",
      reviewStatus: "available",
    });
  });

  it("correlates a finalized trusted Tutor attempt without exposing it outside an active run", async () => {
    stubServices([FATIHA[1], FATIHA[1]]);
    const { appRouter, liveObservation, createRunId } = await setup();
    const runId = createRunId();
    liveObservation.activateValidationRun(runId);
    const activeCaller = appRouter.createCaller(context({ runId, requestId: "req-final-tutor" }));
    const activeTutor = await activeCaller.tutor.start({
      mode: "guided-recitation",
      surah: 1,
      ayah: 2,
      totalAyahs: 7,
      learnerLanguage: "en",
    });
    const activeResult = await activeCaller.recitation.evaluateWithTutor({
      session: reference(activeTutor.session),
      attempt: {
        audioBase64: audio(22),
        mimeType: "audio/webm",
        learningLevel: "qaida",
        uiLanguage: "en",
        attemptScope: "ayah",
      },
    });
    expect(activeResult.validationCorrelationId).toBe("req-final-tutor");
    const events = liveObservation.getActiveValidationRun(runId)?.ledger.eventsOfType("attempt.completed") ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].details).toMatchObject({ route: "tutor", recitationReturned: true, tutorStatus: "updated" });

    const ordinaryCaller = appRouter.createCaller(context({ requestId: "req-ordinary" }));
    const ordinaryTutor = await ordinaryCaller.tutor.start({
      mode: "guided-recitation",
      surah: 1,
      ayah: 2,
      totalAyahs: 7,
      learnerLanguage: "en",
    });
    const ordinaryResult = await ordinaryCaller.recitation.evaluateWithTutor({
      session: reference(ordinaryTutor.session),
      attempt: {
        audioBase64: audio(23),
        mimeType: "audio/webm",
        learningLevel: "qaida",
        uiLanguage: "en",
        attemptScope: "ayah",
      },
    });
    expect(ordinaryResult).not.toHaveProperty("validationCorrelationId");
  });

  it("joins a finalized attempt to the evaluator log by correlation ID, keeping shadow diagnostics server-only", async () => {
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://evaluator.example.test");
    vi.stubEnv("QURAN_EVALUATOR_API_KEY", "evaluator-secret-key");
    vi.stubEnv("QURAN_EVALUATOR_PRIMARY_CORRECTIONS", "0");
    const evaluatorCalls = stubServicesWithEvaluator([FATIHA[1]]);
    const { appRouter, liveObservation, createRunId } = await setup();
    const runId = createRunId();
    liveObservation.activateValidationRun(runId);
    const caller = appRouter.createCaller(context({ runId, requestId: "req_join_study_1" }));

    const result = await caller.recitation.evaluate({
      expectedArabic: FATIHA[1],
      audioBase64: audio(31),
      mimeType: "audio/webm",
      surah: 1,
      ayah: 2,
      totalAyahs: 7,
      learningLevel: "qaida",
      uiLanguage: "en",
      attemptScope: "ayah",
    });

    // The evaluator receives the same correlation ID the ledger records.
    expect(evaluatorCalls).toHaveLength(1);
    expect(evaluatorCalls[0].headers["x-correlation-id"]).toBe("req_join_study_1");

    const [event] = liveObservation.getActiveValidationRun(runId)?.ledger.eventsOfType("attempt.completed") ?? [];
    expect(event.correlationId).toBe("req_join_study_1");
    expect(event.attemptId).toMatch(/^att_[0-9a-f]{24}$/);
    expect(result.validationAttemptId).toBe(event.attemptId);
    expect(event.details.acoustic).toMatchObject({
      evaluatorCalled: true,
      evaluatorStatus: "abstained",
      evaluatorHttpStatus: 200,
      primaryCorrectionsEnabled: false,
      shadowStatus: "available",
      shadowProvider: "muaalem-shadow",
      shadowModelId: "obadx/muaalem-model-v3_2",
      shadowDecodedLevels: 2,
      shadowPhonemeTokens: 5,
      shadowAveragePosterior: 0.85,
      shadowLatencyMs: 640,
    });
    expect(typeof (event.details.acoustic as { evaluatorLatencyMs: unknown }).evaluatorLatencyMs).toBe("number");
    expect(event.details.decision).toMatchObject({
      verseFollowingReason: result.verseFollowing.reason,
      shouldAdvance: result.verseFollowing.shouldAdvance,
      reviewMessageCode: null,
      matchedCount: result.matchedCount,
      totalWords: result.totalWords,
      score: result.score,
    });

    // Diagnostics never reach the learner-facing response.
    const response = JSON.stringify(result);
    expect(response).not.toContain("shadow");
    expect(response).not.toContain("muaalem");
    expect(response).not.toContain("measurements");
    expect(result.quranAwareReview).toMatchObject({ status: "abstained", findings: [] });

    // Redaction: no audio, transcript, Quran text, tokens, keys or identity.
    const exported = JSON.stringify(liveObservation.exportValidationRun(runId));
    expect(exported).not.toMatch(/[\u0600-\u06FF]/);
    for (const forbidden of [audio(31), "evaluator-secret-key", "validation-user", "\"tokens\"", "\"words\""]) {
      expect(exported).not.toContain(forbidden);
    }
  });

  it("exports the finalized attempt as one benchmark row with evaluator evidence and timestamps", async () => {
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://evaluator.example.test");
    vi.stubEnv("QURAN_EVALUATOR_PRIMARY_CORRECTIONS", "0");
    stubServicesWithEvaluator([FATIHA[1]]);
    const { appRouter, liveObservation, createRunId } = await setup();
    const { buildAttemptExport } = await import("./attemptExport");
    const runId = createRunId();
    liveObservation.activateValidationRun(runId);
    const result = await appRouter.createCaller(context({ runId, requestId: "req_export_row_1" })).recitation.evaluate({
      expectedArabic: FATIHA[1],
      audioBase64: audio(34),
      mimeType: "audio/webm",
      surah: 1,
      ayah: 2,
      totalAyahs: 7,
      learningLevel: "qaida",
      uiLanguage: "en",
      attemptScope: "ayah",
    });

    const exported = buildAttemptExport(liveObservation.exportValidationRun(runId))!;
    expect(exported.attempts).toHaveLength(1);
    const [row] = exported.attempts;
    expect(row).toMatchObject({
      attemptId: result.validationAttemptId,
      correlationId: "req_export_row_1",
      route: "study",
      ayahRef: "1:2",
      position: {
        surah: result.verseFollowing.currentSurah,
        ayah: result.verseFollowing.currentAyah,
        wordIndex: result.verseFollowing.expectedWordIndex,
      },
      muaalemStatus: "available",
      muaalemRawPosterior: 0.85,
      alignmentConfidence: 0.4,
      findingsCount: 0,
      abstentionReason: "insufficient_reliable_evidence",
      verdict: "abstained",
      primaryCorrectionsEnabled: false,
    });
    expect(Date.parse(row.startedAt!)).toBeLessThanOrEqual(Date.parse(row.evidenceReadyAt!));
    expect(Date.parse(row.evidenceReadyAt!)).toBeLessThanOrEqual(Date.parse(row.completedAt!));
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toMatch(/[\u0600-\u06FF]/);
    expect(serialized).not.toContain(audio(34));
  });

  it("keeps learner decisions identical whether or not the Muaalem shadow is running", async () => {
    const request = {
      expectedArabic: FATIHA[1],
      audioBase64: audio(32),
      mimeType: "audio/webm" as const,
      surah: 1,
      ayah: 2,
      totalAyahs: 7,
      learningLevel: "qaida" as const,
      uiLanguage: "en" as const,
      attemptScope: "ayah" as const,
    };
    const partialTranscript = FATIHA[1].split(" ").slice(0, 2).join(" ");
    const pick = (value: Awaited<ReturnType<Caller["recitation"]["evaluate"]>>) => ({
      verseFollowing: value.verseFollowing,
      matchedCount: value.matchedCount,
      totalWords: value.totalWords,
      score: value.score,
      corrections: value.corrections,
      correctionSession: value.correctionSession,
      reviewMessageCode: value.reviewMessageCode,
      canDriveLearnerCorrection: value.quranAwareReview.canDriveLearnerCorrection ?? false,
    });

    stubServices([partialTranscript]);
    const baseline = await setup();
    const withoutShadow = await baseline.appRouter
      .createCaller(context({ requestId: "req_shadow_off_1" }))
      .recitation.evaluate(request);

    vi.resetModules();
    resetRecitationRateLimitForTests();
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://evaluator.example.test");
    stubServicesWithEvaluator([partialTranscript]);
    const shadowed = await setup();
    const runId = shadowed.createRunId();
    shadowed.liveObservation.activateValidationRun(runId);
    const withShadow = await shadowed.appRouter
      .createCaller(context({ runId, requestId: "req_shadow_on_1" }))
      .recitation.evaluate(request);

    expect(pick(withShadow)).toEqual(pick(withoutShadow));
    expect(pick(withShadow).canDriveLearnerCorrection).toBe(false);
  });

  it("forwards the correlation ID but collects nothing outside an active run", async () => {
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://evaluator.example.test");
    const evaluatorCalls = stubServicesWithEvaluator([FATIHA[1]]);
    const { appRouter } = await setup();
    const result = await appRouter.createCaller(context({ requestId: "req_ordinary_1" })).recitation.evaluate({
      expectedArabic: FATIHA[1],
      audioBase64: audio(33),
      mimeType: "audio/webm",
      surah: 1,
      ayah: 2,
      totalAyahs: 7,
      learningLevel: "qaida",
      uiLanguage: "en",
      attemptScope: "ayah",
    });
    expect(evaluatorCalls[0].headers["x-correlation-id"]).toBe("req_ordinary_1");
    expect(result).not.toHaveProperty("validationAttemptId");
    expect(result).not.toHaveProperty("validationCorrelationId");
  });

  it("gives live-turn server events the client turn ID instead of null", async () => {
    stubServices(["الحمد"]);
    const { appRouter, liveObservation, createRunId } = await setup();
    const runId = createRunId();
    liveObservation.activateValidationRun(runId);
    const caller = appRouter.createCaller(context({ runId, requestId: "req_live_turn_1" }));
    const started = await start(caller);
    await caller.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(started.tutor.session),
      sequence: 1,
      turnId: "turn-live-1",
    }));
    const events = liveObservation.getActiveValidationRun(runId)?.ledger.events ?? [];
    const requestEvents = events.filter((event) => event.type !== "session.start");
    expect(requestEvents.length).toBeGreaterThan(0);
    for (const event of requestEvents) expect(event.attemptId).not.toBeNull();
    expect(requestEvents.some((event) => event.attemptId === "turn-live-1")).toBe(true);
  });
});
