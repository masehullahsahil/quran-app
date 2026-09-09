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
import { describe, expect, it, vi } from "vitest";
import {
  createCallbackTransport,
  interruptHandoff,
  interruptsCapture,
  isLearnerVisible,
  NO_LIVE_TRANSPORT,
  type LiveAudioChunk,
  type LiveTutorServerEvent,
} from "./tutorLiveTransport";
import { createLiveTutorSession } from "@shared/liveTutor";

const opened = createLiveTutorSession({
  sessionId: "s-1", mode: "guided-recitation", surah: 1, ayah: 2, totalAyahs: 3, learnerLanguage: "en",
});

function chunk(patch: Partial<LiveAudioChunk> = {}): LiveAudioChunk {
  return {
    session: { sessionId: "s-1", revision: 0 },
    sequence: 0, offsetMs: 0, durationMs: 250, final: false,
    mimeType: "audio/webm", audioBase64: "AAA", scope: "ayah", ...patch,
  };
}

describe("what the browser may send", () => {
  it("carries audio and ordering, and has nowhere to put a judgement", () => {
    const sent = chunk();
    expect(Object.keys(sent).sort()).toEqual(
      ["audioBase64", "durationMs", "final", "mimeType", "offsetMs", "scope", "sequence", "session"],
    );
    // The fields that would make the browser an authority on the Quran, and
    // which this type deliberately does not have.
    for (const forbidden of ["missedWord", "expectedWord", "expectedWordIndex", "shouldAdvance", "correction", "transcript"]) {
      expect(sent, forbidden).not.toHaveProperty(forbidden);
    }
  });

  it("names the scope the engine chose rather than describing the audio", () => {
    expect(chunk({ scope: "word" }).scope).toBe("word");
  });
});

describe("what may reach the learner", () => {
  it("shows only the authoritative events", () => {
    const events: LiveTutorServerEvent[] = [
      { type: "tracking", expectedWordIndex: 3 },
      { type: "possible-omission" },
      { type: "confirmed-omission", session: opened.session, action: opened.action },
      { type: "interrupt", session: opened.session, action: opened.action },
      { type: "lost" },
    ];
    expect(events.filter(isLearnerVisible).map((event) => event.type)).toEqual(["interrupt", "lost"]);
  });

  it("stops learner capture only on an interrupt", () => {
    expect(interruptsCapture({ type: "interrupt", session: opened.session, action: opened.action })).toBe(true);
    expect(interruptsCapture({ type: "possible-omission" })).toBe(false);
    // Confirmed but not yet an instruction to interrupt: still the server's
    // call, not this file's.
    expect(interruptsCapture({ type: "confirmed-omission", session: opened.session, action: opened.action })).toBe(false);
    expect(interruptsCapture({ type: "tracking", expectedWordIndex: 2 })).toBe(false);
  });

  it("passes an interrupt's turn through untouched", () => {
    const handoff = interruptHandoff({ type: "interrupt", session: opened.session, action: opened.action });
    expect(handoff).toEqual({ status: "updated", accepted: true, session: opened.session, action: opened.action });
    // The same object, not a copy with defaults filled in.
    expect(handoff.session).toBe(opened.session);
    expect(handoff.action).toBe(opened.action);
  });
});

describe("until the live server exists", () => {
  it("installs a transport that is honest about not being available", () => {
    expect(NO_LIVE_TRANSPORT.available).toBe(false);
    const listener = vi.fn();
    const off = NO_LIVE_TRANSPORT.subscribe(listener);
    NO_LIVE_TRANSPORT.open({ sessionId: "s-1", revision: 0 });
    NO_LIVE_TRANSPORT.send(chunk());
    NO_LIVE_TRANSPORT.close();
    off();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("the test transport", () => {
  it("records what was sent and delivers what the server said", () => {
    const seen: LiveTutorServerEvent[] = [];
    const transport = createCallbackTransport();
    const off = transport.subscribe((event) => seen.push(event));

    transport.open({ sessionId: "s-1", revision: 0 });
    transport.send(chunk({ sequence: 0 }));
    transport.send(chunk({ sequence: 1, final: true }));
    transport.emit({ type: "interrupt", session: opened.session, action: opened.action });
    off();
    transport.emit({ type: "lost" });

    expect(transport.opened).toHaveLength(1);
    expect(transport.chunks.map((item) => item.sequence)).toEqual([0, 1]);
    expect(seen.map((event) => event.type)).toEqual(["interrupt"]);
  });
});
