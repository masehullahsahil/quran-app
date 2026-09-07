/**
 * What the learner sees the moment a review comes back.
 *
 * Study used to end an attempt with one generic line — "Repeat the word slowly"
 * — which tells a learner nothing they can act on. This card answers the seven
 * questions that line left open: which word, why it was picked, what to do,
 * how to hear it, how to repeat it, how to record again, and what happens once
 * they get it right.
 *
 * It decides nothing. Which state to show, which word, and whether the learner
 * may move on are all settled in `shared/teacherDecision.ts` and shaped for the
 * screen in `client/src/lib/studyView.ts`. This file is markup and wording only:
 * if a state is missing from `studyView`, nothing renders here rather than
 * something being guessed.
 *
 * Four states, deliberately kept visually apart:
 *
 *   - **the exact word** — one Arabic word, large, with what was observed and a
 *     numbered path back to the microphone;
 *   - **the whole ayah** — another recitation is needed and no word is blamed;
 *   - **uncertain** — the app could not tell, so nothing is marked wrong and no
 *     word is shown at all;
 *   - **accepted** — it went through; here is what comes next.
 */
// See CurriculumAudit.tsx: the default React import is what lets this render in
// a test under the classic JSX transform.
import React from "react";
import { AlertCircle, ArrowRight, Check, HelpCircle, Mic, RotateCcw, Square, Volume2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import type { StudyCorrectionPanel, StudyOutcomePanel } from "@/lib/studyView";
import type { CorrectionLesson } from "@/lib/correctionSession";
import { FocusedWordLesson } from "./FocusedWordLesson";
import type { TeachingStep } from "@/lib/teacherAction";
import type { StringKey } from "@locales/index";

/** The learner-facing name of each teaching step. Same table the NOW strip uses. */
const STEP_LABELS: Record<TeachingStep, StringKey> = {
  "show-word": "step.showWord",
  listen: "step.listen",
  "repeat-word": "step.repeatWord",
  "recite-ayah": "step.reciteAyah",
  "record-again": "step.recordAgain",
};

export type StudyCorrectionProps = {
  correction: StudyCorrectionPanel | null;
  outcome: StudyOutcomePanel | null;
  /**
   * The guided lesson for the word, when there is one. Present exactly when
   * `correction` is, and rendered instead of it: a word a learner has to get
   * back is worth teaching, not just marking.
   */
  lesson?: CorrectionLesson | null;
  /** Records one word — the page's own recorder, scoped by the caller. */
  onRecordWord?: () => void;
  /** Stops an open recording. */
  onStop?: () => void;
  /** Replays the ayah slowly. The page owns the audio element. */
  onListen: () => void;
  /** Starts or stops the one recorder the page already has. */
  onRecord: () => void;
  /** Runs the decision's own button. The page owns where it goes. */
  onCta: () => void;
  isRecording: boolean;
  isReviewing: boolean;
  audioUnavailable: boolean;
};

export function StudyCorrection({
  correction,
  outcome,
  onListen,
  onRecord,
  onCta,
  isRecording,
  isReviewing,
  audioUnavailable,
  lesson = null,
  onRecordWord,
  onStop,
}: StudyCorrectionProps) {
  const { t } = useLocale();

  /**
   * The path back to the microphone, as numbered steps.
   *
   * The steps themselves come from the decision. The recorder is rendered as
   * the final one because it *is* the last step — the same control the page
   * already owns, placed where the learner is looking, so they never have to
   * scroll back up to find the mic.
   */
  const steps = (panel: { steps: readonly TeachingStep[]; offerRecord: boolean }) => (
    <ol className="fix-steps" aria-label={t("correction.stepsLabel")}>
      {panel.steps
        .filter((step) => step !== "record-again")
        .map((step) => (
          <li key={step}>{t(STEP_LABELS[step])}</li>
        ))}
      {panel.offerRecord && (
        <li className="fix-steps-record">
          <button type="button" className={`fix-record ${isRecording ? "is-recording" : ""}`} onClick={onRecord} disabled={isReviewing}>
            {isRecording ? <Square size={15} fill="currentColor" aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
            {isRecording ? t("study.stopRecording") : isReviewing ? t("study.reviewing") : t("correction.recordAgain")}
          </button>
        </li>
      )}
    </ol>
  );

  /**
   * Replaying the reference.
   *
   * There is no word-level recitation in the Quran data this app reads — one
   * file per ayah, no word timings — so the button says it replays the ayah and
   * the note beneath says why. Nothing here synthesises Quranic Arabic.
   */
  const listen = (label: StringKey) => (
    <button type="button" className="fix-listen" onClick={onListen} disabled={audioUnavailable}>
      <Volume2 size={16} aria-hidden="true" /> {t(label)}
    </button>
  );

  // The guided lesson replaces the marker card whenever the page can build one.
  // It carries the same word, the same observation and the same recorder — this
  // is one teaching surface, not a second opinion beside the first.
  //
  // Checked before `correction`, not alongside it: while the learner is
  // recording the word, the decision is "listening" and names no correction at
  // all, and the lesson must not vanish from under them mid-attempt.
  if (lesson) {
    return (
      <FocusedWordLesson
        lesson={lesson}
        onListen={onListen}
        onRecordWord={onRecordWord ?? onRecord}
        onRecordAyah={onRecord}
        onStop={onStop ?? onRecord}
        onContinue={onCta}
        audioUnavailable={audioUnavailable}
      />
    );
  }

  if (correction) {
    return (
      <section className={`study-fix is-word ${correction.confirmed ? "" : "is-unsure"}`} aria-label={t("correction.label")}>
        {/* The word first, and bigger than anything around it: it is the whole
            point of the card. The eyebrow above and the position below say what
            it is and where it sits, without competing with it for attention. */}
        <p className="fix-eyebrow">
          <AlertCircle size={13} aria-hidden="true" /> {t("correction.eyebrow")}
        </p>
        <p className="fix-word" lang="ar" dir="rtl">
          {correction.arabic}
        </p>
        <p className="fix-position">{t("correction.wordAt", { number: correction.wordIndex })}</p>

        {/* Why this word — in the vocabulary the decision supplied, and never
            stronger than it. A sound observation stays a sound observation. */}
        <p className="fix-observed">{t(correction.explanationKey)}</p>

        {steps(correction)}

        {correction.offerReference && (
          <div className="fix-reference">
            {listen("correction.listen")}
            <small>{t("correction.referenceNote")}</small>
          </div>
        )}

        {/* What happens once they get it right, so the card is not a dead end. */}
        <small className="fix-after">{t("correction.after")}</small>
      </section>
    );
  }

  if (!outcome) return null;

  return (
    <section className={`study-fix is-${outcome.kind}`} aria-label={t("outcome.label")}>
      <p className="fix-eyebrow">
        {outcome.kind === "accepted" ? (
          <Check size={13} aria-hidden="true" />
        ) : outcome.kind === "uncertain" ? (
          <HelpCircle size={13} aria-hidden="true" />
        ) : (
          <RotateCcw size={13} aria-hidden="true" />
        )}{" "}
        {t("outcome.label")}
      </p>
      <h3 className="fix-headline">{t(outcome.headlineKey)}</h3>
      <p className="fix-observed">{t(outcome.detailKey)}</p>

      {(outcome.steps.length > 0 || outcome.offerRecord) && steps(outcome)}

      {outcome.offerReference && <div className="fix-reference">{listen("correction.listenAgain")}</div>}

      {/* The decision's own button — "Go to ayah 4" — never one derived here. */}
      {outcome.cta && (
        <button type="button" className="fix-cta" onClick={onCta}>
          {t(outcome.cta.labelKey, outcome.cta.params)} <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

export default StudyCorrection;
