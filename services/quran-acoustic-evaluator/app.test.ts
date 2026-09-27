import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { AbstainingPhonemeEvaluator } from "./phoneme";
import { HttpAcousticShadowEvaluator } from "./shadow";
import { ResearchPhonemeStore } from "./researchRetention";

const API_KEY = "test-evaluator-key";
const CORRELATION_ID = "attempt_research01";
// Sentinels that must never surface outside the research store.
const PLANTED_TOKEN = "SENTINEL_KAF_TOKEN";
const PLANTED_POSTERIOR = 0.4242424242;
const DAY = 24 * 60 * 60 * 1000;

const workerPayload = {
  status: "available",
  provider: "muaalem-shadow",
  modelId: "obadx/muaalem-model-v3_2",
  levels: {
    phonemes: {
      tokens: [PLANTED_TOKEN, "SENTINEL_LAM_TOKEN"],
      tokenPosteriors: [PLANTED_POSTERIOR, 0.9191919191],
      meanPosterior: 0.6717171717,
    },
    qalqla: {
      tokens: ["SENTINEL_QALQALA"],
      tokenPosteriors: [0.5151515151],
      meanPosterior: 0.5151515151,
    },
  },
};

function wav() {
  const sampleRate = 8_000;
  const parts = [
    { durationMs: 300, amplitude: 0 },
    { durationMs: 1000, amplitude: 0.3 },
    { durationMs: 300, amplitude: 0 },
  ];
  const samples = parts.flatMap(part =>
    Array.from(
      { length: Math.round((part.durationMs * sampleRate) / 1000) },
      (_, i) => part.amplitude * Math.sin((2 * Math.PI * 220 * i) / sampleRate)
    )
  );
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(s * 32767), i * 2));
  const out = Buffer.alloc(44 + data.length);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + data.length, 4);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(data.length, 40);
  data.copy(out, 44);
  return out;
}

function listen(app: express.Express): Promise<{ server: Server; url: string }> {
  return new Promise(resolve => {
    const server = app.listen(0, "127.0.0.1", () =>
      resolve({
        server,
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      })
    );
  });
}

function validConsent() {
  return {
    granted: true,
    purpose: "planted-error benchmark (owner self-consent)",
    retainUntil: new Date(Date.now() + 14 * DAY).toISOString(),
  };
}

let worker: { server: Server; url: string };
beforeAll(async () => {
  const fake = express();
  fake.use(express.json({ limit: "20mb" }));
  fake.post("/v1/shadow/analyze", (_req, res) => res.json(workerPayload));
  worker = await listen(fake);
});
afterAll(() => worker.server.close());

let directory: string;
let store: ResearchPhonemeStore;
let service: { server: Server; url: string } | null;
let logs: string[];
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "quran-research-app-"));
  store = new ResearchPhonemeStore(directory);
  service = null;
  logs = [];
});
afterEach(() => {
  service?.server.close();
  rmSync(directory, { recursive: true, force: true });
});

async function start(envEnabled: boolean) {
  service = await listen(
    createApp({
      phonemes: new AbstainingPhonemeEvaluator(),
      shadow: new HttpAcousticShadowEvaluator(
        `${worker.url}/v1/shadow/analyze`
      ),
      apiKey: API_KEY,
      probeHealth: async () => ({ status: "not_configured", modelId: null }),
      research: { envEnabled, store },
      log: line => logs.push(line),
    })
  );
  return service.url;
}

async function evaluateVia(
  url: string,
  researchConsent: unknown,
  correlationId: string | null = CORRELATION_ID
) {
  const response = await fetch(`${url}/v1/evaluate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${API_KEY}`,
      ...(correlationId ? { "x-correlation-id": correlationId } : {}),
    },
    body: JSON.stringify({
      audioBase64: wav().toString("base64"),
      mimeType: "audio/wav",
      expectedArabic: "قُلْ هُوَ",
      surah: 112,
      ayah: 1,
      learningLevel: "tajweed",
      ...(researchConsent === undefined ? {} : { researchConsent }),
    }),
  });
  expect(response.status).toBe(200);
  return response.text();
}

function expectRedacted(text: string) {
  expect(text).not.toContain("SENTINEL");
  expect(text).not.toContain(String(PLANTED_POSTERIOR));
  expect(text).not.toContain("tokenPosteriors");
  expect(text).not.toContain('"tokens"');
  expect(text).not.toContain("researchConsent");
  expect(text).not.toContain("planted-error benchmark");
}

