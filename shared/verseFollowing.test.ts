import { describe, expect, it } from "vitest";
import { assessRecitationTranscript } from "../server/recitation";
import {
  createVerseFollowingPosition,
  followRecitation,
  toVerseFollowingPosition,
  type VerseFollowingPosition,
  type VerseFollowingResult,
} from "./verseFollowing";

// Al-Fatiha, indexed from 0. Real text keeps the tests honest about how the
// aligner behaves on repeated words ("عليهم" appears twice in ayah 7).
const FATIHA = [
  "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
  "الرَّحْمَٰنِ الرَّحِيمِ",
  "مَالِكِ يَوْمِ الدِّينِ",
  "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
  "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ",
  "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ",
];
const TOTAL_AYAHS = FATIHA.length;

/**
 * Runs the tracker exactly the way the server does: the same transcript aligned
 * against the expected ayah and, when they exist, its two neighbours.
 */
function follow(
  position: VerseFollowingPosition,
  transcript: string,
  options: { transcriptUsable?: boolean } = {},
): VerseFollowingResult {
  const ayah = position.currentAyah;
  return followRecitation({
    position,
    totalAyahs: TOTAL_AYAHS,
    alignment: assessRecitationTranscript(FATIHA[ayah - 1], transcript),
    previousAyahAlignment: ayah > 1 ? assessRecitationTranscript(FATIHA[ayah - 2], transcript) : null,
    nextAyahAlignment: ayah < TOTAL_AYAHS ? assessRecitationTranscript(FATIHA[ayah], transcript) : null,
    transcriptUsable: options.transcriptUsable,
  });
}

const at = (ayah: number, patch: Partial<VerseFollowingPosition> = {}): VerseFollowingPosition => ({
  ...createVerseFollowingPosition(1, ayah),
  ...patch,
});

describe("followRecitation — advancing", () => {
  it("advances one ayah after a clean recitation", () => {
    const result = follow(at(2), "الحمد لله رب العالمين");

    expect(result).toMatchObject({
      currentSurah: 1,
      currentAyah: 3,
      expectedWordIndex: 1,
      lastCompletedAyah: 2,
      state: "following",
      evidence: "strong",
      shouldAdvance: true,
      nextAyah: 4,
      reason: "ayah_completed",
      attemptsOnCurrentAyah: 0,
    });
    expect(result.correctionFocus).toBeNull();
  });

  it("advances exactly one ayah at a time across consecutive attempts", () => {
    const first = follow(at(1), "بسم الله الرحمن الرحيم");
    expect(first.currentAyah).toBe(2);

    const second = follow(toVerseFollowingPosition(first), "الحمد لله رب العالمين");
    expect(second.currentAyah).toBe(3);
    expect(second.lastCompletedAyah).toBe(2);
  });

  it("advances when one word is omitted but the rest of the ayah continues strongly", () => {
    const result = follow(at(7), "صراط الذين أنعمت عليهم المغضوب عليهم ولا الضالين");

    expect(result.shouldAdvance).toBe(false); // ayah 7 is the last ayah
    expect(result).toMatchObject({ state: "completed", evidence: "strong", lastCompletedAyah: 7 });
  });

  it("advances when a word is repeated during the recitation", () => {
    const result = follow(at(2), "الحمد لله لله رب العالمين");

    expect(result).toMatchObject({ currentAyah: 3, shouldAdvance: true, evidence: "strong" });
  });

  it("advances after the learner restarts and then completes the ayah", () => {
    const result = follow(at(5), "إياك نعبد إياك نعبد وإياك نستعين");

    expect(result).toMatchObject({ currentAyah: 6, shouldAdvance: true, lastCompletedAyah: 5 });
  });

  it("reports completion rather than advancing past the final ayah", () => {
    const result = follow(at(7), "صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين");

    expect(result).toMatchObject({
      currentAyah: 7,
      state: "completed",
      shouldAdvance: false,
      nextAyah: null,
      lastCompletedAyah: 7,
      reason: "surah_completed",
      evidence: "strong",
    });
  });
});

