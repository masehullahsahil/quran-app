/**
 * Locale resolution for server-generated coach text.
 *
 * The recitation review builds its deterministic strings on the server —
 * encouragement, next step, spoken guidance, review notes. Every one of those
 * strings is learner-facing, so every one comes from a locale key resolved
 * here in the learner's `uiLanguage`, using the same packs and the same
 * per-key English fallback as the client. No English literal may be
 * constructed in `server/routers.ts` or `server/recitation.ts`.
 *
 * There is no model-generated learner prose: coach feedback is deterministic
 * and locale-backed, so a prompt asking a model to "reply in Urdu" is never
 * the guarantee — the locale packs are.
 */
import { resolvePack, type StringKey } from "@locales/index";
import en from "@locales/en";
import ps from "@locales/ps";
import faAF from "@locales/fa-AF";
import ur from "@locales/ur";
import ar from "@locales/ar";
import { SUPPORTED_LANGUAGES, type SupportedLanguageCode } from "@shared/languages";
import type { CoachSpeechKeyRef, CoachSpeechParams } from "@shared/coachSpeech";
import { isSpeakableCoachParamKey } from "@shared/coachSpeech";

const PACKS = { en, ps, "fa-AF": faAF, ur, ar } as const;

/**
 * A learner-facing sentence identified by locale key rather than text.
 *
 * `server/recitation.ts` returns these instead of English strings so the
 * language is applied once, here, where `uiLanguage` is known. The same
 * shape travels to the client as `spokenGuidanceKey`, where the coaching
 * voice resolves it — one key, one sentence, display and speech in agreement.
 */
export type CoachTextRef = CoachSpeechKeyRef;

/** Resolve a coach sentence in the learner's language. */
export function coachText(
  language: SupportedLanguageCode,
  key: StringKey,
  params?: CoachSpeechParams,
): string {
  const pack = PACKS[language] ?? PACKS.en;
  return resolvePack(pack).t(key, resolveCoachParams(language, params));
}

/**
 * Resolve interpolation params: numbers pass through, key references are
 * resolved in the learner's language. A param naming a key outside
 * `SPEAKABLE_COACH_PARAM_KEYS` is a contract violation — fail loudly rather
 * than speak something unreviewed. Key references may carry their own
 * (number-only, in practice) params, resolved recursively.
 */
export function resolveCoachParams(
  language: SupportedLanguageCode,
  params?: CoachSpeechParams,
): Record<string, string | number> | undefined {
  if (!params) return undefined;
  const resolved: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "number") {
      resolved[name] = value;
      continue;
    }
    if (!isSpeakableCoachParamKey(value.key)) {
      throw new Error(`coach param key not speakable: ${value.key}`);
    }
    resolved[name] = resolveCoachTextRef(language, value);
  }
  return resolved;
}

/** Resolve a {@link CoachTextRef} in the learner's language. */
export function resolveCoachTextRef(language: SupportedLanguageCode, ref: CoachTextRef): string {
  return coachText(language, ref.key, ref.params);
}

/** The language name to put in an LLM prompt, e.g. "Reply in Urdu." */
export function coachLanguageName(language: SupportedLanguageCode): string {
  return SUPPORTED_LANGUAGES[language].englishName;
}
