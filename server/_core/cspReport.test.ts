import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_DIRECTIVE_LENGTH, createViolationDeduper, parseCspReports, registerCspReportEndpoint, safeResource } from "./cspReport";
import { createApp } from "./app";

describe("parseCspReports", () => {
  it("reads the legacy report-uri format and strips query strings", () => {
    expect(parseCspReports({
      "csp-report": {
        "document-uri": "https://app.example/study?surah=2&token=secret",
        "violated-directive": "media-src 'self'",
        "effective-directive": "media-src",
        "blocked-uri": "https://download.quranicaudio.com/qdc/abc/001.mp3?sig=private",
        disposition: "report",
      },
    })).toEqual([{
      directive: "media-src",
      blocked: "https://download.quranicaudio.com",
      documentPath: "/study",
      disposition: "report",
    }]);
  });

  it("reads the Reporting API format and ignores other report types", () => {
    expect(parseCspReports([
      { type: "deprecation", body: { message: "x" } },
      { type: "csp-violation", body: { effectiveDirective: "script-src-elem", blockedURL: "inline", documentURL: "https://app.example/" } },
    ])).toEqual([{ directive: "script-src-elem", blocked: "inline", documentPath: "/", disposition: "report" }]);
  });

  it("returns nothing for unrecognised payloads", () => {
    expect(parseCspReports(null)).toEqual([]);
    expect(parseCspReports("x")).toEqual([]);
    expect(parseCspReports({ other: 1 })).toEqual([]);
  });

  it("caps an over-long directive at parse time in both formats", () => {
    const long = "d".repeat(5000);
    const [legacy] = parseCspReports({ "csp-report": { "effective-directive": long } });
    expect(legacy.directive).toHaveLength(MAX_DIRECTIVE_LENGTH);
    const [legacyViolated] = parseCspReports({ "csp-report": { "violated-directive": long } });
    expect(legacyViolated.directive).toHaveLength(MAX_DIRECTIVE_LENGTH);
    const [api] = parseCspReports([{ type: "csp-violation", body: { effectiveDirective: long } }]);
    expect(api.directive).toHaveLength(MAX_DIRECTIVE_LENGTH);
    // Real directive names pass through untouched.
    const [real] = parseCspReports({ "csp-report": { "effective-directive": "script-src-elem" } });
    expect(real.directive).toBe("script-src-elem");
  });

  it("reduces data and blob URLs to their scheme", () => {
    expect(safeResource("data:image/png;base64,AAAA")).toBe("data:");
    expect(safeResource("blob:https://app.example/1234")).toBe("blob:");
  });
});

describe("createViolationDeduper", () => {
  it("logs an identical violation once per hour", () => {
    let now = 0;
    const shouldLog = createViolationDeduper(() => now);
    const v = { directive: "media-src", blocked: "https://a.example", documentPath: "/", disposition: "report" };
    expect(shouldLog(v)).toBe(true);
    expect(shouldLog(v)).toBe(false);
    expect(shouldLog({ ...v, blocked: "https://b.example" })).toBe(true);
    now = 60 * 60 * 1000;
    expect(shouldLog(v)).toBe(true);
  });
});

describe("POST /api/csp-report", () => {
  let server: Server | undefined;
  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  async function start() {
    const app = express();
    registerCspReportEndpoint(app);
    server = await new Promise<Server>(resolve => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/csp-report`;
  }

  it("accepts a csp-report body, answers 204, and logs only safe fields", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const url = await start();
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/csp-report" },
      body: JSON.stringify({ "csp-report": {
        "document-uri": "https://app.example/?email=learner@example.com",
        "effective-directive": "media-src",
        "blocked-uri": "https://cdn.example/a.mp3?token=abc",
      } }),
    });
    expect(res.status).toBe(204);
    const logged = write.mock.calls.map(c => String(c[0])).join("");
    expect(logged).toContain("https://cdn.example");
    expect(logged).not.toContain("token=abc");
    expect(logged).not.toContain("learner@example.com");
  });

  it("accepts the Reporting API content type", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const url = await start();
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/reports+json" },
      body: JSON.stringify([{ type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://x.example/i.png" } }]),
    });
    expect(res.status).toBe(204);
  });
});

/**
 * These go through the real app, not a bare router: the size-limit bug was
 * middleware order in createApp (the global 3 MB JSON parser consumed the body
 * before the endpoint's 16 KB parser could run).
 */
describe("POST /api/csp-report through createApp", () => {
  let server: Server | undefined;
  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  async function startApp() {
    const app = createApp();
    server = await new Promise<Server>(resolve => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/csp-report`;
  }

  function captureLogs() {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(chunk => (lines.push(String(chunk)), true));
    vi.spyOn(process.stderr, "write").mockImplementation(chunk => (lines.push(String(chunk)), true));
    return () => lines.join("");
  }

  function report(directive: string, padding = 0) {
    return JSON.stringify({ "csp-report": {
      "document-uri": "https://app.example/",
      "effective-directive": directive,
      "blocked-uri": "https://cdn.example/a.mp3",
      padding: "x".repeat(padding),
    } });
  }

  it.each(["application/json", "application/csp-report", "application/reports+json"])(
    "rejects a body over 16 KB sent as %s without logging a violation",
    async contentType => {
      const logs = captureLogs();
      const url = await startApp();
      const body = report("media-src", 20 * 1024);
      expect(Buffer.byteLength(body)).toBeGreaterThan(16 * 1024);

      const res = await fetch(url, { method: "POST", headers: { "content-type": contentType }, body });

      expect(res.status).toBe(413);
      expect(logs()).not.toContain("csp.violation");
    },
  );

  it("still accepts and logs a normal-sized report", async () => {
    const logs = captureLogs();
    const url = await startApp();
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: report("media-src") });
    expect(res.status).toBe(204);
    expect(logs()).toContain("csp.violation");
  });

  it("logs an over-long effective-directive capped to the limit", async () => {
    const logs = captureLogs();
    const url = await startApp();
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/csp-report" },
      body: report("d".repeat(2000)),
    });
    expect(res.status).toBe(204);

    const line = logs().split("\n").find(l => l.includes("csp.violation"));
    expect(line).toBeDefined();
    const entry = JSON.parse(line!);
    expect(entry.details.directive).toBe("d".repeat(MAX_DIRECTIVE_LENGTH));
    expect(line).not.toContain("d".repeat(MAX_DIRECTIVE_LENGTH + 1));
  });
});
