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
  /** Rough written hint at the sound. Never spoken aloud by the app. */
  sound: string;
};

export const HARAKAT: Array<{ id: Harakat; label: string; mark: string; hint: string }> = [
  { id: "fatha", label: "Fatha", mark: "َ", hint: "short a" },
  { id: "kasra", label: "Kasra", mark: "ِ", hint: "short i" },
  { id: "damma", label: "Damma", mark: "ُ", hint: "short u" },
];

export const ARABIC_LETTERS: ArabicLetter[] = [
  { letter: "ا", name: "Alif", slug: "alif", transliteration: "ʾalif", sound: "a" },
  { letter: "ب", name: "Baa", slug: "ba", transliteration: "bāʾ", sound: "b" },
  { letter: "ت", name: "Taa", slug: "ta", transliteration: "tāʾ", sound: "t" },
  { letter: "ث", name: "Thaa", slug: "tha", transliteration: "thāʾ", sound: "th" },
  { letter: "ج", name: "Jeem", slug: "jeem", transliteration: "jīm", sound: "j" },
  { letter: "ح", name: "Haa", slug: "hha", transliteration: "ḥāʾ", sound: "ḥ" },
  { letter: "خ", name: "Khaa", slug: "kha", transliteration: "khāʾ", sound: "kh" },
  { letter: "د", name: "Daal", slug: "dal", transliteration: "dāl", sound: "d" },
  { letter: "ذ", name: "Dhaal", slug: "dhal", transliteration: "dhāl", sound: "dh" },
  { letter: "ر", name: "Raa", slug: "ra", transliteration: "rāʾ", sound: "r" },
  { letter: "ز", name: "Zaay", slug: "zay", transliteration: "zāy", sound: "z" },
  { letter: "س", name: "Seen", slug: "seen", transliteration: "sīn", sound: "s" },
  { letter: "ش", name: "Sheen", slug: "sheen", transliteration: "shīn", sound: "sh" },
  { letter: "ص", name: "Saad", slug: "sad", transliteration: "ṣād", sound: "ṣ" },
  { letter: "ض", name: "Daad", slug: "dad", transliteration: "ḍād", sound: "ḍ" },
  { letter: "ط", name: "Taa", slug: "tta", transliteration: "ṭāʾ", sound: "ṭ" },
  { letter: "ظ", name: "Zaa", slug: "zza", transliteration: "ẓāʾ", sound: "ẓ" },
  { letter: "ع", name: "Ayn", slug: "ayn", transliteration: "ʿayn", sound: "ʿ" },
  { letter: "غ", name: "Ghayn", slug: "ghayn", transliteration: "ghayn", sound: "gh" },
  { letter: "ف", name: "Faa", slug: "fa", transliteration: "fāʾ", sound: "f" },
  { letter: "ق", name: "Qaaf", slug: "qaf", transliteration: "qāf", sound: "q" },
  { letter: "ك", name: "Kaaf", slug: "kaf", transliteration: "kāf", sound: "k" },
  { letter: "ل", name: "Laam", slug: "lam", transliteration: "lām", sound: "l" },
  { letter: "م", name: "Meem", slug: "meem", transliteration: "mīm", sound: "m" },
  { letter: "ن", name: "Noon", slug: "noon", transliteration: "nūn", sound: "n" },
  { letter: "ه", name: "Haa", slug: "ha", transliteration: "hāʾ", sound: "h" },
  { letter: "و", name: "Waaw", slug: "waw", transliteration: "wāw", sound: "w" },
  { letter: "ي", name: "Yaa", slug: "ya", transliteration: "yāʾ", sound: "y" },
];

/** Public directory the recordings are served from. */
export const LETTER_AUDIO_DIR = "/audio/letters";

/**
 * Path to a letter's recording: the letter alone, or carrying one harakat.
 *
 *   letterAudioPath("alif")          → /audio/letters/alif.mp3
 *   letterAudioPath("alif", "fatha") → /audio/letters/alif-fatha.mp3
 */
export function letterAudioPath(slug: string, harakat?: Harakat): string {
  return `${LETTER_AUDIO_DIR}/${harakat ? `${slug}-${harakat}` : slug}.mp3`;
}

/** Every recording the Learn section can ask for: 28 letters × (alone + 3 harakat). */
export function allLetterAudioPaths(): string[] {
  const paths: string[] = [];
  for (const letter of ARABIC_LETTERS) {
    paths.push(letterAudioPath(letter.slug));
    for (const harakat of HARAKAT) paths.push(letterAudioPath(letter.slug, harakat.id));
  }
  return paths;
}
