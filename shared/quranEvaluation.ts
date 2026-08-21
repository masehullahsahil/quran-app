export type QuranEvaluationStatus = "not_configured" | "available" | "abstained" | "unavailable";

/**
 * A deliberately narrow set of categories that a Quran-aware acoustic service
 * may return. These are observations for guided practice, not a declaration of
 * religious correctness. A service must abstain when it is not confident.
 */
export type QuranEvaluationFindingKind = "phoneme" | "vowel_length" | "pause" | "tajweed";

export type QuranEvaluationFinding = {
  kind: QuranEvaluationFindingKind;
  wordIndex: number | null;
  expectedArabic: string | null;
  guidance: string;
};

export type QuranAwareReview = {
  /**
   * `available` means a specialised acoustic service produced a confidence-gated
   * observation. `abstained` means it ran but declined to make an observation.
   * `unavailable` means the service failed; `not_configured` preserves the
   * existing word-alignment-only experience.
   */
  status: QuranEvaluationStatus;
  provider: string | null;
  confidence: number | null;
  summary: string | null;
  findings: QuranEvaluationFinding[];
};

export const EMPTY_QURAN_AWARE_REVIEW: QuranAwareReview = {
  status: "not_configured",
  provider: null,
  confidence: null,
  summary: null,
  findings: [],
};
