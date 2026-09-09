/**
 * One microphone, held open for the whole lesson.
 *
 * The interaction this replaces was `Start → Done → Try again → Done`: the
 * learner operated a recorder, and every turn cost them two taps and a fresh
 * permission-shaped moment. What a teacher actually does is listen — once you
 * begin, they keep listening, and they speak when they have something to say.
 *
 * So this hook opens the microphone once and keeps the tracks for the whole
 * session, cutting individual `MediaRecorder` segments inside it. The learner
 * never presses record again.
 *
 * ## What it owns, and what it must not touch
 *
 * It owns: permission, the stream, the analyser gate, segment boundaries,
 * duplicate suppression, playback suspension, and cleanup. It owns nothing
 * about the Quran. It does not know which ayah is on screen, what word is being
 * corrected, or whether an attempt was any good; a finalised segment is handed
 * to the caller with the scope the tutor asked for, and that is the end of this
 * hook's involvement.
 *
 * ## A turn is an object, not a global
 *
 * Every turn carries its own recorder, its own chunk array, its own ids and its
 * own submit decision. The recorder's handlers close over *that* object, so a
 * `dataavailable` arriving late — after the turn was abandoned, after a new one
 * opened — lands in the array of the turn it belongs to and can never leak into
 * a later submission. There is no shared chunk buffer to get confused.
 *
 * ## Three ways a turn ends, and why they are not the same
 *
 *  1. **Silence.** The detector reports a sustained pause; the turn is
 *     submitted. The ordinary case.
 *  2. **The safety cap.** A microphone that never hears silence still has to
 *     stop. Submitted, because whatever was captured is a real attempt.
 *  3. **Server interruption.** The server has determined mid-ayah that a word
 *     was skipped, and says so while the learner is still speaking. Capture
 *     stops *at once*, without waiting for a pause — and the partial audio is
 *     **discarded**, not submitted. The server has already decided; sending it
 *     the same speech again for a second opinion would be asking a question
 *     that has been answered, and the two answers could disagree.
 *
 * ## Why closing is two steps
 *
 * `MediaRecorder.stop()` does not finish the recording synchronously. It
 * delivers one last `dataavailable` holding everything captured since the
 * previous slice, and only then fires `onstop`. Assembling the blob at the
 * moment of stopping therefore drops the tail of the turn: the final consonant
 * of an ayah, the end of `ٱلْعَـٰلَمِينَ`, or most of a one-word answer, which is
 * short enough to live almost entirely inside that last slice.
 *
 * So closing a turn *decides* whether it will be submitted and then waits. The
 * recorder's own `onstop` — or a timeout, if a recorder never reports —
 * assembles the blob and submits it if, and only if, that decision was yes.
 * Deciding and assembling are separate, which is what lets an interruption
 * stop capture instantly while the recorder finishes flushing into a turn
 * nobody will ever read.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceActivity, voiceActivitySupported } from "./useVoiceActivity";
import { HANDS_FREE_TIMING } from "@/lib/handsFreePlan";
import {
  canCapture,
  type MicrophoneFailure,
  type TutorAudioState,
} from "@/lib/tutorAudioState";
import {
  voiceActivityConfigFor,
  type VoiceActivityEvent,
  type VoiceActivityState,
} from "@/lib/voiceActivity";

export type TutorTurnScope = "word" | "ayah";

/** Why a turn ended. Only the first three produce a recording to submit. */
export type TurnEndReason = "silence" | "max-turn" | "manual" | "interrupt" | "abandoned";

/** The MIME types the trusted routes accept. */
export type TurnMimeType = "audio/webm" | "audio/ogg" | "audio/wav" | "audio/mp4";

export type FinalisedTurn = {
  blob: Blob;
  mimeType: TurnMimeType;
  scope: TutorTurnScope;
  reason: Extract<TurnEndReason, "silence" | "max-turn" | "manual">;
  /** The id the server knows this turn by. Stable across retries. */
  turnId: string;
  captureStartedAtMs: number;
  captureEndedAtMs: number;
};

/**
 * Rolling audio, cut while the learner is still reciting.
 *
 * **Cumulative, not incremental.** A `MediaRecorder` timeslice after the first
 * carries no container header, so a lone fragment does not decode; and the
 * server's stability rule needs every canonical word before the target
 * accounted for, which needs the whole utterance so far. Each of these is a
 * complete, playable recording of the turn up to that moment.
 */
