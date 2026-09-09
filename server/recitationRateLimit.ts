import crypto from "node:crypto";
import type { TrpcContext } from "./_core/context";

type RateLimitWindow = {
  name: "burst" | "sustained";
  limit: number;
  windowSeconds: number;
};

type RateLimitCounter = {
  count: number;
  resetAt: number;
};

export type RecitationRateLimitDecision =
  | { allowed: true; identityType: "user" | "ip"; store: "redis" | "memory" }
  | {
      allowed: false;
      identityType: "user" | "ip";
      retryAfterSeconds: number;
      window: RateLimitWindow["name"];
      store: "redis" | "memory";
    };

const ANONYMOUS_WINDOWS: RateLimitWindow[] = [
  { name: "burst", limit: 4, windowSeconds: 60 },
  { name: "sustained", limit: 20, windowSeconds: 60 * 60 },
];

const AUTHENTICATED_WINDOWS: RateLimitWindow[] = [
  { name: "burst", limit: 8, windowSeconds: 60 },
  { name: "sustained", limit: 60, windowSeconds: 60 * 60 },
];

// Incremental recognition needs several short observations per utterance. It
// has a separate bounded budget so it does not exhaust the finalized-review
// allowance before a correction can complete.
const LIVE_ANONYMOUS_WINDOWS: RateLimitWindow[] = [
  { name: "burst", limit: 16, windowSeconds: 60 },
  { name: "sustained", limit: 120, windowSeconds: 60 * 60 },
];

const LIVE_AUTHENTICATED_WINDOWS: RateLimitWindow[] = [
  { name: "burst", limit: 32, windowSeconds: 60 },
  { name: "sustained", limit: 300, windowSeconds: 60 * 60 },
];

const MEMORY_COUNTERS = "__miqraRecitationRateLimitMemoryCounters";
const memoryCounters = getSharedMemoryCounters();

export async function checkRecitationEvaluateRateLimit(ctx: TrpcContext): Promise<RecitationRateLimitDecision> {
  return checkRateLimit(ctx, "evaluate", ANONYMOUS_WINDOWS, AUTHENTICATED_WINDOWS);
}

export async function checkLiveRecitationRateLimit(ctx: TrpcContext): Promise<RecitationRateLimitDecision> {
  return checkRateLimit(ctx, "live", LIVE_ANONYMOUS_WINDOWS, LIVE_AUTHENTICATED_WINDOWS);
}

async function checkRateLimit(
  ctx: TrpcContext,
  namespace: "evaluate" | "live",
  anonymousWindows: RateLimitWindow[],
  authenticatedWindows: RateLimitWindow[],
): Promise<RecitationRateLimitDecision> {
  const identity = getRateLimitIdentity(ctx);
  const windows = identity.type === "user" ? authenticatedWindows : anonymousWindows;
  const store = createStore();

  for (const window of windows) {
    const key = `recitation:${namespace}:${window.name}:${identity.type}:${identity.hash}`;
    const counter = await store.increment(key, window.windowSeconds);
    if (counter.count > window.limit) {
      return {
        allowed: false,
        identityType: identity.type,
        retryAfterSeconds: Math.max(1, Math.ceil((counter.resetAt - Date.now()) / 1000)),
        window: window.name,
        store: store.kind,
      };
    }
  }

  return { allowed: true, identityType: identity.type, store: store.kind };
}

export function logRecitationRateLimit(decision: Extract<RecitationRateLimitDecision, { allowed: false }>) {
  console.warn("[recitation] evaluate rate limited", {
    identityType: decision.identityType,
    retryAfterSeconds: decision.retryAfterSeconds,
    window: decision.window,
    store: decision.store,
  });
}

export function resetRecitationRateLimitForTests() {
  memoryCounters.clear();
}

function getRateLimitIdentity(ctx: TrpcContext): { type: "user" | "ip"; hash: string } {
  if (ctx.user) return { type: "user", hash: hashIdentity(`user:${ctx.user.id}`) };
  return { type: "ip", hash: hashIdentity(`ip:${getClientIp(ctx)}`) };
}

function getClientIp(ctx: TrpcContext): string {
  const req = ctx.req;
  const remoteAddress = req?.socket?.remoteAddress;

  if (process.env.VERCEL) {
    const forwardedFor = firstHeaderValue(req?.headers?.["x-forwarded-for"]);
    if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return remoteAddress || "unknown";
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function hashIdentity(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function getSharedMemoryCounters(): Map<string, RateLimitCounter> {
  const globalStore = globalThis as typeof globalThis & { [MEMORY_COUNTERS]?: Map<string, RateLimitCounter> };
  globalStore[MEMORY_COUNTERS] ??= new Map<string, RateLimitCounter>();
  return globalStore[MEMORY_COUNTERS];
}

function createStore(): {
  kind: "redis" | "memory";
  increment(key: string, windowSeconds: number): Promise<RateLimitCounter>;
} {
  const url = process.env.RECITATION_RATE_LIMIT_REDIS_REST_URL?.trim();
  const token = process.env.RECITATION_RATE_LIMIT_REDIS_REST_TOKEN?.trim();

  if (url && token) {
    return {
      kind: "redis",
      async increment(key, windowSeconds) {
        return incrementRedis(url, token, key, windowSeconds);
      },
    };
  }

  return { kind: "memory", increment: incrementMemory };
}

async function incrementRedis(
  url: string,
  token: string,
  key: string,
  windowSeconds: number,
): Promise<RateLimitCounter> {
  const count = await redisCommand<number>(url, token, ["INCR", key]);
  if (count === 1) await redisCommand(url, token, ["EXPIRE", key, windowSeconds]);
  const ttl = await redisCommand<number>(url, token, ["TTL", key]);
  return {
    count,
    resetAt: Date.now() + Math.max(1, ttl) * 1000,
  };
}

async function redisCommand<T = unknown>(url: string, token: string, command: Array<string | number>): Promise<T> {
  const response = await fetch(url.replace(/\/+$/, ""), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`Rate-limit store request failed with HTTP ${response.status}`);
  }

  const payload = await response.json() as { result?: T; error?: string };
  if (payload.error) throw new Error("Rate-limit store returned an error");
  return payload.result as T;
}

async function incrementMemory(key: string, windowSeconds: number): Promise<RateLimitCounter> {
  const now = Date.now();
  const current = memoryCounters.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowSeconds * 1000 };
    memoryCounters.set(key, next);
    return next;
  }

  current.count += 1;
  return current;
}
