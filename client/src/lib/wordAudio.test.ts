/**
 * Which recording, if any, is the right one to play for a word.
 *
 * The failures that matter here are not "no audio" — that is a fine outcome the
 * lesson handles by offering the ayah. They are playing the *wrong* word: a
 * recording from the previous ayah, a position the ayah has no room for, or a
 * source whose numbering has drifted from the canonical text. Each of those
 * must resolve to null rather than to a URL.
 */
import { describe, expect, it } from "vitest";
import { findWordAudio, type WordAudioLookup } from "./wordAudio";
import type { WordAudioSource } from "@shared/quran";

/** Al-Fatiha 1:2, and the word-by-word recordings Quran.com serves for it. */
const AYAH_WORDS = ["ٱلْحَمْدُ", "لِلَّهِ", "رَبِّ", "ٱلْعَـٰلَمِينَ"];
const RECORDINGS = AYAH_WORDS.map((arabic, index) => ({
  position: index + 1,
  arabic,
  url: `https://verses.quran.com/wbw/001_002_00${index + 1}.mp3`,
}));

const SOURCE: WordAudioSource = {
  provider: "quran.com",
  kind: "word-file",
  reciterName: null,
  matchesSelectedReciter: false,
};

const lookup = (patch: Partial<WordAudioLookup> = {}): WordAudioLookup => ({
  surah: 1,
  ayah: 2,
  ayahWords: AYAH_WORDS,
  wordAudio: RECORDINGS,
  source: SOURCE,
  ...patch,
});

const target = (patch: Partial<Parameters<typeof findWordAudio>[0]> = {}) => ({
  surah: 1,
  ayah: 2,
  wordIndex: 3,
  arabic: "رَبِّ",
  ...patch,
});

describe("a trustworthy recording is found", () => {
  it("returns the file for that exact word", () => {
    const reference = findWordAudio(target(), lookup())!;
    expect(reference.url).toBe("https://verses.quran.com/wbw/001_002_003.mp3");
    expect(reference.wordIndex).toBe(3);
  });

  it("carries the canonical word, not the source's copy of it", () => {
    // The word a learner reads and the word the lesson addresses come from the
    // ayah data the app already renders, in one place.
    const reference = findWordAudio(target(), lookup({
      wordAudio: RECORDINGS.map((word, index) => (index === 2 ? { ...word, arabic: "رب" } : word)),
    }))!;
    expect(reference.arabic).toBe("رَبِّ");
  });

  it("reports whose recitation it is", () => {
    const reference = findWordAudio(target(), lookup())!;
    // Quran.com's word audio is one set with no reciter parameter, so it is not
    // the reciter chosen for the ayah — and the interface says so.
    expect(reference.matchesSelectedReciter).toBe(false);
    expect(reference.reciterName).toBeNull();
  });

  it("accepts a spelling that differs only in harakat or which alif is written", () => {
    const reference = findWordAudio(target({ wordIndex: 1, arabic: "الحمد" }), lookup())!;
    expect(reference.url).toContain("001_002_001.mp3");
    expect(reference.arabic).toBe("ٱلْحَمْدُ");
  });
});

describe("nothing is offered when there is nothing trustworthy", () => {
  it("returns null when the source served no recordings", () => {
    expect(findWordAudio(target(), lookup({ wordAudio: [], source: null }))).toBeNull();
    expect(findWordAudio(target(), lookup({ source: null }))).toBeNull();
  });

  it("returns null for a recording of another ayah", () => {
    // The stale-target rule, applied to audio: a recording of 1:2's third word
    // played over 1:3 is a different word entirely.
    expect(findWordAudio(target({ ayah: 3 }), lookup())).toBeNull();
    expect(findWordAudio(target(), lookup({ ayah: 3 }))).toBeNull();
  });

  it("returns null for a recording of another surah", () => {
    expect(findWordAudio(target({ surah: 2 }), lookup())).toBeNull();
  });

  it("refuses a position the ayah has no room for", () => {
    for (const wordIndex of [0, -1, 5, 1.5]) {
      expect(findWordAudio(target({ wordIndex }), lookup()), String(wordIndex)).toBeNull();
    }
  });

  it("refuses a position the source served no recording for", () => {
    expect(findWordAudio(target(), lookup({ wordAudio: RECORDINGS.filter((word) => word.position !== 3) }))).toBeNull();
  });

  it("refuses a recording whose own word is not the word at that position", () => {
    // A source that renumbers or reorders cannot make the app play the wrong
    // word: the recording's text, the ayah's word and the target must agree.
    const shifted = RECORDINGS.map((word, index) => ({ ...word, arabic: AYAH_WORDS[(index + 1) % AYAH_WORDS.length] }));
    expect(findWordAudio(target(), lookup({ wordAudio: shifted }))).toBeNull();
  });

  it("refuses when the target is not the word standing at that position", () => {
    expect(findWordAudio(target({ arabic: "ٱلْعَـٰلَمِينَ" }), lookup())).toBeNull();
  });

  it("refuses while the ayah text has not arrived", () => {
    expect(findWordAudio(target(), lookup({ ayahWords: [] }))).toBeNull();
  });

  it("refuses a recording with no url", () => {
    const empty = RECORDINGS.map((word) => (word.position === 3 ? { ...word, url: "" } : word));
    expect(findWordAudio(target(), lookup({ wordAudio: empty }))).toBeNull();
  });
});

describe("nothing is ever generated", () => {
  it("only ever returns a url the source supplied", () => {
    const reference = findWordAudio(target(), lookup())!;
    expect(RECORDINGS.map((word) => word.url)).toContain(reference.url);
    // No synthesis endpoint, no speech API, no data: URI built here.
    expect(reference.url.startsWith("https://")).toBe(true);
    for (const fake of ["tts", "speech", "synth", "data:", "blob:"]) {
      expect(reference.url.toLowerCase(), fake).not.toContain(fake);
    }
  });
});
