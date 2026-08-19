/**
 * Where the Starter section's letter audio comes from.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PLACEHOLDER AUDIO — TO BE REPLACED                                       │
 * │                                                                          │
 * │ The app currently plays third-party recordings from islamcan.com so the  │
 * │ Starter lesson is usable before our own hafiz recordings are delivered.  │
 * │ They are a stand-in, not the finished article: a different reciter, a    │
 * │ different recording standard, and served from someone else's host.       │
 * │                                                                          │
 * │ To swap to the hafiz set, change ONE line at the bottom of this file:    │
 * │                                                                          │
 * │     export const ACTIVE_LETTER_AUDIO_SOURCE = HAFIZ_RECORDINGS;          │
 * │                                                                          │
 * │ Nothing else changes. The lookup, the slugs and the file-naming pattern  │
 * │ are the same ones documented in docs/letter-recordings.md.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
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

/**
 * Our own recordings, served from client/public/audio/letters/.
 *
 * This is the target state and the naming convention the reciter is recording
 * to — see docs/letter-recordings.md. 28 letters × (alone + 3 harakat).
 */
export const HAFIZ_RECORDINGS: LetterAudioSource = {
  id: "hafiz",
  label: "Commissioned hafiz recordings",
  isPlaceholder: false,
  url(slug, harakat) {
    return `/audio/letters/${harakat ? `${slug}-${harakat}` : slug}.mp3`;
  },
};

/**
 * islamcan.com's per-letter alphabet audio.
 *
 * ⚠ UNVERIFIED PATTERN. islamcan.com is unreachable from the environment this
 * was written in, so the URL shape below could not be confirmed against the
 * real site. If the letters do not play, this is the first thing to check —
 * and it is a one-line fix:
 *
 *   1. Open https://islamcan.com/learn-arabic/arabic-alphabets.shtml
 *   2. Find the audio URL for one letter (view source, or the network tab).
 *   3. Correct BASE_URL / the extension below, or add an entry to
 *      FILE_NAME_OVERRIDES for any letter whose filename differs from our slug.
 *   4. Run `node scripts/check-letter-audio.mjs` to confirm all 28 resolve.
 *
 * If a URL is wrong the letter simply reports "recording not added yet" — the
 * app does not fall back to speech synthesis for Arabic, so a bad guess here is
 * visible and harmless rather than misleading.
 */
const ISLAMCAN_BASE_URL = "https://islamcan.com/learn-arabic/audio";
const ISLAMCAN_EXTENSION = "mp3";

/** Our slug → their filename, for any letter whose name differs from our slug. */
const FILE_NAME_OVERRIDES: Partial<Record<string, string>> = {
  // e.g. hha: "haa", tta: "taa2",
};

export const ISLAMCAN_PLACEHOLDER: LetterAudioSource = {
  id: "islamcan-placeholder",
  label: "islamcan.com (placeholder)",
  isPlaceholder: true,
  attribution: "islamcan.com",
  url(slug, harakat) {
    // The alphabet page teaches letters, not vowelled forms. Rather than point
    // all three harakat buttons at the bare-letter file — which would play "baa"
    // when a learner asks for "bi" and teach the wrong sound — this source
    // reports it has nothing, and the UI says so.
    if (harakat) return null;
    const name = FILE_NAME_OVERRIDES[slug] ?? slug;
    return `${ISLAMCAN_BASE_URL}/${name}.${ISLAMCAN_EXTENSION}`;
  },
};

export const LETTER_AUDIO_SOURCES = [HAFIZ_RECORDINGS, ISLAMCAN_PLACEHOLDER];

// ─── THE SWITCH ────────────────────────────────────────────────────────────
// Change this single line to HAFIZ_RECORDINGS once the recordings land.
export const ACTIVE_LETTER_AUDIO_SOURCE: LetterAudioSource = ISLAMCAN_PLACEHOLDER;
