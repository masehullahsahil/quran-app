import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { transcribeAudio } from "./_core/voiceTranscription";
import { MAX_AUDIO_BASE64_LENGTH, MAX_AUDIO_BYTES, formatMegabytes } from "@shared/recording";
import { LEARNING_LEVELS, getLearningCoachPlan, type LearningLevel } from "@shared/learningPath";
import { SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_CODES, type SupportedLanguageCode } from "@shared/languages";
import { DEFAULT_RECITER_ID, DEFAULT_TRANSLATION_ID, getQuranIndex, getSurahContent } from "./quranApi";
import { assessRecitationTranscript, hasArabicScript, tokenizeArabic } from "./recitation";
import {
  VERSE_FOLLOWING_STATES,
  createVerseFollowingPosition,
  followRecitation,
  type VerseFollowingPosition,
  type VerseFollowingResult,
} from "@shared/verseFollowing";
import { evaluateQuranAwareAudio } from "./quranEvaluator";
import { EMPTY_QURAN_AWARE_REVIEW } from "@shared/quranEvaluation";
import {
  RECITATION_ATTEMPT_SCOPES,
  type CorrectionSessionSnapshot,
  type FocusedWordResult,
  type TargetRecognition,
} from "@shared/wordCorrection";
import { evaluateFocusedWordTranscript, validateCorrectionTarget, type ValidatedCorrectionTarget } from "./focusedWordEvaluation";
import { checkRecitationEvaluateRateLimit, logRecitationRateLimit } from "./recitationRateLimit";
import { isStorageConfigured, storagePut } from "./storage";
import { ingestRecitationChunk } from "./recitationSession";
import { buildReviewQueue, deriveAyahMemory, findRecurringErrors } from "@shared/memorization";
import { getQaidaLesson } from "@shared/qaidaCurriculum";
import { getLearnerSnapshot, insertMemorizationAttempt, mergeQaidaProgress } from "./db";

// Long enough for al-Baqarah 2:282, the longest ayah in the Quran, which runs
// past 1,600 characters once Uthmani diacritics are counted. The old limit fit
// al-Fatiha and would have rejected the review request for a handful of ayahs
// now that any surah can be selected.
const MAX_AYAH_CHARS = 4000;
const BASE64_AUDIO = /^[A-Za-z0-9+/]*={0,2}$/;

// Everything the verse-following tracker needs is optional: a client that only
// wants a word review keeps working, and the tracker then reports on this ayah
// alone. `previousAyahArabic`/`nextAyahArabic` let the same transcript be
// aligned against the neighbours, which is how the tracker recognises a repeated
// previous ayah or a next ayah started early.
const verseFollowingInput = z.object({
  expectedWordIndex: z.number().int().min(1).max(1000).default(1),
  lastCompletedAyah: z.number().int().min(1).max(286).nullable().default(null),
  state: z.enum(VERSE_FOLLOWING_STATES).default("following"),
  attemptsOnCurrentAyah: z.number().int().min(0).max(1000).default(0),
});

const correctionTargetInput = z.object({
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  targetWordIndex: z.number().int().min(1).max(1000),
  expectedArabic: z.string().min(1).max(MAX_AYAH_CHARS),
  attemptsOnTarget: z.number().int().min(0).max(1000).optional(),
});

const recitationInput = z.object({
  expectedArabic: z.string().min(1).max(MAX_AYAH_CHARS),
  audioBase64: z.string().min(20).max(MAX_AUDIO_BASE64_LENGTH),
  mimeType: z.enum(["audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4"]),
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  learningLevel: z.enum(LEARNING_LEVELS).default("qaida"),
  /**
   * The learner's interface language, so the coach's encouragement can be in it.
   * Wording only: the teaching action, the word to return to and whether the
   * learner may advance are decided before this is used and are not affected
   * by it. An unknown code falls back to English.
   */
  uiLanguage: z.enum(SUPPORTED_LANGUAGE_CODES).default("en"),
  totalAyahs: z.number().int().min(1).max(286).optional(),
  previousAyahArabic: z.string().max(MAX_AYAH_CHARS).optional(),
  nextAyahArabic: z.string().max(MAX_AYAH_CHARS).optional(),
  position: verseFollowingInput.optional(),
  attemptScope: z.enum(RECITATION_ATTEMPT_SCOPES).default("ayah"),
  correctionTarget: correctionTargetInput.optional(),
});

