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
        { kind: "not-allowed", wordIndex: 3, expectedArabic: "ignored", guidance: "This must not reach the learner." },
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
});
