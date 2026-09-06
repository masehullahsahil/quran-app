import { describe, expect, it } from "vitest";
import {
  AlignedPhonemeEvaluator,
  extractAcousticTargets,
  extractPhonemeFeatures,
  type AcousticPhonemeClassifier,
} from "./phoneme";
import type { PcmAudio, WordTiming } from "./types";

const audio: PcmAudio = {
  sampleRate: 16_000,
  durationMs: 600,
  samples: Float32Array.from(
    { length: 9_600 },
    (_, index) => 0.3 * Math.sin((2 * Math.PI * 440 * index) / 16_000)
  ),
};
const word = (arabic = "قُلْ", confidence = 0.9): WordTiming => ({
  wordIndex: 2,
  arabic,
  startMs: 100,
  endMs: 500,
  confidence,
  pauseBeforeMs: 0,
  pauseAfterMs: 0,
  meanEnergy: 0.3,
  voicedDurationMs: 400,
  unvoicedDurationMs: 0,
});
const classifier = (
  scores: Record<string, number>,
  segmentConfidence = 0.9
): AcousticPhonemeClassifier => ({
  classify: async () => ({
    scores,
    segmentConfidence,
    modelId: "mock-xls-r-head-v1",
  }),
});

describe("aligned phoneme pipeline", () => {
  it("extracts Quran-aware targets without changing display text", () => {
    expect(extractAcousticTargets("قُّ", 2)).toEqual([
      expect.objectContaining({ word: "قُّ", wordIndex: 2, target: "ق" }),
      expect.objectContaining({ word: "قُّ", wordIndex: 2, target: "ق" }),
    ]);
    expect(extractAcousticTargets("إِ", 1)[0]).toMatchObject({
      target: "أ",
      confusionPairId: "ayn-hamza",
    });
  });
  it("unsupported phonemes and words without a confusion taxonomy abstain", async () => {
    const evaluator = new AlignedPhonemeEvaluator(
      classifier({ ك: 0.99, ق: 0.01 })
    );
    await expect(
      evaluator.evaluate({ audio, words: [word("م")], signalQuality: 0.95 })
    ).resolves.toEqual([]);
    await expect(
      evaluator.evaluate({ audio, words: [word("ب")], signalQuality: 0.95 })
    ).resolves.toEqual([]);
  });
  it("weak alignment, weak signal, silence, and weak segment confidence abstain", async () => {
    const evaluator = new AlignedPhonemeEvaluator(
      classifier({ ك: 0.99, ق: 0.01 })
    );
    await expect(
      evaluator.evaluate({
        audio,
        words: [word("ق", 0.7)],
        signalQuality: 0.95,
      })
    ).resolves.toEqual([]);
    await expect(
      evaluator.evaluate({ audio, words: [word("ق")], signalQuality: 0.5 })
    ).resolves.toEqual([]);
    await expect(
      evaluator.evaluate({
        audio: { ...audio, samples: new Float32Array(audio.samples.length) },
        words: [word("ق")],
        signalQuality: 0.95,
      })
    ).resolves.toEqual([]);
    const weak = new AlignedPhonemeEvaluator(
      classifier({ ك: 0.99, ق: 0.01 }, 0.5)
    );
    await expect(
      weak.evaluate({ audio, words: [word("ق")], signalQuality: 0.95 })
    ).resolves.toEqual([]);
  });
  it("returns bounded structured acoustic observations while leaving final gating to the service", async () => {
    const evaluator = new AlignedPhonemeEvaluator(
      classifier({ ك: 0.9, ق: 0.05 })
    );
    const [observation] = await evaluator.evaluate({
      audio,
      words: [word("ق")],
      signalQuality: 0.95,
    });
    expect(observation).toMatchObject({
      wordIndex: 2,
      target: "ق",
      candidate: "ك",
      confusionPairId: "qaf-kaf",
      modelBacked: true,
    });
    expect(observation.confidence).toBeGreaterThanOrEqual(0);
    expect(observation.confidence).toBeLessThanOrEqual(1);
    expect(
      extractPhonemeFeatures(audio.samples, audio.sampleRate).bandEnergy
    ).toHaveLength(4);
  });
});
