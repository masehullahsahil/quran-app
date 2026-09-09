/**
 * The seam where Codex's live Quran tracking will arrive.
 *
 * The locked requirement in the brief is that a learner must not have to finish
 * the ayah before the app notices a skipped word: when the server confidently
 * determines the learner has moved past `رَبِّ`, the teacher interrupts *there*.
 * Deciding that is server work — it needs the Quran text, the alignment and the
 * confidence model — and it is being built on another branch.
 *
 * That server landed in #61: `recitation.startLive` opens a stream against the
 * trusted Tutor session, and `recitation.ingestLiveAudio` takes ordered audio
 * chunks, aligns each server transcript against the canonical ayah, and emits
 * `word-omitted` only once its stability rule holds. This file is the browser
 * half, and only the browser half:
 *
 *  * a typed description of what the browser may send (audio, and where in the
 *    turn it came from) and what it may receive (a tracking signal, or an
 *    instruction to interrupt);
 *  * the rule that only a confirmed interruption is ever shown to a learner;
 *  * a no-op implementation, still the default, so a browser that cannot open a
 *    stream runs the lesson on finalised turns alone.
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
 * There is deliberately **no placeholder transport here any more.** Until #61
 * landed this file carried an inert `NO_LIVE_TRANSPORT` and a registry to swap
 * a real one in; both are gone, because the real one exists
 * (`hooks/useLiveRecitationStream.ts`) and code written as though a shipped
 * server had not shipped is code that lies about the system. A browser that
 * cannot open a stream simply has none, and the lesson runs on finalised turns.
 *
 * ## The types are inherited, not restated
 *
 * `LiveListeningDirective`, `LiveWordOmittedEvent` and `LiveInputAcknowledgement`
 * come from `shared/liveRecitation.ts`. If Codex changes the contract, this file
 * stops compiling instead of quietly sending the previous generation's payload
 * — the same rule `useLiveTutor` follows for the turn API.
 */
import type { TutorAction, LiveTutorSession } from "@shared/liveTutor";
import type {
  LiveAudioTurnContract,
  LiveInputAcknowledgement,
  LiveListeningDirective,
  LiveRecitationStreamSnapshot,
  LiveWordOmittedEvent,
} from "@shared/liveRecitation";

/** The lesson a chunk belongs to. Reference only, exactly as `tutor.turn`. */
export type LiveSessionReference = { sessionId: string; revision: number };

/**
 * One slice of learner audio on its way to the server.
 *
 * Shaped by `LiveAudioTurnContract` from the shared package, plus the audio
 * itself. Every field is about the recording or its place in the stream, and
 * there is deliberately nowhere to put a judgement: no missed word, no expected
 * word, no Quran position, no `shouldAdvance`, no correction result. The
 * browser has nothing to say about the Quran and this type is what makes that
 * true rather than a convention.
 *
 * The audio is **cumulative within a turn**, not the newest fragment alone. A
 * `MediaRecorder` timeslice after the first carries no container header, so a
 * lone fragment does not decode; and the server's stability rule needs every
 * canonical word before the target accounted for, which needs the whole
 * utterance so far. Each chunk is therefore a complete, playable recording of
 * the turn up to that moment.
 */
export type LiveAudioChunk = Omit<LiveAudioTurnContract, "streamId"> & {
  session: LiveSessionReference;
  mimeType: "audio/webm" | "audio/ogg" | "audio/wav" | "audio/mp4";
  audioBase64: string;
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
  /** The stream is following along. Provisional, and never rendered. */
  | { type: "tracking"; directive: LiveListeningDirective; stream: LiveRecitationStreamSnapshot | null }
  /**
   * The chunk was not applied: a duplicate, an out-of-order arrival, a stale
   * revision, or one the server refused. Not an error the learner sees.
   */
  | { type: "not-applied"; acknowledgement: LiveInputAcknowledgement }
  /**
   * A confirmed omission, and the instruction to interrupt. Carries the
   * server's decided turn, exactly as a finished recording's handoff does.
   */
  | { type: "interrupt"; omission: LiveWordOmittedEvent; session: LiveTutorSession; action: TutorAction }
  /** The stream or the lesson is gone. Nothing advances. */
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
 * Whether a directive means "keep sending me audio while the learner talks".
 *
 * The two the server accepts open chunks for. Anything else — a correction in
 * progress, playback, a wait, a stopped lesson — and the browser stops
 * streaming rather than sending chunks the server will refuse.
 */
export function acceptsInterimAudio(directive: LiveListeningDirective): boolean {
  return directive === "keep-listening" || directive === "listen-next-ayah";
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

/**
 * The trusted turn carried by an interruption, in the shape the tutor hook
 * already stores.
 *
 * Built here rather than in the hook so there is exactly one place that says
 * "an interrupt is a trusted turn". It is a *server-decided* session and action
 * being passed through unchanged — nothing is derived, defaulted or repaired on
 * the way past, and if the fields ever stop matching what `tutor.turn` returns
 * this stops compiling at its call site.
 */
export function interruptHandoff(event: Extract<LiveTutorServerEvent, { type: "interrupt" }>) {
  return { status: "updated" as const, accepted: true, session: event.session, action: event.action };
}