describe("research retention redaction across every gate combination", () => {
  it.each([
    ["env off, consent valid", false, validConsent, CORRELATION_ID],
    ["env off, consent missing", false, () => undefined, CORRELATION_ID],
    ["env on, consent missing", true, () => undefined, CORRELATION_ID],
    [
      "env on, consent not granted",
      true,
      () => ({ ...validConsent(), granted: false }),
      CORRELATION_ID,
    ],
    [
      "env on, consent empty purpose",
      true,
      () => ({ ...validConsent(), purpose: "" }),
      CORRELATION_ID,
    ],
    [
      "env on, consent beyond 90-day cap",
      true,
      () => ({
        ...validConsent(),
        retainUntil: new Date(Date.now() + 120 * DAY).toISOString(),
      }),
      CORRELATION_ID,
    ],
    ["env on, consent valid, no correlation ID", true, validConsent, null],
  ])(
    "%s: nothing retained and no decoded detail in log or response",
    async (_label, envEnabled, consent, correlationId) => {
      const url = await start(envEnabled);
      const body = await evaluateVia(url, consent(), correlationId);
      const result = JSON.parse(body);
      // The shadow worker's decoded output was actually received and reduced.
      expect(result.measurements.shadow).toMatchObject({
        status: "available",
        decodedLevelCount: 2,
        phonemeTokenCount: 2,
      });
      expectRedacted(body);
      expect(logs).toHaveLength(1);
      expectRedacted(logs[0]!);
      expect(readdirSync(directory)).toEqual([]);
    }
  );

  it("env on + valid consent: record goes only to the research store", async () => {
    const url = await start(true);
    const consent = validConsent();
    const body = await evaluateVia(url, consent);
    expectRedacted(body);
    expect(logs).toHaveLength(1);
    expectRedacted(logs[0]!);
    // Log line shape is identical to the default path.
    const defaultLogKeys = Object.keys(JSON.parse(logs[0]!));
    expect(defaultLogKeys).not.toContain("research");

    expect(readdirSync(directory)).toEqual([`${CORRELATION_ID}.json`]);
    const record = await store.read(CORRELATION_ID);
    expect(record).toMatchObject({
      correlationId: CORRELATION_ID,
      provider: "muaalem-shadow",
      modelId: "obadx/muaalem-model-v3_2",
      purpose: consent.purpose,
      retainUntil: consent.retainUntil,
      levels: [
        {
          level: "phonemes",
          tokens: [PLANTED_TOKEN, "SENTINEL_LAM_TOKEN"],
          tokenPosteriors: [PLANTED_POSTERIOR, 0.9191919191],
          meanPosterior: 0.6717171717,
        },
        {
          level: "qalqla",
          tokens: ["SENTINEL_QALQALA"],
          tokenPosteriors: [0.5151515151],
          meanPosterior: 0.5151515151,
        },
      ],
    });
    // Never audio, transcripts, Quran text, identity, or credentials.
    expect(Object.keys(record!).sort()).toEqual(
      [
        "correlationId",
        "levels",
        "modelId",
        "provider",
        "purpose",
        "retainUntil",
        "timestamp",
      ].sort()
    );
    const stored = JSON.stringify(record);
    expect(stored).not.toContain("قُلْ");
    expect(stored).not.toContain(API_KEY);
    expect(stored).not.toContain("audio");
  });
});

describe("GET /v1/research/phonemes/:correlationId", () => {
  const get = (url: string, id: string, auth = true) =>
    fetch(`${url}/v1/research/phonemes/${id}`, {
      headers: auth ? { authorization: `Bearer ${API_KEY}` } : {},
    });

  it("requires bearer auth", async () => {
    const url = await start(true);
    expect((await get(url, CORRELATION_ID, false)).status).toBe(401);
    const wrong = await fetch(`${url}/v1/research/phonemes/${CORRELATION_ID}`, {
      headers: { authorization: "Bearer wrong-key-000000" },
    });
    expect(wrong.status).toBe(401);
  });

  it("is 404 when the env gate is off, even if a record exists", async () => {
    const url = await start(false);
    await store.write({
      correlationId: CORRELATION_ID,
      timestamp: new Date().toISOString(),
      provider: "muaalem-shadow",
      modelId: "model",
      levels: [],
      purpose: "benchmark",
      retainUntil: new Date(Date.now() + DAY).toISOString(),
    });
    expect((await get(url, CORRELATION_ID)).status).toBe(404);
  });

  it("returns 200 with the record, 404 for unknown IDs, 400 for invalid IDs", async () => {
    const url = await start(true);
    await evaluateVia(url, validConsent());
    const found = await get(url, CORRELATION_ID);
    expect(found.status).toBe(200);
    expect(found.headers.get("cache-control")).toBe("no-store");
    const record = await found.json();
    expect(record.correlationId).toBe(CORRELATION_ID);
    expect(record.levels[0].tokens).toContain(PLANTED_TOKEN);
    expect(record.levels[0].tokenPosteriors).toContain(PLANTED_POSTERIOR);

    expect((await get(url, "attempt_unknown01")).status).toBe(404);
    expect((await get(url, "bad%20id%21")).status).toBe(400);
    expect((await get(url, "short")).status).toBe(400);
  });
});
