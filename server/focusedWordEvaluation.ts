import type { CorrectionTarget, FocusedWordResult } from "@shared/wordCorrection";
import { normaliseArabicToken, tokenizeArabic } from "./recitation";

export type ValidatedCorrectionTarget = CorrectionTarget & {
  canonicalArabic: string;
};

/**
 * Whisper sometimes writes a final short /i/ as ya. Keep that compatibility
 * local to a canonical target that actually ends in kasra; making it a global
 * Arabic equivalence would conflate unrelated words.
 */
function isFocusedEquivalent(expectedArabic: string, heardArabic: string): boolean {
  const expected = normaliseArabicToken(expectedArabic);
  const heard = normaliseArabicToken(heardArabic);
  if (!expected || !heard) return false;
  if (expected === heard) return true;

  const expectedHasFinalKasra = /\u0650[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0640\u0670]*$/.test(
    expectedArabic.normalize("NFKC"),
  );
  return expectedHasFinalKasra && heard === `${expected}ي`;
}

export function validateCorrectionTarget(input: {
  expectedArabic: string;
  surah: number;
  ayah: number;
  target: CorrectionTarget | null | undefined;
}): ValidatedCorrectionTarget | null {
  const { target } = input;
  if (!target || target.surah !== input.surah || target.ayah !== input.ayah) return null;

  const expectedWords = tokenizeArabic(input.expectedArabic);
  if (!Number.isInteger(target.targetWordIndex) || target.targetWordIndex < 1 || target.targetWordIndex > expectedWords.length) {
    return null;
  }

  const canonicalArabic = expectedWords[target.targetWordIndex - 1];
  if (normaliseArabicToken(canonicalArabic) !== normaliseArabicToken(target.expectedArabic)) return null;
  return { ...target, canonicalArabic };
}

/**
 * Answers one deliberately narrow question: does the transcript support the
 * exact target word? Extra different words make the result ambiguous rather
 * than turning any Arabic output into success.
 */
export function evaluateFocusedWordTranscript(
  target: ValidatedCorrectionTarget,
  transcript: string,
): FocusedWordResult {
  const heardWords = tokenizeArabic(transcript);
  if (heardWords.length === 0) return { recognition: "unknown", reason: "ambiguous_transcript" };

  const matches = heardWords.map((word) => isFocusedEquivalent(target.canonicalArabic, word));
  if (matches.every(Boolean)) return { recognition: "recognised", reason: "target_recognised" };
  if (heardWords.length === 1) return { recognition: "not-recognised", reason: "different_word" };
  return { recognition: "unknown", reason: "ambiguous_transcript" };
}
