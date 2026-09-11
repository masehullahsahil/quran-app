import { randomUUID } from "node:crypto";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { SUPPORTED_LANGUAGE_CODES } from "@shared/languages";
import {
  LEARNER_INTENTS,
  LIVE_TUTOR_MODES,
  TUTOR_TIMING_EVENTS,
  applyLiveTutorEvent,
  createLiveTutorSession,
  inconsistentLiveTutorTurn,
  staleLiveTutorTurn,
  type LiveTutorSession,
  type LiveTutorTurn,
  type TutorAction,
  type TutorRecitationEvidence,
} from "@shared/liveTutor";
import type { LiveWordOmittedEvent } from "@shared/liveRecitation";

export const tutorSessionReferenceSchema = z.object({
  sessionId: z.string().min(1).max(200),
  revision: z.number().int().min(0).max(1_000_000),
}).strict();

export type TutorSessionReference = z.infer<typeof tutorSessionReferenceSchema>;

type TutorRecoveryAction = {
  kind: "refresh-session";
  reason: "lost-session";
  nextChannel: "do-not-listen";
  canAdvance: false;
};

export type TutorHandoffResult =
  | {
      status: "updated" | "rejected" | "stale";
      accepted: boolean;
      session: LiveTutorSession;
      action: TutorAction;
    }
  | {
      status: "lost";
      accepted: false;
      session: null;
      action: TutorRecoveryAction;
    };

export type TrustedTutorRecitation = {
  surah: number;
  ayah: number;
  result: {
    attemptScope: TutorRecitationEvidence["scope"];
    verseFollowing: TutorRecitationEvidence["verseFollowing"];
    correctionSession: TutorRecitationEvidence["correctionSession"];
    focusedWordResult: TutorRecitationEvidence["focusedWordResult"];
  };
};

type TutorSessionLookup =
  | { status: "current"; session: LiveTutorSession }
  | { status: "stale"; handoff: TutorHandoffResult }
  | { status: "lost"; handoff: TutorHandoffResult };

const publicTutorEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("intent"), intent: z.enum(LEARNER_INTENTS) }).strict(),
  z.object({ type: z.literal("timing"), timing: z.enum(TUTOR_TIMING_EVENTS) }).strict(),
]);

const startInput = z.object({
  mode: z.enum(LIVE_TUTOR_MODES),
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  totalAyahs: z.number().int().min(1).max(286),
  learnerLanguage: z.enum(SUPPORTED_LANGUAGE_CODES),
}).strict().superRefine((input, ctx) => {
  if (input.ayah > input.totalAyahs) ctx.addIssue({ code: "custom", path: ["ayah"], message: "ayah_exceeds_surah_length" });
});

const LIVE_TUTOR_STORE = Symbol.for("quran-app.live-tutor-sessions");
const globalStore = globalThis as typeof globalThis & { [LIVE_TUTOR_STORE]?: Map<string, LiveTutorSession> };
globalStore[LIVE_TUTOR_STORE] ??= new Map<string, LiveTutorSession>();
const sessions = globalStore[LIVE_TUTOR_STORE];
const MAX_EPHEMERAL_SESSIONS = 500;

function saveSession(session: LiveTutorSession) {
  sessions.delete(session.sessionId);
  sessions.set(session.sessionId, session);
  if (sessions.size <= MAX_EPHEMERAL_SESSIONS) return;
  const oldest = sessions.keys().next().value;
  if (oldest) sessions.delete(oldest);
}

function handoff(status: "updated" | "rejected" | "stale", turn: LiveTutorTurn): TutorHandoffResult {
  return { status, ...turn };
}

function lostHandoff(): TutorHandoffResult {
  return {
    status: "lost",
    accepted: false,
    session: null,
    action: { kind: "refresh-session", reason: "lost-session", nextChannel: "do-not-listen", canAdvance: false },
  };
}

export function getTrustedTutorSession(reference: TutorSessionReference): TutorSessionLookup {
  const trusted = sessions.get(reference.sessionId);
  if (!trusted) return { status: "lost", handoff: lostHandoff() };
  if (trusted.revision !== reference.revision) {
    return { status: "stale", handoff: handoff("stale", staleLiveTutorTurn(trusted)) };
  }
  return { status: "current", session: trusted };
}

