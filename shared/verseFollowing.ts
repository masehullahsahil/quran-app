/**
 * Verse-following / memorization position tracking.
 *
 * This module answers one question: while a learner recites from memory, which
 * ayah and which word are they expected to be reciting next? It is deliberately
 * deterministic and conservative — a position only moves when the transcript
 * alignment carries enough textual evidence that the expected ayah was actually
 * recited, and it stays put whenever the evidence is ambiguous.
 *
 * Scope boundary: this is transcript-based word recall only. Nothing here
 * observes or judges tajwid, makhraj, pronunciation, madd, ghunnah, pitch, or
 * rhythm. Those remain the concern of a qualified teacher and of the separate,
 * confidence-gated Quran-aware acoustic evaluator (shared/quranEvaluation.ts).
 *
 * It also does not re-implement word alignment. It consumes the result of the
 * existing dynamic-programming aligner (server/recitation.ts) as evidence, via
 * the structural `TranscriptAlignment` type below.
 */

/** Word-level statuses produced by the existing transcript aligner. */
export type AlignedWordStatus = "matched" | "review" | "missing" | "extra";

/** One aligned word. Structurally the aligner's `WordAssessment`. */
export type AlignedWord = {
  expected: string;
  heard: string | null;
  status: AlignedWordStatus;
  /** 1-based index into the expected ayah, or null for a word only heard. */
  wordIndex: number | null;
};

/**
 * The subset of the aligner's result the tracker reads. Declared structurally so
 * `RecitationAssessment` is assignable without the shared layer depending on the
 * server, and without a second alignment implementation existing anywhere.
 */
export type TranscriptAlignment = {
  expectedWords: AlignedWord[];
  extraWords: AlignedWord[];
  matchedCount: number;
  totalWords: number;
  score: number;
};

/**
 * What the learner is doing, as far as the transcript can show:
 *
 * - `following`  — on the expected ayah, moving forward through it.
 * - `correcting` — on the expected ayah, with a specific word to go back and fix
 *   (or with the wrong ayah recited, so this one needs another attempt).
 * - `uncertain`  — not enough usable evidence to move anything: silence, noise,
 *   or words that belong to no ayah nearby.
 * - `completed`  — the final ayah of the surah was recited with strong evidence.
 *
 * Exported as a tuple as well so the tRPC input schema validates the same list.
 */
export const VERSE_FOLLOWING_STATES = ["following", "correcting", "uncertain", "completed"] as const;

export type VerseFollowingState = (typeof VERSE_FOLLOWING_STATES)[number];

/**
 * How much textual evidence this attempt carried. A bounded enum, not a
 * probability: the aligner reports word matches, and inventing a numeric
 * confidence from them would be fake precision.
 */
export type VerseFollowingEvidence = "none" | "weak" | "partial" | "strong";

/** Why the tracker decided what it decided. Stable enough to branch UI copy on. */
export type VerseFollowingReason =
  | "no_transcript"
  | "too_little_evidence"
  | "noisy_transcript"
  | "previous_ayah_repeated"
  | "next_ayah_started_early"
  | "partial_progress"
  | "mistake_to_correct"
  | "ayah_completed"
  | "surah_completed";

/** The word the learner should return to before or during the next attempt. */
export type VerseCorrectionFocus = {
  /** 1-based index into the expected ayah. */
  wordIndex: number;
  expectedArabic: string;
  kind: "missing" | "review";
};

/** The durable position a Study session carries between attempts. */
export type VerseFollowingPosition = {
  currentSurah: number;
  currentAyah: number;
  /** 1-based index of the word the learner is expected to recite next. */
  expectedWordIndex: number;
  /** Highest ayah confidently completed in this surah, or null. */
  lastCompletedAyah: number | null;
  state: VerseFollowingState;
  /** Attempts spent on `currentAyah` without advancing. */
  attemptsOnCurrentAyah: number;
};

