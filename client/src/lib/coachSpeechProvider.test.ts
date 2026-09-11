/**
 * @vitest-environment happy-dom
 *
 * The coaching-voice providers: language reaches the voice, Quran never does,
 * and a missing voice shows the sentence instead of borrowing another
 * language's mouth.
 *
 * The contract under test is key-only: a request names an allowlisted locale
 * key, never text. There is no parameter that could carry Quranic Arabic into
 * a synthesiser, and the tests below prove the old raw-text door is gone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrowserCoachSpeechProvider,
  COACH_PROSODY,
  createCoachSpeechProvider,
  detectCoachSpeechCapabilities,
  normalizeForSpeech,
  rankCoachVoices,
  ServerNeuralCoachSpeechProvider,
  type CoachSpeechTextResolver,
} from "./coachSpeechProvider";
import type { SpeechLike } from "./coachSpeech";
import type { CoachSpeechRequest } from "@shared/coachSpeech";
import { SUPPORTED_LANGUAGE_CODES } from "@shared/languages";

const spoken: { text: string; lang: string; rate: number }[] = [];
let voices: { lang: string; name: string }[] = [];

class FakeUtterance {
  voice: unknown = null;
  lang = "";
  rate = 1;
  pitch = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const synthesis: SpeechLike = {
  speak: (utterance) => {
    spoken.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate });
    utterance.onend?.();
  },
  cancel: () => {},
  getVoices: () => voices as unknown as SpeechSynthesisVoice[],
};

/** A tiny stand-in for the locale pack: keys resolve, params interpolate. */
const STRINGS: Record<string, Record<string, string>> = {
  en: {
    "tutor.wordMissed": "You missed one word. Listen.",
    "tutor.hintGiven": "Start from {word}.",
    "feedback.coachGoodSpoken": "Good attempt. {nextStep}",
    "feedback.coachPerfectSpoken": "Every expected word was recognised. {nextStep}",
    "feedback.focusedInvalidNextStep": "Try the marked word on its own first.",
  },
  ur: {
    "tutor.wordMissed": "آپ ایک لفظ بھول گئے۔ سنیں۔",
  },
};

