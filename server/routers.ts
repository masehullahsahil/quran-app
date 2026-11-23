import { router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { tutorRouter } from "./tutorRouter";
import { authRouter } from "./authRouter";
import { learnerRouter } from "./learnerRouter";
import { quranRouter } from "./quranRouter";
import { recitationRouter } from "./recitationRouter";

/**
 * The tRPC API, composed from one router per feature. Add a feature by
 * creating server/<feature>Router.ts and registering it here. All API routes
 * are served under /api/trpc (see server/_core/app.ts).
 */
export const appRouter = router({
  system: systemRouter,
  tutor: tutorRouter,
  auth: authRouter,
  learner: learnerRouter,
  quran: quranRouter,
  recitation: recitationRouter,
});

export type AppRouter = typeof appRouter;