/** Internal bridge only: no public schema accepts this evidence object. */
/**
 * The word pointer the authoritative evaluation boundary feeds to
 * followRecitation. While the learner owes the full ayah after a correction,
 * the pointer is forced to the ayah's first word: the engine resets it on the
 * word-recognised transition, but every other path into recite-ayah
 * (from-beginning and continue intents, partial retries) funnels through the
 * same boundary, and a stale pointer would let the resume-mid-ayah window
 * complete the ayah from a suffix-only attempt.
 */
export function authoritativeRecitationWordIndex(session: LiveTutorSession): number {
  return session.activeCorrection?.stage === "recite-ayah" ? 1 : session.expectedWordIndex;
}

export function applyTrustedTutorRecitation(
  reference: TutorSessionReference,
  attempt: TrustedTutorRecitation,
): TutorHandoffResult {
  const lookup = getTrustedTutorSession(reference);
  if (lookup.status !== "current") return lookup.handoff;

  const turn = applyLiveTutorEvent(lookup.session, {
    type: "recitation",
    evidence: {
      scope: attempt.result.attemptScope,
      surah: attempt.surah,
      ayah: attempt.ayah,
      verseFollowing: attempt.result.verseFollowing,
      correctionSession: attempt.result.correctionSession,
      focusedWordResult: attempt.result.focusedWordResult,
    },
  });
  if (turn.accepted) saveSession(turn.session);
  return handoff(turn.accepted ? "updated" : "rejected", turn);
}

/** Internal-only bridge from deterministic live alignment into #53 correction state. */
export function applyTrustedTutorLiveOmission(
  reference: TutorSessionReference,
  omission: LiveWordOmittedEvent,
): TutorHandoffResult {
  const lookup = getTrustedTutorSession(reference);
  if (lookup.status !== "current") return lookup.handoff;
  const session = lookup.session;
  if (
    session.activeCorrection ||
    omission.surah !== session.surah ||
    omission.ayah !== session.ayah ||
    omission.targetWordIndex < session.expectedWordIndex
  ) {
    return handoff("rejected", inconsistentLiveTutorTurn(session));
  }

  const correctionSession = {
    surah: session.surah,
    ayah: session.ayah,
    targetWordIndex: omission.targetWordIndex,
    targetArabic: omission.targetArabic,
    stage: "hear" as const,
    recognition: "not-recognised" as const,
    attemptsOnTarget: 0,
  };
  return applyTrustedTutorRecitation(reference, {
    surah: session.surah,
    ayah: session.ayah,
    result: {
      attemptScope: "ayah",
      verseFollowing: {
        currentSurah: session.surah,
        currentAyah: session.ayah,
        expectedWordIndex: omission.targetWordIndex,
        lastCompletedAyah: session.lastCompletedAyah,
        state: "correcting",
        attemptsOnCurrentAyah: session.attemptsOnCurrentAyah,
        evidence: "partial",
        shouldAdvance: false,
        nextAyah: session.ayah < session.totalAyahs ? session.ayah + 1 : null,
        correctionFocus: {
          wordIndex: omission.targetWordIndex,
          expectedArabic: omission.targetArabic,
          kind: "missing",
        },
        reason: "mistake_to_correct",
      },
      correctionSession,
      focusedWordResult: null,
    },
  });
}

export function rejectTrustedTutorRecitation(reference: TutorSessionReference): TutorHandoffResult {
  const lookup = getTrustedTutorSession(reference);
  if (lookup.status !== "current") return lookup.handoff;
  return handoff("rejected", inconsistentLiveTutorTurn(lookup.session));
}

export function resetLiveTutorSessionsForTests() {
  sessions.clear();
}

export const tutorRouter = router({
  start: publicProcedure.input(startInput).mutation(({ input }) => {
    const turn = createLiveTutorSession({ sessionId: randomUUID(), ...input });
    saveSession(turn.session);
    return turn;
  }),
  turn: publicProcedure.input(z.object({
    session: tutorSessionReferenceSchema,
    event: publicTutorEventSchema,
  }).strict()).mutation(({ input }) => {
    const lookup = getTrustedTutorSession(input.session);
    if (lookup.status !== "current") return lookup.handoff;

    const turn = applyLiveTutorEvent(lookup.session, input.event);
    if (turn.accepted) saveSession(turn.session);
    return handoff(turn.accepted ? "updated" : "rejected", turn);
  }),
});
