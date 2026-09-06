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
    });
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestUrl)).toBe("https://quran-evaluator.example.test/v1/evaluate");
    expect(requestInit).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer service-key" }),
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
});
