/**
 * The seam Codex's live tracking arrives through.
 *
 * There is no live server yet, so what can be checked is the contract and the
 * client's response to it — both of which are the parts that would be hard to
 * change later:
 *
 *  * a chunk carries audio and ordering and *cannot* carry a Quran judgement;
 *  * only an authoritative event reaches the learner, so an unstable "maybe you
 *    missed a word" never flickers on screen;
 *  * an interrupt is a trusted turn, passed through unchanged.
 */
import { describe, expect, it } from "vitest";
import { LIVE_LISTENING_DIRECTIVES } from "@shared/liveRecitation";
import {
  acceptsInterimAudio,
  interruptHandoff,
  interruptsCapture,
  isLearnerVisible,
  type LiveAudioChunk,
  type LiveTutorServerEvent,
} from "./tutorLiveTransport";
import { createLiveTutorSession } from "@shared/liveTutor";

const opened = createLiveTutorSession({
  sessionId: "s-1", mode: "guided-recitation", surah: 1, ayah: 2, totalAyahs: 3, learnerLanguage: "en",
});

const OMISSION = {
  type: "word-omitted" as const,
  surah: 1, ayah: 2, targetWordIndex: 3, targetArabic: "رَبِّ",
  evidence: "repeated-stable-later-word" as const, heardThroughWordIndex: 4,
};

function chunk(patch: Partial<LiveAudioChunk> = {}): LiveAudioChunk {
  return {
    session: { sessionId: "s-1", revision: 0 },
    turnId: "turn-1", chunkId: "turn-1:1", sequence: 1,
    attemptScope: "ayah", stability: "interim", turnComplete: false,
    captureStartedAtMs: 1_000, captureEndedAtMs: 2_400,
    mimeType: "audio/webm", audioBase64: "AAA", ...patch,
  };
}

describe("what the browser may send", () => {
  it("carries audio and ordering, and has nowhere to put a judgement", () => {
    const sent = chunk();
    expect(Object.keys(sent).sort()).toEqual([
      "attemptScope", "audioBase64", "captureEndedAtMs", "captureStartedAtMs",
      "chunkId", "mimeType", "sequence", "session", "stability", "turnComplete", "turnId",
    ]);
    // The fields that would make the browser an authority on the Quran, and
    // which this type deliberately does not have.
    for (const forbidden of ["missedWord", "expectedWord", "expectedWordIndex", "shouldAdvance", "correction", "transcript"]) {
      expect(sent, forbidden).not.toHaveProperty(forbidden);
    }
  });

  it("names the scope the engine chose rather than describing the audio", () => {
    expect(chunk({ attemptScope: "word", turnComplete: true, stability: "final" }).attemptScope).toBe("word");
  });

  it("streams open audio only where the server accepts it", () => {
    // The two directives the live route takes an open chunk for. Everything
    // else — a correction in progress, playback, a wait, a stopped lesson —
    // would be refused, so the browser does not send it.
    expect(LIVE_LISTENING_DIRECTIVES.filter(acceptsInterimAudio)).toEqual(["keep-listening", "listen-next-ayah"]);
  });
});

describe("what may reach the learner", () => {
  it("shows only the authoritative events", () => {
    const events: LiveTutorServerEvent[] = [
      { type: "tracking", directive: "keep-listening", stream: null },
      { type: "not-applied", acknowledgement: { status: "duplicate", turnId: "t", chunkId: "c", sequence: 2, appliedSequence: 2 } },
      { type: "interrupt", omission: OMISSION, session: opened.session, action: opened.action },
      { type: "lost" },
    ];
    expect(events.filter(isLearnerVisible).map((event) => event.type)).toEqual(["interrupt", "lost"]);
  });

  it("stops learner capture only on an interrupt", () => {
    expect(interruptsCapture({ type: "interrupt", omission: OMISSION, session: opened.session, action: opened.action })).toBe(true);
    // Following along is not an instruction. `possible-skip` lives inside a
    // tracking answer and stays there.
    expect(interruptsCapture({ type: "tracking", directive: "keep-listening", stream: null })).toBe(false);
    expect(interruptsCapture({ type: "not-applied", acknowledgement: { status: "duplicate", turnId: "t", chunkId: "c", sequence: 2, appliedSequence: 2 } })).toBe(false);
  });

  it("passes an interrupt's turn through untouched", () => {
    const handoff = interruptHandoff({ type: "interrupt", omission: OMISSION, session: opened.session, action: opened.action });
    expect(handoff).toEqual({ status: "updated", accepted: true, session: opened.session, action: opened.action });
    // The same object, not a copy with defaults filled in.
    expect(handoff.session).toBe(opened.session);
    expect(handoff.action).toBe(opened.action);
  });
});
