/**
 * Turn boundaries, driven frame by frame.
 *
 * This is the part of hands-free that cannot be checked by looking at it. "Does
 * a waqf pause end my turn?" is a question about milliseconds and thresholds,
 * and the only honest way to answer it is to feed the detector a second and a
 * half of silence at 50ms resolution and see what it says.
 *
 * These are deterministic simulations. They are not a microphone test: no real
 * voice, no real room, no real device. What they establish is that the rules
 * are the rules — a short pause does nothing, a long one ends the turn exactly
 * once, and a burst of noise too short to be speech opens nothing.
 */
import { describe, expect, it } from "vitest";
import {
  armVoiceActivity,
  createVoiceActivityState,
  disarmVoiceActivity,
  enterThreshold,
  exitThreshold,
  frameLevel,
  isFinalising,
  observeAudioLevel,
  VOICE_ACTIVITY_DEFAULTS,
  voiceActivityConfigFor,
  WORD_SCOPE_OVERRIDES,
  type VoiceActivityEvent,
  type VoiceActivityState,
} from "./voiceActivity";

const QUIET = 0.001;
const VOICE = 0.2;

/**
 * Play `ms` of audio at one level into the detector, one frame at a time.
 *
 * The clock is carried in the caller's `at`, so a sequence of runs is one
 * continuous timeline — which is what makes "700ms of silence then more speech"
 * a thing that can be written down.
 */
function run(state: VoiceActivityState, level: number, ms: number, at: number) {
  const events: VoiceActivityEvent[] = [];
  const frame = state.config.frameMs;
  let clock = at;
  let current = state;
  for (let elapsed = 0; elapsed < ms; elapsed += frame) {
    clock += frame;
    const step = observeAudioLevel(current, { level, atMs: clock });
    current = step.state;
    events.push(...step.events);
  }
  return { state: current, events, at: clock };
}

function armed(config = VOICE_ACTIVITY_DEFAULTS) {
  return armVoiceActivity(createVoiceActivityState(config), config);
}

describe("the thresholds are one documented set", () => {
  it("waits far longer than a conversational end-of-utterance", () => {
    // The whole reason this module exists. A learner breathing between
    // `ٱلْحَمْدُ لِلَّهِ` and `رَبِّ ٱلْعَـٰلَمِينَ` must not be cut off, so the
    // end-of-turn threshold is well past the pause that would end a dictation.
    expect(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs).toBeGreaterThanOrEqual(1500);
    expect(VOICE_ACTIVITY_DEFAULTS.shortPauseMs).toBeLessThan(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs);
    expect(VOICE_ACTIVITY_DEFAULTS.minSpeechMs).toBeLessThan(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs);
    expect(VOICE_ACTIVITY_DEFAULTS.maxTurnMs).toBeGreaterThan(VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs * 4);
  });

  it("shortens only the silences for a one-word turn", () => {
    const word = voiceActivityConfigFor("word");
    const ayah = voiceActivityConfigFor("ayah");

    expect(word.endOfTurnSilenceMs).toBeLessThan(ayah.endOfTurnSilenceMs);
    expect(word.maxTurnMs).toBeLessThan(ayah.maxTurnMs);
    // The room and the learner have not changed, so nothing about loudness or
    // the minimum amount of speech does either.
    expect(word.minSpeechMs).toBe(ayah.minSpeechMs);
    expect(word.enterRatio).toBe(ayah.enterRatio);
    expect(word.enterMargin).toBe(ayah.enterMargin);
    expect(Object.keys(WORD_SCOPE_OVERRIDES).sort()).toEqual(
      ["endOfTurnSilenceMs", "leadInSilenceMs", "maxTurnMs", "shortPauseMs"],
    );
  });

  it("takes more to start being heard than to go on being heard", () => {
    const state = armed();
    expect(enterThreshold(state)).toBeGreaterThan(exitThreshold(state));
  });
});

describe("speech start", () => {
  it("reports the learner starting, once", () => {
    const start = armed();
    const spoken = run(start, VOICE, 600, 0);

    expect(spoken.events.filter((event) => event === "speech-started")).toHaveLength(1);
    expect(spoken.state.phase).toBe("speaking");
  });

  it("does not open a turn on a noise too short to be speech", () => {
    const start = armed();
    // 60ms of loud, under the 120ms confirmation. A door, not a learner.
    const blip = run(start, VOICE, 60, 0);
    expect(blip.events).toEqual([]);
    expect(blip.state.phase).toBe("waiting");
  });

  it("says nothing at all before the learner begins", () => {
    const quiet = run(armed(), QUIET, 3_000, 0);
    expect(quiet.events).toEqual([]);
  });

  it("mentions a learner who has not begun after a long wait, without finalising", () => {
    const quiet = run(armed(), QUIET, VOICE_ACTIVITY_DEFAULTS.leadInSilenceMs + 500, 0);
    expect(quiet.events).toEqual(["no-speech-yet"]);
    expect(quiet.state.phase).not.toBe("ended");
  });
});

