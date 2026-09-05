/**
 * The teacher's decision: given everything the app observed about one attempt,
 * what is the single next thing to ask of the learner?
 *
 * Study mode collects evidence from four independent systems — the recorder,
 * the transcript aligner and verse-following tracker, the memorization history,
 * and (when configured) a Quran-aware acoustic evaluator. Each of them keeps its
 * own rules; none of them is changed here. This module reads their conclusions
 * and picks one instruction, deterministically, together with the reason it
 * picked it and whether the learner may move on.
 *
 * Three principles govern every rule below.
 *
 * **Evidence is not instruction.** `focus` and `secondaryNotes` say what was
 * observed; `action` says what to do about it. The client turns the action into
 * words. Nothing in this module writes learner-facing prose.
 *
 * **Abstain rather than guess.** Weak, missing or conflicting evidence never
 * advances the learner and never becomes a correction. When the words could not
 * be established, no claim is made about how they sounded.
 *
 * **The language model decides nothing.** An LLM may phrase encouragement around
 * this decision, never make or override it — see `docs/ai-teacher-decisions.md`.
 * No field of `TeacherEvidence` is model-written, and no field of
 * `TeacherDecision` carries model text.
 */
import type { QuranAwareReview } from "./quranEvaluation";
import type { VerseFollowingResult } from "./verseFollowing";

/**
 * An acoustic finding is actionable only at or above the same confidence the
 * server gates on. Repeated here on purpose: if a future service or a relaxed
 * server ever let a weaker observation through, the teacher would still ignore
 * it rather than turn it into a correction.
 */
export const ACOUSTIC_MIN_CONFIDENCE = 0.75;

/** What the teacher asks for. */
export type TeacherActionKind =
  | "listening"
  | "reviewing"
  /** The attempt could not be reviewed at all; record again. */
  | "recording-problem"
  /** Something was heard, but not enough of it to judge. Abstain. */
  | "unclear"
  /** One word needs repeating. */
  | "repeat-word"
  /** The whole ayah needs another attempt. */
  | "repeat-ayah"
  /** The ayah was recited; move on. */
  | "next-ayah"
  /** The last ayah of the surah is done. */
  | "surah-complete"
  /** Part of the ayah was recited; carry on from where it stopped. */
  | "continue"
  /** Nothing attempted yet, and this ayah is due for review. */
  | "review-today"
  /** Nothing attempted yet. */
  | "listen-first";

/**
 * Why the teacher chose this action. Developer-facing: it goes in the decision
 * trace and in tests, and is never shown to a learner as-is.
 */
export type TeacherReasonCode =
  | "recording_in_progress"
  | "attempt_under_review"
  | "recording_unreviewable"
  | "evidence_uncertain"
  | "text_recurring_word"
  | "acoustic_high_confidence"
  | "ayah_complete"
  | "surah_complete"
  | "text_missing_word"
  | "tracker_repeat_ayah"
  | "tracker_partial_progress"
  | "review_due"
  | "default_listen";

/** How much the decision rests on. Mirrors the tracker's bounded enum. */
export type TeacherEvidenceLevel = "none" | "weak" | "partial" | "strong";

/** Where a focus word came from. Drives wording, and the decision trace. */
export type TeacherFocusSource = "recurring" | "acoustic" | "tracker" | "text";

export type TeacherFocus = {
  wordIndex: number;
  expectedArabic: string;
  source: TeacherFocusSource;
};

/**
 * A reusable teaching sequence, as steps rather than prose. The client renders
 * whichever of these it has room for; the set is fixed so a lesson is never
 * assembled out of ad-hoc messages.
 */
export type TeachingStep = "show-word" | "listen" | "repeat-word" | "recite-ayah" | "record-again";

/** Detail for the secondary panel. Never the primary instruction. */
export type TeacherNote =
  | { kind: "acoustic"; wordIndex: number | null; guidance: string }
  | { kind: "recurring"; wordIndex: number }
  | { kind: "text"; wordIndex: number; status: "missing" | "review" }
  | { kind: "extra-words"; count: number };

export type TeacherDecision = {
  action: TeacherActionKind;
  reason: TeacherReasonCode;
  evidenceLevel: TeacherEvidenceLevel;
  /** Whether moving to the next ayah is sanctioned by this attempt. */
  canAdvance: boolean;
  /** The ayah to move to when `canAdvance` is true. */
  targetAyah: number | null;
  focus: TeacherFocus | null;
  sequence: readonly TeachingStep[];
  secondaryNotes: TeacherNote[];
};

