import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { SECURITY_HEADERS, securityHeadersMiddleware } from "./securityHeaders";

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function get(headers: Record<string, string> = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeadersMiddleware);
  app.get("/x", (_req, res) => res.send("ok"));
  server = await new Promise<Server>(resolve => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}/x`, { headers });
}

describe("security headers", () => {
  it("sets the baseline headers and omits HSTS over plain HTTP", async () => {
    const res = await get();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("permissions-policy")).toContain("microphone=(self)");
    expect(res.headers.get("strict-transport-security")).toBeNull();
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("sends HSTS behind an HTTPS proxy", async () => {
    const res = await get({ "x-forwarded-proto": "https" });
    expect(res.headers.get("strict-transport-security")).toBe(SECURITY_HEADERS["Strict-Transport-Security"]);
  });

  it("matches the headers vercel.json applies to CDN-served files", () => {
    const config = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../vercel.json"), "utf-8"));
    const global = config.headers.find((h: { source: string }) => h.source === "/(.*)");
    const fromVercel = Object.fromEntries(
      global.headers.map((h: { key: string; value: string }) => [h.key, h.value]),
    );
    expect(fromVercel).toEqual(SECURITY_HEADERS);
  });
});
