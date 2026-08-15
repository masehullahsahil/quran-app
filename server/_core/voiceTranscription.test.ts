import { afterEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
});

const stubTranscriptionFetch = () =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify({
    task: "transcribe",
    language: "ar",
    duration: 1,
    text: "بسم الله",
    segments: [],
  }), { status: 200 }));

const audio = () => Buffer.from([1, 2, 3]);

describe("transcribeAudio", () => {
  it("uploads the supplied buffer straight to OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const fetchMock = stubTranscriptionFetch();
    global.fetch = fetchMock as typeof fetch;

    const { transcribeAudio } = await import("./voiceTranscription");
    const result = await transcribeAudio({
      audio: audio(),
      mimeType: "audio/webm",
      language: "ar",
      prompt: "Transcribe Arabic only.",
    });

    expect("error" in result).toBe(false);
    // One request only: the audio no longer has to be downloaded from storage.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.openai.com/v1/audio/transcriptions",
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((request.headers as Record<string, string>).authorization).toBe("Bearer test-key");

    const body = request.body as FormData;
    expect(body.get("language")).toBe("ar");
    expect(body.get("prompt")).toBe("Transcribe Arabic only.");
    const file = body.get("file") as File;
    expect(file.name).toBe("audio.webm");
    expect(file.size).toBe(3);
  });

  // MediaRecorder reports types like "audio/webm;codecs=opus", and Whisper
  // infers the container from the filename it is given.
  it("derives the filename extension from a parameterised mime type", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const fetchMock = stubTranscriptionFetch();
    global.fetch = fetchMock as typeof fetch;

    const { transcribeAudio } = await import("./voiceTranscription");
    await transcribeAudio({ audio: audio(), mimeType: "audio/webm;codecs=opus" });

    const body = (fetchMock.mock.calls[0]?.[1] as RequestInit).body as FormData;
    expect((body.get("file") as File).name).toBe("audio.webm");
  });

  // Whisper's prompt is decoder priming in the audio's own language, so a
  // caller that supplies none must not have one invented for it.
  it("sends no prompt when the caller does not supply one", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const fetchMock = stubTranscriptionFetch();
    global.fetch = fetchMock as typeof fetch;

    const { transcribeAudio } = await import("./voiceTranscription");
    const result = await transcribeAudio({
      audio: audio(),
      mimeType: "audio/webm",
      language: "ar",
    });

    expect("error" in result).toBe(false);
    const body = (fetchMock.mock.calls[0]?.[1] as RequestInit).body as FormData;
    expect(body.get("language")).toBe("ar");
    expect(body.get("prompt")).toBeNull();
  });

  it("rejects empty and oversized audio without calling OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const fetchMock = stubTranscriptionFetch();
    global.fetch = fetchMock as typeof fetch;

    const { transcribeAudio, MAX_AUDIO_BYTES } = await import("./voiceTranscription");

    expect(await transcribeAudio({ audio: Buffer.alloc(0), mimeType: "audio/webm" }))
      .toMatchObject({ code: "INVALID_FORMAT" });
    expect(await transcribeAudio({
      audio: Buffer.alloc(MAX_AUDIO_BYTES + 1),
      mimeType: "audio/webm",
    })).toMatchObject({ code: "FILE_TOO_LARGE" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a configuration error when OPENAI_API_KEY is unset", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const fetchMock = stubTranscriptionFetch();
    global.fetch = fetchMock as typeof fetch;

    const { transcribeAudio } = await import("./voiceTranscription");
    const result = await transcribeAudio({ audio: audio(), mimeType: "audio/webm" });

    expect(result).toMatchObject({ code: "SERVICE_ERROR", details: "OPENAI_API_KEY is not set" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
