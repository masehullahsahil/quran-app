export const RECITATION_ATTEMPT_SCOPES = ["ayah", "word"] as const;

export type RecitationAttemptScope = (typeof RECITATION_ATTEMPT_SCOPES)[number];
export type TargetRecognition = "recognised" | "not-recognised" | "unknown";
export type CorrectionStage = "hear" | "say-word" | "recite-ayah" | "continue";

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

export type FocusedWordReason =
  | "target_recognised"
  | "different_word"
  | "ambiguous_transcript"
  | "transcription_failed"
  | "no_arabic_returned"
  | "invalid_target";

/** A textual presence check only. It is not a pronunciation assessment. */
export type FocusedWordResult = {
  recognition: TargetRecognition;
  reason: FocusedWordReason;
};

export type RecitationScoreScope = "ayah" | "word" | "none";
