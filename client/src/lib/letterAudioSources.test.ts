import { describe, expect, it } from "vitest";
import { ARABIC_LETTERS, HARAKAT, allLetterAudioPaths, letterAudioPath } from "./arabicLetters";
import en from "@locales/en";
import {
  ACTIVE_LETTER_AUDIO_SOURCE,
  HAFIZ_RECORDINGS,
  ISLAMCAN_PLACEHOLDER,
  LETTER_AUDIO_SOURCES,
} from "./letterAudioSources";

describe("the hafiz source", () => {
  it("defines a URL for every letter and every harakat", () => {
    for (const letter of ARABIC_LETTERS) {
      expect(HAFIZ_RECORDINGS.url(letter.slug), letter.slug).toBeTruthy();
      for (const harakat of HARAKAT) {
        expect(HAFIZ_RECORDINGS.url(letter.slug, harakat.id), `${letter.slug}-${harakat.id}`).toBeTruthy();
      }
    }
  });

  it("is not marked placeholder", () => {
    expect(HAFIZ_RECORDINGS.isPlaceholder).toBe(false);
  });
});

describe("the islamcan placeholder", () => {
  it("is marked as placeholder and attributed", () => {
    expect(ISLAMCAN_PLACEHOLDER.isPlaceholder).toBe(true);
    expect(ISLAMCAN_PLACEHOLDER.attribution).toBe("islamcan.com");
  });

  it("serves a URL for every bare letter", () => {
    for (const letter of ARABIC_LETTERS) {
      expect(ISLAMCAN_PLACEHOLDER.url(letter.slug), letter.slug).toMatch(/^https:\/\/islamcan\.com\/.+\.mp3$/);
    }
  });

  /**
   * The alphabet page teaches letters, not vowelled forms. Pointing the harakat
   * buttons at the bare-letter file would play "baa" when a learner asks for
   * "bi" — teaching the wrong sound. Absent is the honest answer.
   */
  it("reports no recording for the vowelled forms rather than substituting one", () => {
    for (const letter of ARABIC_LETTERS) {
      for (const harakat of HARAKAT) {
        expect(ISLAMCAN_PLACEHOLDER.url(letter.slug, harakat.id), `${letter.slug}-${harakat.id}`).toBeNull();
      }
    }
  });

  it("gives each letter a distinct URL", () => {
    const urls = ARABIC_LETTERS.map((letter) => ISLAMCAN_PLACEHOLDER.url(letter.slug));
    expect(new Set(urls).size).toBe(ARABIC_LETTERS.length);
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
   * set whichever source happens to be switched on, or turning the placeholder
   * on would quietly shrink the order to 28 files.
   */
  it("does not change the reciter's hand-off list", () => {
    const paths = allLetterAudioPaths();
    expect(paths).toHaveLength(112);
    expect(paths.every((path) => path.startsWith("/audio/letters/"))).toBe(true);
  });
});

/**
 * A stand-in recording must not be described to the learner as the reciter's.
 * Home.tsx picks the wording from `isPlaceholder`; these are the two strings it
 * chooses between, so neither may go missing or start crediting a reciter.
 */
describe("how a placeholder is described to the learner", () => {
  it("keeps a placeholder-specific wording for both idle and playing", () => {
    const keys = [
      "starter.audioIdlePlaceholder",
      "starter.audioPlayingPlaceholder",
      "starter.audioUnavailablePlaceholder",
    ] as const;
    for (const key of keys) {
      expect(en.strings[key], key).toBeTruthy();
      expect(en.strings[key], key).not.toMatch(/reciter’s recording/);
    }
  });

  it("says plainly that the recording is temporary", () => {
    expect(en.strings["starter.audioPlayingPlaceholder"]).toMatch(/temporary|stand-in|placeholder/i);
  });

  it("credits the host the borrowed audio comes from", () => {
    expect(ISLAMCAN_PLACEHOLDER.attribution).toBeTruthy();
    expect(en.strings["starter.audioAttribution"]).toContain("{source}");
  });
});
