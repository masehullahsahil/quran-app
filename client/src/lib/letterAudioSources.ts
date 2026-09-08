/**
 * Where the Qaida section's letter audio comes from.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ONLY AN APPROVED RECORDING IS PLAYED                                     │
 * │                                                                          │
 * │ A learner hears a letter when a qualified teacher has recorded it and a  │
 * │ qualified reviewer has approved it — and at no other time. The ledger in │
 * │ shared/qaidaAudioManifest.ts is the single authority; this module only   │
 * │ asks it.                                                                 │
 * │                                                                          │
 * │ The repository still carries 112 machine-generated clips under           │
 * │ /audio/letters, made once by scripts/generate-letter-audio.mjs. They are │
 * │ kept for development and for tests that need a file to exist. They are   │
 * │ NOT served to learners: a synthesised voice is not a model of how a      │
 * │ Quranic letter sounds, and presenting one as reference audio in a        │
 * │ Quran-reading course is the thing this arrangement exists to prevent.    │
 * │ `PLACEHOLDER_LETTER_AUDIO` in the manifest records their existence.      │
 * │                                                                          │
 * │ So today every call below returns null and the interface says the        │
 * │ recording has not been added yet. Recordings arrive by adding ledger     │
 * │ entries alongside the files — see docs/qaida-audio.md — and each one     │
 * │ starts playing the moment it is approved, with no code change here.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { approvedAudioPath, letterTargetId } from "@shared/qaidaAudioManifest";
import type { Harakat } from "./arabicLetters";

export type LetterAudioSource = {
  /** Stable id, used in diagnostics and tests. */
  id: string;
  label: string;
  /** True while this is a stand-in rather than our own recordings. */
  isPlaceholder: boolean;
  /** Shown in the UI when the source is not ours. */
  attribution?: string;
  /**
   * URL for one recording, or null when this source has no file for it.
   *
   * Returning null matters: it is how a source says "I do not have this",
   * which the UI reports honestly instead of playing something else.
   */
  url(slug: string, harakat?: Harakat): string | null;
};

/** Public directory both local sources read. */
export const LETTER_AUDIO_DIR = "/audio/letters";

/**
 * The documented path for one recording:
 *
 *   letterAudioUrl("alif")          → /audio/letters/alif.mp3
 *   letterAudioUrl("alif", "fatha") → /audio/letters/alif-fatha.mp3
 *
 * Shared by both local sources on purpose. A hafiz recording named alif.mp3
 * replaces the generated alif.mp3 by sitting on top of it — that is what makes
 * the swap a drop-in rather than a migration.
 */
const letterAudioUrl = (slug: string, harakat?: Harakat) =>
  `${LETTER_AUDIO_DIR}/${harakat ? `${slug}-${harakat}` : slug}.mp3`;

/**
 * A qualified reciter's recordings, addressed by the naming they are delivered
 * under: 28 letters × (alone + 3 harakat). This describes the *file layout* the
 * hand-off asks for — it is not a statement that any of them exist, which is
 * what the ledger is for.
 */
export const HAFIZ_RECORDINGS: LetterAudioSource = {
  id: "hafiz",
  label: "Commissioned hafiz recordings",
  isPlaceholder: false,
  url: letterAudioUrl,
};

/**
 * The source the app actually plays from: the approval ledger, and nothing else.
 *
 * `url` returns a path only for a letter whose recording is approved, with a
 * named speaker and a named reviewer behind it. Everything else is null, and
 * null is what makes the interface say the recording has not been added yet
 * rather than reaching for a substitute.
 *
 * `isPlaceholder` is false because nothing placeholder is being served. The
 * synthesised clips are still in the repository; they are simply not this.
 */
export const APPROVED_RECORDINGS: LetterAudioSource = {
  id: "approved",
  label: "Teacher-approved recordings",
  isPlaceholder: false,
  url: (slug, harakat) => approvedAudioPath(letterTargetId(slug, harakat)),
};

/**
 * The machine-generated clips, kept for development and tests.
 *
 * Generated once by:
 *
 *   OPENAI_API_KEY=sk-... node scripts/generate-letter-audio.mjs
 *
 * No request is made at playback time, and **this source is not active**. It
 * remains exported so a developer can switch to it locally and so tests have a
 * source that returns paths; selecting it in production would put a synthesised
 * voice in front of a learner as a model of Quranic Arabic, which is exactly
 * what this app does not do.
 */
export const OPENAI_TTS: LetterAudioSource = {
  id: "openai-tts",
  label: "OpenAI text-to-speech (synthesised)",
  isPlaceholder: true,
  attribution: "OpenAI text-to-speech",
  url: letterAudioUrl,
};

export const LETTER_AUDIO_SOURCES = [APPROVED_RECORDINGS, HAFIZ_RECORDINGS, OPENAI_TTS];

// ─── WHAT A LEARNER HEARS ──────────────────────────────────────────────────
// The ledger, and only the ledger. Recordings begin playing as entries in
// shared/qaidaAudioManifest.ts reach "approved"; nothing here changes when they
// do, and nothing synthesised is ever served through this.
export const ACTIVE_LETTER_AUDIO_SOURCE: LetterAudioSource = APPROVED_RECORDINGS;