const correctionFocusInput = z.object({
  wordIndex: z.number().int().min(1).max(1000),
  expectedArabic: z.string(),
  kind: z.enum(["missing", "review"]),
}).nullable();

const recitationSessionInput = z.object({
  sessionId: z.string().min(1).max(200),
  surah: z.number().int().min(1).max(114),
  currentAyah: z.number().int().min(1).max(286),
  expectedWordIndex: z.number().int().min(1).max(1000),
  lastCompletedAyah: z.number().int().min(1).max(286).nullable(),
  trackerState: z.enum(VERSE_FOLLOWING_STATES),
  attemptsOnCurrentAyah: z.number().int().min(0).max(1000),
  chunkCount: z.number().int().min(0).max(10000),
  lastAcceptedTranscriptSegment: z.string().max(MAX_AYAH_CHARS),
  recentCorrectionFocus: correctionFocusInput,
  currentAyahTranscript: z.string().max(MAX_AYAH_CHARS * 2),
  processedChunkIds: z.array(z.string().min(1).max(200)).max(32),
});

const recitationChunkInput = z.object({
  session: recitationSessionInput,
  expectedAyahArabic: z.string().min(1).max(MAX_AYAH_CHARS),
  transcriptChunk: z.string().max(MAX_AYAH_CHARS),
  stability: z.enum(["interim", "final"]),
  totalAyahs: z.number().int().min(1).max(286),
  previousAyahArabic: z.string().max(MAX_AYAH_CHARS).optional(),
  nextAyahArabic: z.string().max(MAX_AYAH_CHARS).optional(),
  chunkId: z.string().min(1).max(200).optional(),
});

const lessonId = z.string().min(1).max(128).refine(value => Boolean(getQaidaLesson(value)), "Unknown Qaida lesson");
const errorInput = z.object({
  type: z.enum(["omission", "substitution_review", "extra", "repetition"]),
  wordIndex: z.number().int().min(1).max(1000).nullable(),
});
const memorizationAttemptInput = z.object({
  id: z.string().min(8).max(200),
  sessionId: z.string().min(1).max(200),
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  timestamp: z.iso.datetime({ offset: true }),
  result: z.enum(["completed", "partial", "corrected", "uncertain"]),
  matchedCount: z.number().int().min(0).max(1000),
  totalExpectedWords: z.number().int().min(1).max(1000),
  score: z.number().int().min(0).max(100),
  correctionWordIndexes: z.array(z.number().int().min(1).max(1000)).max(1000),
  errors: z.array(errorInput).max(1000),
  attemptsRequired: z.number().int().min(1).max(1000),
  eventuallyAdvanced: z.boolean(),
  stability: z.literal("final"),
}).superRefine((attempt, ctx) => {
  if (attempt.matchedCount > attempt.totalExpectedWords) ctx.addIssue({ code: "custom", path: ["matchedCount"], message: "Matched words cannot exceed total words" });
  attempt.correctionWordIndexes.forEach((word, index) => {
    if (word > attempt.totalExpectedWords) ctx.addIssue({ code: "custom", path: ["correctionWordIndexes", index], message: "Word index exceeds total words" });
  });
  attempt.errors.forEach((error, index) => {
    if (error.wordIndex !== null && error.wordIndex > attempt.totalExpectedWords) ctx.addIssue({ code: "custom", path: ["errors", index, "wordIndex"], message: "Word index exceeds total words" });
  });
});

const durableAttempt = memorizationAttemptInput.transform(({ stability: _stability, ...attempt }) => attempt);

/**
 * Wording only.
 *
 * The coach model phrases encouragement around a decision that has already been
 * made deterministically. It never chooses what the learner should do next: the
 * teaching action, the word to return to, and whether the learner may move on
 * come from the alignment, the verse-following tracker and the decision engine
 * in shared/teacherDecision.ts, and the Study view takes its one instruction
 * from there. These three fields are shown in Teacher notes, never as the
 * primary instruction — see docs/ai-teacher-decisions.md.
 */
type CoachSummary = { encouragement: string; nextStep: string; spokenGuidance: string };

