import type { SupportedLanguageCode } from "./languages";
import { TUTOR_INTENTS, type TutorIntent } from "./tutorConversation";
import type { VerseFollowingResult } from "./verseFollowing";
import type {
  CorrectionSessionSnapshot,
  FocusedWordResult,
  RecitationAttemptScope,
} from "./wordCorrection";

export const LIVE_TUTOR_MODES = ["guided-recitation", "memorization"] as const;
export const LIVE_TUTOR_PHASES = [
  "ready",
  "listening",
  "correcting-word",
  "recite-ayah",
  "waiting",
  "paused",
  "completed",
  "stopped",
] as const;
/** The conversation layer and teaching engine share one structured intent list. */
export const LEARNER_INTENTS = TUTOR_INTENTS;
export const TUTOR_TIMING_EVENTS = [
  "learner-started-speaking",
  "learner-stopped-speaking",
  "short-silence",
  "prolonged-silence",
] as const;
export const TUTOR_ACTION_KINDS = [
  "listen",
  "wait",
  "play-target-word",
  "play-current-ayah",
  "ask-target-word",
  "ask-full-ayah",
  "offer-hint",
  "show-hint",
  "repeat-current-instruction",
  "continue-recitation",
  "hold-uncertain",
  "pause-session",
  "resume-session",
  "complete-session",
  "end-session",
  "refresh-session",
] as const;

export type LiveTutorMode = (typeof LIVE_TUTOR_MODES)[number];
export type LiveTutorPhase = (typeof LIVE_TUTOR_PHASES)[number];
export type LearnerIntent = TutorIntent;
export type TutorTimingEvent = (typeof TUTOR_TIMING_EVENTS)[number];
export type TutorActionKind = (typeof TUTOR_ACTION_KINDS)[number];
export type HintLevel = 0 | 1 | 2 | 3;
export type TutorHintKind = "next-word-cue" | "target-word" | "trusted-word-audio" | "trusted-ayah-audio";
export type TutorEvidenceCategory =
  | "none"
  | "learner-intent"
  | "timing"
  | "ayah-strong"
  | "ayah-partial"
  | "focused-word"
  | "correction-text"
  | "uncertain"
  | "stale";

type ResumableTutorPhase = Exclude<LiveTutorPhase, "paused" | "completed" | "stopped">;

/** Ephemeral teaching state. Existing memorization history remains separate. */
export type LiveTutorSession = {
  sessionId: string;
  revision: number;
  mode: LiveTutorMode;
  surah: number;
  ayah: number;
  totalAyahs: number;
  expectedWordIndex: number;
  lastCompletedAyah: number | null;
  phase: LiveTutorPhase;
  phaseBeforePause: ResumableTutorPhase | null;
  activeCorrection: CorrectionSessionSnapshot | null;
  lastTutorAction: TutorActionKind | null;
  hintLevel: HintLevel;
  learnerLanguage: SupportedLanguageCode;
};

export type TutorAction = {
  kind: TutorActionKind;
  reason: TutorActionReason;
  evidence: TutorEvidenceCategory;
  surah: number;
  ayah: number;
  targetWordIndex: number | null;
  targetArabic: string | null;
  hintLevel: HintLevel;
  hint: { kind: TutorHintKind; wordIndex: number | null } | null;
  repeatAction: TutorActionKind | null;
  /** True only when trusted Quran evidence advanced the verse position. */
  canAdvance: boolean;
};

export type TutorActionReason =
  | "session-ready"
  | "learner-started"
  | "learner-again"
  | "target-requested"
  | "target-audio-requested"
  | "ayah-audio-requested"
  | "hint-requested"
  | "help-may-be-useful"
  | "full-ayah-requested"
  | "continue-at-valid-position"
  | "correction-blocks-continue"
  | "session-paused"
  | "session-resumed"
  | "session-stopped"
  | "learner-speaking"
  | "learner-stopped"
  | "remain-quiet"
  | "text-correction-active"
  | "target-recognised"
  | "target-not-recognised"
  | "recitation-uncertain"
  | "ayah-completed"
  | "surah-completed"
  | "partial-recitation"
  | "no-active-target"
  | "stale-session"
  | "inconsistent-evidence";

/** The bounded subset of #53 output consumed by the tutor. No transcript. */
export type TutorRecitationEvidence = {
  scope: RecitationAttemptScope;
  surah: number;
  ayah: number;
  verseFollowing: VerseFollowingResult;
  correctionSession: CorrectionSessionSnapshot | null;
  focusedWordResult: FocusedWordResult | null;
};

