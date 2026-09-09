/**
 * The hands-free lesson, as a learner sits through it.
 *
 * The screen this belongs to is a phone propped against something while the
 * learner recites with their hands and eyes on the Quran. So it is built for
 * that: three things readable from arm's length — where the lesson is, what the
 * teacher just said, and what is happening with the microphone — and two
 * controls, both of which are ways to stop rather than ways to proceed.
 *
 * **There is no button in the normal path.** Once the session starts, a
 * successful recitation, a correction, a repeated word and a move to the next
 * ayah all happen without a press. Pause and Finish are here because a learner
 * must always be able to stop, and the rest is behind a disclosure for the
 * moments something has gone wrong.
 *
 * **It decides nothing.** Every state it renders was handed to it: the audio
 * state comes from the microphone hook, the sentence from the plan the server's
 * action produced, and the Quran position from the tutor. Nothing here reads a
 * recitation, and nothing here may imply a judgement the server has not made —
 * while the learner is reciting, this says "Listening", and it goes on saying
 * "Listening" whatever a provisional server signal may be reporting.
 *
 * **Every audio state is text.** Not a colour, not a ring, not a pulse. The
 * meter is decorative and marked as such; the sentence beside it is the state,
 * it is in a live region, and it survives reduced motion and a screen reader
 * intact.
 */
import React from "react";
import { Ear, Loader, MessageCircle, Mic, MicOff, Pause, Play, Square, Volume2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  MICROPHONE_FAILURE_KEYS,
  TUTOR_AUDIO_STATE_KEYS,
  type MicrophoneFailure,
  type TutorAudioState,
} from "@/lib/tutorAudioState";
import type { StringKey } from "@locales/index";

/** The extras behind the disclosure. Recovery, never the way the lesson runs. */
export type HandsFreeOption = "repeat-teacher" | "hear-word" | "hear-ayah" | "hint";

const OPTION_LABELS: Record<HandsFreeOption, StringKey> = {
  "repeat-teacher": "handsfree.repeatTeacher",
  "hear-word": "handsfree.hearWordAgain",
  "hear-ayah": "handsfree.hearAyah",
  hint: "handsfree.hint",
};

const STATE_ICONS: Record<TutorAudioState, React.ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" | "false" }>> = {
  idle: Mic,
  "learner-listening": Ear,
  "learner-speaking": Mic,
  checking: Loader,
  "app-speaking": MessageCircle,
  "qari-playing": Volume2,
  waiting: Ear,
  paused: Pause,
  "microphone-unavailable": MicOff,
  "session-lost": MicOff,
};

export type HandsFreeTutorProps = {
  /** False where the browser cannot do this at all. Then nothing renders. */
  supported: boolean;
  /** True between Start and Finish. */
  active: boolean;
  state: TutorAudioState;
  failure: MicrophoneFailure | null;
  /** The teacher's current sentence, when they are saying one. */
  line: StringKey | null;
  /** False when that sentence was shown rather than spoken. */
  lineSpoken: boolean;
  /** 0..1, for the decorative meter only. */
  level: number;
  /** The scope of the open turn, so the learner knows what is being asked for. */
  scope: "word" | "ayah" | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onOption: (option: HandsFreeOption) => void;
  /** Which extras make sense right now. An empty list hides the disclosure. */
  options: HandsFreeOption[];
  /** The learner turned the teacher's voice off. */
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
};

