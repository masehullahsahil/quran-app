import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { DEFAULT_RECITER_ID, DEFAULT_TRANSLATION_ID, getQuranIndex, getSurahContent } from "./quranApi";

/** Quran content proxied (and cached) from Quran.com. */
export const quranRouter = router({
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
});
