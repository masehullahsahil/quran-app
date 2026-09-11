/**
 * The lesson's shape, as data.
 *
 * Two properties these hold above all. A teacher says one short thing at a
 * time, so every state maps to exactly one sentence and no state offers a wall
 * of buttons. And the app never claims more than it knows: nothing in this
 * vocabulary asserts that a pronunciation, a makhraj or a tajwid rule was
 * correct, and an attempt the engine could not judge produces no accusation.
 */
import { describe, expect, it } from "vitest";
import {
  describeTutorView,
  TUTOR_INTENTS,
  TUTOR_INTENT_LABEL_KEYS,
  TUTOR_STATES,
  TUTOR_VOICE_INTENTS,
  TUTOR_VOICE_STATUS,
  type TutorSessionView,
  type TutorState,
} from "./tutorConversation";
import en from "@locales/en";

const target = { arabic: "رَبِّ", wordIndex: 3, totalWords: 4 };

const view = (state: TutorState, patch: Partial<TutorSessionView> = {}): TutorSessionView => ({
  state,
  canHearWord: true,
  canHearAyah: true,
  ...patch,
});

describe("the teacher says one short thing", () => {
  it.each(TUTOR_STATES.map((state) => [state]))("has one sentence for %s", (state) => {
    const message = describeTutorView(view(state)).messageKey;
    expect(en.strings[message], message).toBeTruthy();
    expect(message.startsWith("tutor."), message).toBe(true);
  });

  it("keeps every sentence short enough to read from arm's length", () => {
    for (const state of TUTOR_STATES) {
      const sentence = en.strings[describeTutorView(view(state, { target })).messageKey]!;
      // A teacher's aside, not a paragraph: one sentence, well under a line of
      // prose. The chatbot failure mode is a wall of text during recitation.
      expect(sentence.length, state).toBeLessThanOrEqual(60);
      expect(sentence.split(/[.!?؟۔]/).filter((part) => part.trim().length > 0).length, state).toBeLessThanOrEqual(2);
    }
  });

  it("never claims the recitation was pronounced correctly", () => {
    for (const state of TUTOR_STATES) {
      const sentence = en.strings[describeTutorView(view(state, { target })).messageKey]!.toLowerCase();
      for (const claim of ["pronunciation", "pronounced", "makhraj", "tajwid", "tajweed", "perfect", "correct"]) {
        expect(sentence, `${state}/${claim}`).not.toContain(claim);
      }
    }
  });

  it("says it heard the word, which is all it knows", () => {
    expect(en.strings["tutor.wordRecognised"]!.toLowerCase()).toContain("heard");
  });

  it("makes no accusation when it could not tell", () => {
    const uncertain = describeTutorView(view("uncertain", { target }));
    const sentence = en.strings[uncertain.messageKey]!.toLowerCase();
    for (const claim of ["wrong", "incorrect", "mistake", "error", "missed"]) {
      expect(sentence, claim).not.toContain(claim);
    }
    // And it does not present the word as an outstanding error either — nor
    // as a success, which would be a result nobody reached.
    expect(uncertain.targetUnresolved).toBe(false);
    expect(uncertain.targetTone).toBe("neutral");
  });
});

describe("the learner is never shown ten buttons", () => {
  it.each(TUTOR_STATES.map((state) => [state]))("offers at most three things in %s", (state) => {
    const controls = describeTutorView(view(state, { hintAvailable: true })).controls;
    expect(controls.length, state).toBeLessThanOrEqual(3);
  });

  it("marks exactly one control primary, when there is one at all", () => {
    for (const state of TUTOR_STATES) {
      const controls = describeTutorView(view(state)).controls;
      if (controls.length === 0) continue;
      expect(controls.filter((control) => control.primary).length, state).toBe(1);
      expect(controls[0].primary, state).toBe(true);
    }
  });

  it("offers nothing to press while the teacher is checking", () => {
    expect(describeTutorView(view("checking")).controls).toEqual([]);
  });

  it("offers the context-sensitive set the moment asks for", () => {
    const correction = describeTutorView(view("correction")).controls.map((control) => control.intent);
    expect(correction).toEqual(["hear-word", "again", "hear-ayah"]);

    const listening = describeTutorView(view("listening")).controls.map((control) => control.intent);
    expect(listening).toEqual(["pause", "from-beginning"]);

    const paused = describeTutorView(view("paused")).controls.map((control) => control.intent);
    expect(paused).toEqual(["resume", "stop"]);

    const complete = describeTutorView(view("complete")).controls.map((control) => control.intent);
    expect(complete).toEqual(["continue", "stop"]);
  });

  it("does not offer a word to hear when there is no trustworthy recording of it", () => {
    const controls = describeTutorView(view("correction", { canHearWord: false })).controls.map((c) => c.intent);
    expect(controls).not.toContain("hear-word");
    expect(controls[0]).toBe("again");
  });

  it("offers a hint only where a learner is stuck, never mid-recitation", () => {
    const stuck = ["correction", "uncertain", "recite-ayah"] as const;
    for (const state of stuck) {
      expect(describeTutorView(view(state, { hintAvailable: true })).controls.map((c) => c.intent), state).toContain("hint");
    }
    for (const state of ["listening", "checking", "ready"] as const) {
      expect(describeTutorView(view(state, { hintAvailable: true })).controls.map((c) => c.intent), state).not.toContain("hint");
    }
  });

  it("has real wording for every control it can show", () => {
    for (const intent of TUTOR_INTENTS) {
      const key = TUTOR_INTENT_LABEL_KEYS[intent];
      expect(en.strings[key], intent).toBeTruthy();
      // A button label, not a sentence.
      expect(en.strings[key]!.length, intent).toBeLessThanOrEqual(24);
    }
  });
});

