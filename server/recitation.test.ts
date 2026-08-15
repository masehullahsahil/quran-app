import { describe, expect, it } from "vitest";
import { assessRecitationTranscript, hasArabicScript, normaliseArabicToken } from "./recitation";

describe("normaliseArabicToken", () => {
  it("matches Arabic tokens despite vocalisation and alef variants", () => {
    expect(normaliseArabicToken("ٱلْحَمْدُ")).toBe(normaliseArabicToken("الحمد"));
    expect(normaliseArabicToken("إِيَّاكَ")).toBe(normaliseArabicToken("اياك"));
  });
});

describe("hasArabicScript", () => {
  it("distinguishes Arabic transcript text from an English translation", () => {
    expect(hasArabicScript("بِسْمِ اللَّهِ")).toBe(true);
    expect(hasArabicScript("In the name of Allah")).toBe(false);
  });
});

describe("assessRecitationTranscript", () => {
  const expected = "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ";

  it("marks an exact textual recall as fully matched", () => {
    const result = assessRecitationTranscript(expected, "الحمد لله رب العالمين");

    expect(result.matchedCount).toBe(4);
    expect(result.score).toBe(100);
    expect(result.corrections).toHaveLength(0);
  });

  it("distinguishes a skipped expected word without calling it a tajwid error", () => {
    const result = assessRecitationTranscript(expected, "الحمد لله العالمين");

    expect(result.expectedWords[2]).toMatchObject({ expected: "رَبِّ", status: "missing" });
    expect(result.fallbackNextStep).toContain("word 3");
  });
});