const resolveText: CoachSpeechTextResolver = (key, params, language) => {
  const template = STRINGS[language]?.[key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params && Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`,
  );
};

const browser = () => new BrowserCoachSpeechProvider(synthesis, resolveText);

beforeEach(() => {
  spoken.length = 0;
  voices = [
    { lang: "en-US", name: "Robotic English" },
    { lang: "en-US", name: "English Natural Voice" },
    { lang: "ur-PK", name: "Urdu Voice" },
  ];
  (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = FakeUtterance;
});

/** `speak()` is deferred to a separate task; let it run. */
function flushSpeak() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

function audioHarness() {
  return {
    src: "",
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };
}

describe("language selection reaches the speech provider", () => {
  it("speaks Urdu coaching in an Urdu voice when the learner chose Urdu", async () => {
    const provider = browser();
    const outcome = await provider.speak({ messageKey: "tutor.wordMissed", language: "ur" });
    await flushSpeak();

    expect(outcome.spoken).toBe(true);
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe("ur-PK");
    expect(spoken[0].text).toBe("آپ ایک لفظ بھول گئے۔ سنیں۔");
  });

  it("switching language changes the coaching speech language", async () => {
    const provider = browser();
    await provider.speak({ messageKey: "tutor.wordMissed", language: "en" });
    await flushSpeak();
    await provider.speak({ messageKey: "tutor.wordMissed", language: "ur" });
    await flushSpeak();

    expect(spoken.map((s) => s.lang)).toEqual(["en-US", "ur-PK"]);
  });

  it("interpolates an allowlisted param key-reference into the resolved sentence", async () => {
    const provider = browser();
    await provider.speak({
      messageKey: "feedback.coachGoodSpoken",
      params: { nextStep: { key: "feedback.focusedInvalidNextStep" } },
      language: "en",
    });
    await flushSpeak();

    expect(spoken[0].text).toBe("Good attempt. Try the marked word on its own first.");
  });

  it("refuses a raw string smuggled through params — Quran cannot enter that way", async () => {
    const provider = browser();
    // There is no string-typed param slot: this cast models a caller trying
    // to interpolate a Quran word as `nextStep`.
    const outcome = await provider.speak({
      messageKey: "feedback.coachGoodSpoken",
      params: { nextStep: "رَبِّ" } as never,
      language: "en",
    });
    await flushSpeak();

    expect(outcome).toEqual({ spoken: false, reason: "not-speakable" });
    expect(spoken).toEqual([]);
  });

  it("refuses a param key-reference outside the param allowlist", async () => {
    const provider = browser();
    // `tutor.hintGiven` interpolates a Quran word and is display-only: even
    // as a key reference it may not enter speech.
    const outcome = await provider.speak({
      messageKey: "feedback.coachGoodSpoken",
      params: { nextStep: { key: "tutor.hintGiven" } },
      language: "en",
    });
    await flushSpeak();

    expect(outcome).toEqual({ spoken: false, reason: "not-speakable" });
    expect(spoken).toEqual([]);
  });
});

describe("Quran text can never enter synthetic speech", () => {
  it("has no text parameter: a smuggled text property is ignored, the key is spoken", async () => {
    const provider = browser();
    const outcome = await provider.speak({
      messageKey: "tutor.wordMissed",
      // Quran smuggled in as if the old raw-text API still existed.
      text: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
      language: "en",
    } as unknown as CoachSpeechRequest);
    await flushSpeak();

    expect(outcome.spoken).toBe(true);
    expect(spoken).toHaveLength(1);
    // The provider read the key, not the smuggled text.
    expect(spoken[0].text).toBe("You missed one word. Listen.");
    expect(spoken[0].text).not.toContain("بِسْمِ");
  });

  it("refuses a key that is not on the allowlist", async () => {
    const provider = browser();
    const outcome = await provider.speak({
      // tutor.hintGiven interpolates a Quran word and is deliberately not speakable.
      messageKey: "tutor.hintGiven",
      params: { word: "رَبِّ" },
      language: "en",
    });
    await flushSpeak();

    expect(outcome).toEqual({ spoken: false, reason: "not-speakable" });
    expect(spoken).toEqual([]);
  });

  it("refuses the neural path for a non-allowlisted key too", async () => {
    const provider = new ServerNeuralCoachSpeechProvider({
      enabled: true,
      endpoint: "/api/coach-speech",
      languages: ["en"],
    });
    const outcome = await provider.speak({
      messageKey: "tutor.hintGiven",
      params: { word: "رَبِّ" },
      language: "en",
    });

    expect(outcome).toEqual({ spoken: false, reason: "not-speakable" });
  });

  it("refuses a key that resolves to nothing rather than synthesising nothing", async () => {
    const provider = browser();
    const outcome = await provider.speak({ messageKey: "tutor.wordMissed", language: "ps" });
    await flushSpeak();

    // No Pashto voice on this platform: shown, not spoken in another language.
    expect(outcome.spoken).toBe(false);
    expect(spoken).toEqual([]);
  });

  it("the neural request carries the key, never text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/mpeg" })),
    });
    const audio = audioHarness();
    const provider = new ServerNeuralCoachSpeechProvider(
      { enabled: true, endpoint: "/api/coach-speech", languages: ["ur"] },
      fetchImpl as unknown as typeof fetch,
      () => audio as never,
    );
    const pending = provider.speak({
      messageKey: "tutor.wordMissed",
      params: { nextStep: { key: "feedback.focusedInvalidNextStep" } },
      language: "ur",
    });
    await flushSpeak();
    audio.onended?.();
    await pending;

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body).toEqual({
      messageKey: "tutor.wordMissed",
      language: "ur",
      params: { nextStep: { key: "feedback.focusedInvalidNextStep" } },
    });
    expect(body).not.toHaveProperty("text");
  });
});

describe("a language with no voice fails safely to visual text", () => {
  it("reports no-voice for Pashto when the platform carries none", async () => {
    const provider = browser();
    let utteranceEndFired = false;
    const outcome = await provider.speak(
      { messageKey: "tutor.wordMissed", language: "ps" },
      { onUtteranceEnd: () => { utteranceEndFired = true; } },
    );
    await flushSpeak();

    // The promise resolving is the lesson's continue-signal (onDone fired
    // inside); nothing was spoken in another language.
    expect(outcome).toEqual({ spoken: false, reason: "no-voice" });
    expect(utteranceEndFired).toBe(false);
    expect(spoken).toEqual([]);
  });

  it("never substitutes an English voice for Pashto", () => {
    // The strict rule, at the ranking layer: English voices are filtered out
    // before naturalness is even considered.
    expect(rankCoachVoices(voices as SpeechSynthesisVoice[], "ps")).toEqual([]);
  });
});

describe("cancel settles a pending speak", () => {
  it("a cancelled voice resolves as not-spoken instead of hanging", async () => {
    let captured: FakeUtterance | null = null;
    const hanging: SpeechLike = {
      // Never fires onend: the platform swallowed the utterance.
      speak: (utterance) => { captured = utterance as FakeUtterance; },
      cancel: () => {},
      getVoices: () => voices as unknown as SpeechSynthesisVoice[],
    };
    const provider = new BrowserCoachSpeechProvider(hanging, resolveText);
    const pending = provider.speak({ messageKey: "tutor.wordMissed", language: "en" });
    await flushSpeak();
    expect(captured).not.toBeNull();

    provider.cancel();
    const outcome = await pending;
    expect(outcome).toEqual({ spoken: false, reason: "provider-unavailable" });
  });
});

describe("natural voice selection", () => {
  it("prefers a natural-sounding voice within the same language", () => {
    const ranked = rankCoachVoices(voices as SpeechSynthesisVoice[], "en");
    expect(ranked.map((v) => v.name)).toEqual(["English Natural Voice", "Robotic English"]);
  });

  it("keeps Dari inside Persian voices", () => {
    const persian = [
      { lang: "en-US", name: "English Natural Voice" },
      { lang: "fa-IR", name: "Persian Voice" },
    ];
    expect(rankCoachVoices(persian as SpeechSynthesisVoice[], "fa-AF").map((v) => v.lang)).toEqual(["fa-IR"]);
  });
});

describe("prosody", () => {
  it("reads instruction slightly slower than conversation, never dragging", async () => {
    const provider = browser();
    await provider.speak({ messageKey: "tutor.wordMissed", language: "en" });
    await flushSpeak();

    expect(spoken[0].rate).toBe(COACH_PROSODY.en.rate);
    expect(spoken[0].rate).toBeGreaterThanOrEqual(0.9);
    expect(spoken[0].rate).toBeLessThanOrEqual(1);
  });
});

describe("punctuation normalisation", () => {
  it("turns dot-dot-dot and dashes into pauses instead of spoken words", () => {
    expect(normalizeForSpeech("Listen…  then repeat")).toBe("Listen, then repeat");
    expect(normalizeForSpeech("Well... now — recite")).toBe("Well, now , recite");
    expect(normalizeForSpeech("Good!!  Continue??")).toBe("Good! Continue?");
  });
});

describe("the server neural provider", () => {
  it("reports unavailable until an endpoint is configured — no credentials anywhere", () => {
    const unconfigured = new ServerNeuralCoachSpeechProvider({ enabled: false });
    expect(unconfigured.canSpeak("en")).toBe(false);
    const noEndpoint = new ServerNeuralCoachSpeechProvider({ enabled: true });
    expect(noEndpoint.canSpeak("en")).toBe(false);
  });

  it("speaks through the same-origin endpoint and reports the utterance end", async () => {
    const audio = audioHarness();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/mpeg" })),
    });
    const provider = new ServerNeuralCoachSpeechProvider(
      { enabled: true, endpoint: "/api/coach-speech", languages: ["ur"] },
      fetchImpl as unknown as typeof fetch,
      () => audio as never,
    );
    let ended: string | null = null;
    const pending = provider.speak(
      { messageKey: "tutor.wordMissed", language: "ur" },
      { onUtteranceEnd: (reason) => { ended = reason; } },
    );
    await flushSpeak();
    audio.onended?.();
    const outcome = await pending;

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/coach-speech",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body).toEqual({ messageKey: "tutor.wordMissed", language: "ur" });
    expect(ended).toBe("end");
    expect(outcome).toEqual({ spoken: true, voiceLang: "ur" });
  });

  it("falls through to the browser voice when the endpoint fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false });
    const neural = new ServerNeuralCoachSpeechProvider(
      { enabled: true, endpoint: "/api/coach-speech", languages: ["en"] },
      fetchImpl as unknown as typeof fetch,
      () => audioHarness() as never,
    );
    const composite = createCoachSpeechProvider({
      synthesis,
      resolveText,
      providers: [neural, new BrowserCoachSpeechProvider(synthesis, resolveText)],
    });
    const outcome = await composite.speak({ messageKey: "tutor.wordMissed", language: "en" });
    await flushSpeak();

    expect(outcome.spoken).toBe(true);
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe("en-US");
  });
});

describe("the composite provider", () => {
  it("prefers the configured neural voice over the browser's", async () => {
    const audio = audioHarness();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/mpeg" })),
    });
    const neural = new ServerNeuralCoachSpeechProvider(
      { enabled: true, endpoint: "/api/coach-speech", languages: ["en"] },
      fetchImpl as unknown as typeof fetch,
      () => audio as never,
    );
    const composite = createCoachSpeechProvider({
      providers: [neural, new BrowserCoachSpeechProvider(synthesis, resolveText)],
    });
    const pending = composite.speak({ messageKey: "tutor.wordMissed", language: "en" });
    await flushSpeak();
    audio.onended?.();
    const outcome = await pending;

    expect(outcome).toEqual({ spoken: true, voiceLang: "en" });
    expect(spoken).toEqual([]); // the browser synthesiser was never touched
  });

  it("cancels every provider without one trapping the others", () => {
    const good = browser();
    const bad = { ...good, cancel: () => { throw new Error("boom"); } } as never;
    const composite = createCoachSpeechProvider({ providers: [bad, good] });
    expect(() => composite.cancel()).not.toThrow();
  });
});

describe("capability detection", () => {
  it("reports per-language availability honestly", () => {
    const capabilities = detectCoachSpeechCapabilities(synthesis, { enabled: false }, SUPPORTED_LANGUAGE_CODES);
    const byLang = Object.fromEntries(capabilities.map((c) => [c.language, c]));
    expect(byLang.en.browser.available).toBe(true);
    expect(byLang.en.browser.bestVoiceName).toBe("English Natural Voice");
    expect(byLang.ps.browser.available).toBe(false);
    expect(byLang.ps.browser.bestVoiceName).toBeNull();
    expect(byLang.ur.neural.configured).toBe(false);
  });
});

describe("playback never mutates learner Quran state", () => {
  it("the provider interface exposes no recitation state at all", async () => {
    // Structural: the provider can only speak keys it is given and cancel.
    // It holds no session, no word index, no ayah reference — there is
    // nothing for playback to mutate.
    const provider = createCoachSpeechProvider({ synthesis, resolveText });
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(provider))).not.toContain("recitation");
    const outcome = await provider.speak({ messageKey: "tutor.wordMissed", language: "en" });
    await flushSpeak();
    expect(outcome.spoken).toBe(true);
    expect(spoken).toHaveLength(1);
  });
});
