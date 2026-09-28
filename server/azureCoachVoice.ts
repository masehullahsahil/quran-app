/**
 * Azure AI Speech neural TTS behind the coaching-voice seam.
 *
 * The selected vendor (see docs/coaching-voice.md): the teacher's coaching
 * sentences are synthesized once and cached on disk forever, so the
 * long-term cost of the voice is ~$0 — the free-service goal. The spoken
 * corpus is a closed list (SPEAKABLE_COACH_KEYS × 5 languages), so the
 * whole corpus synthesizes for cents, once.
 *
 * Hard boundaries, enforced here and at the layers above:
 * - This module never sees raw caller text. The endpoint
 *   (server/coachSpeechEndpoint.ts) resolves the sentence itself from the
 *   locale packs and only for allowlisted keys — Quran text has no key on
 *   that list and therefore no path here. The defensive length cap below
 *   is a second lock, not the first.
 * - The credential lives in server environment only
 *   (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION). It never appears in the
 *   repo, in logs, or in tests.
 * - Any failure returns null — never throws, never an empty 200. The
 *   endpoint answers 501 and the client falls back to the browser voice,
 *   then on-screen text. A missing credential returns null from the
 *   factory, preserving today's 501-when-unconfigured behavior exactly.
 *
 * Prosody is left at the vendor default on purpose: slowed speech was
 * explicitly rejected — the teacher should sound like a warm person
 * talking, not a slowed-down announcement.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CoachSpeechSynthesizer } from "./coachSpeechEndpoint";
import { isSupportedLanguage, type SupportedLanguageCode } from "@shared/languages";

/**
 * One neural voice per learner language. Chosen for a warm, natural
 * teacher quality rather than narration/documentary delivery.
 *
 * fa-AF (Dari): Azure publishes no fa-AF voice. fa-IR-DilaraNeural is the
 * closest Dari-family locale — Persian, same script, mutually intelligible
 * with Dari in short coaching sentences. It must be reviewed by a Dari
 * speaker before it teaches, and the pre-gen script
 * (scripts/generate-coach-audio.mjs) fails loudly if the mapping ever
 * stops resolving. Never substitute a non-Persian voice for Dari.
 */
export const AZURE_COACH_VOICES: Record<SupportedLanguageCode, string> = {
  en: "en-US-AvaNeural",
  ps: "ps-AF-LatifaNeural",
  "fa-AF": "fa-IR-DilaraNeural",
  // NOTE: there is no ur-PK-GulNeural — "Gul" is the ur-IN (India) female
  // voice. The Pakistani Urdu female voice is Uzma; verified against the
  // live eastus catalog 2026-09-27 (the pre-gen script's voice check
  // caught the bad mapping before anything taught).
  ur: "ur-PK-UzmaNeural",
  ar: "ar-SA-ZariyahNeural",
};

/** Small files, fine for short coaching sentences: 16kHz mono MP3. */
const AZURE_OUTPUT_FORMAT = "audio-16khz-32kbitrate-mono-mp3";

/**
 * Defensive cap on what reaches the vendor. The endpoint only ever hands
 * this module a resolved coaching sentence (the longest is ~150 chars),
 * so anything near this limit is a bug, not a sentence — refuse it.
 */
const MAX_COACH_TEXT_CHARS = 500;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * SSML with default prosody — deliberately no <prosody rate="...">.
 * Slowed speech was rejected; the default pace of these voices is the
 * warm conversational teacher cadence the product wants.
 *
 * NOTE: no xmlns on <speak>. Azure's TTS endpoint rejects the explicit
 * SSML namespace declaration with a bare HTTP 400 (verified against the
 * live eastus endpoint 2026-09-27: identical SSML 400s with xmlns,
 * 200s without). Microsoft's own REST examples omit it.
 */
export function buildCoachSsml(voiceId: string, text: string): string {
  return (
    `<speak version="1.0" xml:lang="${escapeXml(voiceId.slice(0, 5))}">` +
    `<voice name="${escapeXml(voiceId)}">${escapeXml(text)}</voice></speak>`
  );
}

