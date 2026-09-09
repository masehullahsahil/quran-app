/**
 * The Web Audio half of voice-activity detection.
 *
 * Everything that decides anything lives in `lib/voiceActivity.ts` as a pure
 * reducer. This hook is the plumbing around it: an `AudioContext`, an
 * `AnalyserNode` over the learner's stream, a frame timer, and a gate.
 *
 * Keeping the two apart is what makes turn boundaries testable. A test can feed
 * the reducer a second of silence at 50ms resolution and assert exactly when a
 * turn ends; no test can do that through a microphone, and the environment this
 * was written in has no microphone at all.
 *
 * **The gate is a safety device, not an optimisation.** While the app is
 * speaking or a reciter's recording is playing, the analyser is still attached
 * to the microphone and the room still contains that sound. Feeding those
 * frames to the detector would let the app's own audio start a learner turn.
 * So the gate stops frames from reaching the reducer entirely, and the caller
 * holds it closed for the whole of any playback.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  armVoiceActivity,
  createVoiceActivityState,
  disarmVoiceActivity,
  frameLevel,
  observeAudioLevel,
  VOICE_ACTIVITY_DEFAULTS,
  type VoiceActivityConfig,
  type VoiceActivityEvent,
  type VoiceActivityPhase,
  type VoiceActivityState,
} from "@/lib/voiceActivity";

type AudioContextConstructor = new () => AudioContext;

/** The constructor, under either of its two names, or null on a browser without it. */
export function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** Whether local level analysis can run here at all. Decides the fallback. */
export function voiceActivitySupported(): boolean {
  return audioContextConstructor() !== null;
}

export type UseVoiceActivityInput = {
  /** Reported for every event the detector produces, in order. */
  onEvent: (event: VoiceActivityEvent, state: VoiceActivityState) => void;
};

export type VoiceActivityController = {
  supported: boolean;
  phase: VoiceActivityPhase;
  /** The last frame's level, for the level meter. Never a Quran judgement. */
  level: number;
  /** Attach to a stream. Safe to call repeatedly with the same stream. */
  attach: (stream: MediaStream) => boolean;
  /** Start a turn under this configuration. */
  arm: (config?: VoiceActivityConfig) => void;
  /** End collection without producing an event. */
  disarm: () => void;
  /** True stops frames reaching the detector; false lets them through. */
  setGated: (gated: boolean) => void;
  /** Release the context and the analyser. */
  release: () => void;
};

export function useVoiceActivity(input: UseVoiceActivityInput): VoiceActivityController {
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef<VoiceActivityState>(createVoiceActivityState());
  const gatedRef = useRef(true);
  const [phase, setPhase] = useState<VoiceActivityPhase>("idle");
  const [level, setLevel] = useState(0);

  // The callback outlives the render it was made in, so it is read through a
  // ref rather than captured — a stale listener would report a turn boundary to
  // a lesson that has moved on.
  const onEventRef = useRef(input.onEvent);
  onEventRef.current = input.onEvent;

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const sampleOnce = useCallback(() => {
    const analyser = analyserRef.current;
    const buffer = bufferRef.current;
    if (!analyser || !buffer) return;
    analyser.getByteTimeDomainData(buffer);
    const measured = frameLevel(buffer);
    setLevel(measured);
    // Gated: the app is audible, so this frame is the app. It is measured for
    // the meter and then dropped, never fed to the detector.
    if (gatedRef.current) return;
    const step = observeAudioLevel(stateRef.current, { level: measured, atMs: now() });
    stateRef.current = step.state;
    if (step.state.phase !== phaseRef.current) {
      phaseRef.current = step.state.phase;
      setPhase(step.state.phase);
    }
    for (const event of step.events) onEventRef.current(event, step.state);
  }, []);

  const phaseRef = useRef<VoiceActivityPhase>("idle");

  const startTimer = useCallback((frameMs: number) => {
    stopTimer();
    timerRef.current = setInterval(sampleOnce, Math.max(10, frameMs));
  }, [sampleOnce, stopTimer]);

  const attach = useCallback((stream: MediaStream): boolean => {
    const Constructor = audioContextConstructor();
    if (!Constructor) return false;
    if (streamRef.current === stream && analyserRef.current) return true;
    try {
      const context = contextRef.current ?? new Constructor();
      contextRef.current = context;
      // A context created before a gesture starts suspended; resuming is
      // harmless when it is already running.
      void context.resume?.();
      sourceRef.current?.disconnect?.();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      // Enough smoothing that one plosive does not read as a turn, not so much
      // that the end of a phrase is smeared past the silence thresholds.
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      // Deliberately not connected to the destination: the learner must not
      // hear themselves through the app, which would be a feedback loop with a
      // speaker and a distraction with headphones.
      sourceRef.current = source;
      analyserRef.current = analyser;
      bufferRef.current = new Uint8Array(analyser.fftSize);
      streamRef.current = stream;
      return true;
    } catch {
      // A browser that has the constructor but refuses the graph falls back to
      // the manual path, exactly as one without the constructor does.
      return false;
    }
  }, []);

  const arm = useCallback((config: VoiceActivityConfig = VOICE_ACTIVITY_DEFAULTS) => {
    stateRef.current = armVoiceActivity(stateRef.current, config);
    phaseRef.current = stateRef.current.phase;
    setPhase(stateRef.current.phase);
    startTimer(config.frameMs);
  }, [startTimer]);

  const disarm = useCallback(() => {
    stateRef.current = disarmVoiceActivity(stateRef.current);
    phaseRef.current = "idle";
    setPhase("idle");
    stopTimer();
  }, [stopTimer]);

  const setGated = useCallback((gated: boolean) => {
    gatedRef.current = gated;
  }, []);

  const release = useCallback(() => {
    stopTimer();
    try {
      sourceRef.current?.disconnect?.();
      analyserRef.current?.disconnect?.();
    } catch { /* a context already closed by the browser */ }
    sourceRef.current = null;
    analyserRef.current = null;
    bufferRef.current = null;
    streamRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    // Closed rather than suspended: the session is over, and an open context
    // holds hardware the learner did not ask us to keep.
    try { void context?.close?.(); } catch { /* already closed */ }
    stateRef.current = createVoiceActivityState();
    phaseRef.current = "idle";
    setPhase("idle");
    setLevel(0);
  }, [stopTimer]);

  useEffect(() => release, [release]);

  return { supported: voiceActivitySupported(), phase, level, attach, arm, disarm, setGated, release };
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