describe("pauses inside recitation", () => {
  it("does not finalise on a pause for breath", () => {
    const spoken = run(armed(), VOICE, 1_000, 0);
    const pause = run(spoken.state, QUIET, VOICE_ACTIVITY_DEFAULTS.shortPauseMs + 100, spoken.at);

    expect(pause.events).toContain("short-silence");
    expect(pause.events).not.toContain("turn-ended");
    expect(pause.state.phase).toBe("pausing");
  });

  it("carries the same turn through a pause and back into speech", () => {
    const first = run(armed(), VOICE, 900, 0);
    const pause = run(first.state, QUIET, 900, first.at);
    const second = run(pause.state, VOICE, 900, pause.at);
    const finish = run(second.state, QUIET, VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 200, second.at);

    // One turn, not three: the pause in the middle produced no ending.
    expect(pause.events).not.toContain("turn-ended");
    expect(second.events).not.toContain("turn-ended");
    expect(finish.events.filter((event) => event === "turn-ended")).toHaveLength(1);
    expect(finish.state.voicedMs).toBeGreaterThan(1_500);
  });

  it("announces a second pause as well as the first", () => {
    const first = run(armed(), VOICE, 700, 0);
    const pauseOne = run(first.state, QUIET, 800, first.at);
    const second = run(pauseOne.state, VOICE, 700, pauseOne.at);
    const pauseTwo = run(second.state, QUIET, 800, second.at);

    expect(pauseOne.events).toContain("short-silence");
    expect(pauseTwo.events).toContain("short-silence");
  });
});

describe("the end of a turn", () => {
  it("finalises exactly once on sustained silence", () => {
    const spoken = run(armed(), VOICE, 1_200, 0);
    const silence = run(spoken.state, QUIET, VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 1_000, spoken.at);

    expect(silence.events.filter((event) => event === "turn-ended")).toHaveLength(1);
    expect(silence.state.phase).toBe("ended");
  });

  it("says nothing more once the turn has ended", () => {
    const spoken = run(armed(), VOICE, 1_200, 0);
    const ended = run(spoken.state, QUIET, VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 200, spoken.at);
    const after = run(ended.state, VOICE, 4_000, ended.at);

    // An ended detector is inert. This is what makes a stale frame arriving
    // after a server interruption harmless.
    expect(after.events).toEqual([]);
  });

  it("does not finalise on silence when there was nothing worth sending", () => {
    // 200ms of speech, below the 400ms minimum, then a long silence.
    const blip = run(armed(), VOICE, 200, 0);
    const silence = run(blip.state, QUIET, VOICE_ACTIVITY_DEFAULTS.endOfTurnSilenceMs + 600, blip.at);

    expect(silence.events).not.toContain("turn-ended");
    expect(silence.events).toContain("prolonged-silence");
    expect(silence.state.phase).not.toBe("ended");
  });

  it("stops at the safety cap even where silence never comes", () => {
    const loud = run(armed(), VOICE, VOICE_ACTIVITY_DEFAULTS.maxTurnMs + 500, 0);
    expect(loud.events.filter((event) => event === "max-turn")).toHaveLength(1);
    expect(loud.state.phase).toBe("ended");
  });

  it("names both ways a turn can close", () => {
    expect(isFinalising("turn-ended")).toBe(true);
    expect(isFinalising("max-turn")).toBe(true);
    expect(isFinalising("short-silence")).toBe(false);
    expect(isFinalising("speech-started")).toBe(false);
  });

  it("ends a word turn sooner than an ayah turn on the same audio", () => {
    const spoken = (scope: "word" | "ayah") => {
      const config = voiceActivityConfigFor(scope);
      const voice = run(armVoiceActivity(createVoiceActivityState(config), config), VOICE, 700, 0);
      return run(voice.state, QUIET, 1_300, voice.at);
    };

    expect(spoken("word").events).toContain("turn-ended");
    expect(spoken("ayah").events).not.toContain("turn-ended");
  });
});

