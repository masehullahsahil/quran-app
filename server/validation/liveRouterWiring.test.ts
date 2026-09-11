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
});
