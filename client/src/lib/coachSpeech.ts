/**
 * The teacher's speaking voice — and the one thing it will never say.
 *
 * A hands-free lesson has to be usable with the phone propped on a table and
 * the learner's eyes on the Quran, which means the short coaching sentences
 * ("You missed one word. Listen.", "Now you say it.") should be audible rather
 * than only legible. The browser's own speech synthesiser is the mechanism this
 * repository already has, so that is what is used.
 *
 * **It is never given Quranic Arabic.** Not as a word, not inside a sentence,
 * not as a fallback when a recording is missing. The rule is enforced twice:
 *
 *  1. structurally, by the caller — `handsFreePlan.ts` emits a coaching step as
 *     a *locale key* from a closed list, and Quran text has no locale key;
 *  2. here, by `speakCoaching` refusing any key not on that list.
 *
 * Two locks rather than one because this is the boundary that matters most: an
 * English or Urdu voice reading `رَبِّ` is not an approximation of a reciter, it
 * is a different utterance, and several Arabic phonemes (ح ع ص ض ط ظ ق غ) have
 * no equivalent for it to reach for at all. Where a trusted recording is
 * missing the honest answers are the reciter's ayah or silence, and both are
 * available. Synthesis is not.
 *
 * ## When the voice is not there
 *
 * Pashto, Dari and Urdu voices are not present in most browsers. This reports
 * that plainly rather than substituting a nearby language: a Pashto sentence
 * read by an English voice is not Pashto, and a learner who cannot rely on the
 * spoken line will read the screen — which is why every coaching sentence is on
 * the screen whether or not it was spoken. Falling back to *displaying* is
 * always correct; falling back to a wrong voice is not.
 */
import type { StringKey } from "@locales/index";
import type { SupportedLanguageCode } from "@shared/languages";
import { SPEAKABLE_COACH_KEYS } from "./handsFreePlan";

/**
 * The BCP 47 tag to ask the platform for, per teaching language.
 *
 * Dari is requested as `fa-AF` first and plain `fa` after, which is how the
 * platforms that carry it actually label it.
 */
export const COACH_VOICE_TAGS: Record<SupportedLanguageCode, readonly string[]> = {
  en: ["en-US", "en-GB", "en"],
  ps: ["ps-AF", "ps"],
  "fa-AF": ["fa-AF", "fa-IR", "fa"],
  ur: ["ur-PK", "ur-IN", "ur"],
  ar: ["ar-SA", "ar-EG", "ar"],
};

export type CoachSpeechOutcome =
  /** Spoken aloud. The sentence is also on screen. */
  | { spoken: true; voiceLang: string }
  /** Shown only, with the reason. Never an error the learner has to act on. */
  | { spoken: false; reason: "unsupported" | "no-voice" | "not-speakable" | "muted" };

export type SpeechLike = {
  speak: (utterance: SpeechSynthesisUtterance) => void;
  cancel: () => void;
  getVoices: () => SpeechSynthesisVoice[];
};

/**
 * The best available voice for a teaching language, or null.
 *
 * Matched on the language subtag only after the exact tags fail, so `ur-IN`
 * satisfies a request for Urdu but `en-US` never satisfies one. A null here is
 * a normal outcome and the caller displays the sentence instead.
 */
export function findCoachVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: SupportedLanguageCode,
): SpeechSynthesisVoice | null {
  const tags = COACH_VOICE_TAGS[language] ?? [];
  for (const tag of tags) {
    const exact = voices.find((voice) => voice.lang?.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
  }
  const base = (tags[0] ?? language).split("-")[0].toLowerCase();
  return voices.find((voice) => (voice.lang ?? "").toLowerCase().split("-")[0] === base) ?? null;
}

/** Whether a message key is one the teacher is allowed to say aloud. */
export function isSpeakableCoachKey(key: StringKey): boolean {
  return SPEAKABLE_COACH_KEYS.includes(key);
}

export type SpeakCoachingInput = {
  /** The key, checked against the allowlist. Not the text — the key. */
  messageKey: StringKey;
  /** The sentence, already resolved in the learner's language. */
  text: string;
  language: SupportedLanguageCode;
  /** The learner turned coaching audio off. */
  muted?: boolean;
  synthesis?: SpeechLike | null;
  /** Called when the utterance finishes, or immediately when it is not spoken. */
  onDone?: () => void;
};

/**
 * Say one coaching sentence, if it is one that may be said.
 *
 * Returns synchronously with what happened, so the caller can put the state on
 * screen without waiting for a voice that may never start. `onDone` fires
 * either way, because the hands-free sequence has to continue whether or not
 * the platform had a voice for this language.
 */
export function speakCoaching(input: SpeakCoachingInput): CoachSpeechOutcome {
  const done = () => input.onDone?.();

  // The second lock. A key that is not on the list is not spoken, whatever the
  // caller believed it was passing.
  if (!isSpeakableCoachKey(input.messageKey)) {
    done();
    return { spoken: false, reason: "not-speakable" };
  }
  if (input.muted) {
    done();
    return { spoken: false, reason: "muted" };
  }

  const synthesis = input.synthesis ?? (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);
  if (!synthesis || typeof SpeechSynthesisUtterance !== "function") {
    done();
    return { spoken: false, reason: "unsupported" };
  }

  const voice = findCoachVoice(synthesis.getVoices() ?? [], input.language);
  if (!voice) {
    // No voice for this language. The sentence is on screen; nothing is read in
    // a language the learner did not choose.
    done();
    return { spoken: false, reason: "no-voice" };
  }

  synthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(input.text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  // Slower than conversation: this is an instruction, often in the learner's
  // second language, spoken over a phone speaker.
  utterance.rate = 0.92;
  utterance.onend = done;
  utterance.onerror = done;
  synthesis.speak(utterance);
  return { spoken: true, voiceLang: voice.lang };
}
