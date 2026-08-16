/**
 * Urdu — scaffold.
 *
 * This pack is deliberately empty. Every key below is commented out with its
 * English reference text alongside, so a translator can work straight down the
 * file: uncomment a line, replace the English with the Urdu, done. Nothing here
 * is machine-translated — a placeholder translation that nobody has checked is
 * worse than the English fallback, because it looks finished.
 *
 * Uncommented keys take effect immediately; everything still commented falls
 * back to English, per key. The app is usable at every point in between.
 *
 * `direction: "rtl"` is already set, so instruction text lays out right-to-left
 * as soon as the first string lands. Arabic Quranic text and the Arabic letter
 * recordings are shared across all languages and are not translated here.
 *
 * Regenerate this scaffold after the English pack gains keys:
 *   node scripts/scaffold-locale.mjs ur
 */
import type { LocaleLessons, LocaleManifest } from "../types";
import type { TranslatableStrings } from "../index";

export const manifest: LocaleManifest = {
  code: "ur",
  name: "اردو",
  englishName: "Urdu",
  direction: "rtl",
  // Spoken instruction audio in Urdu goes here. The shared Arabic letter
  // recordings stay at /audio/letters/ and are not duplicated per language.
  instructionAudioDir: "/audio/instruction/ur",
};

export const strings: TranslatableStrings = {
  // -- Shell and navigation ------------------------------------------------
  // "app.tagline":              "", // EN: Reading plan
  // "nav.sectionLabel":         "", // EN: Your place
  // "nav.today":                "", // EN: Today
  // "nav.library":              "", // EN: My library
  // "nav.bookmarks":            "", // EN: Bookmarks
  // "nav.practiceTitle":        "", // EN: Today’s practice
  // "nav.practiceCopy":         "", // EN: Listen, repeat, return.

  // -- Reader chrome -------------------------------------------------------
  // "reader.eyebrow":           "", // EN: Quran
  // "reader.surahLabel":        "", // EN: Surah
  // "reader.juzLabel":          "", // EN: Juz
  // "reader.showMeaning":       "", // EN: Show meaning
  // "reader.hideMeaning":       "", // EN: Hide meaning

  // -- Playback ------------------------------------------------------------
  // "playback.listen":          "", // EN: Listen
  // "playback.pause":           "", // EN: Pause
  // "playback.next":            "", // EN: Next
  // "playback.keepPlaying":     "", // EN: Keep playing

  // -- Mode tabs -----------------------------------------------------------
  // "mode.read":                "", // EN: Read
  // "mode.learn":               "", // EN: Learn
  // "mode.study":               "", // EN: Study
  // "mode.memorise":            "", // EN: Memorise

  // The remaining keys follow the same pattern. Run
  // `node scripts/scaffold-locale.mjs ur --full` to print every key in the
  // English pack with its reference text, ready to paste in here.
};

/**
 * Teaching text, keyed by the letter slugs in client/src/lib/arabicLetters.ts.
 * Any letter left out falls back to the English articulation note.
 *
 *   letters: {
 *     ba: { articulation: "…", tip: "…" },
 *   }
 */
export const lessons: LocaleLessons = {
  letters: {},
};

export default { manifest, strings, lessons };
