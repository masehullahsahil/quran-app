import { afterEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("transcribeAudio", () => {
  it("passes the requested language through to the speech-to-text service", async () => {
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://forge.example.test");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "test-key");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        task: "transcribe",
        language: "ar",
        duration: 1,
        text: "بسم الله",
        segments: [],
      }), { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    const { transcribeAudio } = await import("./voiceTranscription");
    const result = await transcribeAudio({
      audioUrl: "https://storage.example.test/recitation.mp3",
      language: "ar",
      prompt: "Transcribe Arabic only.",
    });

    expect("error" in result).toBe(false);
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const body = request.body as FormData;
    expect(body.get("language")).toBe("ar");
    expect(body.get("prompt")).toBe("Transcribe Arabic only.");
  });
});
