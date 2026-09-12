/**
 * Tests for the staff-only validation-run endpoints (Wave 0 rehearsal tooling).
 *
 * The endpoints are an explicit opt-in: they exist only when
 * QURAN_VALIDATION_STAFF_API=1. Everything else (gating, activation, export,
 * deactivation, malformed IDs, sanitization) is exercised over HTTP against a
 * real Express app. No test touches the network beyond 127.0.0.1.
 */
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { createApp } from "../_core/app";
import { requestIdMiddleware } from "../_core/requestId";
import {
  isStaffValidationApiEnabled,
  resetValidationRunsForTests,
  STAFF_API_ENV_VAR,
} from "./liveObservation";
import { registerStaffValidationEndpoints } from "./staffEndpoints";
import { isRunId } from "./validationRun";

const savedEnv = { ...process.env };

beforeEach(() => {
  resetValidationRunsForTests();
  process.env = { ...savedEnv, LOG_LEVEL: "error" };
});

afterEach(() => {
  process.env = { ...savedEnv };
  resetValidationRunsForTests();
});

function routeList(app: express.Express): string[] {
  const seen: string[] = [];
  for (const layer of (app._router?.stack ?? []) as Array<{
    route?: { path: string; methods: Record<string, boolean> };
  }>) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods)
        .filter((m) => layer.route?.methods[m])
        .join(",")
        .toUpperCase();
      seen.push(`${methods} ${layer.route.path}`);
    }
  }
  return seen;
}

