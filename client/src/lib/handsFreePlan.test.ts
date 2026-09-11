/**
 * What the app does by itself, checked against the engine's real turns.
 *
 * Every session and action fed in here comes from `shared/liveTutor.ts` — the
 * actual engine, driven with the actual evidence a review produces. Nothing in
 * this file decides that a word was missed or heard, and nothing in the module
 * under test can: a plan is a translation of the server's own statement into
 * audio and a scope.
 *
 * The assertion that matters most is the negative one. No path through
 * `handsFreePlanFor` produces a step that could carry Quranic Arabic to a
 * speech synthesiser, because the only Quran-bearing steps are trusted
 * recordings and the only spoken step is a locale key from a closed list.
 */
import { describe, expect, it } from "vitest";
import {
  DISPLAY_ONLY_COACH_KEYS,
  HANDS_FREE_TIMING,
  handsFreePlanFor,
  handsFreeScopeFor,
  planIsSilent,
  SPEAKABLE_COACH_KEYS,
  type HandsFreePlan,
} from "./handsFreePlan";
import { applyLiveTutorEvent, createLiveTutorSession, type LiveTutorSession, type LiveTutorTurn, type TutorRecitationEvidence } from "@shared/liveTutor";
import type { VerseFollowingResult } from "@shared/verseFollowing";
import en from "@locales/en";

/** Al-Fatihah 1:2, and the word a learner leaves out of it. */
const AYAH = 2;
const TARGET = "رَبِّ";
const TOTAL_AYAHS = 3;

function opened(): LiveTutorTurn {
  return createLiveTutorSession({
    sessionId: "s-1", mode: "guided-recitation", surah: 1, ayah: AYAH, totalAyahs: TOTAL_AYAHS, learnerLanguage: "en",
  });
}

function follow(patch: Partial<VerseFollowingResult> = {}): VerseFollowingResult {
  return {
    currentSurah: 1, currentAyah: AYAH, expectedWordIndex: 3, lastCompletedAyah: null,
    state: "correcting", attemptsOnCurrentAyah: 1, evidence: "partial", shouldAdvance: false,
    nextAyah: AYAH + 1, correctionFocus: { wordIndex: 3, expectedArabic: TARGET, kind: "missing" },
    reason: "mistake_to_correct", totalAyahs: TOTAL_AYAHS, ...patch,
  } as VerseFollowingResult;
}

/** The ayah attempt in which the learner leaves `رَبِّ` out. */
const missedTheWord: TutorRecitationEvidence = {
  scope: "ayah", surah: 1, ayah: AYAH, verseFollowing: follow(),
  correctionSession: { surah: 1, ayah: AYAH, targetWordIndex: 3, targetArabic: TARGET, stage: "say-word", recognition: "not-recognised" },
  focusedWordResult: null,
};

/** The word attempt the server recognises. */
const saidTheWord: TutorRecitationEvidence = {
  scope: "word", surah: 1, ayah: AYAH, verseFollowing: follow(),
  correctionSession: { surah: 1, ayah: AYAH, targetWordIndex: 3, targetArabic: TARGET, stage: "recite-ayah", recognition: "recognised" },
  focusedWordResult: { recognition: "recognised", reason: "target_recognised" },
};

/** The whole ayah, correct, so the lesson moves to Ayah 3. */
const completedTheAyah: TutorRecitationEvidence = {
  scope: "ayah", surah: 1, ayah: AYAH,
  verseFollowing: follow({
    currentAyah: AYAH + 1, expectedWordIndex: 1, lastCompletedAyah: AYAH, state: "following",
    evidence: "strong", shouldAdvance: true, nextAyah: AYAH + 2, correctionFocus: null, reason: "ayah_completed",
  }),
  correctionSession: null, focusedWordResult: null,
};

