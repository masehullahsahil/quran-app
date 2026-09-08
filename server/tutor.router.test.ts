import { beforeEach, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { resetLiveTutorSessionsForTests } from "./tutorRouter";

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

const correctionSession = {
  surah: 1,
  ayah: 2,
  targetWordIndex: 3,
  targetArabic: "رَبِّ",
  stage: "hear" as const,
  recognition: "not-recognised" as const,
  attemptsOnTarget: 0,
};

const missingWordEvidence = {
  scope: "ayah" as const,
  surah: 1,
  ayah: 2,
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
};

describe("tutor.start", () => {
  it("creates a server-owned ephemeral session at the requested position", async () => {
    const turn = await start();
    expect(turn.session).toMatchObject({
      mode: "guided-recitation",
      surah: 1,
      ayah: 2,
      revision: 0,
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

describe("tutor.turn", () => {
  it("stores accepted turns and requires the returned revision on the next turn", async () => {
    const caller = appRouter.createCaller(context);
    const initial = await start();
    const correction = await caller.tutor.turn({
      session: initial.session,
      event: { type: "recitation", evidence: missingWordEvidence },
    });
    expect(correction).toMatchObject({
      accepted: true,
      session: { revision: 1, phase: "correcting-word", activeCorrection: correctionSession },
      action: { kind: "play-target-word", targetWordIndex: 3, targetArabic: "رَبِّ" },
    });

    const blocked = await caller.tutor.turn({
      session: correction.session,
      event: { type: "intent", intent: "continue" },
    });
    expect(blocked).toMatchObject({
      accepted: true,
      session: { revision: 2, ayah: 2, phase: "correcting-word" },
      action: { kind: "ask-target-word", canAdvance: false },
    });
  });

  it("fails closed on a stale client snapshot and returns the trusted session", async () => {
    const caller = appRouter.createCaller(context);
    const initial = await start();
    const current = await caller.tutor.turn({
      session: initial.session,
      event: { type: "intent", intent: "start" },
    });
    const stale = await caller.tutor.turn({
      session: initial.session,
      event: { type: "intent", intent: "continue" },
    });

    expect(current).toMatchObject({ accepted: true, session: { revision: 1, phase: "listening" } });
    expect(stale).toMatchObject({
      accepted: false,
      session: { revision: 1, phase: "listening", ayah: 2 },
      action: { kind: "refresh-session", reason: "stale-session", canAdvance: false },
    });
  });
});
