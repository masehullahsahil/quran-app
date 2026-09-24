/**
 * Tests for validation evidence durability and browser detection.
 *
 * The persistence tests pin the fix for run_e6872ef0aa84e7b7dc7ac447: the
 * client log was in-memory only, so a page reload wiped it and orphaned the
 * server's correlation id on the client side. Evidence must survive a reload,
 * stay scoped to its run, and clear only at explicit boundaries.
 *
 * The browser-detection tests pin the parseBrowser fixes: client-hints first,
 * Opera matched before Chrome (an Opera UA contains "Chrome"), and the
 * mobile tokens. The run_e6872ef0aa84e7b7dc7ac447 evidence said "Firefox"
 * while the tester believed they were in Chrome — the old parser was correct
 * for standard UA strings, so these tests lock the genuinely fixed bugs
 * (ordering, client hints, mobile tokens) rather than asserting the old
 * output was wrong.
 *
 * The redaction tests pin the ledger policy: audio, transcripts, Quran text,
 * messages, and secrets can never enter the evidence log, even if a caller
 * tries.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearAllValidationEvidence,
  clearValidationEvidence,
  createClientValidationLog,
  loadValidationEvidence,
  parseBrowser,
  sanitizeAttemptTraceDetails,
  saveValidationEvidence,
  type ClientValidationEvent,
} from "./validationCapture";

const RUN_A = `run_${"a".repeat(24)}`;
const RUN_B = `run_${"b".repeat(24)}`;

function makeEvent(runId: string, seq: number): ClientValidationEvent {
  return {
    seq,
    t: new Date().toISOString(),
    runId,
    attemptId: null,
    correlationId: null,
    type: "note",
    details: { n: seq },
  };
}

/** Minimal in-memory Storage stand-in for the node test env. */
class MemoryStorage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function installStorage(storage: unknown): void {
  (globalThis as Record<string, unknown>)["sessionStorage"] = storage;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)["sessionStorage"];
});

