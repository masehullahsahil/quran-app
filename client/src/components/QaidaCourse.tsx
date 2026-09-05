/**
 * The Qaida course panel in Learn mode.
 *
 * One lesson at a time, one exercise at a time. Everything shown here comes from
 * shared/qaidaCurriculum.ts — this file renders the curriculum, it does not
 * define any of it.
 *
 * The letter recordings are the app's existing reference audio: nothing is
 * synthesised, and a form the active source has no file for simply has no play
 * control. These are reading exercises; the app is not listening to the learner
 * here, and none of them judges tajwid, makhraj, madd or ghunnah.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, BookOpen, Check, Lock, RotateCcw, Volume2 } from "lucide-react";
import { type QaidaLesson, type QaidaLessonStage } from "@shared/qaidaCurriculum";
import { describeCourseView } from "@/lib/courseView";
import { isReadExercise } from "@shared/qaidaExercises";
import {
  answerItem,
  continueSession,
  currentItem,
  isSessionFinished,
  retrySession,
  startSession,
  type QaidaSession,
} from "@/lib/qaidaSession";
import { completeLesson, openLesson, type QaidaProgress } from "@/lib/qaidaProgress";
import { letterAudioPath } from "@/lib/arabicLetters";
import { useLetterAudio } from "@/hooks/useLetterAudio";
import { useLocale } from "@/contexts/LocaleContext";
import { localizedExercise, localizedLesson } from "@shared/qaidaText";
import type { StringKey } from "@locales/index";

const stageLabels: Record<QaidaLessonStage, StringKey> = {
  learn: "course.stageLearn",
  listen: "course.stageListen",
  recognize: "course.stageRecognize",
  repeat: "course.stageRepeat",
  read: "course.stageRead",
  check: "course.stageCheck",
  complete: "course.stageComplete",
};

export function QaidaCourse({
  progress,
  onProgressChange,
  onOpenQuran,
}: {
  progress: QaidaProgress;
  onProgressChange: (progress: QaidaProgress) => void;
  /** Hands an ayah to Study mode, where the text comes from the Quran data layer. */
  onOpenQuran: (surah: number, ayah: number) => void;
}) {
  const { t, qaida } = useLocale();
  const letterAudio = useLetterAudio();
  const view = useMemo(() => describeCourseView(progress), [progress]);
  const { lesson, level } = view;
  // Course prose in the learner's language, per field, over the English
  // curriculum. The structure, the Arabic and the answers never change.
  const lessonText = localizedLesson(lesson, qaida);
  const [session, setSession] = useState<QaidaSession>(() => startSession(lesson));

  // A lesson change — the learner finished one, or opened an earlier one to
  // review — starts its practice from the beginning.
  useEffect(() => {
    setSession((current) => (current.lessonId === lesson.id ? current : startSession(lesson)));
  }, [lesson.id]);

  const item = currentItem(lesson, session);
  const alreadyCompleted = view.isReview;
  const finished = isSessionFinished(lesson, session);
  const next = view.nextLesson;

  const answer = (choiceId: string | null) => setSession((current) => answerItem(lesson, current, choiceId));
  const continueToNextItem = () => setSession((current) => continueSession(lesson, current));
  const tryAgain = () => setSession(retrySession);

  const finishLesson = () => {
    onProgressChange(completeLesson(progress, lesson.id));
  };

  const goToLesson = (lessonId: string) => {
    onProgressChange(openLesson(progress, lessonId));
  };

  const audioSrc = item?.audio ? letterAudioPath(item.audio.letterSlug, item.audio.harakat) : null;

  return (
    <div className="qaida-course">
      <div className="course-topline">
        <div>
          <span className="eyebrow">{t("course.eyebrow")}</span>
          <h3>{t("course.levelLabel", { order: level?.order ?? 1, title: level?.title ?? "" })}</h3>
          <p className="course-level-objective">{level?.objective}</p>
        </div>
        <span className="course-progress">
          {t("course.percentComplete", { percent: view.percentComplete })}
        </span>
      </div>

      {/* Where am I? A compact strip: the current level reads in full, the rest
          are numbers with their state. It orients without competing with the
          lesson below. */}
      <div className="course-levels" role="tablist" aria-label={t("course.levelsLabel")}>
        {view.levels.map((chip) => (
          <button
            type="button"
            key={chip.level.id}
            role="tab"
            className={`course-level ${chip.isCurrent ? "is-current" : ""} ${chip.isDone ? "is-done" : ""} ${chip.target ? "" : "is-locked"}`}
            aria-selected={chip.isCurrent}
            disabled={!chip.target}
            aria-label={`${t("course.levelLabel", { order: chip.level.order, title: chip.level.title })} — ${chip.target ? t("course.levelProgress", { done: chip.completed, total: chip.total }) : t("course.locked")}`}
            title={chip.target ? chip.level.objective : t("course.locked")}
            onClick={() => chip.target && goToLesson(chip.target)}
          >
            <span aria-hidden="true">{chip.isDone ? <Check size={12} /> : !chip.target ? <Lock size={12} /> : String(chip.level.order).padStart(2, "0")}</span>
            {chip.isCurrent && <strong>{chip.level.title}</strong>}
          </button>
        ))}
      </div>

      {/* What am I learning? */}
      <div className="course-lesson">
        <div className="course-lesson-head">
          <div>
            <span className="eyebrow">
              {t("course.lessonPosition", { number: view.positionInLevel, total: view.lessonsInLevel })}
            </span>
            <h4>{lessonText.title}</h4>
            <p className="course-objective">{lessonText.objective}</p>
          </div>
          {alreadyCompleted && <span className="course-completed"><Check size={13} /> {t("course.completedBadge")}</span>}
        </div>

        {/* Open while the lesson is new, and foldable once practice is under
            way, so one exercise is what the learner sees. */}
        <details className="course-teaching-details" open={session.attemptedIds.length === 0}>
          <summary>{t("course.teachingSummary")}</summary>
          <p className="course-teaching">{lessonText.teaching}</p>
          {lesson.examples.length > 0 && (
            <div className="course-examples" aria-label={t("course.examplesLabel")}>
              {lesson.examples.map((example, index) => (
                <div key={`${example.arabic}-${index}`} className={`course-example is-${example.source}`}>
                  <span lang="ar" dir="rtl">{example.arabic}</span>
                  <small>{example.gloss}</small>
                  <em>{example.source === "quran" ? t("course.quranBadge", { reference: example.reference ?? "" }) : t("course.teachingBadge")}</em>
                </div>
              ))}
            </div>
          )}
          <div className="course-stages" aria-label={t("course.stagesLabel")}>
            {lesson.stages.map((stage) => <span key={stage}>{t(stageLabels[stage])}</span>)}
          </div>
        </details>

        {/* What do I do next? One exercise, or the lesson's completion state. */}
        {!finished && item ? (
          <section className="course-exercise" aria-label={t("course.exerciseLabel")}>
            <div className="course-exercise-head">
              <span className="eyebrow">
                {t("course.exerciseProgress", { number: session.itemIndex + 1, total: lesson.practice.length })}
              </span>
              <p>{localizedExercise(item, qaida).prompt}</p>
            </div>

            {item.subject && (
              <div className={`course-subject is-${item.subject.source}`}>
                <span lang="ar" dir="rtl">{item.subject.arabic}</span>
                <small>
                  {item.subject.source === "quran"
                    ? t("course.quranBadge", { reference: item.subject.reference ?? "" })
                    : t("course.teachingBadge")}
                </small>
              </div>
            )}

            {audioSrc && (
              <button
                type="button"
                className={`course-audio ${letterAudio.playingSrc === audioSrc ? "is-playing" : ""}`}
                onClick={() => void letterAudio.play(audioSrc)}
              >
                <Volume2 size={16} /> {t("course.playAudio")}
              </button>
            )}
            {item.audio && !audioSrc && <p className="course-note"><AlertCircle size={13} /> {t("course.audioUnavailable")}</p>}

            {item.choices && (
              <div className="course-choices">
                {item.choices.map((choice) => {
                  const chosen = session.selectedChoiceId === choice.id;
                  const state = chosen ? (session.result === "correct" ? "is-correct" : "is-retry") : "";
                  return (
                    <button type="button" key={choice.id} className={`course-choice ${state}`} onClick={() => answer(choice.id)}>
                      {choice.arabic && <span lang="ar" dir="rtl">{choice.arabic}</span>}
                      {choice.label && <small>{choice.label}</small>}
                    </button>
                  );
                })}
              </div>
            )}

            {item.quran && (
              <button type="button" className="course-open-study" onClick={() => onOpenQuran(item.quran!.surah, item.quran!.ayah)}>
                <BookOpen size={16} /> {t("course.openInStudy", { reference: item.quran.label })}
              </button>
            )}

            {isReadExercise(item.type) && session.result !== "correct" && (
              <button type="button" className="course-read-done" onClick={() => answer(null)}>
                <Check size={16} /> {t("course.readAloud")}
              </button>
            )}

            {session.result && (
              <p className={`course-response is-${session.result}`}>
                {t(session.result === "correct" ? "course.correct" : "course.retry")}
              </p>
            )}

            <div className="course-actions">
              {session.result === "correct" ? (
                <button type="button" className="course-primary" onClick={continueToNextItem}>
                  {t("course.continue")} <ArrowRight size={16} />
                </button>
              ) : session.result === "retry" ? (
                <button type="button" className="course-primary" onClick={tryAgain}>
                  <RotateCcw size={16} /> {t("course.tryAgain")}
                </button>
              ) : null}
            </div>

            {localizedExercise(item, qaida).note && <p className="course-note"><AlertCircle size={13} /> {localizedExercise(item, qaida).note}</p>}
          </section>
        ) : (
          <section className="course-exercise is-complete" aria-label={t("course.exerciseLabel")}>
            <p className="course-response is-correct"><Check size={16} /> {t("course.lessonComplete")}</p>
            <div className="course-actions">
              {next ? (
                <button type="button" className="course-primary" onClick={finishLesson}>
                  {t("course.nextLesson", { title: next.title })} <ArrowRight size={16} />
                </button>
              ) : (
                <button type="button" className="course-primary" onClick={finishLesson}>
                  <Check size={16} /> {t("course.finishCourse")}
                </button>
              )}
              <button type="button" className="course-secondary" onClick={() => setSession(startSession(lesson))}>
                <RotateCcw size={16} /> {t("course.practiseAgain")}
              </button>
            </div>
            {!next && <p className="course-note">{t("course.courseComplete")}</p>}
          </section>
        )}

        {lessonText.boundary && <p className="course-boundary"><AlertCircle size={13} /> {lessonText.boundary}</p>}
      </div>

      {/* Completed lessons stay open for review. */}
      <div className="course-lesson-list" aria-label={t("course.lessonListLabel")}>
        {view.lessonsOfLevel.map(({ lesson: entry, unlocked, done, isCurrent }) => (
          <button
            type="button"
            key={entry.id}
            className={`${isCurrent ? "is-current" : ""} ${done ? "is-done" : ""}`}
            disabled={!unlocked}
            aria-current={isCurrent}
            onClick={() => goToLesson(entry.id)}
          >
            {done ? <Check size={12} /> : unlocked ? null : <Lock size={12} />}
            <span>{entry.title}</span>
            {done && !isCurrent && <em>{t("course.reviewLesson")}</em>}
          </button>
        ))}
      </div>
    </div>
  );
}

export type { QaidaLesson };
