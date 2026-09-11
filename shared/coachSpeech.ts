/**
 * The coaching voice's contract, shared by client and server.
 *
 * The teacher's voice is key-only: a request names an allowlisted locale key
 * plus interpolation params, never text. Params are numbers or references to
 * other allowlisted locale keys — there is no string-typed slot anywhere that
 * could carry Quranic Arabic, a transcript, or model prose into a
 * synthesiser. Removing the text parameter removes the mistake of passing
 * the wrong text; removing string params removes the subtler mistake of
 * interpolating the wrong text.
 *
 * The allowlist is the second lock. `SPEAKABLE_COACH_KEYS` is a closed list;
 * adding a key is the only way to make the teacher say something new, and the
 * list is checked by a test. `SPEAKABLE_COACH_PARAM_KEYS` is the closed list
 * for interpolation values: a `{nextStep}` is always another coaching
 * sentence from the locale packs, never caller-supplied prose. Sentences that
 * interpolate a Quran word (like `tutor.hintGiven`, "Start from {word}.")
 * live in `DISPLAY_ONLY_COACH_KEYS` and are shown, never spoken: no
 * general-purpose voice reads scripture here under any circumstances.
 */
import type { StringKey } from "@locales/index";
import type { SupportedLanguageCode } from "./languages";

/**
 * Interpolation values for a speakable key. Numbers pass through; every
 * string-typed fragment is a key reference into the locale packs (which may
 * itself carry number params), resolved in the learner's language by whoever
 * speaks the sentence. There is no raw-string slot for Quran text to be
 * smuggled through.
 */
export type CoachSpeechParams = Record<string, number | CoachSpeechKeyRef>;

/**
 * A learner-facing sentence identified by locale key rather than text.
 * The server returns these for spoken guidance; the client resolves them
 * with its own locale pack, so the voice and the screen always agree.
 */
export type CoachSpeechKeyRef = {
  key: StringKey;
  params?: CoachSpeechParams;
};

/**
 * One thing for the teacher to say: an allowlisted key, resolved in the
 * learner's language by whoever speaks it. The browser provider resolves it
 * with the client's locale pack; the neural provider sends it to the
 * same-origin endpoint, which resolves it server-side and rejects any key
 * not on the allowlist.
 */
export type CoachSpeechRequest = {
  messageKey: StringKey;
  params?: CoachSpeechParams;
  language: SupportedLanguageCode;
  /** The learner turned coaching audio off. The sentence is still shown. */
  muted?: boolean;
};

/**
 * What the client POSTs to the same-origin neural-speech endpoint.
 * The endpoint resolves the key itself with the server's locale packs and
 * rejects every key not in `SPEAKABLE_COACH_KEYS`. It never accepts text.
 */
export type CoachSpeechSynthesisRequest = {
  messageKey: StringKey;
  language: SupportedLanguageCode;
  params?: CoachSpeechParams;
};

/**
 * The sentences the teacher may say aloud. A closed list, checked by a test.
 *
 * The `feedback.*` entries are the review's spoken guidance: the server sends
 * the key (see `spokenGuidanceKey`), never the sentence. `feedback.coachGoodSpoken`
 * and `feedback.coachPerfectSpoken` interpolate `{nextStep}`, which is always
 * a `CoachSpeechParamRef` into `SPEAKABLE_COACH_PARAM_KEYS` — a coaching
 * sentence from the locale packs, never caller-supplied prose.
 */
export const SPEAKABLE_COACH_KEYS: readonly StringKey[] = [
  "tutor.listening",
  "tutor.wordMissed",
  "tutor.wordRecognised",
  "tutor.reciteFullAyah",
  "tutor.uncertain",
  "tutor.paused",
  "tutor.finished",
  "tutor.offerHint",
  "handsfree.nowYouSayIt",
  "handsfree.listenToTheWord",
  "handsfree.goodContinue",
  "handsfree.carryOn",
  "feedback.coachPerfectSpoken",
  "feedback.coachGoodSpoken",
  "feedback.unavailableSpoken",
  "feedback.focusedInvalidSpoken",
  "feedback.focusedRecognisedNext",
  "feedback.focusedNotRecognisedNext",
  "feedback.focusedUnclearNext",
  "feedback.transcriptionFailedNextStep",
  "feedback.noArabicNextStep",
  "feedback.focusedInvalidNextStep",
];

/**
 * Sentences that carry Quran text and are therefore shown, never spoken.
 *
 * Small, and deliberately explicit rather than derived from a scan of the
 * strings: a locale pack in Arabic is Arabic throughout, so "does this string
 * contain Arabic script" cannot tell a coaching sentence from a Quran word.
 * What can is knowing which sentences interpolate `{word}`.
 */
export const DISPLAY_ONLY_COACH_KEYS: readonly StringKey[] = ["tutor.hintGiven"];

/** Whether a message key is one the teacher is allowed to say aloud. */
export function isSpeakableCoachKey(key: StringKey): boolean {
  return SPEAKABLE_COACH_KEYS.includes(key);
}

/**
 * Locale keys allowed as interpolation values inside a speakable sentence.
 *
 * These are the `{nextStep}` fragments: short coaching sentences from the
 * locale packs. A closed list, checked by a test, enforced by both the
 * browser provider and the neural endpoint. A param value naming any other
 * key — or carrying a raw string at all — is refused before resolution.
 */
export const SPEAKABLE_COACH_PARAM_KEYS: readonly StringKey[] = [
  "plan.qaida.afterRecordingCue",
  "plan.tajweed.afterRecordingCue",
  "feedback.focusedInvalidNextStep",
  "feedback.transcriptionFailedNextStep",
  "feedback.noArabicNextStep",
  "feedback.focusedRecognisedNext",
  "feedback.focusedNotRecognisedNext",
  "feedback.focusedUnclearNext",
  "feedback.nextStepRepeatFromWord",
  "feedback.nextStepReplayReference",
];

/** Whether a locale key may appear as an interpolation value in speech. */
export function isSpeakableCoachParamKey(key: StringKey): boolean {
  return SPEAKABLE_COACH_PARAM_KEYS.includes(key);
}
