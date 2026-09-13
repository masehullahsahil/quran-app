import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadManifest } from "./manifest";

let dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

function writeCorpus(manifest: unknown): string {
  const dir = join(tmpdir(), `asr-bakeoff-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, "audio"), { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  dirs.push(dir);
  return dir;
}

const validSample = {
  id: "fatiha-001-correct",
  surah: 1,
  ayah: 1,
  canonicalArabic: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
  expectedResult: "correct",
  audio: "fatiha-001.wav",
};

describe("loadManifest", () => {
  it("loads a valid manifest", () => {
    const dir = writeCorpus({ version: 1, samples: [validSample] });
    const result = loadManifest(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.samples).toHaveLength(1);
      expect(result.manifest.samples[0].id).toBe("fatiha-001-correct");
    }
  });

  it("loads an empty corpus honestly", () => {
    const dir = writeCorpus({ version: 1, samples: [] });
    const result = loadManifest(dir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.samples).toHaveLength(0);
  });

  it("reports a missing manifest", () => {
    const result = loadManifest(join(tmpdir(), "asr-bakeoff-does-not-exist"));
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate sample ids", () => {
    const dir = writeCorpus({ version: 1, samples: [validSample, validSample] });
    const result = loadManifest(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("duplicate sample id"))).toBe(true);
    }
  });

  it("rejects intendedError on a correct sample", () => {
    const dir = writeCorpus({
      version: 1,
      samples: [{ ...validSample, intendedError: { wordIndex: 1, kind: "omitted" } }],
    });
    const result = loadManifest(dir);
    expect(result.ok).toBe(false);
  });

  it("requires intendedError on labelled omission/substitution/repetition", () => {
    const dir = writeCorpus({
      version: 1,
      samples: [{ ...validSample, id: "x", expectedResult: "omission" }],
    });
    const result = loadManifest(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("should label intendedError"))).toBe(true);
    }
  });

  it("rejects audio path traversal", () => {
    const dir = writeCorpus({
      version: 1,
      samples: [{ ...validSample, audio: "../secret.wav" }],
    });
    const result = loadManifest(dir);
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid expectedResult", () => {
    const dir = writeCorpus({
      version: 1,
      samples: [{ ...validSample, expectedResult: "perfect" }],
    });
    const result = loadManifest(dir);
    expect(result.ok).toBe(false);
  });

  it("rejects a wrong manifest version", () => {
    const dir = writeCorpus({ version: 2, samples: [] });
    const result = loadManifest(dir);
    expect(result.ok).toBe(false);
  });
});