function ttsUrl(region: string): string {
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

/**
 * Create the Azure synthesizer, or null when the credential is absent.
 * Null keeps the endpoint's 501 → client-fallback behavior; the lesson
 * never waits on a voice that isn't configured.
 */
export function createAzureCoachSynthesizer(
  env?: { AZURE_SPEECH_KEY?: string; AZURE_SPEECH_REGION?: string },
  fetchImpl: typeof fetch = fetch,
): CoachSpeechSynthesizer | null {
  const key = env?.AZURE_SPEECH_KEY ?? process.env.AZURE_SPEECH_KEY;
  const region = env?.AZURE_SPEECH_REGION ?? process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return null;

  return async (text, language): Promise<Buffer | null> => {
    const voiceId = AZURE_COACH_VOICES[language];
    if (!voiceId) return null;
    const sentence = text.trim();
    if (!sentence || sentence.length > MAX_COACH_TEXT_CHARS) return null;
    try {
      const response = await fetchImpl(ttsUrl(region), {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": AZURE_OUTPUT_FORMAT,
        },
        body: buildCoachSsml(voiceId, sentence),
      });
      if (!response.ok) return null;
      const audio = Buffer.from(await response.arrayBuffer());
      return audio.length > 0 ? audio : null;
    } catch {
      // Fail closed: network or vendor trouble is a 501 upstream, and the
      // client falls back. Never throw out of the speech path.
      return null;
    }
  };
}

/**
 * List the region's available neural voice short names (e.g.
 * "en-US-AvaNeural"). Used by the pre-gen script to fail loudly when a
 * mapped voice is missing — voice catalogs change, remembered docs don't.
 * Returns null on any failure; the key never leaves this call.
 */
export async function listAzureVoices(
  key: string,
  region: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[] | null> {
  try {
    const response = await fetchImpl(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      { headers: { "Ocp-Apim-Subscription-Key": key } },
    );
    if (!response.ok) return null;
    const voices = (await response.json()) as Array<{ ShortName?: unknown }>;
    const names = voices
      .map((voice) => voice.ShortName)
      .filter((name): name is string => typeof name === "string");
    return names;
  } catch {
    return null;
  }
}

/**
 * Cache file name for one synthesized sentence. The voice id is part of
 * the key: the same sentence in another language is a different file.
 * Hex digest only — no path traversal possible.
 */
export function coachAudioCacheKey(voiceId: string, text: string): string {
  return createHash("sha256").update(`${voiceId}\n${text}`, "utf8").digest("hex");
}

/**
 * Synthesize-once/cache-forever. Each unique (voice, sentence) pair hits
 * Azure exactly once, ever; every later request — including the pre-gen
 * script's — serves the cached MP3. Only allowlisted coaching sentences
 * ever reach this layer, so the cache cannot be poisoned with arbitrary
 * text.
 *
 * The cache is best-effort: a read/write failure degrades to synthesizing
 * (or to null), never to breaking the lesson.
 *
 * Pass undefined as `inner` to preserve the endpoint's
 * 501-when-unconfigured behavior — the factory below returns undefined so
 * wiring stays a one-liner.
 */
export function createCachedCoachSynthesizer(
  inner: CoachSpeechSynthesizer | undefined,
  cacheDir: string = join(process.cwd(), "server", "coach-audio"),
): CoachSpeechSynthesizer | undefined {
  if (!inner) return undefined;
  return async (text, language): Promise<Buffer | null> => {
    const voiceId = AZURE_COACH_VOICES[language];
    if (!voiceId) return null;
    const file = join(cacheDir, `${coachAudioCacheKey(voiceId, text)}.mp3`);
    try {
      const cached = await readFile(file);
      if (cached.length > 0) return cached;
    } catch {
      // Cache miss — synthesize below.
    }
    const audio = await inner(text, language);
    if (!audio) return null;
    try {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(file, audio);
    } catch {
      // Write-through failed; serve the bytes anyway.
    }
    return audio;
  };
}

/**
 * Parse AZURE_SPEECH_LANGS ("en,ps") into the set of languages allowed a
 * neural voice. Unknown codes are ignored. Null/empty means no restriction
 * (every mapped language may use neural) — the pre-gate behaviour.
 *
 * This is the review gate made operational: a language's neural voice goes
 * live only after its reviewer approves it, and opening the next language
 * is a Vercel variable change, not a code change.
 */
export function parseNeuralVoiceLanguages(raw: string | undefined): Set<SupportedLanguageCode> | null {
  if (!raw || !raw.trim()) return null;
  const allowed = new Set<SupportedLanguageCode>();
  for (const piece of raw.split(",")) {
    const code = piece.trim();
    if (isSupportedLanguage(code)) allowed.add(code);
  }
  return allowed;
}

/**
 * Wrap a synthesizer so only allowlisted languages reach the vendor.
 * A disallowed language resolves to null — the endpoint answers 501 and the
 * client falls back to the browser voice, exactly as if no neural voice
 * were configured for it. Never throws; never touches the key.
 */
export function createLanguageGatedSynthesizer(
  base: CoachSpeechSynthesizer,
  allowed: Set<SupportedLanguageCode> | null,
): CoachSpeechSynthesizer {
  if (!allowed) return base;
  return (text, language) =>
    allowed.has(language) ? base(text, language) : Promise.resolve(null);
}
