/**
 * Production health endpoint: `GET /api/health`.
 *
 * Reports safe operational information only: application status, the
 * deployment/build identifier when available, the environment type, and the
 * state of critical versus optional services. It NEVER exposes secrets,
 * tokens, passwords, connection strings, raw environment-variable values, or
 * user information — checks report presence/reachability booleans and
 * latencies, never values.
 *
 * Overall states:
 * - "healthy": every critical check passes (optional services may be down).
 * - "degraded": a critical check is down/not configured, or required config
 *   is missing. The app still responds.
 * - "unavailable": the health handler itself failed (returned as HTTP 503).
 *
 * A temporary failure in an optional service (acoustic evaluator,
 * transcription, Quran content API) never flips the overall state away from
 * healthy — it is surfaced per-service so operators can see it without the
 * site falsely appearing offline.
 *
 * All probes are bounded by short timeouts and run in parallel, so the
 * endpoint stays fast on serverless functions.
 */
import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { validateConfig } from "./config";
import { logger } from "./logger";

export type HealthStatus = "healthy" | "degraded" | "unavailable";

/** "up"/"down" for probed services, "configured"/"not_configured" for presence checks. */
export type ServiceState = "up" | "down" | "configured" | "not_configured";

export type HealthCheck = {
  name: string;
  /** Machine key, e.g. "database", "acousticEvaluator". */
  status: ServiceState;
  /** Critical checks drive the overall state; optional ones are informational. */
  critical: boolean;
  latencyMs?: number;
};

export type HealthReport = {
  status: HealthStatus;
  service: string;
  build: {
    /** Vercel commit SHA when deployed on Vercel, else "unknown". */
    commit: string;
    vercelEnv: string;
  };
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  config: { valid: boolean; errors: number; warnings: number };
  checks: HealthCheck[];
};

export type HealthDeps = {
  env: NodeJS.ProcessEnv;
  now: () => number;
  /** Injectable so tests never touch a real database or network. */
  pingDatabase: (timeoutMs: number) => Promise<{ status: ServiceState; latencyMs?: number }>;
  /** Injectable reachability probe; any completed HTTP response counts as up. */
  probeUrl: (url: string, timeoutMs: number) => Promise<{ up: boolean; latencyMs: number }>;
};

const PROBE_TIMEOUT_MS = 3000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Real database probe: cheap SELECT 1 over the lazily-created drizzle pool. */
export async function pingDatabase(timeoutMs = PROBE_TIMEOUT_MS): Promise<{ status: ServiceState; latencyMs?: number }> {
  if (!process.env.DATABASE_URL) return { status: "not_configured" };
  const start = Date.now();
  try {
    const db = await getDb();
    if (!db) return { status: "down", latencyMs: Date.now() - start };
    const attempt = db.execute(sql`SELECT 1`);
    // Attach a no-op handler so a timeout winning the race cannot surface as
    // an unhandled rejection from the dangling connection attempt.
    attempt.catch(() => {});
    await withTimeout(attempt, timeoutMs);
    return { status: "up", latencyMs: Date.now() - start };
  } catch {
    return { status: "down", latencyMs: Date.now() - start };
  }
}

/** Real reachability probe: any completed HTTP response (even 4xx) means the host is up. */
export async function probeUrl(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<{ up: boolean; latencyMs: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { method: "GET", signal: controller.signal, redirect: "manual" });
    return { up: true, latencyMs: Date.now() - start };
  } catch {
    return { up: false, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

export function defaultHealthDeps(): HealthDeps {
  return { env: process.env, now: Date.now, pingDatabase, probeUrl };
}

function isPassing(check: HealthCheck): boolean {
  return check.status === "up" || check.status === "configured";
}

export async function checkHealth(deps: HealthDeps = defaultHealthDeps()): Promise<HealthReport> {
  const { env } = deps;
  const config = validateConfig(env);

  const quranApiBase = env.QURAN_API_BASE_URL ?? "https://api.quran.com/api/v4";
  const evaluatorUrl = env.QURAN_EVALUATOR_URL;

  const [database, quranContentApi, acousticEvaluator] = await Promise.all([
    deps.pingDatabase(PROBE_TIMEOUT_MS),
    deps.probeUrl(quranApiBase, PROBE_TIMEOUT_MS).then(({ up, latencyMs }) => ({
      status: (up ? "up" : "down") as ServiceState,
      latencyMs,
    })),
    evaluatorUrl
      ? deps.probeUrl(evaluatorUrl, PROBE_TIMEOUT_MS).then(({ up, latencyMs }) => ({
          status: (up ? "up" : "down") as ServiceState,
          latencyMs,
        }))
      : Promise.resolve({ status: "not_configured" as ServiceState, latencyMs: undefined as number | undefined }),
  ]);

  const checks: HealthCheck[] = [
    // Critical: the signed-in learner-persistence flow needs the database.
    { name: "database", status: database.status, critical: true, latencyMs: database.latencyMs },
    // Critical presence check: auth cannot work without these (not probed).
    {
      name: "authentication",
      status: env.JWT_SECRET && env.OAUTH_SERVER_URL && env.VITE_APP_ID ? "configured" : "not_configured",
      critical: true,
    },
    // Optional: Quran text/audio served from cache when reachable; failures degrade, not outage.
    { name: "quranContentApi", status: quranContentApi.status, critical: false, latencyMs: quranContentApi.latencyMs },
    // Optional: the acoustic evaluator abstains safely when absent/unreachable.
    { name: "acousticEvaluator", status: acousticEvaluator.status, critical: false, latencyMs: acousticEvaluator.latencyMs },
    // Optional: transcription/LLM wording; presence only, never probed (no spend).
    {
      name: "transcription",
      status: env.OPENAI_API_KEY ? "configured" : "not_configured",
      critical: false,
    },
  ];

  const criticalFailing = checks.some((check) => check.critical && !isPassing(check));
  const status: HealthStatus = !config.valid || criticalFailing ? "degraded" : "healthy";

  return {
    status,
    service: "quran-reading-experience",
    build: {
      commit: env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
      vercelEnv: env.VERCEL_ENV ?? "unknown",
    },
    environment: env.NODE_ENV ?? "unknown",
    timestamp: new Date(deps.now()).toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    config: { valid: config.valid, errors: config.errors.length, warnings: config.warnings.length },
    checks,
  };
}

export function registerHealthEndpoint(app: Express): void {
  app.get("/api/health", async (req: Request, res: Response) => {
    const requestId = req.requestId;
    try {
      const report = await checkHealth();
      logger.info({
        subsystem: "health",
        operation: "api.health",
        requestId,
        status: report.status,
        message: `health check: ${report.status}`,
        details: {
          configErrors: report.config.errors,
          failing: report.checks.filter((c) => c.status === "down" || c.status === "not_configured").map((c) => c.name),
        },
      });
      // 200 for healthy AND degraded: the endpoint itself worked and the body
      // carries the state. 503 is reserved for "we could not even answer".
      res.status(200).json(report);
    } catch (error) {
      logger.error({
        subsystem: "health",
        operation: "api.health",
        requestId,
        status: "error",
        errorCategory: "HEALTH_CHECK_FAILED",
        message: "health check failed unexpectedly",
      });
      res.status(503).json({
        status: "unavailable",
        service: "quran-reading-experience",
        timestamp: new Date().toISOString(),
        correlationId: requestId,
      });
    }
  });
}
