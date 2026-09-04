import { describe, expect, it } from "vitest";
import {
  createRecitationSession,
  deduplicateTranscriptOverlap,
  ingestRecitationChunk,
  resetRecitationSession,
  type RecitationSessionState,
} from "./recitationSession";

const AYAH = "الحمد لله رب العالمين";
const PREVIOUS = "بسم الله الرحمن الرحيم";
const NEXT = "الرحمن الرحيم مالك يوم الدين";

function ingest(session: RecitationSessionState, transcriptChunk: string, options: {
  stability?: "interim" | "final";
  chunkId?: string;
  totalAyahs?: number;
  previousAyahArabic?: string;
  nextAyahArabic?: string;
} = {}) {
  return ingestRecitationChunk({
    session,
    expectedAyahArabic: AYAH,
    transcriptChunk,
    stability: options.stability ?? "final",
    totalAyahs: options.totalAyahs ?? 7,
    chunkId: options.chunkId,
    previousAyahArabic: options.previousAyahArabic,
    nextAyahArabic: options.nextAyahArabic,
  });
}

describe("live recitation sessions", () => {
  it("completes one ayah over two chunks", () => {
    const first = ingest(createRecitationSession("two", 1, 1), "الحمد لله");
    const second = ingest(first.session, "رب العالمين");
    expect(first.session.expectedWordIndex).toBe(3);
    expect(second.guidance).toBe("ayah_advanced");
    expect(second.session).toMatchObject({ currentAyah: 2, lastCompletedAyah: 1, chunkCount: 2 });
  });

  it("completes one ayah over three short chunks", () => {
    const first = ingest(createRecitationSession("three", 1, 1), "الحمد");
    const second = ingest(first.session, "لله");
    const third = ingest(second.session, "رب العالمين");
    expect(third.guidance).toBe("ayah_advanced");
    expect(third.session.currentAyah).toBe(2);
  });

  it("removes cumulative browser overlap without double counting", () => {
    const first = ingest(createRecitationSession("overlap", 1, 1), "الحمد لله");
    const second = ingest(first.session, "الحمد لله رب");
    expect(second.novelTranscript).toBe("رب");
    expect(second.assessment.matchedCount).toBe(3);
    expect(second.session.chunkCount).toBe(2);
  });

  it("does not accept the same finalized chunk id twice", () => {
    const first = ingest(createRecitationSession("duplicate", 1, 1), "الحمد لله", { chunkId: "1" });
    const duplicate = ingest(first.session, "رب العالمين", { chunkId: "1" });
    expect(duplicate).toMatchObject({ accepted: false, duplicate: true });
    expect(duplicate.session).toEqual(first.session);
  });

  it("does not accept duplicate finalized text twice without an id", () => {
    const first = ingest(createRecitationSession("text-duplicate", 1, 1), AYAH);
    const duplicate = ingest(first.session, AYAH);
    expect(duplicate).toMatchObject({ accepted: false, duplicate: true });
    expect(duplicate.session).toEqual(first.session);
  });

  it("previews interim text without durably advancing", () => {
    const initial = createRecitationSession("interim", 1, 1);
    const preview = ingest(initial, AYAH, { stability: "interim" });
    expect(preview.guidance).toBe("ayah_advanced");
    expect(preview.accepted).toBe(false);
    expect(preview.session).toEqual(initial);
  });

  it("durably advances on finalized text", () => {
    const result = ingest(createRecitationSession("final", 1, 1), AYAH);
    expect(result.accepted).toBe(true);
    expect(result.session.currentAyah).toBe(2);
  });

  it("resumes after stopping part-way through an ayah", () => {
    const partial = ingest(createRecitationSession("resume", 1, 1), "الحمد لله");
    const resumed = ingest(partial.session, "رب العالمين");
    expect(partial.guidance).toBe("continue");
    expect(resumed.guidance).toBe("ayah_advanced");
  });

  it("treats a repeated boundary word as overlap", () => {
    const partial = ingest(createRecitationSession("word-repeat", 1, 1), "الحمد لله");
    const resumed = ingest(partial.session, "لله رب العالمين");
    expect(resumed.novelTranscript).toBe("رب العالمين");
    expect(resumed.guidance).toBe("ayah_advanced");
  });

  it("treats a repeated boundary phrase as overlap", () => {
    const partial = ingest(createRecitationSession("phrase-repeat", 1, 1), "الحمد لله");
    const resumed = ingest(partial.session, "الحمد لله رب العالمين");
    expect(resumed.novelTranscript).toBe("رب العالمين");
    expect(resumed.guidance).toBe("ayah_advanced");
  });

  it("recovers in the next chunk after a mistake", () => {
    const mistake = ingest(createRecitationSession("recovery", 1, 1), "الحمد خطأ");
    const recovery = ingest(mistake.session, "لله رب العالمين");
    expect(mistake.session.currentAyah).toBe(1);
    expect(recovery.guidance).toBe("ayah_advanced");
  });

  it("allows a learner to restart the current ayah", () => {
    const partial = ingest(createRecitationSession("restart", 1, 1), "الحمد لله");
    const restarted = ingest(partial.session, AYAH);
    expect(restarted.guidance).toBe("ayah_advanced");
  });

  it("holds position when the previous ayah is repeated", () => {
    const result = ingest(createRecitationSession("previous", 1, 2), PREVIOUS, { previousAyahArabic: PREVIOUS });
    expect(result.verseFollowing.reason).toBe("previous_ayah_repeated");
    expect(result.session.currentAyah).toBe(2);
  });

  it("holds position when the next ayah starts early", () => {
    const result = ingest(createRecitationSession("early", 1, 1), NEXT, { nextAyahArabic: NEXT });
    expect(result.verseFollowing.reason).toBe("next_ayah_started_early");
    expect(result.session.currentAyah).toBe(1);
  });

  it("holds position for noisy text", () => {
    const result = ingest(createRecitationSession("noise", 1, 1), "ضوضاء كثيرة جدا ليست من النص إطلاقا هنا");
    expect(result.guidance).toBe("uncertain");
    expect(result.session.currentAyah).toBe(1);
  });

  it("does not accept an empty chunk", () => {
    const initial = createRecitationSession("empty", 1, 1);
    const result = ingest(initial, "   ");
    expect(result).toMatchObject({ accepted: false, guidance: "uncertain" });
    expect(result.session).toEqual(initial);
  });

  it("keeps a transition bounded to one ayah", () => {
    const result = ingest(createRecitationSession("bounded", 1, 1), `${AYAH} ${NEXT}`, { nextAyahArabic: NEXT });
    expect(result.session.currentAyah).toBeLessThanOrEqual(2);
    expect(result.session.currentAyah).not.toBe(3);
  });

  it("reports final surah completion without moving beyond it", () => {
    const result = ingest(createRecitationSession("complete", 1, 7), AYAH, { totalAyahs: 7 });
    expect(result.guidance).toBe("surah_completed");
    expect(result.session).toMatchObject({ currentAyah: 7, lastCompletedAyah: 7, trackerState: "completed" });
  });

  it("resets retry state while retaining the session and current ayah", () => {
    const partial = ingest(createRecitationSession("reset", 1, 3), "الحمد لله");
    const reset = resetRecitationSession(partial.session);
    expect(reset).toEqual(createRecitationSession("reset", 1, 3));
  });

  it("normalizes Arabic when finding overlap", () => {
    expect(deduplicateTranscriptOverlap("الْحَمْدُ لِلَّهِ", "الحمد لله رب")).toBe("رب");
  });
});
