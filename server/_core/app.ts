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
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerHealthEndpoint } from "./health";
import { requestIdMiddleware } from "./requestId";
import { logger } from "./logger";
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

/**
 * Final error handler for non-tRPC routes (health, OAuth, storage proxy,
 * body-parser failures). Returns a stable error code, a safe user-facing
 * message, and the correlation ID — never a stack trace or internals.
 */
function safeErrorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const statusRaw = (err as { status?: unknown; statusCode?: unknown }).status
    ?? (err as { statusCode?: unknown }).statusCode;
  const status = typeof statusRaw === "number" && statusRaw >= 400 && statusRaw < 600 ? statusRaw : 500;
  const requestId = req.requestId;

  logger.error({
    subsystem: "http",
    operation: `${req.method} ${req.path}`,
    requestId,
    status: "error",
    errorCategory: status >= 500 ? "INTERNAL_ERROR" : "CLIENT_ERROR",
    message: status >= 500 ? "request failed" : "request rejected",
    details: { httpStatus: status },
  });

  if (res.headersSent) return;
  res.status(status).json({
    error: {
      code: status === 400 ? "BAD_REQUEST" : status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
      message:
        status >= 500
          ? "Something went wrong on our side. Please try again."
          : "The request could not be processed.",
      correlationId: requestId ?? null,
    },
  });
}

export function createApp(): Express {
  const app = express();

  // Correlation first: every request (even rejected ones) gets an ID.
  app.use(requestIdMiddleware);

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ limit: JSON_BODY_LIMIT, extended: true }));

  // Production health endpoint. Registered before other routes so it is
  // never shadowed by a catch-all (see _core/vite.ts in local mode).
  registerHealthEndpoint(app);

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path, ctx }) => {
        logger.error({
          subsystem: "trpc",
          operation: path ?? "unknown",
          requestId: ctx?.requestId,
          status: "error",
          errorCategory: error.code,
          message: `tRPC ${path ?? "unknown"} failed: ${error.code}`,
        });
      },
    }),
  );

  // Safe error responses for everything else.
  app.use(safeErrorHandler);

  return app;
}
