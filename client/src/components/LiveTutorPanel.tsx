/**
 * The lesson, as a learner sits through it.
 *
 * The app used to end a recitation with a report: a score, a status, a list of
 * findings, several instructions competing for the same tap. This is the other
 * thing — a teacher sitting opposite you who listens, says one short sentence
 * when they speak, and leaves you knowing whose turn it is.
 *
 * What is on screen, in order, and nothing else by default:
 *
 *   1. the ayah,
 *   2. what the teacher just said,
 *   3. the one thing to do now.
 *
 * Everything the teacher noticed is behind a disclosure. A learner reciting
 * with the phone propped in front of them should be able to read the sentence
 * and find the button from arm's length; a transcript, a percentage and four
 * stage chips at the same time is a dashboard, and a dashboard is what this
 * replaces.
 *
 * **It decides nothing.** State, target word and whether a word was heard all
 * arrive as a `TutorSessionView` from the correction engine;
 * `shared/tutorConversation.ts` maps that to one sentence and two or three
 * controls. This file is markup. In particular it never claims a pronunciation,
 * a makhraj or a tajwid rule was correct — "I heard the marked word" is a
 * statement about hearing a word, and that is the strongest thing said here.
 *
 * **Audio boundaries are not this component's to relax.** It asks its caller to
 * play a word or an ayah; the caller uses the trusted Quran paths. No Quranic
 * Arabic is synthesised anywhere, and there is no speech-synthesis fallback.
 */
// See CurriculumAudit.tsx: the default React import is what lets this render in
// a test under the classic JSX transform.
import React, { useEffect, useRef, useState } from "react";
import { Check, Ear, Loader, Mic, MessageCircle, Pause, Play, RotateCcw, Square, Volume2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  describeTutorView,
  TUTOR_INTENT_LABEL_KEYS,
  TUTOR_VOICE_INTENTS,
  TUTOR_VOICE_STATUS,
  type TutorIntent,
  type TutorPresence,
  type TutorSessionView,
} from "@shared/tutorConversation";
import type { StringKey } from "@locales/index";

export type LiveTutorPanelProps = {
  /** Everything the tutor engine says about this moment. */
  session: TutorSessionView;
  /** The ayah on screen, exactly as the Quran data gives it. */
  ayah?: { arabic: string; label: string } | null;
  /** The learner asked for something. The page decides what that does. */
  onIntent: (intent: TutorIntent) => void;
  /** Anything the teacher noticed, for the disclosure. Optional and secondary. */
  details?: React.ReactNode;
};

/** The icon for each control. A label always accompanies it. */
const CONTROL_ICONS: Record<TutorIntent, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  start: Mic,
  again: Mic,
  "repeat-word": Mic,
  "hear-word": Volume2,
  "hear-ayah": Volume2,
  hint: MessageCircle,
  "from-beginning": RotateCcw,
  continue: Play,
  pause: Pause,
  resume: Play,
  stop: Square,
};

const PRESENCE_LABELS: Record<TutorPresence, StringKey> = {
  listening: "tutor.presenceListening",
  thinking: "tutor.presenceThinking",
  speaking: "tutor.presenceSpeaking",
  waiting: "tutor.presenceWaiting",
};

const PRESENCE_ICONS: Record<TutorPresence, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  listening: Ear,
  thinking: Loader,
  speaking: MessageCircle,
  waiting: Check,
};

