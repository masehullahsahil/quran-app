import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseResearchLevels,
  ResearchPhonemeStore,
  resolveResearchRetention,
  type ResearchRecord,
} from "./researchRetention";

const NOW = new Date("2026-09-27T12:00:00.000Z");
const ID = "attempt_0123456789";
const DAY = 24 * 60 * 60 * 1000;
const validConsent = {
  granted: true,
  purpose: "planted-error benchmark (owner self-consent)",
  retainUntil: "2026-10-27T00:00:00.000Z",
};

function record(overrides: Partial<ResearchRecord> = {}): ResearchRecord {
  return {
    correlationId: ID,
    timestamp: NOW.toISOString(),
    provider: "muaalem-shadow",
    modelId: "obadx/muaalem-model-v3_2",
    levels: [
      {
        level: "phonemes",
        tokens: ["ك", "ل"],
        tokenPosteriors: [0.8, 0.95],
        meanPosterior: 0.875,
      },
    ],
    purpose: validConsent.purpose,
    retainUntil: "2026-10-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("research retention consent gate", () => {
  const resolve = (
    consent: unknown,
    overrides: { envEnabled?: boolean; correlationId?: string | null } = {}
  ) =>
    resolveResearchRetention(consent, {
      envEnabled: overrides.envEnabled ?? true,
      correlationId:
        overrides.correlationId === undefined ? ID : overrides.correlationId,
      now: NOW,
    });

  it("activates only with the env gate, a safe correlation ID, and valid consent", () => {
    expect(resolve(validConsent)).toEqual({
      correlationId: ID,
      purpose: validConsent.purpose,
      retainUntil: "2026-10-27T00:00:00.000Z",
    });
    expect(resolve(validConsent, { envEnabled: false })).toBeNull();
    expect(resolve(validConsent, { correlationId: null })).toBeNull();
    expect(resolve(validConsent, { correlationId: "../../etc" })).toBeNull();
  });

  it.each([
    ["missing consent", undefined],
    ["array consent", [validConsent]],
    ["granted false", { ...validConsent, granted: false }],
    ["granted truthy string", { ...validConsent, granted: "true" }],
    ["empty purpose", { ...validConsent, purpose: "   " }],
    ["non-string purpose", { ...validConsent, purpose: 7 }],
    ["oversized purpose", { ...validConsent, purpose: "x".repeat(501) }],
    ["retainUntil in the past", { ...validConsent, retainUntil: "2026-09-01" }],
    [
      "retainUntil beyond the 90-day cap",
      { ...validConsent, retainUntil: "2027-01-01T00:00:00Z" },
    ],
  ])("rejects %s", (_label, consent) => {
    expect(resolve(consent)).toBeNull();
  });

  it("accepts retainUntil exactly at the 90-day cap", () => {
    const cap = new Date(NOW.getTime() + 90 * DAY).toISOString();
    expect(resolve({ ...validConsent, retainUntil: cap })?.retainUntil).toBe(
      cap
    );
  });

  it.each([
    ["omitted", { granted: true, purpose: "benchmark" }],
    ["unparseable", { granted: true, purpose: "benchmark", retainUntil: "soon" }],
  ])("defaults a %s retainUntil to 30 days", (_label, consent) => {
    expect(resolve(consent)?.retainUntil).toBe(
      new Date(NOW.getTime() + 30 * DAY).toISOString()
    );
  });
});

describe("research level parsing", () => {
  const payload = {
    status: "available",
    provider: "muaalem-shadow",
    modelId: "obadx/muaalem-model-v3_2",
    levels: {
      phonemes: {
        tokens: ["ك", "ل"],
        tokenPosteriors: [0.8, 0.95],
        meanPosterior: 0.875,
      },
    },
  };

  it("keeps tokens with their parallel posteriors per level", () => {
    expect(parseResearchLevels(payload)).toEqual({
      provider: "muaalem-shadow",
      modelId: "obadx/muaalem-model-v3_2",
      levels: [
        {
          level: "phonemes",
          tokens: ["ك", "ل"],
          tokenPosteriors: [0.8, 0.95],
          meanPosterior: 0.875,
        },
      ],
    });
  });

  it.each([
    ["abstained", { ...payload, status: "abstained" }],
    [
      "missing tokenPosteriors",
      { ...payload, levels: { phonemes: { tokens: ["ك"], meanPosterior: 1 } } },
    ],
    [
      "length mismatch",
      {
        ...payload,
        levels: {
          phonemes: { tokens: ["ك"], tokenPosteriors: [1, 1], meanPosterior: 1 },
        },
      },
    ],
    [
      "out-of-range posterior",
      {
        ...payload,
        levels: {
          phonemes: { tokens: ["ك"], tokenPosteriors: [2], meanPosterior: 1 },
        },
      },
    ],
  ])("rejects %s payloads", (_label, value) => {
    expect(parseResearchLevels(value)).toBeNull();
  });
});

describe("research phoneme store", () => {
  let directory: string;
  let store: ResearchPhonemeStore;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "quran-research-"));
    store = new ResearchPhonemeStore(directory);
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("round-trips a record keyed by correlation ID", async () => {
    await store.write(record());
    expect(await store.read(ID, NOW)).toEqual(record());
    expect(readdirSync(directory)).toEqual([`${ID}.json`]);
    expect(await store.read("attempt_unknown00", NOW)).toBeNull();
  });

  it.each(["../escape", "short", "has space in id", "a".repeat(65), "", null])(
    "rejects invalid correlation ID %j",
    async id => {
      await expect(
        store.write(record({ correlationId: id as string }))
      ).rejects.toThrow("invalid_correlation_id");
      await expect(store.read(id)).rejects.toThrow("invalid_correlation_id");
      await expect(store.delete(id)).rejects.toThrow("invalid_correlation_id");
    }
  );

  it("purges expired and unreadable records on startup", async () => {
    await store.write(record());
    await store.write(
      record({
        correlationId: "attempt_expired01",
        retainUntil: "2026-09-26T00:00:00.000Z",
      })
    );
    writeFileSync(path.join(directory, "attempt_corrupt01.json"), "{not json");
    writeFileSync(path.join(directory, ".attempt_stale.tmp"), "partial");
    expect(await store.purgeExpired(NOW)).toBe(2);
    expect(readdirSync(directory)).toEqual([`${ID}.json`]);
    // An expired record is never served even before a purge runs.
    expect(
      await store.read(ID, new Date("2026-10-28T00:00:00.000Z"))
    ).toBeNull();
    expect(readdirSync(directory)).toEqual([]);
  });

  it("supports manual deletion by correlation ID and delete-all", async () => {
    await store.write(record());
    await store.write(record({ correlationId: "attempt_second01" }));
    expect(await store.delete(ID)).toBe(true);
    expect(await store.delete(ID)).toBe(false);
    expect(await store.read(ID, NOW)).toBeNull();
    expect(await store.deleteAll()).toBe(1);
    expect(readdirSync(directory)).toEqual([]);
    expect(await store.purgeExpired(NOW)).toBe(0);
  });

  it("treats a missing directory as empty", async () => {
    const missing = new ResearchPhonemeStore(path.join(directory, "absent"));
    expect(await missing.purgeExpired(NOW)).toBe(0);
    expect(await missing.deleteAll()).toBe(0);
    expect(await missing.read(ID, NOW)).toBeNull();
  });
});