export type LiveTutorEvent =
  | { type: "intent"; intent: LearnerIntent }
  | { type: "timing"; timing: TutorTimingEvent }
  | { type: "recitation"; evidence: TutorRecitationEvidence };

export type LiveTutorTurn = {
  session: LiveTutorSession;
  action: TutorAction;
  accepted: boolean;
};

export type LiveTutorTrace = {
  phase: LiveTutorPhase;
  action: TutorActionKind;
  intent: LearnerIntent | null;
  evidence: TutorEvidenceCategory;
  surah: number;
  ayah: number;
  targetWordIndex: number | null;
};

export function createLiveTutorSession(input: {
  sessionId: string;
  mode: LiveTutorMode;
  surah: number;
  ayah: number;
  totalAyahs: number;
  learnerLanguage: SupportedLanguageCode;
}): LiveTutorTurn {
  if (!input.sessionId || input.surah < 1 || input.surah > 114 || input.ayah < 1 || input.ayah > input.totalAyahs) {
    throw new Error("Invalid live tutor starting position");
  }
  const session: LiveTutorSession = {
    ...input,
    revision: 0,
    expectedWordIndex: 1,
    lastCompletedAyah: null,
    phase: "ready",
    phaseBeforePause: null,
    activeCorrection: null,
    lastTutorAction: "listen",
    hintLevel: 0,
  };
  return { session, action: makeAction(session, "listen", "session-ready", "none"), accepted: true };
}

function makeAction(
  session: LiveTutorSession,
  kind: TutorActionKind,
  reason: TutorActionReason,
  evidence: TutorEvidenceCategory,
  options: {
    canAdvance?: boolean;
    hint?: TutorAction["hint"];
    repeatAction?: TutorActionKind | null;
  } = {},
): TutorAction {
  return {
    kind,
    reason,
    evidence,
    surah: session.surah,
    ayah: session.ayah,
    targetWordIndex: session.activeCorrection?.targetWordIndex ?? null,
    targetArabic: session.activeCorrection?.targetArabic ?? null,
    hintLevel: session.hintLevel,
    hint: options.hint ?? null,
    repeatAction: options.repeatAction ?? null,
    canAdvance: options.canAdvance ?? false,
  };
}

function transition(
  session: LiveTutorSession,
  patch: Partial<LiveTutorSession>,
  kind: TutorActionKind,
  reason: TutorActionReason,
  evidence: TutorEvidenceCategory,
  options: Parameters<typeof makeAction>[4] & { preserveInstruction?: boolean } = {},
): LiveTutorTurn {
  const next: LiveTutorSession = {
    ...session,
    ...patch,
    revision: session.revision + 1,
    lastTutorAction: options.preserveInstruction ? session.lastTutorAction : kind,
  };
  return { session: next, action: makeAction(next, kind, reason, evidence, options), accepted: true };
}

function reject(session: LiveTutorSession, reason: "stale-session" | "inconsistent-evidence"): LiveTutorTurn {
  return {
    session,
    action: makeAction(session, "refresh-session", reason, "stale"),
    accepted: false,
  };
}

function sameCorrection(left: CorrectionSessionSnapshot, right: CorrectionSessionSnapshot): boolean {
  return left.surah === right.surah && left.ayah === right.ayah &&
    left.targetWordIndex === right.targetWordIndex && left.targetArabic === right.targetArabic;
}

function validateRecitationEvidence(session: LiveTutorSession, evidence: TutorRecitationEvidence): boolean {
  if (session.phase === "paused" || session.phase === "completed" || session.phase === "stopped") return false;
  if (evidence.surah !== session.surah || evidence.ayah !== session.ayah) return false;
  if (evidence.verseFollowing.currentSurah !== session.surah) return false;

  if (evidence.scope === "word") {
    const correction = evidence.correctionSession;
    if (!session.activeCorrection || !correction || !evidence.focusedWordResult) return false;
    if (!sameCorrection(session.activeCorrection, correction)) return false;
    if (correction.recognition !== evidence.focusedWordResult.recognition) return false;
    if (evidence.verseFollowing.currentAyah !== session.ayah || evidence.verseFollowing.shouldAdvance) return false;
    if (evidence.verseFollowing.lastCompletedAyah !== session.lastCompletedAyah) return false;
    return correction.recognition === "recognised" ? correction.stage === "recite-ayah" : correction.stage === "say-word";
  }

  if (evidence.focusedWordResult !== null) return false;
  const follow = evidence.verseFollowing;
  if (follow.reason === "ayah_completed") {
    return follow.evidence === "strong" && follow.shouldAdvance && follow.currentAyah === session.ayah + 1 &&
      follow.lastCompletedAyah === session.ayah && follow.currentAyah <= session.totalAyahs && evidence.correctionSession === null;
  }
  if (follow.reason === "surah_completed") {
    return follow.evidence === "strong" && !follow.shouldAdvance && session.ayah === session.totalAyahs &&
      follow.currentAyah === session.ayah && follow.lastCompletedAyah === session.ayah && evidence.correctionSession === null;
  }
  if (follow.currentAyah !== session.ayah || follow.shouldAdvance || follow.lastCompletedAyah !== session.lastCompletedAyah) return false;
  if (evidence.correctionSession) {
    return evidence.correctionSession.surah === session.surah && evidence.correctionSession.ayah === session.ayah &&
      evidence.correctionSession.targetWordIndex > 0 && evidence.correctionSession.recognition !== "recognised";
  }
  return true;
}

