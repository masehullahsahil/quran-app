/**
 * Local voice-activity detection, as a pure state machine.
 *
 * This is the part of the hands-free lesson that decides *when the learner has
 * stopped talking*. It is deliberately the only thing it decides.
 *
 * **It knows nothing about the Quran.** It never sees a word, a transcript, an
 * ayah or a target; it sees a stream of audio levels and timestamps and reports
 * silence, speech and duration. Every judgement about what was recited — a
 * missed word, a recognised target, whether an ayah may be counted — belongs to
 * the server, and none of it can be reached from this file. Segmenting audio
 * and grading a recitation are different jobs, and only the first one is here.
 *
 * It is a pure reducer for a reason. Turn boundaries are the kind of thing that
 * is impossible to test through a microphone and trivial to test as data: the
 * hook in `useVoiceActivity.ts` owns the Web Audio plumbing, feeds samples in
 * here, and this file can then be driven frame by frame in a test with exact
 * timings. A defect in "a waqf pause ended my turn" is a defect in this file,
 * and it is reproducible.
 *
 * ## The thresholds, and why they are what they are
 *
 * Quran recitation is not conversational speech. A learner breathes at a waqf,
 * holds a madd, and stops deliberately at the end of a phrase. Speech VAD tuned
 * for dictation cuts all three off. So every default here is biased towards
 * *waiting longer*: the cost of waiting an extra second is that the teacher
 * answers a beat late, and the cost of finalising early is that a learner is
 * interrupted mid-ayah by their own tool. Those are not comparable.
 *
 * These are engineering defaults chosen to be conservative for this use. They
 * are not a validated model of recitation prosody, and nothing here should be
 * described as one.
 */

export type VoiceActivityConfig = {
  /**
   * How often a level sample is expected, in milliseconds.
   *
   * Only used to bound how much time one sample may account for, so a tab that
   * was backgrounded for ten seconds does not arrive as ten seconds of
   * "silence" and end a turn the learner was in the middle of.
   */
  frameMs: number;
  /** The largest gap a single sample may be credited with. See `frameMs`. */
  maxFrameGapMs: number;
  /**
   * How long voiced audio must persist before the turn counts as started.
   *
   * A door closing is louder than a learner and lasts 40ms. This is what stops
   * it from opening a turn.
   */
  speechConfirmMs: number;
  /**
   * Total voiced time required before a turn may finalise at all.
   *
   * Below this there is nothing worth sending: a cough, a chair, a half word.
   * The turn stays open and keeps waiting instead of submitting silence.
   */
  minSpeechMs: number;
  /**
   * Silence up to this length is part of reciting, not the end of it.
   *
   * Nothing finalises inside this window. It is reported — the tutor engine
   * accepts a `short-silence` timing event — but reporting it changes no
   * capture state.
   */
  shortPauseMs: number;
  /**
   * Sustained silence that ends the learner's turn.
   *
   * Set well beyond an ordinary waqf. A learner pausing for breath between
   * `ٱلْحَمْدُ لِلَّهِ` and `رَبِّ ٱلْعَـٰلَمِينَ` routinely exceeds a second, so a
   * conversational 800ms end-of-utterance threshold would cut a single ayah
   * into three turns.
   */
  endOfTurnSilenceMs: number;
  /**
   * The absolute cap on one turn.
   *
   * A safety condition, not a teaching one: a microphone that never hears
   * silence (a fan, a stuck gain) must not record forever, and a very long ayah
   * still has to fit. Reaching it finalises whatever was captured.
   */
  maxTurnMs: number;
  /**
   * How long to wait for a learner who has not started at all.
   *
   * Reported so the lesson can say something gentle. It never finalises: an
   * empty recording is not an attempt.
   */
  leadInSilenceMs: number;
  /** Multiplier on the adapted noise floor for the speech-on threshold. */
  enterRatio: number;
  /** Multiplier on the adapted noise floor for the speech-off threshold. */
  exitRatio: number;
  /** Absolute headroom added to the speech-on threshold. */
  enterMargin: number;
  /** Absolute headroom added to the speech-off threshold. Lower: hysteresis. */
  exitMargin: number;
  /**
   * How fast the noise floor follows the room *downwards*.
   *
   * Fast, because a room going quiet should be believed immediately: a learner
   * who moves somewhere still must be heard on their next breath.
   */
  floorFallAlpha: number;
  /**
   * How fast it follows the room *upwards*.
   *
   * Much slower, and asymmetric on purpose. A steady hum — a fan, a road, a
   * refrigerator — sits above the initial floor and would otherwise read as one
   * continuous turn of speech that never ends, so the floor has to be able to
   * climb onto it. But a learner's own voice is also above the floor, and a
   * floor that chased it would raise the bar until they fell under it
   * mid-ayah. Slow rise plus `maxNoiseFloor` is what makes both true at once.
   */
  floorRiseAlpha: number;
  /** The floor is never allowed below this, so a silent line cannot trip. */
  minNoiseFloor: number;
  /**
   * Nor above this.
   *
   * The hard guarantee that a long turn cannot talk the detector into deafness:
   * however loud the room, the speech-off threshold stays at
   * `maxNoiseFloor * exitRatio + exitMargin`, and an ordinary speaking level
   * sits above it.
   */
  maxNoiseFloor: number;
};