function plan(turn: LiveTutorTurn, options: { canPlayWord?: boolean; canPlayAyah?: boolean; onScreen?: boolean } = {}): HandsFreePlan {
  return handsFreePlanFor({
    session: turn.session,
    action: turn.action,
    canPlayWord: options.canPlayWord ?? true,
    canPlayAyah: options.canPlayAyah ?? true,
    onScreen: options.onScreen ?? true,
  });
}

const kinds = (result: HandsFreePlan) => result.steps.map((step) => step.kind);
const spoken = (result: HandsFreePlan) => result.steps.flatMap((step) => (step.kind === "coach" && step.speak ? [step.messageKey] : []));

describe("the correction sequence", () => {
  it("says one sentence, plays the trusted word, and asks for it", () => {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    // The engine's own statement. Nothing here decided it.
    expect(missed.action.kind).toBe("play-target-word");

    const result = plan(missed);
    expect(kinds(result)).toEqual(["coach", "qari-word", "coach"]);
    expect(spoken(result)).toEqual(["tutor.wordMissed", "handsfree.nowYouSayIt"]);
    expect(result.resume).toBe("word");
    expect(result.terminal).toBe(false);
  });

  it("never puts the Quran word inside a sentence to be spoken", () => {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    const result = plan(missed);

    // Each spoken sentence, as the learner would hear it. `رَبِّ` is in none of
    // them: the word reaches the learner as a recording between two sentences,
    // which is the whole reason the plan is three steps rather than one.
    for (const key of spoken(result)) {
      const sentence = en.strings[key] ?? "";
      expect(sentence).not.toContain(TARGET);
      expect(sentence, key).not.toMatch(/\{word\}/);
    }
  });

  it("offers the reciter's ayah where there is no trusted recording of the word", () => {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    const result = plan(missed, { canPlayWord: false });

    expect(kinds(result)).toEqual(["coach", "qari-ayah", "coach"]);
    // Still a word turn: what the teacher asked for did not change because a
    // file was missing.
    expect(result.resume).toBe("word");
  });

  it("plays nothing at all where neither recording exists", () => {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    const result = plan(missed, { canPlayWord: false, canPlayAyah: false });

    // Two sentences and silence where the word would be. Never a synthesised
    // stand-in.
    expect(kinds(result)).toEqual(["coach", "coach"]);
  });

  it("says nothing about a word while the screen is on another ayah", () => {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    const result = plan(missed, { onScreen: false });

    expect(result.steps).toEqual([]);
    expect(planIsSilent(result)).toBe(true);
  });
});

describe("the word going through", () => {
  it("says it heard the word, then asks for the ayah, and resumes in ayah scope", () => {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    const heard = applyLiveTutorEvent(missed.session, { type: "recitation", evidence: saidTheWord });
    expect(heard.action.reason).toBe("target-recognised");

    const result = plan(heard);
    expect(spoken(result)).toEqual(["tutor.wordRecognised", "tutor.reciteFullAyah"]);
    expect(result.resume).toBe("ayah");
  });

  it("only asks, on a later turn that is not the announcement", () => {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    const heard = applyLiveTutorEvent(missed.session, { type: "recitation", evidence: saidTheWord });
    const asked = applyLiveTutorEvent(heard.session, { type: "intent", intent: "from-beginning" });

    expect(spoken(plan(asked))).toEqual(["tutor.reciteFullAyah"]);
  });
});

describe("moving on", () => {
  it("says one short sentence and keeps listening once the ayah is accepted", () => {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    const heard = applyLiveTutorEvent(missed.session, { type: "recitation", evidence: saidTheWord });
    const done = applyLiveTutorEvent(heard.session, { type: "recitation", evidence: completedTheAyah });

    expect(done.action.reason).toBe("ayah-completed");
    expect(done.session.ayah).toBe(AYAH + 1);
    const result = plan(done);
    expect(spoken(result)).toEqual(["handsfree.goodContinue"]);
    expect(result.resume).toBe("ayah");
    expect(result.terminal).toBe(false);
  });

  it("stays quiet while the learner is simply reciting", () => {
    const listening = applyLiveTutorEvent(opened().session, { type: "intent", intent: "start" });
    const result = plan(listening);

    expect(result.steps).toEqual([]);
    expect(result.resume).toBe("ayah");
  });
});