describe("validation evidence persistence", () => {
  it("restores a run's events after a simulated reload and continues the sequence", () => {
    installStorage(new MemoryStorage());
    const before = createClientValidationLog({ runId: RUN_A, persist: true });
    before.record("session.start", { resumed: false });
    before.recordAttemptLifecycle({
      stage: "capture.started",
      path: "final",
      attemptId: "manual-1",
    });

    // Simulate the reload: a brand-new log hydrates from the persisted copy.
    const restored = loadValidationEvidence(RUN_A);
    expect(restored).not.toBeNull();
    expect(restored).toHaveLength(2);
    const after = createClientValidationLog({
      runId: RUN_A,
      initialEvents: restored ?? undefined,
      persist: true,
    });
    expect(after.events.map((event) => event.seq)).toEqual([1, 2]);
    const next = after.record("note", {});
    expect(next.seq).toBe(3);
    expect(next.runId).toBe(RUN_A);
  });

  it("returns null when nothing was stored", () => {
    installStorage(new MemoryStorage());
    expect(loadValidationEvidence(RUN_A)).toBeNull();
  });

  it("ignores malformed run ids without throwing", () => {
    installStorage(new MemoryStorage());
    expect(loadValidationEvidence("not-a-run-id")).toBeNull();
    expect(() => saveValidationEvidence("not-a-run-id", [])).not.toThrow();
    expect(() => clearValidationEvidence("not-a-run-id")).not.toThrow();
  });

  it("drops cross-run and malformed entries instead of trusting them", () => {
    const storage = new MemoryStorage();
    installStorage(storage);
    storage.setItem(
      `quran.validationEvidence.${RUN_A}`,
      JSON.stringify({
        version: 1,
        runId: RUN_A,
        events: [
          makeEvent(RUN_A, 1),
          makeEvent(RUN_B, 2), // another run's event under this run's key
          { seq: 3, t: "x", runId: RUN_A }, // missing type/details
          "garbage",
          makeEvent(RUN_A, 4),
        ],
      })
    );
    const restored = loadValidationEvidence(RUN_A);
    expect(restored?.map((event) => event.seq)).toEqual([1, 4]);
  });

  it("rejects a payload whose envelope runId does not match", () => {
    const storage = new MemoryStorage();
    installStorage(storage);
    storage.setItem(
      `quran.validationEvidence.${RUN_A}`,
      JSON.stringify({ version: 1, runId: RUN_B, events: [makeEvent(RUN_B, 1)] })
    );
    expect(loadValidationEvidence(RUN_A)).toBeNull();
  });

  it("rejects an unknown envelope version", () => {
    const storage = new MemoryStorage();
    installStorage(storage);
    storage.setItem(
      `quran.validationEvidence.${RUN_A}`,
      JSON.stringify({ version: 999, runId: RUN_A, events: [makeEvent(RUN_A, 1)] })
    );
    expect(loadValidationEvidence(RUN_A)).toBeNull();
  });

  it("clearValidationEvidence removes only that run", () => {
    installStorage(new MemoryStorage());
    saveValidationEvidence(RUN_A, [makeEvent(RUN_A, 1)]);
    saveValidationEvidence(RUN_B, [makeEvent(RUN_B, 1)]);
    clearValidationEvidence(RUN_A);
    expect(loadValidationEvidence(RUN_A)).toBeNull();
    expect(loadValidationEvidence(RUN_B)).toHaveLength(1);
  });

  it("clearAllValidationEvidence removes every run key and leaves other keys alone", () => {
    const storage = new MemoryStorage();
    installStorage(storage);
    storage.setItem("unrelated-key", "keep-me");
    saveValidationEvidence(RUN_A, [makeEvent(RUN_A, 1)]);
    saveValidationEvidence(RUN_B, [makeEvent(RUN_B, 1)]);
    clearAllValidationEvidence();
    expect(loadValidationEvidence(RUN_A)).toBeNull();
    expect(loadValidationEvidence(RUN_B)).toBeNull();
    expect(storage.getItem("unrelated-key")).toBe("keep-me");
  });

  it("never throws when storage is unavailable or broken", () => {
    // No sessionStorage at all (e.g. server-side render).
    expect(loadValidationEvidence(RUN_A)).toBeNull();
    expect(() => saveValidationEvidence(RUN_A, [])).not.toThrow();
    expect(() => clearValidationEvidence(RUN_A)).not.toThrow();
    expect(() => clearAllValidationEvidence()).not.toThrow();
    const log = createClientValidationLog({ runId: RUN_A, persist: true });
    expect(() => log.record("note", {})).not.toThrow();

    // Quota-exceeded style failure on write.
    installStorage({
      get length() {
        return 0;
      },
      key: () => null,
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => {},
    });
    expect(() => saveValidationEvidence(RUN_A, [makeEvent(RUN_A, 1)])).not.toThrow();
    const log2 = createClientValidationLog({ runId: RUN_A, persist: true });
    expect(() => log2.record("note", {})).not.toThrow();
    expect(log2.events).toHaveLength(1);
  });

  it("persists on every record so a mid-run reload loses nothing", () => {
    installStorage(new MemoryStorage());
    const log = createClientValidationLog({ runId: RUN_A, persist: true });
    log.recordAttemptLifecycle({ stage: "capture.started", path: "final", attemptId: "manual-1" });
    log.recordAttemptLifecycle({ stage: "capture.finalized", path: "final", attemptId: "manual-1" });
    log.recordAttemptLifecycle({ stage: "submission.started", path: "final", attemptId: "manual-1" });
    // Reload right here — before any terminal stage.
    const restored = loadValidationEvidence(RUN_A);
    expect(restored?.map((event) => event.details["stage"])).toEqual([
      "capture.started",
      "capture.finalized",
      "submission.started",
    ]);
  });

  it("does not resurrect a finalized run when instrumentation fires after finalize", () => {
    installStorage(new MemoryStorage());
    const log = createClientValidationLog({ runId: RUN_A, persist: true });
    log.record("session.start", { resumed: false });
    expect(loadValidationEvidence(RUN_A)).not.toBeNull();

    // Finalize: the stored evidence is cleared and the still-mounted log
    // stops persisting. Codex P2: without the stop, a playback-ended event
    // firing after Finish writes the whole in-memory log back under the
    // same key and a reload resurrects the finalized run.
    clearValidationEvidence(RUN_A);
    log.stopPersisting();

    log.recordPlaybackEnded("qari");
    expect(loadValidationEvidence(RUN_A)).toBeNull();
    // The log itself keeps working in memory — only the storage write stops.
    expect(log.events.map((event) => event.type)).toContain("playback.ended");
  });
});

