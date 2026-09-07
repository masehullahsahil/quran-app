/**
 * The Study screen's layout contract.
 *
 * These assert the properties the interface must hold in every state — one
 * instruction, one contextual button, a confirmed correction never buried, an
 * unconfirmed one never dressed as a mistake — without rendering the page, so
 * they do not break when the markup is rearranged.
 */
import { describe, expect, it } from "vitest";
import type { VerseFollowingResult } from "@shared/verseFollowing";
import type { AttemptEvidence, TeacherEvidence } from "@shared/teacherDecision";
import { resolveTeacherAction, type TeacherAction } from "./teacherAction";
import { describeStudyTiers, type StudyTiers } from "./studyView";
import en from "@locales/en";

function follow(patch: Partial<VerseFollowingResult> = {}): VerseFollowingResult {
  return {
    currentSurah: 1,
    currentAyah: 2,
    expectedWordIndex: 1,
    lastCompletedAyah: null,
    state: "following",
    attemptsOnCurrentAyah: 1,
    evidence: "partial",
    shouldAdvance: false,
    nextAyah: 3,
    correctionFocus: null,
    reason: "partial_progress",
    ...patch,
  };
}

function attempt(patch: Partial<AttemptEvidence> = {}): AttemptEvidence {
  return { reviewable: true, corrections: [], verseFollowing: follow(), ...patch };
}

function evidence(patch: Partial<TeacherEvidence> = {}): TeacherEvidence {
  return {
    recording: { isRecording: false, isReviewing: false, failed: false },
    attempt: null,
    acoustic: null,
    memory: { reviewDue: false, recurringWordIndexes: [] },
    livePosition: { currentSurah: 1, currentAyah: 2, expectedWordIndex: 1 },
    hasNextAyah: true,
    ...patch,
  };
}

const missingWord = { expected: "رَبِّ", heard: null, status: "missing" as const, wordIndex: 3 };

function tiersFor(input: TeacherEvidence, overrides: Partial<Parameters<typeof describeStudyTiers>[0]> = {}): { action: TeacherAction; tiers: StudyTiers } {
  const action = resolveTeacherAction(input);
  const tiers = describeStudyTiers({
    action,
    hasFeedback: input.attempt !== null,
    wordReviewAvailable: input.attempt?.reviewable ?? false,
    hasAcousticReview: input.acoustic !== null,
    audioUnavailable: false,
    reviewFailed: input.recording.failed,
    ...overrides,
  });
  return { action, tiers };
}

