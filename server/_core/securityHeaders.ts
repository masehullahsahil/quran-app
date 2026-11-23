import type { NextFunction, Request, Response } from "express";

/**
 * Baseline security headers for every response the Express app sends (the
 * API on Vercel; the API and the static client under `pnpm start`).
 *
 * On Vercel the static client is served by the CDN, not Express, so the same
 * headers are also declared in vercel.json — keep the two lists in step
 * (securityHeaders.test.ts checks this).
 *
 * The microphone is allowed for this origin only: recitation needs it, and
 * nothing embedded from elsewhere should get it.
 *
 * The Content-Security-Policy ships in REPORT-ONLY mode: browsers report what
 * it would block to /api/csp-report (see cspReport.ts) but block nothing.
 * Reciter audio URLs come from Quran.com and some are absolute URLs on hosts
 * this repository cannot list in advance, so enforcing a guessed policy could
 * silently break recitation playback. Once the reports are quiet, switch the
 * header name to Content-Security-Policy (docs/production-readiness.md).
 */
export const CSP_REPORT_PATH = "/api/csp-report";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // Radix, sonner and framer-motion set inline style attributes.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  // Ayah audio (verses.quran.com), word audio (audio.qurancdn.com), and
  // learner recordings / coach voice played back from blob: URLs.
  "media-src 'self' blob: https://verses.quran.com https://audio.qurancdn.com",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // report-uri only. It is deprecated in favour of report-to, but every
  // major browser still honours it, whereas Chrome ignores report-uri once
  // report-to is present and its batched Reporting API delivery could not
  // be verified end to end here. Revisit when report-to is verifiable.
  `report-uri ${CSP_REPORT_PATH}`,
].join("; ");

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "microphone=(self), camera=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy-Report-Only": CONTENT_SECURITY_POLICY,
};

/** Headers that only make sense for production traffic. */
const PRODUCTION_ONLY = new Set(["Content-Security-Policy-Report-Only"]);

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // HSTS is meaningless (and ignored by browsers) over plain HTTP; skip it
    // there so local development on http://localhost stays clean.
    if (name === "Strict-Transport-Security" && !isHttps(req)) continue;
    // The Vite dev server injects inline scripts and a websocket for HMR;
    // reporting those as violations would only bury the real ones.
    if (PRODUCTION_ONLY.has(name) && process.env.NODE_ENV !== "production") continue;
    res.setHeader(name, value);
  }
  next();
}

function isHttps(req: Request): boolean {
  if (req.protocol === "https") return true;
  const forwarded = req.headers["x-forwarded-proto"];
  const value = Array.isArray(forwarded) ? forwarded.join(",") : forwarded ?? "";
  return value.split(",").some(proto => proto.trim().toLowerCase() === "https");
}
