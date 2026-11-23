import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViolationDeduper, parseCspReports, registerCspReportEndpoint, safeResource } from "./cspReport";

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