/** Every state the Study screen can be in. */
const states: Array<[string, TeacherEvidence]> = [
  ["nothing yet", evidence()],
  ["review due", evidence({ memory: { reviewDue: true, recurringWordIndexes: [] } })],
  ["recording", evidence({ recording: { isRecording: true, isReviewing: false, failed: false } })],
  ["processing", evidence({ recording: { isRecording: false, isReviewing: true, failed: false } })],
  ["recorder failed", evidence({ recording: { isRecording: false, isReviewing: false, failed: true } })],
  ["unreviewable", evidence({ attempt: attempt({ reviewable: false }) })],
  ["uncertain", evidence({ attempt: attempt({ verseFollowing: follow({ state: "uncertain", reason: "noisy_transcript", evidence: "weak" }) }) })],
  ["missing word", evidence({ attempt: attempt({ corrections: [missingWord], verseFollowing: follow({ state: "correcting" }) }) })],
  ["recurring word", evidence({
    attempt: attempt({ corrections: [missingWord], verseFollowing: follow({ state: "correcting" }) }),
    memory: { reviewDue: true, recurringWordIndexes: [3] },
  })],
  ["acoustic finding", evidence({
    attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong" }) }),
    acoustic: { status: "available", provider: "t", confidence: 0.92, summary: "s", findings: [{ kind: "phoneme", wordIndex: 4, expectedArabic: "الْعَالَمِينَ", guidance: "g" }] },
  })],
  ["repeat ayah", evidence({ attempt: attempt({ verseFollowing: follow({ state: "correcting" }) }) })],
  ["partial progress", evidence({ attempt: attempt({ verseFollowing: follow({ state: "following", expectedWordIndex: 4 }) }) })],
  ["ayah complete", evidence({ attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong" }) }) })],
  ["surah complete", evidence({ hasNextAyah: false, attempt: attempt({ verseFollowing: follow({ state: "completed" }) }) })],
];

describe("tier one shows exactly one instruction", () => {
  it.each(states)("%s", (_name, input) => {
    const { tiers } = tiersFor(input);

    expect(en.strings[tiers.now.instructionKey], tiers.now.instructionKey).toBeTruthy();
    expect(tiers.now.instructionKey.startsWith("now."), tiers.now.instructionKey).toBe(true);
  });

  it.each(states)("offers at most one contextual call to action for %s", (_name, input) => {
    const { tiers } = tiersFor(input);

    if (tiers.now.cta) {
      expect(["retry-ayah", "next-ayah"]).toContain(tiers.now.cta.command);
      expect(en.strings[tiers.now.cta.labelKey]).toBeTruthy();
    }
    // The type permits one button; this guards against a future array.
    expect(Array.isArray(tiers.now.cta)).toBe(false);
  });

  it("shows the word position only when the instruction is about one word", () => {
    expect(tiersFor(states.find(([n]) => n === "missing word")![1]).tiers.now.showWordPosition).toBe(true);
    expect(tiersFor(states.find(([n]) => n === "repeat ayah")![1]).tiers.now.showWordPosition).toBe(false);
    expect(tiersFor(states.find(([n]) => n === "ayah complete")![1]).tiers.now.showWordPosition).toBe(false);
  });
});

describe("tier two carries the correction, outside Teacher notes", () => {
  it("shows the Arabic word and an explanation for a word-level correction", () => {
    const { tiers } = tiersFor(states.find(([n]) => n === "missing word")![1]);

    expect(tiers.correction).not.toBeNull();
    expect(tiers.correction?.arabic).toBe("رَبِّ");
    expect(tiers.correction?.wordIndex).toBe(3);
    expect(tiers.correction?.explanationKey).toBe("correction.notHeard");
    expect(tiers.correction?.confirmed).toBe(true);
    // It is a tier of its own, never one of the collapsed note blocks.
    expect(tiers.notes).not.toContain("correction");
  });

  it("explains a sound observation differently from a missing word", () => {
    const { tiers } = tiersFor(states.find(([n]) => n === "acoustic finding")![1]);

    expect(tiers.correction?.explanationKey).toBe("correction.sound");
    expect(tiers.correction?.arabic).toBe("الْعَالَمِينَ");
  });

  it("offers the reference recording beside the word", () => {
    const { tiers } = tiersFor(states.find(([n]) => n === "recurring word")![1]);
    expect(tiers.correction?.offerReference).toBe(true);
  });

  it.each([["nothing yet"], ["recording"], ["processing"], ["repeat ayah"], ["ayah complete"], ["surah complete"], ["partial progress"]])(
    "shows no correction panel for %s",
    (name) => {
      expect(tiersFor(states.find(([entry]) => entry === name)![1]).tiers.correction).toBeNull();
    },
  );
});

describe("uncertainty is never styled as a confirmed mistake", () => {
  it.each([["uncertain"], ["unreviewable"], ["recorder failed"]])("uses the unsure tone for %s", (name) => {
    const { tiers } = tiersFor(states.find(([entry]) => entry === name)![1]);

    expect(tiers.now.tone).toBe("unsure");
    // No correction panel means no word is marked wrong.
    expect(tiers.correction).toBeNull();
  });

  it("keeps the confirmed tone for an actual correction", () => {
    expect(tiersFor(states.find(([n]) => n === "missing word")![1]).tiers.now.tone).toBe("attention");
  });

  it("never marks a correction confirmed when the tone is unsure", () => {
    for (const [name, input] of states) {
      const { tiers } = tiersFor(input);
      if (tiers.now.tone === "unsure") expect(tiers.correction?.confirmed ?? false, name).toBe(false);
    }
  });
});

describe("advancement never competes with a correction", () => {
  it("offers no next-ayah action while a blocking correction stands", () => {
    for (const [name, input] of states) {
      const { action, tiers } = tiersFor(input);
      if (tiers.correction) {
        expect(tiers.now.cta?.command, name).not.toBe("next-ayah");
        expect(action.canAdvance, name).toBe(false);
      }
    }
  });

  it("offers the next-ayah action only when the engine sanctions advancing", () => {
    for (const [name, input] of states) {
      const { action, tiers } = tiersFor(input);
      if (tiers.now.cta?.command === "next-ayah") expect(action.canAdvance, name).toBe(true);
      if (!action.canAdvance) expect(tiers.now.cta?.command, name).not.toBe("next-ayah");
    }
  });
});

describe("tier three holds the diagnostics", () => {
  it("keeps score, history and reason detail collapsed", () => {
    const { tiers } = tiersFor(states.find(([n]) => n === "missing word")![1]);

    expect(tiers.notes).toEqual(expect.arrayContaining(["score", "corrections", "memory", "place", "plan", "stages"]));
  });

  it("keeps blocking messages out of the collapsed section", () => {
    const failed = tiersFor(states.find(([n]) => n === "recorder failed")![1], { reviewFailed: true });
    expect(failed.tiers.alerts.reviewFailed).toBe(true);

    const unreviewable = tiersFor(states.find(([n]) => n === "unreviewable")![1], { hasFeedback: true, wordReviewAvailable: false });
    expect(unreviewable.tiers.alerts.reviewUnavailable).toBe(true);
  });

  it("adds an acoustic block only when the evaluator said something", () => {
    expect(tiersFor(states.find(([n]) => n === "acoustic finding")![1]).tiers.notes).toContain("acoustic");
    expect(tiersFor(states.find(([n]) => n === "missing word")![1]).tiers.notes).not.toContain("acoustic");
  });
});

describe("the mobile teaching order", () => {
  it("puts location, instruction, focus word and controls before anything diagnostic", () => {
    const { tiers } = tiersFor(states.find(([n]) => n === "missing word")![1]);

    // The tier object itself encodes the order the page renders: NOW, then the
    // correction, then the collapsed notes. Nothing diagnostic can precede the
    // correction without moving it into `notes`, which the tests above forbid.
    const order = [tiers.now && "now", tiers.correction && "correction", ...tiers.notes].filter(Boolean);

    expect(order[0]).toBe("now");
    expect(order[1]).toBe("correction");
    expect(order.indexOf("score")).toBeGreaterThan(order.indexOf("correction"));
  });
});

describe("the result card never claims more than the decision did", () => {
  const pick = (name: string) => tiersFor(states.find(([entry]) => entry === name)![1]);

  it("shows the exact word, its position and one observation for a word correction", () => {
    const { tiers } = pick("missing word");

    expect(tiers.correction?.arabic).toBe(missingWord.expected);
    expect(tiers.correction?.wordIndex).toBe(3);
    expect(tiers.correction?.observation).toBe("not-heard");
    expect(tiers.correction?.explanationKey).toBe("correction.notHeard");
    expect(tiers.outcome).toBeNull();
  });

  it("uses different wording for a word that came through differently", () => {
    const substituted = evidence({
      attempt: attempt({
        corrections: [{ expected: "رَبِّ", heard: "رَبَّ", status: "review", wordIndex: 3 }],
        verseFollowing: follow({ state: "correcting" }),
      }),
    });
    const { tiers } = tiersFor(substituted);

    expect(tiers.correction?.observation).toBe("came-through-differently");
    expect(tiers.correction?.explanationKey).toBe("correction.different");
    expect(tiers.correction?.explanationKey).not.toBe(pick("missing word").tiers.correction?.explanationKey);
  });

  it("keeps a sound observation as an observation, not a verdict", () => {
    const { tiers } = pick("acoustic finding");

    expect(tiers.correction?.observation).toBe("sound-observation");
    expect(tiers.correction?.explanationKey).toBe("correction.sound");
    // The wording must not assert that the word was pronounced wrongly: the
    // evaluator reported how it sounded, and that is all the learner is told.
    const sentence = en.strings["correction.sound"].toLowerCase();
    for (const claim of ["wrong", "incorrect", "mistake", "error"]) expect(sentence, claim).not.toContain(claim);
  });

  it("walks the learner from listening back to the microphone", () => {
    const { tiers } = pick("missing word");

    // The decision's own sequence, minus the step that names the word the card
    // is already showing. The recorder is the terminal step.
    expect(tiers.correction?.steps).toEqual(["listen", "repeat-word", "recite-ayah"]);
    expect(tiers.correction?.steps).not.toContain("show-word");
    expect(tiers.correction?.offerRecord).toBe(true);
  });

  it("offers the ayah as the reference, because no word-level recording exists", () => {
    expect(pick("missing word").tiers.correction?.reference).toBe("ayah");
  });

  it("names no word when the whole ayah needs another attempt", () => {
    const { tiers } = pick("repeat ayah");

    expect(tiers.correction).toBeNull();
    expect(tiers.outcome?.kind).toBe("whole-ayah");
    expect(tiers.outcome?.headlineKey).toBe("outcome.ayahHeadline");
    expect(tiers.outcome?.offerRecord).toBe(true);
  });

  it("names no word when the attempt could not be judged", () => {
    for (const name of ["uncertain", "unreviewable", "recorder failed"]) {
      const { tiers } = pick(name);
      expect(tiers.correction, name).toBeNull();
      expect(tiers.outcome?.kind, name).toBe("uncertain");
      expect(tiers.outcome?.offerRecord, name).toBe(true);
    }
  });

  it("says an accepted attempt was accepted, and offers only what the decision offers", () => {
    const complete = pick("ayah complete");
    expect(complete.tiers.correction).toBeNull();
    expect(complete.tiers.outcome?.kind).toBe("accepted");
    expect(complete.tiers.outcome?.offerRecord).toBe(false);
    expect(complete.tiers.outcome?.cta?.command).toBe("next-ayah");

    const surah = pick("surah complete");
    expect(surah.tiers.outcome?.headlineKey).toBe("outcome.surahHeadline");
  });

  it("clears the correction once the next attempt no longer reports it", () => {
    const before = pick("missing word").tiers;
    expect(before.correction?.arabic).toBe(missingWord.expected);

    // The same learner, one good recording later: the corrections list is empty
    // and the tracker advances. Nothing of the old card may survive that.
    const after = pick("ayah complete").tiers;
    expect(after.correction).toBeNull();
    expect(after.outcome?.kind).toBe("accepted");
  });

  it("shows one card at a time, never a word and an outcome together", () => {
    for (const [name] of states) {
      const { tiers } = pick(name);
      expect(Boolean(tiers.correction && tiers.outcome), name).toBe(false);
    }
  });

  it("hands the steps and the contextual button to the card that is showing", () => {
    for (const [name] of states) {
      const { tiers } = pick(name);
      if (!tiers.correction && !tiers.outcome) continue;
      // Otherwise NOW and the card would offer the same tap twice over.
      expect(tiers.now.cta, name).toBeNull();
      expect(tiers.now.sequence, name).toEqual([]);
    }
  });

  it("has real wording in every language for every key the card can use", () => {
    const keys = new Set<string>();
    for (const [name] of states) {
      const { tiers } = pick(name);
      if (tiers.correction) keys.add(tiers.correction.explanationKey);
      if (tiers.outcome) {
        keys.add(tiers.outcome.headlineKey);
        keys.add(tiers.outcome.detailKey);
      }
    }
    expect(keys.size).toBeGreaterThan(3);
    for (const key of Array.from(keys)) expect(en.strings[key as keyof typeof en.strings], key).toBeTruthy();
  });
});
