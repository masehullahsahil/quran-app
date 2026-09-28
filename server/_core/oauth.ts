import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * The OAuth redirect URI. Uses PUBLIC_APP_URL when set (production), falling
 * back to the request's own origin (local dev / preview).
 */
function getRedirectUri(req: Request): string {
  const base = ENV.publicAppUrl || `${req.protocol}://${req.get("host")}`;
  return `${base.replace(/\/$/, "")}/api/oauth/callback`;
}

/**
 * Decode the payload of a JWT without verifying its signature. The ID token
 * comes directly from Google's token endpoint over HTTPS, so its content is
 * trustworthy for identifying the user. (Full signature verification would
 * require fetching Google's public keys; the state-nonce CSRF check below
 * is the critical security boundary.)
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function registerOAuthRoutes(app: Express) {
  /**
   * Start the Google OAuth login. The client sets the one-time state cookie
   * (via startLogin) and navigates here; we build the Google authorization
   * URL with the server-held client ID and redirect.
   */
  app.get("/api/oauth/login", (req: Request, res: Response) => {
    const clientId = ENV.googleClientId;
    if (!clientId) {
      res.status(500).json({ error: "Google OAuth is not configured" });
      return;
    }
    const redirectUri = getRedirectUri(req);
    const state = getQueryParam(req, "state") ?? "";
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
    res.redirect(302, url.toString());
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

    const clientId = ENV.googleClientId;
    const clientSecret = ENV.googleClientSecret;
    if (!clientId || !clientSecret) {
      res.status(500).json({ error: "Google OAuth is not configured" });
      return;
    }

    try {
      // Exchange the authorization code for tokens with Google.
      const redirectUri = getRedirectUri(req);
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
      });
      if (!tokenResponse.ok) {
        console.error("[OAuth] Google token exchange failed", tokenResponse.status);
        res.status(500).json({ error: "OAuth token exchange failed" });
        return;
      }
      const tokens = (await tokenResponse.json()) as { id_token?: string; access_token?: string };
      const idToken = tokens.id_token;
      if (!idToken) {
        res.status(500).json({ error: "no id_token in Google response" });
        return;
      }

      const claims = decodeJwtPayload(idToken);
      const googleSub = typeof claims?.sub === "string" ? claims.sub : null;
      const email = typeof claims?.email === "string" ? claims.email : null;
      const name = typeof claims?.name === "string" ? claims.name : null;
      if (!googleSub) {
        res.status(400).json({ error: "openId missing from Google id_token" });
        return;
      }

      await db.upsertUser({
        openId: `google:${googleSub}`,
        name: name || null,
        email: email ?? null,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(`google:${googleSub}`, {
        name: name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
