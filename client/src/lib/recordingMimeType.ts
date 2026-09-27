/**
 * The MIME type label sent with a finalized recording.
 *
 * The label has to be one of the enum values the server's recitation schema
 * accepts, and — critically — it has to describe the actual container bytes.
 * The server hands the label to Whisper as the upload filename's extension,
 * so a wrong label (MP4 bytes called `audio/webm`) is a transcription
 * failure, not a cosmetic mismatch.
 *
 * Two real-device hazards this guards against:
 * - Parameterised recorder types (`audio/webm;codecs=opus`,
 *   `audio/mp4;codecs=mp4a.40.2`) never survive an exact string match, so a
 *   naive equality chain silently relabels them — usually as the wrong
 *   container.
 * - Alias container names (`audio/x-m4a`, `audio/aac`, `audio/wave`) that no
 *   exact match knows about.
 *
 * The input is the recorder's own `mimeType` (captured when the recorder is
 * created), not the blob's `type`: the blob is constructed from the recorder
 * type, so reading it back adds nothing and the recorder is the authority.
 */
export const RECITATION_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
] as const;

export type RecitationMimeType = (typeof RECITATION_MIME_TYPES)[number];

/**
 * Map a recorder MIME type to the closest accepted label.
 *
 * Parameters are stripped, the base type is lowercased, and known aliases
 * fold onto their container. An empty or unrecognised type falls back to
 * `audio/webm` — the historical default and the desktop default — because
 * the schema needs a label; the fallback is documented rather than guessed
 * per call site.
 */
export function normalizeRecordingMimeType(
  recorderMimeType: string | null | undefined,
): RecitationMimeType {
  const base = (recorderMimeType ?? "").split(";")[0].trim().toLowerCase();
  switch (base) {
    case "audio/ogg":
      return "audio/ogg";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "audio/wav";
    case "audio/mp4":
    case "audio/m4a":
    case "audio/x-m4a":
    case "audio/aac":
      return "audio/mp4";
    case "audio/mpeg":
    case "audio/mp3":
    case "audio/x-mp3":
      return "audio/mpeg";
    case "audio/webm":
      return "audio/webm";
    default:
      return "audio/webm";
  }
}
