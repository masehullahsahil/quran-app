/**
 * The storage proxy turns a key into a signed download URL for objects that
 * include learners' recitation recordings. It must refuse anonymous and
 * non-admin callers before it ever asks the storage backend for a URL.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";
import { registerStorageProxy, type StorageProxyAuthenticator } from "./storageProxy";
import { ENV } from "./env";

function user(role: User["role"]): User {
  const now = new Date();
  return {
    id: 1,
    openId: "google:1",
    name: "Test",
    email: null,
    loginMethod: "google",
    role,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

let server: Server | undefined;
const savedForge = { url: ENV.forgeApiUrl, key: ENV.forgeApiKey };

afterEach(async () => {
  vi.unstubAllGlobals();
  ENV.forgeApiUrl = savedForge.url;
  ENV.forgeApiKey = savedForge.key;
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function start(authenticate: StorageProxyAuthenticator) {
  ENV.forgeApiUrl = "https://forge.example.test";
  ENV.forgeApiKey = "forge-key";
  const app = express();
  registerStorageProxy(app, authenticate);
  server = await new Promise<Server>(resolve => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function stubForge() {
  const realFetch = globalThis.fetch;
  const forgeCalls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://forge.example.test")) {
      forgeCalls.push(url);
      return new Response(JSON.stringify({ url: "https://s3.example.test/signed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input as RequestInfo, init);
  });
  return forgeCalls;
}

const KEY = "recitation-attempts/guest/1-1-1700000000000_abcd1234.webm";

describe("storage proxy access control", () => {
  it("rejects anonymous callers without contacting storage", async () => {
    const base = await start(async () => null);
    const forgeCalls = stubForge();
    const res = await fetch(`${base}/manus-storage/${KEY}`, { redirect: "manual" });
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(forgeCalls).toEqual([]);
  });

  it("rejects signed-in non-admin users without contacting storage", async () => {
    const base = await start(async () => user("user"));
    const forgeCalls = stubForge();
    const res = await fetch(`${base}/manus-storage/${KEY}`, { redirect: "manual" });
    expect(res.status).toBe(403);
    expect(forgeCalls).toEqual([]);
  });

  it("redirects admins to a signed URL", async () => {
    const base = await start(async () => user("admin"));
    const forgeCalls = stubForge();
    const res = await fetch(`${base}/manus-storage/${KEY}`, { redirect: "manual" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://s3.example.test/signed");
    expect(forgeCalls).toHaveLength(1);
  });
});
