/**
 * Builds the Express app: routes and middleware only, no server, no listener.
 *
 * This module exists so the app can be mounted two ways. `_core/index.ts` wraps
 * it in an HTTP server and listens, for local development and `pnpm start`.
 * `api/index.ts` exports it as a serverless handler for Vercel.
 *
 * Nothing here may import `./vite`. That module pulls in Vite itself — a
 * devDependency — and a static import would drag the whole dev server into the
 * serverless bundle, where it is both dead weight and quite possibly absent.
 * The dev-only wiring stays in `_core/index.ts`, which the serverless entry
 * never touches.
 */
import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { REQUEST_BODY_LIMIT_BYTES } from "@shared/recording";

/**
 * Body limit for JSON requests.
 *
 * Matched to the platform rather than set generously: a Vercel serverless
 * function rejects anything over ~4.5 MB before our code runs, so accepting
 * more here would only mean the two layers disagree about what is valid.
 * The recorder enforces the same ceiling in the browser — see shared/recording.ts.
 */
const JSON_BODY_LIMIT = `${REQUEST_BODY_LIMIT_BYTES}b`;

export function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ limit: JSON_BODY_LIMIT, extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  return app;
}