export type InterimTurnAudio = {
  blob: Blob;
  mimeType: TurnMimeType;
  scope: TutorTurnScope;
  turnId: string;
  captureStartedAtMs: number;
  captureEndedAtMs: number;
};

export type UseContinuousTutorAudioInput = {
  /**
   * A finalised learner recording, ready for the trusted route.
   *
   * Never called for an interrupted or abandoned turn: those produce no
   * attempt, by design.
   */
  onTurn: (turn: FinalisedTurn) => void;
  /**
   * Rolling audio while the learner is still going.
   *
   * Only ever called for an ayah-scoped turn: the live contract requires a
   * focused word attempt to be a completed turn, and a partial one would be
   * refused. Ignored entirely when the caller supplies no handler, which is
   * what happens when no live stream is open.
   */
  onInterim?: (chunk: InterimTurnAudio) => void;
  /** The learner has been armed and quiet for a long time. */
  onIdle?: () => void;
  /** The microphone could not be used. The caller falls back to manual Study. */
  onUnavailable?: (failure: MicrophoneFailure) => void;
};

export type ContinuousTutorAudio = {
  /** Whether a hands-free session could run in this browser at all. */
  supported: boolean;
  /** True between `start` and `stop`. */
  active: boolean;
  state: TutorAudioState;
  failure: MicrophoneFailure | null;
  /** The scope of the turn currently open, or null. */
  scope: TutorTurnScope | null;
  /** The id of the turn currently open, or null. */
  turnId: string | null;
  /** The last measured input level, for the meter. Not a Quran signal. */
  level: number;
  /** Ask for the microphone and hold it. Resolves false on any failure. */
  start: () => Promise<boolean>;
  /** Open a turn in this scope. Ignored while the app is audible or checking. */
  listen: (scope: TutorTurnScope) => void;
  /** End the open turn and submit it, as a manual fallback control would. */
  finish: () => void;
  /**
   * Server authority: stop collecting now, discard the partial turn.
   *
   * Not a silence event and not overridable by one — a detector still reporting
   * "speaking" cannot undo this, because the turn has already been taken and
   * marked never-submit before the recorder has even finished flushing.
   */
  interrupt: () => void;
  /** The app is about to be audible. Capture stops; nothing is submitted. */
  holdForPlayback: (kind: "coach" | "qari") => void;
  /** The app has stopped being audible. Capture does not resume by itself. */
  releasePlayback: () => void;
  /** An attempt is with the server. Blocks a new turn until it is not. */
  setChecking: (checking: boolean) => void;
  /** The learner stepped away. The lesson's place is not this hook's business. */
  pause: () => void;
  /** Back from a pause. Does not itself open a turn — the tutor decides that. */
  resume: () => void;
  /** End the session and release the microphone. */
  stop: () => void;
  /** The lesson is gone. Capture stops and nothing resumes. */
  markSessionLost: () => void;
};

const MIME_CANDIDATES: TurnMimeType[] = ["audio/webm", "audio/ogg", "audio/mp4"];

function preferredMimeType(): TurnMimeType | undefined {
  const recorder = typeof window !== "undefined" ? window.MediaRecorder : undefined;
  if (!recorder?.isTypeSupported) return undefined;
  return MIME_CANDIDATES.find((type) => recorder.isTypeSupported(type));
}

/** Whatever the recorder actually produced, narrowed to what the routes take. */
function turnMimeType(recorded: string | undefined): TurnMimeType {
  const base = (recorded ?? "").split(";")[0].trim();
  return (MIME_CANDIDATES as string[]).includes(base) || base === "audio/wav"
    ? (base as TurnMimeType)
    : "audio/webm";
}

