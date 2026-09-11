import { beforeEach, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import {
  applyTrustedTutorRecitation,
  authoritativeRecitationWordIndex,
  resetLiveTutorSessionsForTests,
} from "./tutorRouter";

const context = {} as TrpcContext;

beforeEach(() => {
  resetLiveTutorSessionsForTests();
});

async function start() {
  return appRouter.createCaller(context).tutor.start({
    mode: "guided-recitation",
    surah: 1,
    ayah: 2,
    totalAyahs: 7,
    learnerLanguage: "fa-AF",
  });
}

function reference(session: { sessionId: string; revision: number }) {
  return { sessionId: session.sessionId, revision: session.revision };
}

const correctionSession = {
  surah: 1,
  ayah: 2,
  targetWordIndex: 3,
  targetArabic: "رَبِّ",
  stage: "hear" as const,
  recognition: "not-recognised" as const,
  attemptsOnTarget: 0,
};

const missingWordAttempt = {
  surah: 1,
  ayah: 2,
  result: {
    attemptScope: "ayah" as const,
    verseFollowing: {
      currentSurah: 1,
      currentAyah: 2,
      expectedWordIndex: 3,
      lastCompletedAyah: null,
      state: "correcting" as const,
      attemptsOnCurrentAyah: 1,
      evidence: "partial" as const,
      shouldAdvance: false,
      nextAyah: 3,
      correctionFocus: { wordIndex: 3, expectedArabic: "رَبِّ", kind: "missing" as const },
      reason: "mistake_to_correct" as const,
    },
    correctionSession,
    focusedWordResult: null,
  },
};

describe("tutor.start", () => {
  it("creates a server-owned ephemeral session at the requested position", async () => {
    const turn = await start();
    expect(turn.session).toMatchObject({
      mode: "guided-recitation",
      surah: 1,
      ayah: 2,
      revision: 0,
      attemptsOnCurrentAyah: 0,
      learnerLanguage: "fa-AF",
      phase: "ready",
    });
    expect(turn.session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(turn.action).toMatchObject({ kind: "listen", canAdvance: false });
  });

  it("rejects an ayah beyond the supplied surah length", async () => {
    await expect(appRouter.createCaller(context).tutor.start({
      mode: "memorization",
      surah: 1,
      ayah: 8,
      totalAyahs: 7,
      learnerLanguage: "en",
    })).rejects.toThrow(/surah length/);
  });
});

describe("tutor.turn trust boundary", () => {
  it("does not expose a public recitation evidence event", async () => {
    const initial = await start();

    await expect(appRouter.createCaller(context).tutor.turn({
      session: reference(initial.session),
      event: {
        type: "recitation",
        evidence: {
          shouldAdvance: true,
          reason: "ayah_completed",
          correctionSession,
          focusedWordResult: { recognition: "recognised" },
        },
      },
    } as never)).rejects.toThrow(/Invalid input/);
  });

  it("does not accept a client-supplied tutor state snapshot", async () => {
    const initial = await start();

    await expect(appRouter.createCaller(context).tutor.turn({
      session: { ...reference(initial.session), ayah: 3, lastCompletedAyah: 2 },
      event: { type: "intent", intent: "continue" },
    } as never)).rejects.toThrow(/Unrecognized keys/);
  });

  it("lets only the internal trusted bridge enter correction and blocks continue", async () => {
    const caller = appRouter.createCaller(context);
    const initial = await start();
    const correction = applyTrustedTutorRecitation(reference(initial.session), missingWordAttempt);

    expect(correction).toMatchObject({
      status: "updated",
      accepted: true,
      session: { revision: 1, phase: "correcting-word", activeCorrection: correctionSession },
      action: { kind: "play-target-word", targetWordIndex: 3, targetArabic: "رَبِّ" },
    });
    if (!correction.session) throw new Error("Expected a trusted session");

    const blocked = await caller.tutor.turn({
      session: reference(correction.session),
      event: { type: "intent", intent: "continue" },
    });
    expect(blocked).toMatchObject({
      status: "updated",
      accepted: true,
      session: { revision: 2, ayah: 2, phase: "correcting-word", lastCompletedAyah: null },
      action: { kind: "ask-target-word", canAdvance: false },
    });
  });

  it("fails closed on a stale revision and returns the trusted session", async () => {
    const caller = appRouter.createCaller(context);
    const initial = await start();
    const current = await caller.tutor.turn({
      session: reference(initial.session),
      event: { type: "intent", intent: "start" },
    });
    const stale = await caller.tutor.turn({
      session: reference(initial.session),
      event: { type: "intent", intent: "continue" },
    });

    expect(current).toMatchObject({ status: "updated", session: { revision: 1, phase: "listening" } });
    expect(stale).toMatchObject({
      status: "stale",
      accepted: false,
      session: { revision: 1, phase: "listening", ayah: 2 },
      action: { kind: "refresh-session", reason: "stale-session", canAdvance: false },
    });
  });

  it("reports a lost process-local session without recreating progress", async () => {
    const caller = appRouter.createCaller(context);
    const initial = await start();
    resetLiveTutorSessionsForTests();

    const lost = await caller.tutor.turn({
      session: reference(initial.session),
      event: { type: "intent", intent: "continue" },
    });

    expect(lost).toEqual({
      status: "lost",
      accepted: false,
      session: null,
      action: { kind: "refresh-session", reason: "lost-session", nextChannel: "do-not-listen", canAdvance: false },
    });
  });

  it("rejects stale correction evidence while preserving the trusted target", async () => {
    const initial = await start();
    const correction = applyTrustedTutorRecitation(reference(initial.session), missingWordAttempt);
    if (!correction.session) throw new Error("Expected a trusted session");

    const staleTarget = applyTrustedTutorRecitation(reference(correction.session), {
      surah: 1,
      ayah: 2,
      result: {
        attemptScope: "word",
        verseFollowing: {
          ...missingWordAttempt.result.verseFollowing,
          attemptsOnCurrentAyah: 2,
        },
        correctionSession: {
          ...correctionSession,
          targetWordIndex: 4,
          targetArabic: "ٱلْعَـٰلَمِينَ",
          stage: "recite-ayah",
          recognition: "recognised",
          attemptsOnTarget: 1,
        },
        focusedWordResult: { recognition: "recognised", reason: "target_recognised" },
      },
    });

    expect(staleTarget).toMatchObject({
      status: "rejected",
      accepted: false,
      session: {
        revision: 1,
        ayah: 2,
        lastCompletedAyah: null,
        activeCorrection: { targetWordIndex: 3, targetArabic: "رَبِّ" },
      },
      action: { kind: "refresh-session", reason: "inconsistent-evidence", canAdvance: false },
    });
  });
});

describe("trusted correction loop — the server holds the full-ayah requirement (T7)", () => {
  const wordRecognisedAttempt = {
    surah: 1,
    ayah: 2,
    result: {
      attemptScope: "word" as const,
      verseFollowing: {
        currentSurah: 1,
        currentAyah: 2,
        expectedWordIndex: 3,
        lastCompletedAyah: null,
        state: "correcting" as const,
        attemptsOnCurrentAyah: 1,
        evidence: "partial" as const,
        shouldAdvance: false,
        nextAyah: 3,
        correctionFocus: null,
        reason: "partial_progress" as const,
      },
      correctionSession: {
        ...correctionSession,
        stage: "recite-ayah" as const,
        recognition: "recognised" as const,
        attemptsOnTarget: 1,
      },
      focusedWordResult: { recognition: "recognised" as const, reason: "target_recognised" as const },
    },
  };

  const weakAyahAttempt = {
    surah: 1,
    ayah: 2,
    result: {
      attemptScope: "ayah" as const,
      verseFollowing: {
        currentSurah: 1,
        currentAyah: 2,
        expectedWordIndex: 1,
        lastCompletedAyah: null,
        state: "uncertain" as const,
        attemptsOnCurrentAyah: 2,
        evidence: "weak" as const,
        shouldAdvance: false,
        nextAyah: 3,
        correctionFocus: null,
        reason: "too_little_evidence" as const,
      },
      correctionSession: null,
      focusedWordResult: null,
    },
  };

  const completedAyahAttempt = {
    surah: 1,
    ayah: 2,
    result: {
      attemptScope: "ayah" as const,
      verseFollowing: {
        currentSurah: 1,
        currentAyah: 3,
        expectedWordIndex: 1,
        lastCompletedAyah: 2,
        state: "following" as const,
        attemptsOnCurrentAyah: 0,
        evidence: "strong" as const,
        shouldAdvance: true,
        nextAyah: 4,
        correctionFocus: null,
        reason: "ayah_completed" as const,
      },
      correctionSession: null,
      focusedWordResult: null,
    },
  };

  /** Miss the word, then say the word: the server now asks for the full ayah. */
  async function reciteAyahSession() {
    const initial = await start();
    const missed = applyTrustedTutorRecitation(reference(initial.session), missingWordAttempt);
    if (missed.status !== "updated") throw new Error(`missed word not accepted: ${missed.status}`);
    expect(missed.action.kind).toBe("play-target-word");

    const word = applyTrustedTutorRecitation(reference(missed.session), wordRecognisedAttempt);
    if (word.status !== "updated") throw new Error(`word not accepted: ${word.status}`);
    expect(word.action.kind).toBe("ask-full-ayah");
    // The pointer the retry will be measured against is the ayah's first word.
    expect(word.session.expectedWordIndex).toBe(1);
    expect(word.session.phase).toBe("recite-ayah");
    return word.session;
  }

  it("a word-only retry never advances and keeps the full-ayah requirement", async () => {
    const session = await reciteAyahSession();
    const retry = applyTrustedTutorRecitation(reference(session), weakAyahAttempt);
    if (retry.status !== "updated") throw new Error(`retry not accepted: ${retry.status}`);

    expect(retry.action.kind).toBe("hold-uncertain");
    expect(retry.action.canAdvance).toBe(false);
    expect(retry.session.ayah).toBe(2);
    expect(retry.session.activeCorrection?.stage).toBe("recite-ayah");
    expect(retry.action.nextChannel).toBe("listen-for-full-ayah");
  });

  it("a supported full-ayah retry advances and clears the correction", async () => {
    const session = await reciteAyahSession();
    const done = applyTrustedTutorRecitation(reference(session), completedAyahAttempt);
    if (done.status !== "updated") throw new Error(`completion not accepted: ${done.status}`);

    expect(done.action.kind).toBe("continue-recitation");
    expect(done.action.canAdvance).toBe(true);
    expect(done.session.ayah).toBe(3);
    expect(done.session.activeCorrection).toBeNull();
  });

  it("forces the word pointer to the ayah start while the full ayah is owed", async () => {
    const session = await reciteAyahSession();
    // Even if a stale pointer survived somewhere upstream, the authoritative
    // boundary measures the retry from the ayah's first word.
    expect(authoritativeRecitationWordIndex({ ...session, expectedWordIndex: 3 })).toBe(1);
    // Ordinary listening is untouched: the resume-mid-ayah window still works.
    const ordinary = { ...session, activeCorrection: null, expectedWordIndex: 3 };
    expect(authoritativeRecitationWordIndex(ordinary)).toBe(3);
  });
});
