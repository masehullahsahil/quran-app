/**
 * Playback for the reciter's letter recordings.
 *
 * The one rule this hook exists to enforce: when a recording is missing, the
 * caller is told it is unavailable. There is deliberately no speech-synthesis
 * fallback — several Arabic letters (ح ع ص ض ط ظ ق غ) have no English phoneme,
 * so an English voice does not approximate them, it says something else. Silence
 * with an honest message is the correct failure.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type LetterAudioState = {
  /** The recording currently playing, if any. */
  playingSrc: string | null;
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

export function useLetterAudio() {
  const [state, setState] = useState<LetterAudioState>({ playingSrc: null, unavailableSrc: null });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setState((current) => ({ playingSrc: null, unavailableSrc: current.unavailableSrc }));
  }, []);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const play = useCallback(async (src: string) => {
    if (knownMissing.has(src)) {
      setState({ playingSrc: null, unavailableSrc: src });
      return;
    }

    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.pause();
    audio.src = src;
    audio.currentTime = 0;

    const markUnavailable = (cacheable: boolean) => {
      if (cacheable) knownMissing.add(src);
      setState({ playingSrc: null, unavailableSrc: src });
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
      setState({ playingSrc: src, unavailableSrc: null });
    } catch (error) {
      // Chrome rejects with NotSupportedError when the source cannot be decoded,
      // which is the same "no recording yet" case as the error event above.
      const transient = error instanceof DOMException && error.name === "NotAllowedError";
      markUnavailable(!transient);
    }
  }, []);

  return { ...state, play, stop };
}
