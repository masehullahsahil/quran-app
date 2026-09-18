import type { QuranAwareReview, QuranEvaluationFinding } from "../../shared/quranEvaluation";
import type { ShadowAnalysis } from "./shadow";

export type PcmAudio = { samples: Float32Array; sampleRate: number; durationMs: number };
export type SpeechRegion = { startMs: number; endMs: number; meanEnergy: number };
export type WordTiming = {
  wordIndex: number;
  arabic: string;
  startMs: number;
  endMs: number;
  confidence: number;
  pauseBeforeMs: number;
  pauseAfterMs: number;
  meanEnergy: number;
  voicedDurationMs: number;
  unvoicedDurationMs: number;
};
export type Quality = { confidence: number; clippedRatio: number; speechRatio: number; reason: string | null };
export type EvaluationResult = QuranAwareReview & {
  measurements?: { audioDurationMs: number; alignmentConfidence: number; words: WordTiming[]; uncertainRegions: SpeechRegion[]; shadow?: ShadowAnalysis };
};
export type AcousticFinding = QuranEvaluationFinding & { confidence: number };
