import { describe, expect, it } from "vitest";
import type { VerseFollowingResult } from "./verseFollowing";
import type { CorrectionSessionSnapshot } from "./wordCorrection";
import {
  applyLiveTutorEvent,
  createLiveTutorSession,
  traceLiveTutorTurn,
  type LiveTutorMode,
  type LiveTutorSession,
  type TutorRecitationEvidence,
} from "./liveTutor";

const TARGET: CorrectionSessionSnapshot = {
  surah: 1,
  ayah: 2,
  targetWordIndex: 3,
  targetArabic: "رَبِّ",
  stage: "hear",
  recognition: "not-recognised",
  attemptsOnTarget: 0,
};

function started(mode: LiveTutorMode = "guided-recitation", ayah = 2, totalAyahs = 7): LiveTutorSession {
  return createLiveTutorSession({ sessionId: "tutor-1", mode, surah: 1, ayah, totalAyahs, learnerLanguage: "ps" }).session;
}

function follow(patch: Partial<VerseFollowingResult> = {}): VerseFollowingResult {
  return {
    currentSurah: 1,
    currentAyah: 2,
    expectedWordIndex: 3,
    lastCompletedAyah: null,
    state: "correcting",
    attemptsOnCurrentAyah: 1,
    evidence: "partial",
    shouldAdvance: false,
    nextAyah: 3,
    correctionFocus: { wordIndex: 3, expectedArabic: "رَبِّ", kind: "missing" },
    reason: "mistake_to_correct",
    ...patch,
  };
}

function ayahEvidence(patch: Partial<TutorRecitationEvidence> = {}): TutorRecitationEvidence {
  return {
    scope: "ayah",
    surah: 1,
    ayah: 2,
    verseFollowing: follow(),
    correctionSession: TARGET,
    focusedWordResult: null,
    ...patch,
  };
}

function correctedWord(recognition: "recognised" | "not-recognised" | "unknown" = "recognised"): TutorRecitationEvidence {
  const correctionSession: CorrectionSessionSnapshot = {
    ...TARGET,
    stage: recognition === "recognised" ? "recite-ayah" : "say-word",
    recognition,
    attemptsOnTarget: 1,
  };
  return {
    scope: "word",
    surah: 1,
    ayah: 2,
    verseFollowing: follow({
      state: "correcting",
      correctionFocus: recognition === "not-recognised"
        ? { wordIndex: 3, expectedArabic: "رَبِّ", kind: "review" }
        : null,
      reason: recognition === "not-recognised" ? "mistake_to_correct" : recognition === "recognised" ? "partial_progress" : "too_little_evidence",
      evidence: recognition === "unknown" ? "none" : "partial",
    }),
    correctionSession,
    focusedWordResult: {
      recognition,
      reason: recognition === "recognised" ? "target_recognised" : recognition === "not-recognised" ? "different_word" : "ambiguous_transcript",
    },
  };
}

function enterCorrection(session = started()) {
  return applyLiveTutorEvent(session, { type: "recitation", evidence: ayahEvidence() });
}

function completedAyahEvidence(): TutorRecitationEvidence {
  return ayahEvidence({
    verseFollowing: follow({
      currentAyah: 3,
      expectedWordIndex: 1,
      lastCompletedAyah: 2,
      state: "following",
      attemptsOnCurrentAyah: 0,
      evidence: "strong",
      shouldAdvance: true,
      nextAyah: 4,
      correctionFocus: null,
      reason: "ayah_completed",
    }),
    correctionSession: null,
  });
}

describe("Live Tutor session contract", () => {
  it("begins a new multilingual session at the requested valid ayah", () => {
    const turn = createLiveTutorSession({
      sessionId: "session-a",
      mode: "memorization",
      surah: 1,
      ayah: 2,
      totalAyahs: 7,
      learnerLanguage: "ur",
    });
    expect(turn.session).toMatchObject({
      sessionId: "session-a",
      mode: "memorization",
      surah: 1,
      ayah: 2,
      phase: "ready",
      learnerLanguage: "ur",
      activeCorrection: null,
    });
    expect(turn.action).toMatchObject({ kind: "listen", canAdvance: false });
  });

  it("rejects a starting ayah outside the known surah bounds", () => {
    expect(() => createLiveTutorSession({
      sessionId: "bad",
      mode: "guided-recitation",
      surah: 1,
      ayah: 8,
      totalAyahs: 7,
      learnerLanguage: "en",
    })).toThrow(/starting position/);
  });
});

