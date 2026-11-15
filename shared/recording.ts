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

/**
 * Bytes at which the manual recorder warns the learner the take is
 * approaching the cap, while there is still time to finish the ayah.
 *
 * 80% of the cap leaves about a minute of Opus audio (3 MB is roughly five
 * minutes, so a fifth is roughly a minute) — enough to finish the ayah at a
 * calm pace after the warning, and short enough that the warning only ever
 * appears on a take that is genuinely long. The warning is advisory only: it
 * changes no limit and no review outcome.
 */
export const RECORDING_SIZE_WARNING_BYTES = Math.floor(MAX_AUDIO_BYTES * 0.8);

/** Where a take in progress stands against the size cap. */
export type RecordingSizeCheckpoint = "ok" | "warn" | "over";

/**
 * The guard decision for a take that has produced `byteLength` so far.
 * "over" stops the take at the cap; "warn" is shown once, before the cap. A
 * take that reaches the cap is stopped either way — whether the assembled
 * take is then reviewed is still the existing check's decision (a take
 * exactly at the cap is accepted, per isRecordingTooLarge).
 */
export function recordingSizeCheckpoint(byteLength: number): RecordingSizeCheckpoint {
  if (byteLength >= MAX_AUDIO_BYTES) return "over";
  if (byteLength >= RECORDING_SIZE_WARNING_BYTES) return "warn";
  return "ok";
}

/** Rounded to one decimal place, for the message shown to the learner. */
export function formatMegabytes(byteLength: number): string {
  return (byteLength / (1024 * 1024)).toFixed(1);
}
