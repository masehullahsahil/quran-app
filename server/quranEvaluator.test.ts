import { afterEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

const evaluatorInput = {
  audioBase64: Buffer.alloc(64, 7).toString("base64"),
  mimeType: "audio/webm",
  expectedArabic: "بسم الله الرحمن الرحيم",
  surah: 1,
  ayah: 1,
  learningLevel: "qaida" as const,
};

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Quran-aware evaluator adapter", () => {
  it("does not make a request when no specialist service is configured", async () => {
    vi.stubEnv("QURAN_EVALUATOR_URL", "");
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { evaluateQuranAwareAudio } = await import("./quranEvaluator");

    await expect(evaluateQuranAwareAudio(evaluatorInput)).resolves.toMatchObject({
      status: "not_configured",
      findings: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns only bounded, confidence-gated specialised observations", async () => {
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://quran-evaluator.example.test");
    vi.stubEnv("QURAN_EVALUATOR_API_KEY", "service-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "available",
      provider: "quran-phoneme-service",
      confidence: 0.91,
      summary: "Pause briefly before the next phrase, then repeat it slowly.",
      findings: [
        { kind: "pause", wordIndex: 2, expectedArabic: "الله", guidance: "Practise the pause before continuing." },
      ],
    }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { evaluateQuranAwareAudio } = await import("./quranEvaluator");

    const result = await evaluateQuranAwareAudio(evaluatorInput);

    expect(result).toEqual({
      status: "available",
      provider: "quran-phoneme-service",
      confidence: 0.91,
      summary: "Pause briefly before the next phrase, then repeat it slowly.",
      findings: [{ kind: "pause", wordIndex: 2, expectedArabic: "الله", guidance: "Practise the pause before continuing." }],
      canDriveLearnerCorrection: false,
    });
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestUrl)).toBe("https://quran-evaluator.example.test/v1/evaluate");
    expect(requestInit).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer service-key" }),
    });
  });

  it("marks specialist observations as primary only when explicitly enabled", async () => {
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://quran-evaluator.example.test");
    vi.stubEnv("QURAN_EVALUATOR_PRIMARY_CORRECTIONS", "1");
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      status: "available",
      provider: "quran-phoneme-service",
      confidence: 0.91,
      summary: "Review this word.",
      findings: [
        { kind: "phoneme", wordIndex: 1, expectedArabic: "بسم", guidance: "Listen to this word." },
      ],
    }), { status: 200 })) as unknown as typeof fetch;
    const { evaluateQuranAwareAudio } = await import("./quranEvaluator");

    await expect(evaluateQuranAwareAudio(evaluatorInput)).resolves.toMatchObject({
      status: "available",
      canDriveLearnerCorrection: true,
    });
  });

  it("abstains instead of exposing a low-confidence correction", async () => {
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://quran-evaluator.example.test");
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      status: "available",
      provider: "quran-phoneme-service",
      confidence: 0.42,
      summary: "Do not show this summary.",
      findings: [{ kind: "phoneme", wordIndex: 1, expectedArabic: "بسم", guidance: "Do not show this finding." }],
    }), { status: 200 })) as unknown as typeof fetch;
    const { evaluateQuranAwareAudio } = await import("./quranEvaluator");

    await expect(evaluateQuranAwareAudio(evaluatorInput)).resolves.toEqual({
      status: "abstained",
      provider: "quran-phoneme-service",
      confidence: 0.42,
      summary: null,
      findings: [],
    });
  });

  it.each([
    ["non-object payload", "not-an-object"],
    ["missing findings", { status: "available", confidence: 0.9, summary: "A summary" }],
    ["unknown status", { status: "maybe", confidence: 0.9, summary: "A summary", findings: [] }],
    ["unknown finding kind", { status: "available", confidence: 0.9, summary: "A summary", findings: [{ kind: "guess", wordIndex: 1, guidance: "No." }] }],
    ["out-of-range word index", { status: "available", confidence: 0.9, summary: "A summary", findings: [{ kind: "phoneme", wordIndex: 99, guidance: "No." }] }],
  ])("rejects %s", async (_name, payload) => {
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://quran-evaluator.example.test");
    global.fetch = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const { evaluateQuranAwareAudio } = await import("./quranEvaluator");
    await expect(evaluateQuranAwareAudio(evaluatorInput)).resolves.toMatchObject({ status: "unavailable", findings: [] });
  });

  it("bounds excessive valid findings", async () => {
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://quran-evaluator.example.test");
    const findings = Array.from({ length: 8 }, () => ({ kind: "phoneme", wordIndex: 1, guidance: "Review this sound." }));
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ status: "available", confidence: 0.9, summary: "Review.", findings }), { status: 200 })) as unknown as typeof fetch;
    const { evaluateQuranAwareAudio } = await import("./quranEvaluator");
    const result = await evaluateQuranAwareAudio(evaluatorInput);
    expect(result.status).toBe("available");
    expect(result.findings).toHaveLength(3);
  });

  it.each(["timeout", "service unavailable"])("uses unavailable fallback on %s", async () => {
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://quran-evaluator.example.test");
    global.fetch = vi.fn(async () => { throw new DOMException("request failed", "TimeoutError"); }) as unknown as typeof fetch;
    const { evaluateQuranAwareAudio } = await import("./quranEvaluator");
    await expect(evaluateQuranAwareAudio(evaluatorInput)).resolves.toMatchObject({ status: "unavailable", findings: [] });
  });

  it("uses unavailable fallback for a non-success service response", async () => {
    vi.stubEnv("QURAN_EVALUATOR_URL", "https://quran-evaluator.example.test");
    global.fetch = vi.fn(async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    const { evaluateQuranAwareAudio } = await import("./quranEvaluator");
    await expect(evaluateQuranAwareAudio(evaluatorInput)).resolves.toMatchObject({ status: "unavailable", findings: [] });
  });

  describe("per-attempt diagnostics", () => {
    const shadowResponse = {
      status: "abstained",
      provider: "quran-acoustic-prototype",
      confidence: 0.4,
      summary: null,
      findings: [],
      measurements: {
        audioDurationMs: 2000,
        alignmentConfidence: 0.4,
        words: [{ wordIndex: 1, arabic: "بسم" }],
        shadow: {
          status: "available",
          provider: "muaalem-shadow",
          modelId: "obadx/muaalem-model-v3_2",
          decodedLevelCount: 11,
          phonemeTokenCount: 37,
          averagePosterior: 0.9,
          latencyMs: 700,
          tokens: ["ب", "س", "م"],
        },
      },
    };

    it("forwards only a safe correlation ID as x-correlation-id", async () => {
      vi.stubEnv("QURAN_EVALUATOR_URL", "https://quran-evaluator.example.test");
      const fetchMock = vi.fn(async () => new Response(JSON.stringify(shadowResponse), { status: 200 }));
      global.fetch = fetchMock as unknown as typeof fetch;
      const { evaluateQuranAwareAudio } = await import("./quranEvaluator");

      await evaluateQuranAwareAudio(evaluatorInput, { correlationId: "req_abcdefgh1234" });
      await evaluateQuranAwareAudio(evaluatorInput, { correlationId: "bad id\r\ninjected: 1" });
      await evaluateQuranAwareAudio(evaluatorInput);

      const headersOf = (call: number) =>
        ((fetchMock.mock.calls[call] as unknown as [unknown, RequestInit])[1].headers ?? {}) as Record<string, string>;
      expect(headersOf(0)["x-correlation-id"]).toBe("req_abcdefgh1234");
      expect(headersOf(1)).not.toHaveProperty("x-correlation-id");
      expect(headersOf(2)).not.toHaveProperty("x-correlation-id");
    });

    it("reports aggregate shadow diagnostics without changing the learner review", async () => {
      vi.stubEnv("QURAN_EVALUATOR_URL", "https://quran-evaluator.example.test");
      vi.stubEnv("QURAN_EVALUATOR_PRIMARY_CORRECTIONS", "0");
      global.fetch = vi.fn(async () => new Response(JSON.stringify(shadowResponse), { status: 200 })) as unknown as typeof fetch;
      const { evaluateQuranAwareAudio } = await import("./quranEvaluator");

      const plain = await evaluateQuranAwareAudio(evaluatorInput);
      const onDiagnostics = vi.fn();
      const observed = await evaluateQuranAwareAudio(evaluatorInput, { onDiagnostics });

      expect(observed).toEqual(plain);
      expect(observed).not.toHaveProperty("measurements");
      expect(onDiagnostics).toHaveBeenCalledTimes(1);
      const diagnostics = onDiagnostics.mock.calls[0][0];
      expect(diagnostics).toMatchObject({
        evaluatorCalled: true,
        evaluatorStatus: "abstained",
        evaluatorHttpStatus: 200,
        primaryCorrectionsEnabled: false,
        shadowStatus: "available",
        shadowProvider: "muaalem-shadow",
        shadowModelId: "obadx/muaalem-model-v3_2",
        shadowDecodedLevels: 11,
        shadowPhonemeTokens: 37,
        shadowAveragePosterior: 0.9,
        shadowLatencyMs: 700,
      });
      expect(typeof diagnostics.evaluatorLatencyMs).toBe("number");
      expect(JSON.stringify(diagnostics)).not.toMatch(/[\u0600-\u06FF]/);
    });

    it("reports a not-run shadow when the service is missing or unreachable, and survives a throwing sink", async () => {
      vi.stubEnv("QURAN_EVALUATOR_URL", "");
      let { evaluateQuranAwareAudio } = await import("./quranEvaluator");
      const notConfigured = vi.fn();
      await evaluateQuranAwareAudio(evaluatorInput, { onDiagnostics: notConfigured });
      expect(notConfigured.mock.calls[0][0]).toMatchObject({ evaluatorCalled: false, shadowStatus: "not_run" });

      vi.resetModules();
      vi.stubEnv("QURAN_EVALUATOR_URL", "https://quran-evaluator.example.test");
      global.fetch = vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch;
      ({ evaluateQuranAwareAudio } = await import("./quranEvaluator"));
      const review = await evaluateQuranAwareAudio(evaluatorInput, {
        onDiagnostics: () => { throw new Error("sink failure"); },
      });
      expect(review).toMatchObject({ status: "unavailable", findings: [] });
    });
  });
});
