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
};

export type LiveRecitationStream = {
  /** True once the server has bound a stream to this lesson. */
  open: boolean;
  /** The last directive the server gave. `wait` until it has given one. */
  directive: LiveListeningDirective;
  /** Send one rolling chunk. Dropped when the server would refuse it. */
  sendInterim: (chunk: InterimTurnAudio) => void;
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

  const streamIdRef = useRef<string | null>(null);
  /** The last sequence the server says it applied. The next one is this plus 1. */
  const appliedSequenceRef = useRef(0);
  const inFlightRef = useRef(false);
  /** How many chunks this browser has sent. Only ever used to make ids unique. */
  const sentCountRef = useRef(0);
  const directiveRef = useRef<LiveListeningDirective>("wait");
  const openedForRef = useRef<string | null>(null);
  const latest = useRef(input);
  latest.current = input;

  const setChannel = useCallback((next: LiveListeningDirective) => {
    directiveRef.current = next;
    setDirective(next);
  }, []);

  const closeStream = useCallback(() => {
    streamIdRef.current = null;
    appliedSequenceRef.current = 0;
    sentCountRef.current = 0;
    inFlightRef.current = false;
    openedForRef.current = null;
    setOpen(false);
    setChannel("wait");
  }, [setChannel]);

  /**
   * Open a stream for this lesson.
   *
   * One per tutor session. The server generates the id and binds it to the
   * session it already holds; the browser names the session and nothing else.
   * A failure here is not an error the learner reads — the lesson simply runs
   * on finalised turns, which is the whole feature minus the interruption.
   */
  useEffect(() => {
    const reference = input.reference;
    if (!input.enabled || !reference || !startLive?.mutateAsync) {
      if (!input.enabled || !reference) closeStream();
      return;
    }
    const key = reference.sessionId;
    if (openedForRef.current === key) return;
    openedForRef.current = key;

    void Promise.resolve(startLive.mutateAsync({ session: reference }))
      .then((answer) => {
        if (!answer) return;
        if (!answer.stream) {
          // The lesson is stale, lost, or not in a state that can be streamed.
          // Nothing is invented from here.
          closeStream();
          if (answer.tutor?.status === "lost") latest.current.onEvent({ type: "lost" });
          return;
        }
        streamIdRef.current = answer.stream.streamId;
        appliedSequenceRef.current = answer.stream.lastSequence;
        setOpen(true);
        setChannel(answer.nextChannel);
      })
      .catch(() => {
        // Unreachable is not lost. The lesson keeps working on finalised turns.
        closeStream();
      });
  }, [input.enabled, input.reference?.sessionId, startLive, closeStream, setChannel]);

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
    // One in flight. The next chunk is cumulative and carries everything this
    // one would have, so dropping is lossless.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const sequence = appliedSequenceRef.current + 1;
    sentCountRef.current += 1;
    const attempt = sentCountRef.current;
    void blobToBase64(chunk.blob)
      .then((audioBase64) => ingest.mutateAsync({
        session: reference,
        streamId,
        turnId: chunk.turnId,
        chunkId: chunkId(chunk.turnId, attempt),
        sequence,
        attemptScope: "ayah" as const,
        // Open utterance: the tracker may reach `possible-skip` from one of
        // these, and nothing more. Only a completed turn can be evaluated.
        stability: "interim" as const,
        turnComplete: false,
        captureStartedAtMs: Math.max(0, Math.round(chunk.captureStartedAtMs)),
        captureEndedAtMs: Math.max(0, Math.round(chunk.captureEndedAtMs)),
        audioBase64,
        mimeType: chunk.mimeType,
        learningLevel: latest.current.learningLevel,
        uiLanguage: latest.current.uiLanguage,
      }))
      .then((answer) => {
        if (!answer) return;
        appliedSequenceRef.current = answer.acknowledgement.appliedSequence;
        setChannel(answer.nextChannel);

        if (answer.tutor?.status === "lost") {
          latest.current.onEvent({ type: "lost" });
          return;
        }
        // The one authoritative outcome. Everything needed to act on it is in
        // the answer: the omission the server confirmed, and the turn it
        // decided. Nothing is derived here.
        if (answer.event && answer.tutor?.status === "updated" && answer.tutor.session) {
          latest.current.onEvent({
            type: "interrupt",
            omission: answer.event,
            session: answer.tutor.session,
            action: answer.tutor.action,
          });
          return;
        }
        if (answer.acknowledgement.status === "lost-stream") {
          // The stream is gone — a serverless instance was recycled. Fail
          // closed: stop streaming rather than sending chunks into a stream
          // nobody is holding. The lesson itself is a separate question, and
          // the next finalised turn is what answers it.
          closeStream();
          latest.current.onEvent({ type: "not-applied", acknowledgement: answer.acknowledgement });
          return;
        }
        if (answer.acknowledgement.status !== "applied") {
          // A duplicate, a retry, an out-of-order arrival, or a chunk the
          // server refused. Not an error, and not visible.
          latest.current.onEvent({ type: "not-applied", acknowledgement: answer.acknowledgement });
          return;
        }
        // Following along. Provisional by definition, and never rendered as a
        // correction: `possible-skip` lives in here and stays here.
        latest.current.onEvent({ type: "tracking", directive: answer.nextChannel, stream: answer.stream });
      })
      .catch(() => {
        // A failed chunk changes nothing. The sequence has not advanced, so the
        // next rolling chunk takes the same number and carries the same audio.
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [closeStream, ingest, setChannel]);

  return { open, directive, sendInterim };
}
