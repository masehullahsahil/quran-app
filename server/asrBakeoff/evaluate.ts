/**
 * Per-recording evaluation for the ASR bake-off.
 *
 * CRITICAL: evaluation reuses the production alignment engine
 * (assessRecitationTranscript) and the production normalization
 * (tokenizeArabic / hasArabicScript) from server/recitation.ts. The harness
 * never reimplements them, so a candidate is judged by the exact logic the
 * shipped tutor uses to decide corrections.
 *
 * What "false correction" means here: for a sample labelled "correct", ANY
 * non-matched word in the production alignment (missing, review, or extra)
 * counts — the tutor would surface it to the learner. This is deliberately
 * conservative, matching the product's "never falsely correct" bar.
 */
import {
  assessRecitationTranscript,
  hasArabicScript,
  normaliseArabicToken,
  tokenizeArabic,
} from "../recitation";
import type {
  AdapterTranscribeResult,
  PerRecordingResult,
  SampleManifestEntry,
} from "./types";

/**
 * The app's alignment normalization, applied to whole transcripts.
 * NOTE: tokenizeArabic() returns raw tokens (it only *filters* by normalized
 * truthiness), so the explicit normaliseArabicToken map is required — without
 * it, "normalized" comparisons silently compare diacritized text.
 */
function normalizedTokensOf(text: string): string[] {
  return tokenizeArabic(text)
    .map((token) => normaliseArabicToken(token))
    .filter((token) => token.length > 0);
}

export function evaluateSample(
  sample: SampleManifestEntry,
  adapterId: string,
  result: AdapterTranscribeResult,
): PerRecordingResult {
  const base = {
    sampleId: sample.id,
    adapterId,
    latencyMs: result.latencyMs,
    peakRssMb: result.peakRssMb,
    adapterError: result.error ? `${result.error.code}${result.error.detail ? `: ${result.error.detail}` : ""}` : null,
  };

  if (result.transcript === null) {
    return {
      ...base,
      skipped: false,
      skipReason: null,
      producedArabic: false,
      rawTranscript: null,
      normalizedTokens: [],
      expectedTokens: normalizedTokensOf(sample.canonicalArabic),
      alignment: null,
      falseCorrectionOnCorrect: sample.expectedResult === "correct" ? true : null,
      omissionDetected: null,
      substitutionDetected: null,
    };
  }

  const rawTranscript = result.transcript;
  const producedArabic = hasArabicScript(rawTranscript);
  const normalizedTokens = normalizedTokensOf(rawTranscript);
  const expectedTokens = normalizedTokensOf(sample.canonicalArabic);

  // Capture point 13b: empty or non-Arabic output is unusable downstream —
  // the production pipeline would treat it as no_arabic_returned.
  const unusable = !producedArabic || normalizedTokens.length === 0;

  const assessment = unusable
    ? null
    : assessRecitationTranscript(sample.canonicalArabic, rawTranscript);

  const missingWordIndexes = assessment
    ? assessment.expectedWords.filter((w) => w.status === "missing").map((w) => w.wordIndex ?? -1)
    : [];
  const reviewCount = assessment
    ? assessment.expectedWords.filter((w) => w.status === "review").length
    : 0;
  const extraCount = assessment ? assessment.extraWords.length : 0;

  // Capture 9: would the tutor falsely correct a correct recitation?
  // A failed/unusable transcript on a correct recitation also counts: the
  // learner recited correctly and the tutor could say nothing true.
  const falseCorrectionOnCorrect =
    sample.expectedResult === "correct"
      ? unusable || (assessment ? assessment.corrections.length > 0 : true)
      : null;

  // Capture 10: labelled omission — did the intended word come back "missing"?
  let omissionDetected: boolean | null = null;
  if (sample.expectedResult === "omission" && sample.intendedError?.kind === "omitted") {
    omissionDetected =
      assessment !== null && missingWordIndexes.includes(sample.intendedError.wordIndex);
  }

  // Capture 10b: labelled substitution — surfaced as "review" at the index?
  let substitutionDetected: boolean | null = null;
  if (sample.expectedResult === "substitution" && sample.intendedError?.kind === "substituted") {
    substitutionDetected =
      assessment !== null &&
      assessment.expectedWords.some(
        (w) => w.wordIndex === sample.intendedError!.wordIndex && w.status === "review",
      );
  }

  return {
    ...base,
    skipped: false,
    skipReason: null,
    producedArabic,
    rawTranscript,
    normalizedTokens,
    expectedTokens,
    alignment: assessment
      ? {
          matched: assessment.matchedCount,
          total: assessment.totalWords,
          score: assessment.score,
          missingWordIndexes,
          extraCount,
          reviewCount,
        }
      : null,
    falseCorrectionOnCorrect,
    omissionDetected,
    substitutionDetected,
  };
}

/** A skipped sample: adapter unavailable or audio file missing. */
export function skippedSample(
  sample: SampleManifestEntry,
  adapterId: string,
  reason: string,
): PerRecordingResult {
  return {
    sampleId: sample.id,
    adapterId,
    skipped: true,
    skipReason: reason,
    producedArabic: false,
    rawTranscript: null,
    normalizedTokens: [],
    expectedTokens: normalizedTokensOf(sample.canonicalArabic),
    alignment: null,
    falseCorrectionOnCorrect: null,
    omissionDetected: null,
    substitutionDetected: null,
    latencyMs: null,
    peakRssMb: null,
    adapterError: null,
  };
}
