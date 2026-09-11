/**
 * Tests for request correlation: ID generation, client-ID validation, and
 * the Express middleware contract.
 */
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { generateRequestId, isSafeRequestId, requestIdMiddleware } from "./requestId";

function mockReqRes(incomingId?: string) {
  const headers: Record<string, string> = {};
  const req = {
    header: (name: string) => (name === "x-request-id" ? incomingId : undefined),
  } as unknown as Request;
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as Response;
  return { req, res, headers };
}

describe("request correlation", () => {
  it("generates unique IDs with a recognizable prefix", () => {
    const a = generateRequestId();
    const b = generateRequestId();
    expect(a).toMatch(/^req_[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });

  it("accepts safe client-supplied IDs and rejects unsafe ones", () => {
    expect(isSafeRequestId("req_client-123_ABC")).toBe(true);
    expect(isSafeRequestId("short")).toBe(false); // too short
    expect(isSafeRequestId("x".repeat(65))).toBe(false); // too long
    expect(isSafeRequestId("evil\ninjected: header")).toBe(false); // header injection
    expect(isSafeRequestId("has space")).toBe(false);
    expect(isSafeRequestId(undefined)).toBe(false);
  });

  it("assigns and echoes a generated ID when none is supplied", () => {
    const { req, res, headers } = mockReqRes();
    const next = vi.fn() as unknown as NextFunction;
    requestIdMiddleware(req, res, next);

    expect(req.requestId).toMatch(/^req_/);
    expect(headers["x-request-id"]).toBe(req.requestId);
    expect(next).toHaveBeenCalledOnce();
  });

  it("honors a safe client-supplied ID for browser-side correlation", () => {
    const { req, res, headers } = mockReqRes("req_browser-session-42");
    requestIdMiddleware(req, res, vi.fn() as unknown as NextFunction);

    expect(req.requestId).toBe("req_browser-session-42");
    expect(headers["x-request-id"]).toBe("req_browser-session-42");
  });

  it("replaces an unsafe client-supplied ID instead of echoing it", () => {
    const { req, res, headers } = mockReqRes("bad\nid");
    requestIdMiddleware(req, res, vi.fn() as unknown as NextFunction);

    expect(req.requestId).not.toBe("bad\nid");
    expect(headers["x-request-id"]).toBe(req.requestId);
  });
});