describe("Quran evidence controls progression", () => {
  it("continues to the next ayah only after strong ayah-completion evidence", () => {
    const turn = applyLiveTutorEvent(started(), { type: "recitation", evidence: completedAyahEvidence() });
    expect(turn.session).toMatchObject({ ayah: 3, lastCompletedAyah: 2, phase: "listening", activeCorrection: null });
    expect(turn.action).toMatchObject({ kind: "continue-recitation", reason: "ayah-completed", canAdvance: true });
    expect(turn.action.nextChannel).toBe("listen-next-ayah");
  });

  it("enters exact-word correction when #53 names missing رَبِّ", () => {
    const turn = enterCorrection();
    expect(turn.session).toMatchObject({ phase: "correcting-word", ayah: 2, activeCorrection: TARGET });
    expect(turn.action).toMatchObject({
      kind: "play-target-word",
      targetWordIndex: 3,
      targetArabic: "رَبِّ",
      nextChannel: "play-target-word",
      canAdvance: false,
    });
  });

  it("keeps the same ayah and asks for the full ayah after the target is recognised", () => {
    const correction = enterCorrection().session;
    const turn = applyLiveTutorEvent(correction, { type: "recitation", evidence: correctedWord() });
    expect(turn.session).toMatchObject({ ayah: 2, lastCompletedAyah: null, phase: "recite-ayah" });
    expect(turn.action).toMatchObject({ kind: "ask-full-ayah", reason: "target-recognised", canAdvance: false });
    expect(turn.action.nextChannel).toBe("listen-for-full-ayah");
  });

  it("completes detect, focus, word recognition, full-ayah retry, then advance", () => {
    const correction = enterCorrection().session;
    const word = applyLiveTutorEvent(correction, { type: "recitation", evidence: correctedWord() });
    const ayah = applyLiveTutorEvent(word.session, { type: "recitation", evidence: completedAyahEvidence() });
    expect(ayah.accepted).toBe(true);
    expect(ayah.session).toMatchObject({ ayah: 3, lastCompletedAyah: 2, activeCorrection: null, phase: "listening" });
    expect(ayah.action.canAdvance).toBe(true);
  });

  it("never updates lastCompletedAyah from focused-word success alone", () => {
    const correction = enterCorrection().session;
    const turn = applyLiveTutorEvent(correction, { type: "recitation", evidence: correctedWord() });
    expect(turn.session.lastCompletedAyah).toBe(correction.lastCompletedAyah);
    expect(turn.session.ayah).toBe(correction.ayah);
    expect(turn.action.canAdvance).toBe(false);
  });

  it("does not request more listening after trusted surah completion", () => {
    const session = started("guided-recitation", 7, 7);
    const evidence: TutorRecitationEvidence = {
      scope: "ayah",
      surah: 1,
      ayah: 7,
      verseFollowing: {
        currentSurah: 1,
        currentAyah: 7,
        expectedWordIndex: 1,
        lastCompletedAyah: 7,
        state: "completed",
        attemptsOnCurrentAyah: 0,
        evidence: "strong",
        shouldAdvance: false,
        nextAyah: null,
        correctionFocus: null,
        reason: "surah_completed",
      },
      correctionSession: null,
      focusedWordResult: null,
    };
    const turn = applyLiveTutorEvent(session, { type: "recitation", evidence });
    expect(turn.session.phase).toBe("completed");
    expect(turn.action).toMatchObject({ kind: "complete-session", nextChannel: "do-not-listen", canAdvance: false });
  });

  it("holds position on uncertain recitation evidence", () => {
    const evidence = ayahEvidence({
      verseFollowing: follow({ state: "uncertain", evidence: "weak", reason: "too_little_evidence", correctionFocus: null }),
      correctionSession: null,
    });
    const turn = applyLiveTutorEvent(started(), { type: "recitation", evidence });
    expect(turn.session).toMatchObject({ ayah: 2, lastCompletedAyah: null, phase: "waiting" });
    expect(turn.action).toMatchObject({ kind: "hold-uncertain", canAdvance: false });
    expect(turn.action.nextChannel).toBe("keep-listening");
  });

  it("fails closed when correction evidence names a stale target", () => {
    const correction = enterCorrection().session;
    const stale = correctedWord();
    stale.correctionSession = { ...stale.correctionSession!, targetWordIndex: 4, targetArabic: "ٱلْعَـٰلَمِينَ" };
    const turn = applyLiveTutorEvent(correction, { type: "recitation", evidence: stale });
    expect(turn.accepted).toBe(false);
    expect(turn.session).toEqual(correction);
    expect(turn.action).toMatchObject({ kind: "refresh-session", evidence: "stale", canAdvance: false });
  });

  it("rejects a fabricated advancement shape", () => {
    const forged = completedAyahEvidence();
    forged.verseFollowing = { ...forged.verseFollowing, evidence: "partial" };
    const turn = applyLiveTutorEvent(started(), { type: "recitation", evidence: forged });
    expect(turn.accepted).toBe(false);
    expect(turn.session.ayah).toBe(2);
    expect(turn.action.canAdvance).toBe(false);
  });
});