function hintFor(session: LiveTutorSession, level: HintLevel): TutorAction["hint"] {
  const wordIndex = session.activeCorrection?.targetWordIndex ?? session.expectedWordIndex;
  if (level === 1) return { kind: "next-word-cue", wordIndex };
  if (level === 2) return { kind: "target-word", wordIndex };
  return {
    kind: session.activeCorrection ? "trusted-word-audio" : "trusted-ayah-audio",
    wordIndex: session.activeCorrection ? wordIndex : null,
  };
}

function applyIntent(session: LiveTutorSession, intent: LearnerIntent): LiveTutorTurn {
  if (intent === "stop") return transition(session, { phase: "stopped", phaseBeforePause: null }, "end-session", "session-stopped", "learner-intent");
  if (session.phase === "stopped") return transition(session, {}, "end-session", "session-stopped", "learner-intent");
  if (session.phase === "completed") return transition(session, {}, "complete-session", "surah-completed", "learner-intent");

  if (intent === "pause") {
    if (session.phase === "paused") {
      return transition(session, {}, "pause-session", "session-paused", "learner-intent", { preserveInstruction: true });
    }
    return transition(
      session,
      { phase: "paused", phaseBeforePause: session.phase as ResumableTutorPhase },
      "pause-session",
      "session-paused",
      "learner-intent",
      { preserveInstruction: true },
    );
  }
  if (session.phase === "paused") {
    if (intent !== "resume") {
      return transition(session, {}, "pause-session", "session-paused", "learner-intent", { preserveInstruction: true });
    }
    const phase = session.phaseBeforePause ?? "ready";
    return transition(
      session,
      { phase, phaseBeforePause: null },
      "resume-session",
      "session-resumed",
      "learner-intent",
      { preserveInstruction: true },
    );
  }
  if (intent === "resume") {
    return transition(session, {}, "repeat-current-instruction", "learner-again", "learner-intent", {
      repeatAction: session.lastTutorAction,
      preserveInstruction: true,
    });
  }

  switch (intent) {
    case "start":
      return transition(session, { phase: "listening" }, "listen", "learner-started", "learner-intent");
    case "again":
      return transition(session, {}, "repeat-current-instruction", "learner-again", "learner-intent", {
        repeatAction: session.lastTutorAction,
        preserveInstruction: true,
      });
    case "hear-word":
      return session.activeCorrection
        ? transition(session, {}, "play-target-word", "target-audio-requested", "learner-intent")
        : transition(session, {}, "hold-uncertain", "no-active-target", "learner-intent");
    case "repeat-word":
      return session.activeCorrection
        ? transition(session, { phase: "correcting-word" }, "ask-target-word", "target-requested", "learner-intent")
        : transition(session, {}, "hold-uncertain", "no-active-target", "learner-intent");
    case "hear-ayah":
      return transition(session, {}, "play-current-ayah", "ayah-audio-requested", "learner-intent");
    case "hint": {
      const hintLevel = Math.min(3, session.hintLevel + 1) as HintLevel;
      return transition(session, { hintLevel }, "show-hint", "hint-requested", "learner-intent", { hint: hintFor(session, hintLevel) });
    }
    case "from-beginning":
      return transition(session, { phase: "recite-ayah" }, "ask-full-ayah", "full-ayah-requested", "learner-intent");
    case "continue":
      if (session.activeCorrection) {
        const needsAyah = session.activeCorrection.stage === "recite-ayah" || session.activeCorrection.recognition === "recognised";
        return transition(
          session,
          { phase: needsAyah ? "recite-ayah" : "correcting-word" },
          needsAyah ? "ask-full-ayah" : "ask-target-word",
          "correction-blocks-continue",
          "learner-intent",
        );
      }
      return transition(session, { phase: "listening" }, "continue-recitation", "continue-at-valid-position", "learner-intent");
  }
}

