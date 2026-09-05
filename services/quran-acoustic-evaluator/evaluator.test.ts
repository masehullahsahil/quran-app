import { describe, expect, it } from "vitest";
import { alignKnownWords } from "./alignment";
import { MAX_DURATION_MS, preprocessAudio, SAMPLE_RATE } from "./audio";
import { evaluate } from "./evaluator";
import type { PhonemeEvaluator } from "./phoneme";
import { PHONEME_THRESHOLDS } from "./thresholds";

function wav(
  parts: Array<{ durationMs: number; amplitude: number; frequency?: number }>,
  sampleRate = 8_000,
  channels = 1
) {
  const samples = parts.flatMap(part =>
    Array.from(
      { length: Math.round((part.durationMs * sampleRate) / 1000) },
      (_, i) =>
        part.amplitude *
        Math.sin((2 * Math.PI * (part.frequency ?? 220) * i) / sampleRate)
    )
  );
  const data = Buffer.alloc(samples.length * channels * 2);
  samples.forEach((s, i) => {
    for (let c = 0; c < channels; c++)
      data.writeInt16LE(Math.round(s * 32767), (i * channels + c) * 2);
  });
  const out = Buffer.alloc(44 + data.length);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + data.length, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * channels * 2, 28);
  out.writeUInt16LE(channels * 2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(data.length, 40);
  data.copy(out, 44);
  return out;
}
const request = (audio: Buffer) => ({
  audioBase64: audio.toString("base64"),
  mimeType: "audio/wav",
  expectedArabic: "بِسْمِ اللَّهِ",
  surah: 1,
  ayah: 1,
  learningLevel: "tajweed" as const,
});

describe("acoustic evaluator prototype", () => {
  it("safely abstains on empty and silence-only audio", async () => {
    expect((await evaluate(request(Buffer.alloc(0)))).status).toBe("abstained");
    expect(
      (await evaluate(request(wav([{ durationMs: 1000, amplitude: 0 }]))))
        .status
    ).toBe("abstained");
  });
  it("rejects excessive duration", async () => {
    await expect(
      preprocessAudio(
        wav([{ durationMs: MAX_DURATION_MS + 20, amplitude: 0.1 }], 100),
        "audio/wav"
      )
    ).rejects.toThrow("duration_exceeded");
  });
  it("converts stereo 8 kHz WAV to normalized mono 16 kHz", async () => {
    const pcm = await preprocessAudio(
      wav([{ durationMs: 500, amplitude: 0.1 }], 8_000, 2),
      "audio/wav"
    );
    expect(pcm.sampleRate).toBe(SAMPLE_RATE);
    expect(pcm.samples.length).toBe(8_000);
    expect(Math.max(...pcm.samples)).toBeGreaterThan(0.8);
  });
  it("keeps word timestamps ordered and confidence bounded", () => {
    const result = alignKnownWords(
      "أ ب ج",
      [
        { startMs: 100, endMs: 500, meanEnergy: 0.2 },
        { startMs: 900, endMs: 1500, meanEnergy: 0.2 },
      ],
      0.9
    );
    expect(result.words).toHaveLength(3);
    result.words.forEach((word, i) => {
      expect(word.confidence).toBeGreaterThanOrEqual(0);
      expect(word.confidence).toBeLessThanOrEqual(1);
      if (i)
        expect(word.startMs).toBeGreaterThanOrEqual(result.words[i - 1].endMs);
    });
  });
  it("detects a controlled long internal pause and returns the app contract", async () => {
    const result = await evaluate(
      request(
        wav([
          { durationMs: 500, amplitude: 0.3 },
          { durationMs: 1100, amplitude: 0 },
          { durationMs: 500, amplitude: 0.3 },
        ])
      )
    );
    expect(result.status).toBe("available");
    expect(result.findings[0]).toMatchObject({ kind: "pause", wordIndex: 1 });
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });
  it("does not turn low-confidence alignment into a correction", async () => {
    const result = await evaluate(
      request(
        wav([
          { durationMs: 80, amplitude: 0.03 },
          { durationMs: 1100, amplitude: 0 },
          { durationMs: 80, amplitude: 0.03 },
        ])
      )
    );
    expect(result.findings).toEqual([]);
    expect(result.status).toBe("abstained");
  });
  const observation = (overrides: Record<string, unknown> = {}) => ({
    wordIndex: 1,
    target: "ق",
    candidate: "ك",
    confusionPairId: "qaf-kaf" as const,
    confidence: 0.9,
    evidenceQuality: 0.9,
    alignmentConfidence: 0.9,
    signalQuality: 0.9,
    segmentConfidence: 0.9,
    classifierConfidence: 0.92,
    margin: 0.3,
    segmentDurationMs: 120,
    modelBacked: true,
    modelId: "mock-calibrated-head",
    ...overrides,
  });
  const withMock = async (overrides: Record<string, unknown> = {}) =>
    evaluate(
      {
        ...request(
          wav([
            { durationMs: 300, amplitude: 0 },
            { durationMs: 1000, amplitude: 0.3 },
            { durationMs: 300, amplitude: 0 },
          ])
        ),
        expectedArabic: "قُلْ",
      },
      { evaluate: async () => [observation(overrides)] } as PhonemeEvaluator
    );
  it("never promotes non-model-backed metadata or a mock that bypasses a safety gate", async () => {
    expect((await withMock({ modelBacked: false })).findings).toEqual([]);
    expect(
      (
        await withMock({
          alignmentConfidence:
            PHONEME_THRESHOLDS.minimumAlignmentQuality - 0.01,
        })
      ).findings
    ).toEqual([]);
    expect((await withMock({ segmentConfidence: 0.5 })).findings).toEqual([]);
    expect((await withMock({ candidate: "س" })).findings).toEqual([]);
  });
  it("abstains for low classifier confidence and a small target/candidate margin", async () => {
    expect((await withMock({ classifierConfidence: 0.6 })).findings).toEqual(
      []
    );
    expect((await withMock({ margin: 0.05 })).findings).toEqual([]);
  });
  it("returns a contract-compatible phoneme finding and preserves the word index", async () => {
    const result = await withMock();
    expect(result.status).toBe("available");
    expect(result.findings[0]).toMatchObject({
      kind: "phoneme",
      wordIndex: 1,
      expectedArabic: "قُلْ",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
  it("caps findings even when a classifier floods the service", async () => {
    const mock: PhonemeEvaluator = {
      evaluate: async () => Array.from({ length: 8 }, () => observation()),
    };
    const result = await evaluate(
      {
        ...request(
          wav([
            { durationMs: 300, amplitude: 0 },
            { durationMs: 1000, amplitude: 0.3 },
            { durationMs: 300, amplitude: 0 },
          ])
        ),
        expectedArabic: "قُلْ",
      },
      mock
    );
    expect(result.findings).toHaveLength(PHONEME_THRESHOLDS.maximumFindings);
  });
  it("abstains on clipped audio before invoking the classifier", async () => {
    let called = false;
    const mock: PhonemeEvaluator = {
      evaluate: async () => {
        called = true;
        return [observation()];
      },
    };
    const result = await evaluate(
      request(wav([{ durationMs: 1000, amplitude: 1, frequency: 2000 }])),
      mock
    );
    expect(result.status).toBe("abstained");
    expect(called).toBe(false);
  });
});
