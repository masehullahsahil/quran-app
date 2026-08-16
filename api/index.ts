/**
 * Vercel serverless entry point.
 *
 * Vercel's Node runtime accepts an Express app as a request handler, so this
 * exports the app instead of listening on a port. There is no `server.listen()`
 * and no port scan here — both are meaningless in a function that is handed one
 * request at a time.
 *
 * The app is built once per instance, at module scope, so a warm invocation
 * reuses it. That also means the in-memory Quran cache survives between
 * requests on the same instance; it is per-instance rather than shared, which
 * costs some cache hits but nothing in correctness (see server/quranCache.ts).
 *
 * `vercel.json` routes /api/trpc/*, /api/oauth/* and /manus-storage/* here.
 * Everything else is served from the CDN.
 */
import { createApp } from "../server/_core/app";

export default createApp();
