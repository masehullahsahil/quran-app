/**
 * Guards the generator against the app.
 *
 * scripts/letterTable.mjs re-derives the letter table and the speech text for
 * plain node, because the generator cannot import TypeScript. Two copies of the
 * same knowledge is exactly the arrangement that drifts: the app would request
 * bi and the generated clip would say bāʾ, and nothing would fail loudly. This
 * test is what makes that drift a red build.
 */
import { describe, expect, it } from "vitest";
import { ARABIC_LETTERS, HARAKAT, allLetterAudioPaths, letterSpeechText } from "./arabicLetters";
import { everyRecording, readLetters, speechText } from "../../../scripts/letterTable.mjs";

describe("scripts/letterTable.mjs", () => {
  it("reads the same 28 letters as the app", () => {
    const parsed = readLetters();
    expect(parsed).toHaveLength(ARABIC_LETTERS.length);
    for (const [index, letter] of ARABIC_LETTERS.entries()) {
      expect(parsed[index].slug, letter.slug).toBe(letter.slug);
      expect(parsed[index].letter, letter.slug).toBe(letter.letter);
      expect(parsed[index].arabicName, letter.slug).toBe(letter.arabicName);
    }
  });

  it("produces the same text the app would send for all 112 clips", () => {
    const recordings = everyRecording();
    expect(recordings).toHaveLength(112);
    for (const recording of recordings) {
      const letter = ARABIC_LETTERS.find((entry) => entry.slug === recording.slug)!;
      expect(speechText(recording.letter, recording.harakat), recording.file).toBe(
        letterSpeechText(letter, recording.harakat?.id),
      );
    }
  });

  it("names the files the app asks for", () => {
    const expected = allLetterAudioPaths().map((audioPath) => audioPath.split("/").pop());
    expect(everyRecording().map((recording) => recording.file)).toEqual(expected);
  });

  it("carries the same harakat marks", () => {
    const [, ...rest] = everyRecording();
    const marks = rest.slice(0, 3).map((recording) => recording.harakat.mark);
    expect(marks).toEqual(HARAKAT.map((harakat) => harakat.mark));
  });
});
