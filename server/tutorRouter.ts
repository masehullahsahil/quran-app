import { randomUUID } from "node:crypto";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { SUPPORTED_LANGUAGE_CODES } from "@shared/languages";
import {
  LEARNER_INTENTS,
  LIVE_TUTOR_MODES,
  LIVE_TUTOR_PHASES,
  TUTOR_ACTION_KINDS,
  TUTOR_TIMING_EVENTS,
  applyLiveTutorEvent,
  createLiveTutorSession,
  staleLiveTutorTurn,
  type LiveTutorSession,
} from "@shared/liveTutor";
import {
  VERSE_FOLLOWING_EVIDENCE,
  VERSE_FOLLOWING_REASONS,
  VERSE_FOLLOWING_STATES,
} from "@shared/verseFollowing";
import {
  CORRECTION_STAGES,
  FOCUSED_WORD_REASONS,
  RECITATION_ATTEMPT_SCOPES,
  TARGET_RECOGNITIONS,
} from "@shared/wordCorrection";

const correctionSessionSchema = z.object({
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  targetWordIndex: z.number().int().min(1).max(1000),
  targetArabic: z.string().min(1).max(4000),
  stage: z.enum(CORRECTION_STAGES),
  recognition: z.enum(TARGET_RECOGNITIONS),
  attemptsOnTarget: z.number().int().min(0).max(1000).optional(),
});

const correctionFocusSchema = z.object({
  wordIndex: z.number().int().min(1).max(1000),
  expectedArabic: z.string().min(1).max(4000),
  kind: z.enum(["missing", "review"]),
});

const verseFollowingSchema = z.object({
  currentSurah: z.number().int().min(1).max(114),
  currentAyah: z.number().int().min(1).max(286),
  expectedWordIndex: z.number().int().min(1).max(1000),
  lastCompletedAyah: z.number().int().min(1).max(286).nullable(),
  state: z.enum(VERSE_FOLLOWING_STATES),
  attemptsOnCurrentAyah: z.number().int().min(0).max(1000),
  evidence: z.enum(VERSE_FOLLOWING_EVIDENCE),
  shouldAdvance: z.boolean(),
  nextAyah: z.number().int().min(1).max(286).nullable(),
  correctionFocus: correctionFocusSchema.nullable(),
  reason: z.enum(VERSE_FOLLOWING_REASONS),
});

const focusedWordResultSchema = z.object({
  recognition: z.enum(TARGET_RECOGNITIONS),
  reason: z.enum(FOCUSED_WORD_REASONS),
});

const sessionSchema = z.object({
  sessionId: z.string().min(1).max(200),
  revision: z.number().int().min(0).max(1_000_000),
  mode: z.enum(LIVE_TUTOR_MODES),
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  totalAyahs: z.number().int().min(1).max(286),
  expectedWordIndex: z.number().int().min(1).max(1000),
  lastCompletedAyah: z.number().int().min(1).max(286).nullable(),
  phase: z.enum(LIVE_TUTOR_PHASES),
  phaseBeforePause: z.enum(["ready", "listening", "correcting-word", "recite-ayah", "waiting"]).nullable(),
  activeCorrection: correctionSessionSchema.nullable(),
  lastTutorAction: z.enum(TUTOR_ACTION_KINDS).nullable(),
  hintLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  learnerLanguage: z.enum(SUPPORTED_LANGUAGE_CODES),
});

const recitationEvidenceSchema = z.object({
  scope: z.enum(RECITATION_ATTEMPT_SCOPES),
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  verseFollowing: verseFollowingSchema,
  correctionSession: correctionSessionSchema.nullable(),
  focusedWordResult: focusedWordResultSchema.nullable(),
});

const tutorEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("intent"), intent: z.enum(LEARNER_INTENTS) }),
  z.object({ type: z.literal("timing"), timing: z.enum(TUTOR_TIMING_EVENTS) }),
  z.object({ type: z.literal("recitation"), evidence: recitationEvidenceSchema }),
]);

const startInput = z.object({
  mode: z.enum(LIVE_TUTOR_MODES),
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  totalAyahs: z.number().int().min(1).max(286),
  learnerLanguage: z.enum(SUPPORTED_LANGUAGE_CODES),
}).superRefine((input, ctx) => {
  if (input.ayah > input.totalAyahs) ctx.addIssue({ code: "custom", path: ["ayah"], message: "Ayah exceeds the surah length" });
});

const LIVE_TUTOR_STORE = Symbol.for("quran-app.live-tutor-sessions");
const globalStore = globalThis as typeof globalThis & { [LIVE_TUTOR_STORE]?: Map<string, LiveTutorSession> };
globalStore[LIVE_TUTOR_STORE] ??= new Map<string, LiveTutorSession>();
const sessions = globalStore[LIVE_TUTOR_STORE];
const MAX_EPHEMERAL_SESSIONS = 500;

function saveSession(session: LiveTutorSession) {
  sessions.set(session.sessionId, session);
  if (sessions.size <= MAX_EPHEMERAL_SESSIONS) return;
  const oldest = sessions.keys().next().value;
  if (oldest) sessions.delete(oldest);
}

function sameSession(left: LiveTutorSession, right: LiveTutorSession): boolean {
  const leftCorrection = left.activeCorrection;
  const rightCorrection = right.activeCorrection;
  const sameCorrection = leftCorrection === null && rightCorrection === null || Boolean(
    leftCorrection && rightCorrection &&
    leftCorrection.surah === rightCorrection.surah &&
    leftCorrection.ayah === rightCorrection.ayah &&
    leftCorrection.targetWordIndex === rightCorrection.targetWordIndex &&
    leftCorrection.targetArabic === rightCorrection.targetArabic &&
    leftCorrection.stage === rightCorrection.stage &&
    leftCorrection.recognition === rightCorrection.recognition &&
    leftCorrection.attemptsOnTarget === rightCorrection.attemptsOnTarget,
  );
  return left.sessionId === right.sessionId && left.revision === right.revision && left.mode === right.mode &&
    left.surah === right.surah && left.ayah === right.ayah && left.totalAyahs === right.totalAyahs &&
    left.expectedWordIndex === right.expectedWordIndex && left.lastCompletedAyah === right.lastCompletedAyah &&
    left.phase === right.phase && left.phaseBeforePause === right.phaseBeforePause && sameCorrection &&
    left.lastTutorAction === right.lastTutorAction && left.hintLevel === right.hintLevel &&
    left.learnerLanguage === right.learnerLanguage;
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
  turn: publicProcedure.input(z.object({ session: sessionSchema, event: tutorEventSchema })).mutation(({ input }) => {
    const trusted = sessions.get(input.session.sessionId);
    if (!trusted) return staleLiveTutorTurn(input.session);
    if (!sameSession(trusted, input.session)) return staleLiveTutorTurn(trusted);

    const turn = applyLiveTutorEvent(trusted, input.event);
    if (turn.accepted) saveSession(turn.session);
    return turn;
  }),
});