describe("followRecitation — staying on the ayah", () => {
  it("keeps a partial recitation on the same ayah and moves the expected word", () => {
    const result = follow(at(7), "صراط الذين أنعمت عليهم");

    expect(result).toMatchObject({
      currentAyah: 7,
      expectedWordIndex: 5,
      state: "following",
      evidence: "partial",
      shouldAdvance: false,
      reason: "partial_progress",
      lastCompletedAyah: null,
      attemptsOnCurrentAyah: 1,
    });
    expect(result.correctionFocus).toMatchObject({ wordIndex: 5, kind: "missing" });
  });

  it("marks a mistake the learner recited past as a correction, then advances once it is fixed", () => {
    const mistake = follow(at(7), "صراط الذي أنعمت عليهم");

    expect(mistake).toMatchObject({
      currentAyah: 7,
      state: "correcting",
      shouldAdvance: false,
      reason: "mistake_to_correct",
      expectedWordIndex: 2,
    });
    expect(mistake.correctionFocus).toMatchObject({ wordIndex: 2, kind: "review" });

    const recovered = follow(
      toVerseFollowingPosition(mistake),
      "صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين",
    );
    expect(recovered).toMatchObject({ state: "completed", lastCompletedAyah: 7, evidence: "strong" });
  });

  it("continues from the expected word when the learner resumes mid-ayah", () => {
    const stopped = follow(at(7), "صراط الذين أنعمت عليهم");
    expect(stopped.expectedWordIndex).toBe(5);

    const resumed = follow(toVerseFollowingPosition(stopped), "غير المغضوب عليهم ولا الضالين");

    expect(resumed).toMatchObject({ state: "completed", lastCompletedAyah: 7, evidence: "strong" });
  });

  it("does not advance when a restart leaves the ayah unfinished", () => {
    const result = follow(at(7), "صراط الذين صراط الذين أنعمت");

    expect(result.shouldAdvance).toBe(false);
    expect(result.currentAyah).toBe(7);
    // The aligner minimises edits, so the restarted words are charged as
    // substitutions on words 3+ rather than as extras. That reads as less
    // progress than the learner made, which is the safe direction: the tracker
    // asks for word 3 again instead of skipping ahead.
    expect(result.expectedWordIndex).toBe(3);
  });
});

describe("followRecitation — neighbouring ayahs", () => {
  it("stays put and asks for a retry when the previous ayah was repeated", () => {
    const result = follow(at(4), "الرحمن الرحيم");

    expect(result).toMatchObject({
      currentAyah: 4,
      expectedWordIndex: 1,
      state: "correcting",
      evidence: "weak",
      shouldAdvance: false,
      reason: "previous_ayah_repeated",
      lastCompletedAyah: null,
    });
  });

  it("stays put when the learner begins the next ayah early", () => {
    const result = follow(at(3), "مالك يوم الدين");

    expect(result).toMatchObject({
      currentAyah: 3,
      state: "correcting",
      shouldAdvance: false,
      reason: "next_ayah_started_early",
    });
  });

  it("does not advance on one isolated word belonging to the next ayah", () => {
    const result = follow(at(2), "الحمد لله الرحمن");

    expect(result).toMatchObject({
      currentAyah: 2,
      expectedWordIndex: 3,
      shouldAdvance: false,
      reason: "partial_progress",
    });
  });
});

describe("followRecitation — unusable evidence", () => {
  it("holds the position for a short transcript", () => {
    const position = at(2, { expectedWordIndex: 3 });
    const result = follow(position, "لله");

    expect(result).toMatchObject({
      currentAyah: 2,
      expectedWordIndex: 3,
      state: "uncertain",
      evidence: "weak",
      shouldAdvance: false,
      reason: "too_little_evidence",
    });
  });

  it("holds the position for words that belong to no nearby ayah", () => {
    const result = follow(at(2), "واحد اثنان ثلاثة");

    expect(result).toMatchObject({
      currentAyah: 2,
      expectedWordIndex: 1,
      state: "uncertain",
      shouldAdvance: false,
      reason: "too_little_evidence",
    });
  });

  it("does not advance on a noisy transcript even when every expected word appears", () => {
    const result = follow(at(3), "الرحمن الرحيم واحد اثنان ثلاثة أربعة");

    expect(result).toMatchObject({
      currentAyah: 3,
      state: "uncertain",
      shouldAdvance: false,
      reason: "noisy_transcript",
      lastCompletedAyah: null,
    });
  });

  it("holds the position for an empty transcript", () => {
    const result = follow(at(2, { expectedWordIndex: 2 }), "   ");

    expect(result).toMatchObject({
      currentAyah: 2,
      expectedWordIndex: 2,
      state: "uncertain",
      evidence: "none",
      shouldAdvance: false,
      reason: "no_transcript",
    });
  });

  it("holds the position when transcription itself was unusable", () => {
    const result = follow(at(5, { expectedWordIndex: 3, lastCompletedAyah: 4 }), "إياك نعبد وإياك نستعين", {
      transcriptUsable: false,
    });

    expect(result).toMatchObject({
      currentAyah: 5,
      expectedWordIndex: 3,
      lastCompletedAyah: 4,
      state: "uncertain",
      evidence: "none",
      shouldAdvance: false,
      reason: "no_transcript",
    });
  });

  it("holds the position when there is no alignment at all", () => {
    const result = followRecitation({
      position: at(3),
      totalAyahs: TOTAL_AYAHS,
      alignment: null,
    });

    expect(result).toMatchObject({ currentAyah: 3, state: "uncertain", reason: "no_transcript" });
  });
});

describe("followRecitation — scope", () => {
  it("makes only position and word-recall claims", () => {
    const output = JSON.stringify(follow(at(6), "اهدنا الصراط")).toLowerCase();

    expect(output).not.toMatch(/tajweed|tajwid|makhraj|makharij|pronunciation|pitch|rhythm|ghunnah|madd|vowel/);
  });

  it("reports a bounded evidence level rather than a fabricated probability", () => {
    const result = follow(at(2), "الحمد لله رب العالمين");

    expect(["none", "weak", "partial", "strong"]).toContain(result.evidence);
    expect(result).not.toHaveProperty("confidence");
  });
});
