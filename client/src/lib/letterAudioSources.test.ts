import { describe, expect, it } from "vitest";
import {
  ARABIC_LETTERS,
  HARAKAT,
  allLetterAudioPaths,
  letterAudioPath,
  letterSpeechText,
} from "./arabicLetters";
import en from "@locales/en";
import { ACTIVE_LETTER_AUDIO_SOURCE, HAFIZ_RECORDINGS, LETTER_AUDIO_SOURCES, OPENAI_TTS } from "./letterAudioSources";

describe("the local sources", () => {
  it("define a URL for every letter and every harakat", () => {
    for (const source of LETTER_AUDIO_SOURCES) {
      for (const letter of ARABIC_LETTERS) {
        expect(source.url(letter.slug), `${source.id}/${letter.slug}`).toBeTruthy();
        for (const harakat of HARAKAT) {
          expect(source.url(letter.slug, harakat.id), `${source.id}/${letter.slug}-${harakat.id}`).toBeTruthy();
        }
      }
    }
  });

  it("builds the documented paths", () => {
    expect(HAFIZ_RECORDINGS.url("alif")).toBe("/audio/letters/alif.mp3");
    expect(HAFIZ_RECORDINGS.url("alif", "fatha")).toBe("/audio/letters/alif-fatha.mp3");
  });

  /**
   * The point of the whole arrangement: a recording named alif.mp3 replaces a
   * generated alif.mp3 by being copied over it. If these two ever produced
   * different paths, the swap would become a migration.
   */
  it("agree on every path, so a recording drops in over a generated clip", () => {
    for (const letter of ARABIC_LETTERS) {
      expect(OPENAI_TTS.url(letter.slug)).toBe(HAFIZ_RECORDINGS.url(letter.slug));
      for (const harakat of HARAKAT) {
        expect(OPENAI_TTS.url(letter.slug, harakat.id)).toBe(HAFIZ_RECORDINGS.url(letter.slug, harakat.id));
      }
    }
  });

  it("gives each recording a distinct path", () => {
    const paths = ARABIC_LETTERS.flatMap((letter) => [
      OPENAI_TTS.url(letter.slug),
      ...HARAKAT.map((harakat) => OPENAI_TTS.url(letter.slug, harakat.id)),
    ]);
    expect(new Set(paths).size).toBe(112);
  });
});

describe("provenance", () => {
  it("marks the synthesised set as a placeholder and names what made it", () => {
    expect(OPENAI_TTS.isPlaceholder).toBe(true);
    expect(OPENAI_TTS.attribution).toBe("OpenAI text-to-speech");
  });

  it("does not mark the reciter's set as a placeholder", () => {
    expect(HAFIZ_RECORDINGS.isPlaceholder).toBe(false);
    expect(HAFIZ_RECORDINGS.attribution).toBeUndefined();
  });
});

describe("the active source", () => {
  it("is one of the declared sources", () => {
    expect(LETTER_AUDIO_SOURCES).toContain(ACTIVE_LETTER_AUDIO_SOURCE);
  });

  it("is what letterAudioPath resolves through", () => {
    expect(letterAudioPath("alif")).toBe(ACTIVE_LETTER_AUDIO_SOURCE.url("alif"));
    expect(letterAudioPath("ba", "fatha")).toBe(ACTIVE_LETTER_AUDIO_SOURCE.url("ba", "fatha"));
  });

  /**
   * The hand-off list is what the reciter records to. It must describe our own
   * set whichever source happens to be switched on, or switching sources would
   * quietly shrink the order.
   */
  it("does not change the reciter's hand-off list", () => {
    const paths = allLetterAudioPaths();
    expect(paths).toHaveLength(112);
    expect(paths.every((path) => path.startsWith("/audio/letters/"))).toBe(true);
  });
});

/**
 * What gets sent to the speech API. The reason the app stopped using browser
 * speech synthesis was that an English voice handed "Taa" says "Te AA"; sending
 * Latin text to any voice reproduces exactly that bug, so none of this text may
 * contain any.
 */
describe("the text a voice is given", () => {
  it("is Arabic script only — never a transliteration", () => {
    for (const letter of ARABIC_LETTERS) {
      expect(letterSpeechText(letter), letter.slug).toMatch(/^[؀-ۿ\s]+$/);
      for (const harakat of HARAKAT) {
        expect(letterSpeechText(letter, harakat.id), `${letter.slug}-${harakat.id}`).toMatch(/^[؀-ۿ\s]+$/);
      }
    }
  });

  it("says the letter's name when the letter stands alone", () => {
    const alif = ARABIC_LETTERS.find((letter) => letter.slug === "alif")!;
    const ba = ARABIC_LETTERS.find((letter) => letter.slug === "ba")!;
    expect(letterSpeechText(alif)).toBe("أَلِف");
    expect(letterSpeechText(ba)).toBe("بَاء");
  });

  /**
   * The Fatha control is asking for the sound *ba*, not for the word "bāʾ", so
   * the vowelled forms send the glyph carrying the mark rather than the name.
   */
  it("says the letter carrying the vowel for a harakat form", () => {
    const ba = ARABIC_LETTERS.find((letter) => letter.slug === "ba")!;
    expect(letterSpeechText(ba, "fatha")).toBe("بَ");
    expect(letterSpeechText(ba, "kasra")).toBe("بِ");
    expect(letterSpeechText(ba, "damma")).toBe("بُ");
  });

  it("gives every one of the 112 clips its own text", () => {
    const texts = ARABIC_LETTERS.flatMap((letter) => [
      letterSpeechText(letter),
      ...HARAKAT.map((harakat) => letterSpeechText(letter, harakat.id)),
    ]);
    expect(new Set(texts).size).toBe(112);
  });

  it("gives every letter a distinct name", () => {
    expect(new Set(ARABIC_LETTERS.map((letter) => letter.arabicName)).size).toBe(28);
  });

  /** A name written without its vowels is read less reliably by a voice. */
  it("vowels every letter name", () => {
    const marks = /[ً-ْ]/;
    for (const letter of ARABIC_LETTERS) {
      expect(marks.test(letter.arabicName), `${letter.slug}: ${letter.arabicName}`).toBe(true);
    }
  });
});

/**
 * A synthesised voice must not be described to the learner as a reciter's.
 * Home.tsx picks the wording from `isPlaceholder`; these are the strings it
 * chooses between.
 */
describe("how a synthesised voice is described", () => {
  it("has its own wording for idle, playing and missing", () => {
    const keys = [
      "starter.audioIdlePlaceholder",
      "starter.audioPlayingPlaceholder",
      "starter.audioUnavailablePlaceholder",
    ] as const;
    for (const key of keys) {
      expect(en.strings[key], key).toBeTruthy();
      // Each one has to disclose what the learner is hearing, not just exist.
      expect(en.strings[key], key).toMatch(/synthesised|synthetic|generated|not a reciter/i);
    }
  });

  it("says plainly that the voice is synthesised", () => {
    expect(en.strings["starter.audioPlayingPlaceholder"]).toMatch(/synthesised|synthetic|generated/i);
  });

  it("credits what generated the audio", () => {
    expect(en.strings["starter.audioAttribution"]).toContain("{source}");
  });
});