export function LiveTutorPanel({ session, ayah = null, onIntent, details }: LiveTutorPanelProps) {
  const { t } = useLocale();
  const view = describeTutorView(session);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const messageRef = useRef<HTMLParagraphElement | null>(null);

  /**
   * When the teacher says something new, put the reader there.
   *
   * A learner who has just stopped reciting is looking at the microphone, and
   * the sentence that changed is above it. `tabIndex={-1}` makes it focusable
   * without adding it to the tab order.
   */
  useEffect(() => {
    if (view.turn === "teacher") messageRef.current?.focus({ preventScroll: true });
  }, [view.state, view.turn]);

  return (
    <section className={`live-tutor is-${view.state} turn-${view.turn}`} aria-label={t("tutor.label")}>
      {/* Presence. A state, said in words as well as shown, so it survives
          reduced motion and reaches a screen reader — nothing here is carried
          by an animation or by colour alone. And nothing pretends a person is
          on the other end: this is what the app is doing, plainly. */}
      <p className={`tutor-presence is-${view.presence}`}>
        {React.createElement(PRESENCE_ICONS[view.presence], { size: 14, "aria-hidden": true })}
        <span>{t(PRESENCE_LABELS[view.presence])}</span>
        <small>{t(view.turn === "teacher" ? "tutor.turnTeacher" : "tutor.turnLearner")}</small>
      </p>

      {/* 1. The Quran. Its own text, its own direction, in every interface
             language, and never mirrored by the layout around it. */}
      {ayah && (
        <div className="tutor-ayah">
          <p lang="ar" dir="rtl">
            {ayah.arabic}
          </p>
          <small>{ayah.label}</small>
        </div>
      )}

      {/* 2. What the teacher just said. One sentence, announced when it changes. */}
      <p className="tutor-message" ref={messageRef} tabIndex={-1} aria-live="polite">
        {t(view.messageKey, view.messageParams)}
      </p>

      {/* The word under correction, while it is still the problem. Once the
          engine reports it heard, `targetUnresolved` goes false and the word
          stays on screen as context rather than as an outstanding error — no
          "needs attention" under a sentence that has just said it came through. */}
      {view.target && (
        <div className={`tutor-target is-${view.targetTone}`}>
          {/* The tick means the teacher heard it. An attempt they could not
              judge gets no tick: "not the problem any more" and "went through"
              are different things, and only one of them is a result. */}
          {view.targetTone === "resolved" && <Check size={13} aria-hidden="true" className="tutor-target-tick" />}
          <p lang="ar" dir="rtl">
            {view.target.arabic}
          </p>
          <small>{t("tutor.wordPosition", { number: view.target.wordIndex, total: view.target.totalWords })}</small>
        </div>
      )}

      {/* 3. The one thing to do now, and at most two ways round it. */}
      {view.controls.length > 0 && (
        <div className="tutor-controls">
          {view.controls.map((control) => (
            <button
              key={control.intent}
              type="button"
              className={`tutor-control ${control.primary ? "is-primary" : ""}`}
              onClick={() => onIntent(control.intent)}
            >
              {React.createElement(CONTROL_ICONS[control.intent], { size: control.primary ? 17 : 15, "aria-hidden": true })}{" "}
              {t(control.labelKey)}
            </button>
          ))}
        </div>
      )}

      {/* Speaking to the teacher. Honest: the app is not listening for
          instructions, and this says so rather than implying an open
          microphone. Kept out of the way — it is preparation, not a feature. */}
      <button type="button" className="tutor-voice-open" aria-expanded={voiceOpen} onClick={() => setVoiceOpen((open) => !open)}>
        <MessageCircle size={13} aria-hidden="true" /> {t("tutor.voiceOpen")}
      </button>
      {voiceOpen && (
        <div className="tutor-voice" role="group" aria-label={t("tutor.voiceTitle")}>
          <p>{t("tutor.voiceNotListening")}</p>
          <ul>
            {TUTOR_VOICE_INTENTS.map((intent) => (
              <li key={intent}>{t(TUTOR_INTENT_LABEL_KEYS[intent])}</li>
            ))}
          </ul>
          <button type="button" className="tutor-voice-close" onClick={() => setVoiceOpen(false)}>
            {t("tutor.voiceClose")}
          </button>
          <small data-voice-status={TUTOR_VOICE_STATUS} hidden />
        </div>
      )}

      {/* Everything else the teacher noticed, if the caller supplies it.
          Collapsed: a learner mid-lesson does not need a transcript, and the
          detail is there for the moment they want it. */}
      {details && (
        <details className="tutor-details">
          <summary>{t("tutor.detailsSummary")}</summary>
          {details}
        </details>
      )}
    </section>
  );
}

export default LiveTutorPanel;