async function listen(app: express.Express): Promise<{ port: number; close: () => Promise<void> }> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return { port, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

describe("isStaffValidationApiEnabled", () => {
  it("is false by default", () => {
    const { [STAFF_API_ENV_VAR]: _drop, ...env } = process.env;
    expect(isStaffValidationApiEnabled(env)).toBe(false);
  });

  it("is true only for the exact value \"1\"", () => {
    expect(isStaffValidationApiEnabled({ ...process.env, [STAFF_API_ENV_VAR]: "1" })).toBe(true);
    expect(isStaffValidationApiEnabled({ ...process.env, [STAFF_API_ENV_VAR]: "true" })).toBe(false);
    expect(isStaffValidationApiEnabled({ ...process.env, [STAFF_API_ENV_VAR]: "" })).toBe(false);
  });
});

describe("registerStaffValidationEndpoints gating", () => {
  it("registers no routes when the flag is off", () => {
    const { [STAFF_API_ENV_VAR]: _drop, ...env } = process.env;
    const app = express();
    registerStaffValidationEndpoints(app, env);
    const routes = routeList(app);
    expect(routes.some((r) => r.includes("/api/validation/runs"))).toBe(false);
  });

  it("registers activate/export/deactivate routes when the flag is on", () => {
    const app = express();
    registerStaffValidationEndpoints(app, { ...process.env, [STAFF_API_ENV_VAR]: "1" });
    const routes = routeList(app);
    expect(routes).toContain("POST /api/validation/runs");
    expect(routes).toContain("GET /api/validation/runs/:runId/ledger");
    expect(routes).toContain("POST /api/validation/runs/:runId/deactivate");
  });

  it("createApp exposes no validation routes by default (production-safe)", () => {
    const { [STAFF_API_ENV_VAR]: _drop, ...env } = process.env;
    process.env = env;
    const routes = routeList(createApp());
    expect(routes.some((r) => r.includes("/api/validation/runs"))).toBe(false);
  });

  it("createApp exposes the validation routes when the flag is on", () => {
    process.env = { ...process.env, [STAFF_API_ENV_VAR]: "1" };
    const routes = routeList(createApp());
    expect(routes).toContain("POST /api/validation/runs");
    expect(routes).toContain("GET /api/validation/runs/:runId/ledger");
    expect(routes).toContain("POST /api/validation/runs/:runId/deactivate");
  });
});

describe("staff validation endpoints over HTTP", () => {
  it("activates a run and exports its ledger", async () => {
    process.env = { ...process.env, [STAFF_API_ENV_VAR]: "1" };
    const app = createApp();
    const { port, close } = await listen(app);
    try {
      const activate = await fetch(`http://127.0.0.1:${port}/api/validation/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceMetadata: { device: "staff-laptop", browser: "chrome" } }),
      });
      expect(activate.status).toBe(201);
      const activated = (await activate.json()) as { runId: string; activatedAt: string };
      expect(isRunId(activated.runId)).toBe(true);
      expect(() => new Date(activated.activatedAt).toISOString()).not.toThrow();

      const ledger = await fetch(`http://127.0.0.1:${port}/api/validation/runs/${activated.runId}/ledger`);
      expect(ledger.status).toBe(200);
      const exported = (await ledger.json()) as {
        runId: string;
        events: Array<{ type: string }>;
        deviceMetadata: Record<string, unknown>;
      };
      expect(exported.runId).toBe(activated.runId);
      expect(Array.isArray(exported.events)).toBe(true);
      expect(exported.events.some((e) => e.type === "session.start")).toBe(true);
      expect(exported.deviceMetadata.device).toBe("staff-laptop");
    } finally {
      await close();
    }
  }, 20_000);

  it("sanitizes device metadata (no secrets in the ledger)", async () => {
    process.env = { ...process.env, [STAFF_API_ENV_VAR]: "1" };
    const app = createApp();
    const { port, close } = await listen(app);
    try {
      const activate = await fetch(`http://127.0.0.1:${port}/api/validation/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceMetadata: { device: "staff-laptop", apiKey: "sk-secret-123" } }),
      });
      expect(activate.status).toBe(201);
      const { runId } = (await activate.json()) as { runId: string };

      const ledger = await fetch(`http://127.0.0.1:${port}/api/validation/runs/${runId}/ledger`);
      const exported = (await ledger.json()) as { deviceMetadata: Record<string, unknown> };
      expect(JSON.stringify(exported)).not.toContain("sk-secret-123");
      expect(exported.deviceMetadata.apiKey).toBe("[redacted]");
    } finally {
      await close();
    }
  }, 20_000);

  it("deactivates a run and returns the final ledger; later exports 404", async () => {
    process.env = { ...process.env, [STAFF_API_ENV_VAR]: "1" };
    const app = createApp();
    const { port, close } = await listen(app);
    try {
      const activate = await fetch(`http://127.0.0.1:${port}/api/validation/runs`, { method: "POST" });
      const { runId } = (await activate.json()) as { runId: string };

      const deactivate = await fetch(`http://127.0.0.1:${port}/api/validation/runs/${runId}/deactivate`, {
        method: "POST",
      });
      expect(deactivate.status).toBe(200);
      const done = (await deactivate.json()) as {
        runId: string;
        deactivated: boolean;
        ledger: { runId: string; events: unknown[] };
      };
      expect(done.runId).toBe(runId);
      expect(done.deactivated).toBe(true);
      expect(done.ledger.runId).toBe(runId);
      expect(Array.isArray(done.ledger.events)).toBe(true);

      const again = await fetch(`http://127.0.0.1:${port}/api/validation/runs/${runId}/ledger`);
      expect(again.status).toBe(404);
    } finally {
      await close();
    }
  }, 20_000);

  it("rejects malformed run IDs with 400", async () => {
    process.env = { ...process.env, [STAFF_API_ENV_VAR]: "1" };
    const app = createApp();
    const { port, close } = await listen(app);
    try {
      const ledger = await fetch(`http://127.0.0.1:${port}/api/validation/runs/not-a-run-id/ledger`);
      expect(ledger.status).toBe(400);
      const deactivate = await fetch(`http://127.0.0.1:${port}/api/validation/runs/not-a-run-id/deactivate`, {
        method: "POST",
      });
      expect(deactivate.status).toBe(400);
    } finally {
      await close();
    }
  }, 20_000);

  it("returns 404 for well-formed but unknown run IDs", async () => {
    process.env = { ...process.env, [STAFF_API_ENV_VAR]: "1" };
    const app = express();
    app.use(requestIdMiddleware);
    app.use(express.json());
    registerStaffValidationEndpoints(app, process.env);
    const { port, close } = await listen(app);
    try {
      const unknown = "run_aaaaaaaaaaaaaaaaaaaaaaaa";
      expect(isRunId(unknown)).toBe(true);
      const ledger = await fetch(`http://127.0.0.1:${port}/api/validation/runs/${unknown}/ledger`);
      expect(ledger.status).toBe(404);
      const deactivate = await fetch(`http://127.0.0.1:${port}/api/validation/runs/${unknown}/deactivate`, {
        method: "POST",
      });
      expect(deactivate.status).toBe(404);
    } finally {
      await close();
    }
  }, 20_000);

  it("returns 404 for the validation paths when the flag is off", async () => {
    const { [STAFF_API_ENV_VAR]: _drop, ...env } = process.env;
    process.env = env;
    const app = createApp();
    const { port, close } = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/validation/runs`, { method: "POST" });
      expect(res.status).toBe(404);
    } finally {
      await close();
    }
  }, 20_000);
});
