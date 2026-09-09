/**
 * Performing one tutor turn: the teacher speaks, the reciter plays, the
 * microphone re-opens.
 *
 * `handsFreePlan.ts` decides what the sequence is, from the server's own
 * action. This runs it — in order, one step at a time, with the microphone held
 * closed for the whole of it, and re-opened in the scope the plan named once
 * the last step is done.
 *
 * ## Why the app cannot record itself
 *
 * Three separate things would have to fail at once for the learner's recorder
 * to capture the app's own audio:
 *
 *  1. before a step starts, `holdForPlayback` closes any open turn and *gates
 *     the detector* — frames are still sampled for the level meter and are
 *     dropped before they reach the turn logic;
 *  2. the audio state becomes `app-speaking` or `qari-playing`, and `listen()`
 *     refuses to open a turn in either;
 *  3. the microphone is only re-opened from the end of this sequence, after the
 *     last step has reported it finished, and after a short beat.
 *
 * A word recording that recorded itself would be handed to the server as the
 * learner's attempt at that word — and would pass. That is the worst failure
 * this feature could have, so it is guarded three times rather than once.
 *
 * ## Quran audio is never synthesised, structurally
 *
 * A `qari-word` step plays the URL `#51` supplied; a `qari-ayah` step plays the
 * reciter's file. A `coach` step passes a *locale key* to `speakCoaching`,
 * which refuses any key outside its allowlist. There is no step type that
 * carries Arabic text to a synthesiser, so there is no code path from a plan to
 * a spoken Quran word.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { speakCoaching } from "@/lib/coachSpeech";
import { HANDS_FREE_TIMING, type HandsFreePlan, type HandsFreeStep } from "@/lib/handsFreePlan";
import type { StringKey } from "@locales/index";
import type { SupportedLanguageCode } from "@shared/languages";

export type TutorPlaybackInput = {
  /** The plan to perform, or null. A plan whose key was performed is skipped. */
  plan: HandsFreePlan | null;
  language: SupportedLanguageCode;
  /** The learner turned the teacher's voice off. Sentences are still shown. */
  muted: boolean;
  /** The trusted recording of the word under correction (#51), or null. */
  wordAudioUrl: string | null;
  /** The selected reciter's ayah, or null. */
  ayahAudioUrl: string | null;
  /** Resolves a coaching key in the learner's language. */
  translate: (key: StringKey) => string;
  /** Close capture and gate the detector for the duration of a step. */
  holdForPlayback: (kind: "coach" | "qari") => void;
  /** The app has stopped being audible. */
  releasePlayback: () => void;
  /** Open the microphone in this scope. Called once, at the end. */
  listen: (scope: "word" | "ayah") => void;
  /** False stops the sequence dead — paused, stopped, or no session. */
  enabled: boolean;
};

export type TutorPlaybackState = {
  /** The sentence on screen right now, if the teacher is saying one. */
  line: StringKey | null;
  /** Whether that sentence was actually spoken aloud, or only shown. */
  lineSpoken: boolean;
  /** The step being performed, for the accessible status line. */
  step: HandsFreeStep["kind"] | null;
  /** True while any step of a plan is running. */
  performing: boolean;
};