/**
 * The defaults, in one place.
 *
 * Nothing in the UI or the hooks may hard-code a threshold. If a number about
 * timing or loudness appears anywhere else in the hands-free path, it is a bug:
 * these are the settings, they are named, and they are documented above.
 */
export const VOICE_ACTIVITY_DEFAULTS: VoiceActivityConfig = {
  frameMs: 50,
  maxFrameGapMs: 250,
  speechConfirmMs: 120,
  minSpeechMs: 400,
  shortPauseMs: 700,
  endOfTurnSilenceMs: 1800,
  maxTurnMs: 45_000,
  leadInSilenceMs: 12_000,
  enterRatio: 1.9,
  exitRatio: 1.35,
  enterMargin: 0.012,
  exitMargin: 0.006,
  floorFallAlpha: 0.05,
  floorRiseAlpha: 0.00625,
  minNoiseFloor: 0.002,
  maxNoiseFloor: 0.09,
};

/**
 * A word-scoped turn is one word long.
 *
 * The same conservatism would keep the microphone open for two seconds after a
 * learner says `رَبِّ`, which reads as the teacher not noticing. So the word
 * scope shortens the *silence* thresholds only — the loudness thresholds, the
 * noise floor and the minimum speech duration are unchanged, because those are
 * about the room and the learner, not about how much they were asked to say.
 */
export const WORD_SCOPE_OVERRIDES: Partial<VoiceActivityConfig> = {
  shortPauseMs: 450,
  endOfTurnSilenceMs: 1100,
  maxTurnMs: 12_000,
  leadInSilenceMs: 9_000,
};

export function voiceActivityConfigFor(scope: "word" | "ayah", base: VoiceActivityConfig = VOICE_ACTIVITY_DEFAULTS): VoiceActivityConfig {
  return scope === "word" ? { ...base, ...WORD_SCOPE_OVERRIDES } : { ...base };
}

/** Where the detector is within one turn. */
export type VoiceActivityPhase =
  /** Not collecting. */
  | "idle"
  /** Collecting, and the learner has not begun. */
  | "waiting"
  /** The learner is speaking. */
  | "speaking"
  /** The learner has stopped, but not for long enough to mean anything. */
  | "pausing"
  /** The turn is over. Nothing further is emitted until it is armed again. */
  | "ended";

/**
 * What the detector reports.
 *
 * Two of these end a turn (`turn-ended`, `max-turn`) and the rest are
 * information. None of them is a statement about the recitation.
 */