/** One word the aligner could not match. Extras carry no expected position. */
export type TextCorrection = {
  expected: string;
  heard: string | null;
  status: "matched" | "review" | "missing" | "extra";
  wordIndex: number | null;
};

/** The finalized, reviewed attempt — the only thing that may advance an ayah. */
export type AttemptEvidence = {
  /** False when transcription failed or returned nothing usable. */
  reviewable: boolean;
  corrections: TextCorrection[];
  verseFollowing: VerseFollowingResult;
};

/**
 * Everything the teacher knows, in one derived object.
 *
 * Deliberately small: it holds conclusions the other systems already reached,
 * not copies of their internals. The page assembles it each render.
 */
export type TeacherEvidence = {
  recording: {
    isRecording: boolean;
    isReviewing: boolean;
    /** A recorder, upload or network failure the learner must retry past. */
    failed: boolean;
  };
  /** Null until a recording has been reviewed for this ayah. */
  attempt: AttemptEvidence | null;
  /** The evaluator's own verdict, at whatever status it reported. */
  acoustic: QuranAwareReview | null;
  memory: {
    /** This ayah is scheduled for review today. */
    reviewDue: boolean;
    /** Word positions this learner has missed repeatedly, from the history. */
    recurringWordIndexes: number[];
  };
  /** The live tracker's place, which moves while reciting as well as after. */
  livePosition: { currentAyah: number; expectedWordIndex: number };
  hasNextAyah: boolean;
};

const NO_FOCUS = { focus: null, targetAyah: null } as const;

/** Tracker outcomes that mean "we could not establish what was recited". */
const UNCERTAIN_REASONS = new Set(["no_transcript", "too_little_evidence", "noisy_transcript"]);

/**
 * The acoustic findings this decision is allowed to act on.
 *
 * A finding counts only when the service said `available`, reported a confidence
 * at or above the shared threshold, and named a word. Anything else — abstained,
 * unavailable, not configured, unscored, or a general remark with no position —
 * is context at most. This is what stops a low-confidence observation from
 * becoming "you mispronounced word 3".
 */
export function actionableAcousticFindings(review: QuranAwareReview | null): Array<{ wordIndex: number; guidance: string; expectedArabic: string | null }> {
  if (!review || review.status !== "available") return [];
  if (review.confidence === null || review.confidence < ACOUSTIC_MIN_CONFIDENCE) return [];
  return review.findings
    .filter((finding): finding is typeof finding & { wordIndex: number } => finding.wordIndex !== null && finding.wordIndex > 0)
    .map((finding) => ({ wordIndex: finding.wordIndex, guidance: finding.guidance, expectedArabic: finding.expectedArabic }));
}

/**
 * The textual corrections worth acting on, best first.
 *
 * Order: a word the learner keeps missing, then the word the tracker itself is
 * waiting at, then an omission ahead of a substitution — a word not said at all
 * is a bigger gap than one the transcript heard differently — then by position.
 * Extra words are never a focus: they name no place to return to.
 */
export function rankedTextCorrections(attempt: AttemptEvidence | null, recurringWordIndexes: readonly number[]): TextCorrection[] {
  if (!attempt || !attempt.reviewable) return [];
  const trackerFocus = attempt.verseFollowing.correctionFocus?.wordIndex ?? null;

  const rank = (correction: TextCorrection) => {
    if (correction.wordIndex === null || !correction.expected) return Number.MAX_SAFE_INTEGER;
    if (recurringWordIndexes.includes(correction.wordIndex)) return 0;
    if (correction.wordIndex === trackerFocus) return 1;
    return correction.status === "missing" ? 2 : 3;
  };

  return attempt.corrections
    .filter((correction) => correction.wordIndex !== null && Boolean(correction.expected) && correction.status !== "extra" && correction.status !== "matched")
    .sort((left, right) => rank(left) - rank(right) || (left.wordIndex ?? 0) - (right.wordIndex ?? 0));
}

