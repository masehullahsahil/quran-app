/**
 * The live stream: rolling learner audio out, a server verdict back.
 *
 * This is what makes mid-ayah interruption real rather than a shape waiting for
 * one. While the learner is reciting, `useContinuousTutorAudio` cuts a rolling
 * chunk every `interimChunkMs`; this hook sends each one to
 * `recitation.ingestLiveAudio`, where the server transcribes it, aligns it
 * against the canonical ayah, and — only once its stability rule holds — emits
 * `word-omitted` and tells the browser to interrupt.
 *
 * **The browser sends audio and identifiers. Nothing else.** No Quran text, no
 * expected word, no current position, no correction decision. Every one of
 * those is loaded server-side from the trusted Tutor session; the input schema
 * is `.strict()` and has no field that could carry them. What comes back is not
 * a transcript to interpret either: an interruption arrives with the server's
 * own decided session and action, stored exactly as a finished recording's
 * handoff is stored.
 *
 * ## Ordering, and why there is a queue
 *
 * The server reserves **one in-flight input per stream** and accepts **exactly
 * the next sequence**. Firing two chunks at once would have one of them
 * rejected for a sequence gap, so this hook serialises: at most one request is
 * outstanding, and the next sequence is taken from the server's own
 * `acknowledgement.appliedSequence` rather than from a local counter that could
 * drift past a rejection.
 *
 * A rolling chunk that arrives while one is in flight is **dropped, not
 * queued**. Each chunk is cumulative — the whole utterance so far — so the next
 * one carries everything the dropped one did and more. Queueing them would send
 * the server a backlog of stale prefixes of audio it has already heard.
 *
 * ## A request whose outcome is unknown
 *
 * Every live request is in exactly one of three states, and the difference
 * between the last two is the whole of this section:
 *
 *   * **not sent** — nothing has left the browser, and the audio may be
 *     replaced freely by a newer, longer sample;
 *   * **unresolved** — it left the browser and no answer came back. The server
 *     may have transcribed it, confirmed an omission, moved the Tutor, and had
 *     its response lost on the way home;
 *   * **acknowledged** — the server answered, whatever it said.
 *
 * The dangerous case is the middle one, and the tempting mistake is to shrug
 * and send the next cumulative chunk. That is not a retry: it is a *different*
 * input, under a different chunk id, carrying different audio. The server has
 * no way to recognise it as the same logical operation, so the trusted outcome
 * it already committed — quite possibly an interruption the learner needs — is
 * never replayed, and the browser goes on reciting past a correction that has
 * already happened.
 *
 * So an unresolved request is **retained exactly** and retried byte for byte:
 * same stream, same session reference, same turn id, same chunk id, same
 * sequence, same audio, same timestamps, same stability, same scope. #63 keeps
 * the latest committed response and replays it for a duplicate of that input,
 * so the retry returns the original event, Tutor handoff, directive and result
 * without transcribing or applying anything twice. A replayed duplicate is
 * therefore processed exactly as the original answer would have been.
 *
 * Newer audio arriving meanwhile is dropped rather than sent — a later
 * cumulative sample contains it — and it may never leapfrog the unresolved
 * request. After a bounded number of attempts the stream gives up and closes:
 * the lesson falls back to finalised turns, which work, and nothing is
 * fabricated.
 *
 * ## Word turns are never streamed
 *
 * The live contract requires a focused word attempt to be a completed turn, and
 * the server refuses an open one. That is the right rule — half of a one-word
 * answer is not an answer — and the capture hook honours it by never cutting
 * rolling chunks for a word turn. The same goes for any turn taken while a
 * correction is open: the server refuses those too, and
 * `acceptsInterimAudio` is what stops them being sent.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { LiveListeningDirective } from "@shared/liveRecitation";
import type { SupportedLanguageCode } from "@shared/languages";
import type { LearningLevel } from "@shared/learningPath";
import {
  acceptsInterimAudio,
  type LiveSessionReference,
  type LiveTutorServerEvent,
} from "@/lib/tutorLiveTransport";
import type { InterimTurnAudio } from "./useContinuousTutorAudio";

export type UseLiveRecitationStreamInput = {
  /** False whenever the hands-free session is not running. */
  enabled: boolean;
  /** The trusted Tutor session, or null. Reference only. */
  reference: LiveSessionReference | null;
  learningLevel: LearningLevel;
  uiLanguage: SupportedLanguageCode;
  /** Every server answer, already mapped. The caller decides what to show. */
  onEvent: (event: LiveTutorServerEvent) => void;
  /**
   * Additive validation instrumentation. Called when the live path gives up
   * after its bounded retries. Never changes streaming behavior.
   */
  onInstrument?: (kind: "interim.abandoned", details: Record<string, unknown>) => void;
};

