/**
 * Coaching-voice providers: who speaks the teacher's sentences, and how the
 * next one plugs in.
 *
 * The browser's speech synthesiser is what ships today. It is robotic on most
 * platforms and simply absent for Pashto, Dari and Urdu on many of them, so
 * the lesson never depends on it: every coaching sentence is on screen whether
 * or not it was spoken, and a missing voice resolves to showing the sentence
 * rather than reading it in a language the learner did not choose.
 *
 * This module is the seam where a natural neural voice plugs in later:
 *
 * - `CoachSpeechProvider` is the interface. The lesson code speaks through it
 *   and never touches `speechSynthesis` or a network call directly.
 * - `BrowserCoachSpeechProvider` is the fallback that ships now.
 * - `ServerNeuralCoachSpeechProvider` is the extension point for a
 *   server-proxied neural TTS voice. It carries no vendor, no URL and no key:
 *   the deployer configures a same-origin endpoint that holds the vendor
 *   credential server-side (see docs/coaching-voice.md). Until that endpoint
 *   is configured it reports itself unavailable and the browser fallback is
 *   used.
 * - `createCoachSpeechProvider` chains them: neural first when configured,
 *   browser next, on-screen text when neither can speak the language.
 *
 * ## The rule that crosses every provider
 *
 * A request is a key, never text (`@shared/coachSpeech`). There is no
 * parameter that could carry Quranic Arabic, a transcript, or model prose
 * into a synthesiser — the mistake of passing the wrong text is removed by
 * removing the text parameter. The key must be on `SPEAKABLE_COACH_KEYS`;
 * the browser resolves it with the client's locale pack, the neural
 * endpoint resolves it server-side and rejects anything not allowlisted.
 * Adding a new speakable sentence still means adding its key to
 * `SPEAKABLE_COACH_KEYS` — there is no other door.
 */
import type { StringKey } from "@locales/index";
import type { SupportedLanguageCode } from "@shared/languages";
import {
  isSpeakableCoachKey,
  isSpeakableCoachParamKey,
  type CoachSpeechParams,
  type CoachSpeechRequest,
  type CoachSpeechSynthesisRequest,
} from "@shared/coachSpeech";
import {
  findCoachVoice,
  speakResolvedCoachingText,
  type CoachProsody,
  type CoachSpeechOutcome,
  type CoachVoicePicker,
  type SpeechLike,
} from "./coachSpeech";

export type { CoachSpeechRequest };

/**
 * Resolves a speakable key in the requested language. Callers pass the `t`
 * they already render with, so the voice always says the sentence on screen.
 * Params here are already flattened — key references resolved, numbers kept —
 * so this never sees a raw interpolation slot.
 */
export type CoachSpeechTextResolver = (
  key: StringKey,
  params: Record<string, string | number> | undefined,
  language: SupportedLanguageCode,
) => string;

/**
 * Punctuation the synthesiser would read awkwardly, normalised before
 * speaking. Conservative: only the patterns that read as words ("dot dot
 * dot") or swallow the sentence. Locale strings carry no markdown, so none
 * is stripped.
 */