/** Detail for the secondary panel, gathered once so the caller need not re-derive it. */
function collectNotes(evidence: TeacherEvidence, primary: TeacherFocus | null): TeacherNote[] {
  const notes: TeacherNote[] = [];

  for (const finding of actionableAcousticFindings(evidence.acoustic)) {
    if (primary?.source === "acoustic" && primary.wordIndex === finding.wordIndex) continue;
    notes.push({ kind: "acoustic", wordIndex: finding.wordIndex, guidance: finding.guidance });
  }

  for (const wordIndex of evidence.memory.recurringWordIndexes) {
    if (primary?.wordIndex === wordIndex && primary.source === "recurring") continue;
    notes.push({ kind: "recurring", wordIndex });
  }

  for (const correction of rankedTextCorrections(evidence.attempt, evidence.memory.recurringWordIndexes)) {
    if (primary && primary.wordIndex === correction.wordIndex && primary.source !== "acoustic") continue;
    if (correction.status === "missing" || correction.status === "review") {
      notes.push({ kind: "text", wordIndex: correction.wordIndex as number, status: correction.status });
    }
  }

  const extras = evidence.attempt?.corrections.filter((correction) => correction.status === "extra").length ?? 0;
  if (extras > 0) notes.push({ kind: "extra-words", count: extras });

  return notes;
}

/**
 * Choose one teaching action.
 *
 * Precedence, in the order applied. Each step is a rule about *evidence*, not a
 * preference about wording:
 *
 *  1. `recording_in_progress` / `attempt_under_review` — the microphone's own
 *     state outranks everything: nothing else is settled yet.
 *  2. `recording_unreviewable` — the attempt produced nothing to judge, so ask
 *     for another. No score, no advancement, no correction.
 *  3. `evidence_uncertain` — words were heard but too few, too noisy, or from
 *     somewhere else. Abstain: say it was unclear rather than inventing a
 *     mistake, and hold the position. An acoustic finding is *also* discarded
 *     here — if the words themselves could not be established, a claim about
 *     how one of them sounded has nothing to attach to.
 *  4. `text_recurring_word` — a word this learner has missed repeatedly, missed
 *     again. This outranks the tracker's willingness to advance on purpose: an
 *     attempt that barely passes should not carry a known weak word forward.
 *  5. `acoustic_high_confidence` — the one case where the app has real evidence
 *     about sound. It also holds the learner, because the words were right and
 *     the only thing left to fix is how one of them was said.
 *  6. `ayah_complete` / `surah_complete` — the tracker's completion rules,
 *     unchanged, are the only thing that may advance an ayah.
 *  7. `text_missing_word` — one word to return to.
 *  8. `tracker_repeat_ayah` — the tracker is correcting or unsure of the whole
 *     attempt, with no single word to blame.
 *  9. `tracker_partial_progress` — carry on from where the recitation stopped.
 * 10. `review_due` — scheduling context. It never displaces a correction, which
 *     is why it sits here rather than near the top.
 * 11. `default_listen` — nothing attempted yet.
 */