export type VoiceActivityEvent =
  | "speech-started"
  | "short-silence"
  | "prolonged-silence"
  | "no-speech-yet"
  | "turn-ended"
  | "max-turn";

/** The two events that close a turn, so a caller never has to guess. */
export const FINALISING_EVENTS: readonly VoiceActivityEvent[] = ["turn-ended", "max-turn"];

export function isFinalising(event: VoiceActivityEvent): boolean {
  return FINALISING_EVENTS.includes(event);
}

export type VoiceActivityState = {
  phase: VoiceActivityPhase;
  config: VoiceActivityConfig;
  /** The adapted room level. Exposed for diagnostics, never for a judgement. */
  noiseFloor: number;
  /** Milliseconds of voiced audio in this turn. */
  voicedMs: number;
  /** Milliseconds since the turn was armed. */
  elapsedMs: number;
  /** Milliseconds of continuous silence right now. 0 while speaking. */
  silenceMs: number;
  /** Milliseconds of continuous voiced audio right now. 0 while silent. */
  voicingMs: number;
  /** The timestamp of the last sample, so gaps can be measured. */
  lastSampleAtMs: number | null;
  /** Each of these is announced at most once per turn. */
  announced: {
    speechStarted: boolean;
    shortSilence: boolean;
    prolongedSilence: boolean;
    noSpeechYet: boolean;
  };
};

export function createVoiceActivityState(config: VoiceActivityConfig = VOICE_ACTIVITY_DEFAULTS): VoiceActivityState {
  return {
    phase: "idle",
    config,
    noiseFloor: config.minNoiseFloor,
    voicedMs: 0,
    elapsedMs: 0,
    silenceMs: 0,
    voicingMs: 0,
    lastSampleAtMs: null,
    announced: { speechStarted: false, shortSilence: false, prolongedSilence: false, noSpeechYet: false },
  };
}

/**
 * Begin a turn.
 *
 * The noise floor is carried across turns on purpose: the room does not change
 * between the learner reciting an ayah and repeating one word, and re-learning
 * it from scratch every turn would make the first second of each turn the least
 * reliable one.
 */
export function armVoiceActivity(state: VoiceActivityState, config: VoiceActivityConfig = state.config): VoiceActivityState {
  return {
    ...createVoiceActivityState(config),
    noiseFloor: clamp(state.noiseFloor, config.minNoiseFloor, config.maxNoiseFloor),
    phase: "waiting",
  };
}

