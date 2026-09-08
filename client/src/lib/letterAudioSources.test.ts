import { describe, expect, it } from "vitest";
import {
  ARABIC_LETTERS,
  HARAKAT,
  allLetterAudioPaths,
  letterAudioPath,
  letterSpeechText,
} from "./arabicLetters";
import en from "@locales/en";
import {
  ACTIVE_LETTER_AUDIO_SOURCE,
  APPROVED_RECORDINGS,
  HAFIZ_RECORDINGS,
  LETTER_AUDIO_SOURCES,
  OPENAI_TTS,
} from "./letterAudioSources";
import { approvedAudioPath, letterTargetId, PLACEHOLDER_LETTER_AUDIO } from "@shared/qaidaAudioManifest";

describe("the file-layout sources", () => {
  it("define a URL for every letter and every harakat", () => {
    // The two sources that describe a *file layout* — the naming a reciter
    // delivers to, and the generated clips sitting at those names.
    for (const source of [HAFIZ_RECORDINGS, OPENAI_TTS]) {
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

  it("is the approval ledger, and is not the synthesised set", () => {
    // The whole point: what a learner hears is decided by whether a qualified
    // teacher approved a recording, not by whether a file happens to exist.
    expect(ACTIVE_LETTER_AUDIO_SOURCE).toBe(APPROVED_RECORDINGS);
    expect(ACTIVE_LETTER_AUDIO_SOURCE.isPlaceholder).toBe(false);
    expect(ACTIVE_LETTER_AUDIO_SOURCE.id).not.toBe(OPENAI_TTS.id);
  });

  it("offers nothing while no recording has been approved", () => {
    // The ledger is empty today, so every letter and every vowelled form is
    // unavailable — and the interface says so instead of playing a machine
    // voice reading Quranic Arabic.
    for (const letter of ARABIC_LETTERS) {
      expect(letterAudioPath(letter.slug), letter.slug).toBeNull();
      for (const harakat of HARAKAT) {
        expect(letterAudioPath(letter.slug, harakat.id), `${letter.slug}-${harakat.id}`).toBeNull();
      }
    }
  });

  it("never resolves to the synthesised directory", () => {
    // Belt and braces: even if a path were somehow produced, it may not be one
    // of the generated clips.
    for (const letter of ARABIC_LETTERS) {
      const path = letterAudioPath(letter.slug);
      if (path) expect(path.startsWith(PLACEHOLDER_LETTER_AUDIO.directory), letter.slug).toBe(false);
    }
  });

  it("plays a letter the moment its recording is approved", () => {
    const approved = [{
      targetId: letterTargetId("ba"),
      audioPath: "/audio/qaida/letters/ba.mp3",
      status: "approved" as const,
      provenance: { speaker: "A. Teacher", qualification: "ijazah in hafs", source: "studio session", recordedOn: "2026-01-01" },
      review: { reviewer: "B. Reviewer", qualification: "qualified teacher", reviewedOn: "2026-01-02", verdict: "correct" },
    }];
    expect(approvedAudioPath(letterTargetId("ba"), approved)).toBe("/audio/qaida/letters/ba.mp3");
    // And its neighbours stay silent, because nobody approved those.
    expect(approvedAudioPath(letterTargetId("ta"), approved)).toBeNull();
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
 * The wording that exists for a synthesised voice.
 *
 * These strings are no longer reachable in production — nothing synthesised is
 * served — but they are kept, and kept honest, because a developer who switches
 * to the generated set locally must still see it described as what it is.
 */
describe("how a synthesised voice is described", () => {
  it("has its own wording for idle, playing and missing", () => {
    const keys = [
      "qaida.audioIdlePlaceholder",
      "qaida.audioPlayingPlaceholder",
      "qaida.audioUnavailablePlaceholder",
    ] as const;
    for (const key of keys) {
      expect(en.strings[key], key).toBeTruthy();
      // Each one has to disclose what the learner is hearing, not just exist.
      expect(en.strings[key], key).toMatch(/synthesised|synthetic|generated|not a reciter/i);
    }
  });

  it("says plainly that the voice is synthesised", () => {
    expect(en.strings["qaida.audioPlayingPlaceholder"]).toMatch(/synthesised|synthetic|generated/i);
  });

  it("credits what generated the audio", () => {
    expect(en.strings["qaida.audioAttribution"]).toContain("{source}");
  });
});