describe("structured learner commands", () => {
  it("does not let continue bypass an unresolved correction", () => {
    const correction = enterCorrection().session;
    const turn = applyLiveTutorEvent(correction, { type: "intent", intent: "continue" });
    expect(turn.session).toMatchObject({ ayah: 2, phase: "correcting-word", activeCorrection: TARGET });
    expect(turn.action).toMatchObject({ kind: "ask-target-word", reason: "correction-blocks-continue", canAdvance: false });
  });

  it("plays the exact active target for hear-word", () => {
    const correction = enterCorrection().session;
    const turn = applyLiveTutorEvent(correction, { type: "intent", intent: "hear-word" });
    expect(turn.action).toMatchObject({ kind: "play-target-word", targetWordIndex: 3, targetArabic: "رَبِّ" });
  });

  it("again repeats the current teaching step", () => {
    const correction = enterCorrection().session;
    const turn = applyLiveTutorEvent(correction, { type: "intent", intent: "again" });
    expect(turn.action).toMatchObject({ kind: "repeat-current-instruction", repeatAction: "play-target-word" });
    expect(turn.session.lastTutorAction).toBe("play-target-word");
  });

  it("passive timing events do not replace the teaching step repeated by again", () => {
    const correction = enterCorrection().session;
    const quiet = applyLiveTutorEvent(correction, { type: "timing", timing: "short-silence" });
    const turn = applyLiveTutorEvent(quiet.session, { type: "intent", intent: "again" });
    expect(quiet.action.kind).toBe("wait");
    expect(turn.action).toMatchObject({ kind: "repeat-current-instruction", repeatAction: "play-target-word" });
  });

  it("from-beginning requests the current full ayah without moving backward", () => {
    const correction = enterCorrection().session;
    const turn = applyLiveTutorEvent(correction, { type: "intent", intent: "from-beginning" });
    expect(turn.session).toMatchObject({ surah: 1, ayah: 2, phase: "recite-ayah" });
    expect(turn.action).toMatchObject({ kind: "ask-full-ayah", canAdvance: false });
  });

  it("pause and resume preserve the exact lesson and correction", () => {
    const correction = enterCorrection().session;
    const paused = applyLiveTutorEvent(correction, { type: "intent", intent: "pause" });
    const resumed = applyLiveTutorEvent(paused.session, { type: "intent", intent: "resume" });
    expect(paused.session).toMatchObject({ phase: "paused", ayah: 2, activeCorrection: TARGET });
    expect(paused.action.nextChannel).toBe("do-not-listen");
    expect(resumed.session).toMatchObject({ phase: "correcting-word", ayah: 2, activeCorrection: TARGET });
    expect(resumed.action.kind).toBe("resume-session");
    expect(resumed.action.nextChannel).toBe("listen-for-target-word");
  });

  it("stop ends the session without inventing completion", () => {
    const session = enterCorrection().session;
    const turn = applyLiveTutorEvent(session, { type: "intent", intent: "stop" });
    expect(turn.session).toMatchObject({ phase: "stopped", ayah: 2, lastCompletedAyah: null });
    expect(turn.action).toMatchObject({ kind: "end-session", nextChannel: "do-not-listen", canAdvance: false });
  });
});

describe("hints and future timing events", () => {
  it("progresses hints using indexes and trusted-source actions, never invented Quran text", () => {
    let session = started("memorization");
    const hints = [];
    for (let level = 1; level <= 3; level += 1) {
      const turn = applyLiveTutorEvent(session, { type: "intent", intent: "hint" });
      hints.push(turn.action);
      session = turn.session;
    }
    expect(hints.map((action) => action.hint)).toEqual([
      { kind: "next-word-cue", wordIndex: 1 },
      { kind: "target-word", wordIndex: 1 },
      { kind: "trusted-ayah-audio", wordIndex: null },
    ]);
    expect(hints.every((action) => action.targetArabic === null)).toBe(true);
  });

  it("short silence remains quiet while prolonged memorization silence may offer help", () => {
    const session = started("memorization");
    const short = applyLiveTutorEvent(session, { type: "timing", timing: "short-silence" });
    const prolonged = applyLiveTutorEvent(short.session, { type: "timing", timing: "prolonged-silence" });
    expect(short.action).toMatchObject({ kind: "wait", reason: "remain-quiet", nextChannel: "keep-listening" });
    expect(short.session).toMatchObject({ ayah: 2, lastCompletedAyah: null });
    expect(prolonged.action).toMatchObject({ kind: "offer-hint", reason: "help-may-be-useful" });
    expect(prolonged.session).toMatchObject({ ayah: 2, lastCompletedAyah: null });
    expect(prolonged.session.hintLevel).toBe(0);
  });

  it("emits a transcript-free structural trace", () => {
    const event = { type: "intent", intent: "hear-ayah" } as const;
    const turn = applyLiveTutorEvent(started(), event);
    expect(traceLiveTutorTurn(event, turn)).toEqual({
      phase: "ready",
      action: "play-current-ayah",
      intent: "hear-ayah",
      evidence: "learner-intent",
      surah: 1,
      ayah: 2,
      targetWordIndex: null,
    });
  });
});

