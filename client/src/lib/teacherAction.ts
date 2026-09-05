/**
 * Turning the teacher's decision into one line on screen.
 *
 * The decision itself — which action, why, and whether the learner may move on —
 * is made in `shared/teacherDecision.ts`. This module does the presentation half
 * only: it maps an action to an instruction key, to at most one contextual
 * button, and to the accent colour. Adding a rule here would put decision logic
 * in the view, which is exactly what the split is for.
 *
 * Every instruction is a fixed locale key chosen from a bounded set. No text
 * from the language model, the acoustic evaluator, or any other service can
 * become the primary instruction; model prose belongs in Teacher notes.
 */
import type { StringKey } from "@locales/index";
import {
  decideTeacherAction,
  type TeacherObservation,
  type TeacherActionKind,
  type TeacherDecision,
  type TeacherEvidence,
  type TeacherEvidenceLevel,
  type TeacherFocus,
  type TeacherNote,
  type TeacherReasonCode,
  type TeachingStep,
} from "@shared/teacherDecision";

export type {
  TeacherActionKind,
  TeacherObservation,
  TeacherDecision,
  TeacherEvidence,
  TeacherEvidenceLevel,
  TeacherFocus,
  TeacherNote,
  TeacherReasonCode,
  TeachingStep,
};

/** The one contextual button, when there is something to offer beyond the mic. */
export type TeacherActionButton = {
  /** What the button does. The page supplies the handler. */
  command: "retry-ayah" | "next-ayah";
  labelKey: StringKey;
  params?: Record<string, string | number>;
};

export type TeacherAction = {
  kind: TeacherActionKind;
  /** The dominant line: one instruction, in learner wording. */
  titleKey: StringKey;
  titleParams?: Record<string, string | number>;
  /** The word to repeat, shown large in Arabic. Null unless kind is repeat-word. */
  focusArabic: string | null;
  focusWordIndex: number | null;
  /**
   * At most one button. Null when the listen and record controls below are
   * already the natural next step, so the page never shows two competing CTAs.
   */
  button: TeacherActionButton | null;
  /**
   * Drives the accent only — never a claim about recitation quality.
   * `unsure` is deliberately distinct from `attention`: an attempt the app could
   * not hear must not be styled like a confirmed mistake.
   */
  tone: "neutral" | "attention" | "success" | "unsure";
  /** The ayah to move to when `command` is "next-ayah". */
  targetAyah: number | null;
  /** Whether this attempt sanctions moving on. Mirrors the decision. */
  canAdvance: boolean;
  /** Developer-facing trace of why this action was chosen. Never rendered raw. */
  reason: TeacherReasonCode;
  evidenceLevel: TeacherEvidenceLevel;
  /** The teaching sequence for this action, for the steps strip. */
  sequence: readonly TeachingStep[];
  /** Detail for Teacher notes. Never the primary instruction. */
  secondaryNotes: TeacherNote[];
  /** What was observed about the focus word, when there is one. */
  observation: TeacherObservation | null;
};

/** Instruction wording per action. One key each: no branching prose. */
const TITLE_KEYS: Record<TeacherActionKind, StringKey> = {
  listening: "now.listening",
  reviewing: "now.reviewing",
  "recording-problem": "now.recordAgain",
  unclear: "now.unclear",
  "repeat-word": "now.repeatWord",
  "repeat-ayah": "now.repeatAyah",
  "next-ayah": "now.nextAyah",
  "surah-complete": "now.surahComplete",
  continue: "now.continueFromWord",
  "review-today": "now.reviewToday",
  "listen-first": "now.listenFirst",
};

/** The wording of a word-repeat depends on which evidence named the word. */
const FOCUS_TITLE_KEYS: Record<TeacherFocus["source"], StringKey> = {
  recurring: "now.repeatWordAgain",
  acoustic: "now.repeatWordSound",
  tracker: "now.repeatWord",
  text: "now.repeatWord",
};

const TONES: Record<TeacherActionKind, TeacherAction["tone"]> = {
  listening: "neutral",
  reviewing: "neutral",
  "recording-problem": "unsure",
  unclear: "unsure",
  "repeat-word": "attention",
  "repeat-ayah": "attention",
  "next-ayah": "success",
  "surah-complete": "success",
  continue: "neutral",
  "review-today": "neutral",
  "listen-first": "neutral",
};

export type TeacherActionInput = TeacherEvidence;

/**
 * Runs the decision and dresses it for the page.
 *
 * The title, button and tone are looked up from the tables above; nothing is
 * computed here that could change which action the learner is given.
 */
export function resolveTeacherAction(input: TeacherActionInput): TeacherAction {
  const decision = decideTeacherAction(input);
  return presentDecision(decision, input);
}

export function presentDecision(decision: TeacherDecision, input: TeacherActionInput): TeacherAction {
  const focus = decision.focus;
  const titleKey = decision.action === "repeat-word" && focus ? FOCUS_TITLE_KEYS[focus.source] : TITLE_KEYS[decision.action];

  return {
    kind: decision.action,
    titleKey,
    titleParams: titleParams(decision, input),
    focusArabic: focus?.expectedArabic ?? null,
    focusWordIndex: focus?.wordIndex ?? (decision.action === "continue" ? input.attempt?.verseFollowing.expectedWordIndex ?? null : null),
    button: buttonFor(decision),
    tone: TONES[decision.action],
    targetAyah: decision.targetAyah,
    canAdvance: decision.canAdvance,
    reason: decision.reason,
    evidenceLevel: decision.evidenceLevel,
    sequence: decision.sequence,
    secondaryNotes: decision.secondaryNotes,
    observation: focus?.observation ?? null,
  };
}

function titleParams(decision: TeacherDecision, input: TeacherActionInput): Record<string, string | number> | undefined {
  if (decision.focus) return { number: decision.focus.wordIndex };
  const follow = input.attempt?.verseFollowing ?? null;

  switch (decision.action) {
    case "next-ayah":
      return { number: decision.targetAyah ?? follow?.currentAyah ?? input.livePosition.currentAyah };
    case "repeat-ayah":
      return { number: follow?.currentAyah ?? input.livePosition.currentAyah };
    case "continue":
      return { number: follow?.expectedWordIndex ?? input.livePosition.expectedWordIndex };
    case "listen-first":
      return { number: input.livePosition.expectedWordIndex };
    default:
      return undefined;
  }
}

function buttonFor(decision: TeacherDecision): TeacherActionButton | null {
  if (decision.action === "next-ayah" && decision.targetAyah !== null) {
    return { command: "next-ayah", labelKey: "now.goToAyah", params: { number: decision.targetAyah } };
  }
  if (decision.action === "recording-problem" || decision.action === "unclear") {
    return { command: "retry-ayah", labelKey: "now.tryAgain" };
  }
  if (decision.action === "repeat-word" || decision.action === "repeat-ayah") {
    return { command: "retry-ayah", labelKey: "now.repeat" };
  }
  // Otherwise the listen and record controls below are the next step already.
  return null;
}

/**
 * Nothing attempted yet: the learner is told where to start, from the live
 * tracker's place rather than from a review that has not happened.
 */
export function isPreAttempt(action: TeacherAction): boolean {
  return action.kind === "listen-first" || action.kind === "review-today";
}
