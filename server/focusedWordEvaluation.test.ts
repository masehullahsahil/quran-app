import { describe, expect, it } from "vitest";
import { evaluateFocusedWordTranscript, validateCorrectionTarget } from "./focusedWordEvaluation";

const EXPECTED = "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ";
const TARGET = { surah: 1, ayah: 2, targetWordIndex: 3, expectedArabic: "رَبِّ" };

function validated() {
  const target = validateCorrectionTarget({ expectedArabic: EXPECTED, surah: 1, ayah: 2, target: TARGET });
  expect(target).not.toBeNull();
  return target!;
}

describe("focused correction target validation", () => {
  it("accepts the canonical target with supported Quran orthography folding", () => {
    expect(validateCorrectionTarget({ expectedArabic: EXPECTED, surah: 1, ayah: 2, target: { ...TARGET, expectedArabic: "رب" } }))
      .toMatchObject({ canonicalArabic: "رَبِّ", targetWordIndex: 3 });
  });

  it("rejects a word attempt with no target", () => {
    expect(validateCorrectionTarget({ expectedArabic: EXPECTED, surah: 1, ayah: 2, target: null })).toBeNull();
  });

  it.each([
    ["another surah", { ...TARGET, surah: 2 }],
    ["another ayah", { ...TARGET, ayah: 3 }],
    ["an invalid index", { ...TARGET, targetWordIndex: 9 }],
    ["a different word at that index", { ...TARGET, expectedArabic: "لِلَّهِ" }],
  ])("rejects %s", (_name, target) => {
    expect(validateCorrectionTarget({ expectedArabic: EXPECTED, surah: 1, ayah: 2, target })).toBeNull();
  });
});

describe("focused word transcript evidence", () => {
  it.each(["رب", "رَبِّ", "ربي"])("recognises the target spelling %s", (transcript) => {
    expect(evaluateFocusedWordTranscript(validated(), transcript)).toEqual({
      recognition: "recognised",
      reason: "target_recognised",
    });
  });

  it("does not recognise another Quran word", () => {
    expect(evaluateFocusedWordTranscript(validated(), "الرحمن")).toEqual({
      recognition: "not-recognised",
      reason: "different_word",
    });
  });

  it.each(["", "رب الرحمن", "الحمد لله"])("abstains on ambiguous transcript %j", (transcript) => {
    expect(evaluateFocusedWordTranscript(validated(), transcript)).toEqual({
      recognition: "unknown",
      reason: "ambiguous_transcript",
    });
  });
});
