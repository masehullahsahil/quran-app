/**
 * The server side of the coaching voice: POST /api/coach-speech.
 *
 * Key-only, fail-closed. The client never sends text — it sends
 * `{ messageKey, language, params }`, and this endpoint:
 *
 * 1. rejects any body that is not exactly that shape (a smuggled `text`
 *    field fails validation — `.strict()` drops the whole request);
 * 2. rejects any key not on `SPEAKABLE_COACH_KEYS` and any unsupported
 *    language, before any sentence is resolved;
 * 3. resolves the sentence itself with the server's locale packs, so the
 *    synthesiser can only ever receive a coaching sentence the project
 *    allowlisted — Quran text has no key on that list and therefore no
 *    path to this endpoint's synthesiser.
 *
 * There is deliberately no vendor wired in: which neural TTS provider to
 * use is still an open product decision (see docs/coaching-voice.md). Until
 * one is configured, valid requests get 501 and the client falls back to
 * the browser voice — the lesson never waits on a voice that isn't there.
 */
import type { Request, Response } from "express";
import type { Express } from "express";
import { z } from "zod";
import {
  isSpeakableCoachKey,
  isSpeakableCoachParamKey,
  type CoachSpeechParams,
} from "@shared/coachSpeech";
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguageCode } from "@shared/languages";
import { resolveCoachTextRef } from "./coachLocale";
import type { StringKey } from "@locales/index";

const paramValueSchema: z.ZodType<unknown> = z.union([
  z.number(),
  // A key reference, optionally carrying its own (number-or-reference)
  // params. Strict: no extra fields, no string-typed slots.
  z
    .object({
      key: z.string(),
      params: z.record(z.string(), z.lazy(() => paramValueSchema)).optional(),
    })
    .strict(),
]);

const requestSchema = z
  .object({
    messageKey: z.string(),
    language: z.string(),
    // Params are numbers or key references — never raw strings. A smuggled
    // `text` field, a string param, or an extra field all fail validation.
    params: z.record(z.string(), paramValueSchema).optional(),
  })
  .strict();

/**
 * Turns a resolved coaching sentence into audio bytes. Returns null when no
 * neural voice is available for the language — the endpoint then answers
 * 501 and the client falls back. The vendor credential lives behind this
 * interface, server-side only; it is never in the client or the repo.
 */
export type CoachSpeechSynthesizer = (
  text: string,
  language: SupportedLanguageCode,
) => Promise<Buffer | null>;

export function createCoachSpeechHandler(
  synthesizer?: CoachSpeechSynthesizer,
) {
  return async function coachSpeechHandler(req: Request, res: Response): Promise<void> {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const { messageKey, language, params } = parsed.data;

    // Fail closed: the key must be one the teacher is allowed to say, every
    // param key-reference (at any depth) must be one the teacher may
    // interpolate, and the language must be one the app teaches in. All
    // checks run before any sentence is resolved, so a bad key can never
    // reach a synthesiser.
    const paramValueOk = (value: unknown): boolean => {
      if (typeof value === "number") return true;
      if (typeof value !== "object" || value === null) return false;
      const ref = value as { key?: unknown; params?: unknown };
      if (typeof ref.key !== "string" || !isSpeakableCoachParamKey(ref.key as StringKey)) {
        return false;
      }
      if (ref.params === undefined) return true;
      if (typeof ref.params !== "object" || ref.params === null) return false;
      return Object.values(ref.params).every(paramValueOk);
    };
    const paramsOk =
      !params || Object.values(params).every(paramValueOk);
    if (
      !isSpeakableCoachKey(messageKey as StringKey) ||
      !paramsOk ||
      !(SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(language)
    ) {
      res.status(400).json({ error: "not_speakable" });
      return;
    }

    const resolvedLanguage = language as SupportedLanguageCode;
    const text = resolveCoachTextRef(resolvedLanguage, {
      key: messageKey as StringKey,
      params: params as CoachSpeechParams | undefined,
    });

    const audio = synthesizer ? await synthesizer(text, resolvedLanguage) : null;
    if (!audio) {
      // No neural voice configured for this deployment: say so plainly so
      // the client falls back to the browser voice. Never an empty 200.
      res.status(501).json({ error: "neural_voice_not_configured" });
      return;
    }

    res.setHeader("content-type", "audio/mpeg");
    res.setHeader("content-length", String(audio.length));
    res.send(audio);
  };
}

export function registerCoachSpeechEndpoint(app: Express, synthesizer?: CoachSpeechSynthesizer): void {
  app.post("/api/coach-speech", createCoachSpeechHandler(synthesizer));
}
