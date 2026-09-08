/**
 * The translation between the engine's vocabulary and the panel's.
 *
 * What these hold: the client concludes nothing about a recitation. Every state
 * below is produced by a phase and an action the server supplied, and there is
 * no path that reads a score, a transcript or an alignment to decide that a
 * word was missed, heard, or good enough to move on.
 */
import { describe, expect, it } from "vitest";
import { attemptScopeFor, liveTutorSessionView, type LiveTutorViewInput } from "./liveTutorView";
import type { LiveTutorPhase, LiveTutorSession, TutorAction, TutorActionKind, TutorActionReason } from "@shared/liveTutor";
import type { CorrectionSessionSnapshot } from "@shared/wordCorrection";

const CORRECTION: CorrectionSessionSnapshot = {
  surah: 1,
  ayah: 2,
  targetWordIndex: 3,
  targetArabic: "رَبِّ",
  stage: "say-word",
  recognition: "not-recognised",
};

function session(phase: LiveTutorPhase, patch: Partial<LiveTutorSession> = {}): LiveTutorSession {
  return {
    sessionId: "s1", revision: 1, mode: "guided-recitation",
    surah: 1, ayah: 2, totalAyahs: 7, expectedWordIndex: 1, lastCompletedAyah: null,
    phase, phaseBeforePause: null, activeCorrection: null, lastTutorAction: null,
    hintLevel: 0, learnerLanguage: "en", ...patch,
  };
}

function action(kind: TutorActionKind, reason: TutorActionReason, patch: Partial<TutorAction> = {}): TutorAction {
  return {
    kind, reason, evidence: "none", surah: 1, ayah: 2,
    targetWordIndex: null, targetArabic: null, hintLevel: 0, hint: null,
    repeatAction: null, canAdvance: false, ...patch,
  };
}

const input = (patch: Partial<LiveTutorViewInput> = {}): LiveTutorViewInput => ({
  session: session("ready"),
  action: action("listen", "session-ready"),
  canHearWord: true,
  canHearAyah: true,
  isRecording: false,
  isChecking: false,
  ...patch,
});

const stateOf = (patch: Partial<LiveTutorViewInput>, words = 4) => liveTutorSessionView(input(patch), words).state;

describe("the engine's phase decides the lesson state", () => {
  it("maps the phases the engine declares", () => {
    expect(stateOf({ session: session("ready") })).toBe("ready");
    expect(stateOf({ session: session("listening") })).toBe("listening");
    expect(stateOf({ session: session("paused") })).toBe("paused");
    expect(stateOf({ session: session("completed") })).toBe("complete");
    expect(stateOf({ session: session("stopped") })).toBe("complete");
  });

  it("shows a correction only while the engine holds one open", () => {
    expect(stateOf({ session: session("correcting-word", { activeCorrection: CORRECTION }) })).toBe("correction");
  });

  it("separates hearing the word from being asked for the ayah", () => {
    // The engine has one `recite-ayah` phase; a teacher says two things.
    expect(stateOf({
      session: session("recite-ayah", { activeCorrection: { ...CORRECTION, recognition: "recognised", stage: "recite-ayah" } }),
      action: action("ask-full-ayah", "target-recognised"),
    })).toBe("word-recognised");

    expect(stateOf({
      session: session("recite-ayah", { activeCorrection: { ...CORRECTION, recognition: "recognised", stage: "recite-ayah" } }),
      action: action("ask-full-ayah", "full-ayah-requested"),
    })).toBe("recite-ayah");
  });

  it("reads the engine's abstention as uncertainty, not as a fault", () => {
    expect(stateOf({ session: session("waiting"), action: action("hold-uncertain", "recitation-uncertain") })).toBe("uncertain");
    // Waiting for more of the same recitation is not an accusation.
    expect(stateOf({ session: session("waiting"), action: action("wait", "remain-quiet") })).toBe("listening");
  });

  it("shows the hint the engine chose to give", () => {
    expect(stateOf({
      session: session("correcting-word", { activeCorrection: CORRECTION }),
      action: action("show-hint", "hint-requested"),
    })).toBe("hint");
  });

  it("lets the microphone and the reviewer outrank the phase", () => {
    // Nothing is settled while an attempt is in flight, whatever the last
    // phase was.
    expect(stateOf({ session: session("correcting-word", { activeCorrection: CORRECTION }), isRecording: true })).toBe("listening");
    expect(stateOf({ session: session("correcting-word", { activeCorrection: CORRECTION }), isChecking: true })).toBe("checking");
  });

  it("falls back to listening rather than inventing a state", () => {
    expect(stateOf({ session: session("nonsense" as LiveTutorPhase) })).toBe("listening");
  });
});

describe("the target is the engine's, or there is none", () => {
  it("passes the engine's own word through", () => {
    const result = liveTutorSessionView(input({ session: session("correcting-word", { activeCorrection: CORRECTION }) }), 4);
    expect(result.target).toEqual({ arabic: "رَبِّ", wordIndex: 3, totalWords: 4 });
  });

  it("shows none when the engine holds none", () => {
    expect(liveTutorSessionView(input({ session: session("listening") }), 4).target).toBeNull();
  });

  it("drops a target the ayah on screen cannot support", () => {
    // The same rule the focused lesson gained in #50: word 3 of a two-word ayah
    // is a word that ayah does not have.
    expect(liveTutorSessionView(input({ session: session("correcting-word", { activeCorrection: CORRECTION }) }), 2).target).toBeNull();
  });

  it("drops a target from another ayah", () => {
    const elsewhere = { ...CORRECTION, ayah: 3 };
    expect(liveTutorSessionView(input({ session: session("correcting-word", { activeCorrection: elsewhere }) }), 4).target).toBeNull();
  });
});

describe("the recording scope comes from the engine's own request", () => {
  it("is a word for the whole of a correction, not just the turn that asks", () => {
    // The engine says "listen to it" and then "now say it"; both are the same
    // piece of work, and reading only the action kind would submit a word
    // attempt as an ayah attempt on every turn but one (#53).
    for (const kind of ["play-target-word", "ask-target-word", "repeat-current-instruction"] as const) {
      expect(attemptScopeFor(session("correcting-word", { activeCorrection: CORRECTION }), action(kind, "target-requested")), kind).toBe("word");
    }
  });

  it("is the ayah for everything else", () => {
    for (const kind of ["ask-full-ayah", "listen", "continue-recitation", "wait"] as const) {
      expect(attemptScopeFor(session("listening"), action(kind, "learner-again")), kind).toBe("ayah");
    }
    expect(attemptScopeFor(session("recite-ayah"), action("ask-full-ayah", "full-ayah-requested"))).toBe("ayah");
  });
});

describe("audio availability is passed through, never assumed", () => {
  it("reports what the page found", () => {
    const result = liveTutorSessionView(input({ canHearWord: false, canHearAyah: false }), 4);
    expect(result.canHearWord).toBe(false);
    expect(result.canHearAyah).toBe(false);
  });

  it("offers a hint only when the engine supplied one", () => {
    expect(liveTutorSessionView(input(), 4).hintAvailable).toBe(false);
    const offered = liveTutorSessionView(input({ action: action("offer-hint", "help-may-be-useful") }), 4);
    expect(offered.hintAvailable).toBe(true);
    const shown = liveTutorSessionView(input({
      action: action("show-hint", "hint-requested", { hint: { kind: "target-word", wordIndex: 3 } }),
    }), 4);
    expect(shown.hintShown).toBe(true);
  });
});
