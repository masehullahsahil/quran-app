/**
 * Size limits for a recitation attempt, shared by the recorder and the review
 * endpoint so both enforce the same number.
 *
 * The binding constraint is the platform, not the audio. A Vercel serverless
 * function rejects a request body over 4.5 MB *before the function runs*, so a
 * recording that is too big never reaches our validation and the learner would
 * see an opaque 413 instead of an explanation. The cap therefore has to be
 * applied to the encoded request, and it has to be applied in the browser.
 *
 * The audio is sent base64-encoded inside a JSON body, which costs 4 bytes for
 * every 3 bytes of audio — so the request is always about a third larger than
 * the recording itself. MAX_AUDIO_BYTES is chosen so that expansion, plus the
 * rest of the JSON, still lands under the platform limit with room to spare.
 */

/** Vercel's serverless request body limit, in decimal MB as they document it. */
export const REQUEST_BODY_LIMIT_BYTES = 4_500_000;

/**
 * Largest recording we accept, before encoding.
 *
 * 3 MB is roughly five minutes of the Opus audio MediaRecorder produces —
 * generous for a single ayah, where a slow reading of even al-Baqarah 2:282
 * lands nearer three minutes. OpenAI's own upload limit (25 MB) is far higher;
 * this is the platform's constraint, not Whisper's.
 */
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

/** Everything in the request that is not the audio: expected ayah text, ids, envelope. */
const REQUEST_OVERHEAD_BYTES = 16 * 1024;

/** Bytes a buffer of `byteLength` occupies once base64-encoded. */
export function base64Length(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}

/** Approximate size of the whole review request for a recording of `byteLength`. */
export function estimateRequestBytes(byteLength: number): number {
  return base64Length(byteLength) + REQUEST_OVERHEAD_BYTES;
}

/** Largest base64 string the endpoint will accept, for input validation. */
export const MAX_AUDIO_BASE64_LENGTH = base64Length(MAX_AUDIO_BYTES);

export function isRecordingTooLarge(byteLength: number): boolean {
  return byteLength > MAX_AUDIO_BYTES;
}

/** Rounded to one decimal place, for the message shown to the learner. */
export function formatMegabytes(byteLength: number): string {
  return (byteLength / (1024 * 1024)).toFixed(1);
}
