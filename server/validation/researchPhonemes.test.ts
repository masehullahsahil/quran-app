import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parsePhonemeRetention,
  joinResearchPhonemes,
} from "./researchPhonemes";
import { registerStaffValidationEndpoints } from "./staffEndpoints";
import {
  activateValidationRun,
  getActiveValidationRun,
  resetValidationRunsForTests,
  observeFinalRecitationResult,
} from "./liveObservation";
import { createRunId } from "./validationRun";
import { buildAttemptExport } from "./attemptExport";

afterEach(() => {
  resetValidationRunsForTests();
  vi.restoreAllMocks();
});

const optIn = () => ({
  purpose: "owner self-consented benchmark",
  retainUntil: new Date(Date.now() + 86_400_000).toISOString(),
});
const env = {
  QURAN_VALIDATION_STAFF_API: "1",
  QURAN_EVALUATOR_URL: "https://evaluator.example/base/",
  QURAN_EVALUATOR_API_KEY: "service-secret",
};
const payload = (id = "req_retained_1") => ({
  correlationId: id,
  timestamp: new Date().toISOString(),
  provider: "muaalem-shadow",
  modelId: "muaalem-v3",
  levels: [
    {
      tokens: ["k", "u", "l"],
      tokenPosteriors: [0.9, 0.8, 0.9],
      meanPosterior: 0.866,
    },
  ],
  ...optIn(),
});

async function listen(app: express.Express) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

function ledger() {
  const run = activateValidationRun(createRunId(), {
    phonemeRetention: optIn(),
  });
  for (const id of ["req_retained_1", "req_missing_1", null]) {
    observeFinalRecitationResult(
      run,
      "recitation.evaluate",
      {},
      { correlationId: id }
    );
  }
  return run.ledger.toJSON();
}

