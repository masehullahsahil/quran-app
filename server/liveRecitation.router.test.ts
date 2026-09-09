import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { resetContinuousTutorStreamsForTests } from "./continuousTutor";
import { resetRecitationRateLimitForTests } from "./recitationRateLimit";
import { resetLiveTutorSessionsForTests } from "./tutorRouter";

const originalFetch = global.fetch;
const FATIHA_2 = "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ";
const FATIHA = [
  "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  FATIHA_2,
  "ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
  "مَـٰلِكِ يَوْمِ ٱلدِّينِ",
  "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
  "ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ",
  "صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ",
];

beforeEach(() => {
  resetContinuousTutorStreamsForTests();
  resetLiveTutorSessionsForTests();
  resetRecitationRateLimitForTests();
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
});

function stubServices(transcripts: string[]) {
  const remaining = [...transcripts];
  const calls: string[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
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
  return calls;
}

function context(): TrpcContext {
  return {
    req: { headers: {}, socket: { remoteAddress: "203.0.113.90" } },
    res: {},
    user: {
      id: 90,
      openId: "live-user",
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
  transcriptStability?: "interim" | "final";
  turnComplete?: boolean;
  attemptScope?: "ayah" | "word";
  turnId?: string;
  chunkId?: string;
}) {
  return {
    session: input.session,
    streamId: input.streamId,
    turnId: input.turnId ?? "turn-1",
    chunkId: input.chunkId ?? `chunk-${input.sequence}`,
    sequence: input.sequence,
    attemptScope: input.attemptScope ?? "ayah" as const,
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

async function start(caller: ReturnType<typeof import("./routers")["appRouter"]["createCaller"]>) {
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

describe("continuous live Tutor route", () => {
  it("interrupts only after stable movement past رَبِّ, then preserves the correction loop", async () => {
    const calls = stubServices([
      "الحمد",
      "الحمد لله",
      "الحمد لله العالمين",
      "الحمد لله العالمين",
      "ربي",
      "الحمد لله رب العالمين",
    ]);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(context());
    const started = await start(caller);
    const base = { streamId: started.stream.streamId, session: reference(started.tutor.session) };

    const first = await caller.recitation.ingestLiveAudio(liveInput({ ...base, sequence: 1 }));
    expect(first).toMatchObject({
      acknowledgement: { status: "applied", appliedSequence: 1 },
      event: null,
      nextChannel: "keep-listening",
      stream: { tracker: { expectedWordIndex: 2 } },
      tutor: null,
    });
    expect(first).not.toHaveProperty("transcript");
    const second = await caller.recitation.ingestLiveAudio(liveInput({ ...base, sequence: 2 }));
    expect(second).toMatchObject({ event: null, stream: { tracker: { expectedWordIndex: 3 } } });
    const unstable = await caller.recitation.ingestLiveAudio(liveInput({ ...base, sequence: 3 }));
    expect(unstable).toMatchObject({
      event: null,
      nextChannel: "keep-listening",
      stream: { tracker: { recognitionState: "possible-skip", possibleSkip: { targetWordIndex: 3 } } },
    });

    const interrupted = await caller.recitation.ingestLiveAudio(liveInput({ ...base, sequence: 4 }));
    expect(interrupted).toMatchObject({
      acknowledgement: { status: "applied", appliedSequence: 4 },
      event: { type: "word-omitted", targetWordIndex: 3, targetArabic: "رَبِّ" },
      nextChannel: "interrupt-learner",
      stream: { phase: "interrupted", tutorRevision: 1 },
      tutor: {
        status: "updated",
        session: { ayah: 2, lastCompletedAyah: null, phase: "correcting-word" },
        action: { kind: "play-target-word", targetArabic: "رَبِّ", canAdvance: false },
      },
    });
    expect(interrupted.timing.recognitionResultAtMs).not.toBeNull();
    expect(interrupted.timing.omissionConfirmedAtMs).toBe(interrupted.timing.recognitionResultAtMs);
    expect(interrupted.timing.tutorActionAtMs).not.toBeNull();
    if (!interrupted.tutor?.session) throw new Error("Expected an interrupted Tutor session");

    const focused = await caller.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(interrupted.tutor.session),
      sequence: 5,
      turnId: "turn-word",
      attemptScope: "word",
      transcriptStability: "final",
      turnComplete: true,
    }));
    expect(focused).toMatchObject({
      acknowledgement: { status: "applied", appliedSequence: 5 },
      nextChannel: "listen-for-full-ayah",
      recitation: { focusedWordResult: { recognition: "recognised" }, verseFollowing: { shouldAdvance: false } },
      tutor: {
        session: { ayah: 2, lastCompletedAyah: null, phase: "recite-ayah" },
        action: { kind: "ask-full-ayah", canAdvance: false },
      },
    });
    if (!focused.tutor?.session) throw new Error("Expected the full-ayah Tutor session");

    const complete = await caller.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(focused.tutor.session),
      sequence: 6,
      turnId: "turn-full",
      transcriptStability: "final",
      turnComplete: true,
    }));
    expect(complete).toMatchObject({
      acknowledgement: { status: "applied", appliedSequence: 6 },
      nextChannel: "listen-next-ayah",
      recitation: { verseFollowing: { currentAyah: 3, lastCompletedAyah: 2, shouldAdvance: true } },
      tutor: {
        session: { ayah: 3, lastCompletedAyah: 2, phase: "listening", activeCorrection: null },
        action: { kind: "continue-recitation", canAdvance: true },
      },
      stream: { phase: "listening", tracker: { surah: 1, ayah: 3 } },
    });
    expect(calls.filter(url => url.includes("/audio/transcriptions"))).toHaveLength(6);
  });

  it("deduplicates an incremental retry before transcription", async () => {
    const calls = stubServices(["الحمد"]);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(context());
    const started = await start(caller);
    const input = liveInput({ streamId: started.stream.streamId, session: reference(started.tutor.session), sequence: 1 });
    await caller.recitation.ingestLiveAudio(input);
    const duplicate = await caller.recitation.ingestLiveAudio({ ...input, sequence: 2 });
    expect(duplicate).toMatchObject({ acknowledgement: { status: "duplicate", appliedSequence: 1 }, recitation: null, tutor: null });
    expect(calls.filter(url => url.includes("/audio/transcriptions"))).toHaveLength(1);
  });

  it("fails closed when the process-local stream is lost", async () => {
    const calls = stubServices([]);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(context());
    const started = await start(caller);
    resetContinuousTutorStreamsForTests();

    const result = await caller.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(started.tutor.session),
      sequence: 1,
    }));
    expect(result).toMatchObject({
      acknowledgement: { status: "lost-stream", appliedSequence: 0 },
      stream: null,
      recognitionStatus: "not-run",
      nextChannel: "do-not-listen",
      recitation: null,
      tutor: null,
    });
    expect(calls).toEqual([]);
  });

  it("keeps noisy incremental recognition uncertain and continues listening", async () => {
    stubServices(["background noise"]);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(context());
    const started = await start(caller);

    const result = await caller.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(started.tutor.session),
      sequence: 1,
    }));
    expect(result).toMatchObject({
      acknowledgement: { status: "applied" },
      event: null,
      nextChannel: "keep-listening",
      stream: { tracker: { recognitionState: "uncertain", expectedWordIndex: 1 } },
      tutor: null,
    });
  });

  it("applies a successful completed turn once", async () => {
    const calls = stubServices(["الحمد لله رب العالمين"]);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(context());
    const started = await start(caller);
    const input = liveInput({
      streamId: started.stream.streamId,
      session: reference(started.tutor.session),
      sequence: 1,
      turnComplete: true,
      transcriptStability: "final",
    });
    const first = await caller.recitation.ingestLiveAudio(input);
    expect(first.tutor).toMatchObject({ session: { ayah: 3, lastCompletedAyah: 2 } });
    const duplicate = await caller.recitation.ingestLiveAudio({ ...input, sequence: 2, chunkId: "retry-final" });
    expect(duplicate).toMatchObject({ acknowledgement: { status: "duplicate", appliedSequence: 1 }, recitation: null, tutor: null });
    expect(calls.filter(url => url.includes("/audio/transcriptions"))).toHaveLength(1);
  });

  it("cannot bypass target-word practice with an ayah-scoped turn", async () => {
    stubServices(["الحمد لله العالمين", "الحمد لله العالمين"]);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(context());
    const started = await start(caller);
    const base = { streamId: started.stream.streamId, session: reference(started.tutor.session) };

    await caller.recitation.ingestLiveAudio(liveInput({ ...base, sequence: 1 }));
    const interrupted = await caller.recitation.ingestLiveAudio(liveInput({ ...base, sequence: 2 }));
    if (!interrupted.tutor?.session) throw new Error("Expected an active correction");

    const bypass = await caller.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(interrupted.tutor.session),
      sequence: 3,
      turnId: "turn-bypass",
      attemptScope: "ayah",
      transcriptStability: "final",
      turnComplete: true,
    }));
    expect(bypass).toMatchObject({
      acknowledgement: { status: "rejected", appliedSequence: 2 },
      recitation: null,
      tutor: { accepted: false, session: { ayah: 2, lastCompletedAyah: null, phase: "correcting-word" } },
    });
  });

  it("rejects stale and out-of-order input before provider work", async () => {
    const calls = stubServices([]);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(context());
    const started = await start(caller);
    const advancedTutor = await caller.tutor.turn({
      session: reference(started.tutor.session),
      event: { type: "intent", intent: "start" },
    });

    const stale = await caller.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(started.tutor.session),
      sequence: 1,
    }));
    expect(stale).toMatchObject({ acknowledgement: { status: "stale", appliedSequence: 0 }, recitation: null });
    if (!advancedTutor.session) throw new Error("Expected current Tutor state");
    const outOfOrder = await caller.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(advancedTutor.session),
      sequence: 2,
      chunkId: "chunk-2",
    }));
    expect(outOfOrder).toMatchObject({ acknowledgement: { status: "out-of-order", appliedSequence: 0 } });
    expect(calls).toEqual([]);
  });

  it("drops recognition when the Tutor revision changes during transcription", async () => {
    let releaseTranscription: (() => void) | undefined;
    let markTranscriptionStarted: (() => void) | undefined;
    const transcriptionGate = new Promise<void>((resolve) => { releaseTranscription = resolve; });
    const transcriptionStarted = new Promise<void>((resolve) => { markTranscriptionStarted = resolve; });
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
        markTranscriptionStarted?.();
        await transcriptionGate;
        return new Response(JSON.stringify({
          task: "transcribe",
          language: "ar",
          duration: 1,
          text: "الحمد لله العالمين",
          segments: [],
        }), { status: 200 });
      }
      throw new Error(`Unexpected request to ${url}`);
    }) as unknown as typeof fetch;

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(context());
    const started = await start(caller);
    const pending = caller.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(started.tutor.session),
      sequence: 1,
    }));
    await transcriptionStarted;
    const paused = await caller.tutor.turn({
      session: reference(started.tutor.session),
      event: { type: "intent", intent: "pause" },
    });
    releaseTranscription?.();

    const result = await pending;
    expect(result).toMatchObject({
      acknowledgement: { status: "stale", appliedSequence: 0 },
      event: null,
      nextChannel: "do-not-listen",
      stream: { lastSequence: 0 },
      tutor: { status: "stale", session: { revision: paused.session.revision, phase: "paused" } },
    });
  });

  it.each(["pause", "stop"] as const)("does not accept live progression after %s", async (intent) => {
    const calls = stubServices([]);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(context());
    const started = await start(caller);
    const inactive = await caller.tutor.turn({
      session: reference(started.tutor.session),
      event: { type: "intent", intent },
    });
    if (!inactive.session) throw new Error("Expected inactive Tutor state");

    const result = await caller.recitation.ingestLiveAudio(liveInput({
      streamId: started.stream.streamId,
      session: reference(inactive.session),
      sequence: 1,
    }));
    expect(result).toMatchObject({
      acknowledgement: { status: "rejected", appliedSequence: 0 },
      nextChannel: "do-not-listen",
      recitation: null,
      tutor: null,
    });
    expect(inactive.session).toMatchObject({ ayah: 2, lastCompletedAyah: null });
    expect(calls).toEqual([]);
  });

  it("rejects client-supplied Quran position and omission evidence", async () => {
    stubServices([]);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(context());
    const started = await start(caller);

    await expect(caller.recitation.ingestLiveAudio({
      ...liveInput({ streamId: started.stream.streamId, session: reference(started.tutor.session), sequence: 1 }),
      expectedArabic: FATIHA_2,
      currentWordIndex: 4,
      event: { type: "word-omitted", targetWordIndex: 3 },
    } as never)).rejects.toThrow(/Unrecognized keys/);
  });
});