import {
  inconsistentLiveTutorTurn,
  recitationOutcome,
  type LiveTutorTurn,
} from "./liveTutor";
import type { VerseFollowingReason } from "./verseFollowing";

describe("correction state machine — the full ayah is required after a correction", () => {
  /** Session after the missed word was recognised: the engine asked for the full ayah. */
  function reciteAyahSession(): LiveTutorSession {
    const correction = enterCorrection();
    const wordTurn = applyLiveTutorEvent(correction.session, { type: "recitation", evidence: correctedWord("recognised") });
    expect(wordTurn.action.kind).toBe("ask-full-ayah");
    return wordTurn.session;
  }

  /** A retry that is too weak to judge: only the corrected word was said. */
  function weakAyahRetry(): TutorRecitationEvidence {
    return ayahEvidence({
      verseFollowing: follow({
        state: "uncertain",
        evidence: "weak",
        reason: "too_little_evidence",
        correctionFocus: null,
        expectedWordIndex: 1,
      }),
      correctionSession: null,
    });
  }

  it("resets the word pointer when the word is recognised, so the retry is judged as a full ayah (T3)", () => {
    const correction = enterCorrection();
    // The miss left the pointer on the missed word.
    expect(correction.session.expectedWordIndex).toBe(3);
    const wordTurn = applyLiveTutorEvent(correction.session, { type: "recitation", evidence: correctedWord("recognised") });
    expect(wordTurn.action.kind).toBe("ask-full-ayah");
    expect(wordTurn.session.phase).toBe("recite-ayah");
    // Asking for the full ayah resets the pointer to the first word: a later
    // attempt is measured against the whole ayah, never a leftover window.
    expect(wordTurn.session.expectedWordIndex).toBe(1);
  });

  it("a word-only retry never advances and keeps the full-ayah requirement (T1)", () => {
    const session = reciteAyahSession();
    const turn = applyLiveTutorEvent(session, { type: "recitation", evidence: weakAyahRetry() });

    expect(turn.action.kind).toBe("hold-uncertain");
    expect(turn.action.canAdvance).toBe(false);
    expect(turn.session.ayah).toBe(2);
    // The lesson still owes the full ayah: phase, correction and the scope the
    // mic reopens in all say so.
    expect(turn.session.phase).toBe("recite-ayah");
    expect(turn.session.activeCorrection?.stage).toBe("recite-ayah");
    expect(turn.action.nextChannel).toBe("listen-for-full-ayah");
  });

  it("a correct full-ayah retry advances and clears the correction (T2)", () => {
    const session = reciteAyahSession();
    const turn = applyLiveTutorEvent(session, { type: "recitation", evidence: completedAyahEvidence() });

    expect(turn.action.kind).toBe("continue-recitation");
    expect(turn.action.canAdvance).toBe(true);
    expect(turn.session.ayah).toBe(3);
    expect(turn.session.activeCorrection).toBeNull();
  });

  it("hold-uncertain reopens the mic in the word scope while the word is still owed (T5 control)", () => {
    const correction = enterCorrection();
    const turn = applyLiveTutorEvent(correction.session, { type: "recitation", evidence: correctedWord("unknown") });

    expect(turn.action.kind).toBe("hold-uncertain");
    expect(turn.action.nextChannel).toBe("listen-for-target-word");
  });
});

