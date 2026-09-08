export const RECITATION_ATTEMPT_SCOPES = ["ayah", "word"] as const;
export const TARGET_RECOGNITIONS = ["recognised", "not-recognised", "unknown"] as const;
export const CORRECTION_STAGES = ["hear", "say-word", "recite-ayah", "continue"] as const;

export type RecitationAttemptScope = (typeof RECITATION_ATTEMPT_SCOPES)[number];
export type TargetRecognition = (typeof TARGET_RECOGNITIONS)[number];
export type CorrectionStage = (typeof CORRECTION_STAGES)[number];

export type CorrectionTarget = {
  surah: number;
  ayah: number;
  targetWordIndex: number;
  expectedArabic: string;
  attemptsOnTarget?: number;
};

/** The small server-owned state consumed by the existing focused lesson. */
export type CorrectionSessionSnapshot = {
  surah: number;
  ayah: number;
  targetWordIndex: number;
  targetArabic: string;
  stage: CorrectionStage;
  recognition: TargetRecognition;
  attemptsOnTarget?: number;
};

export const FOCUSED_WORD_REASONS = [
  "target_recognised",
  "different_word",
  "ambiguous_transcript",
  "transcription_failed",
  "no_arabic_returned",
  "invalid_target",
] as const;

export type FocusedWordReason = (typeof FOCUSED_WORD_REASONS)[number];

/** A textual presence check only. It is not a pronunciation assessment. */
export type FocusedWordResult = {
  recognition: TargetRecognition;
  reason: FocusedWordReason;
};

export type RecitationScoreScope = "ayah" | "word" | "none";
