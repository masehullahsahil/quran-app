/**
 * The 28 Arabic letters, with the slugs used to name their recordings.
 *
 * Why slugs are spelled out rather than derived from `name`: the display names
 * collide. Both ت and ط are commonly written "Taa", and both ح and ه are
 * written "Haa". Deriving a filename from the display name would give two
 * letters the same recording — the emphatic ط would play the plain ت. The slug
 * is therefore an explicit, unique field, and the confusable pairs are:
 *
 *   ت ta   vs ط tta   (plain vs emphatic)
 *   س seen vs ص sad   (plain vs emphatic)
 *   د dal  vs ض dad   (plain vs emphatic)
 *   ز zay  vs ظ zza   (plain vs emphatic) and ذ dhal
 *   ح hha  vs ه ha    (deep vs soft)
 *
 * `sound` is a written articulation hint shown next to the letter. It is not a
 * pronunciation guide to be spoken by a speech synthesiser: several of these
 * letters have no English phoneme, so the app plays a reciter's recording or
 * nothing at all.
 */

import { ACTIVE_LETTER_AUDIO_SOURCE, HAFIZ_RECORDINGS } from "./letterAudioSources";

export type Harakat = "fatha" | "kasra" | "damma";

export type ArabicLetter = {
  /** The isolated glyph. */
  letter: string;
  /** Display name in the UI. Not unique — see `slug`. */
  name: string;
  /** Unique, filename-safe identifier. */
  slug: string;
  /** Academic transliteration, for the reciter's recording list. */
  transliteration: string;
  /**
   * The letter's name written in Arabic, vowelled — أَلِف, بَاء, تَاء.
   *
   * This is the text sent to a speech engine when audio is generated, and it
   * is why the generated audio says the letter rather than mangling a
   * transliteration: a voice handed "Alif" reads English spelling and produces
   * something that is not the letter. See scripts/generate-letter-audio.mjs.
   */
  arabicName: string;
  /** Rough written hint at the sound. Never spoken aloud by the app. */
  sound: string;
};

export const HARAKAT: Array<{ id: Harakat; label: string; mark: string; hint: string }> = [
  { id: "fatha", label: "Fatha", mark: "َ", hint: "short a" },
  { id: "kasra", label: "Kasra", mark: "ِ", hint: "short i" },
  { id: "damma", label: "Damma", mark: "ُ", hint: "short u" },
];

export const ARABIC_LETTERS: ArabicLetter[] = [
  { letter: "ا", name: "Alif", slug: "alif", transliteration: "ʾalif", sound: "a", arabicName: "أَلِف" },
  { letter: "ب", name: "Baa", slug: "ba", transliteration: "bāʾ", sound: "b", arabicName: "بَاء" },
  { letter: "ت", name: "Taa", slug: "ta", transliteration: "tāʾ", sound: "t", arabicName: "تَاء" },
  { letter: "ث", name: "Thaa", slug: "tha", transliteration: "thāʾ", sound: "th", arabicName: "ثَاء" },
  { letter: "ج", name: "Jeem", slug: "jeem", transliteration: "jīm", sound: "j", arabicName: "جِيم" },
  { letter: "ح", name: "Haa", slug: "hha", transliteration: "ḥāʾ", sound: "ḥ", arabicName: "حَاء" },
  { letter: "خ", name: "Khaa", slug: "kha", transliteration: "khāʾ", sound: "kh", arabicName: "خَاء" },
  { letter: "د", name: "Daal", slug: "dal", transliteration: "dāl", sound: "d", arabicName: "دَال" },
  { letter: "ذ", name: "Dhaal", slug: "dhal", transliteration: "dhāl", sound: "dh", arabicName: "ذَال" },
  { letter: "ر", name: "Raa", slug: "ra", transliteration: "rāʾ", sound: "r", arabicName: "رَاء" },
  { letter: "ز", name: "Zaay", slug: "zay", transliteration: "zāy", sound: "z", arabicName: "زَاي" },
  { letter: "س", name: "Seen", slug: "seen", transliteration: "sīn", sound: "s", arabicName: "سِين" },
  { letter: "ش", name: "Sheen", slug: "sheen", transliteration: "shīn", sound: "sh", arabicName: "شِين" },
  { letter: "ص", name: "Saad", slug: "sad", transliteration: "ṣād", sound: "ṣ", arabicName: "صَاد" },
  { letter: "ض", name: "Daad", slug: "dad", transliteration: "ḍād", sound: "ḍ", arabicName: "ضَاد" },
  { letter: "ط", name: "Taa", slug: "tta", transliteration: "ṭāʾ", sound: "ṭ", arabicName: "طَاء" },
  { letter: "ظ", name: "Zaa", slug: "zza", transliteration: "ẓāʾ", sound: "ẓ", arabicName: "ظَاء" },
  { letter: "ع", name: "Ayn", slug: "ayn", transliteration: "ʿayn", sound: "ʿ", arabicName: "عَيْن" },
  { letter: "غ", name: "Ghayn", slug: "ghayn", transliteration: "ghayn", sound: "gh", arabicName: "غَيْن" },
  { letter: "ف", name: "Faa", slug: "fa", transliteration: "fāʾ", sound: "f", arabicName: "فَاء" },
  { letter: "ق", name: "Qaaf", slug: "qaf", transliteration: "qāf", sound: "q", arabicName: "قَاف" },
  { letter: "ك", name: "Kaaf", slug: "kaf", transliteration: "kāf", sound: "k", arabicName: "كَاف" },
  { letter: "ل", name: "Laam", slug: "lam", transliteration: "lām", sound: "l", arabicName: "لَام" },
  { letter: "م", name: "Meem", slug: "meem", transliteration: "mīm", sound: "m", arabicName: "مِيم" },
  { letter: "ن", name: "Noon", slug: "noon", transliteration: "nūn", sound: "n", arabicName: "نُون" },
  { letter: "ه", name: "Haa", slug: "ha", transliteration: "hāʾ", sound: "h", arabicName: "هَاء" },
  { letter: "و", name: "Waaw", slug: "waw", transliteration: "wāw", sound: "w", arabicName: "وَاو" },
  { letter: "ي", name: "Yaa", slug: "ya", transliteration: "yāʾ", sound: "y", arabicName: "يَاء" },
];

/**
 * The Arabic text a speech engine is given for one recording.
 *
 *   letterSpeechText(alif)          → أَلِف   (the letter's name)
 *   letterSpeechText(ba, "fatha")   → بَ      (the letter carrying the vowel)
 *
 * The vowelled forms are the glyph, not the name, because that is what the
 * lesson teaches: the Fatha control is asking for the sound *ba*, not for the
 * word "bāʾ". Live here rather than in the generator so the app, the generator
 * and the tests cannot drift apart about what a given file contains.
 */
export function letterSpeechText(letter: ArabicLetter, harakat?: Harakat): string {
  if (!harakat) return letter.arabicName;
  const mark = HARAKAT.find((entry) => entry.id === harakat)?.mark ?? "";
  return `${letter.letter}${mark}`;
}

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
