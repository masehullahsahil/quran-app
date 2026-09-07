/**
 * One word, taught rather than marked.
 *
 * The app can already find the word a learner did not get through, and Study
 * used to show it: the word, its position, and one line about what was
 * observed. Correct, and still only a marker — the learner is told where the
 * mistake is and left to work out what to do with it.
 *
 * This is the same information as a short lesson. The word is the object on
 * screen, the ayah beneath it shows where the word belongs, four steps say what
 * the learner is being walked through, and exactly one control is primary at
 * any moment: hear it, say it, put it back into the ayah, carry on.
 *
 * What it never does:
 *
 * - **Invent progress.** Every stage comes from `deriveCorrectionLesson`, which
 *   reads the backend's own answer about the target word. This file renders.
 * - **Claim the recitation was right.** When the target is matched the wording
 *   is "I heard the marked word this time" — a statement about *hearing the
 *   word*, not about pronunciation, makhraj or tajwid, none of which this app
 *   is in a position to assess.
 * - **Touch the Quran text.** The ayah is rendered from the words the content
 *   gives, in order, with harakat intact; the target is marked with a
 *   background, never rewritten, reordered or transliterated.
 */
// See CurriculumAudit.tsx: the default React import is what lets this render in
// a test under the classic JSX transform.
import React, { useEffect, useRef } from "react";
import { AlertCircle, ArrowRight, Check, Loader, Mic, Square, Volume2 } from "lucide-react";
import type { WordAudioReference } from "@/lib/wordAudio";
import { useLocale } from "@/contexts/LocaleContext";
import type { CorrectionLesson } from "@/lib/correctionSession";

export type FocusedWordLessonProps = {
  lesson: CorrectionLesson;
  /** Replays the ayah slowly. The page owns the audio element. */
  onListen: () => void;
  /**
   * The recording of this one word, when a trustworthy one exists.
   *
   * Null is the ordinary case for an ayah the source served no word recordings
   * for, and the lesson simply offers the reciter's ayah instead. It is never a
   * reason to synthesise anything.
   */
  wordAudio?: WordAudioReference | null;
  /** Plays that recording. The page owns the element. */
  onHearWord?: () => void;
  /** What the word recording is doing right now. */
  wordAudioState?: { loading: boolean; playing: boolean; failed: boolean };
  /** Records one word. The page's existing recorder, scoped by the caller. */
  onRecordWord: () => void;
  /** Records the whole ayah. The same recorder. */
  onRecordAyah: () => void;
  /** Stops the open recording. */
  onStop: () => void;
  /** Moves on. Only offered when the decision sanctions it. */
  onContinue: () => void;
  audioUnavailable: boolean;
};

