import { describe, expect, it } from "vitest";
import { ARABIC_LETTERS, HARAKAT, allLetterAudioPaths, hafizLetterAudioPath } from "./arabicLetters";

describe("Arabic letter table", () => {
  it("covers all 28 letters", () => {
    expect(ARABIC_LETTERS).toHaveLength(28);
  });

  // The reason slugs are an explicit field: two pairs of letters share a display
  // name, and a collision here would play the wrong letter's recording.
  it("gives every letter a unique slug even where display names collide", () => {
    const slugs = ARABIC_LETTERS.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(28);

    const names = ARABIC_LETTERS.map((entry) => entry.name);
    expect(new Set(names).size).toBeLessThan(28);

    const slugFor = (letter: string) => ARABIC_LETTERS.find((entry) => entry.letter === letter)?.slug;
    expect(slugFor("ت")).not.toBe(slugFor("ط"));
    expect(slugFor("ح")).not.toBe(slugFor("ه"));
    expect(slugFor("س")).not.toBe(slugFor("ص"));
    expect(slugFor("د")).not.toBe(slugFor("ض"));
  });

  it("keeps slugs filename-safe", () => {
    for (const entry of ARABIC_LETTERS) expect(entry.slug).toMatch(/^[a-z]+$/);
  });

  it("has a distinct glyph for every letter", () => {
    expect(new Set(ARABIC_LETTERS.map((entry) => entry.letter)).size).toBe(28);
  });
});

describe("hafizLetterAudioPath", () => {
  // The naming the reciter records to, independent of which source is active.
  it("builds the documented paths", () => {
    expect(hafizLetterAudioPath("alif")).toBe("/audio/letters/alif.mp3");
    expect(hafizLetterAudioPath("alif", "fatha")).toBe("/audio/letters/alif-fatha.mp3");
    expect(hafizLetterAudioPath("alif", "kasra")).toBe("/audio/letters/alif-kasra.mp3");
    expect(hafizLetterAudioPath("alif", "damma")).toBe("/audio/letters/alif-damma.mp3");
  });

  it("enumerates 112 distinct recordings", () => {
    const paths = allLetterAudioPaths();
    expect(paths).toHaveLength(ARABIC_LETTERS.length * (HARAKAT.length + 1));
    expect(paths).toHaveLength(112);
    expect(new Set(paths).size).toBe(112);
  });
});