/**
 * The tracker's output contract. It is the *updated* position (the ayah and word
 * the learner should recite next) plus the decision that produced it, so a caller
 * can store the result directly with `toVerseFollowingPosition`.
 */
export type VerseFollowingResult = VerseFollowingPosition & {
  evidence: VerseFollowingEvidence;
  /** True when this attempt moved the position off the ayah it was on. */
  shouldAdvance: boolean;
  /** The ayah after `currentAyah`, or null at the end of the surah. */
  nextAyah: number | null;
  correctionFocus: VerseCorrectionFocus | null;
  reason: VerseFollowingReason;
};

export type VerseFollowingInput = {
  position: VerseFollowingPosition;
  /** Number of ayahs in the surah being memorised. */
  totalAyahs: number;
  /** Alignment of this attempt's transcript against the expected ayah. */
  alignment: TranscriptAlignment | null;
  /** Same transcript aligned against the previous ayah, when it is known. */
  previousAyahAlignment?: TranscriptAlignment | null;
  /** Same transcript aligned against the next ayah, when it is known. */
  nextAyahAlignment?: TranscriptAlignment | null;
  /** False when transcription failed or returned nothing usable. */
  transcriptUsable?: boolean;
};

/**
 * Advancement thresholds. They are intentionally strict: the cost of holding a
 * learner on an ayah they already know is one extra repetition, while the cost of
 * advancing on a stray matching word is losing the learner's place entirely.
 */
const ADVANCE_COVERAGE = 0.75;
/** At most one consecutive expected word may be unaccounted for. */
const MAX_GAP_RUN = 1;
/** Coverage below this is not treated as meaningful progress through the ayah. */
const PARTIAL_COVERAGE = 0.4;
/** A neighbouring ayah has to be this well covered before it explains the audio. */
const NEIGHBOUR_COVERAGE = 0.6;
/** Matched words needed before a next-ayah alignment counts as "started early". */
const NEIGHBOUR_MIN_MATCHES = 2;

export function createVerseFollowingPosition(surah: number, ayah: number): VerseFollowingPosition {
  return {
    currentSurah: surah,
    currentAyah: ayah,
    expectedWordIndex: 1,
    lastCompletedAyah: null,
    state: "following",
    attemptsOnCurrentAyah: 0,
  };
}

/** Strips the decision fields, leaving the position to carry into the next attempt. */
export function toVerseFollowingPosition(result: VerseFollowingResult): VerseFollowingPosition {
  return {
    currentSurah: result.currentSurah,
    currentAyah: result.currentAyah,
    expectedWordIndex: result.expectedWordIndex,
    lastCompletedAyah: result.lastCompletedAyah,
    state: result.state,
    attemptsOnCurrentAyah: result.attemptsOnCurrentAyah,
  };
}

function expectedWordCount(alignment: TranscriptAlignment): number {
  return alignment.totalWords > 0
    ? alignment.totalWords
    : alignment.expectedWords.filter((word) => word.wordIndex !== null).length;
}

function matchedIndexes(alignment: TranscriptAlignment): number[] {
  const indexes: number[] = [];
  for (const word of alignment.expectedWords) {
    if (word.status === "matched" && word.wordIndex !== null) indexes.push(word.wordIndex);
  }
  return indexes;
}

/** Matches at or after `from`. Kept separate so the coverage maths reads plainly. */
function matchesAtOrAfter(matched: number[], from: number): number {
  return matched.filter((index) => index >= from).length;
}

function heardWordCount(alignment: TranscriptAlignment): number {
  return alignment.expectedWords.filter((word) => word.heard !== null).length + alignment.extraWords.length;
}

/** Share of a neighbouring ayah that the same transcript accounts for. */
function neighbourCoverage(alignment: TranscriptAlignment | null | undefined): number {
  if (!alignment) return 0;
  const total = expectedWordCount(alignment);
  return total ? matchedIndexes(alignment).length / total : 0;
}

