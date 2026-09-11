/**
 * Tests for the health endpoint logic and route.
 *
 * `checkHealth` is exercised with injected dependencies so no test touches a
 * real database or network. The route test boots the real Express app but
 * points every probe at fast-failing local targets.
 */
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { checkHealth, registerHealthEndpoint, type HealthDeps } from "./health";
import { requestIdMiddleware } from "./requestId";
import { createApp } from "./app";
import express from "express";

const BASE_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "mysql://db.example/app",
  JWT_SECRET: "secret",
  OAUTH_SERVER_URL: "https://auth.example",
  VITE_OAUTH_PORTAL_URL: "https://portal.example",
  VITE_APP_ID: "app-id",
  QURAN_API_BASE_URL: "https://quran.example/api",
  QURAN_EVALUATOR_URL: "https://evaluator.example",
  OPENAI_API_KEY: "key",
};

function depsWith(overrides: Partial<HealthDeps> = {}, env: NodeJS.ProcessEnv = BASE_ENV): HealthDeps {
  return {
    env,
    now: () => 1_728_000_000_000,
    pingDatabase: async () => ({ status: "up", latencyMs: 5 }),
    probeUrl: async () => ({ up: true, latencyMs: 10 }),
    ...overrides,
  };
}

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("checkHealth", () => {
  it("reports healthy when core checks pass and config is valid", async () => {
    const report = await checkHealth(depsWith());
    expect(report.status).toBe("healthy");
    expect(report.service).toBe("quran-reading-experience");
    expect(report.checks.find((c) => c.name === "database")?.status).toBe("up");
    expect(report.config.valid).toBe(true);
    expect(report.timestamp).toBe(new Date(1_728_000_000_000).toISOString());
  });

  it("reports degraded when the database is down, but keeps optional failures informational", async () => {
    const report = await checkHealth(
      depsWith({ pingDatabase: async () => ({ status: "down", latencyMs: 3000 }) })
    );
    expect(report.status).toBe("degraded");
    expect(report.checks.find((c) => c.name === "database")?.status).toBe("down");
  });

  it("stays healthy when an optional service is unavailable", async () => {
    const report = await checkHealth(
      depsWith({ probeUrl: async (url) => ({ up: !url.includes("evaluator"), latencyMs: 10 }) })
    );
    expect(report.status).toBe("healthy");
    expect(report.checks.find((c) => c.name === "acousticEvaluator")?.status).toBe("down");
    expect(report.checks.find((c) => c.name === "acousticEvaluator")?.critical).toBe(false);
  });

  it("reports an unconfigured optional service as not_configured without degrading", async () => {
    const { QURAN_EVALUATOR_URL: _drop, ...env } = BASE_ENV;
    const report = await checkHealth(depsWith({}, env));
    expect(report.status).toBe("healthy");
    expect(report.checks.find((c) => c.name === "acousticEvaluator")?.status).toBe("not_configured");
  });

  it("reports degraded when required configuration is missing", async () => {
    const { DATABASE_URL: _drop, ...env } = BASE_ENV;
    const report = await checkHealth(depsWith({}, env));
    expect(report.status).toBe("degraded");
    expect(report.config.valid).toBe(false);
    expect(report.config.errors).toBeGreaterThan(0);
  });

  it("never exposes secret values", async () => {
    const secret = "top-secret-db-password-xyz";
    const env = { ...BASE_ENV, DATABASE_URL: `mysql://user:${secret}@db.example/app` };
    const report = await checkHealth(depsWith({}, env));
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it("reports the deployment build identifier when available", async () => {
    const report = await checkHealth(depsWith({}, { ...BASE_ENV, VERCEL_GIT_COMMIT_SHA: "abc123", VERCEL_ENV: "production" }));
    expect(report.build.commit).toBe("abc123");
    expect(report.build.vercelEnv).toBe("production");
  });
});

describe("registerHealthEndpoint", () => {
  it("is mounted at GET /api/health on the app", async () => {
    const app = createApp();
    const seen: string[] = [];
    for (const layer of (app._router?.stack ?? []) as Array<{ route?: { path: string; methods: Record<string, boolean> } }>) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).filter((m) => layer.route?.methods[m]).join(",").toUpperCase();
        seen.push(`${methods} ${layer.route.path}`);
      }
    }
    expect(seen).toContain("GET /api/health");
  });
});

describe("health endpoint over HTTP", () => {
  it("returns a JSON report with a correlation header and no leak markers", async () => {
    // Fast-failing local targets: nothing here touches the real network.
    process.env.QURAN_API_BASE_URL = "http://127.0.0.1:1";
    delete process.env.DATABASE_URL;
    delete process.env.QURAN_EVALUATOR_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.JWT_SECRET;
    delete process.env.OAUTH_SERVER_URL;
    delete process.env.VITE_APP_ID;
    process.env.LOG_LEVEL = "error";

    const app = express();
    app.use(requestIdMiddleware);
    registerHealthEndpoint(app);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.on("listening", () => resolve()));
    try {
      const port = (server.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: { "x-request-id": "req_smoke-test-1" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("x-request-id")).toBe("req_smoke-test-1");

      const body = await res.json();
      // DB and auth are not configured in this sandbox: critical checks fail
      // by design, so the honest answer is "degraded", not "healthy".
      expect(body.status).toBe("degraded");
      expect(Array.isArray(body.checks)).toBe(true);
      const serialized = JSON.stringify(body);
      for (const marker of ["DATABASE_URL", "JWT_SECRET", "API_KEY", "password", "stack"]) {
        expect(serialized).not.toContain(marker);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 15_000);

  it("returns the correlation ID with tRPC errors and no stack trace", async () => {
    process.env.LOG_LEVEL = "error";
    const app = createApp();
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.on("listening", () => resolve()));
    try {
      const port = (server.address() as AddressInfo).port;
      const res = await fetch(
        `http://127.0.0.1:${port}/api/trpc/noSuchProcedure?input=${encodeURIComponent(JSON.stringify({ json: null }))}`,
        { headers: { "x-request-id": "req_trpc-err-9" } }
      );
      expect(res.status).toBe(404);
      expect(res.headers.get("x-request-id")).toBe("req_trpc-err-9");
      const body = await res.json();
      // tRPC's express adapter nests the error shape under error.json.
      expect(body?.error?.json?.data?.correlationId).toBe("req_trpc-err-9");
      expect(JSON.stringify(body)).not.toContain("at ");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 20_000);
});