describe("parseBrowser", () => {
  const CHROME_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const FIREFOX_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0";
  const EDGE_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
  const OPERA_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0";
  const SAFARI_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

  it("identifies the mainstream desktop browsers from the UA string", () => {
    expect(parseBrowser(CHROME_UA)).toMatchObject({ name: "Chrome", version: "126.0.0.0" });
    expect(parseBrowser(FIREFOX_UA)).toMatchObject({ name: "Firefox", version: "127.0" });
    expect(parseBrowser(EDGE_UA)).toMatchObject({ name: "Edge" });
    expect(parseBrowser(SAFARI_UA)).toMatchObject({ name: "Safari", version: "17.4" });
  });

  it("identifies Opera even though its UA contains Chrome", () => {
    // The old parser checked Chrome before Opera and reported "Chrome" here.
    expect(parseBrowser(OPERA_UA)).toMatchObject({ name: "Opera", version: "112.0.0.0" });
  });

  it("recognises the mobile tokens", () => {
    expect(parseBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/126.0.0.0")).toMatchObject({
      name: "Chrome",
    });
    expect(parseBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) FxiOS/127.0")).toMatchObject({
      name: "Firefox",
    });
    expect(parseBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) EdgiOS/126.0.0.0")).toMatchObject({
      name: "Edge",
    });
  });

  it("prefers User-Agent Client Hints over the UA string", () => {
    expect(
      parseBrowser(FIREFOX_UA, [{ brand: "Google Chrome", version: "126" }])
    ).toMatchObject({ name: "Chrome", version: "126" });
    // Edge ships a Chromium brand entry too — the Edge brand must win.
    expect(
      parseBrowser(EDGE_UA, [
        { brand: "Chromium", version: "126" },
        { brand: "Microsoft Edge", version: "126" },
      ])
    ).toMatchObject({ name: "Edge", version: "126" });
  });

  it("degrades to null for an unrecognised agent", () => {
    expect(parseBrowser("some-unknown-agent/1.0")).toEqual({ name: null, version: null });
    expect(parseBrowser("some-unknown-agent/1.0", [])).toEqual({ name: null, version: null });
  });
});

describe("evidence redaction", () => {
  it("drops audio, transcripts, Quran text, messages, and secrets from trace details", () => {
    const out = sanitizeAttemptTraceDetails({
      transcript: "بسم الله الرحمن الرحيم",
      audioBase64: "aGVsbG8td29ybGQ=",
      message: "hello world, this is a sentence",
      quranText: "بِسْمِ اللَّهِ",
      apiKey: "sk-secret-value",
      authorization: "Bearer hunter2",
      bytes: 50622,
      elapsedMs: 1150.7,
      willRetry: true,
      errorCode: "page-reloaded",
      scope: "ayah",
    });
    expect(out).toEqual({
      bytes: 50622,
      elapsedMs: 1151,
      willRetry: true,
      errorCode: "page-reloaded",
      scope: "ayah",
    });
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain("بسم");
    expect(serialised).not.toContain("aGVsbG8");
    expect(serialised).not.toContain("hunter2");
  });

  it("drops long or sentence-like strings even on allow-listed keys", () => {
    const out = sanitizeAttemptTraceDetails({
      errorCode: "this is a whole sentence, not a token",
      mimeType: "x".repeat(100),
    });
    expect(out).toEqual({});
  });

  it("keeps the persisted envelope free of smuggled payloads end to end", () => {
    installStorage(new MemoryStorage());
    const log = createClientValidationLog({ runId: RUN_A, persist: true });
    log.recordAttemptLifecycle({
      stage: "submission.failed",
      path: "final",
      attemptId: "manual-1",
      details: {
        bytes: 50622,
        transcript: "بسم الله",
        audioBase64: "aGVsbG8=",
        errorCode: "page-reloaded",
      } as Record<string, unknown>,
    });
    const restored = loadValidationEvidence(RUN_A);
    const serialised = JSON.stringify(restored);
    expect(serialised).toContain("page-reloaded");
    expect(serialised).toContain("50622");
    expect(serialised).not.toContain("بسم");
    expect(serialised).not.toContain("aGVsbG8");
  });
});