function newTurnId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `turn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function continuousAudioSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder === "function" && voiceActivitySupported();
}

/**
 * Everything about one turn, including the recorder that is filling it.
 *
 * The recorder's handlers close over this object. That is the whole defence
 * against a late event from a previous recorder reaching a later turn: there is
 * no shared array for it to land in.
 */
type OpenTurn = {
  id: number;
  turnId: string;
  scope: TutorTurnScope;
  startedAtMs: number;
  endedAtMs: number | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  /** Null while the turn is open; set once by `closeTurn` and never again. */
  submit: boolean | null;
  /** Why it closed. Only meaningful once `submit` is set. */
  endReason: TurnEndReason;
  /** True once assembled, so `onstop` and the flush timeout cannot both run. */
  settled: boolean;
  flushTimer: ReturnType<typeof setTimeout> | null;
};

export function useContinuousTutorAudio(input: UseContinuousTutorAudioInput): ContinuousTutorAudio {
  const [state, setState] = useState<TutorAudioState>("idle");
  const [failure, setFailure] = useState<MicrophoneFailure | null>(null);
  const [scope, setScope] = useState<TutorTurnScope | null>(null);
  const [turnId, setTurnId] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const turnCounterRef = useRef(0);
  const openTurnRef = useRef<OpenTurn | null>(null);
  const interimTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<TutorAudioState>("idle");
  const activeRef = useRef(false);
  const checkingRef = useRef(false);

  const callbacks = useRef(input);
  callbacks.current = input;

  const applyState = useCallback((next: TutorAudioState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const stopInterimTimer = useCallback(() => {
    if (interimTimerRef.current !== null) {
      clearInterval(interimTimerRef.current);
      interimTimerRef.current = null;
    }
  }, []);

  /**
   * Assemble a closed turn and hand it on, if it was one to hand on.
   *
   * Runs from the recorder's `onstop`, or from the flush timeout when a
   * recorder never reports. Either way it runs once: `settled` is the guard,
   * and an abandoned turn assembles nothing at all.
   */
  const settleTurn = useCallback((turn: OpenTurn) => {
    if (turn.settled) return;
    turn.settled = true;
    if (turn.flushTimer !== null) {
      clearTimeout(turn.flushTimer);
      turn.flushTimer = null;
    }
    // The decision was made when the turn closed and cannot be revisited here.
    // An interrupted or abandoned turn has a recorder that is still flushing
    // into `turn.chunks`; those blobs are simply never read.
    if (turn.submit !== true) return;

    const mimeType = turnMimeType(turn.chunks[0]?.type || turn.recorder?.mimeType);
    const blob = new Blob(turn.chunks, { type: mimeType });
    callbacks.current.onTurn({
      blob,
      mimeType,
      scope: turn.scope,
      reason: turn.endReason as FinalisedTurn["reason"],
      turnId: turn.turnId,
      captureStartedAtMs: turn.startedAtMs,
      captureEndedAtMs: turn.endedAtMs ?? Date.now(),
    });
  }, []);

  /**
   * Close the open turn.
   *
   * The one place a turn ends, whatever ended it. The open turn is taken and
   * the ref cleared in a single step, so every duplicate — a recorder firing
   * `onstop` twice, a detector reporting silence after an interrupt already
   * closed the turn, a caller stopping a turn that has ended — arrives second
   * and finds nothing to close.
   *
   * It decides; it does not assemble. See `settleTurn`.
   */
  const closeTurn = useCallback((reason: TurnEndReason) => {
    const turn = openTurnRef.current;
    if (!turn) return;
    openTurnRef.current = null;
    stopInterimTimer();
    vadRef.current?.disarm();
    setScope(null);
    setTurnId(null);

    turn.endedAtMs = Date.now();
    turn.endReason = reason;
    turn.submit = reason === "silence" || reason === "max-turn" || reason === "manual";

    const recorder = turn.recorder;
    if (!recorder || recorder.state === "inactive") {
      // Nothing more is coming. Safe to assemble now.
      settleTurn(turn);
      return;
    }

    if (turn.submit) {
      // Show the learner that their turn is with the teacher straight away,
      // rather than after the recorder has finished flushing.
      applyState("checking");
      checkingRef.current = true;
      // The recorder still owes us one `dataavailable` with the tail of the
      // recitation. `onstop` assembles once it arrives; this is the cap for a
      // recorder that never gets there.
      turn.flushTimer = setTimeout(() => settleTurn(turn), HANDS_FREE_TIMING.recorderFlushMs);
    }

    try {
      recorder.stop();
    } catch {
      // A recorder the browser already closed. Whatever it gave us is what
      // there is.
      settleTurn(turn);
    }
  }, [applyState, settleTurn, stopInterimTimer]);

  /**
   * The detector's report, turned into either a timing event or a turn end.
   *
   * Note what is *not* here: any reading of what the learner said. A turn ends
   * because of silence and duration, and what it contained is the server's to
   * assess.
   */
  const handleVoiceEvent = useCallback((event: VoiceActivityEvent, _state: VoiceActivityState) => {
    // A frame that arrives after the turn closed — the timer had one more tick
    // in flight when the server interrupted — changes nothing.
    if (!openTurnRef.current) return;
    if (!canCapture(stateRef.current)) return;

    switch (event) {
      case "speech-started":
        applyState("learner-speaking");
        return;
      // A pause inside recitation. Nothing about the capture changes, which is
      // the entire point of having a short-pause threshold at all.
      case "short-silence":
      case "prolonged-silence":
        return;
      case "no-speech-yet":
        callbacks.current.onIdle?.();
        return;
      case "turn-ended":
        closeTurn("silence");
        return;
      case "max-turn":
        closeTurn("max-turn");
        return;
    }
  }, [applyState, closeTurn]);

  const vad = useVoiceActivity({ onEvent: handleVoiceEvent });
  const vadRef = useRef(vad);
  vadRef.current = vad;

  const releaseMicrophone = useCallback(() => {
    stopInterimTimer();
    vadRef.current?.release();
    const turn = openTurnRef.current;
    if (turn?.recorder && turn.recorder.state !== "inactive") {
      try { turn.recorder.stop(); } catch { /* already stopped */ }
    }
    // The tracks are the microphone. Stopping them is what turns the browser's
    // recording indicator off, and it is not optional on the way out.
    streamRef.current?.getTracks().forEach((track) => {
      try { track.stop(); } catch { /* a track the browser already ended */ }
    });
    streamRef.current = null;
    openTurnRef.current = null;
  }, [stopInterimTimer]);

  const start = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) {
      activeRef.current = true;
      setActive(true);
      return true;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setFailure("no-device");
      applyState("microphone-unavailable");
      callbacks.current.onUnavailable?.("no-device");
      return false;
    }
    if (typeof window === "undefined" || typeof window.MediaRecorder !== "function") {
      setFailure("recorder-unsupported");
      applyState("microphone-unavailable");
      callbacks.current.onUnavailable?.("recorder-unsupported");
      return false;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Refusal and absence look the same from here and lead to the same
      // place: manual Study, which works, and which is never called hands-free.
      setFailure("permission-denied");
      applyState("microphone-unavailable");
      callbacks.current.onUnavailable?.("permission-denied");
      return false;
    }
    streamRef.current = stream;
    if (!vadRef.current.attach(stream)) {
      // The stream is real but nothing can analyse it. Hand the microphone back
      // rather than holding a device for a feature that cannot run.
      releaseMicrophone();
      setFailure("analysis-unsupported");
      applyState("microphone-unavailable");
      callbacks.current.onUnavailable?.("analysis-unsupported");
      return false;
    }
    setFailure(null);
    activeRef.current = true;
    setActive(true);
    applyState("waiting");
    return true;
  }, [applyState, releaseMicrophone]);

  /**
   * Cut one rolling chunk from the turn as it stands.
   *
   * Only for an ayah turn, only once the learner has actually started, and only
   * where the caller wants them. A focused word attempt is never streamed: the
   * live contract requires it to be a completed turn, and a partial one would
   * be refused — correctly, because half of a one-word answer is not an answer.
   */
  const cutInterim = useCallback(() => {
    const turn = openTurnRef.current;
    if (!turn || turn.scope !== "ayah") return;
    if (!callbacks.current.onInterim) return;
    if (stateRef.current !== "learner-speaking") return;
    if (!turn.chunks.length) return;
    const mimeType = turnMimeType(turn.chunks[0]?.type || turn.recorder?.mimeType);
    callbacks.current.onInterim({
      // Cumulative: the whole utterance so far, so it decodes on its own and
      // the server can align every word before the one it is asking about.
      blob: new Blob(turn.chunks, { type: mimeType }),
      mimeType,
      scope: turn.scope,
      turnId: turn.turnId,
      captureStartedAtMs: turn.startedAtMs,
      captureEndedAtMs: Date.now(),
    });
  }, []);

  const listen = useCallback((nextScope: TutorTurnScope) => {
    if (!activeRef.current || !streamRef.current) return;
    if (checkingRef.current) return;
    // Never on top of the app's own voice, and never on top of an open turn.
    if (stateRef.current === "app-speaking" || stateRef.current === "qari-playing") return;
    if (stateRef.current === "paused" || stateRef.current === "session-lost" || stateRef.current === "microphone-unavailable") return;
    if (openTurnRef.current) return;

    const id = turnCounterRef.current + 1;
    turnCounterRef.current = id;
    const turn: OpenTurn = {
      id,
      turnId: newTurnId(),
      scope: nextScope,
      startedAtMs: Date.now(),
      endedAtMs: null,
      recorder: null,
      chunks: [],
      submit: null,
      settled: false,
      flushTimer: null,
      endReason: "abandoned",
    };

    let recorder: MediaRecorder;
    try {
      const mimeType = preferredMimeType();
      recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    } catch {
      try {
        recorder = new MediaRecorder(streamRef.current);
      } catch {
        setFailure("recorder-unsupported");
        applyState("microphone-unavailable");
        callbacks.current.onUnavailable?.("recorder-unsupported");
        return;
      }
    }
    turn.recorder = recorder;

    // Both handlers close over `turn`. A late event from this recorder lands in
    // this turn's array however many turns have started since, and an abandoned
    // turn's array is never read.
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data?.size) turn.chunks.push(event.data);
    };
    // The final `dataavailable` has arrived by now, so this is where a
    // submitted turn is actually assembled.
    recorder.onstop = () => settleTurn(turn);
    recorder.onerror = () => {
      // A recorder that failed mid-turn has nothing trustworthy to submit.
      if (openTurnRef.current === turn) closeTurn("abandoned");
      else settleTurn(turn);
    };

    openTurnRef.current = turn;
    setScope(nextScope);
    setTurnId(turn.turnId);
    applyState("learner-listening");
    // Ungate before arming, or the first frames of the learner's turn are
    // dropped as if the app were still speaking.
    vadRef.current.setGated(false);
    vadRef.current.arm(voiceActivityConfigFor(nextScope));
    // 250ms slices: small enough that a rolling chunk is close to current,
    // large enough not to fragment a turn into hundreds of blobs.
    try { recorder.start(250); } catch { /* a recorder already running */ }

    stopInterimTimer();
    if (nextScope === "ayah" && callbacks.current.onInterim) {
      interimTimerRef.current = setInterval(cutInterim, HANDS_FREE_TIMING.interimChunkMs);
    }
  }, [applyState, closeTurn, cutInterim, settleTurn, stopInterimTimer]);

  const finish = useCallback(() => closeTurn("manual"), [closeTurn]);

  const interrupt = useCallback(() => {
    vadRef.current.setGated(true);
    closeTurn("interrupt");
    if (stateRef.current !== "session-lost") applyState("waiting");
  }, [applyState, closeTurn]);

  const holdForPlayback = useCallback((kind: "coach" | "qari") => {
    // Gate first. A frame sampled between closing the turn and the gate going
    // up would be the app's own audio arriving as the learner's.
    vadRef.current.setGated(true);
    closeTurn("abandoned");
    applyState(kind === "coach" ? "app-speaking" : "qari-playing");
  }, [applyState, closeTurn]);

  const releasePlayback = useCallback(() => {
    if (stateRef.current === "app-speaking" || stateRef.current === "qari-playing") applyState("waiting");
  }, [applyState]);

  const setChecking = useCallback((checking: boolean) => {
    checkingRef.current = checking;
    if (checking) {
      vadRef.current.setGated(true);
      closeTurn("abandoned");
      applyState("checking");
      return;
    }
    if (stateRef.current === "checking") applyState("waiting");
  }, [applyState, closeTurn]);

  const pause = useCallback(() => {
    vadRef.current.setGated(true);
    // Abandoned, not submitted: stepping away is not an attempt, and a lesson
    // must never record progress because a learner stopped.
    closeTurn("abandoned");
    applyState("paused");
  }, [applyState, closeTurn]);

  const resume = useCallback(() => {
    if (stateRef.current === "paused") applyState("waiting");
  }, [applyState]);

  const stop = useCallback(() => {
    closeTurn("abandoned");
    releaseMicrophone();
    activeRef.current = false;
    checkingRef.current = false;
    setActive(false);
    setScope(null);
    setTurnId(null);
    applyState("idle");
  }, [applyState, closeTurn, releaseMicrophone]);

  const markSessionLost = useCallback(() => {
    vadRef.current.setGated(true);
    closeTurn("abandoned");
    applyState("session-lost");
  }, [applyState, closeTurn]);

  // Leaving Study, closing the tab, or unmounting for any other reason gives
  // the microphone back. A hands-free feature that leaks a live track is worse
  // than one that does not exist.
  useEffect(() => () => {
    releaseMicrophone();
    activeRef.current = false;
  }, [releaseMicrophone]);

  return {
    supported: continuousAudioSupported(),
    active,
    state,
    failure,
    scope,
    turnId,
    level: vad.level,
    start,
    listen,
    finish,
    interrupt,
    holdForPlayback,
    releasePlayback,
    setChecking,
    pause,
    resume,
    stop,
    markSessionLost,
  };
}
