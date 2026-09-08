/**
 * What software can safely check about a delivered recording.
 *
 * The boundary this module exists to hold: it checks that a file is *there, and
 * is a file*, and that the paperwork around it is complete. It does **not**
 * judge whether the sound in it is the letter it claims to be, at an acceptable
 * makhraj, with the right harakah. No automated check in this repository is
 * permitted to conclude that, and an entry reaches `approved` only because a
 * qualified teacher listened and said so.
 *
 * Kept free of `node:fs` so it can be unit-tested with a plain map of files;
 * `scripts/validate-qaida-audio.ts` supplies the real directory.
 */
import { qaidaAudioTargets } from "./qaidaAudioTargets";
import {
  isPlayableReference,
  QAIDA_RECORDINGS,
  type QaidaRecordingEntry,
} from "./qaidaAudioManifest";

/** Formats a browser will play, and that a teacher can reasonably deliver. */
export const QAIDA_AUDIO_EXTENSIONS = [".mp3", ".m4a", ".ogg", ".wav"] as const;

/** Below this a "recording" is a header and silence, not a recitation. */
export const QAIDA_MIN_AUDIO_BYTES = 1024;

export type QaidaAudioIssueCode =
  | "unknown-target"
  | "duplicate-path"
  | "duplicate-target"
  | "file-missing"
  | "file-empty"
  | "unsupported-format"
  | "orphan-file"
  | "approved-without-provenance"
  | "approved-without-review"
  | "recorded-without-path"
  | "quran-target-recorded-here"
  | "synthesised-path";

export type QaidaAudioIssue = {
  code: QaidaAudioIssueCode;
  /** The manifest entry or file the issue is about. */
  subject: string;
  detail: string;
};

export type QaidaAudioValidation = {
  ok: boolean;
  issues: QaidaAudioIssue[];
  /** Targets with no ledger entry at all. Expected, and reported explicitly. */
  missingTargetIds: string[];
  checkedFiles: number;
};

/** One delivered file, as the filesystem describes it. */
export type QaidaAudioFile = { path: string; bytes: number };

export type QaidaValidationInput = {
  recordings?: readonly QaidaRecordingEntry[];
  /** Every audio file found under the Qaida audio directory. */
  files?: readonly QaidaAudioFile[];
  /** Paths that hold synthesised clips, which may never back an entry. */
  synthesisedPrefixes?: readonly string[];
};

export function validateQaidaAudio(input: QaidaValidationInput = {}): QaidaAudioValidation {
  const recordings = input.recordings ?? QAIDA_RECORDINGS;
  const files = input.files ?? [];
  const synthesised = input.synthesisedPrefixes ?? ["/audio/letters/"];

  const issues: QaidaAudioIssue[] = [];
  const targets = qaidaAudioTargets();
  const targetIds = new Set(targets.map((target) => target.id));
  const quranTargetIds = new Set(targets.filter((target) => target.kind === "quran").map((target) => target.id));
  const byPath = new Map<string, number>(files.map((file) => [file.path, file.bytes]));

  const seenPaths = new Map<string, string>();
  const seenTargets = new Set<string>();

  for (const entry of recordings) {
    if (!targetIds.has(entry.targetId)) {
      issues.push({ code: "unknown-target", subject: entry.targetId, detail: "no curriculum target has this id" });
    }
    if (quranTargetIds.has(entry.targetId)) {
      // Quran recitation is not recorded for this app. A ledger entry claiming
      // to supply one is the mistake this check exists to catch.
      issues.push({
        code: "quran-target-recorded-here",
        subject: entry.targetId,
        detail: "Quranic words are served by the Quran audio source, not recorded for the Qaida",
      });
    }
    if (seenTargets.has(entry.targetId)) {
      issues.push({ code: "duplicate-target", subject: entry.targetId, detail: "two ledger entries for one target" });
    }
    seenTargets.add(entry.targetId);

    if (entry.status !== "missing" && !entry.audioPath) {
      issues.push({ code: "recorded-without-path", subject: entry.targetId, detail: `status "${entry.status}" with no audioPath` });
    }

    if (entry.audioPath) {
      const claimedBy = seenPaths.get(entry.audioPath);
      if (claimedBy) {
        issues.push({
          code: "duplicate-path",
          subject: entry.audioPath,
          detail: `assigned to both ${claimedBy} and ${entry.targetId}`,
        });
      }
      seenPaths.set(entry.audioPath, entry.targetId);

      if (synthesised.some((prefix) => entry.audioPath.startsWith(prefix))) {
        issues.push({
          code: "synthesised-path",
          subject: entry.audioPath,
          detail: "this directory holds machine-generated clips, which may not be reference audio",
        });
      }

      const extension = entry.audioPath.slice(entry.audioPath.lastIndexOf(".")).toLowerCase();
      if (!(QAIDA_AUDIO_EXTENSIONS as readonly string[]).includes(extension)) {
        issues.push({ code: "unsupported-format", subject: entry.audioPath, detail: `extension "${extension}" is not a supported audio format` });
      }

      // Only look for the file when the caller listed a directory at all —
      // a unit test checking paperwork should not be told every file is gone.
      if (files.length > 0) {
        const bytes = byPath.get(entry.audioPath);
        if (bytes === undefined) {
          issues.push({ code: "file-missing", subject: entry.audioPath, detail: "no file at this path" });
        } else if (bytes < QAIDA_MIN_AUDIO_BYTES) {
          issues.push({ code: "file-empty", subject: entry.audioPath, detail: `${bytes} bytes is too small to be a recording` });
        }
      }
    }

    if (entry.status === "approved") {
      if (!entry.provenance?.speaker || !entry.provenance.qualification) {
        issues.push({ code: "approved-without-provenance", subject: entry.targetId, detail: "approved with no named, qualified speaker" });
      }
      if (!entry.review?.reviewer || !entry.review.qualification || !entry.review.verdict) {
        issues.push({ code: "approved-without-review", subject: entry.targetId, detail: "approved with no named, qualified reviewer and verdict" });
      }
    }
  }

  // A file nobody claims. Not fatal on its own, but it is how a recording made
  // for a lesson that has since changed goes unnoticed.
  for (const file of files) {
    if (!seenPaths.has(file.path)) {
      issues.push({ code: "orphan-file", subject: file.path, detail: "no ledger entry points at this file" });
    }
  }

  const missingTargetIds = targets
    .filter((target) => target.kind === "instructional")
    .filter((target) => {
      const entry = recordings.find((item) => item.targetId === target.id);
      return !isPlayableReference(entry);
    })
    .map((target) => target.id);

  return { ok: issues.length === 0, issues, missingTargetIds, checkedFiles: files.length };
}
