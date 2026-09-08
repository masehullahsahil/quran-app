/**
 * The letters, and where their recordings live.
 *
 * The letter table itself is `shared/arabicLetters.ts` — plain data the Qaida
 * audio manifest also reads — and is re-exported here so callers in the client
 * keep one import. What is local to this file is playback: which path a
 * recording has, and whether the active source will serve it.
 */
import { ACTIVE_LETTER_AUDIO_SOURCE, HAFIZ_RECORDINGS } from "./letterAudioSources";
import { ARABIC_LETTERS, HARAKAT, type ArabicLetter, type Harakat } from "@shared/arabicLetters";

export { ARABIC_LETTERS, HARAKAT, letterSpeechText } from "@shared/arabicLetters";
export type { ArabicLetter, Harakat } from "@shared/arabicLetters";

/** Public directory our own recordings are served from. */
export { LETTER_AUDIO_DIR } from "./letterAudioSources";

/**
 * URL for a letter's recording from whichever source is currently active, or
 * null when that source has no file for it.
 *
 * The source is chosen in letterAudioSources.ts. While the placeholder set is
 * active this returns islamcan.com URLs for bare letters and null for the
 * harakat forms, which that source does not carry.
 */
export function letterAudioPath(slug: string, harakat?: Harakat): string | null {
  return ACTIVE_LETTER_AUDIO_SOURCE.url(slug, harakat);
}

/**
 * Path to a letter's recording in *our own* set, regardless of which source is
 * active — the naming the reciter is recording to.
 *
 *   hafizLetterAudioPath("alif")          → /audio/letters/alif.mp3
 *   hafizLetterAudioPath("alif", "fatha") → /audio/letters/alif-fatha.mp3
 */
export function hafizLetterAudioPath(slug: string, harakat?: Harakat): string {
  // Never null for this source: it defines a path for every letter and harakat.
  return HAFIZ_RECORDINGS.url(slug, harakat) as string;
}

/**
 * Every recording the reciter is asked to deliver: 28 letters × (alone + 3
 * harakat). Deliberately tied to our own set rather than the active source —
 * the hand-off list must not shrink because a placeholder is switched on.
 */
export function allLetterAudioPaths(): string[] {
  const paths: string[] = [];
  for (const letter of ARABIC_LETTERS) {
    paths.push(hafizLetterAudioPath(letter.slug));
    for (const harakat of HARAKAT) paths.push(hafizLetterAudioPath(letter.slug, harakat.id));
  }
  return paths;
}