describe("recitationOutcome — one authoritative verdict per turn", () => {
  function verdict(turn: LiveTutorTurn, reason: VerseFollowingReason | null = null) {
    return recitationOutcome({ session: turn.session, action: turn.action, accepted: turn.accepted }, reason);
  }

  function reciteAyahSession(): LiveTutorSession {
    const correction = enterCorrection();
    return applyLiveTutorEvent(correction.session, { type: "recitation", evidence: correctedWord("recognised") }).session;
  }

  function weakAyahRetry(): TutorRecitationEvidence {
    return ayahEvidence({
      verseFollowing: follow({
        state: "uncertain",
        evidence: "weak",
        reason: "too_little_evidence",
        correctionFocus: null,
        expectedWordIndex: 1,
      }),
      correctionSession: null,
    });
  }

  it("accepted only when an ayah completed with advancement", () => {
    const turn = applyLiveTutorEvent(reciteAyahSession(), { type: "recitation", evidence: completedAyahEvidence() });
    expect(verdict(turn)).toBe("accepted");
  });

  it("correction_required while a correction is open", () => {
    const correction = enterCorrection();
    expect(verdict(correction)).toBe("correction_required");
    const wordTurn = applyLiveTutorEvent(correction.session, { type: "recitation", evidence: correctedWord("recognised") });
    expect(verdict(wordTurn)).toBe("correction_required");
  });

  it("insufficient_evidence for an uncertain turn, never accepted", () => {
    const turn = applyLiveTutorEvent(reciteAyahSession(), { type: "recitation", evidence: weakAyahRetry() });
    expect(verdict(turn)).toBe("insufficient_evidence");
    expect(turn.action.canAdvance).toBe(false);
  });

  it("ambiguous when the weak attempt fit a neighbouring ayah", () => {
    const turn = applyLiveTutorEvent(reciteAyahSession(), { type: "recitation", evidence: weakAyahRetry() });
    expect(verdict(turn, "previous_ayah_repeated")).toBe("ambiguous");
    expect(verdict(turn, "next_ayah_started_early")).toBe("ambiguous");
    // Without a neighbour reason the same turn is uncertain, not ambiguous.
    expect(verdict(turn, "too_little_evidence")).toBe("insufficient_evidence");
  });

  it("retry for partial progress with no correction open", () => {
    const turn = applyLiveTutorEvent(started(), {
      type: "recitation",
      evidence: ayahEvidence({
        verseFollowing: follow({ reason: "partial_progress", evidence: "partial", correctionFocus: null }),
        correctionSession: null,
      }),
    });
    expect(turn.action.kind).toBe("continue-recitation");
    expect(verdict(turn)).toBe("retry");
  });

  it("stopped for a stopped lesson, never a success", () => {
    const stopped = applyLiveTutorEvent(started(), { type: "intent", intent: "stop" });
    expect(verdict(stopped)).toBe("stopped");
  });

  it("null for a rejected turn: no verdict, never a stale success", () => {
    const rejected = inconsistentLiveTutorTurn(started());
    expect(rejected.accepted).toBe(false);
    expect(verdict(rejected)).toBeNull();
  });

  it("null for non-verdict turns such as a pause", () => {
    const paused = applyLiveTutorEvent(started(), { type: "intent", intent: "pause" });
    expect(verdict(paused)).toBeNull();
  });
});

describe("tutor/evaluator agreement invariant", () => {
  it("the verdict signals success exactly when the turn advances or completes the surah", () => {
    const weakRetry = (): TutorRecitationEvidence =>
      ayahEvidence({
        verseFollowing: follow({
          state: "uncertain",
          evidence: "weak",
          reason: "too_little_evidence",
          correctionFocus: null,
          expectedWordIndex: 1,
        }),
        correctionSession: null,
      });

    const correction = enterCorrection();
    const wordOk = applyLiveTutorEvent(correction.session, { type: "recitation", evidence: correctedWord("recognised") });
    const reciteSession = wordOk.session;
    const turns = [
      correction,
      wordOk,
      // A word-only attempt during the full-ayah correction.
      applyLiveTutorEvent(reciteSession, { type: "recitation", evidence: weakRetry() }),
      // A supported full-ayah retry.
      applyLiveTutorEvent(reciteSession, { type: "recitation", evidence: completedAyahEvidence() }),
      // The learner stops instead of retrying.
      applyLiveTutorEvent(reciteSession, { type: "intent", intent: "stop" }),
      // A rejected turn carries no verdict at all.
      inconsistentLiveTutorTurn(reciteSession),
    ];

    for (const turn of turns) {
      const outcome = recitationOutcome(
        { session: turn.session, action: turn.action, accepted: turn.accepted },
        null,
      );
      const signalsSuccess = turn.action.canAdvance || turn.action.kind === "complete-session";
      expect(
        { kind: turn.action.kind, outcome, signalsSuccess },
        `verdict and advancement disagree on ${turn.action.kind}`,
      ).toMatchObject({ outcome: signalsSuccess ? "accepted" : expect.not.stringMatching(/^accepted$/) });
    }
  });
});
