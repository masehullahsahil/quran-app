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

  it("retries once on a network failure, then succeeds", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockImplementation(stubTranscriptionFetch());
    global.fetch = fetchMock as typeof fetch;

    const { transcribeAudio } = await import("./voiceTranscription");
    const result = await transcribeAudio({ audio: audio(), mimeType: "audio/webm" });

    expect("error" in result).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a timeout abort, then surfaces the failure", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const timeout = new DOMException("The operation was aborted.", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(timeout);
    global.fetch = fetchMock as typeof fetch;

    const { transcribeAudio } = await import("./voiceTranscription");
    const result = await transcribeAudio({ audio: audio(), mimeType: "audio/webm" });

    // Bounded: exactly one retry, never an unbounded loop.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ code: "SERVICE_ERROR" });
  });

  it("does not retry a non-network failure", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const fetchMock = vi.fn().mockRejectedValue(new Error("something else broke"));
    global.fetch = fetchMock as typeof fetch;

    const { transcribeAudio } = await import("./voiceTranscription");
    const result = await transcribeAudio({ audio: audio(), mimeType: "audio/webm" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ code: "SERVICE_ERROR" });
  });

  it("never retries an empty transcription result", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    // A 200 with no text: an empty answer, not a network failure.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ task: "transcribe", language: "ar", duration: 0, text: "", segments: [] }), {
        status: 200,
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    const { transcribeAudio } = await import("./voiceTranscription");
    const result = await transcribeAudio({ audio: audio(), mimeType: "audio/webm" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ code: "SERVICE_ERROR" });
  });
});

describe("summarizeWhisperResponse", () => {
  it("reads the mean no_speech_prob across segments", async () => {
    const { summarizeWhisperResponse } = await import("./voiceTranscription");
    const summary = summarizeWhisperResponse({
      task: "transcribe",
      language: "ar",
      duration: 2.5,
      text: "بسم الله",
      segments: [
        { id: 0, seek: 0, start: 0, end: 1, text: "a", tokens: [], temperature: 0, avg_logprob: -1, compression_ratio: 1, no_speech_prob: 0.9 },
        { id: 1, seek: 0, start: 1, end: 2.5, text: "b", tokens: [], temperature: 0, avg_logprob: -1, compression_ratio: 1, no_speech_prob: 0.7 },
      ],
    });

    expect(summary.noSpeechProbMean).toBeCloseTo(0.8, 6);
    expect(summary.durationSec).toBe(2.5);
  });

  it("reports null when there are no segments to read", async () => {
    const { summarizeWhisperResponse } = await import("./voiceTranscription");
    const summary = summarizeWhisperResponse({
      task: "transcribe",
      language: "ar",
      duration: 0.4,
      text: "",
      segments: [],
    });

    expect(summary.noSpeechProbMean).toBeNull();
    expect(summary.durationSec).toBe(0.4);
  });
});
