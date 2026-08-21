import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
});

const AYAH = "بسم الله الرحمن الرحيم";

const evaluateInput = {
  expectedArabic: AYAH,
  audioBase64: Buffer.alloc(64, 7).toString("base64"),
  mimeType: "audio/webm" as const,
  surah: 1,
  ayah: 1,
};

// Routes each outbound call by URL so a test can assert exactly which services
// the recitation flow touched.
function stubServices(options: { failStorage?: boolean } = {}) {
  const calls: string[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);

    if (options.failStorage && url.includes("/storage/")) {
      return new Response("bucket unavailable", { status: 503 });
    }

    if (url.includes("/audio/transcriptions")) {
      return new Response(JSON.stringify({
        task: "transcribe",
        language: "ar",
        duration: 2,
        text: AYAH,
        segments: [],
      }), { status: 200 });
    }

    if (url.includes("/chat/completions")) {
      return new Response(JSON.stringify({
        id: "chatcmpl-1",
        created: 0,
        model: "gpt-5-mini",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              encouragement: "Well recalled.",
              nextStep: "Repeat once more at the same pace.",
              spokenGuidance: "Well recalled. Repeat once more at the same pace.",
            }),
          },
          finish_reason: "stop",
        }],
      }), { status: 200 });
    }

    if (url.includes("/storage/presign/put")) {
      return new Response(JSON.stringify({ url: "https://s3.example.test/upload" }), { status: 200 });
    }

    if (url.startsWith("https://s3.example.test/")) {
      return new Response(null, { status: 200 });
    }

    throw new Error(`Unexpected request to ${url}`);
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return calls;
}

const callerContext = {} as TrpcContext;

describe("recitation.evaluate", () => {
  // The point of the refactor: transcription takes the buffer the procedure
  // already holds, so the review runs with no Forge storage configured.
  it("reviews a recitation with only OPENAI_API_KEY configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    const calls = stubServices();
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate(evaluateInput);

    expect(result.transcript).toBe(AYAH);
    expect(result.wordReviewAvailable).toBe(true);
    expect(result.score).toBe(100);
    expect(result.encouragement).toBe("Well recalled.");

    // No storage traffic at all, and the audio was never re-downloaded.
    expect(calls.some(url => url.includes("/storage/"))).toBe(false);
    expect(calls).toEqual([
      "https://api.openai.com/v1/audio/transcriptions",
      "https://api.openai.com/v1/chat/completions",
    ]);
  });

  it("archives the attempt when Forge storage is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://forge.example.test");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "forge-key");

    const calls = stubServices();
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate(evaluateInput);

    expect(result.wordReviewAvailable).toBe(true);
    expect(calls.some(url => url.includes("/v1/storage/presign/put"))).toBe(true);
    expect(calls).toContain("https://s3.example.test/upload");
  });

  // Learn offers two levels now; a review carries the plan for the level the
  // learner is actually on, and the retired names are no longer accepted.
  it("returns the plan for the learner's level, defaulting to Qaida", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "");

    stubServices();
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(callerContext);

    const defaulted = await caller.recitation.evaluate(evaluateInput);
    expect(defaulted.learningPlan.level).toBe("qaida");
    expect(defaulted.learningPlan.title).toBe("Qaida");

    const tajweed = await caller.recitation.evaluate({ ...evaluateInput, learningLevel: "tajweed" });
    expect(tajweed.learningPlan.level).toBe("tajweed");
    expect(tajweed.learningPlan.boundary).toMatch(/qualified teacher/i);

    await expect(
      // @ts-expect-error "reading" was removed as a level
      caller.recitation.evaluate({ ...evaluateInput, learningLevel: "reading" }),
    ).rejects.toThrow();
  });

  it("still returns a review when archiving fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://forge.example.test");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "forge-key");

    const calls = stubServices({ failStorage: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { appRouter } = await import("./routers");

    const result = await appRouter.createCaller(callerContext).recitation.evaluate(evaluateInput);

    expect(result.transcript).toBe(AYAH);
    expect(result.wordReviewAvailable).toBe(true);
    expect(calls).toContain("https://api.openai.com/v1/audio/transcriptions");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
