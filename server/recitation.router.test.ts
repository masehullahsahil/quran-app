import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { resetRecitationRateLimitForTests } from "./recitationRateLimit";
import { MAX_AUDIO_BYTES } from "@shared/recording";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  resetRecitationRateLimitForTests();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const AYAH = "بسم الله الرحمن الرحيم";
const FATIHA_2 = "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ";
const RABBI_TARGET = { surah: 1, ayah: 2, targetWordIndex: 3, expectedArabic: "رَبِّ", attemptsOnTarget: 0 };

const evaluateInput = {
  expectedArabic: AYAH,
  audioBase64: Buffer.alloc(64, 7).toString("base64"),
  mimeType: "audio/webm" as const,
  surah: 1,
  ayah: 1,
};

beforeEach(() => {
  vi.stubEnv("QURAN_EVALUATOR_URL", "");
  vi.stubEnv("QURAN_EVALUATOR_API_KEY", "");
  vi.stubEnv("RECITATION_RATE_LIMIT_REDIS_REST_URL", "");
  vi.stubEnv("RECITATION_RATE_LIMIT_REDIS_REST_TOKEN", "");
});

// Routes each outbound call by URL so a test can assert exactly which services
// the recitation flow touched.
function stubServices(options: { failStorage?: boolean; quranEvaluator?: boolean; failTranscription?: boolean; transcript?: string | string[] } = {}) {
  const calls: string[] = [];
  const transcripts = Array.isArray(options.transcript) ? [...options.transcript] : null;
  const defaultTranscript = typeof options.transcript === "string" ? options.transcript : AYAH;

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);

    if (options.failStorage && url.includes("/storage/")) {
      return new Response("bucket unavailable", { status: 503 });
    }

    if (url.includes("quran-evaluator") && options.quranEvaluator) {
      return new Response(JSON.stringify({
        status: "available",
        provider: "test-quran-evaluator",
        confidence: 0.9,
        summary: "Repeat the marked word slowly with the reference reciter.",
        findings: [{ kind: "phoneme", wordIndex: 1, expectedArabic: "بسم", guidance: "Listen once, then repeat the opening sound." }],
      }), { status: 200 });
    }

    if (url.includes("/audio/transcriptions")) {
      if (options.failTranscription) return new Response(JSON.stringify({ error: { message: "transcription temporarily unavailable" } }), { status: 503 });
      return new Response(JSON.stringify({
        task: "transcribe",
        language: "ar",
        duration: 2,
        text: transcripts?.shift() ?? defaultTranscript,
        segments: [],
      }), { status: 200 });
    }

    if (url.includes("/chat/completions")) {
      return new Response(JSON.stringify({
        id: "chatcmpl-1",
        created: 0,
        model: "gpt-5-mini",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              encouragement: "Well recalled.",
              nextStep: "Repeat once more at the same pace.",
              spokenGuidance: "Well recalled. Repeat once more at the same pace.",
            }),
          },
          finish_reason: "stop",
        }],
      }), { status: 200 });
    }

    if (url.includes("/storage/presign/put")) {
      return new Response(JSON.stringify({ url: "https://s3.example.test/upload" }), { status: 200 });
    }

    if (url.startsWith("https://s3.example.test/")) {
      return new Response(null, { status: 200 });
    }

    throw new Error(`Unexpected request to ${url}`);
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return calls;
}

const callerContext = {} as TrpcContext;

