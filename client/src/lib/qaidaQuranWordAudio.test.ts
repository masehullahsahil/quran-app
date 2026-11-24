import { describe, expect, it } from "vitest";
import type { SurahContent } from "@shared/quran";
import { quranWord, teaching } from "@shared/qaidaExercises";
import { qaidaQuranWordAudio, quranWordLocation } from "./qaidaQuranWordAudio";

const SOURCE: NonNullable<SurahContent["wordAudioSource"]> = { provider: "quran.com", kind: "word-file", reciterName: null, matchesSelectedReciter: false };

function surah112(withAudio = true): SurahContent {
  const words = ["قُلْ", "هُوَ", "ٱللَّهُ", "أَحَدٌ"];
  return {
    surah: { number: 112, nameSimple: "Al-Ikhlas", nameArabic: "الإخلاص", translatedName: "Sincerity", versesCount: 4 } as SurahContent["surah"],
    reciterId: 7,
    translationId: 131,
    wordAudioSource: withAudio ? SOURCE : null,
    ayahs: [{
      number: 1,
      verseKey: "112:1",
      arabic: words.join(" "),
      translation: null,
      transliteration: null,
      audioUrl: null,
      wordAudio: withAudio ? words.map((arabic, i) => ({ position: i + 1, arabic, url: `https://audio.qurancdn.com/wbw/112_001_00${i + 1}.mp3` })) : [],
    }],
  };
}

describe("qaidaQuranWordAudio", () => {
  it("finds the recording of a quoted word by matching it in its ayah", () => {
    const ref = qaidaQuranWordAudio(quranWord("أَحَدٌ", "ahadun", "112:1"), surah112());
    expect(ref?.url).toBe("https://audio.qurancdn.com/wbw/112_001_004.mp3");
    expect(ref?.wordIndex).toBe(4);
  });

  it("matches across spelling differences the comparison folds (hamzat al-wasl, marks)", () => {
    const ref = qaidaQuranWordAudio(quranWord("قُلْ", "qul", "112:1"), surah112());
    expect(ref?.wordIndex).toBe(1);
  });

  it("answers null for teaching text, phrases, other surahs and missing words", () => {
    expect(qaidaQuranWordAudio(teaching("بَتَثَ", "ba-ta-tha"), surah112())).toBeNull();
    expect(qaidaQuranWordAudio(quranWord("قُلْ هُوَ", "qul huwa", "112:1"), surah112())).toBeNull();
    expect(qaidaQuranWordAudio(quranWord("قُلْ", "qul", "113:1"), surah112())).toBeNull();
    expect(qaidaQuranWordAudio(quranWord("رَبِّ", "rabbi", "112:1"), surah112())).toBeNull();
    expect(qaidaQuranWordAudio(quranWord("قُلْ", "qul", "112:1"), undefined)).toBeNull();
  });

  it("answers null when the source served no word recordings", () => {
    expect(qaidaQuranWordAudio(quranWord("قُلْ", "qul", "112:1"), surah112(false))).toBeNull();
  });

  it("only locates single quoted words with a valid reference", () => {
    expect(quranWordLocation(quranWord("الٓمٓ", "alif laam meem", "2:1"))).toEqual({ surah: 2, ayah: 1 });
    expect(quranWordLocation(quranWord("بِسْمِ اللَّهِ", "bismillah", "1:1"))).toBeNull();
    expect(quranWordLocation(teaching("بَ", "ba"))).toBeNull();
  });
});
