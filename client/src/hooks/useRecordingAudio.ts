/**
 * Playback for a reciter's recordings — a Qaida letter, or one Quran word.
 *
 * The one rule this hook exists to enforce: when a recording is missing, the
 * caller is told it is unavailable. There is deliberately no speech-synthesis
 * fallback — several Arabic letters (ح ع ص ض ط ظ ق غ) have no English phoneme,
 * so an English voice does not approximate them, it says something else, and a
 * synthesised voice has no business reading Quranic Arabic at all. Silence with
 * an honest message is the correct failure.
 *
 * Both callers play one short recording at a time and need the same three
 * states, so there is one implementation. `useLetterAudio` is the Qaida name
 * for it and is exported below unchanged.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type RecordingAudioState = {
  /** The recording currently playing, if any. */
  playingSrc: string | null;
  /**
   * The recording that has been asked for and has not started yet.
   *
   * On a phone on a slow connection a tap can sit silent for a second or two,
   * which reads as a dead button. Reporting it lets the control say it is
   * loading instead of looking broken.
   */
  loadingSrc: string | null;
  /** The recording that was asked for and could not be played. */
  unavailableSrc: string | null;
};

/**
 * Recordings discovered to be missing, kept for the page's lifetime so a letter
 * with no file does not re-request it on every click.
 *
 * Only "the file is not there or is not audio" is remembered. A network blip is
 * not cached, because the file may well play on the next attempt.
 */
const knownMissing = new Set<string>();

export function useRecordingAudio() {
  const [state, setState] = useState<RecordingAudioState>({ playingSrc: null, loadingSrc: null, unavailableSrc: null });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setState((current) => ({ playingSrc: null, loadingSrc: null, unavailableSrc: current.unavailableSrc }));
  }, []);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const play = useCallback(async (src: string) => {
    if (knownMissing.has(src)) {
      setState({ playingSrc: null, loadingSrc: null, unavailableSrc: src });
      return;
    }

    setState({ playingSrc: null, loadingSrc: src, unavailableSrc: null });

    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.pause();
    audio.src = src;
    audio.currentTime = 0;

    const markUnavailable = (cacheable: boolean) => {
      if (cacheable) knownMissing.add(src);
      setState({ playingSrc: null, loadingSrc: null, unavailableSrc: src });
    };

    audio.onended = () => setState((current) => (
      current.playingSrc === src ? { ...current, playingSrc: null } : current
    ));
    audio.onerror = () => {
      // A 404 under the SPA fallback returns the index document rather than a
      // 404 status, so the decode failure (code 4) is what actually identifies a
      // recording that has not been added yet. A network error (code 2) is
      // transient and is not remembered.
      markUnavailable(audio.error?.code !== MediaError.MEDIA_ERR_NETWORK);
    };

    try {
      await audio.play();
      setState({ playingSrc: src, loadingSrc: null, unavailableSrc: null });
    } catch (error) {
      // Chrome rejects with NotSupportedError when the source cannot be decoded,
      // which is the same "no recording yet" case as the error event above.
      const transient = error instanceof DOMException && error.name === "NotAllowedError";
      markUnavailable(!transient);
    }
  }, []);

  /**
   * Warms one recording without playing it.
   *
   * A learner on a phone taps "Hear the word" and waits for a file that could
   * have been on its way since the word appeared. Only the current target is
   * warmed — never a surah's worth of recordings, which would cost a learner on
   * a metered connection far more than it saves them.
   */
  const preload = useCallback((src: string | null) => {
    if (!src || knownMissing.has(src)) return;
    const warm = new Audio();
    warm.preload = "auto";
    warm.src = src;
    // Any failure here is silent on purpose: this is an optimisation, and the
    // real attempt through `play` is what reports to the learner.
    warm.load();
  }, []);

  return { ...state, play, stop, preload };
}

/**
 * Whether a state field refers to the recording at `src`.
 *
 * `state.playingSrc === src` looks like the obvious test and is wrong the moment
 * `src` can be null: nothing is playing and nothing is available, so both sides
 * are null, and a control renders as playing — or, worse, as permanently
 * loading. A recording with no path is never the one in any of these states.
 */
export function isRecording(stateSrc: string | null, src: string | null): boolean {
  return src !== null && stateSrc === src;
}

/** The Qaida letter player. Same hook, named for its first caller. */
export const useLetterAudio = useRecordingAudio;
export type LetterAudioState = RecordingAudioState;
