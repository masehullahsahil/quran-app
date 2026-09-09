/**
 * The audio channel, as data.
 *
 * Two properties, and both of them are about not producing a wrong answer:
 *
 *  1. learner audio is never collected in a state where the app itself is
 *     audible — if it were, a recording of the Qari saying `رَبِّ` would be
 *     submitted as the learner's attempt at `رَبِّ`, and it would pass;
 *  2. every state a learner can be in has a sentence, so the interface never
 *     relies on a colour or an animation to say what is happening.
 */
import { describe, expect, it } from "vitest";
import {
  canCapture,
  isAppAudible,
  isRecoverable,
  MICROPHONE_FAILURE_KEYS,
  TUTOR_AUDIO_STATES,
  TUTOR_AUDIO_STATE_KEYS,
} from "./tutorAudioState";
import en from "@locales/en";

describe("the microphone and the speaker are never open at once", () => {
  it("collects only while it is the learner's turn", () => {
    expect(TUTOR_AUDIO_STATES.filter(canCapture)).toEqual(["learner-listening", "learner-speaking"]);
  });

  it("collects nothing while the app is making sound", () => {
    for (const state of TUTOR_AUDIO_STATES) {
      if (isAppAudible(state)) expect(canCapture(state), state).toBe(false);
    }
    expect(TUTOR_AUDIO_STATES.filter(isAppAudible)).toEqual(["app-speaking", "qari-playing"]);
  });

  it("collects nothing while an attempt is already with the server", () => {
    // What stops one turn being submitted twice, and a second turn overlapping
    // the first.
    expect(canCapture("checking")).toBe(false);
  });

  it("collects nothing when the lesson has stopped or been lost", () => {
    for (const state of ["idle", "paused", "microphone-unavailable", "session-lost", "waiting"] as const) {
      expect(canCapture(state), state).toBe(false);
    }
  });

  it("marks the two states the lesson cannot continue from", () => {
    expect(TUTOR_AUDIO_STATES.filter((state) => !isRecoverable(state)))
      .toEqual(["microphone-unavailable", "session-lost"]);
  });
});

describe("every audio state is text", () => {
  it("names a sentence for each one", () => {
    for (const state of TUTOR_AUDIO_STATES) {
      const key = TUTOR_AUDIO_STATE_KEYS[state];
      expect(key, state).toBeTruthy();
      expect(en.strings[key], state).toBeTruthy();
    }
  });

  it("gives each state its own sentence rather than reusing one", () => {
    const sentences = TUTOR_AUDIO_STATES.map((state) => en.strings[TUTOR_AUDIO_STATE_KEYS[state]]);
    expect(new Set(sentences).size).toBe(TUTOR_AUDIO_STATES.length);
  });

  it("explains every way the microphone can fail", () => {
    for (const [failure, key] of Object.entries(MICROPHONE_FAILURE_KEYS)) {
      const sentence = en.strings[key];
      expect(sentence, failure).toBeTruthy();
      // The fallback is named as what it is. A manual recording flow is not
      // hands-free and must never be described as though it were.
      expect(sentence!.toLowerCase(), failure).not.toContain("hands-free");
    }
  });
});
