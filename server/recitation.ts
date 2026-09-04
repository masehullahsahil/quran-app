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

type AlignmentCost = {
  edits: number;
  matches: number;
};

type AlignmentStep = "matched" | "review" | "missing" | "extra";

function isBetterAlignment(candidate: AlignmentCost, current: AlignmentCost): boolean {
  return candidate.edits < current.edits || (candidate.edits === current.edits && candidate.matches > current.matches);
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

  // Build an optimal global alignment instead of making a one-token lookahead
  // decision. Besides minimizing edits, prefer alignments that preserve more
  // exact matches; this matters for repeated words and equally cheap edit paths.
  const costs: AlignmentCost[][] = Array.from({ length: expectedWords.length + 1 }, () =>
    Array.from({ length: heardWords.length + 1 }, () => ({ edits: 0, matches: 0 })),
  );
  const steps: (AlignmentStep | null)[][] = Array.from({ length: expectedWords.length + 1 }, () =>
    Array.from({ length: heardWords.length + 1 }, () => null),
  );

  for (let expectedIndex = expectedWords.length; expectedIndex >= 0; expectedIndex -= 1) {
    for (let heardIndex = heardWords.length; heardIndex >= 0; heardIndex -= 1) {
      if (expectedIndex === expectedWords.length && heardIndex === heardWords.length) continue;

      const candidates: Array<{ step: AlignmentStep; cost: AlignmentCost }> = [];

      if (expectedIndex < expectedWords.length && heardIndex < heardWords.length) {
        const exact = equivalent(expectedWords[expectedIndex], heardWords[heardIndex]);
        const next = costs[expectedIndex + 1][heardIndex + 1];
        candidates.push({
          step: exact ? "matched" : "review",
          cost: { edits: next.edits + (exact ? 0 : 1), matches: next.matches + (exact ? 1 : 0) },
        });
      }

      if (expectedIndex < expectedWords.length) {
        const next = costs[expectedIndex + 1][heardIndex];
        candidates.push({ step: "missing", cost: { edits: next.edits + 1, matches: next.matches } });
      }

      if (heardIndex < heardWords.length) {
        const next = costs[expectedIndex][heardIndex + 1];
        candidates.push({ step: "extra", cost: { edits: next.edits + 1, matches: next.matches } });
      }

      let best = candidates[0];
      for (const candidate of candidates.slice(1)) {
        if (isBetterAlignment(candidate.cost, best.cost)) best = candidate;
      }
      costs[expectedIndex][heardIndex] = best.cost;
      steps[expectedIndex][heardIndex] = best.step;
    }
  }

  let expectedIndex = 0;
  let heardIndex = 0;

  while (expectedIndex < expectedWords.length || heardIndex < heardWords.length) {
    const step = steps[expectedIndex][heardIndex];

    if (step === "matched" || step === "review") {
      const expected = expectedWords[expectedIndex];
      const heard = heardWords[heardIndex];
      assessment.push({ expected, heard, status: "matched", wordIndex: expectedIndex + 1 });
      if (step === "review") assessment[assessment.length - 1].status = "review";
      expectedIndex += 1;
      heardIndex += 1;
      continue;
    }

    if (step === "missing") {
      assessment.push({ expected: expectedWords[expectedIndex], heard: null, status: "missing", wordIndex: expectedIndex + 1 });
      expectedIndex += 1;
      continue;
    }

    if (step === "extra") {
      extras.push({ expected: "", heard: heardWords[heardIndex], status: "extra", wordIndex: null });
      heardIndex += 1;
      continue;
    }

    throw new Error("Recitation alignment could not determine the next step");
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
