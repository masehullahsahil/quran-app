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
 * not as a fallback when a recording is missing. The rule is enforced
 * structurally: `shared/coachSpeech.ts` defines the speech request as a
 * locale *key* (`CoachSpeechRequest`) — there is no text parameter for Quran
 * to travel through — and both the browser provider and the
 * `/api/coach-speech` endpoint refuse any key not on `SPEAKABLE_COACH_KEYS`.
 * `tutor.hintGiven`, which interpolates a Quran word, is display-only. An
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
import type { SupportedLanguageCode } from "@shared/languages";
import { isSpeakableCoachKey } from "@shared/coachSpeech";

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
  | { spoken: false; reason: "unsupported" | "no-voice" | "not-speakable" | "muted" | "provider-unavailable" };

export type SpeechLike = {
  speak: (utterance: SpeechSynthesisUtterance) => void;
  cancel: () => void;
  getVoices: () => SpeechSynthesisVoice[];
  /**
   * The platform's own liveness report. Real synthesisers have both; a fake
   * that does not is treated as unknown, never as quiet.
   */
  speaking?: boolean;
  pending?: boolean;
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
export { isSpeakableCoachKey };

/**
 * The voice to speak with, chosen by the caller.
 *
 * The default is `findCoachVoice`: strict language-subtag matching, so an
 * English voice is never chosen for Pashto. A provider may pass its own
 * picker — for example to prefer natural-sounding voices — but the picker it
 * passes must keep the same never-substitute rule.
 */
export type CoachVoicePicker = (
  voices: readonly SpeechSynthesisVoice[],
  language: SupportedLanguageCode,
) => SpeechSynthesisVoice | null;

/** Slower or faster than the default pace; 1 is the platform's normal rate. */
export type CoachProsody = { rate: number; pitch: number };

export type SpeakResolvedCoachingTextInput = {
  /**
   * The sentence, already resolved in the learner's language.
   *
   * The caller vouches that this text may be spoken: for coaching steps that
   * means the key was on the allowlist; for review guidance it means the text
   * came from the server's spoken-guidance field, which is explanatory prose
   * and never Quran. This function does not re-check provenance — it cannot
   * tell an Arabic coaching sentence from a Quran word by looking — so only
   * call it with text whose origin is already established.
   */
  text: string;
  language: SupportedLanguageCode;
  /** The learner turned coaching audio off. */
  muted?: boolean;
  synthesis?: SpeechLike | null;
  /** Called when the utterance finishes, or immediately when it is not spoken. */
  onDone?: () => void;
  /**
   * Finer-grained than `onDone`: which utterance event settled the step.
   * Lets the caller distinguish a voice that finished from one that errored,
   * without this module deciding what either means for the lesson.
   */
  onUtteranceEnd?: (reason: "end" | "error") => void;
  pickVoice?: CoachVoicePicker;
  prosody?: CoachProsody;
};

/**
 * Say one resolved coaching sentence, if the platform has a voice for it.
 *
 * This is the shared utterance core behind the coaching-voice providers: one
 * implementation of the delicate cancel/speak timing, the strict
 * language-matched voice choice, and the always-fire `onDone` so a missing
 * voice never stalls the lesson. It performs no allowlist check — the
 * key-only gate lives in the providers and the `/api/coach-speech` endpoint,
 * which resolve a key to text and only then call this.
 */
export function speakResolvedCoachingText(input: SpeakResolvedCoachingTextInput): CoachSpeechOutcome {
  const done = () => input.onDone?.();
  if (input.muted) {
    done();
    return { spoken: false, reason: "muted" };
  }

  const synthesis = input.synthesis ?? (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);
  if (!synthesis || typeof SpeechSynthesisUtterance !== "function") {
    done();
    return { spoken: false, reason: "unsupported" };
  }

  const pickVoice = input.pickVoice ?? findCoachVoice;
  const voice = pickVoice(synthesis.getVoices() ?? [], input.language);
  if (!voice) {
    // No voice for this language. The sentence is on screen; nothing is read in
    // a language the learner did not choose.
    done();
    return { spoken: false, reason: "no-voice" };
  }

  // Never cancel blindly. On iOS Safari a synchronous `cancel()` immediately
  // followed by `speak()` is one way a first utterance goes silent: the
  // synthesiser reports nothing, the caller waits on an `onend` that never
  // fires, and the microphone stays closed while the learner is already
  // reciting. So the queue is cleared only when the synthesiser reports
  // something actually in it; a synthesiser that reports nothing at all is
  // treated as unknown and cleared as before, because a queue that cannot be
  // seen is safer cleared than spoken over.
  const busy = synthesis.speaking === true || synthesis.pending === true;
  const reportsState = typeof synthesis.speaking === "boolean" || typeof synthesis.pending === "boolean";
  if (!reportsState || busy) {
    synthesis.cancel();
  }
  const utterance = new SpeechSynthesisUtterance(input.text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  // Slower than conversation for instruction in a second language; the
  // provider may tune this per language.
  utterance.rate = input.prosody?.rate ?? 0.92;
  utterance.pitch = input.prosody?.pitch ?? 1;
  utterance.onend = () => {
    input.onUtteranceEnd?.("end");
    done();
  };
  utterance.onerror = () => {
    input.onUtteranceEnd?.("error");
    done();
  };
  // A separate task, never back-to-back with `cancel()`. The return value is
  // unchanged — `{spoken: true}` still means "handed to the synthesiser", not
  // "audible" — and the caller must not treat it as audibility.
  setTimeout(() => synthesis.speak(utterance), 0);
  return { spoken: true, voiceLang: voice.lang };
}

/**
 * Stop whatever the synthesiser is saying, if anything.
 *
 * Used when a coaching line's backstop fires: a voice that never reports
 * finishing would otherwise keep speaking after the step resolved, and the
 * microphone re-opens onto it. Cancelling is idempotent — when the voice
 * already finished there is nothing to stop — and a late `onend`/`onerror`
 * from the cancelled utterance only re-settles an already-settled step.
 */
export function cancelCoachSpeech(synthesis?: SpeechLike | null) {
  const target = synthesis
    ?? (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);
  try {
    target?.cancel();
  } catch { /* the synthesiser is already torn down */ }
}