/** Stop collecting. Nothing is emitted from an idle detector. */
export function disarmVoiceActivity(state: VoiceActivityState): VoiceActivityState {
  return { ...state, phase: "idle", silenceMs: 0, voicingMs: 0 };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** The speech-on threshold for the current room. */
export function enterThreshold(state: VoiceActivityState): number {
  return state.noiseFloor * state.config.enterRatio + state.config.enterMargin;
}

/** The speech-off threshold. Always below the speech-on one — hysteresis. */
export function exitThreshold(state: VoiceActivityState): number {
  return state.noiseFloor * state.config.exitRatio + state.config.exitMargin;
}

export type VoiceActivitySample = {
  /** Normalised RMS level of the frame, 0..1. */
  level: number;
  /** Monotonic timestamp of the frame, in milliseconds. */
  atMs: number;
};

export type VoiceActivityStep = {
  state: VoiceActivityState;
  /** In order. A step may produce none, one, or two events. */
  events: VoiceActivityEvent[];
};

/**
 * Advance the detector by one audio frame.
 *
 * The whole hands-free turn boundary is this function. Read in order:
 *
 *  1. an idle or ended detector consumes the sample and says nothing — this is
 *     what makes a duplicate stop harmless;
 *  2. the elapsed time is bounded by `maxFrameGapMs`, so a stalled tab cannot
 *     manufacture silence;
 *  3. the noise floor follows the room, but only while the frame is quiet;
 *  4. speech is confirmed by duration, not by a single loud frame;
 *  5. silence finalises only once it has lasted `endOfTurnSilenceMs` *and* the
 *     turn holds at least `minSpeechMs` of voiced audio.
 */
export function observeAudioLevel(state: VoiceActivityState, sample: VoiceActivitySample): VoiceActivityStep {
  if (state.phase === "idle" || state.phase === "ended") {
    return { state: { ...state, lastSampleAtMs: sample.atMs }, events: [] };
  }

  const { config } = state;
  const gap = state.lastSampleAtMs === null
    ? config.frameMs
    : clamp(sample.atMs - state.lastSampleAtMs, 0, config.maxFrameGapMs);

  const level = Number.isFinite(sample.level) ? Math.max(0, sample.level) : 0;
  const speaking = state.phase === "speaking";
  // Hysteresis: it takes more to start being heard than to go on being heard.
  const threshold = speaking ? exitThreshold(state) : enterThreshold(state);
  const voiced = level > threshold;

  // The floor follows the room down quickly and up slowly. Both directions
  // matter: without the rise, a steady hum above the initial floor reads as one
  // endless turn of speech; without the asymmetry, a learner's own voice drags
  // the bar up until they fall under it. `maxNoiseFloor` bounds the rise.
  const floorAlpha = level < state.noiseFloor ? config.floorFallAlpha : config.floorRiseAlpha;
  const noiseFloor = clamp(
    state.noiseFloor + (level - state.noiseFloor) * floorAlpha,
    config.minNoiseFloor,
    config.maxNoiseFloor,
  );

  const next: VoiceActivityState = {
    ...state,
    noiseFloor,
    lastSampleAtMs: sample.atMs,
    elapsedMs: state.elapsedMs + gap,
    voicedMs: voiced ? state.voicedMs + gap : state.voicedMs,
    voicingMs: voiced ? state.voicingMs + gap : 0,
    silenceMs: voiced ? 0 : state.silenceMs + gap,
    announced: { ...state.announced },
  };

  const events: VoiceActivityEvent[] = [];

  if (voiced) {
    // A loud frame does not open a turn; a loud frame that persists does.
    if (next.voicingMs >= config.speechConfirmMs) {
      next.phase = "speaking";
      if (!next.announced.speechStarted) {
        next.announced.speechStarted = true;
        events.push("speech-started");
      }
      // A new pause after this one gets its own announcement.
      next.announced.shortSilence = false;
      next.announced.prolongedSilence = false;
    }
  } else {
    if (next.phase === "speaking") next.phase = "pausing";

    if (next.announced.speechStarted) {
      if (next.silenceMs >= config.shortPauseMs && !next.announced.shortSilence) {
        next.announced.shortSilence = true;
        events.push("short-silence");
      }
      if (next.silenceMs >= config.endOfTurnSilenceMs) {
        if (next.voicedMs >= config.minSpeechMs) {
          next.phase = "ended";
          events.push("turn-ended");
          return { state: next, events };
        }
        // Long silence, but nothing worth sending. Say so and keep waiting;
        // an empty recording is not an attempt.
        if (!next.announced.prolongedSilence) {
          next.announced.prolongedSilence = true;
          events.push("prolonged-silence");
        }
      }
    } else if (next.elapsedMs >= config.leadInSilenceMs && !next.announced.noSpeechYet) {
      next.announced.noSpeechYet = true;
      events.push("no-speech-yet");
    }
  }

  if (next.elapsedMs >= config.maxTurnMs) {
    next.phase = "ended";
    events.push("max-turn");
  }

  return { state: next, events };
}

/**
 * The level of one analyser frame, as a normalised RMS.
 *
 * Split out from the hook so the arithmetic is testable without an
 * `AudioContext`: given a byte-domain buffer, this is what the detector sees.
 * `AnalyserNode.getByteTimeDomainData` centres silence on 128.
 */
export function frameLevel(samples: Uint8Array | number[]): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centred = (samples[index] - 128) / 128;
    sum += centred * centred;
  }
  return Math.sqrt(sum / samples.length);
}
