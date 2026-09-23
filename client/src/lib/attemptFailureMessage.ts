/**
 * Truthful failure messages for a recitation attempt.
 *
 * The server decides Quran state (position, advancement, correction) and the
 * client never second-guesses it. But the *words* shown to the learner are the
 * client's job — and they must not contradict what the client itself
 * observed. In run_e6872ef0aa84e7b7dc7ac447 the recorder captured 50,622
 * bytes, interim recognition transcribed, and the server review completed,
 * yet the learner-facing copy said "Nothing usable was heard." That sentence
 * is only true when the capture itself produced nothing.
 *
 * This module is pure: evidence in, locale key out. It changes no matching,
 * scoring, advancement, or acoustic algorithm — only which sentence the
 * learner reads.
 */
import type { StringKey } from "@locales/index";
import type { VerseFollowingReason, VerseFollowingState } from "@shared/verseFollowing";

/** The distinct failure modes a learner can actually act on. */
export type AttemptFailureKind =
  /** The recorder produced zero bytes: nothing to check. */
  | "no-audio-captured"
  /** Audio exists but the measured signal was too quiet to use. */
  | "mic-too-quiet"
  /** The speech service failed or rejected the request. */
  | "transcription-unavailable"
  /** Transcription ran but returned nothing usable. */
  | "no-usable-transcript"
  /**
   * Audio was captured and the review completed, but the verse match is
   * uncertain or insufficient. Never rendered as "nothing was heard".
   */
  | "uncertain-verse-match"
  /** The acoustic evaluator was expected but did not run. */
  | "evaluator-unavailable";

/** Server review message codes the client knows how to render. */
export type AttemptReviewMessageCode =
  | "transcription_failed"
  | "no_arabic_returned"
  | "focused_target_invalid"
  | "focused_unclear"
  | null;

/**
 * What the client knows about one attempt's failure. `bytesCaptured` and
 * `signalTooQuiet` are the client's own capture evidence; everything else is
 * copied from the server's review enums. `null` means unknown — never
 * guessed.
 */
export type AttemptFailureEvidence = {
  /** Encoded bytes the recorder produced, or null when unknown. */
  bytesCaptured: number | null;
  /** True when the client measured voice energy below the usable threshold. */
  signalTooQuiet: boolean | null;
  reviewMessageCode: AttemptReviewMessageCode;
  verseFollowReason: VerseFollowingReason | null;
  verseFollowState: VerseFollowingState | null;
  /** `quranAwareReview.status`, or null when the review carried none. */
  acousticStatus: string | null;
  /** True when this attempt's scope should have reached the acoustic evaluator. */
  acousticExpected: boolean;
};

/**
 * One locale key per failure kind. Existing keys are reused where the
 * meaning already matches; only genuinely new sentences get new keys.
 */
export const attemptFailureLocaleKeys: Record<AttemptFailureKind, StringKey> = {
  "no-audio-captured": "recorder.empty",
  "mic-too-quiet": "attemptFailure.micTooQuiet",
  "transcription-unavailable": "feedback.transcriptionFailed",
  "no-usable-transcript": "feedback.noArabicReturned",
  "uncertain-verse-match": "attemptFailure.uncertainVerseMatch",
  "evaluator-unavailable": "feedback.acousticUnavailable",
};

/** Reasons where the server stayed put for lack of a confident match. */
const UNCERTAIN_MATCH_REASONS: ReadonlySet<VerseFollowingReason> = new Set<VerseFollowingReason>([
  "no_transcript",
  "too_little_evidence",
  "noisy_transcript",
]);

/**
 * Picks the most specific truthful failure kind, or null when the attempt
 * did not fail in a classified way (the caller keeps its existing copy).
 *
 * Precedence is deliberately narrow: a kind is returned only on positive
 * evidence. "Nothing was heard" is never selected when bytes were captured.
 */
export function classifyAttemptFailure(
  evidence: AttemptFailureEvidence
): AttemptFailureKind | null {
  // 1. The capture itself is empty — there is nothing any service could check.
  if (evidence.bytesCaptured === 0) return "no-audio-captured";
  // 2. The client measured the signal and it was too quiet to use.
  if (evidence.signalTooQuiet === true) return "mic-too-quiet";
  // 3. The speech service failed or rejected the request.
  if (evidence.reviewMessageCode === "transcription_failed")
    return "transcription-unavailable";
  // 4. Transcription ran but returned nothing usable.
  if (evidence.reviewMessageCode === "no_arabic_returned")
    return "no-usable-transcript";
  // 5. The acoustic evaluator was expected but did not run. (When the word
  //    review itself succeeded, the acoustic note rides alongside it instead
  //    of replacing the recorder message — see the acoustic review block.)
  if (evidence.acousticExpected && evidence.acousticStatus === "unavailable")
    return "evaluator-unavailable";
  // 6. Audio was captured and the review completed, but the verse match is
  //    uncertain or insufficient. The server's stay-put decision stands; only
  //    the sentence changes, so it stops claiming nothing was heard.
  if (
    evidence.bytesCaptured !== null &&
    evidence.bytesCaptured > 0 &&
    (evidence.verseFollowState === "uncertain" ||
      (evidence.verseFollowReason !== null &&
        UNCERTAIN_MATCH_REASONS.has(evidence.verseFollowReason)))
  )
    return "uncertain-verse-match";
  return null;
}

/**
 * The "your place" reason copy, corrected by client capture evidence.
 *
 * `fallback` is the existing per-reason key for this reason. Only
 * `no_transcript` is ever overridden: it is the one sentence that claims
 * nothing was heard, which is false when the recorder produced audio.
 * Every other reason keeps its existing copy verbatim.
 */
export function selectPlaceReasonKey(
  reason: VerseFollowingReason,
  bytesCaptured: number | null,
  fallback: StringKey
): StringKey {
  if (reason === "no_transcript" && bytesCaptured !== null && bytesCaptured > 0)
    return "attemptFailure.uncertainVerseMatch";
  return fallback;
}
