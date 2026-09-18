import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpAcousticShadowEvaluator, parseShadowAnalysis } from "./shadow";

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
});