export function useTutorPlaybackOrchestrator(input: TutorPlaybackInput): TutorPlaybackState {
  const [state, setState] = useState<TutorPlaybackState>({ line: null, lineSpoken: false, step: null, performing: false });
  const performedRef = useRef<string | null>(null);
  /** Bumped by every new plan and by disabling, so an old run stops cleanly. */
  const runRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const latest = useRef(input);
  latest.current = input;

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    try { audio.pause(); } catch { /* an element already torn down */ }
  }, []);

  /**
   * Play one trusted recording, resolving when it ends — or when it fails.
   *
   * A missing recording resolves rather than rejecting: the lesson continues
   * with the sentence the teacher already said, which is the honest fallback.
   * It is never replaced by a synthesised reading.
   */
  const playTrusted = useCallback((url: string, run: number) => new Promise<void>((resolve) => {
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    let settled = false;
    // `let`, declared before `done`, because `done` can be called synchronously
    // from inside `play()` on a source that fails immediately — and a `const`
    // read from its own initialiser is a reference error, not a missed timer.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      audio.onended = null;
      audio.onerror = null;
      resolve();
    };
    timer = setTimeout(done, HANDS_FREE_TIMING.playbackTimeoutMs);
    audio.onended = done;
    audio.onerror = done;
    audio.src = url;
    audio.currentTime = 0;
    void Promise.resolve(audio.play?.()).catch(done);
    if (runRef.current !== run) done();
  }), []);

  const speakLine = useCallback((key: StringKey, run: number) => new Promise<void>((resolve) => {
    let settled = false;
    // The same reason as in `playTrusted`, and the one that actually bites: a
    // synthesiser that finishes an utterance synchronously calls `onDone`
    // before this function has reached its own timer.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    };
    const outcome = speakCoaching({
      messageKey: key,
      text: latest.current.translate(key),
      language: latest.current.language,
      muted: latest.current.muted,
      onDone: done,
    });
    setState((current) => ({ ...current, line: key, lineSpoken: outcome.spoken }));
    // A sentence that was only shown still needs time on screen; a spoken one
    // resolves from `onDone`, with this as the backstop for a voice that never
    // reports finishing.
    const dwell = outcome.spoken ? HANDS_FREE_TIMING.playbackTimeoutMs : HANDS_FREE_TIMING.coachDisplayMs;
    if (!settled) timer = setTimeout(done, dwell);
    if (runRef.current !== run) done();
  }), []);

  useEffect(() => {
    const plan = input.plan;
    if (!input.enabled || !plan) {
      runRef.current += 1;
      stopAudio();
      // Only when there is something to clear. Handing React a fresh object on
      // every render would re-render, re-run this effect, and never stop —
      // which is exactly what a paused session did before this guard, because
      // pausing disables the orchestrator while a plan is still on screen.
      setState((current) => (
        current.line === null && current.step === null && !current.performing && !current.lineSpoken
          ? current
          : { line: null, lineSpoken: false, step: null, performing: false }
      ));
      return;
    }
    // A re-render, a retry, or a duplicate handoff all name the same turn. It
    // is performed once.
    if (performedRef.current === plan.key) return;
    performedRef.current = plan.key;

    runRef.current += 1;
    const run = runRef.current;
    const cancelled = () => runRef.current !== run || !latest.current.enabled;

    void (async () => {
      setState({ line: null, lineSpoken: false, step: null, performing: plan.steps.length > 0 });
      for (const step of plan.steps) {
        if (cancelled()) return;
        if (step.kind === "coach") {
          latest.current.holdForPlayback("coach");
          setState((current) => ({ ...current, step: "coach", performing: true }));
          // A sentence carrying a Quran word is shown and not spoken; the plan
          // has already marked it, and `speakCoaching` refuses it again.
          if (step.speak) {
            await speakLine(step.messageKey, run);
          } else {
            setState((current) => ({ ...current, line: step.messageKey, lineSpoken: false }));
            await wait(HANDS_FREE_TIMING.coachDisplayMs);
          }
          continue;
        }
        const url = step.kind === "qari-word" ? latest.current.wordAudioUrl : latest.current.ayahAudioUrl;
        if (!url) continue;
        latest.current.holdForPlayback("qari");
        setState((current) => ({ ...current, step: step.kind, performing: true }));
        await playTrusted(url, run);
      }
      if (cancelled()) return;
      latest.current.releasePlayback();
      setState((current) => ({ ...current, step: null, performing: false }));
      if (!plan.resume || plan.terminal) return;
      // The beat before the microphone opens. Without it the learner's turn
      // begins on the last syllable of the teacher's sentence.
      await wait(HANDS_FREE_TIMING.resumeDelayMs);
      if (cancelled()) return;
      latest.current.listen(plan.resume);
    })();
  }, [input.plan, input.enabled, playTrusted, speakLine, stopAudio]);

  useEffect(() => () => {
    runRef.current += 1;
    stopAudio();
  }, [stopAudio]);

  return state;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
