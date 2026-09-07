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
import { useLocale } from "@/contexts/LocaleContext";
import type { CorrectionLesson } from "@/lib/correctionSession";

export type FocusedWordLessonProps = {
  lesson: CorrectionLesson;
  /** Replays the ayah slowly. The page owns the audio element. */
  onListen: () => void;
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
        {/* Hearing the word is always available, at every step. There is no
            word-level recitation in the Quran data — one file per ayah, no word
            timings — so this replays the ayah slowly and the note says so.
            Nothing here is synthesised. */}
        <button type="button" className="lesson-listen" onClick={onListen} disabled={audioUnavailable}>
          <Volume2 size={16} aria-hidden="true" /> {t("correction.listen")}
        </button>
      </div>
      <small className="lesson-note">{t("lesson.referenceNote")}</small>
    </section>
  );
}

export default FocusedWordLesson;
