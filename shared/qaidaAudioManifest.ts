/**
 * Which Qaida recordings exist, who made them, and who approved them.
 *
 * The curriculum says what a learner needs to hear (`qaidaAudioTargets.ts`).
 * This module says what has actually been recorded, and it is the only thing
 * that may authorise playback of a reference recording.
 *
 * **Approval is a person's judgement, never a file's existence.** A file on
 * disk means a recording was delivered. It does not mean the sound in it is the
 * letter it claims to be, at the makhraj a teacher would accept — and this app
 * is in no position to decide that. So `approved` requires a named reviewer
 * with a stated qualification, and nothing reaches a learner as reference audio
 * until an entry says so. Software checks what software can check
 * (`scripts/validate-qaida-audio.ts`); a qualified teacher checks the rest.
 *
 * **Nothing here may be synthesised.** The repository still carries a set of
 * machine-generated letter clips, used by development and by tests. They are
 * recorded in `PLACEHOLDER_LETTER_AUDIO` below so their existence is written
 * down rather than implied, and they are deliberately *not* entries in the
 * ledger: a synthesised clip can never be a teacher's reference recording, so
 * it can never be approved, so it is never played as one.
 */
import { qaidaAudioTargets, type QaidaAudioTarget } from "./qaidaAudioTargets";

/**
 * How far along one recording is.
 *
 * - `missing` — nobody has recorded it.
 * - `recorded` — a file has been delivered and passes the mechanical checks.
 * - `reviewed` — a qualified teacher has listened to it and left a verdict.
 * - `approved` — that verdict was "this is correct"; only these are played.
 */
export const QAIDA_RECORDING_STATUSES = ["missing", "recorded", "reviewed", "approved"] as const;

export type QaidaRecordingStatus = (typeof QAIDA_RECORDING_STATUSES)[number];

/** Who made the recording, and where it came from. */
export type QaidaRecordingProvenance = {
  /** The person who recited it. Required before anything can be approved. */
  speaker: string;
  /** Their qualification, in their own words or their institution's. */
  qualification: string;
  /** Where the file came from: a session, a donation, a licensed set. */
  source: string;
  /** ISO date the recording was made or received. */
  recordedOn: string;
};

/** Who listened to it, and what they concluded. */
export type QaidaRecordingReview = {
  reviewer: string;
  qualification: string;
  reviewedOn: string;
  /** The reviewer's own words. Never generated, never summarised by the app. */
  verdict: string;
};

/**
 * One delivered recording.
 *
 * `targetId` is the join to the curriculum. An entry naming a target that does
 * not exist is an orphan and fails validation, which is what stops a recording
 * from quietly outliving the lesson it was made for.
 */
export type QaidaRecordingEntry = {
  targetId: string;
  /** Public path the file is served from, e.g. "/audio/qaida/letters/ba.mp3". */
  audioPath: string;
  status: QaidaRecordingStatus;
  provenance?: QaidaRecordingProvenance;
  review?: QaidaRecordingReview;
  notes?: string;
};

/**
 * The ledger.
 *
 * Empty. No qualified teacher has recorded any of this yet, and an empty ledger
 * is the honest statement of that — the coverage report reads 0 approved and
 * 182 missing, and the app plays nothing rather than something.
 *
 * Adding a recording is adding an entry here alongside the file. See
 * docs/qaida-audio.md for the protocol and the review steps.
 */
export const QAIDA_RECORDINGS: QaidaRecordingEntry[] = [];

/**
 * The machine-generated letter clips that already sit in this repository.
 *
 * Written down, not hidden. `scripts/generate-letter-audio.mjs` produced 112
 * clips with OpenAI's text-to-speech and they are committed under
 * `/audio/letters`. They are useful for development and for tests that need a
 * file to exist. They are **not** reference audio: no learner is played one as
 * a model of how a letter sounds, and no entry in the ledger may point at them.
 */
export const PLACEHOLDER_LETTER_AUDIO = {
  directory: "/audio/letters",
  generator: "scripts/generate-letter-audio.mjs",
  kind: "synthesised" as const,
  /** Why they may not be served: a machine voice is not a teacher's recitation. */
  usableAsReference: false,
};

/** A target joined to whatever the ledger knows about it. */
export type QaidaAudioManifestEntry = {
  target: QaidaAudioTarget;
  recording: QaidaRecordingEntry | null;
  status: QaidaRecordingStatus;
  /** True only for an approved recording with provenance and a review. */
  playable: boolean;
  /** The path to play, or null. Null is a perfectly good answer. */
  audioPath: string | null;
};

/**
 * Whether an entry may be played to a learner as reference audio.
 *
 * All four conditions, every time. A status of `approved` with no named
 * reviewer is a data error, not an approval, and this returns false rather than
 * trusting the word.
 */
export function isPlayableReference(recording: QaidaRecordingEntry | null | undefined): boolean {
  if (!recording) return false;
  if (recording.status !== "approved") return false;
  if (!recording.audioPath) return false;
  if (!recording.provenance?.speaker || !recording.provenance.qualification) return false;
  if (!recording.review?.reviewer || !recording.review.qualification) return false;
  return true;
}

/**
 * The whole picture: every target the curriculum needs, with its recording.
 *
 * Quranic targets are included so the report can account for them, but they are
 * never satisfied from this ledger — see `qaidaAudioTargets.ts`.
 */
export function buildQaidaAudioManifest(
  recordings: readonly QaidaRecordingEntry[] = QAIDA_RECORDINGS,
): QaidaAudioManifestEntry[] {
  const byTarget = new Map(recordings.map((entry) => [entry.targetId, entry]));
  return qaidaAudioTargets().map((target) => {
    const recording = byTarget.get(target.id) ?? null;
    const playable = target.kind === "instructional" && isPlayableReference(recording);
    return {
      target,
      recording,
      status: recording?.status ?? "missing",
      playable,
      audioPath: playable ? recording!.audioPath : null,
    };
  });
}

/** The path to play for one target, or null. The only playback authority. */
export function approvedAudioPath(
  targetId: string,
  recordings: readonly QaidaRecordingEntry[] = QAIDA_RECORDINGS,
): string | null {
  const recording = recordings.find((entry) => entry.targetId === targetId);
  return isPlayableReference(recording) ? recording!.audioPath : null;
}

/** The id of a letter's recording, alone or carrying a short vowel. */
export function letterTargetId(slug: string, harakat?: string): string {
  return harakat ? `letter:${slug}:${harakat}` : `letter:${slug}`;
}