function stay(
  position: VerseFollowingPosition,
  patch: {
    state: VerseFollowingState;
    evidence: VerseFollowingEvidence;
    reason: VerseFollowingReason;
    expectedWordIndex?: number;
    correctionFocus?: VerseCorrectionFocus | null;
    totalAyahs: number;
  },
): VerseFollowingResult {
  return {
    currentSurah: position.currentSurah,
    currentAyah: position.currentAyah,
    expectedWordIndex: patch.expectedWordIndex ?? position.expectedWordIndex,
    lastCompletedAyah: position.lastCompletedAyah,
    state: patch.state,
    attemptsOnCurrentAyah: position.attemptsOnCurrentAyah + 1,
    evidence: patch.evidence,
    shouldAdvance: false,
    nextAyah: position.currentAyah < patch.totalAyahs ? position.currentAyah + 1 : null,
    correctionFocus: patch.correctionFocus ?? null,
    reason: patch.reason,
  };
}

/**
 * Decide where the learner is after one recorded attempt.
 *
 * The rules, in the order they are applied:
 *  1. No usable transcript at all — hold the position, report `uncertain`.
 *  2. Too few heard words to act on — hold the position.
 *  3. A neighbouring ayah explains the audio better than this one (the previous
 *     ayah was repeated, or the next one was started early) — hold the position
 *     and ask for a retry of the expected ayah. Checked before the "nothing
 *     matched" case below, because a learner reciting the wrong ayah matches
 *     nothing of the expected one.
 *  3b. Nothing of the expected ayah matched and no neighbour explains it — hold.
 *  4. Far more unexpected words than expected ones — treat as noise, hold.
 *  5. Enough of the expected ayah was recited, its end was reached, and no run of
 *     more than one word is unaccounted for — advance one ayah.
 *  6. Otherwise the learner is part-way through: stay on the ayah and move the
 *     expected word to the first word not yet accounted for.
 */