export function HandsFreeTutor(props: HandsFreeTutorProps) {
  const { t } = useLocale();
  // A browser that cannot run this shows nothing at all rather than a disabled
  // promise. Study's own controls are right there and they work; calling that
  // "hands-free unavailable" would be naming a feature the learner never saw.
  if (!props.supported && !props.failure) return null;

  const StateIcon = STATE_ICONS[props.state];
  const stateLabel = t(TUTOR_AUDIO_STATE_KEYS[props.state]);
  const lost = props.state === "session-lost";
  const unavailable = props.state === "microphone-unavailable";

  return (
    <section className={`handsfree is-${props.state}`} aria-label={t("handsfree.label")}>
      {/* Before the session: one action, and the plain truth about the
          microphone. No claim of background listening is made anywhere,
          because none is true — the microphone is opened here and released
          when the session ends. */}
      {!props.active && !unavailable && (
        <div className="handsfree-start">
          <button type="button" className="handsfree-begin" onClick={props.onStart}>
            <Mic size={18} aria-hidden="true" /> {t("handsfree.start")}
          </button>
          <p className="handsfree-privacy">{t("handsfree.privacy")}</p>
        </div>
      )}

      {/* The state, in words. The meter beside it carries no information the
          sentence does not; it is aria-hidden for that reason. */}
      {(props.active || unavailable || lost) && (
        <div className="handsfree-status">
          <p className="handsfree-state" role="status" aria-live="polite">
            <StateIcon size={15} aria-hidden="true" />
            <span>{stateLabel}</span>
            {props.scope === "word" && props.state === "learner-listening" && (
              <small>{t("handsfree.scopeWord")}</small>
            )}
            {props.scope === "ayah" && props.state === "learner-listening" && (
              <small>{t("handsfree.scopeAyah")}</small>
            )}
          </p>
          <span
            className="handsfree-meter"
            aria-hidden="true"
            data-testid="handsfree-meter"
            style={{ "--handsfree-level": String(Math.min(1, Math.max(0, props.level))) } as React.CSSProperties}
          />
        </div>
      )}

      {/* What the teacher is saying, whether or not it was spoken. A sentence
          that could not be spoken in this language is shown and marked as
          shown — never read out in a language the learner did not choose. */}
      {props.line && (
        <p className="handsfree-line" aria-live="polite">
          {t(props.line)}
          {!props.lineSpoken && <small className="handsfree-shown-only">{t("handsfree.voiceShown")}</small>}
        </p>
      )}

      {/* The microphone could not be used. The lesson is not broken: Study's
          own controls are below, and this says so without calling anything
          hands-free. */}
      {unavailable && props.failure && (
        <p className="handsfree-fallback" role="status">
          {t(MICROPHONE_FAILURE_KEYS[props.failure])}
        </p>
      )}

      {/* The server no longer has this lesson. Nothing advances on its own, no
          correction is invented, and the ayah is left exactly where it is. */}
      {lost && (
        <div className="handsfree-lost" role="status">
          <p>{t("handsfree.sessionLost")}</p>
          <button type="button" className="handsfree-restart" onClick={props.onStart}>
            <Play size={15} aria-hidden="true" /> {t("handsfree.restart")}
          </button>
        </div>
      )}

      {/* Two controls, and both of them stop something. Nothing here is needed
          to make the lesson go forward. */}
      {props.active && !lost && (
        <div className="handsfree-controls">
          {props.state === "paused" ? (
            <button type="button" className="handsfree-control is-primary" onClick={props.onResume}>
              <Play size={16} aria-hidden="true" /> {t("handsfree.resume")}
            </button>
          ) : (
            <button type="button" className="handsfree-control" onClick={props.onPause}>
              <Pause size={16} aria-hidden="true" /> {t("handsfree.pause")}
            </button>
          )}
          <button type="button" className="handsfree-control" onClick={props.onStop}>
            <Square size={15} aria-hidden="true" /> {t("handsfree.stop")}
          </button>
        </div>
      )}

      {/* Everything else, collapsed. These are recovery controls: a learner who
          missed what the teacher said, or wants the word once more. Reaching
          for one is not part of the normal path. */}
      {props.active && props.options.length > 0 && (
        <details className="handsfree-options">
          <summary>{t("handsfree.options")}</summary>
          <div className="handsfree-option-row">
            {props.options.map((option) => (
              <button key={option} type="button" className="handsfree-option" onClick={() => props.onOption(option)}>
                {t(OPTION_LABELS[option])}
              </button>
            ))}
          </div>
          <label className="handsfree-mute">
            <input type="checkbox" checked={!props.muted} onChange={(event) => props.onMutedChange(!event.target.checked)} />
            {t("handsfree.speakAloud")}
          </label>
        </details>
      )}
    </section>
  );
}

export default HandsFreeTutor;
