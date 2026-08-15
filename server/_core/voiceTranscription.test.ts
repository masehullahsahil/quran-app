import { afterEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
});

const stubTranscriptionFetch = () =>
  vi.fn()
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

describe("transcribeAudio", () => {
  it("passes the requested language through to the speech-to-text service", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

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
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.openai.com/v1/audio/transcriptions",
    );
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const headers = request.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-key");
    const body = request.body as FormData;
    expect(body.get("language")).toBe("ar");
    expect(body.get("prompt")).toBe("Transcribe Arabic only.");
  });

  // Whisper's prompt is decoder priming in the audio's own language, so a
  // caller that supplies none must not have one invented for it.
  it("sends no prompt when the caller does not supply one", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const fetchMock = stubTranscriptionFetch();
    global.fetch = fetchMock as typeof fetch;

    const { transcribeAudio } = await import("./voiceTranscription");
    const result = await transcribeAudio({
      audioUrl: "https://storage.example.test/recitation.mp3",
      language: "ar",
    });

    expect("error" in result).toBe(false);
    const body = (fetchMock.mock.calls[1]?.[1] as RequestInit).body as FormData;
    expect(body.get("language")).toBe("ar");
    expect(body.get("prompt")).toBeNull();
  });

  it("reports a configuration error when OPENAI_API_KEY is unset", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const fetchMock = stubTranscriptionFetch();
    global.fetch = fetchMock as typeof fetch;

    const { transcribeAudio } = await import("./voiceTranscription");
    const result = await transcribeAudio({
      audioUrl: "https://storage.example.test/recitation.mp3",
    });

    expect(result).toMatchObject({ code: "SERVICE_ERROR", details: "OPENAI_API_KEY is not set" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
