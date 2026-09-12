/**
 * Validation run ID propagation: client -> server header wiring.
 *
 * When a staff validation run is active, every live-tutor request
 * (recitation.startLive, recitation.ingestLiveAudio) must carry
 * x-validation-run-id so client and server evidence join on
 * runId + correlationId. Ordinary production traffic must NOT carry it.
 *
 * These tests go through the real helpers used by the tRPC client
 * (client/src/main.tsx merges buildValidationHeaders() into every request)
 * and verify round-trip compatibility with the server's header reader.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  buildValidationHeaders,
  getActiveValidationRunId,
  getValidationRunId,
  isValidationMode,
  isValidationRunIdFormat,
  VALIDATION_RUN_HEADER,
  VALIDATION_RUN_ID_STORAGE_KEY,
} from "./validationCapture";
import { VALIDATION_RUN_HEADER as SERVER_HEADER } from "../../../server/validation/liveObservation";

const RUN_ID = "run_0123456789abcdef01234567";
const RUN_ID_2 = "run_abcdef0123456789abcdef01";

function setUrl(search: string) {
  vi.stubGlobal("window", {
    location: { search },
  } as unknown as Window);
}

function setLocalStorage(values: Record<string, string>) {
  const store = new Map(Object.entries(values));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  } as unknown as Storage);
}

describe("validation run ID propagation", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shares the exact header name with the server", () => {
    expect(VALIDATION_RUN_HEADER).toBe("x-validation-run-id");
    expect(SERVER_HEADER).toBe(VALIDATION_RUN_HEADER);
  });

  it("inactive validation mode → no validation header (ordinary production use)", () => {
    // No window, no localStorage validation flag.
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("localStorage", undefined);
    expect(isValidationMode()).toBe(false);
    expect(buildValidationHeaders()).toEqual({});
    expect(getActiveValidationRunId()).toBeNull();
  });

  it("validation mode off but run ID stored → still no header", () => {
    setUrl("");
    setLocalStorage({ [VALIDATION_RUN_ID_STORAGE_KEY]: RUN_ID });
    // quran.validationMode not set → inactive
    expect(isValidationMode()).toBe(false);
    expect(buildValidationHeaders()).toEqual({});
  });

  it("active run via URL → correct x-validation-run-id sent", () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    setLocalStorage({});
    expect(isValidationMode()).toBe(true);
    expect(getValidationRunId()).toBe(RUN_ID);
    expect(getActiveValidationRunId()).toBe(RUN_ID);
    expect(buildValidationHeaders()).toEqual({ [VALIDATION_RUN_HEADER]: RUN_ID });
  });

  it("active run via localStorage → correct x-validation-run-id sent", () => {
    setUrl("");
    setLocalStorage({
      "quran.validationMode": "1",
      [VALIDATION_RUN_ID_STORAGE_KEY]: RUN_ID_2,
    });
    expect(isValidationMode()).toBe(true);
    expect(buildValidationHeaders()).toEqual({ [VALIDATION_RUN_HEADER]: RUN_ID_2 });
  });

  it("URL run ID takes precedence over stored run ID", () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    setLocalStorage({
      "quran.validationMode": "1",
      [VALIDATION_RUN_ID_STORAGE_KEY]: RUN_ID_2,
    });
    expect(getValidationRunId()).toBe(RUN_ID);
    expect(buildValidationHeaders()[VALIDATION_RUN_HEADER]).toBe(RUN_ID);
  });

  it("malformed run ID in URL fails safely → no header", () => {
    setUrl("?validation=1&validationRunId=bogus");
    setLocalStorage({ "quran.validationMode": "1" });
    expect(isValidationRunIdFormat("bogus")).toBe(false);
    expect(getValidationRunId()).toBeNull();
    expect(buildValidationHeaders()).toEqual({});
  });

  it("malformed run ID in storage fails safely → no header", () => {
    setUrl("?validation=1");
    setLocalStorage({
      "quran.validationMode": "1",
      [VALIDATION_RUN_ID_STORAGE_KEY]: "run_not-hex",
    });
    expect(buildValidationHeaders()).toEqual({});
  });

  it("active validation mode but missing run ID → no header (fails safe)", () => {
    setUrl("?validation=1");
    setLocalStorage({ "quran.validationMode": "1" });
    expect(getValidationRunId()).toBeNull();
    expect(buildValidationHeaders()).toEqual({});
  });

  it("never sends Quran text, audio, or PII in validation headers", () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    setLocalStorage({});
    const headers = buildValidationHeaders();
    const keys = Object.keys(headers);
    expect(keys).toEqual([VALIDATION_RUN_HEADER]);
    // Only the run ID value; it must match the strict run ID format.
    expect(isValidationRunIdFormat(headers[VALIDATION_RUN_HEADER])).toBe(true);
    expect(headers[VALIDATION_RUN_HEADER]).not.toMatch(/[\u0600-\u06FF]/); // no Arabic
  });

  it("does not create a second correlation mechanism: only the run header is added", () => {
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    setLocalStorage({});
    const headers = buildValidationHeaders();
    // No x-request-id here — correlation stays server-owned (requestIdMiddleware).
    expect(headers).not.toHaveProperty("x-request-id");
    expect(Object.keys(headers)).toHaveLength(1);
  });

  it("startLive and ingestLiveAudio share the same header path (single tRPC link)", () => {
    // Both procedures go through the same httpBatchLink headers() in main.tsx,
    // which merges buildValidationHeaders(). This pins that contract: one
    // builder, used for every request, so both paths carry the run ID.
    setUrl(`?validation=1&validationRunId=${RUN_ID}`);
    setLocalStorage({});
    const forStartLive = buildValidationHeaders();
    const forIngest = buildValidationHeaders();
    expect(forStartLive).toEqual({ "x-validation-run-id": RUN_ID });
    expect(forIngest).toEqual({ "x-validation-run-id": RUN_ID });
    // And when inactive, both carry nothing.
    setUrl("");
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("window", undefined);
    expect(buildValidationHeaders()).toEqual({});
  });

  it("normal tutor behavior is unchanged: header builder never throws", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("localStorage", undefined);
    expect(() => buildValidationHeaders()).not.toThrow();
    expect(() => getActiveValidationRunId()).not.toThrow();
    expect(() => getValidationRunId()).not.toThrow();
  });
});