export function normalizeForSpeech(text: string): string {
  return text
    .replace(/[…]/g, ", ")
    .replace(/\.{2,}/g, ", ")
    .replace(/[—–]/g, ", ")
    .replace(/([!?])\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Order the platform's voices for a teaching language, best first.
 *
 * The filter is the strict rule from `findCoachVoice`: only voices whose
 * language subtag matches the requested language survive, so an English
 * voice can never be ranked for Pashto. Within the survivors, voices whose
 * names advertise natural or neural synthesis sort first — this is a
 * preference, not a promise: on a platform with one robotic voice the robot
 * still wins over silence, and the sentence is on screen either way.
 */
export function rankCoachVoices(
  voices: readonly SpeechSynthesisVoice[],
  language: SupportedLanguageCode,
): SpeechSynthesisVoice[] {
  const wanted = language.split("-")[0].toLowerCase();
  const matching = voices.filter(
    (voice) => (voice.lang ?? "").toLowerCase().split("-")[0] === wanted,
  );
  const naturalness = (voice: SpeechSynthesisVoice): number => {
    const name = `${voice.name ?? ""} ${voice.voiceURI ?? ""}`.toLowerCase();
    let score = 0;
    if (/natural|neural/.test(name)) score += 3;
    if (/google|microsoft|samantha|zira|david|karen|moira|tessa|fiona|daniel/.test(name)) score += 2;
    if (/enhanced|premium/.test(name)) score += 1;
    if (/robot|espeak|festival/.test(name)) score -= 2;
    return score;
  };
  return [...matching].sort((a, b) => naturalness(b) - naturalness(a));
}

/**
 * Pace per teaching language. Instruction is read a touch slower than
 * conversation; in the learner's second language slower still — but never
 * dragging. 1 is the platform's normal rate.
 */
export const COACH_PROSODY: Record<SupportedLanguageCode, CoachProsody> = {
  en: { rate: 0.98, pitch: 1 },
  ps: { rate: 0.92, pitch: 1 },
  "fa-AF": { rate: 0.92, pitch: 1 },
  ur: { rate: 0.92, pitch: 1 },
  ar: { rate: 0.94, pitch: 1 },
};

const naturalVoicePicker: CoachVoicePicker = (voices, language) =>
  rankCoachVoices(voices, language)[0] ?? null;

export type CoachSpeechEvents = {
  /**
   * Which utterance event settled the step. Lets the caller distinguish a
   * voice that finished from one that errored — the hands-free orchestrator
   * needs this for its backstop and mic-reopen timing.
   */
  onUtteranceEnd?: (reason: "end" | "error") => void;
};

export interface CoachSpeechProvider {
  /** Stable identifier for instrumentation: "browser" | "server-neural" | ... */
  readonly id: string;
  /**
   * Whether this provider can speak this language right now: a matching
   * voice present, a configured endpoint reachable. Never true on the basis
   * of a nearby language — a missing Pashto voice is not covered by English.
   */
  canSpeak(language: SupportedLanguageCode): boolean | Promise<boolean>;
  /**
   * Speak the request. Resolves with what happened; `events.onUtteranceEnd`
   * fires on end/error for speech that actually started. `cancel()` settles
   * a pending speak as not-spoken, so a cancelled voice never leaves a
   * promise hanging — the orchestrator's own backstop stays the authority on
   * when the microphone re-opens.
   */
  speak(request: CoachSpeechRequest, events?: CoachSpeechEvents): Promise<CoachSpeechOutcome>;
  /** Stop whatever this provider is saying, if anything. Idempotent. */
  cancel(): void;
}

export type BrowserCoachSpeechOptions = {
  synthesis?: SpeechLike | null;
  /**
   * Resolves the request's key in the request's language. The browser has no
   * locale pack of its own; the caller passes the `t` it renders with, so
   * the voice and the screen can never disagree.
   */
  resolveText?: CoachSpeechTextResolver;
};

/**
 * The browser's own synthesiser, with natural-voice preference and
 * per-language prosody on top of the strict never-substitute voice rule.
 *
 * Key-only: the key is checked against the allowlist, resolved through
 * `resolveText`, and only the resolved coaching sentence reaches the
 * synthesiser. A request carrying any other property (a smuggled `text`,
 * a transcript) is ignored — the provider reads `messageKey` and nothing
 * else.
 */
export class BrowserCoachSpeechProvider implements CoachSpeechProvider {
  readonly id = "browser";
  private synthesis: SpeechLike | null | undefined;
  private resolveText: CoachSpeechTextResolver | undefined;
  /** Pending speaks, settled as not-spoken when `cancel()` runs. */
  private pending = new Set<(outcome: CoachSpeechOutcome) => void>();

  constructor(synthesis?: SpeechLike | null, resolveText?: CoachSpeechTextResolver);
  constructor(options?: BrowserCoachSpeechOptions);
  constructor(
    synthesisOrOptions?: SpeechLike | null | BrowserCoachSpeechOptions,
    resolveText?: CoachSpeechTextResolver,
  ) {
    if (synthesisOrOptions !== null && typeof synthesisOrOptions === "object" && !("speak" in synthesisOrOptions)) {
      this.synthesis = synthesisOrOptions.synthesis;
      this.resolveText = synthesisOrOptions.resolveText;
    } else {
      this.synthesis = synthesisOrOptions as SpeechLike | null | undefined;
      this.resolveText = resolveText;
    }
  }

  canSpeak(language: SupportedLanguageCode): boolean {
    const synthesis = this.resolveSynthesis();
    if (!synthesis || typeof SpeechSynthesisUtterance !== "function") return false;
    return findCoachVoice(synthesis.getVoices() ?? [], language) !== null;
  }

  /**
   * Flatten interpolation params for the text resolver. Numbers pass
   * through; key references are validated against
   * `SPEAKABLE_COACH_PARAM_KEYS` and resolved in the requested language,
   * recursively for their own params. Returns null when a param is not a
   * number or an allowlisted key reference — the sentence is then refused,
   * never spoken half-resolved.
   */
  private resolveParams(
    params: CoachSpeechParams | undefined,
    language: SupportedLanguageCode,
  ): Record<string, string | number> | undefined | null {
    if (!params) return undefined;
    if (!this.resolveText) return null;
    const resolveText = this.resolveText;
    const flat: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(params)) {
      if (typeof value === "number") {
        flat[name] = value;
        continue;
      }
      if (typeof value !== "object" || value === null || !isSpeakableCoachParamKey(value.key)) {
        return null;
      }
      const nested = this.resolveParams(value.params, language);
      if (nested === null) return null;
      flat[name] = resolveText(value.key, nested, language);
    }
    return flat;
  }

  async speak(request: CoachSpeechRequest, events?: CoachSpeechEvents): Promise<CoachSpeechOutcome> {
    // The allowlist is the lock: a key that is not on it is not spoken,
    // whatever else the caller believed it was passing.
    if (!isSpeakableCoachKey(request.messageKey)) {
      return { spoken: false, reason: "not-speakable" };
    }
    if (!this.resolveText) {
      return { spoken: false, reason: "not-speakable" };
    }
    // Params are the second lock: every string-typed fragment must be a
    // reference to a key on SPEAKABLE_COACH_PARAM_KEYS, resolved here in the
    // learner's language. A raw string — Quran text smuggled as `nextStep`,
    // say — has no slot to enter through and is refused, not spoken.
    const params = this.resolveParams(request.params, request.language);
    if (params === null) {
      return { spoken: false, reason: "not-speakable" };
    }
    const text = normalizeForSpeech(this.resolveText(request.messageKey, params, request.language));
    if (!text) return { spoken: false, reason: "not-speakable" };
    const synthesis = this.resolveSynthesis();
    return new Promise<CoachSpeechOutcome>((resolve) => {
      this.pending.add(resolve);
      const settle = (outcome: CoachSpeechOutcome) => {
        if (this.pending.delete(resolve)) resolve(outcome);
      };
      // `speakResolvedCoachingText` fires `onDone` synchronously when it does
      // not speak, so the outcome cannot be closed over before it exists.
      let result: CoachSpeechOutcome | null = null;
      let doneFired = false;
      const outcome = speakResolvedCoachingText({
        text,
        language: request.language,
        muted: request.muted,
        synthesis,
        pickVoice: naturalVoicePicker,
        prosody: COACH_PROSODY[request.language],
        onDone: () => {
          doneFired = true;
          if (result) settle(result);
        },
        onUtteranceEnd: events?.onUtteranceEnd,
      });
      result = outcome;
      // Not spoken (or an already-settled fake): resolve now. When speech
      // starts, the utterance's onend/onerror resolves through `onDone`.
      if (doneFired || !outcome.spoken) settle(outcome);
    });
  }

  cancel(): void {
    // A cancelled voice settles its promise as not-spoken: callers waiting
    // on it learn it stopped, and no dangling promise outlives the utterance.
    // `speakResolvedCoachingText`'s own `onDone` becomes a no-op after this.
    this.pending.forEach((resolve) => resolve({ spoken: false, reason: "provider-unavailable" }));
    this.pending.clear();
    try {
      this.resolveSynthesis()?.cancel();
    } catch { /* already torn down */ }
  }

  private resolveSynthesis(): SpeechLike | null {
    if (this.synthesis !== undefined) return this.synthesis;
    return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  }
}

/**
 * Configuration for the server-proxied neural voice.
 *
 * Everything a vendor needs lives behind `endpoint`, on the app's own
 * origin, and the vendor credential lives server-side — never in the client,
 * never in this file, never in the repository. Until `enabled` is true and
 * `endpoint` is set, this provider reports itself unavailable and the
 * browser fallback carries the lesson.
 */
export type NeuralCoachSpeechConfig = {
  enabled: boolean;
  /**
   * Same-origin endpoint that accepts `{ messageKey, language, params }`
   * (see `CoachSpeechSynthesisRequest`) and returns audio bytes (e.g.
   * `audio/mpeg`). It resolves the key with the server's locale packs and
   * rejects any key not in `SPEAKABLE_COACH_KEYS` — it never accepts text.
   * Example: `"/api/coach-speech"`.
   */
  endpoint?: string;
  /** Languages the configured vendor voices cover. */
  languages?: readonly SupportedLanguageCode[];
};

type AudioLike = {
  src: string;
  play: () => Promise<void> | void;
  pause: () => void;
  onended: ((this: GlobalEventHandlers, ev: Event) => unknown) | null;
  onerror: ((this: GlobalEventHandlers, ev: Event) => unknown) | null;
};

/**
 * A natural neural teacher voice, served through the app's own backend.
 *
 * The client never talks to the TTS vendor and never sends text: it POSTs
 * the allowlisted key, and the endpoint resolves the sentence server-side.
 * If the endpoint is unconfigured, unreachable, or returns an error,
 * the outcome is `{spoken: false, reason: "provider-unavailable"}` and the
 * composite falls through to the browser voice — the lesson continues on
 * screen.
 */
export class ServerNeuralCoachSpeechProvider implements CoachSpeechProvider {
  readonly id = "server-neural";
  private current: AudioLike | null = null;
  /** Pending speaks, settled as not-spoken when `cancel()` runs. */
  private pending = new Set<(outcome: CoachSpeechOutcome) => void>();

  constructor(
    private config: NeuralCoachSpeechConfig,
    private fetchImpl: typeof fetch = fetch,
    private createAudio: () => AudioLike = () => new Audio(),
  ) {}

  canSpeak(language: SupportedLanguageCode): boolean {
    return (
      this.config.enabled === true &&
      typeof this.config.endpoint === "string" &&
      this.config.endpoint.length > 0 &&
      (this.config.languages ?? []).includes(language)
    );
  }

  async speak(request: CoachSpeechRequest, events?: CoachSpeechEvents): Promise<CoachSpeechOutcome> {
    if (!isSpeakableCoachKey(request.messageKey)) {
      return { spoken: false, reason: "not-speakable" };
    }
    if (!this.canSpeak(request.language)) {
      return { spoken: false, reason: "provider-unavailable" };
    }
    // Key-only on the wire: the endpoint resolves the sentence itself. A key
    // is meaningless without its language, and params travel so the server
    // can substitute them — it validates the key first, always.
    const body: CoachSpeechSynthesisRequest = {
      messageKey: request.messageKey,
      language: request.language,
      ...(request.params ? { params: request.params } : {}),
    };
    try {
      this.cancel();
      const response = await this.fetchImpl(this.config.endpoint as string, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) return { spoken: false, reason: "provider-unavailable" };
      const blob = await response.blob();
      const audio = this.createAudio();
      const url = URL.createObjectURL(blob);
      this.current = audio;
      return await new Promise<CoachSpeechOutcome>((resolve) => {
        this.pending.add(resolve);
        const settle = (outcome: CoachSpeechOutcome) => {
          if (!this.pending.delete(resolve)) return;
          URL.revokeObjectURL(url);
          if (this.current === audio) this.current = null;
          resolve(outcome);
        };
        audio.onended = () => {
          events?.onUtteranceEnd?.("end");
          settle({ spoken: true, voiceLang: request.language });
        };
        audio.onerror = () => {
          events?.onUtteranceEnd?.("error");
          settle({ spoken: false, reason: "provider-unavailable" });
        };
        audio.src = url;
        void Promise.resolve(audio.play()).catch(() => {
          events?.onUtteranceEnd?.("error");
          settle({ spoken: false, reason: "provider-unavailable" });
        });
      });
    } catch {
      return { spoken: false, reason: "provider-unavailable" };
    }
  }

  cancel(): void {
    this.pending.forEach((resolve) => resolve({ spoken: false, reason: "provider-unavailable" }));
    this.pending.clear();
    try {
      this.current?.pause();
    } catch { /* already torn down */ }
    this.current = null;
  }
}

export type CoachSpeechCapabilities = {
  language: SupportedLanguageCode;
  browser: { available: boolean; bestVoiceName: string | null };
  neural: { configured: boolean };
};

/**
 * What each teaching language can be spoken with right now. For settings UI,
 * diagnostics, and docs — a Pashto learner sees plainly that the browser has
 * no Pashto voice, rather than discovering it mid-lesson.
 */
export function detectCoachSpeechCapabilities(
  synthesis: SpeechLike | null | undefined,
  neuralConfig: NeuralCoachSpeechConfig,
  languages: readonly SupportedLanguageCode[],
): CoachSpeechCapabilities[] {
  const voices = synthesis?.getVoices() ?? [];
  const neural = new ServerNeuralCoachSpeechProvider(neuralConfig);
  return languages.map((language) => {
    const ranked = rankCoachVoices(voices, language);
    return {
      language,
      browser: { available: ranked.length > 0, bestVoiceName: ranked[0]?.name ?? null },
      neural: { configured: neural.canSpeak(language) },
    };
  });
}

export type CompositeCoachSpeechOptions = {
  synthesis?: SpeechLike | null;
  neural?: NeuralCoachSpeechConfig;
  /** Resolves speakable keys for the browser provider. Required to speak. */
  resolveText?: CoachSpeechTextResolver;
  /** Override order for tests; default is neural-then-browser. */
  providers?: CoachSpeechProvider[];
};

/**
 * The provider the lesson speaks through: neural voice when one is
 * configured for the language, the browser's voice next, and on-screen text
 * when neither can speak it. Order matters — a configured natural voice
 * should win over the robotic fallback — but availability always wins over
 * order: a provider that reports it cannot speak the language is skipped,
 * never substituted with a nearby language.
 */
export function createCoachSpeechProvider(options: CompositeCoachSpeechOptions = {}): CoachSpeechProvider {
  const providers: CoachSpeechProvider[] = options.providers ?? [
    new ServerNeuralCoachSpeechProvider(options.neural ?? { enabled: false }),
    new BrowserCoachSpeechProvider({ synthesis: options.synthesis, resolveText: options.resolveText }),
  ];
  return {
    id: "composite",
    async canSpeak(language: SupportedLanguageCode): Promise<boolean> {
      for (const provider of providers) {
        if (await provider.canSpeak(language)) return true;
      }
      return false;
    },
    async speak(request: CoachSpeechRequest, events?: CoachSpeechEvents): Promise<CoachSpeechOutcome> {
      for (const provider of providers) {
        if (!(await provider.canSpeak(request.language))) continue;
        const outcome = await provider.speak(request, events);
        // A provider that claimed availability but failed at speak time
        // (network blip, voice vanished) yields to the next one — except a
        // refusal, which is a policy decision, not an outage.
        if (outcome.spoken || outcome.reason === "not-speakable" || outcome.reason === "muted") return outcome;
      }
      return { spoken: false, reason: "no-voice" };
    },
    cancel(): void {
      for (const provider of providers) {
        try {
          provider.cancel();
        } catch { /* one provider's teardown must not trap the others */ }
      }
    },
  };
}