describe("the room", () => {
  it("climbs onto a steady hum instead of hearing it as endless speech", () => {
    // A fan, a road, a refrigerator. It starts out above the initial floor, so
    // the first turn in that room does mistake it for a voice — there is no
    // way to know otherwise. What must not happen is that it goes on doing so.
    const noisy = run(armed(), 0.03, 6_000, 0);
    expect(noisy.state.noiseFloor).toBeGreaterThan(VOICE_ACTIVITY_DEFAULTS.minNoiseFloor);
    expect(enterThreshold(noisy.state)).toBeGreaterThan(0.03);
  });

  it("hears the learner over a room it has already measured", () => {
    // The reason `armVoiceActivity` carries the floor across turns: by the
    // second turn the room is known, and the hum is silence.
    const noisy = run(armed(), 0.03, 6_000, 0);
    const nextTurn = armVoiceActivity(noisy.state);

    const hum = run(nextTurn, 0.03, 3_000, noisy.at);
    expect(hum.events).toEqual([]);

    const learner = run(hum.state, 0.3, 800, hum.at);
    expect(learner.events).toContain("speech-started");
  });

  it("never lets the floor rise far enough to make a learner inaudible", () => {
    const roar = run(armed(), 0.9, 20_000, 0);
    expect(roar.state.noiseFloor).toBeLessThanOrEqual(VOICE_ACTIVITY_DEFAULTS.maxNoiseFloor);
  });

  it("does not manufacture silence out of a stalled tab", () => {
    const spoken = run(armed(), VOICE, 1_000, 0);
    // One frame arriving ten seconds late: the tab was backgrounded. It may
    // account for at most `maxFrameGapMs`, so it cannot end the turn by itself.
    const late = observeAudioLevel(spoken.state, { level: QUIET, atMs: spoken.at + 10_000 });
    expect(late.events).not.toContain("turn-ended");
    expect(late.state.silenceMs).toBeLessThanOrEqual(VOICE_ACTIVITY_DEFAULTS.maxFrameGapMs);
  });
});

describe("arming and disarming", () => {
  it("keeps the room's level across turns but nothing else", () => {
    const noisy = run(armed(), 0.02, 3_000, 0);
    const spoken = run(noisy.state, VOICE, 900, noisy.at);
    const next = armVoiceActivity(spoken.state);

    expect(next.noiseFloor).toBeCloseTo(spoken.state.noiseFloor, 6);
    expect(next.voicedMs).toBe(0);
    expect(next.elapsedMs).toBe(0);
    expect(next.announced.speechStarted).toBe(false);
    expect(next.phase).toBe("waiting");
  });

  it("says nothing from an idle detector", () => {
    const idle = disarmVoiceActivity(armed());
    const loud = run(idle, VOICE, 5_000, 0);
    expect(loud.events).toEqual([]);
  });
});

describe("the level of one frame", () => {
  it("reads centred silence as nothing", () => {
    expect(frameLevel(new Uint8Array(64).fill(128))).toBe(0);
  });

  it("grows with the amplitude of the frame", () => {
    const quiet = frameLevel([128, 130, 128, 126]);
    const loud = frameLevel([128, 200, 128, 56]);
    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeLessThanOrEqual(1);
  });

  it("reads an empty buffer as nothing rather than dividing by zero", () => {
    expect(frameLevel([])).toBe(0);
  });
});

describe("hysteresis after a pause", () => {
  it("needs confident speech to resume a paused turn, and pins that rule", () => {
    // Characterisation, not a judgement: once the detector has dropped to
    // "pausing", a resumption below the *enter* threshold does not reset the
    // silence clock — only sustained speech above it re-opens "speaking".
    // Whether the enter threshold is the right height for soft speech on real
    // devices is a calibration question for device validation; this pins the
    // rule so any re-tuning is deliberate.
    const spoken = run(armed(), VOICE, 1_000, 0);
    const pause = run(spoken.state, QUIET, 900, spoken.at);
    expect(pause.state.phase).toBe("pausing");
    const silenceAtPause = pause.state.silenceMs;

    const enter = enterThreshold(pause.state);
    const exit = exitThreshold(pause.state);
    expect(enter).toBeGreaterThan(exit);

    // Audible, but below the re-entry bar: the silence clock keeps running.
    const soft = run(pause.state, (enter + exit) / 2, 500, pause.at);
    expect(soft.state.phase).toBe("pausing");
    expect(soft.state.silenceMs).toBeGreaterThan(silenceAtPause);
    expect(soft.events).not.toContain("turn-ended");

    // Sustained speech above the enter bar: the turn resumes.
    const resumed = run(soft.state, enter * 2 + 0.02, 300, soft.at);
    expect(resumed.state.phase).toBe("speaking");
    expect(resumed.state.silenceMs).toBe(0);
  });
});
