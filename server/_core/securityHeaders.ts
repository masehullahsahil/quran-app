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
 * nothing embedded from elsewhere should get it. A Content-Security-Policy is
 * deliberately not set yet; it needs an inventory of the audio and font hosts
 * first, and a wrong policy would silently break recitation playback.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "microphone=(self), camera=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // HSTS is meaningless (and ignored by browsers) over plain HTTP; skip it
    // there so local development on http://localhost stays clean.
    if (name === "Strict-Transport-Security" && !isHttps(req)) continue;
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