describe("whose turn it is", () => {  it("gives the learner the turn whenever the teacher is not speaking", () => {
    for (const state of ["ready", "listening", "recite-ayah", "paused"] as const) {
      expect(describeTutorView(view(state)).turn, state).toBe("learner");
    }
    for (const state of ["checking", "correction", "word-recognised", "hint", "uncertain", "complete", "stopped"] as const) {
      expect(describeTutorView(view(state)).turn, state).toBe("teacher");
    }
  });

  it("names what the app is doing, in a word", () => {
    expect(describeTutorView(view("listening")).presence).toBe("listening");
    expect(describeTutorView(view("checking")).presence).toBe("thinking");
    expect(describeTutorView(view("ready")).presence).toBe("waiting");
  });
});

/* ------------------------------------------- the resolved-word rule (§9) */

describe("a word that came through stops being the problem", () => {
  it("treats the target as unresolved only while it still is", () => {
    expect(describeTutorView(view("correction", { target })).targetUnresolved).toBe(true);
    expect(describeTutorView(view("hint", { target })).targetUnresolved).toBe(true);

    // The engine has said it heard the word. Nothing may go on presenting it as
    // an outstanding error underneath a sentence that says the opposite.
    expect(describeTutorView(view("word-recognised", { target })).targetUnresolved).toBe(false);
    expect(describeTutorView(view("recite-ayah", { target })).targetUnresolved).toBe(false);
  });

  it("makes the whole ayah the dominant next action once it has", () => {
    for (const state of ["word-recognised", "recite-ayah"] as const) {
      const result = describeTutorView(view(state, { target }));
      expect(result.controls[0].intent, state).toBe("again");
      expect(result.controls[0].primary, state).toBe(true);
      expect(en.strings[result.messageKey], state).toBeTruthy();
    }
    expect(describeTutorView(view("recite-ayah", { target })).messageKey).toBe("tutor.reciteFullAyah");
  });

  it("keeps the word on screen as context, not as an error", () => {
    const resolved = describeTutorView(view("word-recognised", { target }));
    expect(resolved.target?.arabic).toBe("رَبِّ");
    expect(resolved.targetUnresolved).toBe(false);
    expect(resolved.targetTone).toBe("resolved");
  });

  it("marks the word three ways, because there are three things to say", () => {
    expect(describeTutorView(view("correction", { target })).targetTone).toBe("attention");
    expect(describeTutorView(view("recite-ayah", { target })).targetTone).toBe("resolved");
    // Could not tell: neither a fault nor a success.
    expect(describeTutorView(view("uncertain", { target })).targetTone).toBe("neutral");
  });
});

describe("speaking to the teacher", () => {
  it("is honest that nothing is listening yet", () => {
    expect(TUTOR_VOICE_STATUS).toBe("not-listening");
    const sentence = en.strings["tutor.voiceNotListening"]!.toLowerCase();
    expect(sentence).toContain("not");
    // And says plainly that a recitation is not an instruction.
    expect(sentence).toContain("recitation");
  });

  it("lists only intents the teacher already understands", () => {
    for (const intent of TUTOR_VOICE_INTENTS) {
      expect(TUTOR_INTENTS as readonly string[], intent).toContain(intent);
      expect(en.strings[TUTOR_INTENT_LABEL_KEYS[intent]], intent).toBeTruthy();
    }
    // "start" is not among them: a lesson begins by pressing, not by speaking
    // into a microphone that is not open.
    expect(TUTOR_VOICE_INTENTS).not.toContain("start");
  });
});

describe("the view is a pure function of what the engine says", () => {
  it("is the same every time for the same input", () => {
    expect(describeTutorView(view("correction", { target }))).toEqual(describeTutorView(view("correction", { target })));
  });

  it("passes the target through untouched", () => {
    expect(describeTutorView(view("correction", { target })).target).toEqual(target);
    expect(describeTutorView(view("correction")).target).toBeNull();
  });

  it("substitutes the word into a sentence that asks for one", () => {
    expect(describeTutorView(view("hint", { target, hintShown: true })).messageKey).toBe("tutor.hintGiven");
    expect(describeTutorView(view("hint", { target, hintShown: true })).messageParams).toEqual({ word: "رَبِّ" });
  });
});

describe("a stopped lesson is not a completed one", () => {
  it("does not congratulate a lesson the learner ended", () => {
    // The engine's last word on a stopped lesson may have been that there was
    // too little evidence to move on; the sign-off must not say "Good".
    const stopped = describeTutorView(view("stopped"));
    expect(stopped.messageKey).toBe("tutor.stopped");
    expect(stopped.messageKey).not.toBe("tutor.finished");
    expect(en.strings["tutor.stopped"]!.toLowerCase()).not.toContain("good");
    // And a genuinely completed lesson keeps its congratulation.
    expect(describeTutorView(view("complete")).messageKey).toBe("tutor.finished");
  });

  it("offers nothing to press on a stopped lesson", () => {
    // Every intent on a stopped session is answered with another end-session,
    // so any control would be a dead button.
    expect(describeTutorView(view("stopped")).controls).toEqual([]);
  });
});