/**
 * How hard the browser tries to resolve a request whose outcome it does not
 * know.
 *
 * Bounded on purpose. The point of retrying is to learn what the server already
 * decided, not to get audio through at any cost: if the live path is down, the
 * lesson still works on finalised turns and that is where it should end up
 * rather than in an unbounded loop.
 */
export const LIVE_RETRY = {
  /** Attempts in total, including the first send. */
  maxAttempts: 3,
  /** Wait between attempts. Short: an interruption the learner is owed. */
  delayMs: 400,
} as const;

/** The exact request, kept so a retry can be the same logical input. */
type LiveIngestPayload = {
  session: LiveSessionReference;
  streamId: string;
  turnId: string;
  chunkId: string;
  sequence: number;
  attemptScope: "ayah";
  stability: "interim";
  turnComplete: false;
  captureStartedAtMs: number;
  captureEndedAtMs: number;
  audioBase64: string;
  mimeType: InterimTurnAudio["mimeType"];
  learningLevel: LearningLevel;
  uiLanguage: SupportedLanguageCode;
};

type UnresolvedRequest = { payload: LiveIngestPayload; attempts: number };

export type LiveRecitationStream = {
  /** True once the server has bound a stream to this lesson. */
  open: boolean;
  /** The last directive the server gave. `wait` until it has given one. */
  directive: LiveListeningDirective;
  /** Send one rolling chunk. Dropped when the server would refuse it. */
  sendInterim: (chunk: InterimTurnAudio) => void;
  /** True while a request's outcome is unknown. Diagnostics only. */
  awaitingAnswer: boolean;
  /**
   * True once the live path was given up on for this session after its bounded
   * retries. A non-blocking UI indicator: the lesson continues on finalised
   * turns, and the learner is never stuck waiting on a stream that is gone.
   */
  interimAbandoned: boolean;
};

/** A blob as the routes want it: base64, without the data-URL prefix. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The recording could not be read."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

/**
 * A fresh id for every chunk the browser sends.
 *
 * Deliberately not `turnId:sequence`. The sequence does not advance when the
 * server declines a chunk, so an id built from it would repeat — and the server
 * deduplicates open chunks *by chunk id*, so the retry would be dismissed as a
 * duplicate no matter how much new audio it carried. The stream would go quiet
 * for the rest of the ayah and the omission would never be confirmed.
 *
 * Idempotency is not lost by this: the server also digests the audio, so a real
 * network retry of identical bytes is still caught. What changes is that a
 * *different* recording gets a different id, which is what it is.
 */
function chunkId(turnId: string, attempt: number): string {
  return `${turnId}:${attempt}`;
}

