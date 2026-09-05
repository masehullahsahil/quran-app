import type { LearningLevel } from "../../shared/learningPath";
import { alignKnownWords } from "./alignment";
import { analyzeAudio, preprocessAudio } from "./audio";
import {
  AbstainingPhonemeEvaluator,
  extractAcousticTargets,
  type PhonemeEvaluator,
} from "./phoneme";
import { PHONEME_THRESHOLDS } from "./thresholds";
import type { AcousticFinding, EvaluationResult } from "./types";

export type EvaluateInput = {
  audioBase64: string;
  mimeType: string;
  expectedArabic: string;
  surah: number;
  ayah: number;
  learningLevel: LearningLevel;
};
const MIN_FINDING_CONFIDENCE = 0.75;

export async function evaluate(
  input: EvaluateInput,
  phonemes: PhonemeEvaluator = new AbstainingPhonemeEvaluator()
): Promise<EvaluationResult> {
  let audio;
  try {
    audio = await preprocessAudio(
      Buffer.from(input.audioBase64, "base64"),
      input.mimeType
    );
  } catch (error) {
    return {
      status: "abstained",
      provider: "quran-acoustic-prototype",
      confidence: 0,
      summary: null,
      findings: [],
      measurements: undefined,
    };
  }
  const { quality, regions } = analyzeAudio(audio);
  if (quality.reason)
    return {
      status: "abstained",
      provider: "quran-acoustic-prototype",
      confidence: quality.confidence,
      summary: null,
      findings: [],
      measurements: {
        audioDurationMs: audio.durationMs,
        alignmentConfidence: 0,
        words: [],
        uncertainRegions: regions,
      },
    };
  const alignment = alignKnownWords(
    input.expectedArabic,
    regions,
    quality.confidence
  );
  const findings: AcousticFinding[] = [];
  // Only directly measured, unusually long internal silence is currently learner-facing.
  const durations = alignment.words
      .map(w => w.endMs - w.startMs)
      .sort((a, b) => a - b),
    median = durations[Math.floor(durations.length / 2)] || 0;
  for (const word of alignment.words.slice(0, -1)) {
    const confidence = Math.min(
      quality.confidence,
      word.confidence,
      Math.min(1, word.pauseAfterMs / 900)
    );
    if (
      word.pauseAfterMs > Math.max(700, median * 1.5) &&
      confidence >= MIN_FINDING_CONFIDENCE
    )
      findings.push({
        kind: "pause",
        wordIndex: word.wordIndex,
        expectedArabic: word.arabic,
        guidance: "A long acoustic pause was measured after this word.",
        confidence,
      });
  }
  // Model-backed is mandatory; stubs and metadata can never produce findings.
  const observations = await phonemes.evaluate({
    audio,
    words: alignment.words,
    signalQuality: quality.confidence,
  });
  for (const observation of observations) {
    // Repeat every safety check at the trust boundary: an injected/remote model
    // cannot promote its own payload around recording and alignment gates.
    const word = alignment.words.find(
      item => item.wordIndex === observation.wordIndex
    );
    const targetMatch = word
      ? extractAcousticTargets(word.arabic, word.wordIndex).some(
          target =>
            target.target === observation.target &&
            target.confusionPairId === observation.confusionPairId &&
            target.candidates.includes(observation.candidate)
        )
      : false;
    const safe =
      observation.modelBacked &&
      Boolean(observation.modelId) &&
      Boolean(word) &&
      targetMatch &&
      word!.confidence >= PHONEME_THRESHOLDS.minimumAlignmentQuality &&
      quality.confidence >= PHONEME_THRESHOLDS.minimumSignalQuality &&
      observation.alignmentConfidence >=
        PHONEME_THRESHOLDS.minimumAlignmentQuality &&
      observation.signalQuality >= PHONEME_THRESHOLDS.minimumSignalQuality &&
      observation.segmentConfidence >=
        PHONEME_THRESHOLDS.minimumSegmentConfidence &&
      observation.classifierConfidence >=
        PHONEME_THRESHOLDS.minimumClassifierConfidence &&
      observation.margin >= PHONEME_THRESHOLDS.minimumTargetVsConfusionMargin &&
      observation.evidenceQuality >=
        PHONEME_THRESHOLDS.minimumEvidenceQuality &&
      observation.confidence >= PHONEME_THRESHOLDS.minimumFindingConfidence;
    if (process.env.NODE_ENV !== "test")
      console.info(
        JSON.stringify({
          event: "quran_phoneme_observation",
          targetWord: word?.arabic ?? null,
          targetGrapheme: observation.target,
          alignmentConfidence: observation.alignmentConfidence,
          segmentDurationMs: observation.segmentDurationMs,
          modelConfidence: observation.classifierConfidence,
          candidateConfusion: observation.candidate,
          finalDecision: safe ? "finding" : "abstain",
        })
      );
    if (safe && findings.length < PHONEME_THRESHOLDS.maximumFindings)
      findings.push({
        kind: "phoneme",
        wordIndex: observation.wordIndex,
        expectedArabic: word!.arabic,
        guidance: "Review the pronunciation of this word with your teacher.",
        confidence: observation.confidence,
      });
  }
  const confidence = Math.max(
    0,
    Math.min(1, Math.min(quality.confidence, alignment.confidence))
  );
  const measurements = {
    audioDurationMs: audio.durationMs,
    alignmentConfidence: alignment.confidence,
    words: alignment.words,
    uncertainRegions: alignment.uncertainRegions,
  };
  return findings.length
    ? {
        status: "available",
        provider: "quran-acoustic-prototype",
        confidence,
        summary: "A confidence-gated acoustic observation is available.",
        findings,
        measurements,
      }
    : {
        status: "abstained",
        provider: "quran-acoustic-prototype",
        confidence,
        summary: null,
        findings: [],
        measurements,
      };
}
