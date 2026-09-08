import { beforeEach, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import {
  applyTrustedTutorRecitation,
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
      action: { kind: "refresh-session", reason: "lost-session", canAdvance: false },
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