async function createCoachSummary(input: {
  score: number;
  matchedCount: number;
  totalWords: number;
  corrections: Array<{ expected: string; heard: string | null; status: string; wordIndex: number | null }>;
  fallbackNextStep: string;
  learningLevel: LearningLevel;
  uiLanguage: SupportedLanguageCode;
}): Promise<CoachSummary> {
  const plan = getLearningCoachPlan(input.learningLevel);
  const fallback: CoachSummary = {
    encouragement: input.score === 100
      ? "The expected words were all recognised. Keep the same calm pace for one more repetition."
      : "A good attempt. Keep the ayah together, then return only to the word marked for review.",
    nextStep: input.score === 100 ? plan.afterRecordingCue : input.fallbackNextStep,
    spokenGuidance: input.score === 100
      ? `Every expected word was recognised. ${plan.afterRecordingCue}`
      : `Good attempt. ${input.fallbackNextStep}`,
  };

  try {
    const response = await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `Reply in ${SUPPORTED_LANGUAGES[input.uiLanguage].englishName}. ` + "You are a respectful Quran learning assistant. Give concise supportive feedback strictly from supplied text-alignment data. Never claim to assess tajwid, makharij, melody, vowel length, pronunciation, or religious correctness from this data. Do not invent an error: every word you mention must appear in the supplied corrections. Do not tell the learner to move on to another ayah, and do not contradict the supplied next step — the app decides what comes next, and your text is shown as a note beside that decision. Use plain English. Include a short spokenGuidance field that is safe to read aloud in English. Never use the assistant to recite or synthesize Quranic Arabic.",
        },
        {
          role: "user",
          content: JSON.stringify({
            matchedWords: input.matchedCount,
            totalWords: input.totalWords,
            score: input.score,
            learningLevel: input.learningLevel,
            lessonGoal: plan.lessonGoal,
            focus: plan.focus,
            corrections: input.corrections.slice(0, 3),
            fallbackNextStep: input.fallbackNextStep,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "recitation_coach_summary",
          strict: true,
          schema: {
            type: "object",
            properties: {
              encouragement: { type: "string" },
              nextStep: { type: "string" },
              spokenGuidance: { type: "string" },
            },
            required: ["encouragement", "nextStep", "spokenGuidance"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices[0]?.message.content;
    if (!content || typeof content !== "string") return fallback;
    return JSON.parse(content) as CoachSummary;
  } catch (error) {
    console.warn("[recitation] Coach summary unavailable; using deterministic guidance", error);
    return fallback;
  }
}

function focusedVerseFollowing(input: {
  surah: number;
  ayah: number;
  totalAyahs: number;
  position: VerseFollowingPosition;
  target: ValidatedCorrectionTarget | null;
  recognition: TargetRecognition;
}): VerseFollowingResult {
  const wordIndex = input.target?.targetWordIndex ?? input.position.expectedWordIndex;
  const reason = input.recognition === "not-recognised"
    ? "mistake_to_correct" as const
    : input.recognition === "recognised"
      ? "partial_progress" as const
      : "too_little_evidence" as const;

  return {
    currentSurah: input.surah,
    currentAyah: input.ayah,
    expectedWordIndex: wordIndex,
    lastCompletedAyah: input.position.lastCompletedAyah,
    state: "correcting",
    attemptsOnCurrentAyah: input.position.attemptsOnCurrentAyah,
    evidence: input.recognition === "unknown" ? "none" : "partial",
    shouldAdvance: false,
    nextAyah: input.ayah < input.totalAyahs ? input.ayah + 1 : null,
    correctionFocus: input.recognition === "not-recognised" && input.target
      ? { wordIndex, expectedArabic: input.target.canonicalArabic, kind: "review" }
      : null,
    reason,
  };
}

function focusedCorrectionSession(
  target: ValidatedCorrectionTarget,
  recognition: TargetRecognition,
): CorrectionSessionSnapshot {
  return {
    surah: target.surah,
    ayah: target.ayah,
    targetWordIndex: target.targetWordIndex,
    targetArabic: target.canonicalArabic,
    stage: recognition === "recognised" ? "recite-ayah" : "say-word",
    recognition,
    attemptsOnTarget: (target.attemptsOnTarget ?? 0) + 1,
  };
}

function ayahCorrectionSession(verseFollowing: VerseFollowingResult): CorrectionSessionSnapshot | null {
  const focus = verseFollowing.reason === "mistake_to_correct" ? verseFollowing.correctionFocus : null;
  if (!focus) return null;
  return {
    surah: verseFollowing.currentSurah,
    ayah: verseFollowing.currentAyah,
    targetWordIndex: focus.wordIndex,
    targetArabic: focus.expectedArabic,
    stage: "hear",
    recognition: "not-recognised",
    attemptsOnTarget: 0,
  };
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  learner: router({
    getProgress: protectedProcedure.query(({ ctx }) => getLearnerSnapshot(ctx.user.id)),
    syncQaidaProgress: protectedProcedure.input(z.object({
      completedLessons: z.array(lessonId).max(500),
      currentLessonId: lessonId,
    })).mutation(async ({ ctx, input }) => {
      await mergeQaidaProgress(ctx.user.id, input);
      return getLearnerSnapshot(ctx.user.id);
    }),
    recordMemorizationAttempt: protectedProcedure.input(durableAttempt).mutation(async ({ ctx, input }) => {
      const inserted = await insertMemorizationAttempt(ctx.user.id, input);
      const snapshot = await getLearnerSnapshot(ctx.user.id);
      return { inserted, memory: deriveAyahMemory(input.surah, input.ayah, snapshot.memorizationAttempts) };
    }),
    syncProgress: protectedProcedure.input(z.object({
      qaida: z.object({ completedLessons: z.array(lessonId).max(500), currentLessonId: lessonId }),
      memorizationAttempts: z.array(durableAttempt).max(500),
    })).mutation(async ({ ctx, input }) => {
      await mergeQaidaProgress(ctx.user.id, input.qaida);
      for (const attempt of input.memorizationAttempts) await insertMemorizationAttempt(ctx.user.id, attempt);
      return getLearnerSnapshot(ctx.user.id);
    }),
    getMemorizationHistory: protectedProcedure.query(async ({ ctx }) => (await getLearnerSnapshot(ctx.user.id)).memorizationAttempts),
    getReviewQueue: protectedProcedure.query(async ({ ctx }) => {
      const attempts = (await getLearnerSnapshot(ctx.user.id)).memorizationAttempts;
      return { queue: buildReviewQueue(attempts), recurringErrors: findRecurringErrors(attempts) };
    }),
  }),

  quran: router({
    // One call covers every navigation control: 114 surahs, 30 juz, the reciter
    // list, and every translation the API offers. All are cached upstream of
    // this procedure.
    index: publicProcedure.query(async () => {
      try {
        return await getQuranIndex();
      } catch (error) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "The Quran index could not be loaded from Quran.com. Check your connection and try again.",
          cause: error,
        });
      }
    }),

    surah: publicProcedure
      .input(z.object({
        surah: z.number().int().min(1).max(114),
        reciterId: z.number().int().positive().default(DEFAULT_RECITER_ID),
        translationId: z.number().int().positive().default(DEFAULT_TRANSLATION_ID),
      }))
      .query(async ({ input }) => {
        try {
          return await getSurahContent(input.surah, input.reciterId, input.translationId);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "This surah could not be loaded from Quran.com. Check your connection and try again.",
            cause: error,
          });
        }
      }),
  }),

  recitation: router({
    // Stateless, typed chunk orchestration. Clients carry the returned session
    // into the next request; only finalized chunks can change its durable place.
    ingestChunk: publicProcedure.input(recitationChunkInput).mutation(({ input }) => ingestRecitationChunk(input)),
    evaluate: publicProcedure.input(recitationInput).mutation(async ({ ctx, input }) => {
      const learningPlan = getLearningCoachPlan(input.learningLevel);
      const learningPlanResult = {
        level: learningPlan.level,
        title: learningPlan.title,
        focus: learningPlan.focus,
        practiceLoop: learningPlan.practiceLoop,
        boundary: learningPlan.boundary,
      };
      // The tracker never advances past the end of the surah. Without a
      // `totalAyahs` from the client there is no end to know, so assume one more
      // ayah exists: reporting "surah complete" from a guess would be worse than
      // reporting a next ayah the client already knows how to bound.
      const totalAyahs = input.totalAyahs ?? input.ayah + 1;
      const position: VerseFollowingPosition = {
        ...createVerseFollowingPosition(input.surah, input.ayah),
        ...(input.position ?? {}),
      };
      const focusedTarget = input.attemptScope === "word"
        ? validateCorrectionTarget({
            expectedArabic: input.expectedArabic,
            surah: input.surah,
            ayah: input.ayah,
            target: input.correctionTarget,
          })
        : null;

      // A focused request without the exact canonical target is stale or
      // malformed. Fail closed before transcription, storage, acoustic review,
      // or any alignment against a different word.
      if (input.attemptScope === "word" && !focusedTarget) {
        const focusedWordResult: FocusedWordResult = { recognition: "unknown", reason: "invalid_target" };
        return {
          attemptScope: input.attemptScope,
          recitationScoreScope: "none" as const,
          focusedWordResult,
          correctionSession: null,
          reviewMessageCode: null,
          verseFollowing: focusedVerseFollowing({
            surah: input.surah,
            ayah: input.ayah,
            totalAyahs,
            position,
            target: null,
            recognition: "unknown",
          }),
          expectedWords: [],
          extraWords: [],
          matchedCount: 0,
          totalWords: 0,
          score: 0,
          corrections: [],
          fallbackNextStep: "Return to the current ayah and select its marked word again.",
          transcript: "",
          encouragement: "This focused attempt could not be connected to the marked word.",
          nextStep: "Return to the current ayah and select its marked word again.",
          spokenGuidance: "The marked word could not be verified. Return to the current ayah and try again.",
          wordReviewAvailable: false,
          reviewStatus: "unavailable" as const,
          reviewMessage: "The correction target did not match the current ayah.",
          quranAwareReview: EMPTY_QURAN_AWARE_REVIEW,
          learningPlan: learningPlanResult,
          note: "No audio, transcript, acoustic finding, or ayah score was evaluated because the focused correction target was invalid.",
        };
      }
      const rawBase64 = input.audioBase64.includes(",")
        ? input.audioBase64.slice(input.audioBase64.indexOf(",") + 1)
        : input.audioBase64;
      if (!BASE64_AUDIO.test(rawBase64) || rawBase64.length % 4 !== 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The recording could not be read. Please record again." });
      }
      const audioBuffer = Buffer.from(rawBase64, "base64");
      if (!audioBuffer.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The recording was empty. Please record again." });
      }
      // The recorder enforces this before uploading, so reaching it here means a
      // client that skipped the check. Serverless platforms reject an oversized
      // body before the function runs, so this is a backstop, not the guard.
      if (audioBuffer.length > MAX_AUDIO_BYTES) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: `That recording is ${formatMegabytes(audioBuffer.length)} MB. Please record a clip under ${formatMegabytes(MAX_AUDIO_BYTES)} MB — one ayah at a calm pace is well within it.`,
        });
      }

      let rateLimit;
      try {
        rateLimit = await checkRecitationEvaluateRateLimit(ctx);
      } catch (error) {
        console.warn("[recitation] evaluate rate-limit store unavailable", {
          store: "redis",
          message: error instanceof Error ? error.message : "unknown error",
        });
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Recitation review is temporarily busy. Please try again in a minute.",
          cause: error,
        });
      }
      if (!rateLimit.allowed) {
        logRecitationRateLimit(rateLimit);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many recitation reviews. Please wait ${rateLimit.retryAfterSeconds} seconds and try again.`,
        });
      }

      // Archiving the attempt is a side effect, not a prerequisite: storage
      // runs on Forge while transcription runs on OpenAI, so the review has to
      // work with OPENAI_API_KEY alone. Upload only when Forge is configured,
      // and never fail the review because the archive step did.
      if (isStorageConfigured()) {
        const extension = input.mimeType === "audio/wav" ? "wav" : input.mimeType === "audio/ogg" ? "ogg" : input.mimeType === "audio/mp4" ? "m4a" : "webm";
        try {
          await storagePut(
            `recitation-attempts/guest/${input.surah}-${input.ayah}-${Date.now()}.${extension}`,
            audioBuffer,
            input.mimeType,
          );
        } catch (error) {
          console.warn("[recitation] Attempt audio was not archived", error);
        }
      }

      // No `prompt` here, deliberately. Whisper's prompt parameter is decoder
      // priming rather than an instruction — the text is treated as the
      // transcript preceding this audio — so OpenAI's guidance is that it must
      // be in the same language as the audio. The English instruction that used
      // to sit here primed an English decoder for Arabic speech, nudging the
      // model toward translating rather than transcribing. Priming with Arabic
      // instead would be worse for this feature specifically: any Quranic text
      // in the prompt biases the decoder toward emitting those exact words,
      // which would inflate the recall score this endpoint exists to measure.
      // `language: "ar"` is the supported way to pin the language.
      // The specialist evaluator and generic transcription serve distinct roles.
      // Start them together to avoid adding serial latency: a configured acoustic
      // service can return confidence-gated sound observations while transcription
      // remains the reliable fallback for word recall and place-keeping.
      const quranAwareReviewPromise = input.attemptScope === "ayah"
        ? evaluateQuranAwareAudio({
            audioBase64: rawBase64,
            mimeType: input.mimeType,
            expectedArabic: input.expectedArabic,
            surah: input.surah,
            ayah: input.ayah,
            learningLevel: input.learningLevel,
          })
        : Promise.resolve(EMPTY_QURAN_AWARE_REVIEW);
      const transcription = await transcribeAudio({
        audio: audioBuffer,
        mimeType: input.mimeType,
        language: "ar",
      });
      const quranAwareReview = await quranAwareReviewPromise;
      /**
       * A stable reason the client can render in the learner's own language.
       * The English strings below remain in the response for API compatibility
       * and for server logs, but no learner-facing surface reads them: the
       * Study view renders `reviewMessageCode` through its locale pack.
       */
      const unavailableReview = (reviewMessage: string, transcript: string, nextStep: string, reviewMessageCode: "transcription_failed" | "no_arabic_returned") => ({
        attemptScope: input.attemptScope,
        recitationScoreScope: "none" as const,
        focusedWordResult: input.attemptScope === "word"
          ? {
              recognition: "unknown" as const,
              reason: reviewMessageCode === "transcription_failed" ? "transcription_failed" as const : "no_arabic_returned" as const,
            }
          : null,
        correctionSession: input.attemptScope === "word" && focusedTarget
          ? focusedCorrectionSession(focusedTarget, "unknown")
          : null,
        reviewMessageCode,
        // No usable transcript means no evidence, so the tracker holds the
        // learner exactly where they were rather than guessing.
        verseFollowing: input.attemptScope === "word"
          ? focusedVerseFollowing({
              surah: input.surah,
              ayah: input.ayah,
              totalAyahs,
              position,
              target: focusedTarget,
              recognition: "unknown",
            })
          : followRecitation({ position, totalAyahs, alignment: null, transcriptUsable: false }),
        expectedWords: [],
        extraWords: [],
        matchedCount: 0,
        totalWords: tokenizeArabic(input.expectedArabic).length,
        score: 0,
        corrections: [],
        fallbackNextStep: nextStep,
        transcript,
        encouragement: "Your recording was received, but a reliable word-by-word result is not available for this attempt.",
        nextStep,
        spokenGuidance: "A reliable word-by-word result is not available for this attempt. Listen once more, then try recording again in a quiet place.",
        wordReviewAvailable: false,
        reviewStatus: "unavailable" as const,
        reviewMessage,
        quranAwareReview,
        learningPlan: learningPlanResult,
        note: input.attemptScope === "word"
          ? "The focused target remains active. No ayah score was calculated, and no acoustic or pronunciation claim was made."
          : "No word score was calculated for this attempt. The app will preserve the recording controls so you can retry immediately.",
      });

      if ("error" in transcription) {
        return unavailableReview(
          transcription.error,
          "",
          "Check your connection and microphone, then record the ayah again. The app could not complete this review, but you can retry now.",
          "transcription_failed",
        );
      }

      if (!hasArabicScript(transcription.text)) {
        return unavailableReview(
          "The speech service did not return Arabic words for this recording.",
          transcription.text,
          "Try the ayah again in a quiet place. Keep the microphone close and recite one ayah at a calm pace.",
          "no_arabic_returned",
        );
      }

      if (input.attemptScope === "word" && focusedTarget) {
        const focusedWordResult = evaluateFocusedWordTranscript(focusedTarget, transcription.text);
        const recognition = focusedWordResult.recognition;
        const heard = tokenizeArabic(transcription.text)[0] ?? null;
        const reviewedWord = {
          expected: focusedTarget.canonicalArabic,
          heard,
          status: recognition === "recognised" ? "matched" as const : "review" as const,
          wordIndex: focusedTarget.targetWordIndex,
        };
        const reviewable = recognition !== "unknown";
        const nextStep = recognition === "recognised"
          ? "The expected target word was recognised in the transcript. Now recite the full ayah."
          : recognition === "not-recognised"
            ? "The expected target word was not recognised. Listen to the marked word, then say only that word again."
            : "The focused transcript was unclear. Keep the marked word and try that word again.";

        return {
          attemptScope: input.attemptScope,
          recitationScoreScope: reviewable ? "word" as const : "none" as const,
          focusedWordResult,
          correctionSession: focusedCorrectionSession(focusedTarget, recognition),
          reviewMessageCode: null,
          verseFollowing: focusedVerseFollowing({
            surah: input.surah,
            ayah: input.ayah,
            totalAyahs,
            position,
            target: focusedTarget,
            recognition,
          }),
          expectedWords: reviewable ? [reviewedWord] : [],
          extraWords: [],
          matchedCount: recognition === "recognised" ? 1 : 0,
          totalWords: reviewable ? 1 : 0,
          score: recognition === "recognised" ? 100 : 0,
          corrections: recognition === "not-recognised" ? [reviewedWord] : [],
          fallbackNextStep: nextStep,
          transcript: transcription.text,
          encouragement: recognition === "recognised"
            ? "The expected word was recognised."
            : "Keep the correction focused on the marked word.",
          nextStep,
          spokenGuidance: nextStep,
          wordReviewAvailable: reviewable,
          reviewStatus: "available" as const,
          reviewMessage: recognition === "unknown" ? "The focused transcript did not provide clear evidence about the target word." : null,
          quranAwareReview: EMPTY_QURAN_AWARE_REVIEW,
          learningPlan: learningPlanResult,
          note: "This focused result checks only whether the expected word was recognised in transcription. It does not calculate an ayah score or assess pronunciation, tajwid, makhraj, madd, ghunnah, or harakah acoustically.",
        };
      }

      const assessment = assessRecitationTranscript(input.expectedArabic, transcription.text);
      // Position tracking reuses this alignment as its only evidence — there is
      // one word aligner in the app, and this is it. The neighbours are aligned
      // with the same function so a repeated or prematurely started ayah is
      // recognised from the same kind of evidence.
      const verseFollowing = followRecitation({
        position,
        totalAyahs,
        alignment: assessment,
        previousAyahAlignment: input.previousAyahArabic
          ? assessRecitationTranscript(input.previousAyahArabic, transcription.text)
          : null,
        nextAyahAlignment: input.nextAyahArabic
          ? assessRecitationTranscript(input.nextAyahArabic, transcription.text)
          : null,
      });
      const coach = await createCoachSummary({ ...assessment, learningLevel: input.learningLevel, uiLanguage: input.uiLanguage });

      return {
        ...assessment,
        attemptScope: input.attemptScope,
        recitationScoreScope: "ayah" as const,
        focusedWordResult: null,
        correctionSession: ayahCorrectionSession(verseFollowing),
        reviewMessageCode: null,
        verseFollowing,
        quranAwareReview,
        learningPlan: learningPlanResult,
        transcript: transcription.text,
        encouragement: coach.encouragement,
        nextStep: coach.nextStep,
        spokenGuidance: coach.spokenGuidance,
        wordReviewAvailable: true,
        reviewStatus: "available" as const,
        reviewMessage: null,
        note: quranAwareReview.status === "available"
          ? "Word recall is based on transcription. The additional acoustic observation is confidence-gated practice guidance, not certification of tajwid, makharij, melody, religious correctness, or a replacement for a qualified teacher."
          : "This is a word-recall aid based on speech transcription. It does not judge tajwid, makharij, vowel length, melody, or replace a qualified teacher.",
      };
    }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
