/**
 * Tests for the structured logger. All deterministic; no I/O beyond captured
 * process.stdout/stderr writes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log, logger, minLogLevel } from "./logger";

function captureWrites() {
  const out: string[] = [];
  const err: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    out.push(String(chunk));
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    err.push(String(chunk));
    return true;
  });
  return { out, err, restore: () => { stdoutSpy.mockRestore(); stderrSpy.mockRestore(); } };
}

beforeEach(() => {
  // Hermetic regardless of the ambient shell: the logger reads LOG_LEVEL
  // from process.env at call time.
  delete process.env.LOG_LEVEL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("emits one JSON line with the required fields", () => {
    const { out, restore } = captureWrites();
    logger.info({ subsystem: "health", operation: "api.health", message: "ok" });
    restore();

    expect(out).toHaveLength(1);
    const entry = JSON.parse(out[0]);
    expect(entry.level).toBe("info");
    expect(entry.subsystem).toBe("health");
    expect(entry.operation).toBe("api.health");
    expect(entry.message).toBe("ok");
    expect(typeof entry.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
  });

  it("includes requestId, status, and errorCategory when provided", () => {
    const { err, restore } = captureWrites();
    logger.error({
      subsystem: "trpc",
      operation: "recitation.evaluate",
      requestId: "req_abc123",
      status: "error",
      errorCategory: "TOO_MANY_REQUESTS",
      message: "rate limited",
      details: { window: "1m" },
    });
    restore();

    expect(err).toHaveLength(1);
    const entry = JSON.parse(err[0]);
    expect(entry.requestId).toBe("req_abc123");
    expect(entry.status).toBe("error");
    expect(entry.errorCategory).toBe("TOO_MANY_REQUESTS");
    expect(entry.details).toEqual({ window: "1m" });
  });

  it("omits optional fields instead of emitting undefined", () => {
    const { out, restore } = captureWrites();
    logger.info({ subsystem: "config", message: "valid" });
    restore();

    const entry = JSON.parse(out[0]);
    expect("requestId" in entry).toBe(false);
    expect("operation" in entry).toBe(false);
    expect("details" in entry).toBe(false);
  });

  it("writes errors to stderr and other levels to stdout", () => {
    const { out, err, restore } = captureWrites();
    logger.error({ subsystem: "test", message: "boom" });
    logger.warn({ subsystem: "test", message: "careful" });
    restore();

    expect(err).toHaveLength(1);
    expect(out).toHaveLength(1);
    expect(JSON.parse(err[0]).level).toBe("error");
    expect(JSON.parse(out[0]).level).toBe("warn");
  });

  it("respects LOG_LEVEL filtering", () => {
    const { out, restore } = captureWrites();
    const env = { LOG_LEVEL: "warn" };
    log({ subsystem: "test", message: "quiet" }, env);
    log({ subsystem: "test", message: "loud", level: "error" }, env);
    restore();

    expect(out).toHaveLength(0);
    // error went to stderr; assert via a second capture-free check on minLogLevel
    expect(minLogLevel(env)).toBe("warn");
    expect(minLogLevel({ LOG_LEVEL: "bogus" })).toBe("debug");
    expect(minLogLevel({})).toBe("debug");
  });
});
