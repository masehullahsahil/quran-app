import { describe, expect, it } from "vitest";
import { createLiveQuranTracker, updateLiveQuranTracker } from "./liveRecitationTracker";

const FATIHA_2 = "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ";

function update(
  tracker = createLiveQuranTracker(1, 2),
  transcript = "الحمد",
  sequence = 1,
  stability: "interim" | "final" = "interim",
) {
  return updateLiveQuranTracker({ tracker, expectedArabic: FATIHA_2, transcript, sequence, stability });
}

describe("incremental live Quran tracking", () => {
  it("follows الحمد without creating a correction", () => {
    const result = update();
    expect(result.tracker).toMatchObject({ expectedWordIndex: 2, recognitionState: "tentative" });
    expect(result.omission).toBeNull();
  });

  it("follows الحمد لله without creating a correction", () => {
    const result = update(createLiveQuranTracker(1, 2), "الحمد لله");
    expect(result.tracker.expectedWordIndex).toBe(3);
    expect(result.omission).toBeNull();
  });

  it("does not accuse from one unstable appearance of a later word", () => {
    const result = update(createLiveQuranTracker(1, 2), "الحمد لله العالمين");
    expect(result.tracker).toMatchObject({
      expectedWordIndex: 3,
      recognitionState: "possible-skip",
      possibleSkip: { targetWordIndex: 3, laterWordIndex: 4, consecutiveObservations: 1 },
    });
    expect(result.omission).toBeNull();
  });

  it("confirms the same skip after a second ordered partial", () => {
    const possible = update(createLiveQuranTracker(1, 2), "الحمد لله العالمين");
    const confirmed = update(possible.tracker, "الحمد لله العالمين", 2);
    expect(confirmed.tracker.recognitionState).toBe("confirmed-skip");
    expect(confirmed.omission).toEqual({
      type: "word-omitted",
      surah: 1,
      ayah: 2,
      targetWordIndex: 3,
      targetArabic: "رَبِّ",
      evidence: "repeated-stable-later-word",
      heardThroughWordIndex: 4,
    });
  });

  it("confirms a skip from one finalized incremental recognition", () => {
    const result = update(createLiveQuranTracker(1, 2), "الحمد لله العالمين", 1, "final");
    expect(result.omission).toMatchObject({ targetWordIndex: 3, targetArabic: "رَبِّ", evidence: "finalized-later-word" });
  });

  it("emits an omission only once", () => {
    const confirmed = update(createLiveQuranTracker(1, 2), "الحمد لله العالمين", 1, "final");
    const repeated = update(confirmed.tracker, "الحمد لله العالمين", 2, "final");
    expect(confirmed.omission).not.toBeNull();
    expect(repeated.omission).toBeNull();
    expect(repeated.tracker.emittedCorrectionWordIndexes).toEqual([3]);
  });

  it("does not roll position backward for an old recognition", () => {
    const current = update(createLiveQuranTracker(1, 2), "الحمد لله", 2, "final");
    const old = update(current.tracker, "الحمد", 1, "final");
    expect(old.accepted).toBe(false);
    expect(old.tracker).toEqual(current.tracker);
  });

  it("does not treat repetition as an omission", () => {
    const result = update(createLiveQuranTracker(1, 2), "الحمد الحمد لله", 1, "final");
    expect(result.omission).toBeNull();
    expect(result.tracker.recognitionState).toBe("stable-progress");
  });

  it("does not relabel a substitution as an omission", () => {
    const result = update(createLiveQuranTracker(1, 2), "الحمد لله الرحمن العالمين", 1, "final");
    expect(result.omission).toBeNull();
    expect(result.tracker.recognitionState).toBe("uncertain");
  });

  it("keeps unrelated or non-Arabic recognition uncertain", () => {
    const unrelated = update(createLiveQuranTracker(1, 2), "إياك نعبد وإياك نستعين", 1, "final");
    const noise = update(createLiveQuranTracker(1, 2), "background noise", 1, "final");
    expect(unrelated.tracker.recognitionState).toBe("uncertain");
    expect(noise.tracker.recognitionState).toBe("uncertain");
    expect(unrelated.omission).toBeNull();
    expect(noise.omission).toBeNull();
  });

  it("never turns live position into ayah completion state", () => {
    const result = update(createLiveQuranTracker(1, 2), "الحمد لله رب العالمين", 1, "final");
    expect(result.tracker.expectedWordIndex).toBe(4);
    expect(result.tracker).not.toHaveProperty("lastCompletedAyah");
    expect(result.omission).toBeNull();
  });
});