export function followRecitation(input: VerseFollowingInput): VerseFollowingResult {
  const { position, totalAyahs, alignment } = input;
  const transcriptUsable = input.transcriptUsable ?? true;

  if (!transcriptUsable || !alignment || expectedWordCount(alignment) === 0) {
    return stay(position, { state: "uncertain", evidence: "none", reason: "no_transcript", totalAyahs });
  }

  const total = expectedWordCount(alignment);
  const matched = matchedIndexes(alignment);
  const heard = heardWordCount(alignment);

  // A learner who resumes mid-ayah leaves the earlier words looking "missing".
  // When every match sits at or after the expected word, read the attempt as a
  // continuation of the ayah and judge only the part that was attempted.
  const resumeAt = Math.min(Math.max(position.expectedWordIndex, 1), total);
  const matchesBefore = matched.filter((index) => index < resumeAt).length;
  const matchesFrom = matched.length - matchesBefore;
  const windowStart = resumeAt > 1 && matchesFrom > 0 && matchesBefore === 0 ? resumeAt : 1;
  const windowSize = total - windowStart + 1;

  const coverage = windowSize > 0 ? matchesAtOrAfter(matched, windowStart) / windowSize : 0;
  const lastMatched = matched.reduce((highest, index) => (index > highest ? index : highest), 0);

  let firstGap = total + 1;
  let maxGapRun = 0;
  let gapRun = 0;
  for (let index = windowStart; index <= total; index += 1) {
    if (matched.indexOf(index) >= 0) {
      gapRun = 0;
      continue;
    }
    if (firstGap > total) firstGap = index;
    gapRun += 1;
    if (gapRun > maxGapRun) maxGapRun = gapRun;
  }

  const gapWord = alignment.expectedWords.find(
    (word) => word.wordIndex === firstGap && (word.status === "missing" || word.status === "review"),
  );
  const correctionFocus: VerseCorrectionFocus | null = gapWord?.wordIndex
    ? { wordIndex: gapWord.wordIndex, expectedArabic: gapWord.expected, kind: gapWord.status as "missing" | "review" }
    : null;
  const nextExpectedWord = Math.min(firstGap, total);

  // 2. Nothing worth acting on: silence, or a syllable or two of noise.
  if (heard < Math.min(2, total)) {
    return stay(position, {
      state: "uncertain",
      evidence: heard === 0 ? "none" : "weak",
      reason: heard === 0 ? "no_transcript" : "too_little_evidence",
      totalAyahs,
    });
  }

  const sufficient =
    coverage >= ADVANCE_COVERAGE &&
    maxGapRun <= MAX_GAP_RUN &&
    lastMatched >= total - 1 &&
    matched.length >= Math.min(2, total);

  // 3. The same audio fits a neighbouring ayah better than the expected one.
  if (!sufficient) {
    const previousCoverage = neighbourCoverage(input.previousAyahAlignment);
    if (previousCoverage >= NEIGHBOUR_COVERAGE && previousCoverage > coverage) {
      return stay(position, {
        state: "correcting",
        evidence: "weak",
        reason: "previous_ayah_repeated",
        expectedWordIndex: position.expectedWordIndex,
        totalAyahs,
      });
    }

    const nextAlignment = input.nextAyahAlignment ?? null;
    const nextMatches = nextAlignment ? matchedIndexes(nextAlignment).length : 0;
    if (nextAlignment && nextMatches >= NEIGHBOUR_MIN_MATCHES && neighbourCoverage(nextAlignment) > coverage) {
      return stay(position, {
        state: "correcting",
        evidence: "weak",
        reason: "next_ayah_started_early",
        expectedWordIndex: nextExpectedWord,
        correctionFocus,
        totalAyahs,
      });
    }
  }

  // 3b. Words were heard, but none of them belong to the expected ayah and no
  // neighbouring ayah explains them either. Hold the position rather than guess.
  if (matched.length === 0) {
    return stay(position, {
      state: "uncertain",
      evidence: "weak",
      reason: "too_little_evidence",
      totalAyahs,
    });
  }

  // 4. Far more unexpected words than the ayah has: transcription noise, not recall.
  if (alignment.extraWords.length > total) {
    return stay(position, {
      state: "uncertain",
      evidence: coverage >= PARTIAL_COVERAGE ? "partial" : "weak",
      reason: "noisy_transcript",
      expectedWordIndex: nextExpectedWord,
      correctionFocus,
      totalAyahs,
    });
  }

  // 5. Enough evidence that the expected ayah was recited through to its end.
  if (sufficient) {
    const isLastAyah = position.currentAyah >= totalAyahs;
    return {
      currentSurah: position.currentSurah,
      currentAyah: isLastAyah ? position.currentAyah : position.currentAyah + 1,
      expectedWordIndex: 1,
      lastCompletedAyah: position.currentAyah,
      state: isLastAyah ? "completed" : "following",
      attemptsOnCurrentAyah: 0,
      evidence: "strong",
      shouldAdvance: !isLastAyah,
      nextAyah: !isLastAyah && position.currentAyah + 2 <= totalAyahs ? position.currentAyah + 2 : null,
      correctionFocus: null,
      reason: isLastAyah ? "surah_completed" : "ayah_completed",
    };
  }

  // 6. Part-way through the ayah. A gap the learner has already recited past is a
  // mistake to return to; a gap at the end simply means they stopped there.
  const passedTheGap = firstGap <= total && lastMatched > firstGap;
  return stay(position, {
    state: passedTheGap ? "correcting" : "following",
    evidence: coverage >= PARTIAL_COVERAGE ? "partial" : "weak",
    reason: passedTheGap ? "mistake_to_correct" : "partial_progress",
    expectedWordIndex: nextExpectedWord,
    correctionFocus,
    totalAyahs,
  });
}