function applyTiming(session: LiveTutorSession, timing: TutorTimingEvent): LiveTutorTurn {
  if (session.phase === "paused") return transition(session, {}, "pause-session", "session-paused", "timing");
  if (session.phase === "stopped") return transition(session, {}, "end-session", "session-stopped", "timing");
  if (session.phase === "completed") return transition(session, {}, "complete-session", "surah-completed", "timing");

  switch (timing) {
    case "learner-started-speaking":
      return transition(session, { phase: "listening" }, "listen", "learner-speaking", "timing", { preserveInstruction: true });
    case "learner-stopped-speaking":
      return transition(session, { phase: "waiting" }, "wait", "learner-stopped", "timing", { preserveInstruction: true });
    case "short-silence":
      return transition(session, {}, "wait", "remain-quiet", "timing", { preserveInstruction: true });
    case "prolonged-silence":
      return session.mode === "memorization"
        ? transition(session, {}, "offer-hint", "help-may-be-useful", "timing")
        : transition(session, {}, "wait", "remain-quiet", "timing", { preserveInstruction: true });
  }
}

function applyRecitation(session: LiveTutorSession, evidence: TutorRecitationEvidence): LiveTutorTurn {
  if (!validateRecitationEvidence(session, evidence)) return reject(session, "inconsistent-evidence");

  if (evidence.scope === "word") {
    const correction = evidence.correctionSession as CorrectionSessionSnapshot;
    if (correction.recognition === "recognised") {
      return transition(
        session,
        { phase: "recite-ayah", activeCorrection: correction, hintLevel: 0 },
        "ask-full-ayah",
        "target-recognised",
        "focused-word",
      );
    }
    if (correction.recognition === "not-recognised") {
      return transition(
        session,
        { phase: "correcting-word", activeCorrection: correction },
        "ask-target-word",
        "target-not-recognised",
        "focused-word",
      );
    }
    return transition(
      session,
      { phase: "correcting-word", activeCorrection: correction },
      "hold-uncertain",
      "recitation-uncertain",
      "uncertain",
    );
  }

  const follow = evidence.verseFollowing;
  if (follow.reason === "ayah_completed") {
    return transition(
      session,
      {
        ayah: follow.currentAyah,
        expectedWordIndex: follow.expectedWordIndex,
        lastCompletedAyah: follow.lastCompletedAyah,
        phase: "listening",
        activeCorrection: null,
        hintLevel: 0,
      },
      "continue-recitation",
      "ayah-completed",
      "ayah-strong",
      { canAdvance: true },
    );
  }
  if (follow.reason === "surah_completed") {
    return transition(
      session,
      { expectedWordIndex: follow.expectedWordIndex, lastCompletedAyah: follow.lastCompletedAyah, phase: "completed", activeCorrection: null },
      "complete-session",
      "surah-completed",
      "ayah-strong",
    );
  }
  if (evidence.correctionSession) {
    return transition(
      session,
      {
        expectedWordIndex: follow.expectedWordIndex,
        phase: "correcting-word",
        activeCorrection: evidence.correctionSession,
        hintLevel: 0,
      },
      "play-target-word",
      "text-correction-active",
      "correction-text",
    );
  }
  if (follow.evidence === "none" || follow.evidence === "weak" || follow.state === "uncertain") {
    return transition(session, { phase: "waiting" }, "hold-uncertain", "recitation-uncertain", "uncertain");
  }
  if (session.activeCorrection) {
    return transition(session, { phase: "recite-ayah" }, "ask-full-ayah", "partial-recitation", "ayah-partial");
  }
  return transition(
    session,
    { phase: "listening", expectedWordIndex: follow.expectedWordIndex },
    "continue-recitation",
    "partial-recitation",
    "ayah-partial",
  );
}

export function applyLiveTutorEvent(session: LiveTutorSession, event: LiveTutorEvent): LiveTutorTurn {
  if (event.type === "intent") return applyIntent(session, event.intent);
  if (event.type === "timing") return applyTiming(session, event.timing);
  return applyRecitation(session, event.evidence);
}

export function staleLiveTutorTurn(session: LiveTutorSession): LiveTutorTurn {
  return reject(session, "stale-session");
}

export function traceLiveTutorTurn(event: LiveTutorEvent | null, turn: LiveTutorTurn): LiveTutorTrace {
  return {
    phase: turn.session.phase,
    action: turn.action.kind,
    intent: event?.type === "intent" ? event.intent : null,
    evidence: turn.action.evidence,
    surah: turn.session.surah,
    ayah: turn.session.ayah,
    targetWordIndex: turn.action.targetWordIndex,
  };
}
