export type WordStatus = "matched" | "review" | "missing" | "extra";

export type WordAssessment = {
  expected: string;
  heard: string | null;
  status: WordStatus;
  wordIndex: number | null;
};

export type RecitationAssessment = {
  expectedWords: WordAssessment[];
  extraWords: WordAssessment[];
  matchedCount: number;
  totalWords: number;
  score: number;
  corrections: WordAssessment[];
  fallbackNextStep: string;
};

const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const PUNCTUATION = /[\u060C\u061B\u061F،؛؟.!,:;"'()\[\]{}]/g;
const ARABIC_SCRIPT = /[\u0621-\u064A]/;

export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}

export function normaliseArabicToken(token: string): string {
  return token
    .normalize("NFKC")
    .replace(DIACRITICS, "")
    .replace(PUNCTUATION, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim();
}

export function tokenizeArabic(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function equivalent(expected: string, heard: string): boolean {
  const expectedNormalised = normaliseArabicToken(expected);
  const heardNormalised = normaliseArabicToken(heard);
  return Boolean(expectedNormalised) && expectedNormalised === heardNormalised;
}

/**
 * Align a known ayah against a transcript. This is deliberately a textual
 * recall check: it does not claim to judge tajwid, makharij, pitch, or rhythm.
 */
export function assessRecitationTranscript(expectedArabic: string, transcript: string): RecitationAssessment {
  const expectedWords = tokenizeArabic(expectedArabic);
  const heardWords = tokenizeArabic(transcript);
  const assessment: WordAssessment[] = [];
  const extras: WordAssessment[] = [];

  let expectedIndex = 0;
  let heardIndex = 0;

  while (expectedIndex < expectedWords.length && heardIndex < heardWords.length) {
    const expected = expectedWords[expectedIndex];
    const heard = heardWords[heardIndex];

    if (equivalent(expected, heard)) {
      assessment.push({ expected, heard, status: "matched", wordIndex: expectedIndex + 1 });
      expectedIndex += 1;
      heardIndex += 1;
      continue;
    }

    if (expectedIndex + 1 < expectedWords.length && equivalent(expectedWords[expectedIndex + 1], heard)) {
      assessment.push({ expected, heard: null, status: "missing", wordIndex: expectedIndex + 1 });
      expectedIndex += 1;
      continue;
    }

    if (heardIndex + 1 < heardWords.length && equivalent(expected, heardWords[heardIndex + 1])) {
      extras.push({ expected: "", heard, status: "extra", wordIndex: null });
      heardIndex += 1;
      continue;
    }

    assessment.push({ expected, heard, status: "review", wordIndex: expectedIndex + 1 });
    expectedIndex += 1;
    heardIndex += 1;
  }

  while (expectedIndex < expectedWords.length) {
    assessment.push({
      expected: expectedWords[expectedIndex],
      heard: null,
      status: "missing",
      wordIndex: expectedIndex + 1,
    });
    expectedIndex += 1;
  }

  while (heardIndex < heardWords.length) {
    extras.push({ expected: "", heard: heardWords[heardIndex], status: "extra", wordIndex: null });
    heardIndex += 1;
  }

  const matchedCount = assessment.filter((word) => word.status === "matched").length;
  const corrections = [...assessment.filter((word) => word.status !== "matched"), ...extras];
  const score = expectedWords.length ? Math.round((matchedCount / expectedWords.length) * 100) : 0;
  const firstCorrection = corrections[0];
  const fallbackNextStep = firstCorrection?.wordIndex
    ? `Replay the reference slowly, then repeat from word ${firstCorrection.wordIndex}.`
    : "Replay the reference once at a slower pace, then repeat the ayah with the same pauses.";

  return {
    expectedWords: assessment,
    extraWords: extras,
    matchedCount,
    totalWords: expectedWords.length,
    score,
    corrections,
    fallbackNextStep,
  };
}
