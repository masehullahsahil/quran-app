/**
 * @vitest-environment happy-dom
 *
 * The teacher's voice, and the thing it will never read.
 *
 * The failure this guards against is specific: a browser voice reading `رَبِّ`
 * to a learner who then repeats what it said. Several Arabic phonemes have no
 * equivalent for an English or Urdu voice to reach for (ح ع ص ض ط ظ ق غ), so
 * the result is not an approximation of a reciter — it is a different word,
 * taught as though it were the right one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COACH_VOICE_TAGS, findCoachVoice, isSpeakableCoachKey, speakCoaching, type SpeechLike } from "./coachSpeech";
import { SPEAKABLE_COACH_KEYS } from "./handsFreePlan";
import { SUPPORTED_LANGUAGE_CODES } from "@shared/languages";

const spoken: string[] = [];
let voices: { lang: string; name: string }[] = [];

class FakeUtterance {
  voice: unknown = null;
  lang = "";
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const synthesis: SpeechLike = {
  speak: (utterance) => {
    spoken.push(utterance.text);
    utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
  },
  cancel: () => {},
  getVoices: () => voices as unknown as SpeechSynthesisVoice[],
};

beforeEach(() => {
  spoken.length = 0;
  voices = [{ lang: "en-US", name: "Test English" }];
  (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = FakeUtterance;
});

describe("the closed list of things the teacher may say", () => {
  it("refuses any key that is not on it", () => {
    // The second lock. Even a caller that believed it was passing a coaching
    // sentence cannot get an arbitrary string spoken.
    const outcome = speakCoaching({
      messageKey: "tutor.hintGiven", text: "Start from رَبِّ.", language: "en", synthesis,
    });

    expect(outcome).toEqual({ spoken: false, reason: "not-speakable" });
    expect(spoken).toEqual([]);
  });

  it("accepts the coaching sentences the plan produces", () => {
    for (const key of SPEAKABLE_COACH_KEYS) expect(isSpeakableCoachKey(key), key).toBe(true);
    expect(isSpeakableCoachKey("tutor.hintGiven")).toBe(false);
    expect(isSpeakableCoachKey("study.record")).toBe(false);
  });

  it("says an allowed sentence and reports the voice it used", () => {
    const done = vi.fn();
    const outcome = speakCoaching({
      messageKey: "handsfree.nowYouSayIt", text: "Now you say it.", language: "en", synthesis, onDone: done,
    });

    expect(outcome).toEqual({ spoken: true, voiceLang: "en-US" });
    expect(spoken).toEqual(["Now you say it."]);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("a language the platform has no voice for", () => {
  it("shows the sentence rather than reading it in another language", () => {
    // Only an English voice installed, and the lesson is in Pashto. An English
    // voice reading Pashto is not Pashto.
    const done = vi.fn();
    const outcome = speakCoaching({
      messageKey: "handsfree.nowYouSayIt", text: "اوس یې تاسو ووایاست.", language: "ps", synthesis, onDone: done,
    });

    expect(outcome).toEqual({ spoken: false, reason: "no-voice" });
    expect(spoken).toEqual([]);
    // The sequence still continues: a missing voice is not a stuck lesson.
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("continues the lesson when the platform has no synthesiser at all", () => {
    const done = vi.fn();
    const outcome = speakCoaching({
      messageKey: "handsfree.goodContinue", text: "Good. Carry on.", language: "en", synthesis: null, onDone: done,
    });

    expect(outcome).toEqual({ spoken: false, reason: "unsupported" });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the learner turned the voice off", () => {
    const outcome = speakCoaching({
      messageKey: "handsfree.goodContinue", text: "Good. Carry on.", language: "en", muted: true, synthesis,
    });

    expect(outcome).toEqual({ spoken: false, reason: "muted" });
    expect(spoken).toEqual([]);
  });
});

describe("choosing a voice", () => {
  it("asks for every teaching language and never substitutes one for another", () => {
    expect(Object.keys(COACH_VOICE_TAGS).sort()).toEqual([...SUPPORTED_LANGUAGE_CODES].sort());

    const installed = [
      { lang: "en-US", name: "English" },
      { lang: "ur-IN", name: "Urdu" },
      { lang: "ar-EG", name: "Arabic" },
    ] as unknown as SpeechSynthesisVoice[];

    // A regional variant of the right language is fine.
    expect(findCoachVoice(installed, "ur")?.lang).toBe("ur-IN");
    expect(findCoachVoice(installed, "ar")?.lang).toBe("ar-EG");
    // A different language never is.
    expect(findCoachVoice(installed, "ps")).toBeNull();
    expect(findCoachVoice(installed, "fa-AF")).toBeNull();
  });

  it("prefers Afghan Persian for Dari before falling back within Persian", () => {
    expect(COACH_VOICE_TAGS["fa-AF"][0]).toBe("fa-AF");
    const persian = [{ lang: "fa-IR", name: "Persian" }] as unknown as SpeechSynthesisVoice[];
    expect(findCoachVoice(persian, "fa-AF")?.lang).toBe("fa-IR");
  });
});
