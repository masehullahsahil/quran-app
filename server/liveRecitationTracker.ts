import {
  type LiveQuranTrackerState,
  type LiveWordOmittedEvent,
} from "@shared/liveRecitation";
import { assessRecitationTranscript, hasArabicScript, tokenizeArabic } from "./recitation";

export type LiveTrackerUpdate = {
  tracker: LiveQuranTrackerState;
  omission: LiveWordOmittedEvent | null;
  accepted: boolean;
};

export function createLiveQuranTracker(surah: number, ayah: number): LiveQuranTrackerState {
  return {
    surah,
    ayah,
    lastSequence: 0,
    expectedWordIndex: 1,
    confirmedWordIndexes: [],
    tentativeWordIndexes: [],
    possibleSkip: null,
    emittedCorrectionWordIndexes: [],
    recognitionState: "tentative",
  };
}

function alignmentIndexes(expectedArabic: string, transcript: string): {
  matched: number[];
  missing: Set<number>;
  hasReview: boolean;
} {
  const assessment = assessRecitationTranscript(expectedArabic, transcript);
  return {
    matched: assessment.expectedWords
      .filter((word) => word.status === "matched" && word.wordIndex !== null)
      .map((word) => word.wordIndex as number),
    missing: new Set(assessment.expectedWords
      .filter((word) => word.status === "missing" && word.wordIndex !== null)
      .map((word) => word.wordIndex as number)),
    hasReview: assessment.expectedWords.some((word) => word.status === "review"),
  };
}

function sortedUnique(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function sameIndexes(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function firstSkipCandidate(
  totalWords: number,
  matched: number[],
  missing: Set<number>,
  confirmed: number[],
): { targetWordIndex: number; laterWordIndex: number } | null {
  const accounted = new Set([...matched, ...confirmed]);
  const lastMatched = matched.at(-1) ?? 0;

  // Word 1 has no earlier Quran anchor. Refusing to accuse an opening omission
  // is intentional: a clipped microphone start is more likely than proof that
  // the learner skipped the first word.
  for (let target = 2; target < totalWords; target += 1) {
    if (!missing.has(target) || matched.includes(target) || lastMatched <= target) continue;
    let prefixAccountedFor = true;
    for (let index = 1; index < target; index += 1) {
      if (!accounted.has(index)) {
        prefixAccountedFor = false;
        break;
      }
    }
    if (!prefixAccountedFor) continue;
    const laterWordIndex = matched.find((index) => index > target);
    if (laterWordIndex) return { targetWordIndex: target, laterWordIndex };
  }
  return null;
}

/**
 * Incremental textual tracker. It never completes an ayah.
 *
 * A finalized recognition can confirm a skip when an exact later canonical
 * word is aligned beyond one absent word and every earlier word is accounted
 * for. An interim recognition can only confirm after the same gap and later
 * word survive two consecutive, monotonically ordered observations. One
 * unstable partial is therefore structurally incapable of emitting a Quran
 * correction.
 */
export function updateLiveQuranTracker(input: {
  tracker: LiveQuranTrackerState;
  expectedArabic: string;
  transcript: string;
  stability: "interim" | "final";
  sequence: number;
}): LiveTrackerUpdate {
  const { tracker } = input;
  if (input.sequence <= tracker.lastSequence) {
    return { tracker, omission: null, accepted: false };
  }

  const expectedWords = tokenizeArabic(input.expectedArabic);
  const alignment = hasArabicScript(input.transcript)
    ? alignmentIndexes(input.expectedArabic, input.transcript)
    : { matched: [], missing: new Set<number>(), hasReview: false };
  const matched = sortedUnique(alignment.matched);
  if (!expectedWords.length || !matched.length) {
    return {
      accepted: true,
      omission: null,
      tracker: {
        ...tracker,
        lastSequence: input.sequence,
        tentativeWordIndexes: [],
        possibleSkip: null,
        recognitionState: "uncertain",
      },
    };
  }

  const candidate = firstSkipCandidate(
    expectedWords.length,
    matched,
    alignment.missing,
    tracker.confirmedWordIndexes,
  );
  const sameCandidate = Boolean(
    candidate && tracker.possibleSkip &&
    candidate.targetWordIndex === tracker.possibleSkip.targetWordIndex &&
    candidate.laterWordIndex === tracker.possibleSkip.laterWordIndex,
  );
  const consecutiveObservations = candidate
    ? sameCandidate ? tracker.possibleSkip!.consecutiveObservations + 1 : 1
    : 0;
  const confirmedSkip = Boolean(candidate) && (
    input.stability === "final" || consecutiveObservations >= 2
  );
  const alreadyEmitted = candidate
    ? tracker.emittedCorrectionWordIndexes.includes(candidate.targetWordIndex)
    : false;

  const stableProgress = input.stability === "final" || sameIndexes(tracker.tentativeWordIndexes, matched);
  const confirmedWordIndexes = stableProgress
    ? sortedUnique([...tracker.confirmedWordIndexes, ...matched])
    : tracker.confirmedWordIndexes;
  let contiguous = 0;
  const accounted = new Set([...matched, ...confirmedWordIndexes]);
  while (accounted.has(contiguous + 1)) contiguous += 1;
  const expectedWordIndex = candidate
    ? candidate.targetWordIndex
    : Math.max(tracker.expectedWordIndex, Math.min(contiguous + 1, expectedWords.length));

  const omission: LiveWordOmittedEvent | null = confirmedSkip && candidate && !alreadyEmitted
    ? {
        type: "word-omitted",
        surah: tracker.surah,
        ayah: tracker.ayah,
        targetWordIndex: candidate.targetWordIndex,
        targetArabic: expectedWords[candidate.targetWordIndex - 1],
        evidence: input.stability === "final"
          ? "finalized-later-word"
          : "repeated-stable-later-word",
        heardThroughWordIndex: matched.at(-1) ?? candidate.laterWordIndex,
      }
    : null;

  return {
    accepted: true,
    omission,
    tracker: {
      ...tracker,
      lastSequence: input.sequence,
      expectedWordIndex,
      confirmedWordIndexes,
      tentativeWordIndexes: matched,
      possibleSkip: candidate
        ? { ...candidate, consecutiveObservations }
        : null,
      emittedCorrectionWordIndexes: omission
        ? sortedUnique([...tracker.emittedCorrectionWordIndexes, omission.targetWordIndex])
        : tracker.emittedCorrectionWordIndexes,
      recognitionState: confirmedSkip
        ? "confirmed-skip"
        : candidate
          ? "possible-skip"
          : alignment.hasReview
            ? "uncertain"
            : stableProgress
              ? "stable-progress"
              : "tentative",
    },
  };
}