export function FocusedWordLesson({
  lesson,
  onListen,
  wordAudio = null,
  onHearWord,
  wordAudioState = { loading: false, playing: false, failed: false },
  onRecordWord,
  onRecordAyah,
  onStop,
  onContinue,
  audioUnavailable,
}: FocusedWordLessonProps) {
  const { t } = useLocale();
  const headlineRef = useRef<HTMLParagraphElement | null>(null);

  /**
   * When the lesson moves on, put the reader at the top of it.
   *
   * A learner who has just recorded is looking at the microphone, and the thing
   * that changed is three lines above it. `tabIndex={-1}` makes the headline
   * focusable without putting it in the tab order.
   */
  useEffect(() => {
    headlineRef.current?.focus({ preventScroll: true });
  }, [lesson.stage]);

  const primary = () => {
    if (lesson.action === "stop") {
      return (
        <button type="button" className="lesson-primary is-recording" onClick={onStop}>
          <Square size={16} fill="currentColor" aria-hidden="true" /> {t("lesson.stopRecording")}
        </button>
      );
    }
    if (lesson.busy === "checking") {
      return (
        <button type="button" className="lesson-primary is-checking" disabled>
          <Loader size={16} aria-hidden="true" /> {t("lesson.checking")}
        </button>
      );
    }
    if (lesson.action === "continue") {
      return (
        <button type="button" className="lesson-primary is-continue" onClick={onContinue}>
          {t("lesson.continue")} <ArrowRight size={16} aria-hidden="true" />
        </button>
      );
    }
    const isWord = lesson.action === "record-word";
    return (
      <button type="button" className="lesson-primary" onClick={isWord ? onRecordWord : onRecordAyah}>
        <Mic size={17} aria-hidden="true" />{" "}
        {isWord ? t("lesson.sayWord", { word: lesson.targetArabic }) : t("lesson.reciteAyah")}
      </button>
    );
  };

  return (
    <section className={`word-lesson is-${lesson.stage}`} aria-label={t("lesson.label")}>
      <p className="lesson-eyebrow">
        <AlertCircle size={13} aria-hidden="true" /> {t("lesson.eyebrow")}
      </p>

      {/* The word, larger than anything else on the screen. Exactly the Arabic
          the decision named — no normalisation, no stripped harakat. */}
      <p className="lesson-word" lang="ar" dir="rtl">
        {lesson.targetArabic}
      </p>
      <p className="lesson-position">{t("lesson.wordOf", { number: lesson.targetWordIndex, total: lesson.totalWords })}</p>
      <p className="lesson-observed">{t(lesson.observationKey)}</p>

      {/* Four steps, one current. Marked with `aria-current` so a screen reader
          reaches the same conclusion a sighted learner does from the highlight. */}
      <ol className="lesson-steps" aria-label={t("lesson.stepsLabel")}>
        {lesson.steps.map((step) => (
          <li key={step.stage} className={`is-${step.state}`} aria-current={step.state === "current" ? "step" : undefined}>
            {step.state === "done" && <Check size={11} aria-hidden="true" />}
            {t(step.labelKey)}
          </li>
        ))}
      </ol>

      {/* Where the word sits. The ayah in its own order, the target marked. */}
      <div className="lesson-context">
        <span className="lesson-context-label">{t("lesson.contextLabel")}</span>
        <p lang="ar" dir="rtl">
          {lesson.context.words.map((word, index) => (
            <span key={`${word}-${index}`} className={index + 1 === lesson.context.targetIndex ? "is-target" : undefined}>
              {word}
            </span>
          ))}
        </p>
      </div>

      {/* The current step, announced. `aria-live` rather than a role, so it is
          read when it changes without interrupting the learner mid-recording. */}
      <p className="lesson-headline" ref={headlineRef} tabIndex={-1} aria-live="polite">
        {t(lesson.headlineKey)}
      </p>
      {/* The one thing that must not be misread: the app heard the word, which
          is not the same as the word being pronounced well. */}
      {lesson.recognition === "recognised" && lesson.stage === "recite-ayah" && (
        <p className="lesson-heard">
          <Check size={14} aria-hidden="true" /> {t("lesson.recognised")}
        </p>
      )}
      <p className="lesson-detail">{t(lesson.detailKey)}</p>

      {/* Recording and checking are said in words as well as shown in colour. */}
      {lesson.busy && (
        <p className="lesson-status" role="status">
          {lesson.busy === "recording" ? <Mic size={13} aria-hidden="true" /> : <Loader size={13} aria-hidden="true" />}{" "}
          {t(lesson.busy === "recording" ? "lesson.listening" : "lesson.checking")}
        </p>
      )}

      <div className="lesson-actions">
        {primary()}
        {/* Hearing the word is available at every step.

            When the source serves a recording of this one word, that is what
            this plays and the button names the word. When it does not, the
            button honestly offers the reciter's ayah instead — nothing here is
            ever synthesised, and a missing word recording is said out loud
            rather than filled in. */}
        {wordAudio ? (
          <button
            type="button"
            className={`lesson-listen is-word${wordAudioState.playing ? " is-playing" : ""}${wordAudioState.loading ? " is-loading" : ""}`}
            onClick={onHearWord}
            aria-label={t("lesson.hearWord", { word: wordAudio.arabic })}
          >
            {wordAudioState.loading ? <Loader size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}{" "}
            {wordAudioState.loading
              ? t("lesson.wordLoading")
              : t("lesson.hearWord", { word: wordAudio.arabic })}
          </button>
        ) : (
          <button type="button" className="lesson-listen" onClick={onListen} disabled={audioUnavailable}>
            <Volume2 size={16} aria-hidden="true" /> {t("correction.listen")}
          </button>
        )}
      </div>

      {/* The ayah stays one press away whether or not the word played. */}
      {wordAudio && (
        <button type="button" className="lesson-ayah-listen" onClick={onListen} disabled={audioUnavailable}>
          <Volume2 size={14} aria-hidden="true" /> {t("lesson.hearFullAyah")}
        </button>
      )}

      {/* Playing and failing are said in words, not signalled by colour. */}
      {wordAudio && wordAudioState.playing && (
        <p className="lesson-status" role="status">
          <Volume2 size={13} aria-hidden="true" /> {t("lesson.wordPlaying")}
        </p>
      )}
      {wordAudio && wordAudioState.failed && (
        <p className="lesson-word-failed" role="status">
          <AlertCircle size={13} aria-hidden="true" /> {t("lesson.wordUnavailable")}
          <button type="button" className="lesson-fallback" onClick={onListen} disabled={audioUnavailable}>
            {t("lesson.playAyahInstead")}
          </button>
        </p>
      )}

      {/* Whose voice this is.

          Quran.com's word-by-word audio is one recitation set with no reciter
          parameter, so it is not the reciter chosen for the ayah — and the
          learner is told that rather than left to assume the two voices are the
          same person. When a source does supply the selected reciter, there is
          nothing to explain and no note is shown. */}
      {wordAudio ? (
        wordAudio.matchesSelectedReciter ? null : <small className="lesson-note">{t("lesson.wordReferenceNote")}</small>
      ) : (
        <small className="lesson-note">{t("lesson.referenceNote")}</small>
      )}
    </section>
  );
}

export default FocusedWordLesson;
