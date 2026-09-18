import { describe, expect, it, vi } from "vitest";
import { deriveShadowHealthUrl, probeShadowWorker } from "./serviceHealth";

describe("Quran acoustic service health", () => {
  it("derives the worker health endpoint without preserving a model route", () => {
    expect(
      deriveShadowHealthUrl("http://127.0.0.1:4318/v1/shadow/analyze")
    ).toBe("http://127.0.0.1:4318/health");
    expect(deriveShadowHealthUrl("not a URL")).toBeUndefined();
  });

  it("reports not configured without making a request", async () => {
    const fetchImpl = vi.fn();
    await expect(
      probeShadowWorker(undefined, undefined, 3_000, fetchImpl)
    ).resolves.toEqual({ status: "not_configured", modelId: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports ready only when the shadow model is loaded", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        ready: false,
        modelId: "unconfigured",
        shadowReady: true,
        shadowModelId: "obadx/muaalem-model-v3_2",
      })
    );
    await expect(
      probeShadowWorker(
        "http://worker.test/health",
        "private-key",
        3_000,
        fetchImpl as typeof fetch
      )
    ).resolves.toEqual({
      status: "ready",
      modelId: "obadx/muaalem-model-v3_2",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://worker.test/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer private-key",
        }),
      })
    );
  });

  it.each([
    ["non-success response", new Response(null, { status: 503 })],
    ["model still loading", Response.json({ shadowReady: false })],
    ["malformed response", Response.json({ shadowReady: true })],
  ])("reports unavailable for %s", async (_name, response) => {
    const fetchImpl = vi.fn(async () => response);
    await expect(
      probeShadowWorker(
        "http://worker.test/health",
        undefined,
        3_000,
        fetchImpl as typeof fetch
      )
    ).resolves.toEqual({ status: "unavailable", modelId: null });
  });
});
