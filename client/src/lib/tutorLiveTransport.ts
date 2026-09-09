/**
 * The seam where Codex's live Quran tracking will arrive.
 *
 * The locked requirement in the brief is that a learner must not have to finish
 * the ayah before the app notices a skipped word: when the server confidently
 * determines the learner has moved past `رَبِّ`, the teacher interrupts *there*.
 * Deciding that is server work — it needs the Quran text, the alignment and the
 * confidence model — and it is being built on another branch.
 *
 * What is here is the browser half, and only the browser half:
 *
 *  * a typed description of what the browser may send (audio, and where in the
 *    turn it came from) and what it may receive (a tracking signal, or an
 *    instruction to interrupt);
 *  * a no-op implementation, which is what runs until that server lands;
 *  * the rule that only a confirmed interruption is ever shown to a learner.
 *
 * **The asymmetry is the point.** Read `LiveAudioChunk`: it carries audio,
 * ordering and a session reference. It cannot carry a missed word, an expected
 * word, a Quran position, a `shouldAdvance`, or a correction result, because no
 * field of that kind exists — the browser has nothing to say about the Quran
 * and this type is what makes that true rather than a convention. What comes
 * back is likewise not a transcript to interpret: an interrupt arrives with the
 * server's own decided handoff, which the tutor hook stores exactly as it
 * stores the handoff from a finalised recording.
 *
 * ## Wiring this after Codex's branch lands
 *
 * Three edits, all in this file and its one caller:
 *
 *  1. replace `NO_LIVE_TRANSPORT` with an implementation that calls the new
 *     live procedure (a tRPC subscription, or a chunk mutation that returns the
 *     latest event) and maps its output onto `LiveTutorServerEvent`;
 *  2. make `LiveTutorServerEvent["handoff"]` the new procedure's own output
 *     type instead of the structural type below, so the contract is inherited
 *     rather than restated;
 *  3. delete nothing else. `useContinuousTutorAudio` already responds to
 *     `interrupt` by finalising capture immediately, and `Home.tsx` already
 *     applies the handoff through the same trusted path a finished recording
 *     uses. No other file needs to know the transport changed.
 */
import type { TutorAction, LiveTutorSession } from "@shared/liveTutor";

/** The lesson a chunk belongs to. Reference only, exactly as `tutor.turn`. */
export type LiveSessionReference = { sessionId: string; revision: number };

/**
 * One slice of learner audio on its way to the server.
 *
 * Every field is about the audio or its place in the stream. There is
 * deliberately nowhere to put a judgement.
 */
export type LiveAudioChunk = {
  session: LiveSessionReference;
  /** 0-based, monotonic within one turn. Lets the server order late arrivals. */
  sequence: number;
  /** Milliseconds from the start of the turn to the start of this chunk. */
  offsetMs: number;
  /** Length of this chunk. */
  durationMs: number;
  /** Whether the turn had ended by the time this chunk was cut. */
  final: boolean;
  mimeType: string;
  audioBase64: string;
  /** Which recording the turn is: the engine's scope, never a guess (#53). */
  scope: "word" | "ayah";
};

/**
 * What the server may say while a learner is still reciting.
 *
 * `tracking` and `possible-omission` are provisional and exist so the UI can
 * stay honest while nothing is settled. Neither is ever rendered as a
 * judgement — see `isLearnerVisible`. `interrupt` is the authoritative one: it
 * carries the decided session and action, the same pair every other trusted
 * answer carries.
 */
export type LiveTutorServerEvent =
  | { type: "tracking"; expectedWordIndex: number }
  | { type: "possible-omission" }
  | { type: "confirmed-omission"; session: LiveTutorSession; action: TutorAction }
  | { type: "interrupt"; session: LiveTutorSession; action: TutorAction }
  | { type: "lost" };

/**
 * Whether an event may change what the learner sees.
 *
 * Only the two authoritative ones. A learner must never watch "maybe you missed
 * a word" flicker on and off while they recite — an unstable intermediate
 * judgement shown as a judgement is worse than no judgement, because they will
 * stop and correct something that was right. While the server is still
 * thinking, the screen says "Listening."
 */