export function useLiveRecitationStream(input: UseLiveRecitationStreamInput): LiveRecitationStream {
  const startLive = trpc.recitation?.startLive?.useMutation?.();
  const ingest = trpc.recitation?.ingestLiveAudio?.useMutation?.();

  const [open, setOpen] = useState(false);
  const [directive, setDirective] = useState<LiveListeningDirective>("wait");
  const [awaitingAnswer, setAwaitingAnswer] = useState(false);
  const [interimAbandoned, setInterimAbandoned] = useState(false);

  const streamIdRef = useRef<string | null>(null);
  /** The last sequence the server says it applied. The next one is this plus 1. */
  const appliedSequenceRef = useRef(0);
  /** The request whose outcome is unknown, retained exactly for retry. */
  const unresolvedRef = useRef<UnresolvedRequest | null>(null);
  const inFlightRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** How many chunks this browser has sent. Only ever used to make ids unique. */
  const sentCountRef = useRef(0);
  const directiveRef = useRef<LiveListeningDirective>("wait");
  /** Which session+revision an open was already attempted for. */
  const openedForRef = useRef<string | null>(null);
  /** Set once the live path has been given up on for this session. */
  const abandonedRef = useRef(false);
  const latest = useRef(input);
  latest.current = input;

  const setChannel = useCallback((next: LiveListeningDirective) => {
    directiveRef.current = next;
    setDirective(next);
  }, []);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const closeStream = useCallback(() => {
    clearRetry();
    streamIdRef.current = null;
    appliedSequenceRef.current = 0;
    sentCountRef.current = 0;
    unresolvedRef.current = null;
    inFlightRef.current = false;
    openedForRef.current = null;
    setAwaitingAnswer(false);
    setOpen(false);
    setChannel("wait");
  }, [clearRetry, setChannel]);

  /**
   * What the server said, applied once.
   *
   * The same function handles an original answer and a replayed duplicate,
   * which is the point: #63 gives a duplicate of the latest committed input the
   * original's event, handoff, directive and result, so there is nothing to
   * treat differently. An interruption acted on twice is harmless anyway — the
   * turn is already closed and the handoff carries the same revision, so the
   * teaching sequence is keyed to the same plan and performed once.
   */
  const handleAnswer = useCallback((answer: NonNullable<Awaited<ReturnType<NonNullable<typeof ingest>["mutateAsync"]>>>) => {
    appliedSequenceRef.current = answer.acknowledgement.appliedSequence;
    setChannel(answer.nextChannel);

    if (answer.acknowledgement.status === "lost-stream") {
      // The stream is gone — a serverless instance was recycled. Fail closed:
      // stop streaming rather than sending chunks into a stream nobody holds.
      // The lesson itself is a separate question, and the next finalised turn
      // is what answers it.
      closeStream();
      latest.current.onEvent({ type: "not-applied", acknowledgement: answer.acknowledgement });
      return;
    }
    if (answer.tutor?.status === "lost") {
      latest.current.onEvent({ type: "lost" });
      return;
    }
    // The one authoritative outcome, whether this answer is the original or
    // #63 replaying it. Everything needed to act on it is here: the omission
    // the server confirmed and the turn it decided. Nothing is derived.
    if (answer.event && answer.tutor?.status === "updated" && answer.tutor.session) {
      latest.current.onEvent({
        type: "interrupt",
        omission: answer.event,
        session: answer.tutor.session,
        action: answer.tutor.action,
      });
      return;
    }
    if (answer.acknowledgement.status !== "applied") {
      // A duplicate carrying nothing authoritative, an out-of-order arrival, or
      // a chunk the server refused. Bookkeeping, and never learner-visible.
      latest.current.onEvent({ type: "not-applied", acknowledgement: answer.acknowledgement });
      return;
    }
    // Following along. Provisional by definition, and never rendered as a
    // correction: `possible-skip` lives in here and stays here.
    latest.current.onEvent({ type: "tracking", directive: answer.nextChannel, stream: answer.stream });
  }, [closeStream, setChannel]);

  /**
   * Attempt one request, and hold onto it until its outcome is known.
   *
   * A rejection is not a failure to send — it is a failure to *learn what
   * happened*. The request stays exactly as it was so the next attempt is the
   * same logical input and #63 can recognise it.
   */
  const attempt = useCallback((request: UnresolvedRequest) => {
    const mutate = ingest?.mutateAsync;
    if (!mutate) return;
    inFlightRef.current = true;
    setAwaitingAnswer(true);
    void Promise.resolve(mutate(request.payload))
      .then((answer) => {
        // Resolved, whatever it says. The request is no longer unknown.
        unresolvedRef.current = null;
        setAwaitingAnswer(false);
        if (answer) handleAnswer(answer);
      })
      .catch(() => {
        request.attempts += 1;
        if (request.attempts >= LIVE_RETRY.maxAttempts) {
          // Bounded. The live path is down; the lesson continues on finalised
          // turns, and nothing about the Quran is invented to cover the gap.
          // This was previously silent, which made "the tutor stopped
          // interrupting mid-ayah" indistinguishable from "the learner stopped
          // making mistakes". Record the give-up and raise the indicator.
          unresolvedRef.current = null;
          abandonedRef.current = true;
          setInterimAbandoned(true);
          latest.current.onInstrument?.("interim.abandoned", { attempts: request.attempts });
          closeStream();
          return;
        }
        unresolvedRef.current = request;
        clearRetry();
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          const pending = unresolvedRef.current;
          if (pending && !inFlightRef.current) attempt(pending);
        }, LIVE_RETRY.delayMs);
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [clearRetry, closeStream, handleAnswer, ingest]);

  /**
   * Open a stream for this lesson.
   *
   * One per tutor session. The server generates the id and binds it to the
   * session it already holds; the browser names the session and nothing else.
   * A failure here is not an error the learner reads — the lesson simply runs
   * on finalised turns, which is the whole feature minus the interruption.
   *
   * Keyed by session *and revision*: a bind refused as stale is not retried at
   * the same revision, and is retried at the next one. `Home.tsx` awaits the
   * `start` handoff before enabling this at all, so the first attempt already
   * names the revision that intent produced.
   */
  useEffect(() => {
    const reference = input.reference;
    if (!input.enabled || !reference || !startLive?.mutateAsync || abandonedRef.current) {
      if (!input.enabled || !reference) {
        abandonedRef.current = false;
        setInterimAbandoned(false);
        closeStream();
      }
      return;
    }
    const key = `${reference.sessionId}#${reference.revision}`;
    if (openedForRef.current === key || streamIdRef.current) return;
    openedForRef.current = key;
    // A new session gets a clean indicator; a previous abandonment must not
    // linger into a lesson that has a working stream again.
    setInterimAbandoned(false);

    void Promise.resolve(startLive.mutateAsync({ session: reference }))
      .then((answer) => {
        if (!answer) return;
        if (!answer.stream) {
          // Stale, lost, or a lesson in a state that cannot be streamed.
          // Nothing is invented from here.
          streamIdRef.current = null;
          setOpen(false);
          if (answer.tutor?.status === "lost") latest.current.onEvent({ type: "lost" });
          return;
        }
        streamIdRef.current = answer.stream.streamId;
        appliedSequenceRef.current = answer.stream.lastSequence;
        setOpen(true);
        setChannel(answer.nextChannel);
      })
      .catch(() => {
        // Unreachable is not lost. The lesson keeps working on finalised turns,
        // and a later revision may open a stream successfully.
        streamIdRef.current = null;
        setOpen(false);
      });
  }, [input.enabled, input.reference?.sessionId, input.reference?.revision, startLive, closeStream, setChannel]);

  useEffect(() => () => closeStream(), [closeStream]);

  const sendInterim = useCallback((chunk: InterimTurnAudio) => {
    const streamId = streamIdRef.current;
    const reference = latest.current.reference;
    if (!streamId || !reference || !ingest?.mutateAsync) return;
    // The server refuses an open chunk during a correction or a word turn.
    // Reading its own directive is how the browser knows without reasoning
    // about the lesson.
    if (!acceptsInterimAudio(directiveRef.current)) return;
    if (chunk.scope !== "ayah") return;
    // One uncertain request at a time, and newer audio never leapfrogs it. The
    // next cumulative sample contains everything this one would have, so
    // dropping costs nothing; sending would ask the server a different question
    // while the answer to the last one is still unknown.
    if (inFlightRef.current || unresolvedRef.current) return;

    const sequence = appliedSequenceRef.current + 1;
    sentCountRef.current += 1;
    const attemptId = sentCountRef.current;
    void blobToBase64(chunk.blob)
      .then((audioBase64) => {
        // Guard again: encoding is asynchronous, and the world may have moved.
        if (streamIdRef.current !== streamId) return;
        if (inFlightRef.current || unresolvedRef.current) return;
        const request: UnresolvedRequest = {
          attempts: 0,
          payload: {
            session: reference,
            streamId,
            turnId: chunk.turnId,
            chunkId: chunkId(chunk.turnId, attemptId),
            sequence,
            attemptScope: "ayah",
            // Open utterance: the tracker may reach `possible-skip` from one of
            // these, and nothing more. Only a completed turn can be evaluated.
            stability: "interim",
            turnComplete: false,
            captureStartedAtMs: Math.max(0, Math.round(chunk.captureStartedAtMs)),
            captureEndedAtMs: Math.max(0, Math.round(chunk.captureEndedAtMs)),
            audioBase64,
            mimeType: chunk.mimeType,
            learningLevel: latest.current.learningLevel,
            uiLanguage: latest.current.uiLanguage,
          },
        };
        // Unknown from the moment it leaves, not from the moment it fails.
        unresolvedRef.current = request;
        attempt(request);
      })
      .catch(() => {
        // The blob could not be read. Nothing was sent, so nothing is unknown.
      });
  }, [attempt, ingest]);

  return { open, directive, sendInterim, awaitingAnswer, interimAbandoned };
}