describe("the scope follows the engine, never a guess", () => {
  it("is a word turn only while the engine holds a word open", () => {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    expect(missed.session.phase).toBe("correcting-word");
    expect(handsFreeScopeFor(missed.session)).toBe("word");

    const heard = applyLiveTutorEvent(missed.session, { type: "recitation", evidence: saidTheWord });
    // Still a correction, still holding the target — but what is being asked
    // for is the whole ayah (#53).
    expect(heard.session.phase).toBe("recite-ayah");
    expect(heard.session.activeCorrection).not.toBeNull();
    expect(handsFreeScopeFor(heard.session)).toBe("ayah");
  });

  it("treats every other phase as an ayah turn", () => {
    for (const phase of ["ready", "listening", "recite-ayah", "waiting", "paused", "completed", "stopped"] as const) {
      expect(handsFreeScopeFor({ phase } as LiveTutorSession), phase).toBe("ayah");
    }
  });
});

describe("nothing resumes when the lesson is not waiting on the learner", () => {
  it("stops on a stopped session", () => {
    const stopped = applyLiveTutorEvent(opened().session, { type: "intent", intent: "stop" });
    const result = plan(stopped);
    expect(result.resume).toBeNull();
    expect(result.terminal).toBe(true);
  });

  it("holds on a pause without ending the lesson", () => {
    const paused = applyLiveTutorEvent(opened().session, { type: "intent", intent: "pause" });
    const result = plan(paused);
    expect(result.resume).toBeNull();
    expect(result.terminal).toBe(false);
  });

  it("invents nothing when the server no longer has the lesson", () => {
    // The recovery action a lost session comes back with. No correction is
    // described, no word is played, and nothing resumes.
    const result = handsFreePlanFor({
      session: opened().session,
      action: { ...opened().action, kind: "refresh-session", reason: "stale-session" },
      canPlayWord: true, canPlayAyah: true, onScreen: true,
    });
    expect(result.steps).toEqual([]);
    expect(result.resume).toBeNull();
    expect(result.terminal).toBe(true);
  });
});

describe("a hint names a Quran word, so it is shown and not spoken", () => {
  it("shows the sentence and plays the trusted recording instead of reading it", () => {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    let hinted = applyLiveTutorEvent(missed.session, { type: "intent", intent: "hint" });
    // Level 3 is the one that reaches for audio.
    hinted = applyLiveTutorEvent(hinted.session, { type: "intent", intent: "hint" });
    hinted = applyLiveTutorEvent(hinted.session, { type: "intent", intent: "hint" });

    const result = plan(hinted);
    const coachSteps = result.steps.filter((step) => step.kind === "coach");
    expect(coachSteps).toHaveLength(1);
    expect(coachSteps[0]).toMatchObject({ messageKey: "tutor.hintGiven", speak: false });
    expect(kinds(result)).toContain("qari-word");
  });

  it("marks every Quran-bearing sentence as display-only", () => {
    for (const key of DISPLAY_ONLY_COACH_KEYS) {
      expect(en.strings[key], key).toMatch(/\{word\}/);
      expect(SPEAKABLE_COACH_KEYS).not.toContain(key);
    }
  });

  it("allows nothing onto the speakable list that interpolates a Quran word", () => {
    for (const key of SPEAKABLE_COACH_KEYS) {
      const sentence = en.strings[key];
      expect(sentence, key).toBeTruthy();
      expect(sentence, key).not.toMatch(/\{word\}/);
      // The reference pack carries no Arabic script at all, which is the other
      // half of the same guarantee.
      expect(sentence, key).not.toMatch(/[؀-ۿ]/);
    }
  });
});