export function isLearnerVisible(event: LiveTutorServerEvent): boolean {
  return event.type === "interrupt" || event.type === "lost";
}

/**
 * Whether an event should stop learner capture at once.
 *
 * This is the mid-ayah interruption, and it is not a silence event: the learner
 * is still speaking when it arrives. Capture stops on server authority, without
 * waiting for a pause.
 */
export function interruptsCapture(event: LiveTutorServerEvent): event is Extract<LiveTutorServerEvent, { type: "interrupt" }> {
  return event.type === "interrupt";
}

export type LiveTransportListener = (event: LiveTutorServerEvent) => void;

export interface TutorLiveTransport {
  /** True when this transport can actually reach a live server. */
  readonly available: boolean;
  open(session: LiveSessionReference): void;
  send(chunk: LiveAudioChunk): void;
  close(): void;
  subscribe(listener: LiveTransportListener): () => void;
}

/**
 * The transport in use until the live server exists.
 *
 * It accepts everything and emits nothing, so the hands-free lesson runs on
 * finalised turns alone: the learner recites, silence ends the turn, and the
 * correction arrives from `recitation.evaluateWithTutor` as it does today. That
 * is a working lesson, and it is honestly described as one — nothing in the UI
 * claims mid-ayah interruption while this is what is installed.
 */
export const NO_LIVE_TRANSPORT: TutorLiveTransport = {
  available: false,
  open() {},
  send() {},
  close() {},
  subscribe() {
    return () => {};
  },
};

/**
 * The transport the app is currently using.
 *
 * A single registration point rather than an import, for two reasons. The first
 * is the one that matters after Codex's branch lands: the live procedure can be
 * installed from wherever it is defined without `Home.tsx` learning anything
 * about it — `installTutorLiveTransport(myTransport)` at start-up is the whole
 * change. The second is that it makes the *response* to an interruption
 * testable today, before there is a server capable of producing one.
 */
let installedTransport: TutorLiveTransport = NO_LIVE_TRANSPORT;

/** Install the live transport. Call once, at start-up. */
export function installTutorLiveTransport(transport: TutorLiveTransport): void {
  installedTransport = transport;
}

/** Put the app back on finalised turns alone. */
export function resetTutorLiveTransport(): void {
  installedTransport = NO_LIVE_TRANSPORT;
}

/** Whatever is installed. `NO_LIVE_TRANSPORT` until something else is. */
export function tutorLiveTransport(): TutorLiveTransport {
  return installedTransport;
}

/**
 * A transport backed by a plain callback, for tests and for the adapter Codex's
 * procedure will be dropped into.
 *
 * It exists so the client behaviour that matters — capture stops the moment an
 * interrupt arrives, mid-word, and a stale silence event afterwards changes
 * nothing — is testable today, before there is a server that can produce one.
 */
export function createCallbackTransport(onChunk?: (chunk: LiveAudioChunk) => void): TutorLiveTransport & {
  emit: (event: LiveTutorServerEvent) => void;
  chunks: LiveAudioChunk[];
  opened: LiveSessionReference[];
  closed: number;
} {
  const listeners = new Set<LiveTransportListener>();
  const chunks: LiveAudioChunk[] = [];
  const opened: LiveSessionReference[] = [];
  return {
    available: true,
    chunks,
    opened,
    closed: 0,
    open(session) {
      opened.push(session);
    },
    send(chunk) {
      chunks.push(chunk);
      onChunk?.(chunk);
    },
    close() {
      this.closed += 1;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of Array.from(listeners)) listener(event);
    },
  };
}

/**
 * The trusted turn carried by an interruption, in the shape the tutor hook
 * already stores.
 *
 * Built here rather than in the page so there is exactly one place that says
 * "an interrupt is a trusted turn". It is a *server-decided* session and action
 * being passed through unchanged — nothing is derived, defaulted or repaired on
 * the way past, and if the fields ever stop matching what `tutor.turn` returns
 * this stops compiling at its call site.
 */
export function interruptHandoff(event: Extract<LiveTutorServerEvent, { type: "interrupt" }>) {
  return { status: "updated" as const, accepted: true, session: event.session, action: event.action };
}