function contextForClient(ip: string, userId?: number): TrpcContext {
  return {
    req: {
      headers: {},
      socket: { remoteAddress: ip },
    },
    res: {},
    user: userId
      ? {
          id: userId,
          openId: `test-user-${userId}`,
          name: null,
          email: null,
          loginMethod: null,
          role: "user",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null,
  } as TrpcContext;
}

describe("recitation.evaluate", () => {
  // The point of the refactor: transcription takes the buffer the procedure
  // already holds, so the review runs with no Forge storage configured.
  it("reviews a recitation with only OPENAI_API_KEY configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    const calls = stubServices();
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate(evaluateInput);

    expect(result.transcript).toBe(AYAH);
    expect(result.wordReviewAvailable).toBe(true);
    expect(result.score).toBe(100);
    expect(result.encouragement).toBe("Well recalled.");

    // No storage traffic at all, and the audio was never re-downloaded.
    expect(calls.some(url => url.includes("/storage/"))).toBe(false);
    expect(calls).toEqual([
      "https://api.openai.com/v1/audio/transcriptions",
      "https://api.openai.com/v1/chat/completions",
    ]);
  });

  it("returns a retryable unavailable review when transcription cannot be completed", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const calls = stubServices({ failTranscription: true });
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate(evaluateInput);

    expect(result.reviewStatus).toBe("unavailable");
    expect(result.wordReviewAvailable).toBe(false);
    expect(result.reviewMessage).toBe("Transcription service request failed");
    expect(result.nextStep).toContain("retry now");
    expect(result.transcript).toBe("");
    expect(calls).toEqual(["https://api.openai.com/v1/audio/transcriptions"]);
  });

  it("includes a confidence-gated specialised review when an evaluator is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://quran-evaluator.example.test");

    const calls = stubServices({ quranEvaluator: true });
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate(evaluateInput);

    expect(result.wordReviewAvailable).toBe(true);
    expect(result.quranAwareReview).toEqual({
      status: "available",
      provider: "test-quran-evaluator",
      confidence: 0.9,
      summary: "Repeat the marked word slowly with the reference reciter.",
      findings: [{ kind: "phoneme", wordIndex: 1, expectedArabic: "بسم", guidance: "Listen once, then repeat the opening sound." }],
      canDriveLearnerCorrection: false,
    });
    expect(calls).toContain("https://quran-evaluator.example.test/v1/evaluate");
  });

  it("archives the attempt when Forge storage is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://forge.example.test");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "forge-key");

    const calls = stubServices();
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate(evaluateInput);

    expect(result.wordReviewAvailable).toBe(true);
    expect(calls.some(url => url.includes("/v1/storage/presign/put"))).toBe(true);
    expect(calls).toContain("https://s3.example.test/upload");
  });

  // Learn offers two levels now; a review carries the plan for the level the
  // learner is actually on, and the retired names are no longer accepted.
  it("returns the plan for the learner's level, defaulting to Qaida", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    stubServices();
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(callerContext);

    const defaulted = await caller.recitation.evaluate(evaluateInput);
    expect(defaulted.learningPlan.level).toBe("qaida");
    expect(defaulted.learningPlan.title).toBe("Qaida");

    const tajweed = await caller.recitation.evaluate({ ...evaluateInput, learningLevel: "tajweed" });
    expect(tajweed.learningPlan.level).toBe("tajweed");
    expect(tajweed.learningPlan.boundary).toMatch(/qualified teacher/i);

    await expect(
      // @ts-expect-error "reading" was removed as a level
      caller.recitation.evaluate({ ...evaluateInput, learningLevel: "reading" }),
    ).rejects.toThrow();
  });

  // Verse-following: the tracker rides on the same alignment the word review
  // already produced, and is reported with every response so the Study view can
  // keep the learner's place.
  it("advances the tracked position after a clean recitation", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    stubServices();
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate({
      ...evaluateInput,
      totalAyahs: 7,
      nextAyahArabic: "الحمد لله رب العالمين",
    });

    expect(result.verseFollowing).toMatchObject({
      currentSurah: 1,
      currentAyah: 2,
      expectedWordIndex: 1,
      lastCompletedAyah: 1,
      state: "following",
      evidence: "strong",
      shouldAdvance: true,
      nextAyah: 3,
      reason: "ayah_completed",
    });
  });

  it("keeps the tracked position when a transcript only covers part of the ayah", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    stubServices({ transcript: "بسم الله" });
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate({
      ...evaluateInput,
      totalAyahs: 7,
    });

    expect(result.verseFollowing).toMatchObject({
      currentAyah: 1,
      expectedWordIndex: 3,
      state: "following",
      shouldAdvance: false,
      reason: "partial_progress",
      lastCompletedAyah: null,
    });
  });

  it("carries the client's position forward so a resumed ayah is not restarted", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    stubServices({ transcript: "الرحمن الرحيم" });
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate({
      ...evaluateInput,
      totalAyahs: 7,
      position: { expectedWordIndex: 3, lastCompletedAyah: null, state: "following", attemptsOnCurrentAyah: 1 },
    });

    expect(result.verseFollowing).toMatchObject({
      currentAyah: 2,
      lastCompletedAyah: 1,
      shouldAdvance: true,
      evidence: "strong",
    });
  });

  it("holds the tracked position when the review itself is unavailable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    stubServices({ failTranscription: true });
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate({
      ...evaluateInput,
      ayah: 3,
      totalAyahs: 7,
      position: { expectedWordIndex: 2, lastCompletedAyah: 2, state: "following", attemptsOnCurrentAyah: 0 },
    });

    expect(result.reviewStatus).toBe("unavailable");
    expect(result.verseFollowing).toMatchObject({
      currentAyah: 3,
      expectedWordIndex: 2,
      lastCompletedAyah: 2,
      state: "uncertain",
      evidence: "none",
      shouldAdvance: false,
      reason: "no_transcript",
    });
  });

  it("runs missing word, focused target, then full ayah without advancing from the word attempt", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const calls = stubServices({ transcript: ["الحمد لله العالمين", "ربي", "الحمد لله رب العالمين"] });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(contextForClient("203.0.113.80"));

    const missing = await caller.recitation.evaluate({
      ...evaluateInput,
      expectedArabic: FATIHA_2,
      ayah: 2,
      totalAyahs: 7,
      attemptScope: "ayah",
    });
    expect(missing.verseFollowing).toMatchObject({ shouldAdvance: false, reason: "mistake_to_correct" });
    expect(missing.correctionSession).toMatchObject({
      surah: 1,
      ayah: 2,
      targetWordIndex: 3,
      targetArabic: "رَبِّ",
      stage: "hear",
    });
    const heldPosition = {
      expectedWordIndex: missing.verseFollowing.expectedWordIndex,
      lastCompletedAyah: missing.verseFollowing.lastCompletedAyah,
      state: missing.verseFollowing.state,
      attemptsOnCurrentAyah: missing.verseFollowing.attemptsOnCurrentAyah,
    };

    const focused = await caller.recitation.evaluate({
      ...evaluateInput,
      expectedArabic: FATIHA_2,
      ayah: 2,
      totalAyahs: 7,
      attemptScope: "word",
      correctionTarget: RABBI_TARGET,
      position: heldPosition,
    });
    expect(focused).toMatchObject({
      attemptScope: "word",
      recitationScoreScope: "word",
      focusedWordResult: { recognition: "recognised", reason: "target_recognised" },
      matchedCount: 1,
      totalWords: 1,
      corrections: [],
      correctionSession: {
        surah: 1,
        ayah: 2,
        targetWordIndex: 3,
        targetArabic: "رَبِّ",
        recognition: "recognised",
        stage: "recite-ayah",
        attemptsOnTarget: 1,
      },
      verseFollowing: {
        currentAyah: 2,
        lastCompletedAyah: null,
        shouldAdvance: false,
      },
    });
    expect(focused.note).toMatch(/does not calculate an ayah score/i);

    const complete = await caller.recitation.evaluate({
      ...evaluateInput,
      expectedArabic: FATIHA_2,
      ayah: 2,
      totalAyahs: 7,
      attemptScope: "ayah",
      position: heldPosition,
    });
    expect(complete).toMatchObject({
      attemptScope: "ayah",
      recitationScoreScope: "ayah",
      correctionSession: null,
      verseFollowing: { shouldAdvance: true, currentAyah: 3, reason: "ayah_completed" },
    });
    expect(calls.filter(url => url.includes("/chat/completions"))).toHaveLength(2);
  });

  it("keeps the target when a focused transcript contains a different word", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    stubServices({ transcript: "الرحمن" });
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate({
      ...evaluateInput,
      expectedArabic: FATIHA_2,
      ayah: 2,
      attemptScope: "word",
      correctionTarget: RABBI_TARGET,
    });

    expect(result).toMatchObject({
      focusedWordResult: { recognition: "not-recognised", reason: "different_word" },
      correctionSession: { targetWordIndex: 3, stage: "say-word", attemptsOnTarget: 1 },
      verseFollowing: { shouldAdvance: false, lastCompletedAyah: null },
    });
  });

  it.each([
    ["transcription failure", { failTranscription: true }, "transcription_failed"],
    ["no Arabic", { transcript: "background noise" }, "no_arabic_returned"],
  ] as const)("keeps the focused target uncertain after %s", async (_name, services, reason) => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    stubServices(services);
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate({
      ...evaluateInput,
      expectedArabic: FATIHA_2,
      ayah: 2,
      attemptScope: "word",
      correctionTarget: RABBI_TARGET,
    });

    expect(result).toMatchObject({
      recitationScoreScope: "none",
      focusedWordResult: { recognition: "unknown", reason },
      correctionSession: { targetWordIndex: 3, recognition: "unknown", stage: "say-word" },
      verseFollowing: { shouldAdvance: false, lastCompletedAyah: null },
    });
  });

  it.each([
    ["stale ayah", { ...RABBI_TARGET, ayah: 3 }],
    ["invalid word index", { ...RABBI_TARGET, targetWordIndex: 9 }],
  ])("rejects a focused %s before any provider call", async (_name, correctionTarget) => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const calls = stubServices({ transcript: "رب" });
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate({
      ...evaluateInput,
      expectedArabic: FATIHA_2,
      ayah: 2,
      attemptScope: "word",
      correctionTarget,
    });

    expect(result).toMatchObject({
      focusedWordResult: { recognition: "unknown", reason: "invalid_target" },
      correctionSession: null,
      verseFollowing: { shouldAdvance: false },
    });
    expect(calls).toEqual([]);
  });

  it("abstains when the target appears with unrelated extra words", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    stubServices({ transcript: "رب الرحمن" });
    const { appRouter } = await import("./routers");
    const result = await appRouter.createCaller(callerContext).recitation.evaluate({
      ...evaluateInput,
      expectedArabic: FATIHA_2,
      ayah: 2,
      attemptScope: "word",
      correctionTarget: RABBI_TARGET,
    });

    expect(result).toMatchObject({
      recitationScoreScope: "none",
      focusedWordResult: { recognition: "unknown", reason: "ambiguous_transcript" },
      correctionSession: { stage: "say-word", recognition: "unknown" },
      verseFollowing: { shouldAdvance: false },
    });
  });

  it("increments focused attempts and never lets the acoustic evaluator clear the target", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://quran-evaluator.example.test");
    const calls = stubServices({ quranEvaluator: true, transcript: "رب" });
    const { appRouter } = await import("./routers");
    const result = await appRouter.createCaller(callerContext).recitation.evaluate({
      ...evaluateInput,
      expectedArabic: FATIHA_2,
      ayah: 2,
      attemptScope: "word",
      correctionTarget: { ...RABBI_TARGET, attemptsOnTarget: 2 },
    });

    expect(result.correctionSession).toMatchObject({ recognition: "recognised", attemptsOnTarget: 3 });
    expect(result.quranAwareReview.status).toBe("not_configured");
    expect(calls.some(url => url.includes("quran-evaluator"))).toBe(false);
  });

  it("preserves full-ayah abstention for an unrelated ayah", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    stubServices({ transcript: "إياك نعبد وإياك نستعين" });
    const { appRouter } = await import("./routers");
    const result = await appRouter.createCaller(callerContext).recitation.evaluate({
      ...evaluateInput,
      expectedArabic: FATIHA_2,
      ayah: 2,
      totalAyahs: 7,
      attemptScope: "ayah",
    });

    expect(result).toMatchObject({
      attemptScope: "ayah",
      recitationScoreScope: "ayah",
      correctionSession: null,
      verseFollowing: { state: "uncertain", shouldAdvance: false, reason: "too_little_evidence" },
    });
  });

  it("still returns a review when archiving fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://forge.example.test");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "forge-key");

    const calls = stubServices({ failStorage: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate(evaluateInput);

    expect(result.transcript).toBe(AYAH);
    expect(result.wordReviewAvailable).toBe(true);
    expect(calls).toContain("https://api.openai.com/v1/audio/transcriptions");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("allows normal anonymous reviews within the expensive-path limit", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    const calls = stubServices();
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(contextForClient("203.0.113.10"));

    await expect(caller.recitation.evaluate(evaluateInput)).resolves.toMatchObject({
      wordReviewAvailable: true,
    });

    expect(calls).toEqual([
      "https://api.openai.com/v1/audio/transcriptions",
      "https://api.openai.com/v1/chat/completions",
    ]);
  });

  it("rejects reviews above the burst limit before transcription, coaching, or archiving", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://forge.example.test");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "forge-key");

    const calls = stubServices();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(contextForClient("203.0.113.20"));

    for (let i = 0; i < 4; i++) {
      await expect(caller.recitation.evaluate(evaluateInput)).resolves.toMatchObject({ wordReviewAvailable: true });
    }
    await expect(caller.recitation.evaluate(evaluateInput)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });

    expect(calls.filter(url => url.includes("/audio/transcriptions"))).toHaveLength(4);
    expect(calls.filter(url => url.includes("/chat/completions"))).toHaveLength(4);
    expect(calls.filter(url => url.includes("/storage/"))).toHaveLength(4);
    expect(warn).toHaveBeenCalledWith("[recitation] evaluate rate limited", expect.objectContaining({
      identityType: "ip",
      window: "burst",
    }));
    warn.mockRestore();
  });

  it("keeps separate client identities on separate counters", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    stubServices();
    const { appRouter } = await import("./routers");
    const firstClient = appRouter.createCaller(contextForClient("203.0.113.30"));
    const secondClient = appRouter.createCaller(contextForClient("203.0.113.31"));

    for (let i = 0; i < 4; i++) {
      await expect(firstClient.recitation.evaluate(evaluateInput)).resolves.toMatchObject({ wordReviewAvailable: true });
    }

    await expect(secondClient.recitation.evaluate(evaluateInput)).resolves.toMatchObject({
      wordReviewAvailable: true,
    });
  });

  it("uses authenticated user identity when present", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    stubServices();
    const { appRouter } = await import("./routers");
    const signedIn = appRouter.createCaller(contextForClient("203.0.113.40", 42));

    for (let i = 0; i < 8; i++) {
      await expect(signedIn.recitation.evaluate(evaluateInput)).resolves.toMatchObject({ wordReviewAvailable: true });
    }
    await expect(signedIn.recitation.evaluate(evaluateInput)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("does not trust fake client IP headers outside Vercel", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    stubServices();
    const { appRouter } = await import("./routers");
    const context = contextForClient("203.0.113.50");
    context.req.headers["x-forwarded-for"] = "198.51.100.1";
    const caller = appRouter.createCaller(context);

    for (let i = 0; i < 4; i++) {
      context.req.headers["x-forwarded-for"] = `198.51.100.${i + 1}`;
      await expect(caller.recitation.evaluate(evaluateInput)).resolves.toMatchObject({ wordReviewAvailable: true });
    }

    context.req.headers["x-forwarded-for"] = "198.51.100.99";
    await expect(caller.recitation.evaluate(evaluateInput)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("rejects malformed audio before expensive work", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const calls = stubServices();
    const { appRouter } = await import("./routers");

    await expect(
      appRouter.createCaller(contextForClient("203.0.113.60")).recitation.evaluate({
        ...evaluateInput,
        audioBase64: "!!!!!!!!!!!!!!!!!!!!",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(calls).toEqual([]);
  });

  it("rejects oversized audio before expensive work", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const calls = stubServices();
    const { appRouter } = await import("./routers");

    await expect(
      appRouter.createCaller(contextForClient("203.0.113.61")).recitation.evaluate({
        ...evaluateInput,
        audioBase64: Buffer.alloc(MAX_AUDIO_BYTES + 1, 7).toString("base64"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(calls).toEqual([]);
  });

  it("does not emit sensitive recording or transcript content in rate-limit logs", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    stubServices({ transcript: AYAH });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(contextForClient("203.0.113.70"));

    for (let i = 0; i < 4; i++) {
      await caller.recitation.evaluate(evaluateInput);
    }
    await expect(caller.recitation.evaluate(evaluateInput)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });

    const serializedLogs = JSON.stringify(warn.mock.calls);
    expect(serializedLogs).not.toContain(evaluateInput.audioBase64);
    expect(serializedLogs).not.toContain(AYAH);
    warn.mockRestore();
  });
});

describe("recitation.ingestChunk", () => {
  it("carries a typed session across finalized chunk requests", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(callerContext);
    const session = {
      sessionId: "router-session",
      surah: 1,
      currentAyah: 1,
      expectedWordIndex: 1,
      lastCompletedAyah: null,
      trackerState: "following" as const,
      attemptsOnCurrentAyah: 0,
      chunkCount: 0,
      lastAcceptedTranscriptSegment: "",
      recentCorrectionFocus: null,
      currentAyahTranscript: "",
      processedChunkIds: [],
    };

    const first = await caller.recitation.ingestChunk({
      session,
      expectedAyahArabic: "الحمد لله رب العالمين",
      transcriptChunk: "الحمد لله",
      stability: "final",
      totalAyahs: 7,
      chunkId: "chunk-1",
    });
    const second = await caller.recitation.ingestChunk({
      session: first.session,
      expectedAyahArabic: "الحمد لله رب العالمين",
      transcriptChunk: "رب العالمين",
      stability: "final",
      totalAyahs: 7,
      chunkId: "chunk-2",
    });

    expect(first.session.expectedWordIndex).toBe(3);
    expect(second).toMatchObject({ accepted: true, guidance: "ayah_advanced" });
    expect(second.session).toMatchObject({ currentAyah: 2, lastCompletedAyah: 1, chunkCount: 2 });
  });

  it("does not persist an interim router chunk", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(callerContext);
    const session = {
      sessionId: "router-interim", surah: 1, currentAyah: 1, expectedWordIndex: 1,
      lastCompletedAyah: null, trackerState: "following" as const, attemptsOnCurrentAyah: 0,
      chunkCount: 0, lastAcceptedTranscriptSegment: "", recentCorrectionFocus: null,
      currentAyahTranscript: "", processedChunkIds: [],
    };
    const result = await caller.recitation.ingestChunk({
      session, expectedAyahArabic: "الحمد لله رب العالمين", transcriptChunk: "الحمد لله رب العالمين",
      stability: "interim", totalAyahs: 7,
    });
    expect(result.accepted).toBe(false);
    expect(result.session).toEqual(session);
  });
});
