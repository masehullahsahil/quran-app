/**
 * Finding the recording of one Quran word.
 *
 * The focused correction lesson can put an exact word in front of a learner —
 * `رَبِّ`, word 3 of Al-Fatiha 1:2 — and until now the only thing it could offer
 * them to listen to was the whole ayah, slowly. Quran.com serves a word-by-word
 * recitation as one file per word, and this decides whether a given file is the
 * right one to play for a given target.
 *
 * Three rules, all of which must hold before a URL is handed back:
 *
 * 1. **The location matches.** A reference is addressed by surah, ayah and word
 *    index. A reference for another ayah is not a reference for this one — the
 *    stale-target protections the correction lesson gained apply here too, and
 *    for the same reason: a recording of 1:2's third word played over 1:3 is a
 *    different word entirely.
 * 2. **The index exists.** Positions outside the ayah's own words are refused
 *    rather than clamped.
 * 3. **The word is the word.** The recording's own text is compared with the
 *    canonical ayah word at that position, so a source that renumbers or
 *    reorders cannot make the app play the wrong word. The comparison folds
 *    harakat and alif spellings; nothing is rewritten.
 *
 * Nothing here synthesises anything. If no recording survives these rules the
 * answer is null, and the lesson falls back to the reciter's ayah — which is
 * what the learner already had.
 */
import type { WordAudio, WordAudioSource } from "@shared/quran";
import { sameQuranWord } from "./quranWordMatch";

export type WordAudioTarget = {
  surah: number;
  ayah: number;
  /** 1-based, as the decision names it. */
  wordIndex: number;
  /** The canonical word, from the ayah data the app already renders. */
  arabic: string;
};

export type WordAudioLookup = {
  /** The ayah the recordings below belong to. */
  surah: number;
  ayah: number;
  /** The words of that ayah, from the canonical text. */
  ayahWords: readonly string[];
  /** The recordings served for that ayah. Empty when the source served none. */
  wordAudio: readonly WordAudio[];
  /** What those recordings are. Null when the source served none. */
  source: WordAudioSource | null;
};

export type WordAudioReference = {
  /** The file to play. One word, not a segment of a longer recording. */
  url: string;
  /** The word it is a recording of, as the canonical ayah gives it. */
  arabic: string;
  wordIndex: number;
  /**
   * Whether this is the reciter selected for the ayah.
   *
   * Quran.com's word audio is one recitation set with no reciter parameter, so
   * this is false there — and the interface says so rather than letting a
   * learner assume the two voices are the same person.
   */
  matchesSelectedReciter: boolean;
  /** The reciter's name when the source gives one, which Quran.com does not. */
  reciterName: string | null;
};

/**
 * The recording for one target, or null when there is not a trustworthy one.
 *
 * Null is a perfectly good answer and the common one: most ayahs will have no
 * word recordings at all if the source stops serving them, and the lesson is
 * built to fall back honestly.
 */
export function findWordAudio(target: WordAudioTarget, lookup: WordAudioLookup): WordAudioReference | null {
  if (!lookup.source || lookup.wordAudio.length === 0) return null;
  // Rule 1: a recording for another ayah is a recording of another word.
  if (target.surah !== lookup.surah || target.ayah !== lookup.ayah) return null;

  // Rule 2: the position has to exist in the ayah and in the recordings alike.
  const { wordIndex } = target;
  if (!Number.isInteger(wordIndex) || wordIndex < 1) return null;
  if (wordIndex > lookup.ayahWords.length) return null;

  const canonical = lookup.ayahWords[wordIndex - 1];
  const recording = lookup.wordAudio.find((word) => word.position === wordIndex);
  if (!recording || !recording.url) return null;

  // Rule 3: the recording's own word, the ayah's word at that position, and the
  // word the correction is about all have to be the same word.
  if (!sameQuranWord(canonical, target.arabic)) return null;
  if (!sameQuranWord(canonical, recording.arabic)) return null;

  return {
    url: recording.url,
    // The canonical text, never the source's copy of it: what a learner sees
    // and what the lesson addresses come from one place.
    arabic: canonical,
    wordIndex,
    matchesSelectedReciter: lookup.source.matchesSelectedReciter,
    reciterName: lookup.source.reciterName,
  };
}
