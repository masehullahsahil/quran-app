import { afterEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
});

const completionResponse = () =>
  new Response(
    JSON.stringify({
      id: "chatcmpl-1",
      created: 0,
      model: "gpt-5-mini",
      choices: [
        { index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" },
      ],
    }),
    { status: 200 },
  );

describe("invokeLLM", () => {
  it("calls the OpenAI chat completions endpoint with the configured key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const fetchMock = vi.fn().mockResolvedValue(completionResponse());
    global.fetch = fetchMock as typeof fetch;

    const { invokeLLM } = await import("./llm");
    const result = await invokeLLM({
      messages: [{ role: "user", content: "hello" }],
      maxTokens: 64,
    });

    expect(result.choices[0]?.message.content).toBe("ok");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/chat/completions");

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((request.headers as Record<string, string>).authorization).toBe("Bearer test-key");

    const payload = JSON.parse(request.body as string);
    // OpenAI requires a model on every request; Forge defaulted it server side.
    expect(payload.model).toBe("gpt-5-mini");
    expect(payload.messages).toEqual([{ role: "user", content: "hello" }]);
    // `max_tokens` is rejected by the reasoning models this app calls.
    expect(payload.max_completion_tokens).toBe(64);
    expect(payload.max_tokens).toBeUndefined();
  });

  it("maps a reasoning object onto reasoning_effort", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const fetchMock = vi.fn().mockResolvedValue(completionResponse());
    global.fetch = fetchMock as typeof fetch;

    const { invokeLLM } = await import("./llm");
    await invokeLLM({
      messages: [{ role: "user", content: "hello" }],
      reasoning: { effort: "low" },
      model: "gpt-5",
    });

    const payload = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(payload.model).toBe("gpt-5");
    expect(payload.reasoning_effort).toBe("low");
    expect(payload.reasoning).toBeUndefined();
  });

  it("throws when OPENAI_API_KEY is unset", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const fetchMock = vi.fn().mockResolvedValue(completionResponse());
    global.fetch = fetchMock as typeof fetch;

    const { invokeLLM } = await import("./llm");
    await expect(
      invokeLLM({ messages: [{ role: "user", content: "hello" }] }),
    ).rejects.toThrow("OPENAI_API_KEY is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