export function decideTeacherAction(evidence: TeacherEvidence): TeacherDecision {
  const decide = (decision: Omit<TeacherDecision, "secondaryNotes">): TeacherDecision => ({
    ...decision,
    secondaryNotes: collectNotes(evidence, decision.focus),
  });

  if (evidence.recording.isRecording) {
    return decide({ action: "listening", reason: "recording_in_progress", evidenceLevel: "none", canAdvance: false, sequence: [], ...NO_FOCUS });
  }

  if (evidence.recording.isReviewing) {
    return decide({ action: "reviewing", reason: "attempt_under_review", evidenceLevel: "none", canAdvance: false, sequence: [], ...NO_FOCUS });
  }

  const attempt = evidence.attempt;

  if (evidence.recording.failed || (attempt !== null && !attempt.reviewable)) {
    return decide({
      action: "recording-problem",
      reason: "recording_unreviewable",
      evidenceLevel: "none",
      canAdvance: false,
      sequence: ["record-again"],
      ...NO_FOCUS,
    });
  }

  const follow = attempt?.verseFollowing ?? null;

  // 3. Abstention. Nothing is claimed and nothing moves.
  if (follow && (follow.evidence === "none" || UNCERTAIN_REASONS.has(follow.reason))) {
    return decide({
      action: "unclear",
      reason: "evidence_uncertain",
      evidenceLevel: follow.evidence,
      canAdvance: false,
      sequence: ["listen", "record-again"],
      ...NO_FOCUS,
    });
  }

  const ranked = rankedTextCorrections(attempt, evidence.memory.recurringWordIndexes);
  const recurring = ranked.find(
    (correction) => correction.wordIndex !== null && evidence.memory.recurringWordIndexes.includes(correction.wordIndex),
  );

  // 4. A known weak word, missed again. Drill it before moving on.
  if (recurring?.wordIndex) {
    return decide({
      action: "repeat-word",
      reason: "text_recurring_word",
      evidenceLevel: follow?.evidence ?? "partial",
      canAdvance: false,
      targetAyah: null,
      focus: { wordIndex: recurring.wordIndex, expectedArabic: recurring.expected, source: "recurring" },
      sequence: ["show-word", "listen", "repeat-word", "recite-ayah"],
    });
  }

  // 5. The only evidence the app has about sound, and only when it is confident.
  const acoustic = actionableAcousticFindings(evidence.acoustic);
  if (attempt && acoustic.length > 0 && ranked.length === 0) {
    const finding = acoustic[0];
    return decide({
      action: "repeat-word",
      reason: "acoustic_high_confidence",
      evidenceLevel: follow?.evidence ?? "partial",
      canAdvance: false,
      targetAyah: null,
      focus: {
        wordIndex: finding.wordIndex,
        expectedArabic: finding.expectedArabic ?? expectedWordAt(attempt, finding.wordIndex),
        source: "acoustic",
      },
      sequence: ["show-word", "listen", "repeat-word", "recite-ayah"],
    });
  }

  // 6. Completion — the tracker's rules, unchanged, are what advance an ayah.
  if (follow?.shouldAdvance && evidence.hasNextAyah) {
    return decide({
      action: "next-ayah",
      reason: "ayah_complete",
      evidenceLevel: follow.evidence,
      canAdvance: true,
      targetAyah: follow.currentAyah,
      focus: null,
      sequence: [],
    });
  }

  if (follow && (follow.state === "completed" || (follow.shouldAdvance && !evidence.hasNextAyah))) {
    return decide({
      action: "surah-complete",
      reason: "surah_complete",
      evidenceLevel: follow.evidence,
      canAdvance: false,
      sequence: [],
      ...NO_FOCUS,
    });
  }

  // 7. One word to return to.
  const first = ranked[0];
  if (first?.wordIndex) {
    return decide({
      action: "repeat-word",
      reason: "text_missing_word",
      evidenceLevel: follow?.evidence ?? "partial",
      canAdvance: false,
      targetAyah: null,
      focus: {
        wordIndex: first.wordIndex,
        expectedArabic: first.expected,
        source: first.wordIndex === follow?.correctionFocus?.wordIndex ? "tracker" : "text",
      },
      sequence: ["show-word", "listen", "repeat-word", "recite-ayah"],
    });
  }

  if (follow?.state === "correcting" || follow?.state === "uncertain") {
    return decide({
      action: "repeat-ayah",
      reason: "tracker_repeat_ayah",
      evidenceLevel: follow.evidence,
      canAdvance: false,
      sequence: ["listen", "recite-ayah"],
      ...NO_FOCUS,
    });
  }

  if (follow?.state === "following") {
    return decide({
      action: "continue",
      reason: "tracker_partial_progress",
      evidenceLevel: follow.evidence,
      canAdvance: false,
      targetAyah: null,
      focus: null,
      sequence: ["recite-ayah"],
    });
  }

  if (evidence.memory.reviewDue) {
    return decide({ action: "review-today", reason: "review_due", evidenceLevel: "none", canAdvance: false, sequence: ["listen", "recite-ayah"], ...NO_FOCUS });
  }

  return decide({ action: "listen-first", reason: "default_listen", evidenceLevel: "none", canAdvance: false, sequence: ["listen", "recite-ayah"], ...NO_FOCUS });
}

/** The expected Arabic at a position, when the evaluator named one but no text. */
function expectedWordAt(attempt: AttemptEvidence, wordIndex: number): string {
  return attempt.corrections.find((correction) => correction.wordIndex === wordIndex)?.expected ?? "";
}

/** A one-line developer trace of how the decision came out. Never shown to a learner. */
export function describeDecision(decision: TeacherDecision): string {
  const focus = decision.focus ? ` focus=word${decision.focus.wordIndex}:${decision.focus.source}` : "";
  return `${decision.action} (${decision.reason}) evidence=${decision.evidenceLevel} advance=${decision.canAdvance}${focus} notes=${decision.secondaryNotes.length}`;
}
