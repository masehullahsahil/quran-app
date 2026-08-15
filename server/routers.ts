import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { transcribeAudio } from "./_core/voiceTranscription";
import { assessRecitationTranscript, hasArabicScript, tokenizeArabic } from "./recitation";
import { storageGetSignedUrl, storagePut } from "./storage";

const recitationInput = z.object({
  expectedArabic: z.string().min(1).max(1600),
  audioBase64: z.string().min(20).max(22_500_000),
  mimeType: z.enum(["audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4"]),
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
});

type CoachSummary = { encouragement: string; nextStep: string; spokenGuidance: string };

async function createCoachSummary(input: {
  score: number;
  matchedCount: number;
  totalWords: number;
  corrections: Array<{ expected: string; heard: string | null; status: string; wordIndex: number | null }>;
  fallbackNextStep: string;
}): Promise<CoachSummary> {
  const fallback: CoachSummary = {
    encouragement: input.score === 100
      ? "The expected words were all recognised. Keep the same calm pace for one more repetition."
      : "A good attempt. Keep the ayah together, then return only to the word marked for review.",
    nextStep: input.fallbackNextStep,
    spokenGuidance: input.score === 100
      ? "Every expected word was recognised. Listen once more, then repeat at the same calm pace."
      : `Good attempt. ${input.fallbackNextStep}`,
  };

  try {
    const response = await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "You are a respectful Quran learning assistant. Give concise supportive feedback strictly from supplied text-alignment data. Never claim to assess tajwid, makharij, melody, vowel length, pronunciation, or religious correctness from this data. Do not invent an error. Use plain English. Include a short spokenGuidance field that is safe to read aloud in English. Never use the assistant to recite or synthesize Quranic Arabic.",
        },
        {
          role: "user",
          content: JSON.stringify({
            matchedWords: input.matchedCount,
            totalWords: input.totalWords,
            score: input.score,
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

  recitation: router({
    evaluate: publicProcedure.input(recitationInput).mutation(async ({ input }) => {
      const rawBase64 = input.audioBase64.includes(",")
        ? input.audioBase64.slice(input.audioBase64.indexOf(",") + 1)
        : input.audioBase64;
      const audioBuffer = Buffer.from(rawBase64, "base64");
      if (!audioBuffer.length || audioBuffer.length > 16 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please submit an audio clip below 16 MB." });
      }

      const extension = input.mimeType === "audio/wav" ? "wav" : input.mimeType === "audio/ogg" ? "ogg" : input.mimeType === "audio/mp4" ? "m4a" : "webm";
      const uploaded = await storagePut(
        `recitation-attempts/guest/${input.surah}-${input.ayah}-${Date.now()}.${extension}`,
        audioBuffer,
        input.mimeType,
      );
      const signedAudioUrl = await storageGetSignedUrl(uploaded.key);
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
      const transcription = await transcribeAudio({
        audioUrl: signedAudioUrl,
        language: "ar",
      });

      if ("error" in transcription) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: transcription.error,
          cause: transcription,
        });
      }

      if (!hasArabicScript(transcription.text)) {
        return {
          expectedWords: [],
          extraWords: [],
          matchedCount: 0,
          totalWords: tokenizeArabic(input.expectedArabic).length,
          score: 0,
          corrections: [],
          fallbackNextStep: "Replay the qualified reciter, then repeat slowly. Word-level review will resume when Arabic words are recognised.",
          transcript: transcription.text,
          encouragement: "Your recording was received, but the speech service returned a translation rather than Arabic words.",
          nextStep: "Use the live word guide if your browser supports it, then try a quieter recording or review the ayah with a qualified teacher.",
          spokenGuidance: "The audio service returned a translation instead of Arabic words. It cannot give a reliable word-by-word review for this recording. Listen to the reciter and try again in a quieter place.",
          wordReviewAvailable: false,
          note: "No word score was calculated. This review tool only aligns Arabic words recognised by speech-to-text; it does not judge tajwid, makharij, vowel length, melody, or replace a qualified teacher.",
        };
      }

      const assessment = assessRecitationTranscript(input.expectedArabic, transcription.text);
      const coach = await createCoachSummary(assessment);

      return {
        ...assessment,
        transcript: transcription.text,
        encouragement: coach.encouragement,
        nextStep: coach.nextStep,
        spokenGuidance: coach.spokenGuidance,
        wordReviewAvailable: true,
        note: "This is a word-recall aid based on speech transcription. It does not judge tajwid, makharij, vowel length, melody, or replace a qualified teacher.",
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
