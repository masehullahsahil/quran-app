/**
 * Deciding whether two spellings are the same Quranic word.
 *
 * Three places need this and none of them may rewrite anything: the correction
 * lesson checking that a retained target still describes the ayah on screen,
 * and the word-audio resolver checking that the recording it is about to play
 * is the word it means to play.
 *
 * **It compares; it never rewrites.** Both arguments are folded, compared and
 * thrown away. Every Quranic word on screen is rendered exactly as the content
 * gives it, with its harakat, and every recording is addressed by its own URL.
 *
 * The folding exists because the same word legitimately reaches us spelled two
 * ways: the reviewer's `expectedArabic`, the ayah's `text_uthmani`, and the
 * word-by-word payload can differ in harakat and in which alif is written —
 * `اللَّهُ` against `ٱللَّهُ` is one word in one place. Treating those as different
 * would hide a correction, or refuse a recording, that is perfectly valid.
 *
 * The rules mirror the equivalences in `server/recitation.ts`, which belongs to
 * the server and is deliberately not imported into the browser bundle. Drift
 * between the two can only change whether something is *offered*, never what is
 * shown or spoken.
 */

/** Marks and joiners that distinguish two spellings of the same word. */
const COMPARISON_NOISE = /[ؐ-ًؚ-ٟۖ-ۭـٰ‌-‏‪-‮⁦-⁩]/g;

/** The folded form used only for comparison. Never rendered, never stored. */
export function foldQuranWord(word: string): string {
  return word
    .normalize("NFKC")
    .replace(COMPARISON_NOISE, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim();
}

export function sameQuranWord(left: string, right: string): boolean {
  const folded = foldQuranWord(left);
  return folded.length > 0 && folded === foldQuranWord(right);
}
