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
 * ## Three ways a turn ends, and why they are not the same
 *
 *  1. **Silence.** The detector reports a sustained pause; the segment is
 *     finalised and submitted. The ordinary case.
 *  2. **The safety cap.** A microphone that never hears silence still has to
 *     stop. Submitted, because whatever was captured is a real attempt.
 *  3. **Server interruption.** The server has determined mid-ayah that a word
 *     was skipped, and says so while the learner is still speaking. Capture
 *     stops *at once*, without waiting for a pause — and the partial audio is
 *     **discarded**, not submitted. The server has already decided; sending it
 *     the same speech again for a second opinion would be asking a question
 *     that has been answered, and the two answers could disagree.
 *
 * All three go through one function, `closeTurn`, which takes the open turn and
 * clears it in a single step. That is what makes every duplicate harmless: a
 * `MediaRecorder` firing `onstop` twice, a detector reporting silence after an
 * interrupt has already closed the turn, a caller stopping a turn that has
 * ended — each arrives second and finds nothing to close. No turn can be
 * submitted twice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceActivity, voiceActivitySupported } from "./useVoiceActivity";
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

/** Why a turn ended. Only the first two produce a recording to submit. */
export type TurnEndReason = "silence" | "max-turn" | "manual" | "interrupt" | "abandoned";

export type FinalisedTurn = {
  blob: Blob;
  scope: TutorTurnScope;
  reason: Extract<TurnEndReason, "silence" | "max-turn" | "manual">;
  durationMs: number;
  turnId: number;
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
   * Timing the tutor engine accepts. Forwarded verbatim; the engine decides
   * what a pause means, and this hook has no opinion about it.
   */
  onTiming?: (timing: "learner-started-speaking" | "learner-stopped-speaking" | "short-silence" | "prolonged-silence") => void;
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
   * "speaking" cannot undo this, because the turn is already closed against its
   * id.
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

const MIME_CANDIDATES = ["audio/webm", "audio/ogg", "audio/mp4"];

function preferredMimeType(): string | undefined {
  const recorder = typeof window !== "undefined" ? window.MediaRecorder : undefined;
  if (!recorder?.isTypeSupported) return undefined;
  return MIME_CANDIDATES.find((type) => recorder.isTypeSupported(type));
}

export function continuousAudioSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder === "function" && voiceActivitySupported();
}

export function useContinuousTutorAudio(input: UseContinuousTutorAudioInput): ContinuousTutorAudio {
  const [state, setState] = useState<TutorAudioState>("idle");
  const [failure, setFailure] = useState<MicrophoneFailure | null>(null);
  const [scope, setScope] = useState<TutorTurnScope | null>(null);
  const [active, setActive] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const turnIdRef = useRef(0);
  const openTurnRef = useRef<{ id: number; scope: TutorTurnScope; startedAt: number } | null>(null);
  const stateRef = useRef<TutorAudioState>("idle");
  const activeRef = useRef(false);
  const checkingRef = useRef(false);

  const callbacks = useRef(input);
  callbacks.current = input;

  const applyState = useCallback((next: TutorAudioState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /**
   * Close the open turn.
   *
   * The one place a turn ends, whatever ended it. Everything that could end a
   * turn twice goes through here and the second attempt finds the id already
   * settled.
   */
  const closeTurn = useCallback((reason: TurnEndReason) => {
    // The whole duplicate-suppression mechanism, and it is this line: the open
    // turn is taken and cleared in one step, so the second caller finds
    // nothing. A `MediaRecorder` firing `onstop` twice, a detector reporting
    // silence after a server interruption has already closed the turn, a caller
    // stopping a turn that has ended — all of them arrive here second.
    const open = openTurnRef.current;
    if (!open) return;
    openTurnRef.current = null;

    const recorder = recorderRef.current;
    recorderRef.current = null;
    const submit = reason === "silence" || reason === "max-turn" || reason === "manual";
    const chunks = chunksRef.current;
    chunksRef.current = [];
    const durationMs = Math.max(0, Date.now() - open.startedAt);

    vadRef.current?.disarm();
    setScope(null);

    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* a recorder the browser already closed */ }
    }

    if (!submit) return;
    // The blob is assembled here rather than in `onstop` so an interrupted turn
    // never produces one at all: there is no path from a discarded turn to the
    // trusted route.
    const type = chunks[0]?.type || preferredMimeType() || "audio/webm";
    const blob = new Blob(chunks, { type });
    applyState("checking");
    checkingRef.current = true;
    callbacks.current.onTurn({
      blob,
      scope: open.scope,
      reason: reason as FinalisedTurn["reason"],
      durationMs,
      turnId: open.id,
    });
  }, [applyState]);

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
        callbacks.current.onTiming?.("learner-started-speaking");
        return;
      // A pause inside recitation. Reported, because the engine accepts it;
      // nothing about the capture changes, which is the entire point of having
      // a short-pause threshold at all.
      case "short-silence":
        callbacks.current.onTiming?.("short-silence");
        return;
      case "prolonged-silence":
        callbacks.current.onTiming?.("prolonged-silence");
        return;
      case "no-speech-yet":
        callbacks.current.onIdle?.();
        return;
      case "turn-ended":
        callbacks.current.onTiming?.("learner-stopped-speaking");
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
    vadRef.current?.release();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* already stopped */ }
    }
    // The tracks are the microphone. Stopping them is what turns the browser's
    // recording indicator off, and it is not optional on the way out.
    streamRef.current?.getTracks().forEach((track) => {
      try { track.stop(); } catch { /* a track the browser already ended */ }
    });
    streamRef.current = null;
    chunksRef.current = [];
    openTurnRef.current = null;
  }, []);

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

  const listen = useCallback((nextScope: TutorTurnScope) => {
    if (!activeRef.current || !streamRef.current) return;
    if (checkingRef.current) return;
    // Never on top of the app's own voice, and never on top of an open turn.
    if (stateRef.current === "app-speaking" || stateRef.current === "qari-playing") return;
    if (stateRef.current === "paused" || stateRef.current === "session-lost" || stateRef.current === "microphone-unavailable") return;
    if (openTurnRef.current) return;

    const id = turnIdRef.current + 1;
    turnIdRef.current = id;
    chunksRef.current = [];

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
    recorderRef.current = recorder;
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data?.size) chunksRef.current.push(event.data);
    };
    // `onstop` deliberately does no work. A recorder that stops for its own
    // reasons — a device removed, a browser reclaiming it — must not be able to
    // submit a turn; only `closeTurn` submits, and only for the reasons above.
    recorder.onstop = () => {};
    openTurnRef.current = { id, scope: nextScope, startedAt: Date.now() };
    setScope(nextScope);
    applyState("learner-listening");
    // Ungate before arming, or the first frames of the learner's turn are
    // dropped as if the app were still speaking.
    vadRef.current.setGated(false);
    vadRef.current.arm(voiceActivityConfigFor(nextScope));
    // 250ms slices: small enough that an interruption loses little audio, large
    // enough not to fragment a turn into hundreds of blobs.
    try { recorder.start(250); } catch { /* a recorder already running */ }
  }, [applyState]);

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
