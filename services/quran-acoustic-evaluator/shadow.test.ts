import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HttpAcousticShadowEvaluator,
  parseShadowAnalysis,
  safeCorrelationId,
} from "./shadow";
import { acousticEvaluationLogLine } from "./evaluationLog";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("Quran acoustic shadow adapter", () => {
  it("keeps only aggregate diagnostics from decoded model output", () => {
    const result = parseShadowAnalysis({
      status: "available",
      provider: "muaalem-shadow",
      modelId: "obadx/muaalem-model-v3_2",
      levels: {
        phonemes: {
          tokens: ["ا", "ه", "د", "ن", "ا"],
          meanPosterior: 0.9,
        },
        qalqla: {
          tokens: ["[لا قلقلة]"],
          meanPosterior: 0.8,
        },
      },
    });
    expect(result).toMatchObject({
      status: "available",
      provider: "muaalem-shadow",
      modelId: "obadx/muaalem-model-v3_2",
      decodedLevelCount: 2,
      phonemeTokenCount: 5,
    });
    expect(result.averagePosterior).toBeCloseTo(0.85);
  });

  it.each([
    ["unknown status", { status: "correct" }],
    [
      "missing levels",
      {
        status: "available",
        provider: "muaalem-shadow",
        modelId: "model",
      },
    ],
    [
      "out-of-range confidence",
      {
        status: "available",
        provider: "muaalem-shadow",
        modelId: "model",
        levels: { phonemes: { tokens: ["ا"], meanPosterior: 2 } },
      },
    ],
  ])("rejects %s", (_name, value) => {
    expect(parseShadowAnalysis(value).status).toBe("unavailable");
  });

  it("requires learner-microphone provenance and does not expose decoded tokens", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        status: "available",
        provider: "muaalem-shadow",
        modelId: "model-v1",
        levels: {
          phonemes: { tokens: ["ا", "ه"], meanPosterior: 0.88 },
        },
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const evaluator = new HttpAcousticShadowEvaluator(
      "https://shadow.example.test/v1/shadow/analyze",
      "private-key"
    );

    const result = await evaluator.analyze({
      audio: {
        samples: new Float32Array([0.1, -0.1]),
        sampleRate: 16_000,
        durationMs: 0.125,
      },
      evidenceOrigin: "learner_microphone",
    });

    expect(result).not.toHaveProperty("levels");
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer private-key" }),
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      evidenceOrigin: "learner_microphone",
      sampleRate: 16_000,
    });
  });

  it("degrades network and schema failures to unavailable", async () => {
    global.fetch = vi.fn(async () => {
      throw new DOMException("timeout", "TimeoutError");
    }) as unknown as typeof fetch;
    const evaluator = new HttpAcousticShadowEvaluator(
      "https://shadow.example.test/v1/shadow/analyze"
    );
    await expect(
      evaluator.analyze({
        audio: {
          samples: new Float32Array([0.1]),
          sampleRate: 16_000,
          durationMs: 0.0625,
        },
        evidenceOrigin: "learner_microphone",
      })
    ).resolves.toMatchObject({ status: "unavailable" });
  });

  it("forwards the correlation ID to the worker and times the call", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "available",
            provider: "muaalem-shadow",
            modelId: "obadx/muaalem-model-v3_2",
            levels: { phonemes: { tokens: ["ا"], meanPosterior: 0.9 } },
          }),
          { status: 200 }
        )
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await new HttpAcousticShadowEvaluator(
      "https://shadow.example.test/v1/shadow/analyze"
    ).analyze({
      audio: {
        samples: new Float32Array(640),
        sampleRate: 16_000,
        durationMs: 40,
      },
      evidenceOrigin: "learner_microphone",
      correlationId: "req_abcdefgh1234",
    });
    const init = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1];
    expect((init.headers as Record<string, string>)["x-correlation-id"]).toBe(
      "req_abcdefgh1234"
    );
    expect(result.status).toBe("available");
    expect(typeof result.latencyMs).toBe("number");
  });

  it("accepts only opaque, URL-safe correlation IDs", () => {
    expect(safeCorrelationId("req_abcdefgh1234")).toBe("req_abcdefgh1234");
    expect(safeCorrelationId("short")).toBeNull();
    expect(safeCorrelationId("has space in it")).toBeNull();
    expect(safeCorrelationId("line\nbreak-injected")).toBeNull();
    expect(safeCorrelationId(undefined)).toBeNull();
  });
});

describe("quran_acoustic_evaluation log line", () => {
  it("carries the correlation ID and shadow aggregates, never Quran text or tokens", () => {
    const line = acousticEvaluationLogLine(
      {
        status: "abstained",
        provider: "quran-acoustic-prototype",
        confidence: 0.4,
        summary: null,
        findings: [],
        measurements: {
          audioDurationMs: 2000,
          alignmentConfidence: 0.4,
          words: [
            {
              wordIndex: 1,
              arabic: "بِسْمِ",
              startMs: 0,
              endMs: 300,
              confidence: 0.4,
              pauseBeforeMs: 0,
              pauseAfterMs: 0,
              meanEnergy: 0.1,
              voicedDurationMs: 200,
              unvoicedDurationMs: 100,
            },
          ],
          uncertainRegions: [],
          shadow: {
            status: "available",
            provider: "muaalem-shadow",
            modelId: "obadx/muaalem-model-v3_2",
            decodedLevelCount: 11,
            phonemeTokenCount: 37,
            averagePosterior: 0.9,
            latencyMs: 800,
          },
        },
      },
      { correlationId: "req_abcdefgh1234", requestDurationMs: 1200 }
    );
    expect(line).toMatchObject({
      event: "quran_acoustic_evaluation",
      correlationId: "req_abcdefgh1234",
      requestDurationMs: 1200,
      shadowStatus: "available",
      shadowProvider: "muaalem-shadow",
      shadowModelId: "obadx/muaalem-model-v3_2",
      shadowDecodedLevels: 11,
      shadowPhonemeTokens: 37,
      shadowAveragePosterior: 0.9,
      shadowLatencyMs: 800,
    });
    expect(JSON.stringify(line)).not.toMatch(/[\u0600-\u06FF]/);
  });
});