describe("repeating an instruction", () => {
  it("performs the engine's own last action rather than remembering one", () => {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    const again = applyLiveTutorEvent(missed.session, { type: "intent", intent: "again" });

    expect(again.action.kind).toBe("repeat-current-instruction");
    expect(again.action.repeatAction).toBe("play-target-word");
    expect(kinds(plan(again))).toEqual(["coach", "qari-word", "coach"]);
  });
});

describe("a turn is performed once", () => {
  it("keys a plan by the session revision", () => {
    const listening = applyLiveTutorEvent(opened().session, { type: "intent", intent: "start" });
    const missed = applyLiveTutorEvent(listening.session, { type: "recitation", evidence: missedTheWord });

    expect(plan(listening).key).not.toBe(plan(missed).key);
    expect(plan(missed).key).toBe(plan(missed).key);
  });
});

describe("the pacing is configuration, not magic numbers", () => {
  it("leaves a beat between the teacher finishing and the microphone opening", () => {
    expect(HANDS_FREE_TIMING.resumeDelayMs).toBeGreaterThan(0);
    expect(HANDS_FREE_TIMING.coachDisplayMs).toBeGreaterThan(HANDS_FREE_TIMING.resumeDelayMs);
    expect(HANDS_FREE_TIMING.playbackTimeoutMs).toBeGreaterThan(HANDS_FREE_TIMING.coachDisplayMs);
  });
});

describe("uncertainty during a full-ayah correction keeps the instruction", () => {
  /** A retry too weak to judge while the learner still owes the full ayah. */
  const weakAyahRetry: TutorRecitationEvidence = {
    scope: "ayah", surah: 1, ayah: AYAH,
    verseFollowing: follow({
      state: "uncertain", evidence: "weak", reason: "too_little_evidence",
      correctionFocus: null, expectedWordIndex: 1,
    }),
    correctionSession: null, focusedWordResult: null,
  };

  function uncertainDuringFullAyah(): LiveTutorTurn {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    const word = applyLiveTutorEvent(missed.session, { type: "recitation", evidence: saidTheWord });
    return applyLiveTutorEvent(word.session, { type: "recitation", evidence: weakAyahRetry });
  }

  it("the plan speaks the uncertainty and restates the full-ayah requirement", () => {
    const turn = uncertainDuringFullAyah();
    expect(turn.action.kind).toBe("hold-uncertain");

    const result = plan(turn);
    // The uncertainty is named honestly, and the pending instruction survives
    // it: the learner is told again to give the whole ayah, not the word.
    expect(spoken(result)).toEqual(["tutor.uncertain", "tutor.reciteFullAyah"]);
    expect(result.terminal).toBe(false);
  });

  it("the mic reopens in the ayah scope for that retry (T6)", () => {
    const turn = uncertainDuringFullAyah();
    expect(turn.action.nextChannel).toBe("listen-for-full-ayah");

    // The plan's resume scope comes from the engine's directive, not a guess.
    const result = plan(turn);
    expect(result.resume).toBe("ayah");
  });

  it("resume during a correction restates the pending instruction", () => {
    const missed = applyLiveTutorEvent(opened().session, { type: "recitation", evidence: missedTheWord });
    const word = applyLiveTutorEvent(missed.session, { type: "recitation", evidence: saidTheWord });
    const paused = applyLiveTutorEvent(word.session, { type: "intent", intent: "pause" });
    const resumed = applyLiveTutorEvent(paused.session, { type: "intent", intent: "resume" });
    expect(resumed.action.kind).toBe("resume-session");

    const result = plan(resumed);
    // "Carrying on" alone left learners thinking the correction was finished.
    expect(spoken(result)).toEqual(["handsfree.carryOn", "tutor.reciteFullAyah"]);
    expect(result.resume).toBe("ayah");
  });
});
