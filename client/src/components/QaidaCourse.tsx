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
import {
  QAIDA_LESSONS,
  QAIDA_LEVELS,
  curriculumProgressPercent,
  followingLesson,
  getQaidaLesson,
  getQaidaLevel,
  isLessonUnlocked,
  lessonsForLevel,
  levelProgress,
  type QaidaLesson,
  type QaidaLessonStage,
} from "@shared/qaidaCurriculum";
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
  const { t } = useLocale();
  const letterAudio = useLetterAudio();
  const initialLesson = getQaidaLesson(progress.currentLessonId) ?? QAIDA_LESSONS[0];
  const [session, setSession] = useState<QaidaSession>(() => startSession(initialLesson));

  const lesson = initialLesson;
  const level = getQaidaLevel(lesson.level);
  const levelLessons = useMemo(() => lessonsForLevel(lesson.level), [lesson.level]);
  const positionInLevel = levelLessons.findIndex((entry) => entry.id === lesson.id) + 1;

  // A lesson change — the learner finished one, or opened an earlier one to
  // review — starts its practice from the beginning.
  useEffect(() => {
    setSession((current) => (current.lessonId === lesson.id ? current : startSession(lesson)));
  }, [lesson.id]);

  const item = currentItem(lesson, session);
  const alreadyCompleted = progress.completedLessons.includes(lesson.id);
  const finished = isSessionFinished(lesson, session);
  const next = followingLesson(lesson.id);

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
          <p>{level?.objective}</p>
        </div>
        <span className="course-progress">
          {t("course.percentComplete", { percent: curriculumProgressPercent(progress.completedLessons) })}
        </span>
      </div>

      {/* Where am I? Every level, with what is done in each. */}
      <div className="course-levels" aria-label={t("course.levelsLabel")}>
        {QAIDA_LEVELS.map((entry) => {
          const summary = levelProgress(entry.id, progress.completedLessons);
          const target = lessonsForLevel(entry.id).find(
            (candidate) => isLessonUnlocked(candidate.id, progress.completedLessons),
          );
          const isCurrent = entry.id === lesson.level;
          return (
            <button
              type="button"
              key={entry.id}
              className={`course-level ${isCurrent ? "is-current" : ""} ${summary?.unlocked ? "" : "is-locked"}`}
              aria-current={isCurrent}
              disabled={!target}
              title={target ? entry.objective : t("course.locked")}
              onClick={() => target && goToLesson(target.id)}
            >
              <span>{String(entry.order).padStart(2, "0")}</span>
              <strong>{entry.title}</strong>
              <small>
                {summary?.unlocked
                  ? t("course.levelProgress", { done: summary.completed, total: summary.total })
                  : t("course.locked")}
              </small>
            </button>
          );
        })}
      </div>

      {/* What am I learning? */}
      <div className="course-lesson">
        <div className="course-lesson-head">
          <div>
            <span className="eyebrow">
              {t("course.lessonPosition", { number: positionInLevel, total: levelLessons.length })}
            </span>
            <h4>{lesson.title}</h4>
            <p className="course-objective">{lesson.objective}</p>
          </div>
          {alreadyCompleted && <span className="course-completed"><Check size={13} /> {t("course.completedBadge")}</span>}
        </div>

        <div className="course-stages" aria-label={t("course.stagesLabel")}>
          {lesson.stages.map((stage) => <span key={stage}>{t(stageLabels[stage])}</span>)}
        </div>

        <p className="course-teaching">{lesson.teaching}</p>

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

        {/* What do I do next? One exercise, or the lesson's completion state. */}
        {!finished && item ? (
          <section className="course-exercise" aria-label={t("course.exerciseLabel")}>
            <div className="course-exercise-head">
              <span className="eyebrow">
                {t("course.exerciseProgress", { number: session.itemIndex + 1, total: lesson.practice.length })}
              </span>
              <p>{item.prompt}</p>
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

            {item.note && <p className="course-note"><AlertCircle size={13} /> {item.note}</p>}
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

        {lesson.boundary && <p className="course-boundary"><AlertCircle size={13} /> {lesson.boundary}</p>}
      </div>

      {/* Completed lessons stay open for review. */}
      <div className="course-lesson-list" aria-label={t("course.lessonListLabel")}>
        {levelLessons.map((entry) => {
          const unlocked = isLessonUnlocked(entry.id, progress.completedLessons);
          const done = progress.completedLessons.includes(entry.id);
          return (
            <button
              type="button"
              key={entry.id}
              className={`${entry.id === lesson.id ? "is-current" : ""} ${done ? "is-done" : ""}`}
              disabled={!unlocked}
              aria-current={entry.id === lesson.id}
              onClick={() => goToLesson(entry.id)}
            >
              {done ? <Check size={12} /> : unlocked ? null : <Lock size={12} />}
              <span>{entry.title}</span>
              {done && entry.id !== lesson.id && <em>{t("course.reviewLesson")}</em>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type { QaidaLesson };
