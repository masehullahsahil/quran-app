import { describe, expect, it } from "vitest";
import { evaluateSample, skippedSample } from "./evaluate";
import type { AdapterTranscribeResult, SampleManifestEntry } from "./types";

const FATIHA_3 = "ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

function sample(overrides: Partial<SampleManifestEntry> = {}): SampleManifestEntry {
  return {
    id: "fatiha-003-correct",
    surah: 1,
    ayah: 3,
    canonicalArabic: FATIHA_3,
    expectedResult: "correct",
    audio: "fatiha-003.wav",
    ...overrides,
  };
}

function adapterResult(transcript: string | null): AdapterTranscribeResult {
  return { transcript, latencyMs: 123, peakRssMb: 4, error: null };
}

describe("evaluateSample", () => {
  it("reports a perfect correct recitation with no false correction", () => {
    const result = evaluateSample(sample(), "adapter-a", adapterResult(FATIHA_3));
    expect(result.skipped).toBe(false);
    expect(result.producedArabic).toBe(true);
    expect(result.normalizedTokens).toEqual(["الرحمن", "الرحيم"]);
    expect(result.expectedTokens).toEqual(["الرحمن", "الرحيم"]);
    expect(result.alignment?.matched).toBe(2);
    expect(result.alignment?.total).toBe(2);
    expect(result.falseCorrectionOnCorrect).toBe(false);
    expect(result.adapterError).toBeNull();
  });

  it("flags a false correction when the transcript drops a word on a correct recitation", () => {
    const result = evaluateSample(sample(), "adapter-a", adapterResult("ٱلرَّحْمَٰنِ"));
    expect(result.producedArabic).toBe(true);
    expect(result.falseCorrectionOnCorrect).toBe(true);
    expect(result.alignment?.missingWordIndexes).toContain(2);
  });

  it("treats non-Arabic output on a correct recitation as a false correction", () => {
    // The Ayah 3 real-device failure: Whisper returned no Arabic at all.
    const result = evaluateSample(sample(), "adapter-a", adapterResult("ar rahman ar rahim"));
    expect(result.producedArabic).toBe(false);
    expect(result.alignment).toBeNull();
    expect(result.falseCorrectionOnCorrect).toBe(true);
  });

  it("treats a failed transcription on a correct recitation as a false correction", () => {
    const failed: AdapterTranscribeResult = {
      transcript: null,
      latencyMs: 50,
      peakRssMb: null,
      error: { code: "TRANSCRIPTION_FAILED" },
    };
    const result = evaluateSample(sample(), "adapter-a", failed);
    expect(result.falseCorrectionOnCorrect).toBe(true);
    expect(result.adapterError).toContain("TRANSCRIPTION_FAILED");
  });

  it("detects a labelled omission at the intended word index", () => {
    const omission = sample({
      id: "fatiha-004-omission",
      ayah: 4,
      canonicalArabic: "مَـٰلِكِ يَوْمِ ٱلدِّينِ",
      expectedResult: "omission",
      intendedError: { wordIndex: 2, kind: "omitted" },
    });
    const result = evaluateSample(omission, "adapter-a", adapterResult("مَـٰلِكِ ٱلدِّينِ"));
    expect(result.omissionDetected).toBe(true);
    expect(result.falseCorrectionOnCorrect).toBeNull();
  });

  it("detects a labelled substitution surfaced as review", () => {
    const substitution = sample({
      id: "fatiha-003-substitution",
      canonicalArabic: FATIHA_3,
      expectedResult: "substitution",
      intendedError: { wordIndex: 1, kind: "substituted" },
    });
    const result = evaluateSample(substitution, "adapter-a", adapterResult("ٱلرَّحِيمِ ٱلرَّحِيمِ"));
    expect(result.substitutionDetected).toBe(true);
  });

  it("preserves the dagger-alif word through production normalization", () => {
    // PR #75's root cause: مَـٰلِكِ must survive as مالك, not vanish.
    const result = evaluateSample(
      sample({ canonicalArabic: "مَـٰلِكِ", expectedResult: "correct" }),
      "adapter-a",
      adapterResult("مَـٰلِكِ"),
    );
    expect(result.normalizedTokens).toEqual(["مالك"]);
    expect(result.falseCorrectionOnCorrect).toBe(false);
  });

  it("builds skipped results without evaluation", () => {
    const result = skippedSample(sample(), "adapter-a", "model not cached");
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("model not cached");
    expect(result.falseCorrectionOnCorrect).toBeNull();
    expect(result.latencyMs).toBeNull();
  });
});
