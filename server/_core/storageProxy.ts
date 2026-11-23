import type { Express, Request } from "express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sessionService } from "./sdk";

/**
 * Who may turn a storage key into a signed download URL.
 *
 * The bucket holds learners' recitation recordings, so the proxy must never
 * be an open door: anyone could otherwise enumerate keys (they are built from
 * a surah, an ayah and a timestamp) and listen to other people's voices.
 * Nothing in the learner client reads from this route, so access is limited
 * to admins. Exported so tests can swap the authenticator.
 */
export type StorageProxyAuthenticator = (req: Request) => Promise<User | null>;

const defaultAuthenticator: StorageProxyAuthenticator = async req => {
  try {
    return await sessionService.authenticateRequest(req);
  } catch {
    return null;
  }
};

export function registerStorageProxy(
  app: Express,
  authenticate: StorageProxyAuthenticator = defaultAuthenticator,
) {
  app.get("/manus-storage/*", async (req, res) => {
    res.set("Cache-Control", "no-store");

    const user = await authenticate(req);
    if (!user) {
      res.status(401).send("Sign in required");
      return;
    }
    if (user.role !== "admin") {
      res.status(403).send("Forbidden");
      return;
    }

    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        console.error(`[StorageProxy] forge error: ${forgeResp.status}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
