/**
 * The /api/coach-speech seam: key-only, fail-closed. The endpoint resolves
 * sentences server-side and rejects anything outside the allowlist — there
 * is no text field to smuggle Quran through, and no configured vendor means
 * a plain 501, never silence.
 */
import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { createCoachSpeechHandler } from "./coachSpeechEndpoint";

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown; headers: Record<string, string> };
}

async function post(body: unknown, synthesizer?: Parameters<typeof createCoachSpeechHandler>[0]) {
  const handler = createCoachSpeechHandler(synthesizer);
  const req = { body } as Request;
  const res = mockRes();
  await handler(req, res);
  return res;
}

describe("coach-speech endpoint", () => {
  it("rejects a body carrying text — the key-only contract has no text field", async () => {
    const res = await post({
      messageKey: "tutor.wordMissed",
      language: "en",
      text: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "invalid_request" });
  });

  it("rejects a key that is not allowlisted, before any sentence is resolved", async () => {
    const synthesizer = vi.fn().mockResolvedValue(Buffer.from("audio"));
    const res = await post(
      { messageKey: "tutor.hintGiven", language: "en" },
      synthesizer,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "not_speakable" });
    // The synthesiser was never even constructed a sentence for.
    expect(synthesizer).not.toHaveBeenCalled();
  });

  it("rejects a raw string smuggled as a param — params carry no text", async () => {
    const synthesizer = vi.fn().mockResolvedValue(Buffer.from("audio"));
    // A Quran word passed as `nextStep`: the schema has no string-typed
    // param slot, so this fails validation before any key is checked.
    const res = await post(
      {
        messageKey: "feedback.coachGoodSpoken",
        language: "en",
        params: { nextStep: "رَبِّ" },
      },
      synthesizer,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "invalid_request" });
    expect(synthesizer).not.toHaveBeenCalled();
  });

  it("rejects a param key-reference outside the param allowlist", async () => {
    const synthesizer = vi.fn().mockResolvedValue(Buffer.from("audio"));
    // `tutor.hintGiven` interpolates a Quran word: allowlisted as a sentence
    // nowhere, and as a param fragment nowhere either.
    const res = await post(
      {
        messageKey: "feedback.coachGoodSpoken",
        language: "en",
        params: { nextStep: { key: "tutor.hintGiven" } },
      },
      synthesizer,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "not_speakable" });
    expect(synthesizer).not.toHaveBeenCalled();
  });

  it("rejects an unsupported language", async () => {
    const res = await post({ messageKey: "tutor.wordMissed", language: "es" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "not_speakable" });
  });

  it("answers 501 when no neural voice is configured — the client falls back", async () => {
    const res = await post({ messageKey: "tutor.wordMissed", language: "ur" });
    expect(res.statusCode).toBe(501);
    expect(res.body).toEqual({ error: "neural_voice_not_configured" });
  });

  it("resolves the sentence server-side and hands only that to the synthesiser", async () => {
    const synthesizer = vi.fn().mockResolvedValue(Buffer.from("fake-mp3"));
    const res = await post(
      {
        messageKey: "feedback.coachGoodSpoken",
        language: "ur",
        params: { nextStep: { key: "feedback.focusedInvalidNextStep" } },
      },
      synthesizer,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("audio/mpeg");
    expect(res.body).toEqual(Buffer.from("fake-mp3"));

    // The synthesiser received a resolved coaching sentence in Urdu — the
    // `{nextStep}` fragment resolved from its own key, never caller text,
    // never Quran.
    const [text, language] = synthesizer.mock.calls[0];
    expect(language).toBe("ur");
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain("feedback.coachGoodSpoken");
    expect(text).not.toContain("{nextStep}");
  });

  it("resolves each language's own coaching sentence server-side", async () => {
    // The guarantee is structural, not script-based: the synthesiser always
    // receives the locale pack's own coaching sentence for the key — the
    // Arabic pack's sentence is Arabic prose, but it is the project's
    // coaching sentence for that key, not Quran text (which has no key).
    const { resolvePack } = await import("../locales/index");
    const received: Record<string, string> = {};
    const synthesizer = vi.fn().mockImplementation((text: string, language: string) => {
      received[language] = text;
      return Promise.resolve(Buffer.from("x"));
    });
    for (const language of ["en", "ps", "fa-AF", "ur", "ar"] as const) {
      const pack = await import(`../locales/${language}/index.ts`).then((m) => m.default);
      const res = await post({ messageKey: "tutor.finished", language }, synthesizer);
      expect(res.statusCode).toBe(200);
      expect(received[language]).toBe(resolvePack(pack).t("tutor.finished"));
    }
    // Five languages, five distinct coaching sentences — no silent English.
    expect(new Set(Object.values(received)).size).toBe(5);
  });
});