describe("staff phoneme retention consent", () => {
  it("accepts a valid date and the exact 90-day boundary", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(
      parsePhonemeRetention(
        { purpose: " benchmark ", retainUntil: "2026-01-02" },
        now
      )
    ).toEqual({
      granted: true,
      purpose: "benchmark",
      retainUntil: "2026-01-02",
    });
    expect(() =>
      parsePhonemeRetention(
        {
          purpose: "benchmark",
          retainUntil: new Date(now + 90 * 86_400_000).toISOString(),
        },
        now
      )
    ).not.toThrow();
    expect(() =>
      parsePhonemeRetention(
        {
          purpose: "benchmark",
          retainUntil: new Date(now + 90 * 86_400_000 + 1).toISOString(),
        },
        now
      )
    ).toThrow();
  });

  it("records opt-in only when explicit; rejects invalid opt-ins over HTTP without creating a run", async () => {
    const app = express();
    app.use(express.json());
    registerStaffValidationEndpoints(app, env);
    const http = await listen(app);
    const post = (body: unknown) =>
      fetch(`${http.base}/api/validation/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    try {
      const consent = optIn();
      const res = await post({ phonemeRetention: consent });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.researchConsent).toEqual({ granted: true, ...consent });
      expect(getActiveValidationRun(body.runId)?.researchConsent).toEqual(
        body.researchConsent
      );
      expect(
        getActiveValidationRun(body.runId)?.ledger.toJSON().researchConsent
      ).toEqual(body.researchConsent);
      const plain = await post({});
      expect(plain.status).toBe(201);
      const original = await plain.json();
      expect(Object.keys(original).sort()).toEqual(["activatedAt", "runId"]);
      expect(
        getActiveValidationRun(original.runId)?.ledger.toJSON()
      ).not.toHaveProperty("researchConsent");
      for (const invalid of [
        null,
        {},
        [],
        { ...consent, purpose: " " },
        { ...consent, purpose: 3 },
        { ...consent, retainUntil: "tomorrow" },
        { ...consent, retainUntil: "2027-02-30" },
        { ...consent, retainUntil: new Date(Date.now() - 1).toISOString() },
        {
          ...consent,
          retainUntil: new Date(Date.now() + 91 * 86_400_000).toISOString(),
        },
      ]) {
        expect((await post({ phonemeRetention: invalid })).status).toBe(400);
      }
    } finally {
      await http.close();
    }
  });
});

describe("research export join", () => {
  it("joins only matching correlation IDs via bearer-authenticated reads; 404/no ID preserve original rows", async () => {
    const exported = buildAttemptExport(ledger())!;
    const retained = payload();
    const read = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("req_retained_1")
        ? Response.json({ ...retained, audioBase64: "forbidden" })
        : new Response(null, { status: 404 })
    );
    const joined = await joinResearchPhonemes(exported, env, {
      fetch: read as typeof fetch,
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0][0]).toBe(
      "https://evaluator.example/base/v1/research/phonemes/req_retained_1"
    );
    expect(read).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "GET",
        headers: {
          authorization: "Bearer service-secret",
          accept: "application/json",
        },
      })
    );
    expect(joined.attempts[0].researchPhonemes).toEqual(retained);
    expect(joined.attempts.slice(1)).toEqual(exported.attempts.slice(1));
    expect(exported.attempts[0]).not.toHaveProperty("researchPhonemes");
    expect(JSON.stringify(joined)).not.toContain("forbidden");
  });

  it("preserves exports when gated off, unconfigured, unavailable, malformed, expired or mismatched", async () => {
    const exported = buildAttemptExport(ledger())!;
    const read = vi.fn();
    for (const config of [
      { ...env, QURAN_VALIDATION_STAFF_API: "0" },
      { ...env, QURAN_EVALUATOR_URL: "" },
      { ...env, QURAN_EVALUATOR_API_KEY: "" },
    ]) {
      expect(
        await joinResearchPhonemes(exported, config, { fetch: read })
      ).toBe(exported);
    }
    expect(read).not.toHaveBeenCalled();
    for (const response of [
      () => new Response(null, { status: 503 }),
      () => Response.json({}),
      () => Response.json(payload("wrong-id")),
      () => Response.json({ ...payload(), retainUntil: "2020-01-01" }),
      () => {
        throw new Error("offline");
      },
    ]) {
      expect(
        await joinResearchPhonemes(exported, env, {
          fetch: vi.fn(async () => response()),
        })
      ).toEqual(exported);
    }
  });

  it("joins through the staff endpoint and keeps the endpoint absent without the staff gate", async () => {
    const saved = ledger();
    const data = payload();
    const read = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith(data.correlationId)
        ? Response.json(data)
        : new Response(null, { status: 404 })
    );
    for (const enabled of [true, false]) {
      const app = express();
      registerStaffValidationEndpoints(
        app,
        { ...env, QURAN_VALIDATION_STAFF_API: enabled ? "1" : "0" },
        { fetch: read }
      );
      const http = await listen(app);
      try {
        const res = await fetch(
          `${http.base}/api/validation/runs/${saved.runId}/attempts`
        );
        expect(res.status).toBe(enabled ? 200 : 404);
        if (enabled)
          expect((await res.json()).attempts[0].researchPhonemes).toEqual(data);
      } finally {
        await http.close();
      }
    }
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("offline command uses the same HTTP join and leaves rows unchanged when the staff gate is off", async () => {
    const saved = ledger();
    const data = payload();
    const evaluator = express();
    const ids: string[] = [];
    evaluator.get("/v1/research/phonemes/:id", (req, res) => {
      expect(req.headers.authorization).toBe("Bearer service-secret");
      ids.push(req.params.id);
      if (req.params.id === data.correlationId) res.json(data);
      else res.sendStatus(404);
    });
    const http = await listen(evaluator);
    const dir = await mkdtemp(path.join(tmpdir(), "phoneme-export-"));
    const file = path.join(dir, "ledger.json");
    await writeFile(file, JSON.stringify({ server: { ledger: saved } }));
    try {
      for (const gate of ["1", "0"]) {
        const { stdout } = await promisify(execFile)(
          process.execPath,
          ["--import", "tsx", "scripts/export-validation-attempts.ts", file],
          {
            env: {
              ...process.env,
              ...env,
              QURAN_EVALUATOR_URL: http.base,
              QURAN_VALIDATION_STAFF_API: gate,
            },
          }
        );
        const exported = JSON.parse(stdout);
        if (gate === "1")
          expect(exported.attempts[0].researchPhonemes).toEqual(data);
        else
          expect(exported.attempts).toEqual(
            buildAttemptExport(saved)!.attempts
          );
      }
      expect(ids).toEqual(["req_retained_1", "req_missing_1"]);
    } finally {
      await http.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
