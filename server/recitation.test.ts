import { describe, expect, it } from "vitest";
import {
  assessRecitationTranscript,
  hasArabicScript,
  normaliseArabicToken,
} from "./recitation";

describe("normaliseArabicToken", () => {
  it.each([
    ["ٱلْحَمْدُ", "الحمد"],
    ["إِيَّاكَ", "اياك"],
    ["آمَنَ", "امن"],
    ["هُدَى", "هدي"],
    ["الـحمد،", "الحمد"],
  ])("normalises supported Arabic variants in %s", (variant, plain) => {
    expect(normaliseArabicToken(variant)).toBe(normaliseArabicToken(plain));
  });
});

describe("hasArabicScript", () => {
  it("distinguishes Arabic transcript text from an unusable English translation", () => {
    expect(hasArabicScript("بِسْمِ اللَّهِ")).toBe(true);
    expect(hasArabicScript("In the name of Allah")).toBe(false);
    expect(hasArabicScript("")).toBe(false);
  });
});

describe("assessRecitationTranscript", () => {
  const expected = "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ";

  it("marks a perfect recitation as fully matched", () => {
    const result = assessRecitationTranscript(
      expected,
      "الحمد لله رب العالمين"
    );

    expect(result.expectedWords).toEqual([
      {
        expected: "الْحَمْدُ",
        heard: "الحمد",
        status: "matched",
        wordIndex: 1,
      },
      { expected: "لِلَّهِ", heard: "لله", status: "matched", wordIndex: 2 },
      { expected: "رَبِّ", heard: "رب", status: "matched", wordIndex: 3 },
      {
        expected: "الْعَالَمِينَ",
        heard: "العالمين",
        status: "matched",
        wordIndex: 4,
      },
    ]);
    expect(result).toMatchObject({
      matchedCount: 4,
      totalWords: 4,
      score: 100,
    });
    expect(result.corrections).toHaveLength(0);
  });

  it("marks one omission at its 1-based Quran word position", () => {
    const result = assessRecitationTranscript(expected, "الحمد لله العالمين");

    expect(
      result.expectedWords.map(({ status, wordIndex }) => ({
        status,
        wordIndex,
      }))
    ).toEqual([
      { status: "matched", wordIndex: 1 },
      { status: "matched", wordIndex: 2 },
      { status: "missing", wordIndex: 3 },
      { status: "matched", wordIndex: 4 },
    ]);
    expect(result).toMatchObject({ matchedCount: 3, score: 75 });
    expect(result.fallbackNextStep).toContain("word 3");
  });

  it("aligns two consecutive omissions without cascading reviews", () => {
    const result = assessRecitationTranscript(
      "واحد اثنان ثلاثة أربعة خمسة",
      "واحد أربعة خمسة"
    );

    expect(result.expectedWords.map(({ status }) => status)).toEqual([
      "matched",
      "missing",
      "missing",
      "matched",
      "matched",
    ]);
    expect(result.expectedWords.map(({ wordIndex }) => wordIndex)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(result.extraWords).toHaveLength(0);
    expect(result).toMatchObject({ matchedCount: 3, score: 60 });
  });

  it("keeps one inserted spoken word extra while later expected words align", () => {
    const result = assessRecitationTranscript(
      "واحد اثنان ثلاثة",
      "واحد زائد اثنان ثلاثة"
    );

    expect(
      result.expectedWords.map(({ status, wordIndex }) => ({
        status,
        wordIndex,
      }))
    ).toEqual([
      { status: "matched", wordIndex: 1 },
      { status: "matched", wordIndex: 2 },
      { status: "matched", wordIndex: 3 },
    ]);
    expect(result.extraWords).toEqual([
      { expected: "", heard: "زائد", status: "extra", wordIndex: null },
    ]);
    expect(result).toMatchObject({ matchedCount: 3, score: 100 });
  });

  it("keeps a repeated spoken word extra while later expected words align", () => {
    const result = assessRecitationTranscript(
      "الله رب العالمين",
      "الله الله رب العالمين"
    );

    expect(result.expectedWords.map(({ status }) => status)).toEqual([
      "matched",
      "matched",
      "matched",
    ]);
    expect(result.extraWords).toEqual([
      { expected: "", heard: "الله", status: "extra", wordIndex: null },
    ]);
    expect(result).toMatchObject({ matchedCount: 3, score: 100 });
  });

  it("marks one substitution for review and counts only correct expected words", () => {
    const result = assessRecitationTranscript(
      "الحمد لله رب",
      "الحمد للرحمن رب"
    );

    expect(result.expectedWords).toEqual([
      { expected: "الحمد", heard: "الحمد", status: "matched", wordIndex: 1 },
      { expected: "لله", heard: "للرحمن", status: "review", wordIndex: 2 },
      { expected: "رب", heard: "رب", status: "matched", wordIndex: 3 },
    ]);
    expect(result.extraWords).toHaveLength(0);
    expect(result).toMatchObject({ matchedCount: 2, score: 67 });
  });

  it("realigns later Quran words after an insertion followed by an omission", () => {
    const result = assessRecitationTranscript(
      "واحد اثنان ثلاثة أربعة خمسة",
      "واحد زائد اثنان أربعة خمسة"
    );

    expect(
      result.expectedWords.map(({ status, wordIndex }) => ({
        status,
        wordIndex,
      }))
    ).toEqual([
      { status: "matched", wordIndex: 1 },
      { status: "matched", wordIndex: 2 },
      { status: "missing", wordIndex: 3 },
      { status: "matched", wordIndex: 4 },
      { status: "matched", wordIndex: 5 },
    ]);
    expect(result.extraWords).toEqual([
      { expected: "", heard: "زائد", status: "extra", wordIndex: null },
    ]);
    expect(result).toMatchObject({ matchedCount: 4, score: 80 });
  });

  it("does not cascade after an incorrect word at the beginning", () => {
    const result = assessRecitationTranscript(
      "واحد اثنان ثلاثة أربعة",
      "خطأ اثنان ثلاثة أربعة"
    );

    expect(result.expectedWords.map(({ status }) => status)).toEqual([
      "review",
      "matched",
      "matched",
      "matched",
    ]);
    expect(result.expectedWords.map(({ wordIndex }) => wordIndex)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(result).toMatchObject({ matchedCount: 3, score: 75 });
  });

  it("does not cascade after an incorrect word in the middle", () => {
    const result = assessRecitationTranscript(
      "واحد اثنان ثلاثة أربعة",
      "واحد خطأ ثلاثة أربعة"
    );

    expect(result.expectedWords.map(({ status }) => status)).toEqual([
      "matched",
      "review",
      "matched",
      "matched",
    ]);
    expect(result.expectedWords.map(({ wordIndex }) => wordIndex)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(result).toMatchObject({ matchedCount: 3, score: 75 });
  });

  it("matches supported Arabic normalisation variants during alignment", () => {
    const result = assessRecitationTranscript(
      "ٱلْحَمْدُ إِيَّاكَ هُدَى",
      "الحمد اياك هدي"
    );

    expect(result.expectedWords.map(({ status }) => status)).toEqual([
      "matched",
      "matched",
      "matched",
    ]);
    expect(result).toMatchObject({ matchedCount: 3, score: 100 });
  });

  it("marks every expected word missing for an empty transcript", () => {
    const result = assessRecitationTranscript("واحد اثنان ثلاثة", "   ");

    expect(
      result.expectedWords.map(({ status, heard, wordIndex }) => ({
        status,
        heard,
        wordIndex,
      }))
    ).toEqual([
      { status: "missing", heard: null, wordIndex: 1 },
      { status: "missing", heard: null, wordIndex: 2 },
      { status: "missing", heard: null, wordIndex: 3 },
    ]);
    expect(result.extraWords).toHaveLength(0);
    expect(result).toMatchObject({ matchedCount: 0, totalWords: 3, score: 0 });
  });

  it("makes only textual alignment claims, not recitation-quality claims", () => {
    const result = assessRecitationTranscript(expected, "خطأ لله رب العالمين");
    const output = JSON.stringify(result).toLowerCase();

    expect(output).not.toMatch(
      /tajweed|tajwid|makhraj|makharij|pronunciation|pitch|rhythm|vowel[ -]?length/
    );
    expect(result.expectedWords[0]).toMatchObject({
      status: "review",
      wordIndex: 1,
    });
  });
});
