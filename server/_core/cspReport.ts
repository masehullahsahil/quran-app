import express, { type Express, type Request, type Response } from "express";
import { CSP_REPORT_PATH } from "./securityHeaders";
import { logger } from "./logger";

/**
 * Collects Content-Security-Policy violation reports.
 *
 * The policy ships report-only (securityHeaders.ts), so these reports are the
 * evidence needed before it can be enforced: each one names a resource the
 * policy would have blocked. Browsers send two formats:
 *
 * - `report-uri`: `application/csp-report`, `{ "csp-report": { ... } }` (what
 *   the policy currently requests)
 * - `report-to`:  `application/reports+json`, `[{ type: "csp-violation", body: { ... } }]`
 *   (accepted so the policy can switch to it later without a server change)
 *
 * Only safe, coarse fields are logged: the directive and the blocked
 * resource's origin (or keyword such as "inline"), plus the page path. Query
 * strings and fragments are dropped, since URLs can carry user data. Identical
 * violations are logged once per window per instance so a noisy page cannot
 * flood the logs. The endpoint always answers 204 and never echoes input.
 */

const REPORT_BODY_LIMIT = "16kb";
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED = 500;

export type CspViolation = {
  directive: string;
  blocked: string;
  documentPath: string;
  disposition: string;
};

type Raw = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** Reduce a URL (or CSP keyword) to something safe to log. */
export function safeResource(value: string): string {
  if (!value) return "unknown";
  if (!value.includes(":")) return value.slice(0, 40); // "inline", "eval", "self"
  try {
    const url = new URL(value);
    if (url.protocol === "data:" || url.protocol === "blob:") return url.protocol;
    return url.origin === "null" ? url.protocol : url.origin;
  } catch {
    return value.split(/[?#]/)[0].slice(0, 80);
  }
}

function safePath(value: string): string {
  if (!value) return "unknown";
  try {
    return new URL(value).pathname.slice(0, 120);
  } catch {
    return "unknown";
  }
}

function fromLegacy(report: Raw): CspViolation {
  return {
    directive: str(report["effective-directive"]) || str(report["violated-directive"]).split(" ")[0] || "unknown",
    blocked: safeResource(str(report["blocked-uri"])),
    documentPath: safePath(str(report["document-uri"])),
    disposition: str(report.disposition) || "report",
  };
}

function fromReportingApi(body: Raw): CspViolation {
  return {
    directive: str(body.effectiveDirective) || "unknown",
    blocked: safeResource(str(body.blockedURL)),
    documentPath: safePath(str(body.documentURL)),
    disposition: str(body.disposition) || "report",
  };
}

/** Parse either report format into violations. Unknown shapes yield none. */
export function parseCspReports(payload: unknown): CspViolation[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((entry): entry is Raw => Boolean(entry) && typeof entry === "object")
      .filter(entry => entry.type === "csp-violation" && entry.body && typeof entry.body === "object")
      .slice(0, 20)
      .map(entry => fromReportingApi(entry.body as Raw));
  }
  if (payload && typeof payload === "object") {
    const legacy = (payload as Raw)["csp-report"];
    if (legacy && typeof legacy === "object") return [fromLegacy(legacy as Raw)];
  }
  return [];
}

export function createViolationDeduper(now: () => number = Date.now) {
  const seen = new Map<string, number>();
  return (violation: CspViolation): boolean => {
    const key = `${violation.directive}|${violation.blocked}|${violation.documentPath}`;
    const t = now();
    const last = seen.get(key);
    if (last !== undefined && t - last < DEDUPE_WINDOW_MS) return false;
    if (seen.size >= MAX_TRACKED) {
      const oldest = seen.keys().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
    seen.delete(key);
    seen.set(key, t);
    return true;
  };
}

export function registerCspReportEndpoint(app: Express): void {
  const shouldLog = createViolationDeduper();
  app.post(
    CSP_REPORT_PATH,
    express.json({
      limit: REPORT_BODY_LIMIT,
      type: ["application/csp-report", "application/reports+json", "application/json"],
    }),
    (req: Request, res: Response) => {
      for (const violation of parseCspReports(req.body)) {
        if (!shouldLog(violation)) continue;
        logger.warn({
          subsystem: "csp",
          operation: "csp.violation",
          requestId: req.requestId,
          status: violation.disposition,
          message: `CSP would block ${violation.blocked} (${violation.directive})`,
          details: violation,
        });
      }
      res.status(204).end();
    },
  );
}
