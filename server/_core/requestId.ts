/**
 * Request correlation.
 *
 * Assigns every HTTP request a correlation ID, exposes it as the
 * `x-request-id` response header, and makes it available to server code via
 * `req.requestId` and the tRPC context. When something fails, the safe
 * correlation ID is returned with the error so a browser/session error can
 * be traced through the server logs.
 *
 * A client-supplied `x-request-id` is honored only when it matches a strict
 * safe pattern — otherwise a fresh ID is generated. This keeps the browser
 * able to correlate its own errors while preventing log/header injection.
 */
import type { NextFunction, Request, Response } from "express";
import { nanoid } from "nanoid";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlation ID assigned by {@link requestIdMiddleware}. */
      requestId?: string;
    }
  }
}

/** Strictly safe: 8–64 chars of URL-safe characters, no whitespace/control. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function isSafeRequestId(value: unknown): value is string {
  return typeof value === "string" && SAFE_REQUEST_ID.test(value);
}

export function generateRequestId(): string {
  return `req_${nanoid(16)}`;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  const requestId = isSafeRequestId(incoming) ? incoming : generateRequestId();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
