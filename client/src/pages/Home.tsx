/**
 * Quiet Sanctuary design reminder: Quranic Arabic remains primary, while the
 * teacher loop makes listening, repetition, and careful review immediately usable.
 */
// The default import keeps this renderable in a test: the app's build uses the
// automatic JSX runtime, while the test transform falls back to the classic one
// (tsconfig sets `jsx: "preserve"`), where JSX needs React in scope.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  Headphones,
  Home as HomeIcon,
  Languages,
  Library,
  ListMusic,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { markIndexComplete, progressPercent } from "@/lib/learningProgress";
import { readQaidaProgress, writeQaidaProgress, type QaidaProgress } from "@/lib/qaidaProgress";
import { QaidaCourse } from "@/components/QaidaCourse";
import { curriculumProgressPercent } from "@shared/qaidaCurriculum";
import { type SupportedLanguageCode } from "@shared/languages";
import { ARABIC_LETTERS, HARAKAT, letterAudioPath, type Harakat } from "@/lib/arabicLetters";
import { ACTIVE_LETTER_AUDIO_SOURCE } from "@/lib/letterAudioSources";
import { isRecording as isSameRecording, useLetterAudio } from "@/hooks/useLetterAudio";
import { useLocale } from "@/contexts/LocaleContext";
import { SurahPicker } from "@/components/SurahPicker";
import { LanguagePicker } from "@/components/LanguagePicker";
import type { StringKey } from "@locales/index";
import type { Ayah, Translation } from "@shared/quran";
import { MAX_AUDIO_BYTES, formatMegabytes, isRecordingTooLarge } from "@shared/recording";
import { learningPlanTextKeys, type LearningLevel } from "@shared/learningPath";
import { buildReviewQueue, deriveAyahMemory, summarizeReview, type MemorizationAttempt } from "@shared/memorization";
import { LocalMemorizationHistoryRepository } from "@/lib/memorizationHistory";
import { synchronizeLearnerPersistence } from "@/lib/learnerPersistence";
import type { QuranAwareReview } from "@shared/quranEvaluation";
import type { CoachSpeechKeyRef } from "@shared/coachSpeech";
import { resolveTeacherAction, traceTeacherAction, type TeacherAction, type TeachingStep } from "@/lib/teacherAction";
import { describeStudyTiers } from "@/lib/studyView";
import { StudyCorrection } from "@/components/StudyCorrection";
import { LiveTutorPanel } from "@/components/LiveTutorPanel";
import { useLiveTutor } from "@/hooks/useLiveTutor";
import { attemptScopeFor, liveTutorSessionView } from "@/lib/liveTutorView";
import type { LearnerIntent, TutorRecitationOutcome } from "@shared/liveTutor";
import { FINISH_TURN, type TutorControlIntent } from "@shared/tutorConversation";
import { deriveCorrectionLesson, type AttemptScope, type RetainedTarget } from "@/lib/correctionSession";
import type {
  CorrectionSessionSnapshot,
  CorrectionTarget,
  FocusedWordResult,
  RecitationScoreScope,
} from "@shared/wordCorrection";
import { findWordAudio } from "@/lib/wordAudio";
import { useRecordingAudio } from "@/hooks/useRecordingAudio";
import { HandsFreeTutor, type HandsFreeOption } from "@/components/HandsFreeTutor";
import { useContinuousTutorAudio, continuousAudioSupported, type FinalisedTurn, type InterimTurnAudio } from "@/hooks/useContinuousTutorAudio";
import { useTutorPlaybackOrchestrator } from "@/hooks/useTutorPlaybackOrchestrator";
import { handsFreePlanFor, type HandsFreePlan } from "@/lib/handsFreePlan";
import { createCoachSpeechProvider, type CoachSpeechProvider, type CoachSpeechTextResolver } from "@/lib/coachSpeechProvider";
import { interruptHandoff, interruptsCapture, type LiveTutorServerEvent } from "@/lib/tutorLiveTransport";
import { useLiveRecitationStream } from "@/hooks/useLiveRecitationStream";
import type { MasteryState } from "@shared/memorization";
import {
  createVerseFollowingPosition,
  toVerseFollowingPosition,
  type VerseFollowingPosition,
  type VerseFollowingResult,
} from "@shared/verseFollowing";

type View = "read" | "learn" | "study" | "memorise";
type LessonStage = "listen" | "repeat" | "review";
type ExerciseResult = "correct" | "retry" | null;

type RecitationFeedback = {
  attemptScope: AttemptScope;
  recitationScoreScope: RecitationScoreScope;
  focusedWordResult: FocusedWordResult | null;
  correctionSession: CorrectionSessionSnapshot | null;
  expectedWords: Array<{ expected: string; heard: string | null; status: "matched" | "review" | "missing" | "extra"; wordIndex: number | null }>;
  extraWords: Array<{ expected: string; heard: string | null; status: "matched" | "review" | "missing" | "extra"; wordIndex: number | null }>;
  matchedCount: number;
  totalWords: number;
  score: number;
  corrections: Array<{ expected: string; heard: string | null; status: "matched" | "review" | "missing" | "extra"; wordIndex: number | null }>;
  transcript: string;
  encouragement: string;
  nextStep: string;
  spokenGuidance: string;
  /**
   * The key reference the coaching voice speaks. Key-only: the client
   * resolves it with its locale pack — callers hand over a key and
   * language, never text, so Quran text structurally cannot enter speech.
   */
  spokenGuidanceKey: CoachSpeechKeyRef | null;
  wordReviewAvailable: boolean;
  reviewStatus: "available" | "unavailable";
  reviewMessage: string | null;
  /** Stable reason code, rendered in the learner's language. */
  reviewMessageCode: "transcription_failed" | "no_arabic_returned" | "focused_target_invalid" | "focused_unclear" | null;
  quranAwareReview: QuranAwareReview;
  verseFollowing: VerseFollowingResult;
  learningPlan: {
    level: LearningLevel;
    title: string;
    focus: string;
    practiceLoop: readonly string[];
    boundary: string;
  };
  note: string;
};

const acousticFindingLabels: Record<QuranAwareReview["findings"][number]["kind"], StringKey> = {
  phoneme: "feedback.acousticPhoneme",
  vowel_length: "feedback.acousticVowelLength",
  pause: "feedback.acousticPause",
  tajweed: "feedback.acousticTajweed",
};

// Verse-following copy. The state says what the learner should do next; the
// reason says why the tracker decided it. Both are bounded enums from
// shared/verseFollowing.ts, so every case has a fixed string here.
const followStateLabels: Record<VerseFollowingResult["state"], StringKey> = {
  following: "follow.stateFollowing",
  correcting: "follow.stateCorrecting",
  uncertain: "follow.stateUncertain",
  completed: "follow.stateCompleted",
};

const followReasonCopy: Record<VerseFollowingResult["reason"], StringKey> = {
  no_transcript: "follow.reasonNoTranscript",
  too_little_evidence: "follow.reasonTooLittleEvidence",
  noisy_transcript: "follow.reasonNoisyTranscript",
  previous_ayah_repeated: "follow.reasonPreviousAyah",
  next_ayah_started_early: "follow.reasonNextAyahEarly",
  partial_progress: "follow.reasonPartialProgress",
  mistake_to_correct: "follow.reasonMistakeToCorrect",
  ayah_completed: "follow.reasonAyahCompleted",
  surah_completed: "follow.reasonSurahCompleted",
};

// Mastery is an internal enum; the learner sees a teacher's word for it.
const masteryLabels: Record<MasteryState, StringKey> = {
  new: "mastery.new",
  learning: "mastery.learning",
  needs_review: "mastery.needs_review",
  strong: "mastery.strong",
  mastered: "mastery.mastered",
};

// The teaching sequence, as a fixed set of steps. Wording per step, no prose.
// The server names why a review could not be produced; the words are ours.
const reviewMessageKeys: Record<"transcription_failed" | "no_arabic_returned" | "focused_target_invalid" | "focused_unclear", StringKey> = {
  transcription_failed: "feedback.transcriptionFailed",
  no_arabic_returned: "feedback.noArabicReturned",
  focused_target_invalid: "feedback.reviewFocusedTargetInvalid",
  focused_unclear: "feedback.reviewFocusedUnclear",
};

const teachingStepLabels: Record<TeachingStep, StringKey> = {
  "show-word": "step.showWord",
  listen: "step.listen",
  "repeat-word": "step.repeatWord",
  "recite-ayah": "step.reciteAyah",
  "record-again": "step.recordAgain",
};

type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserRecognitionConstructor = new () => BrowserRecognition;

type LiveRecitationSession = {
  sessionId: string; surah: number; currentAyah: number; expectedWordIndex: number;
  lastCompletedAyah: number | null; trackerState: VerseFollowingPosition["state"];
  attemptsOnCurrentAyah: number; chunkCount: number; lastAcceptedTranscriptSegment: string;
  recentCorrectionFocus: { wordIndex: number; expectedArabic: string; kind: "missing" | "review" } | null;
  currentAyahTranscript: string; processedChunkIds: string[];
};

function newLiveSession(surah: number, ayah: number): LiveRecitationSession {
  return {
    sessionId: `study-${surah}-${ayah}-${Date.now()}`, surah, currentAyah: ayah,
    expectedWordIndex: 1, lastCompletedAyah: null, trackerState: "following",
    attemptsOnCurrentAyah: 0, chunkCount: 0, lastAcceptedTranscriptSegment: "",
    recentCorrectionFocus: null, currentAyahTranscript: "", processedChunkIds: [],
  };
}

declare global {
  interface Window {
    SpeechRecognition?: BrowserRecognitionConstructor;
    webkitSpeechRecognition?: BrowserRecognitionConstructor;
  }
}

// These tables carry string *keys*, not text. The instruction language supplies
// the words at render time; the Arabic in `arabic` below is content, not
// instruction, so it is the same in every language.
const navigation: Array<{ key: StringKey; icon: typeof BookOpen; active?: boolean }> = [
  { key: "nav.today", icon: HomeIcon, active: true },
  { key: "nav.library", icon: Library },
  { key: "nav.bookmarks", icon: Bookmark },
];

const tabs: Array<{ id: View; labelKey: StringKey; captionKey: StringKey; icon: typeof BookOpen }> = [
  { id: "learn", labelKey: "mode.learn", captionKey: "mode.learnCaption", icon: Languages },
  { id: "study", labelKey: "mode.study", captionKey: "mode.studyCaption", icon: ListMusic },
  { id: "read", labelKey: "mode.read", captionKey: "mode.readCaption", icon: BookOpen },
  { id: "memorise", labelKey: "mode.memorise", captionKey: "mode.memoriseCaption", icon: Sparkles },
];

// Two levels, not three: reading connected text is the Study department's job,
// so the letters-and-joining work stays in Qaida and recitation rules in Tajweed.
const learningLevels: Array<{ id: LearningLevel; order: string; arabic: string; titleKey: StringKey; summaryKey: StringKey; cueKey: StringKey }> = [
  { id: "qaida", order: "01", arabic: "القاعدة", titleKey: "learn.level.qaida", summaryKey: "learn.level.qaidaSummary", cueKey: "learn.level.qaidaCue" },
  { id: "tajweed", order: "02", arabic: "التجويد", titleKey: "learn.level.tajweed", summaryKey: "learn.level.tajweedSummary", cueKey: "learn.level.tajweedCue" },
];

const alphabet = ARABIC_LETTERS;

const harakatLabelKeys: Record<Harakat, { label: StringKey; hint: StringKey }> = {
  fatha: { label: "harakat.fatha", hint: "harakat.fathaHint" },
  kasra: { label: "harakat.kasra", hint: "harakat.kasraHint" },
  damma: { label: "harakat.damma", hint: "harakat.dammaHint" },
};

const stripArabic = (value: string) => value
  .normalize("NFKC")
  .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
  .replace(/[أإآٱ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/[،؛؟.!,:;"'()\[\]{}]/g, "")
  .trim();

function VerseMedallion({ number }: { number: number }) {
  return <span className="verse-medallion" aria-label={`Ayah ${number}`}>{number}</span>;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The recording could not be read."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

function storedNumberList(key: string): number[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is number => Number.isInteger(value)) : [];
  } catch {
    return [];
  }
}


/**
 * Whether a review's word positions describe the ayah on screen.
 *
 * A review names words by position, and a position only means something
 * against the ayah it was made about. If any of them falls outside this ayah,
 * the review is about somewhere else however it got here, and every conclusion
 * drawn from it — the instruction, the correction, the word rows, the score —
 * would be about words this ayah does not have. Dropping the whole review is
 * the safe direction: Study falls back to its ordinary states.
 */
function reviewFitsAyah(review: RecitationFeedback, arabic: string): boolean {
  const words = arabic.split(/\s+/).filter(Boolean).length;
  if (words === 0) return false;
  if (review.correctionSession && (
    review.correctionSession.surah < 1 ||
    review.correctionSession.ayah < 1 ||
    review.correctionSession.targetWordIndex > words
  )) return false;
  return review.corrections.every((correction) => correction.wordIndex === null || (correction.wordIndex >= 1 && correction.wordIndex <= words));
}

export default function Home() {
  const [view, setView] = useState<View>("read");
  const [surahNumber, setSurahNumber] = useState(1);
  const [reciterId, setReciterId] = useState<number | null>(null);
  const [translationId, setTranslationId] = useState<number | null>(null);
  const [selectedVerse, setSelectedVerse] = useState(1);
  const [continuousListening, setContinuousListening] = useState(true);
  // The audio source the browser could not load. Kept as a URL rather than a
  // flag so a stale failure never suppresses the next ayah's playback.
  const [failedAudioSrc, setFailedAudioSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [covered, setCovered] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);
  const [saved, setSaved] = useState(false);
  const [lessonStage, setLessonStage] = useState<LessonStage>("listen");
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveMatched, setLiveMatched] = useState<number[]>([]);
  // Null until the first status arrives, so the opening line comes from the
  // locale pack rather than being baked into the component in English.
  const [recorderMessage, setRecorderMessage] = useState<string | null>(null);
  // Whether the last recording was one word or a whole ayah. See startRecording.
  const [lastAttemptScope, setLastAttemptScope] = useState<AttemptScope | null>(null);
  // The word the correction lesson is about. See `retainedTarget` in
  // correctionSession.ts: it keeps the lesson on screen across one attempt, and
  // is only ever a copy of what the decision last named.
  const [correctionTarget, setCorrectionTarget] = useState<RetainedTarget | null>(null);
  const [correctionSession, setCorrectionSession] = useState<CorrectionSessionSnapshot | null>(null);
  // The focus word's own recording. Its own element: the ayah player is busy
  // with the ayah, and the two must never fight over one <audio>.
  const wordRecording = useRecordingAudio();
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  /**
   * The last reviewed attempt, with the ayah it was an attempt at.
   *
   * The ayah matters. A review is a statement about one recitation of one ayah,
   * and reading it on a different ayah's screen produces claims about words
   * that ayah does not have — which is how a correction on Al-Fatiha 1:2 came
   * to be rendered against 1:3 as "رَبِّ · Word 3 of 2". An effect clears this on
   * navigation, but effects run after the commit, so the frame between the ayah
   * changing and the effect firing is a render that must also be safe. Hence
   * `feedback` below: derived, not stored, so there is no such frame.
   */
  const [reviewedAttempt, setReviewedAttempt] = useState<{
    surah: number;
    ayah: number;
    review: RecitationFeedback;
    /** The server's single authoritative verdict for the turn that produced this review (tutor lessons). */
    outcome: TutorRecitationOutcome | null;
    /** Tutor session revision that produced this review; a newer tutor turn means the lesson moved on. */
    revision: number | null;
  } | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [learningLevel, setLearningLevel] = useState<LearningLevel>("qaida");
  const [selectedLetter, setSelectedLetter] = useState(0);
  const [coachAudioOn, setCoachAudioOn] = useState(true);
  // The storage keys still carry the old level names so a learner who practised
  // under Starter/Reading keeps that progress after the rename.
  const [lettersPractised, setLettersPractised] = useState<number[]>(() => storedNumberList("miqra-starter-practised"));
  // Where the learner is in the Qaida curriculum, restored from the same local
  // storage the rest of the learner's progress uses.
  const [qaidaProgress, setQaidaProgress] = useState<QaidaProgress>(() => readQaidaProgress());
  const [letterExerciseResult, setLetterExerciseResult] = useState<ExerciseResult>(null);
  // Where the learner is in the surah, carried between attempts. The tracker on
  // the server owns the rules; this only stores its answer.
  const [position, setPosition] = useState<VerseFollowingPosition>(() => createVerseFollowingPosition(1, 1));
  const historyRepository = useMemo(() => new LocalMemorizationHistoryRepository(window.localStorage), []);
  const [memorizationAttempts, setMemorizationAttempts] = useState<MemorizationAttempt[]>(() => historyRepository.list());

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const liveSessionRef = useRef<LiveRecitationSession>(newLiveSession(1, 1));
  const liveChunkSequenceRef = useRef(0);
  const liveRequestRef = useRef<Promise<void>>(Promise.resolve());
  const chunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef<string | null>(null);
  // Set when a verse change should start playing on its own — the Next control
  // and the end-of-ayah handover both use it, so continuous listening survives
  // the src swap that a verse change causes.
  const resumeOnVerseChangeRef = useRef(false);
  /**
   * Whether the hands-free lesson is running.
   *
   * Read by `reviewRecording`, which is defined above the hands-free section
   * and needs to know one thing about it: that the teacher already has a voice.
   * See its use below — two of them talking over each other is not a lesson.
   */
  const handsFreeRef = useRef(false);

  const { t, locale, letterLesson, manifest } = useLocale();

  /**
   * The review's coaching voice, in the learner's own language.
   *
   * Key-only: the server sends `spokenGuidanceKey`, and the provider resolves
   * it with the current locale pack — the voice and the screen can never
   * disagree, and callers hand over keys rather than text, so Quran text
   * structurally cannot enter speech. Where the platform has no voice for
   * the language, the sentence stays on screen. Quranic Arabic is played
   * from a reciter's recording (see useLetterAudio) or not at all: a
   * synthesiser has no phoneme for ح ع ص ض ط ظ ق غ and renders them as
   * unrelated sounds.
   */
  const resolveTextRef = useRef<CoachSpeechTextResolver>((key, params) => t(key, params));
  resolveTextRef.current = (key, params) => t(key, params);
  const guidanceSpeechRef = useRef<CoachSpeechProvider | null>(null);
  if (!guidanceSpeechRef.current) {
    guidanceSpeechRef.current = createCoachSpeechProvider({
      resolveText: (key, params, language) => resolveTextRef.current(key, params, language),
    });
  }
  const speakGuidance = useCallback((ref: CoachSpeechKeyRef | null, language: SupportedLanguageCode) => {
    if (!ref) return;
    const provider = guidanceSpeechRef.current;
    if (!provider) return;
    provider.cancel();
    void provider.speak({ messageKey: ref.key, params: ref.params, language });
  }, []);
  const letterAudio = useLetterAudio();
  const evaluateRecitation = trpc.recitation.evaluate.useMutation();
  /**
   * The trusted recording path (#57).
   *
   * One call does the whole job: the server loads the tutor's own Quran
   * position and active target, runs the same evaluator ordinary Study uses,
   * and applies the result to the lesson. The browser sends audio and a session
   * reference, and receives a review plus a decided tutor turn. It never sees,
   * builds, or forwards the evidence in between.
   */
  const evaluateWithTutor = trpc.recitation.evaluateWithTutor.useMutation();
  // Both paths look identical to the learner: a recording is being checked.
  const isCheckingRecitation = evaluateRecitation.isPending || evaluateWithTutor.isPending;
  const ingestRecitationChunk = trpc.recitation.ingestChunk.useMutation();
  const me = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const syncProgress = trpc.learner.syncProgress.useMutation();
  const syncQaidaProgress = trpc.learner.syncQaidaProgress.useMutation();
  const recordMemorizationAttempt = trpc.learner.recordMemorizationAttempt.useMutation();
  const durableReview = trpc.learner.getReviewQueue.useQuery(undefined, {
    enabled: Boolean(me.data),
    refetchOnWindowFocus: false,
  });

  // The Quran's text does not change, so both queries are cached indefinitely
  // for the session and the server keeps its own TTL cache in front of
  // Quran.com. Paging back to a surah you have already opened costs nothing.
  const quranIndex = trpc.quran.index.useQuery(undefined, { staleTime: Infinity, gcTime: Infinity });
  const allReciters = quranIndex.data?.reciters ?? [];
  // Default to one that plays. Landing on a silent reciter would look exactly
  // like the bug this replaced.
  const defaultReciterId = (allReciters.find((option) => option.available) ?? allReciters[0])?.id ?? null;
  const activeReciterId = reciterId ?? defaultReciterId;
  const translations = quranIndex.data?.translations ?? [];

  /**
   * Translations grouped by language for the picker's optgroups. The groups are
   * built from whatever the API returned, so a language Quran.com adds appears
   * without a code change here; the pack's preferred language is only sorted to
   * the top, never used to filter.
   */
  const translationGroups = useMemo(() => {
    const byLanguage = new Map<string, Translation[]>();
    for (const item of translations) {
      const group = byLanguage.get(item.languageName) ?? [];
      group.push(item);
      byLanguage.set(item.languageName, group);
    }
    const preferred = manifest.preferredTranslationLanguage?.toLowerCase();
    const rank = (languageName: string) => {
      const name = languageName.toLowerCase();
      if (preferred && name === preferred) return 0;
      if (name === "english") return 1;
      return 2;
    };
    return Array.from(byLanguage.entries())
      .map(([languageName, items]: [string, Translation[]]) => ({ languageName, items }))
      .sort((a, b) => rank(a.languageName) - rank(b.languageName) || a.languageName.localeCompare(b.languageName));
  }, [translations, manifest]);

  // Nothing chosen yet: take the first translation of the pack's preferred
  // language, which the sort above has already put first.
  const defaultTranslationId = translationGroups[0]?.items[0]?.id ?? null;
  const activeTranslationId = translationId ?? defaultTranslationId;

  const surahQuery = trpc.quran.surah.useQuery(
    {
      surah: surahNumber,
      ...(activeReciterId === null ? {} : { reciterId: activeReciterId }),
      ...(activeTranslationId === null ? {} : { translationId: activeTranslationId }),
    },
    { enabled: quranIndex.isSuccess, staleTime: Infinity, gcTime: Infinity },
  );

  const surahs = quranIndex.data?.surahs ?? [];
  const juzs = quranIndex.data?.juzs ?? [];
  const reciters = quranIndex.data?.reciters ?? [];
  const ayahs: Ayah[] = useMemo(() => surahQuery.data?.ayahs ?? [], [surahQuery.data]);
  const activeSurah = surahQuery.data?.surah ?? surahs.find((item) => item.number === surahNumber) ?? null;
  const activeVerse = useMemo(
    () => ayahs.find((verse) => verse.number === selectedVerse) ?? ayahs[0] ?? null,
    [ayahs, selectedVerse],
  );
  const activeIndex = activeVerse ? ayahs.findIndex((verse) => verse.number === activeVerse.number) : -1;
  /**
   * The last review, but only where it applies.
   *
   * A review of another ayah is not evidence about this one, so it is dropped
   * here rather than in an effect — that keeps the instruction, the correction
   * card, the lesson, the word rows and the score all consistent on every
   * render, including the one right after the learner moves.
   */
  const feedback: RecitationFeedback | null =
    reviewedAttempt &&
    reviewedAttempt.surah === surahNumber &&
    reviewedAttempt.ayah === (activeVerse?.number ?? selectedVerse) &&
    reviewFitsAyah(reviewedAttempt.review, activeVerse?.arabic ?? "")
      ? reviewedAttempt.review
      : null;
  const nextVerse = activeIndex >= 0 ? ayahs[activeIndex + 1] ?? null : null;
  const previousVerse = activeIndex > 0 ? ayahs[activeIndex - 1] : null;
  const surahLabel = activeSurah?.nameSimple ?? t("reader.loading");
  // Juz are ordered and contiguous, so the reader's juz is the last one that
  // starts at or before the selected ayah. This keeps the juz picker in step
  // when a long surah is read straight through a juz boundary.
  const currentJuz = useMemo(() => {
    let found: number | null = null;
    for (const juz of juzs) {
      const startsBefore = juz.firstSurah < surahNumber
        || (juz.firstSurah === surahNumber && juz.firstAyah <= selectedVerse);
      if (startsBefore) found = juz.number;
    }
    return found;
  }, [juzs, surahNumber, selectedVerse]);
  const expectedWords = useMemo(() => (activeVerse?.arabic ?? "").split(/\s+/).filter(Boolean), [activeVerse]);
  const activeLevel = useMemo(() => learningLevels.find((level) => level.id === learningLevel) ?? learningLevels[0], [learningLevel]);
  // The plan's own words come from the learner's pack, keyed by level, so the
  // coaching panel is never a pocket of English inside a translated screen.
  const coachPlanKeys = useMemo(() => {
    const keys = learningPlanTextKeys(learningLevel);
    return {
      title: keys.title as StringKey,
      focus: keys.focus as StringKey,
      lessonGoal: keys.lessonGoal as StringKey,
      boundary: keys.boundary as StringKey,
      practiceLoop: keys.practiceLoop as readonly StringKey[],
    };
  }, [learningLevel]);
  const activeLetter = alphabet[selectedLetter] ?? alphabet[0];
  const soloAudioSrc = letterAudioPath(activeLetter.slug);
  /**
   * A source can legitimately have no file for a form — the placeholder set
   * carries bare letters but no vowelled ones. Those controls are disabled and
   * the reason is stated below, rather than substituting a near-enough sound.
   */
  const harakatAudioMissing = HARAKAT.every((harakat) => !letterAudioPath(activeLetter.slug, harakat.id));
  // Whichever set is wired up, say so plainly rather than crediting the reciter
  // for a stand-in recording. See client/src/lib/letterAudioSources.ts.
  const usingPlaceholderAudio = ACTIVE_LETTER_AUDIO_SOURCE.isPlaceholder;
  // Teaching text for this letter in the instruction language, falling back to
  // English per letter when a pack has not translated it yet.
  const activeLesson = letterLesson(activeLetter.slug);
  // The Qaida level's headline figure is how much of the curriculum is done; the
  // letter explorer keeps its own count of letters practised beside it.
  const qaidaPercent = curriculumProgressPercent(qaidaProgress.completedLessons);
  const lettersPractisedPercent = progressPercent(lettersPractised.length, alphabet.length);
  const activeMemory = useMemo(() => deriveAyahMemory(surahNumber, selectedVerse, memorizationAttempts), [surahNumber, selectedVerse, memorizationAttempts]);
  const reviewSummary = useMemo(() => summarizeReview(memorizationAttempts), [memorizationAttempts]);
  const activeRecommendation = useMemo(() => {
    const queue = me.data && durableReview.data ? durableReview.data.queue : buildReviewQueue(memorizationAttempts);
    return queue.find((item) => item.surah === surahNumber && item.ayah === selectedVerse);
  }, [durableReview.data, me.data, memorizationAttempts, surahNumber, selectedVerse]);

  useEffect(() => () => {
    audioRef.current?.pause();
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    recognitionRef.current?.stop();
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
  }, []);

  useEffect(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setLessonStage("listen");
    setReviewedAttempt(null);
    setReviewError(null);
    setLiveTranscript("");
    setLiveMatched([]);
    setRecorderMessage(t("recorder.intro"));
    // Choosing an ayah — including accepting the tracker's "continue with the
    // next ayah" — starts that ayah from its first word. What was already
    // completed in this surah is kept.
    setPosition((current) => ({
      ...createVerseFollowingPosition(surahNumber, selectedVerse),
      lastCompletedAyah: current.currentSurah === surahNumber ? current.lastCompletedAyah : null,
    }));
    if (liveSessionRef.current.surah !== surahNumber || liveSessionRef.current.currentAyah !== selectedVerse) {
      liveSessionRef.current = newLiveSession(surahNumber, selectedVerse);
      liveChunkSequenceRef.current = 0;
    }
  }, [selectedVerse, surahNumber]);

  // A surah change carries the selection with it (juz navigation lands mid-surah,
  // for instance). If the landing ayah is not in the surah that loaded, fall back
  // to its first ayah rather than rendering an empty reader.
  useEffect(() => {
    if (!ayahs.length) return;
    if (!ayahs.some((verse) => verse.number === selectedVerse)) setSelectedVerse(ayahs[0].number);
  }, [ayahs, selectedVerse]);

  // A new ayah or a new reciter is a new source; forget the previous failure.
  useEffect(() => {
    setFailedAudioSrc(null);
  }, [selectedVerse, surahNumber, activeReciterId]);

  useEffect(() => {
    window.localStorage.setItem("miqra-starter-practised", JSON.stringify(lettersPractised));
  }, [lettersPractised]);

  useEffect(() => {
    writeQaidaProgress(qaidaProgress);
    if (me.data) syncQaidaProgress.mutate(qaidaProgress, {
      onSuccess: snapshot => {
        writeQaidaProgress(snapshot.qaida);
        const merged = { completedLessons: snapshot.qaida.completedLessons, currentLessonId: snapshot.qaida.currentLessonId };
        setQaidaProgress(current => JSON.stringify(current) === JSON.stringify(merged)
          ? current
          : merged);
      },
    });
  }, [qaidaProgress]);

  // Sign-in is the migration boundary. Upload the local cache and retry queue,
  // then adopt the merged server snapshot as the local cache.
  useEffect(() => {
    if (!me.data) return;
    let cancelled = false;
    const synchronize = async () => {
      try {
        const snapshot = await synchronizeLearnerPersistence(historyRepository, input => syncProgress.mutateAsync(input));
        if (cancelled) return;
        setMemorizationAttempts(snapshot.memorizationAttempts);
        const merged = { completedLessons: snapshot.qaida.completedLessons, currentLessonId: snapshot.qaida.currentLessonId };
        setQaidaProgress(current => JSON.stringify(current) === JSON.stringify(merged)
          ? current
          : merged);
      } catch {
        // Local state and queued attempts remain intact for the next retry.
      }
    };
    void synchronize();
    window.addEventListener("online", synchronize);
    return () => { cancelled = true; window.removeEventListener("online", synchronize); };
  }, [me.data?.id]);

  useEffect(() => {
    setLetterExerciseResult(null);
    letterAudio.stop();
  }, [selectedLetter, letterAudio.stop]);

  const selectVerse = (number: number) => {
    setSelectedVerse(number);
    if (view === "memorise") setCovered(false);
  };

  const moveVerse = (direction: -1 | 1) => {
    const target = direction === 1 ? nextVerse : previousVerse;
    if (target) selectVerse(target.number);
  };

  /**
   * Selection is set surah-first: juz navigation lands on an ayah part-way
   * through a surah, so the ayah cannot be reset by an effect watching the surah.
   */
  const selectSurah = (number: number, ayah = 1) => {
    resumeOnVerseChangeRef.current = false;
    audioRef.current?.pause();
    setSurahNumber(number);
    setSelectedVerse(ayah);
    if (view === "memorise") setCovered(false);
  };

  const selectJuz = (juzNumber: number) => {
    const juz = juzs.find((item) => item.number === juzNumber);
    if (juz) selectSurah(juz.firstSurah, juz.firstAyah);
  };

  /**
   * @param options.retry the reader pressed "try again" on a failed source. The
   * element is reloaded and the remembered failure is ignored — without both,
   * the retry is answered by the same cached error and looks broken too.
   */
  const playReciter = async (rate = 1, options: { retry?: boolean } = {}) => {
    const audio = audioRef.current;
    if (!audio) return;
    // A missing source always blocks; a *failed* one blocks until it is retried.
    if (!activeVerse?.audioUrl || (audioLoadFailed && !options.retry)) {
      setRecorderMessage(audioUnavailableMessage);
      return;
    }
    if (options.retry) audio.load();
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = rate;
    audio.volume = 1;
    try {
      await audio.play();
      setIsPlaying(true);
      setLessonStage("listen");
      setRecorderMessage(t(rate < 1 ? "recorder.listenSlow" : "recorder.listenOnce"));
    } catch {
      // A source that cannot be decoded rejects here as well as firing `error`.
      // Reporting the device volume for that would send the reader looking in
      // the wrong place.
      if (audio.error) {
        setFailedAudioSrc(activeVerse.audioUrl);
        setRecorderMessage(t("playback.audioFailed", { reciter: activeReciterName }));
      } else {
        setRecorderMessage(t("recorder.audioFailed"));
      }
    }
  };

  /**
   * Try a failed reciter source again.
   *
   * A CDN hiccup is the common case and it clears on a second attempt, so the
   * failure is forgotten and the element is reloaded before playing — without
   * the reload the browser serves its cached error and the retry looks broken
   * too. Nothing about the ayah or the reciter changes here.
   */
  const retryReciterAudio = () => {
    setFailedAudioSrc(null);
    void playReciter(1, { retry: true });
  };

  /**
   * Move to the following ayah and keep listening. This is the Read view's
   * "Next": the verse change swaps the audio source, so the actual play() call
   * happens in the effect below once the new source is mounted.
   */
  const listenToNext = () => {
    if (!nextVerse) return;
    resumeOnVerseChangeRef.current = true;
    selectVerse(nextVerse.number);
  };

  const toggleReaderPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    void playReciter(1);
  };

  /**
   * The source failed to load — a 404 at the CDN, an unplayable file, a network
   * drop. Without this the element fails silently: the play button does nothing
   * and the reader is told nothing, which is how a broken reciter looked before.
   */
  const handleAudioError = () => {
    setIsPlaying(false);
    // Don't hand over into the next ayah on a broken chain.
    resumeOnVerseChangeRef.current = false;
    const src = audioRef.current?.currentSrc || activeVerse?.audioUrl;
    if (src) setFailedAudioSrc(activeVerse?.audioUrl ?? src);
  };

  // Continuous listening: the ayah that just finished hands over to the next one.
  const handleAudioEnded = () => {
    setIsPlaying(false);
    if (!continuousListening || view !== "read" || !nextVerse) return;
    resumeOnVerseChangeRef.current = true;
    setSelectedVerse(nextVerse.number);
  };

  // Runs after the effect that pauses playback on a verse change, so the new
  // ayah starts from a clean state rather than racing the reset.
  useEffect(() => {
    if (!resumeOnVerseChangeRef.current) return;
    resumeOnVerseChangeRef.current = false;
    if (!activeVerse?.audioUrl) return;
    void playReciter(1);
    // playReciter is recreated every render; depending on the verse identity is
    // what makes this fire exactly once per handover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVerse?.verseKey, activeVerse?.audioUrl]);

  const stopRecognition = () => {
    try { recognitionRef.current?.stop(); } catch { /* browser already stopped */ }
    recognitionRef.current = null;
  };

  const updateLiveGuide = (transcript: string) => {
    const heard = transcript.split(/\s+/).filter(Boolean).map(stripArabic);
    const matched: number[] = [];
    let expectedIndex = 0;
    for (const heardWord of heard) {
      if (expectedIndex < expectedWords.length && stripArabic(expectedWords[expectedIndex]) === heardWord) {
        matched.push(expectedIndex);
        expectedIndex += 1;
      }
    }
    setLiveTranscript(transcript);
    setLiveMatched(matched);
  };

  const beginLiveGuide = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setRecorderMessage(t("recorder.noLiveGuide"));
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "ar-SA";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const segment = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalTranscript += `${segment} `;
        else interimTranscript += `${segment} `;
      }
      const visibleTranscript = `${finalTranscript}${interimTranscript}`.trim();
      updateLiveGuide(visibleTranscript);
      if (!activeVerse) return;

      const submitChunk = (transcriptChunk: string, stability: "interim" | "final") => {
        if (!transcriptChunk) return;
        const chunkId = stability === "final"
          ? `${liveSessionRef.current.sessionId}-${++liveChunkSequenceRef.current}`
          : undefined;
        // Keep requests ordered: a late response must never overwrite a newer
        // Quran position. The endpoint keeps interim session state immutable.
        liveRequestRef.current = liveRequestRef.current.then(async () => {
        const session = liveSessionRef.current;
        const expectedVerse = ayahs.find((verse) => verse.number === session.currentAyah) ?? activeVerse;
        const expectedIndex = ayahs.findIndex((verse) => verse.number === expectedVerse.number);
        const result = await ingestRecitationChunk.mutateAsync({
          session, expectedAyahArabic: expectedVerse.arabic, transcriptChunk, stability,
          totalAyahs: ayahs.length, chunkId,
          ...(expectedIndex > 0 ? { previousAyahArabic: ayahs[expectedIndex - 1].arabic } : {}),
          ...(ayahs[expectedIndex + 1] ? { nextAyahArabic: ayahs[expectedIndex + 1].arabic } : {}),
        });
        setLiveMatched(result.assessment.expectedWords
          .filter((word) => word.status === "matched" && word.wordIndex !== null)
          .map((word) => word.wordIndex! - 1));
        if (!result.accepted) return;
        liveSessionRef.current = result.session;
        setPosition({
          currentSurah: result.session.surah, currentAyah: result.session.currentAyah,
          expectedWordIndex: result.session.expectedWordIndex,
          lastCompletedAyah: result.session.lastCompletedAyah, state: result.session.trackerState,
          attemptsOnCurrentAyah: result.session.attemptsOnCurrentAyah,
        });
        if (result.guidance === "ayah_advanced") setSelectedVerse(result.session.currentAyah);
        }).catch(() => setRecorderMessage(t("recorder.liveGuidePaused")));
      };

      // A Web Speech event may contain both newly-finalized and still-interim
      // results. Persist the stable prefix first, then preview the full text.
      submitChunk(finalTranscript.trim(), "final");
      if (interimTranscript.trim()) submitChunk(visibleTranscript, "interim");
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") setRecorderMessage(t("recorder.liveGuidePaused"));
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch { /* an existing browser recognition session may still be closing */ }
  };

  const reviewRecording = async (blob: Blob, attemptScope: AttemptScope, correctionTargetAtStart?: CorrectionTarget) => {
    if (!activeVerse) return;
    // Checked before the lesson stage moves: an empty capture means nothing
    // was recorded, so there is nothing to review — the lesson stays where it
    // was and the learner is told to try again, instead of stranding the UI in
    // a "review" stage for an attempt that never existed.
    if (!blob.size) {
      const message = t("recorder.empty");
      setReviewError(message);
      setRecorderMessage(message);
      return;
    }
    setLessonStage("review");
    // Checked before encoding: base64 inflates the payload by a third, and a
    // serverless host rejects an oversized body before our code can explain
    // why. Failing here means the learner gets a recovery path instead of a dead
    // request.
    if (isRecordingTooLarge(blob.size)) {
      const message = t("recorder.tooLarge", {
        size: formatMegabytes(blob.size),
        limit: formatMegabytes(MAX_AUDIO_BYTES),
      });
      setReviewError(message);
      setRecorderMessage(message);
      return;
    }
    try {
      setReviewError(null);
      setRecorderMessage(t("recorder.reviewing"));
      const audioBase64 = await blobToBase64(blob);
      // One stable key for this finalized recording. tRPC/network retries reuse
      // the same object, while a later recording in the same session gets a new
      // key and therefore remains a distinct learning attempt.
      const attemptId = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${liveSessionRef.current.sessionId}-${Date.now()}-${liveChunkSequenceRef.current}`;
      const mimeType = blob.type === "audio/ogg" ? "audio/ogg" as const
        : blob.type === "audio/wav" ? "audio/wav" as const
        : blob.type === "audio/mp4" ? "audio/mp4" as const
        : "audio/webm" as const;
      // The coach's encouragement follows the interface language. It is wording
      // only — the instruction and the advancement decision are already made,
      // deterministically, before this call returns.
      const uiLanguage = locale as SupportedLanguageCode;
      /**
       * Which path this recording takes.
       *
       * With a live lesson, the trusted one: the tutor's session reference and
       * the audio go together and the server decides everything else. Without
       * one, ordinary Study, unchanged — the same call it has always made, with
       * the same client-supplied ayah context, because there is no tutor whose
       * authority it could be undermining.
       */
      const tutorReference = tutorRef.current.reference;
      let result;
      // The server's verdict for this attempt, bound to the review as one
      // unit: the notes below must never describe a different attempt than
      // the one the panel just answered.
      let attemptOutcome: TutorRecitationOutcome | null = null;
      let attemptRevision: number | null = null;
      if (tutorReference) {
        const handoff = await evaluateWithTutor.mutateAsync({
          session: tutorReference,
          // Everything the trusted route accepts. Not in this object, and not
          // accepted by its schema: expected Quran text, surah, ayah, the
          // neighbouring ayahs, the position, or the correction target. Those
          // are the tutor's, and the server reads them from the tutor.
          attempt: { audioBase64, mimeType, learningLevel, uiLanguage, attemptScope },
        });
        // The lesson moved, or did not, on the server. Either way this is the
        // answer and the page does not second-guess it.
        tutorRef.current.applyHandoff(handoff.tutor);
        if (!handoff.recitation) {
          // The session was stale, lost, or the attempt did not fit it. No
          // review is shown, no progress is written, and the Quran does not
          // move — the tutor says what happens next.
          const message = t("tutor.recordingNotApplied");
          setReviewError(message);
          setRecorderMessage(message);
          return;
        }
        result = handoff.recitation;
        attemptOutcome = handoff.outcome ?? null;
        attemptRevision = handoff.tutor.session?.revision ?? null;
      } else {
        result = await evaluateRecitation.mutateAsync({
          expectedArabic: activeVerse.arabic,
          audioBase64,
          mimeType,
          surah: surahNumber,
          ayah: activeVerse.number,
          attemptScope,
          ...(correctionTargetAtStart ? { correctionTarget: correctionTargetAtStart } : {}),
          learningLevel,
          uiLanguage,
          // Position tracking. The neighbouring ayahs let the server tell a
          // repeated previous ayah or an early next ayah apart from a real
          // attempt at this one, using the same alignment it already runs.
          totalAyahs: ayahs.length,
          ...(previousVerse ? { previousAyahArabic: previousVerse.arabic } : {}),
          ...(nextVerse ? { nextAyahArabic: nextVerse.arabic } : {}),
          position: {
            expectedWordIndex: position.expectedWordIndex,
            lastCompletedAyah: position.lastCompletedAyah,
            state: position.state,
            attemptsOnCurrentAyah: position.attemptsOnCurrentAyah,
          },
        });
      }
      const rawReview = result as RecitationFeedback;
      const review: RecitationFeedback = {
        ...rawReview,
        attemptScope: rawReview.attemptScope ?? attemptScope,
        recitationScoreScope: rawReview.recitationScoreScope ?? (attemptScope === "ayah" ? "ayah" : "none"),
        focusedWordResult: rawReview.focusedWordResult ?? null,
        correctionSession: rawReview.correctionSession ?? null,
      };
      setReviewedAttempt({ surah: surahNumber, ayah: activeVerse.number, review, outcome: attemptOutcome, revision: attemptRevision });
      setCorrectionSession(review.correctionSession);
      if (attemptScope === "ayah") setPosition(toVerseFollowingPosition(review.verseFollowing));
      // This is the sole history write point: the recorder's finalized server
      // assessment must be usable. Live/interim chunks only guide position.
      if (attemptScope === "ayah" && review.recitationScoreScope === "ayah" && review.wordReviewAvailable) {
        const eventuallyAdvanced = review.verseFollowing.reason === "ayah_completed" || review.verseFollowing.reason === "surah_completed";
        const errors = review.corrections.map((item) => ({
          type: item.status === "missing" ? "omission" as const : item.status === "review" ? "substitution_review" as const : "extra" as const,
          wordIndex: item.wordIndex,
        }));
        const attempt: MemorizationAttempt = {
          id: attemptId, sessionId: liveSessionRef.current.sessionId, surah: surahNumber, ayah: activeVerse.number,
          timestamp: new Date().toISOString(),
          result: review.verseFollowing.state === "uncertain" ? "uncertain" : eventuallyAdvanced && errors.length ? "corrected" : eventuallyAdvanced || review.score === 100 ? "completed" : "partial",
          matchedCount: review.matchedCount, totalExpectedWords: review.totalWords, score: review.score,
          correctionWordIndexes: errors.flatMap((item) => item.wordIndex === null ? [] : [item.wordIndex]),
          errors, attemptsRequired: position.attemptsOnCurrentAyah + 1, eventuallyAdvanced,
        };
        if (historyRepository.save(attempt)) setMemorizationAttempts(historyRepository.list());
        if (me.data) {
          historyRepository.enqueue(attempt);
          // Feedback is already visible. Persistence deliberately runs in the
          // background and a failure leaves the item queued.
          recordMemorizationAttempt.mutate({ ...attempt, stability: "final" }, {
            onSuccess: () => {
              historyRepository.acknowledge(attempt.id);
              void durableReview.refetch();
            },
          });
        }
      }
      // The recorder message is always a locale key: the review's stable reason
      // code when it has one, otherwise the generic unavailable sentence.
      // Raw server text (transcription errors, exception messages) is never
      // shown to the learner — it stays in the response for diagnostics.
      setRecorderMessage(review.wordReviewAvailable
        ? t("recorder.reviewReady")
        : review.reviewMessageCode
          ? t(reviewMessageKeys[review.reviewMessageCode])
          : t("feedback.reviewUnavailable"));
      // Study's own coaching voice, and only Study's. In a hands-free lesson
      // the teacher is already speaking — in the learner's own language, in a
      // sequence built around the Quran boundary — and this line reads the
      // review's guidance over the top of it. One teacher at a time.
      if (review.wordReviewAvailable && coachAudioOn && !handsFreeRef.current) speakGuidance(review.spokenGuidanceKey, locale as SupportedLanguageCode);
    } catch (error) {
      // Never surface a raw exception message: it is English, internal, and
      // sometimes a network stack trace. The learner gets the locale's
      // review-failed sentence; the error itself is already in the console.
      console.warn("[recitation] review request failed", error);
      const message = t("recorder.reviewFailed");
      setReviewError(message);
      setRecorderMessage(message);
    }
  };

  const stopRecording = () => {
    stopRecognition();
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    setIsRecording(false);
  };

  /**
   * @param scope Which control the learner pressed. The recorder, the upload
   * and the review are identical either way — this is only remembered so the
   * correction lesson can read the result as an answer about the one word it
   * asked for, rather than as a verdict on an ayah the learner did not recite.
   */
  const startRecording = async (scope: AttemptScope = "ayah") => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setRecorderMessage(t("recorder.noRecorder"));
      return;
    }
    setLastAttemptScope(scope);
    const correctionTargetAtStart: CorrectionTarget | undefined = scope === "word" && correctionLesson
      ? {
          surah: surahNumber,
          ayah: activeVerse?.number ?? selectedVerse,
          targetWordIndex: correctionLesson.targetWordIndex,
          expectedArabic: correctionLesson.targetArabic,
          attemptsOnTarget: correctionSession?.attemptsOnTarget ?? 0,
        }
      : undefined;
    try {
      audioRef.current?.pause();
      setReviewedAttempt(null);
      setReviewError(null);
      setLiveTranscript("");
      setLiveMatched([]);
      liveSessionRef.current = newLiveSession(surahNumber, activeVerse?.number ?? selectedVerse);
      liveChunkSequenceRef.current = 0;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
        recorderRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
        const nextUrl = URL.createObjectURL(blob);
        recordingUrlRef.current = nextUrl;
        setRecordingUrl(nextUrl);
        void reviewRecording(blob, scope, correctionTargetAtStart);
      };
      recorder.start(250);
      setIsRecording(true);
      setLessonStage("repeat");
      setRecorderMessage(t("recorder.listening"));
      beginLiveGuide();
    } catch {
      const message = t("recorder.noMicrophone");
      setReviewError(message);
      setLessonStage("repeat");
      setRecorderMessage(message);
    }
  };

  const retryLesson = () => {
    stopRecognition();
    setReviewedAttempt(null);
    setReviewError(null);
    setLiveTranscript("");
    setLiveMatched([]);
    liveSessionRef.current = newLiveSession(surahNumber, activeVerse?.number ?? selectedVerse);
    liveChunkSequenceRef.current = 0;
    setLessonStage("listen");
    setRecorderMessage(t("recorder.retry"));
    void playReciter(0.8);
  };

  const openRecitationPractice = () => {
    selectSurah(1);
    setView("study");
  };

  const markCurrentLetterPractised = () => {
    setLettersPractised((current) => markIndexComplete(current, selectedLetter));
  };

  const chapterHeading = view === "learn" ? t("learn.heading") : `${t("reader.surahLabel")} ${surahLabel}`;
  const chapterEyebrow = view === "learn"
    ? t("learn.eyebrow")
    : `${String(surahNumber).padStart(2, "0")} · ${activeSurah?.translatedName ?? t("reader.loading")}`;
  const chapterCopy = t(view === "learn" ? "learn.copy" : "reader.chapterCopy");

  // The tracker's latest answer. Null until an attempt has been reviewed.
  const follow = feedback?.verseFollowing ?? null;
  // One instruction, chosen from every signal Study holds. The rules live in
  // client/src/lib/teacherAction.ts so they can be tested without a browser.
  const reviewDue = Boolean(activeMemory.nextReviewAt && new Date(activeMemory.nextReviewAt) <= new Date());
  // Everything the teacher knows about this attempt, gathered once. The rules
  // that turn it into one instruction live in shared/teacherDecision.ts.
  const teacherAction: TeacherAction = resolveTeacherAction({
    recording: {
      isRecording,
      isReviewing: isCheckingRecitation,
      failed: Boolean(reviewError),
    },
    attempt: feedback
      ? {
          reviewable: feedback.wordReviewAvailable,
          corrections: feedback.corrections,
          verseFollowing: feedback.verseFollowing,
        }
      : null,
    acoustic: feedback?.quranAwareReview ?? null,
    memory: {
      reviewDue,
      // Word positions this learner keeps missing in this ayah, from the
      // existing deterministic memory layer — no new mastery model.
      recurringWordIndexes: activeRecommendation?.focusWordIndexes ?? [],
    },
    livePosition: { currentSurah: position.currentSurah, currentAyah: position.currentAyah, expectedWordIndex: position.expectedWordIndex },
    hasNextAyah: Boolean(nextVerse),
  });
  const teacherTrace = traceTeacherAction(teacherAction);
  const recitationDiagnosticsEnabled = import.meta.env.DEV || import.meta.env.VITE_RECITATION_DIAGNOSTICS === "1";
  const runTeacherAction = () => {
    if (teacherAction.button?.command === "next-ayah" && teacherAction.targetAyah !== null) {
      selectVerse(teacherAction.targetAyah);
      return;
    }
    retryLesson();
  };

  const activeReciterName = reciters.find((reciter) => reciter.id === activeReciterId)?.name ?? t("panel.reciterFallback");
  // Two different failures, two different messages: the API returned no file at
  // all, or it returned one the browser could not play.
  const audioLoadFailed = Boolean(activeVerse?.audioUrl) && failedAudioSrc === activeVerse?.audioUrl;
  const audioUnavailable = !activeVerse?.audioUrl || audioLoadFailed;
  const audioUnavailableMessage = audioLoadFailed
    ? t("playback.audioFailed", { reciter: activeReciterName })
    : t("playback.noAudio");
  const readingPercent = ayahs.length && activeVerse ? Math.round(((activeIndex + 1) / ayahs.length) * 100) : 0;
  const contentPending = quranIndex.isPending || surahQuery.isPending;
  const contentError = quranIndex.error ?? surahQuery.error;
  const retryContent = () => {
    if (quranIndex.error) void quranIndex.refetch();
    else void surahQuery.refetch();
  };

  // Which block belongs to which tier. The page renders this; the rules for it
  // are in client/src/lib/studyView.ts so the layout contract can be tested.
  const studyTiers = describeStudyTiers({
    action: teacherAction,
    hasFeedback: feedback !== null,
    wordReviewAvailable: Boolean(feedback?.wordReviewAvailable),
    hasAcousticReview: feedback?.quranAwareReview.status !== undefined && feedback?.quranAwareReview.status !== "not_configured",
    audioUnavailable,
    reviewFailed: Boolean(reviewError),
  });

  /**
   * The guided lesson for the word, when the decision named one.
   *
   * Nothing about the learner's progress is decided here: the stage is a
   * supplied by the recitation service. The local derivation remains only as a
   * compatibility fallback for responses from before the server-owned session.
   */
  const correctionLesson = deriveCorrectionLesson({
    action: teacherAction,
    // The ayah on screen. Anything the lesson holds about another one is
    // dropped rather than rendered against this ayah's words.
    surah: surahNumber,
    ayah: activeVerse?.number ?? selectedVerse,
    observationKey: studyTiers.correction?.explanationKey ?? null,
    retainedTarget: correctionTarget,
    ayahWords: expectedWords,
    corrections: feedback?.corrections ?? null,
    wordReviewAvailable: Boolean(feedback?.wordReviewAvailable),
    lastAttemptScope,
    isRecording,
    isChecking: isCheckingRecitation,
    session: correctionSession,
  });

  /**
   * The recording of the focus word, when the source served a trustworthy one.
   *
   * Resolved from the canonical ayah on screen, so it carries the same
   * protections the lesson has: a recording for another ayah, an index the ayah
   * has no room for, or a word that is not the one standing at that position
   * all resolve to null and the lesson falls back to the reciter's ayah.
   */
  /**
   * The Live Tutor.
   *
   * One session per ayah, opened when Study is on screen and the ayah is known.
   * Everything about the lesson — the phase, the action, the target — is the
   * server's; this page holds the microphone, the audio and the words on
   * screen, and asks the tutor what to say.
   *
   * When the tutor is unreachable, `active` stays false and Study renders the
   * surfaces it had before, which still work.
   */
  const tutor = useLiveTutor({
    surah: surahNumber,
    ayah: activeVerse?.number ?? selectedVerse,
    totalAyahs: ayahs.length || 1,
    learnerLanguage: locale as SupportedLanguageCode,
    enabled: view === "study" && Boolean(activeVerse) && ayahs.length > 0,
  });

  // The evaluation callback is created once per attempt and outlives the render
  // it was made in, so it reads the controller through a ref rather than
  // capturing one.
  const tutorRef = useRef(tutor);
  tutorRef.current = tutor;

  /**
   * Follow the tutor's Quran position.
   *
   * The single rule: when an accepted trusted answer puts the lesson at a
   * different surah/ayah than the one it was at, the screen moves to exactly
   * that position. Nothing else may move it while a lesson is running — not a
   * next-ayah guess, not a score, not a reading of the transcript, and not the
   * learner asking to continue.
   *
   * Opening a session at a position is not a move, so the first answer is
   * recorded and ignored; otherwise a learner who had paged ahead would be
   * dragged back to where the lesson started.
   */
  const trustedSurah = tutor.turn?.session.surah ?? null;
  const trustedAyah = tutor.turn?.session.ayah ?? null;
  const lastTrustedPlace = useRef<string | null>(null);
  useEffect(() => {
    if (trustedSurah === null || trustedAyah === null) {
      lastTrustedPlace.current = null;
      return;
    }
    const place = `${trustedSurah}:${trustedAyah}`;
    if (lastTrustedPlace.current === place) return;
    const opening = lastTrustedPlace.current === null;
    lastTrustedPlace.current = place;
    if (opening || trustedSurah !== surahNumber) return;
    setSelectedVerse(trustedAyah);
  }, [trustedSurah, trustedAyah, surahNumber]);

  /**
   * The word the tutor is holding, if any.
   *
   * Read straight off the session the server returned. Guarded the same way the
   * focused lesson is (#50): a target from another ayah, or one the ayah on
   * screen has no room for, is not a target for this screen.
   */
  const tutorCorrection = (() => {
    const held = tutor.turn?.session.activeCorrection ?? null;
    if (!held || held.surah !== surahNumber || held.ayah !== (activeVerse?.number ?? selectedVerse)) return null;
    if (held.targetWordIndex < 1 || held.targetWordIndex > expectedWords.length) return null;
    return held.targetArabic ? { wordIndex: held.targetWordIndex, arabic: held.targetArabic } : null;
  })();

  /**
   * The word whose recording may be offered.
   *
   * The tutor's own target when a session is running — it is the authority on
   * what the lesson is about — and the focused lesson's otherwise, which is
   * what Study uses without a tutor.
   */
  const audioTarget = tutorCorrection ?? (correctionLesson
    ? { wordIndex: correctionLesson.targetWordIndex, arabic: correctionLesson.targetArabic }
    : null);

  const focusWordAudio = audioTarget
    ? findWordAudio(
        {
          surah: surahNumber,
          ayah: activeVerse?.number ?? selectedVerse,
          wordIndex: audioTarget.wordIndex,
          arabic: audioTarget.arabic,
        },
        {
          surah: surahNumber,
          ayah: activeVerse?.number ?? selectedVerse,
          ayahWords: expectedWords,
          wordAudio: activeVerse?.wordAudio ?? [],
          source: surahQuery.data?.wordAudioSource ?? null,
        },
      )
    : null;

  // Only the word in front of the learner is warmed, never a surah's worth — a
  // learner on a metered connection should not pay for recordings of words they
  // were never sent back to. The hook's `preload` is stable, so this runs when
  // the target word changes and not on every render.

  const preloadWord = wordRecording.preload;
  useEffect(() => {
    preloadWord(focusWordAudio?.url ?? null);
  }, [focusWordAudio?.url, preloadWord]);


  const tutorView = tutor.turn
    ? liveTutorSessionView(
        {
          session: tutor.turn.session,
          action: tutor.turn.action,
          // The word is playable only where #51 found a trusted recording of it.
          canHearWord: Boolean(focusWordAudio),
          canHearAyah: !audioUnavailable,
          isRecording,
          isChecking: isCheckingRecitation,
          // What the learner is actually looking at. When the lesson has moved
          // and the page has not yet followed, the tutor says nothing about a
          // word rather than pointing at the wrong ayah (#50).
          displayedSurah: surahNumber,
          displayedAyah: activeVerse?.number ?? selectedVerse,
        },
        expectedWords.length,
      )
    : null;

  /* ------------------------------------------------ the hands-free lesson */

  /**
   * The lesson with the microphone left open.
   *
   * Everything below is additive. Study's manual path — the record button, the
   * correction card, the panel's own controls — is untouched and is exactly
   * what runs when this cannot: an old browser, a refused permission, no
   * `AudioContext`. A learner who never presses "Start Live Tutor" sees the
   * screen they saw before, and one whose microphone fails is put back on it.
   *
   * The division of labour is the same one the rest of the tutor observes. The
   * browser decides *when the learner stopped talking* and *which file to
   * play*; the server decides everything about the Quran. There is no code
   * below that names a word, compares a recitation, or moves an ayah.
   */
  const [handsFreeOn, setHandsFreeOn] = useState(false);
  const [coachMuted, setCoachMuted] = useState(false);
  handsFreeRef.current = handsFreeOn;
  const handsFreeSupported = continuousAudioSupported();

  // `reviewRecording` is re-made every render and a finalised turn arrives from
  // a timer that outlives the render it was armed in, so it is reached through
  // a ref. The same reason `tutorRef` exists.
  const reviewRecordingRef = useRef(reviewRecording);
  reviewRecordingRef.current = reviewRecording;

  /**
   * A turn the detector finalised, on its way to the trusted route.
   *
   * It takes exactly the path a recording made with the record button takes —
   * `reviewRecording`, which sends it through `recitation.evaluateWithTutor`
   * with the tutor's session reference and nothing else. Hands-free changes
   * *when* a recording is made, never what happens to it or who judges it.
   */
  const handleFinalisedTurn = useCallback((turn: FinalisedTurn) => {
    void (async () => {
      try {
        await reviewRecordingRef.current(turn.blob, turn.scope);
      } finally {
        // Whatever the server said — accepted, rejected, unreachable — the
        // learner is no longer being checked, and the next plan may open the
        // microphone again. A lesson that could get stuck on "Checking" because
        // one request failed would be worse than one that simply listens again.
        continuousRef.current?.setChecking(false);
      }
    })();
  }, []);

  /**
   * Rolling audio, on its way to the tracker.
   *
   * The capture hook cuts one of these every `interimChunkMs` while the learner
   * is speaking an ayah turn; the stream hook drops it when the server would
   * refuse it. Reached through a ref because the stream is opened *after* the
   * microphone exists — it needs a live session and an active capture — while
   * the capture hook needs this handler at the moment it is created.
   *
   * Nothing about the Quran travels with it.
   */
  const liveStreamRef = useRef<{ sendInterim: (chunk: InterimTurnAudio) => void } | null>(null);
  const handleInterimAudioRef = useCallback((chunk: InterimTurnAudio) => {
    liveStreamRef.current?.sendInterim(chunk);
  }, []);

  const handleMicrophoneUnavailable = useCallback(() => {
    // Back to the manual path, which works. Nothing is described as hands-free
    // from here: the component says what happened and Study's own controls are
    // the way forward.
    setHandsFreeOn(false);
  }, []);

  const continuous = useContinuousTutorAudio({
    onTurn: handleFinalisedTurn,
    onInterim: handleInterimAudioRef,
    onUnavailable: handleMicrophoneUnavailable,
    /**
     * Deliberately no `onTiming`.
     *
     * The engine accepts timing events, and sending them from here would look
     * like the obvious wiring — but `learner-started-speaking` and
     * `learner-stopped-speaking` both *set the session phase*, and the phase is
     * what selects the attempt scope (#53). A browser-detected pause during a
     * word correction would move the lesson out of `correcting-word`, and the
     * learner's next recording of one word would be submitted as a whole-ayah
     * attempt. Local silence detection must never be able to do that. The
     * recording itself is the evidence, and the server reads it.
     */
  });
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;

  /**
   * The sequence the app performs in answer to the tutor's own turn.
   *
   * Built from `action.kind` and nothing else — see `lib/handsFreePlan.ts`.
   * Null whenever hands-free is not running, which is what keeps the manual
   * path completely inert.
   */
  // Memoised on the things it is actually made of. Without this the plan is a
  // new object on every render, and an effect watching it re-runs on every
  // render — which is a render loop the moment that effect sets any state.
  const handsFreeTurn = tutor.turn;
  const handsFreeWordUrl = focusWordAudio?.url ?? null;
  const displayedAyahNumber = activeVerse?.number ?? selectedVerse;
  const handsFreePlan: HandsFreePlan | null = useMemo(() => (
    handsFreeOn && handsFreeTurn
      ? handsFreePlanFor({
          session: handsFreeTurn.session,
          action: handsFreeTurn.action,
          canPlayWord: Boolean(handsFreeWordUrl),
          canPlayAyah: !audioUnavailable,
          onScreen: handsFreeTurn.session.surah === surahNumber
            && handsFreeTurn.session.ayah === displayedAyahNumber,
        })
      : null
  ), [handsFreeOn, handsFreeTurn, handsFreeWordUrl, audioUnavailable, surahNumber, displayedAyahNumber]);

  const handsFreeRunnable = handsFreeOn
    && continuous.active
    && continuous.state !== "paused"
    && continuous.state !== "session-lost"
    && continuous.state !== "microphone-unavailable";

  const playback = useTutorPlaybackOrchestrator({
    plan: handsFreePlan,
    language: locale as SupportedLanguageCode,
    muted: coachMuted,
    // The Quran, only ever as a recording. Both of these are trusted files —
    // #51's word audio and the selected reciter's ayah — and there is no third
    // source the orchestrator could reach for.
    wordAudioUrl: handsFreeWordUrl,
    ayahAudioUrl: activeVerse?.audioUrl ?? null,
    translate: t,
    holdForPlayback: continuous.holdForPlayback,
    releasePlayback: continuous.releasePlayback,
    listen: continuous.listen,
    enabled: handsFreeRunnable,
  });

  /**
   * Codex's live tracking (#61), wired.
   *
   * `recitation.startLive` binds a stream to the trusted lesson when the
   * hands-free session begins; rolling audio goes to
   * `recitation.ingestLiveAudio` while the learner is still reciting; and the
   * server decides, alone, whether what it heard amounts to a skipped word.
   * The browser's whole part in that decision is supplying ordered audio.
   */
  const handleLiveEvent = useCallback((event: LiveTutorServerEvent) => {
    if (interruptsCapture(event)) {
      // Server authority. Capture stops now, mid-word, and the partial audio is
      // discarded rather than submitted — the server has already decided, and
      // asking it the same question again could produce a second answer.
      continuousRef.current?.interrupt();
      tutorRef.current.applyHandoff(interruptHandoff(event));
      return;
    }
    if (event.type === "lost") {
      continuousRef.current?.markSessionLost();
      return;
    }
    // `tracking` and `not-applied` are provisional or bookkeeping. Nothing is
    // rendered from either: a learner watching "maybe you missed a word" appear
    // and disappear will stop and correct something that was right, and a
    // duplicate chunk is not news. While the server is still deciding, the
    // screen goes on saying "Listening."
  }, []);

  const liveStream = useLiveRecitationStream({
    enabled: handsFreeOn && continuous.active,
    reference: tutor.reference,
    learningLevel,
    uiLanguage: locale as SupportedLanguageCode,
    onEvent: handleLiveEvent,
  });
  liveStreamRef.current = liveStream;

  /**
   * The server no longer has this lesson.
   *
   * Everything stops: no automatic progression, no invented correction, and the
   * ayah stays exactly where it is. The learner is offered a way to start
   * again, and starting again resumes from this position rather than claiming
   * the ayah was completed.
   */
  useEffect(() => {
    if (handsFreeOn && tutor.status === "lost") continuousRef.current?.markSessionLost();
  }, [handsFreeOn, tutor.status]);

  // Leaving Study ends the session and hands the microphone back. Not a
  // nice-to-have: a live track surviving a navigation is a microphone the
  // learner did not agree to leave open.
  useEffect(() => {
    if (view !== "study" && handsFreeOn) {
      continuousRef.current?.stop();
      setHandsFreeOn(false);
    }
  }, [view, handsFreeOn]);

  /**
   * Start the lesson, in an order that cannot race.
   *
   * Three things have to happen and the sequence is load-bearing:
   *
   *   1. the microphone is granted,
   *   2. the server accepts the `start` intent and its answer is stored,
   *   3. and only then does anything open a live stream or capture audio.
   *
   * Step 2 has to be *awaited* rather than fired and forgotten. A live stream
   * is opened against a session id **and a revision**, and the server rejects a
   * stale revision — so a stream opened while `start` is still in flight can
   * name the revision that intent is about to replace, be refused, and leave
   * the lesson running with no live tracking at all and nothing on screen to
   * say so. Under in-process test latency the two orders look identical; over a
   * real network they do not.
   *
   * The barrier is the `await`, not React's rendering order and not which
   * request happens to reach the server first. `handsFreeOn` is what enables
   * the stream, and it is set only after the trusted handoff is stored — so the
   * first render that can open a stream already holds the new revision. The
   * revision itself is never computed here: it arrives on the handoff.
   *
   * Still one press. A second is only ever needed if the server did not answer.
   *
   * A recycled server is the same shape of failure with a different cause.
   * The tutor sessions live in the API instance's memory, so when that
   * instance is replaced between Study opening and Start being pressed, the
   * `start` intent lands somewhere the lesson never existed and comes back
   * `lost`. `startLesson` re-opens the session at the same position and
   * retries the intent once — still one press — and only stores the final
   * outcome, so a repaired `lost` never unmounts the tutor panel mid-press.
   */
  const startHandsFree = useCallback(async () => {
    const ready = await continuousRef.current.start();
    if (!ready) return;
    // `startLesson` awaits the trusted handoff — the barrier above — and
    // repairs a `lost` from a recycled server instance by re-opening the
    // lesson once, still within this press.
    const handoff = await tutorRef.current.startLesson();
    if (!handoff || handoff.status === "lost") {
      // The lesson did not move, or is gone. Binding a stream now would name a
      // revision we cannot vouch for, so nothing starts: the microphone goes
      // back and Study's own controls are there, working, as they always are.
      continuousRef.current.stop();
      return;
    }
    setHandsFreeOn(true);
  }, []);

  const handsFreeOptions: HandsFreeOption[] = (() => {
    if (!handsFreeOn || !tutor.turn) return [];
    const options: HandsFreeOption[] = ["repeat-teacher"];
    if (focusWordAudio) options.push("hear-word");
    if (!audioUnavailable) options.push("hear-ayah");
    options.push("hint");
    return options;
  })();

  /**
   * The recovery controls, which are the engine's intents by another name.
   *
   * Each one asks the tutor for something and then does nothing else: the turn
   * that comes back is what plays the word, shows the hint, or repeats the
   * instruction. Nothing here performs an action the server did not choose.
   */
  const runHandsFreeOption = useCallback((option: HandsFreeOption) => {
    const intent = option === "repeat-teacher" ? "again"
      : option === "hear-word" ? "hear-word"
      : option === "hear-ayah" ? "hear-ayah"
      : "hint";
    tutorRef.current.sendIntent(intent);
  }, []);

  /**
   * What the learner asked for.
   *
   * Two things happen for each intent: the tutor is told (so the session moves,
   * or refuses to), and the page does the local part — open the microphone,
   * play a file, step to another ayah. Nothing here decides a lesson state; the
   * next turn the server returns is what the panel renders.
   *
   * The recording scope comes from the engine's own action, never from a guess
   * about what the learner probably meant: a word-scoped attempt run through
   * the whole-ayah reviewer answers a question nobody asked (#53).
   */
  const runTutorIntent = (intent: TutorControlIntent) => {
    // Ending a turn is the recorder's business, not the engine's: it learns
    // what happened from the review that follows, not from being told the
    // learner stopped talking. So it is handled here and not sent on.
    if (intent === FINISH_TURN) {
      if (isRecording) stopRecording();
      return;
    }
    tutor.sendIntent(intent);
    const scope = tutor.turn ? attemptScopeFor(tutor.turn.session, tutor.turn.action) : "ayah";

    switch (intent) {
      case "start":
      case "again":
        if (isRecording) stopRecording();
        else void startRecording(scope);
        return;
      case "repeat-word":
        if (!isRecording) void startRecording("word");
        return;
      case "hear-word":
        if (focusWordAudio) {
          audioRef.current?.pause();
          void wordRecording.play(focusWordAudio.url);
        } else {
          // No trusted recording of the word, so the ayah, honestly — never a
          // synthesised stand-in for Quranic Arabic.
          void playReciter(0.78);
        }
        return;
      case "hear-ayah":
        void playReciter(1);
        return;
      case "from-beginning":
        retryLesson();
        return;
      // `continue` is a request, not a move. The Quran position is the tutor's
      // and it changes only when a trusted recitation result actually completes
      // an ayah — never because a learner pressed a button, and never before
      // the server has answered.
      case "continue":
        return;
      case "pause":
      case "stop":
        if (isRecording) stopRecording();
        audioRef.current?.pause();
        return;
      // `hint` and `resume` are the engine's to answer: the next turn carries
      // the hint, or the phase it resumed into. There is nothing local to do.
      default:
        return;
    }
  };



  useEffect(() => {
    // The decision names a word: remember it. It stops naming one either
    // because an attempt is in flight, or because the word went through — the
    // first is handled by `retainedTarget`, and the second clears it here once
    // the answer came from a whole-ayah attempt.
    if (teacherAction.kind === "repeat-word" && teacherAction.focusArabic && teacherAction.focusWordIndex !== null) {
      setCorrectionTarget({
        surah: surahNumber,
        ayah: activeVerse?.number ?? selectedVerse,
        wordIndex: teacherAction.focusWordIndex,
        arabic: teacherAction.focusArabic,
        observationKey: studyTiers.correction?.explanationKey ?? "correction.notHeard",
      });
      return;
    }
    // Only a *reviewed whole-ayah attempt* that names no word ends the lesson.
    // The decision also names none in the gap between the microphone opening
    // and the recorder reporting itself as running, and clearing on that would
    // pull the lesson out from under a learner who has just pressed "Say".
    if (feedback && lastAttemptScope !== "word") setCorrectionTarget(null);
  }, [teacherAction.kind, teacherAction.focusArabic, teacherAction.focusWordIndex, studyTiers.correction?.explanationKey, feedback, lastAttemptScope, surahNumber, activeVerse?.number, selectedVerse]);

  // A different ayah is a different lesson. The derivation above already
  // refuses to render a target from another ayah — this clears the state so it
  // cannot linger behind that guard either.
  useEffect(() => {
    setCorrectionTarget(null);
    setCorrectionSession(null);
    setLastAttemptScope(null);
  }, [surahNumber, selectedVerse]);


  const contentFallback = contentError ? (
    <div className="content-state is-error" role="alert">
      <AlertCircle size={20} />
      <p>{contentError.message}</p>
      <button type="button" onClick={retryContent}><RotateCcw size={15} /> {t("content.retry")}</button>
    </div>
  ) : (
    <div className="content-state" role="status">
      <span className="content-spinner" aria-hidden="true" />
      <p>{t("content.loading")}</p>
    </div>
  );

  return (
    <div className="sanctuary-shell">
      <audio ref={audioRef} src={activeVerse?.audioUrl ?? undefined} preload="auto" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={handleAudioEnded} onError={handleAudioError} />
      <aside className="app-rail" aria-label={t("nav.primaryLabel")}>
        <div className="rail-brand">
          <img src="/brand/quran-learning-logo-refined.png" alt="" className="brand-mark" />
          <div><p className="brand-name">Miqra</p><p className="brand-arabic" lang="ar" dir="rtl">مِقْرَأ</p></div>
        </div>
        <nav className="rail-nav">
          <p className="rail-label">{t("nav.sectionLabel")}</p>
          {navigation.map((item) => { const Icon = item.icon; return <button key={item.key} className={`rail-item ${item.active ? "is-active" : ""}`} type="button"><Icon size={17} strokeWidth={1.8} /><span>{t(item.key)}</span></button>; })}
        </nav>
        <div className="rail-practice"><div className="practice-orbit" aria-hidden="true"><span>8</span><small>{t("nav.minutesShort")}</small></div><div><p>{t("nav.practiceTitle")}</p><span>{t("nav.practiceCopy")}</span></div></div>
        <button type="button" className="rail-account"><span className="avatar">S</span><span><strong>Sahil</strong><small>{t("app.tagline")}</small></span><MoreHorizontal size={18} /></button>
      </aside>

      <main className="reading-desk">
        <header className="desk-header">
          <div className="crumbs">
            <span className="eyebrow">{t("reader.eyebrow")}</span>
            <span className="crumb-separator">/</span>
            <SurahPicker surahs={surahs} value={surahNumber} onSelect={(surah) => selectSurah(surah)} />
            <label className="quran-picker">
              <span className="sr-only">{t("reader.juzLabel")}</span>
              <select value={currentJuz ?? ""} onChange={(event) => selectJuz(Number(event.target.value))} disabled={!juzs.length}>
                {juzs.length
                  ? juzs.map((juz) => <option key={juz.number} value={juz.number}>{t("reader.juzNumbered", { number: juz.number })}</option>)
                  : <option value="">{t("reader.loadingJuz")}</option>}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          </div>
          <div className="header-tools">
            <label className="quran-picker reciter-picker">
              <Headphones size={15} aria-hidden="true" />
              <span className="sr-only">{t("reader.reciterLabel")}</span>
              <select value={activeReciterId ?? ""} onChange={(event) => setReciterId(Number(event.target.value))} disabled={!reciters.length}>
                {reciters.length
                  ? reciters.map((reciter) => {
                      const label = `${reciter.name}${reciter.style ? ` · ${reciter.style}` : ""}`;
                      return (
                        <option key={reciter.id} value={reciter.id} disabled={!reciter.available}>
                          {reciter.available ? label : t("reader.reciterUnavailable", { reciter: label })}
                        </option>
                      );
                    })
                  : <option value="">{quranIndex.isSuccess ? t("reader.noReciters") : t("reader.loadingReciters")}</option>}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            {/* The language control is a labelled menu rather than an icon:
                a learner has to be able to see that the app speaks their
                language without opening anything first. See
                components/LanguagePicker.tsx. */}
            <LanguagePicker variant="header" />
            {/* Straight from the API's translation list, grouped by language —
                a language Quran.com adds appears here with no code change. */}
            <label className="quran-picker translation-picker">
              <Languages size={15} aria-hidden="true" />
              <span className="sr-only">{t("reader.translationLabel")}</span>
              <select value={activeTranslationId ?? ""} onChange={(event) => setTranslationId(Number(event.target.value))} disabled={!translations.length}>
                {translations.length
                  ? translationGroups.map((group) => (
                      <optgroup key={group.languageName} label={group.languageName}>
                        {group.items.map((item) => <option key={item.id} value={item.id}>{item.authorName}</option>)}
                      </optgroup>
                    ))
                  : <option value="">{t("reader.loadingTranslations")}</option>}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <button type="button" className="icon-button" aria-label={t("reader.searchLabel")}><Search size={18} /></button>
            <button type="button" className="icon-button" aria-label={t("reader.settingsLabel")}><Settings2 size={18} /></button>
          </div>
        </header>
        <section className="chapter-intro" aria-labelledby="chapter-title"><div><p className="eyebrow">{chapterEyebrow}</p><h1 id="chapter-title">{chapterHeading}</h1><p className="intro-copy">{chapterCopy}</p></div><div className="chapter-arabic">{view === "learn" ? <span lang="ar" dir="rtl">{activeLevel.arabic}</span> : <span className="chapter-surah-name"><span lang="ar" dir="rtl">{activeSurah?.nameArabic ?? ""}</span><small>{activeSurah?.nameSimple ?? ""}</small></span>}</div></section>
        <section className="mode-tabs" aria-label={t("mode.label")}>
          {tabs.map((tab) => { const Icon = tab.icon; const active = view === tab.id; return <button type="button" key={tab.id} className={`mode-tab ${active ? "is-active" : ""}`} aria-pressed={active} onClick={() => setView(tab.id)}><span className="tab-icon"><Icon size={17} /></span><span><strong>{t(tab.labelKey)}</strong><small>{t(tab.captionKey)}</small></span></button>; })}
        </section>

        <section className={`manuscript-stage stage-${view}`} aria-live="polite">
          <div className="manuscript-light" aria-hidden="true" /><div className="manuscript-frame" />
          {view === "read" && <div className="reader-layout">
            <div className="manuscript-meta"><span className="meta-surah"><b lang="ar" dir="rtl">{activeSurah?.nameArabic ?? ""}</b> {surahLabel}</span><span>{activeSurah ? `${t("reader.ayahCount", { count: activeSurah.versesCount })} · ${t(activeSurah.revelationPlace === "makkah" ? "reader.makki" : "reader.madani")}` : "—"}</span><span>{currentJuz ? t("reader.juzNumbered", { number: currentJuz }) : "—"}</span></div>
            {contentPending || contentError ? contentFallback : <>
              {activeSurah?.bismillahPre && <div className="basmala" lang="ar" dir="rtl">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>}
              <div className="quran-flow" dir="rtl" lang="ar" aria-label={t("reader.versesLabel", { surah: surahLabel })}>{ayahs.map((verse) => <button key={verse.verseKey} type="button" className={`quran-ayah ${selectedVerse === verse.number ? "is-selected" : ""} ${isPlaying && selectedVerse === verse.number ? "is-playing" : ""}`} onClick={() => selectVerse(verse.number)} aria-pressed={selectedVerse === verse.number}>{verse.arabic} <VerseMedallion number={verse.number} /></button>)}</div>

              {/* Listening runs forward from the selected ayah: Next hands over to
                  the following one, and with continuous listening on, the end of
                  an ayah does the same without a click. */}
              <div className="reader-playback" aria-label={t("playback.label")}>
                <button type="button" className="playback-step" onClick={() => moveVerse(-1)} disabled={!previousVerse} aria-label={t("playback.previous")}><ArrowLeft size={16} /></button>
                <button type="button" className="playback-main" onClick={toggleReaderPlayback} disabled={audioUnavailable}>{isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}{t(isPlaying ? "playback.pause" : "playback.listen")}</button>
                <button type="button" className="playback-step is-next" onClick={listenToNext} disabled={!nextVerse}>{t("playback.next")} <ArrowRight size={16} /></button>
                <span className="playback-place">{t("playback.place", { number: activeVerse?.number ?? "—", total: ayahs.length || "—" })}</span>
                <label className="playback-continuous"><input type="checkbox" checked={continuousListening} onChange={(event) => setContinuousListening(event.target.checked)} /> {t("playback.keepPlaying")}</label>
              </div>
              {/* A failed source used to leave a dead play button. The message
                  names what happened in the learner's language and offers the
                  retry, which reloads the element before trying again. */}
              {audioUnavailable && <p className="playback-warning" role="status"><AlertCircle size={14} /> {audioUnavailableMessage}{audioLoadFailed && <button type="button" className="playback-retry" onClick={retryReciterAudio}><RotateCcw size={13} aria-hidden="true" /> {t("content.retry")}</button>}</p>}
            </>}
            <div className="reader-footer"><span>{t("reader.footerHint")}</span><button type="button" onClick={() => setShowTranslation((current) => !current)}>{t(showTranslation ? "reader.hideMeaning" : "reader.showMeaning")}</button></div>
          </div>}

          {view === "learn" && <div className="learning-layout">
            <div className="learning-topline"><div><span className="eyebrow">{t("learn.paceEyebrow")}</span><h2>{t("learn.paceHeading")}</h2></div><span>{t(activeLevel.cueKey)}</span></div>
            <div className="level-picker" role="tablist" aria-label={t("learn.levelsLabel")}>{learningLevels.map((level) => { const progress = level.id === "qaida" ? qaidaPercent : feedback ? 100 : 0; return <button key={level.id} type="button" role="tab" aria-selected={learningLevel === level.id} className={learningLevel === level.id ? "is-selected" : ""} onClick={() => setLearningLevel(level.id)}><span>{level.order}</span><strong>{t(level.titleKey)}</strong><small>{progress ? t("learn.percentComplete", { percent: progress }) : t(level.cueKey)}</small></button>; })}</div>
            {/* Open by default: while this was collapsed, every letter recording
                in the app sat behind a disclosure a learner had no reason to
                open, which is why the app looked as though it had no sound. */}
            {learningLevel === "qaida" && <details className="letter-reference" open>
              <summary><span>{t("course.letterReference")}</span><small><Volume2 size={12} aria-hidden="true" /> {t("course.letterReferenceHint")}</small></summary>
              <div className="qaida-workspace"><div className="qaida-intro"><div><span className="eyebrow">{t("qaida.eyebrow")}</span><h3>{t("qaida.heading")}</h3><p>{t("qaida.copy")}</p></div><span className="qaida-count">{lettersPractised.length} / {alphabet.length}<small>{t("qaida.practisedCount", { percent: lettersPractisedPercent })}</small></span></div><div className="alphabet-grid" aria-label={t("qaida.alphabetLabel")}>{alphabet.map((item, index) => { const tileSrc = letterAudioPath(item.slug); return <button type="button" key={item.letter} className={`${selectedLetter === index ? "is-selected" : ""} ${lettersPractised.includes(index) ? "is-practised" : ""} ${isSameRecording(letterAudio.playingSrc, tileSrc) ? "is-playing" : ""}`} onClick={() => { setSelectedLetter(index); if (tileSrc) void letterAudio.play(tileSrc); }} aria-label={t("qaida.playLetterLabel", { letter: item.name })}><span lang="ar" dir="rtl">{item.letter}</span><small>{item.name}</small><Volume2 size={11} aria-hidden="true" className="tile-speaker" /></button>; })}</div><div className="letter-lesson"><div className="letter-focus"><span lang="ar" dir="rtl">{activeLetter.letter}</span><div><p>{activeLetter.name}</p><small>{t("qaida.writtenAs", { transliteration: activeLetter.transliteration, sound: activeLetter.sound })}</small></div><button type="button" className={`letter-play ${isSameRecording(letterAudio.playingSrc, soloAudioSrc) ? "is-playing" : ""} ${isSameRecording(letterAudio.loadingSrc, soloAudioSrc) ? "is-loading" : ""} ${isSameRecording(letterAudio.unavailableSrc, soloAudioSrc) ? "is-unavailable" : ""}`} onClick={() => soloAudioSrc && void letterAudio.play(soloAudioSrc)} disabled={!soloAudioSrc} aria-label={t("qaida.playLetterLabel", { letter: activeLetter.name })}><Volume2 size={18} aria-hidden="true" /> {isSameRecording(letterAudio.loadingSrc, soloAudioSrc) ? t("qaida.audioLoading") : isSameRecording(letterAudio.unavailableSrc, soloAudioSrc) ? t("qaida.audioRetry") : t("qaida.listenLetter")}</button></div>

              {/* One recording per harakat. Nothing here is synthesised: if a
                  reciter's file is not present the control says so rather than
                  approximating the sound with an English voice. */}
              <div className="harakat-strip">{HARAKAT.map((harakat) => { const src = letterAudioPath(activeLetter.slug, harakat.id); return <button type="button" key={harakat.id} className={`harakat-play ${isSameRecording(letterAudio.playingSrc, src) ? "is-playing" : ""} ${isSameRecording(letterAudio.loadingSrc, src) ? "is-loading" : ""} ${isSameRecording(letterAudio.unavailableSrc, src) ? "is-unavailable" : ""}`} onClick={() => src && void letterAudio.play(src)} disabled={!src} aria-label={t("qaida.playHarakatLabel", { letter: activeLetter.name, harakat: t(harakatLabelKeys[harakat.id].label) })}><span lang="ar" dir="rtl">{activeLetter.letter}{harakat.mark}</span><small>{t(harakatLabelKeys[harakat.id].label)} · {t(harakatLabelKeys[harakat.id].hint)}</small><Volume2 size={12} aria-hidden="true" className="tile-speaker" /></button>; })}</div>

              {activeLesson && <div className="letter-lesson-text"><p>{activeLesson.articulation}</p>{activeLesson.tip && <small>{activeLesson.tip}</small>}</div>}

              {harakatAudioMissing && <p className="letter-audio-status" role="note"><AlertCircle size={13} /> {t("qaida.audioFormUnavailable")}</p>}

              <p className="letter-audio-status" role="status">{letterAudio.unavailableSrc ? <><AlertCircle size={13} /> {t(usingPlaceholderAudio ? "qaida.audioUnavailablePlaceholder" : "qaida.audioUnavailable")}</> : letterAudio.loadingSrc ? <><Headphones size={13} /> {t("qaida.audioLoading")}</> : letterAudio.playingSrc ? <><Volume2 size={13} /> {t(usingPlaceholderAudio ? "qaida.audioPlayingPlaceholder" : "qaida.audioPlaying")}</> : <><Headphones size={13} /> {t(usingPlaceholderAudio ? "qaida.audioIdlePlaceholder" : "qaida.audioIdle")}</>}</p>

              {usingPlaceholderAudio && ACTIVE_LETTER_AUDIO_SOURCE.attribution && <p className="letter-audio-credit">{t("qaida.audioAttribution", { source: ACTIVE_LETTER_AUDIO_SOURCE.attribution })}</p>}

              <div className="letter-actions"><button type="button" className={`quiet-action ${lettersPractised.includes(selectedLetter) ? "is-complete" : ""}`} onClick={markCurrentLetterPractised}>{lettersPractised.includes(selectedLetter) ? <Check size={16} /> : <Bookmark size={16} />}{t(lettersPractised.includes(selectedLetter) ? "qaida.practised" : "qaida.markPractised")}</button><button type="button" className="quiet-action" onClick={() => setSelectedLetter((current) => Math.min(alphabet.length - 1, current + 1))}>{t("qaida.nextLetter")} <ArrowRight size={16} /></button></div><div className="micro-practice"><div><span className="eyebrow">{t("qaida.quickCheck")}</span><p>{t("qaida.quickCheckPrompt")} <strong lang="ar" dir="rtl">{activeLetter.letter}</strong></p></div><div className="answer-options"><button type="button" className={letterExerciseResult === "correct" ? "is-correct" : ""} onClick={() => setLetterExerciseResult("correct")}>{activeLetter.name}</button><button type="button" className={letterExerciseResult === "retry" ? "is-retry" : ""} onClick={() => setLetterExerciseResult("retry")}>{alphabet[(selectedLetter + 1) % alphabet.length].name}</button><button type="button" className={letterExerciseResult === "retry" ? "is-retry" : ""} onClick={() => setLetterExerciseResult("retry")}>{alphabet[(selectedLetter + 2) % alphabet.length].name}</button></div>{letterExerciseResult && <p className={`exercise-response is-${letterExerciseResult}`}>{t(letterExerciseResult === "correct" ? "qaida.quickCheckCorrect" : "qaida.quickCheckRetry")}</p>}</div><p className="lesson-boundary"><AlertCircle size={14} /> {t("qaida.boundary")}</p></div></div>
            </details>}
            {learningLevel === "qaida" && <QaidaCourse
              progress={qaidaProgress}
              onProgressChange={setQaidaProgress}
              onOpenQuran={(surah, ayah) => { selectSurah(surah, ayah); setView("study"); }}
            />}
            {learningLevel === "tajweed" && <div className="path-workspace tajweed-path"><div className="path-copy"><span className="eyebrow">{t("tajweed.eyebrow")}</span><h3>{t("tajweed.heading")}</h3><p>{t("tajweed.copy")}</p></div><div className="tajweed-principles"><span>{t("tajweed.principleAudio")}</span><span>{t("tajweed.principleReview")}</span><span>{t("tajweed.principleTeacher")}</span></div><button type="button" className="path-cta" onClick={openRecitationPractice}><Mic size={17} /> {t("tajweed.begin")} <ArrowRight size={17} /></button></div>}
          </div>}

          {view === "study" && (!activeVerse ? contentFallback : <div className="study-layout">
            <div className="study-index" aria-hidden="true"><strong>{String(activeVerse.number).padStart(2, "0")}</strong></div>
            <div className="study-card"><img src="/assets/quran-audio-study-abstract.svg" alt="" className="study-visual" /><p className="study-arabic" lang="ar" dir="rtl">{activeVerse.arabic}</p><div className="study-divider" />{activeVerse.transliteration && <p className="transliteration">{activeVerse.transliteration}</p>}{activeVerse.translation && <p className="study-translation">{activeVerse.translation}</p>}<button type="button" className="listen-inline" onClick={() => void playReciter(0.78)} disabled={audioUnavailable}><Volume2 size={17} />{t("study.listenSlowly")}</button></div>
            <div className={`teacher-loop ${tutorView ? "has-tutor" : ""}`} aria-label={t("study.lessonLabel")}>
              {/* The Live Tutor is the lesson. When a session is running it is
                  the dominant surface: the ayah, one sentence from the teacher,
                  and the one thing to do now.

                  The surfaces below it are not deleted — the instruction block,
                  the correction card, the notes and the diagnostics are all
                  still correct, and still there. They are simply no longer in
                  front of the learner saying the same thing in a second voice.
                  What the teacher noticed is behind the panel's own disclosure;
                  the rest renders exactly as before whenever no session is
                  running, which is also what happens if the tutor is
                  unreachable. */}
              {tutorView && (
                <LiveTutorPanel
                  session={tutorView}
                  ayah={{ arabic: activeVerse.arabic, label: `${surahLabel} ${t("now.place", { ayah: activeVerse.number, total: ayahs.length })}` }}
                  onIntent={runTutorIntent}
                  handsFree={handsFreeOn}
                />
              )}

              {/* The microphone, and the two ways to stop it.

                  Rendered only where the tutor is actually running, because
                  hands-free is the tutor listening — without a session there is
                  nothing for it to be hands-free *of*. On a browser that cannot
                  do it the component renders nothing at all and Study keeps the
                  controls below, which is the fallback and is never described
                  as hands-free. */}
              {tutorView && (
                <HandsFreeTutor
                  supported={handsFreeSupported}
                  active={handsFreeOn && continuous.active}
                  state={continuous.state}
                  failure={continuous.failure}
                  line={playback.line}
                  lineSpoken={playback.lineSpoken}
                  level={continuous.level}
                  scope={continuous.scope}
                  options={handsFreeOptions}
                  muted={coachMuted}
                  onMutedChange={setCoachMuted}
                  onStart={() => void startHandsFree()}
                  onPause={() => { continuous.pause(); tutor.sendIntent("pause"); }}
                  onResume={() => { continuous.resume(); tutor.sendIntent("resume"); }}
                  onStop={() => { continuous.stop(); setHandsFreeOn(false); tutor.sendIntent("stop"); }}
                  onOption={runHandsFreeOption}
                />
              )}

              {/* Priority one, when the tutor is not running: what to do now,
                  where you are, and the mic. One instruction and at most one
                  contextual button — the listen and record controls below are
                  the other half of the same block. */}
              {!tutorView && <section className={`teacher-now is-${teacherAction.tone} is-${teacherAction.kind}`} aria-label={t("now.label")}>
                <p className="now-place"><span className="now-surah">{surahLabel}</span><span>{t("now.place", { ayah: activeVerse.number, total: ayahs.length })}</span>{studyTiers.now.showWordPosition && teacherAction.focusWordIndex !== null && <span>{t("now.placeWord", { number: teacherAction.focusWordIndex })}</span>}{reviewDue && teacherAction.kind !== "review-today" && <span className="now-due">{t("now.reviewToday")}</span>}</p>
                <h2 className="now-instruction" aria-live="polite">{t(studyTiers.now.instructionKey, studyTiers.now.instructionParams)}</h2>
                {/* The word itself lives in the lesson below, once and large.
                    Repeating it here gave the learner the same diagnosis twice
                    within one screen, so NOW keeps only the position. */}
                {teacherAction.focusArabic && !correctionLesson && <p className="now-word" lang="ar" dir="rtl">{teacherAction.focusArabic}</p>}
                {studyTiers.now.sequence.length > 1 && <ol className="now-steps" aria-label={t("now.stepsLabel")}>{studyTiers.now.sequence.map((step) => <li key={step}>{t(teachingStepLabels[step as TeachingStep])}</li>)}</ol>}
                <div className="loop-actions">
                  <button type="button" className="loop-listen" onClick={() => void playReciter(1)} disabled={audioUnavailable}>{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}{t(isPlaying ? "study.reciterPlaying" : "study.hearReciter")}</button>
                  <button type="button" className={`loop-record ${isRecording ? "is-recording" : ""}`} onClick={isRecording ? stopRecording : () => void startRecording("ayah")} disabled={isCheckingRecitation}>{isRecording ? <Square size={17} fill="currentColor" /> : <Mic size={18} />}{isRecording ? t("study.stopRecording") : isCheckingRecitation ? t("study.reviewing") : t("study.record")}</button>
                </div>
                {studyTiers.now.cta && <button type="button" className="now-action" onClick={runTeacherAction}>{studyTiers.now.cta.command === "next-ayah" ? <>{t(studyTiers.now.cta.labelKey, studyTiers.now.cta.params)} <ArrowRight size={16} /></> : <><RotateCcw size={16} /> {t(studyTiers.now.cta.labelKey, studyTiers.now.cta.params)}</>}</button>}
                {/* The recorder's own line — "your word-recall review is ready"
                    and friends. While a focused lesson is running, the lesson
                    below is already saying what happened, in the teacher's
                    voice; leaving this here put a second, blunter status beside
                    it, so a learner read "Good — I heard the marked word" and
                    "your review is ready" at once. One teaching state at a
                    time. Nothing about the correction engine changes. */}
                {!correctionLesson && <p className="loop-message" role="status">{recorderMessage ?? t("recorder.intro")}</p>}
                {/* A failed source used to leave a dead play button. The message
                  names what happened in the learner's language and offers the
                  retry, which reloads the element before trying again. */}
              {audioUnavailable && <p className="playback-warning" role="status"><AlertCircle size={14} /> {audioUnavailableMessage}{audioLoadFailed && <button type="button" className="playback-retry" onClick={retryReciterAudio}><RotateCcw size={13} aria-hidden="true" /> {t("content.retry")}</button>}</p>}
              </section>}

              {/* Tier two: how that attempt went — the exact word to fix, or,
                  when the decision named none, what actually happened instead.
                  Arabic first and before any score; an unconfirmed result never
                  borrows the confirmed-mistake styling. The card carries the
                  steps and the microphone so the learner never scrolls back up
                  to find them. */}
              {/* While the tutor is running, this is the same lesson said a
                  second time — the word, the observation, the steps. It is the
                  teaching surface Study uses without a tutor, and it stays
                  exactly as it was for that case. */}
              {!tutorView && <StudyCorrection
                correction={studyTiers.correction}
                outcome={studyTiers.outcome}
                onListen={() => void playReciter(0.78)}
                onRecord={isRecording ? stopRecording : () => void startRecording("ayah")}
                lesson={correctionLesson}
                onRecordWord={() => void startRecording("word")}
                onStop={stopRecording}
                wordAudio={focusWordAudio}
                onHearWord={() => { if (focusWordAudio) { audioRef.current?.pause(); void wordRecording.play(focusWordAudio.url); } }}
                wordAudioState={{
                  loading: wordRecording.loadingSrc === focusWordAudio?.url,
                  playing: wordRecording.playingSrc === focusWordAudio?.url,
                  failed: wordRecording.unavailableSrc === focusWordAudio?.url,
                }}
                onCta={runTeacherAction}
                isRecording={isRecording}
                isReviewing={isCheckingRecitation}
                audioUnavailable={audioUnavailable}
              />}

              {/* The live guide is the mic's own feedback, so it sits with it. */}
              {(isRecording || liveTranscript) && <div className="live-guidance"><div className="live-guidance-top"><span>{t(isRecording ? "live.guideTitle" : "live.heardTitle")}</span><small>{t(liveTranscript ? "live.source" : "live.waiting")}</small></div><div className="live-word-row" lang="ar" dir="rtl">{expectedWords.map((word, index) => <span key={`${word}-${index}`} className={liveMatched.includes(index) ? "is-heard" : index === position.expectedWordIndex - 1 ? "is-expected" : ""}>{word}</span>)}</div>{liveTranscript && <p className="heard-transcript" lang="ar" dir="rtl">{liveTranscript}</p>}</div>}

              {recitationDiagnosticsEnabled && <section className="recitation-diagnostics" aria-label={t("diagnostics.label")}>
                <strong>{t("diagnostics.label")}</strong>
                <dl>
                  <div><dt>{t("diagnostics.transcriptStatus")}</dt><dd>{feedback ? feedback.wordReviewAvailable ? t("diagnostics.available") : t("diagnostics.unavailable") : t("diagnostics.none")}</dd></div>
                  <div><dt>{t("diagnostics.matchCount")}</dt><dd>{feedback ? `${feedback.matchedCount}/${feedback.totalWords}` : t("diagnostics.none")}</dd></div>
                  <div><dt>{t("diagnostics.teacherReason")}</dt><dd>{teacherTrace.kind}:{teacherTrace.reason}</dd></div>
                  <div><dt>{t("diagnostics.focus")}</dt><dd>{teacherTrace.focusWordIndex ?? t("diagnostics.none")} / {teacherTrace.hasFocusArabic ? t("diagnostics.yes") : t("diagnostics.no")}</dd></div>
                  <div><dt>{t("diagnostics.acoustic")}</dt><dd>{feedback?.quranAwareReview.status ?? t("diagnostics.none")}</dd></div>
                </dl>
              </section>}

              {/* A failure the learner has to get past is never collapsed. */}
              {/* The instruction above already offers "Try again", so this
                  states the reason without competing for the same tap. */}
              {studyTiers.alerts.reviewFailed && <div className="review-unavailable" role="alert"><AlertCircle size={16} /><span>{reviewError}</span></div>}
              {studyTiers.alerts.reviewUnavailable && <div className="review-unavailable" role="alert"><AlertCircle size={16} /><span>{feedback?.reviewMessageCode ? t(reviewMessageKeys[feedback.reviewMessageCode]) : t("feedback.reviewUnavailable")}</span></div>}

              {recordingUrl && <audio className="learner-playback" src={recordingUrl} controls />}

              {/* Priority three: everything that explains rather than instructs.
                  Collapsed by default, and never carrying a warning of its own. */}
              <details className="teacher-notes">
                <summary><span>{t("notes.summary")}</span><small>{t("notes.hint")}</small></summary>

                {/* The review below belongs to an earlier tutor turn when the
                    lesson has since moved on: a stale review presented as the
                    current attempt is how the panel and the notes ended up
                    disagreeing. Historical findings are labeled as such. */}
                {tutorView && reviewedAttempt && reviewedAttempt.revision !== null && tutor.turn &&
                  tutor.turn.session.revision > reviewedAttempt.revision && (
                  <p className="notes-block notes-previous-attempt"><small>{t("notes.previousAttempt")}</small></p>
                )}

                {studyTiers.notes.includes("observations") && <div className="notes-block notes-observed">
                  <div><span className="eyebrow">{t("notes.observedLabel")}</span></div>
                  <ul>{teacherAction.secondaryNotes.map((note, index) => <li key={`${note.kind}-${index}`}>{note.kind === "acoustic"
                    ? t("notes.observedAcoustic", { number: note.wordIndex ?? 0 })
                    : note.kind === "recurring"
                      ? t("notes.observedRecurring", { number: note.wordIndex })
                      : note.kind === "extra-words"
                        ? t("notes.observedExtra", { count: note.count })
                        : t(note.status === "missing" ? "notes.observedMissing" : "notes.observedReview", { number: note.wordIndex })}</li>)}</ul>
                  <small><AlertCircle size={13} /> {t("notes.observedBoundary")}</small>
                </div>}

                {/* Suppressed when the engine abstained: one row per expected
                    word under an attempt it declined to judge reads as a list
                    of specific mistakes nobody claimed. */}
                {studyTiers.notes.includes("corrections") && feedback?.recitationScoreScope === "ayah" && feedback.corrections.length > 0 && <div className="notes-block">
                  <div><span className="eyebrow">{t("feedback.available")}</span></div>
                  <div className="correction-list">{feedback.corrections.slice(0, 4).map((item, index) => <div key={`${item.expected}-${index}`} className="correction-row"><span className="correction-index">{item.wordIndex ? t("feedback.wordIndex", { number: item.wordIndex }) : t("feedback.extra")}</span><span className="correction-word" lang="ar" dir="rtl">{item.expected || item.heard}</span><span className={`correction-state is-${item.status}`}>{item.status === "missing" ? t("feedback.missing") : item.status === "review" ? t("feedback.review") : t("feedback.extra")}</span></div>)}</div>
                </div>}
                {studyTiers.notes.includes("corrections") && feedback?.recitationScoreScope === "ayah" && feedback.corrections.length === 0 && <p className="notes-block all-matched"><Check size={16} /> {t("feedback.allMatched")}</p>}

                {studyTiers.notes.includes("score") && feedback?.recitationScoreScope === "ayah" && <div className="notes-block">
                  <div className="feedback-summary"><div><span className="eyebrow">{t(feedback.wordReviewAvailable ? "feedback.available" : "feedback.unavailable")}</span><strong>{feedback.wordReviewAvailable ? `${feedback.matchedCount} / ${feedback.totalWords}` : "—"}</strong><small>{t(feedback.wordReviewAvailable ? "feedback.matched" : "feedback.notRecognised")}</small></div><span className={`feedback-score ${feedback.wordReviewAvailable && feedback.score === 100 ? "is-strong" : ""}`}>{feedback.wordReviewAvailable ? `${feedback.score}%` : "—"}</span></div>
                  <p className="coach-copy">{feedback.encouragement}</p>
                  <p className="next-step"><Volume2 size={16} /><span>{feedback.nextStep}</span></p>
                  <div className="audio-coach"><div><span className="eyebrow">{t("feedback.coachEyebrow")}</span><p>{t("feedback.coachCopy")}</p></div><button type="button" onClick={() => speakGuidance(feedback.spokenGuidanceKey, locale as SupportedLanguageCode)}><Volume2 size={16} /> {t("feedback.playGuidance")}</button></div>
                  <label className="coach-audio-toggle"><input type="checkbox" checked={coachAudioOn} onChange={(event) => setCoachAudioOn(event.target.checked)} /> {t("feedback.readAloudToggle")}</label>
                </div>}

                <div className="notes-block memory-review-panel" aria-label={t("memory.eyebrow")}>
                  <div><span className="eyebrow">{t("memory.eyebrow")}</span><strong>{t(masteryLabels[activeMemory.mastery])}</strong></div>
                  <p>{activeRecommendation?.reason === "repeated_omission"
                    ? t("memory.repeatedOmission", { number: activeRecommendation.focusWordIndexes[0] })
                    : activeRecommendation?.reason === "repeated_substitution"
                      ? t("memory.repeatedSubstitution", { number: activeRecommendation.focusWordIndexes[0] })
                      : reviewDue
                        ? t("memory.reviewToday")
                        : activeMemory.nextReviewAt
                          ? t("memory.nextReview", { date: new Date(activeMemory.nextReviewAt).toLocaleDateString() })
                          : t("memory.none")}</p>
                  <small>{t("memory.streak", { count: activeMemory.consecutiveSuccesses })} · {t("memory.overview", { due: reviewSummary.dueToday.length, weak: reviewSummary.weakAyat.length, strong: reviewSummary.strongOrMasteredCount })}</small>
                </div>

                {follow && <div className="notes-block notes-place">
                  <div><span className="eyebrow">{t("notes.placeLabel")}</span><strong>{t("follow.ayah", { number: follow.currentAyah })}</strong><span className={`follow-state is-${follow.state}`}>{t(followStateLabels[follow.state])}</span></div>
                  <p>{t(followReasonCopy[follow.reason])}</p>
                  <small><AlertCircle size={13} /> {t("follow.boundary")}</small>
                </div>}

                {feedback && feedback.quranAwareReview.status !== "not_configured" && <div className="notes-block acoustic-review" aria-label={t("feedback.acousticLabel")}>
                  <div className="acoustic-review-header"><div><span className="eyebrow">{t("feedback.acousticLabel")}</span><strong>{feedback.quranAwareReview.status === "available" ? t("feedback.acousticAvailable") : feedback.quranAwareReview.status === "abstained" ? t("feedback.acousticAbstained") : t("feedback.acousticUnavailable")}</strong></div>{feedback.quranAwareReview.status === "available" && feedback.quranAwareReview.confidence !== null && <small>{t("feedback.acousticConfidence", { percent: Math.round(feedback.quranAwareReview.confidence * 100) })}</small>}</div>
                  {feedback.quranAwareReview.status === "available" && feedback.quranAwareReview.findings.length > 0 && <div className="acoustic-finding-list">{feedback.quranAwareReview.findings.map((finding, index) => <div className="acoustic-finding" key={`${finding.kind}-${finding.wordIndex ?? "general"}-${index}`}><span>{t(acousticFindingLabels[finding.kind])}</span>{finding.expectedArabic && <small lang="ar" dir="rtl">{finding.expectedArabic}</small>}</div>)}</div>}
                  <small className="acoustic-boundary"><AlertCircle size={13} /> {t("feedback.acousticBoundary")}</small>
                </div>}

                <div className="notes-block coach-context" aria-label={t("coach.contextLabel")}>
                  {/* The plan is chosen by level, not by wording: the review
                      response carries the level's key reference, and what the
                      learner reads comes from their own pack, keyed by that
                      level. No plan prose crosses the wire in any language. */}
                  <div><span className="eyebrow">{t("coach.contextEyebrow")}</span><strong>{t(coachPlanKeys.title)}</strong></div>
                  <p>{t(feedback ? coachPlanKeys.focus : coachPlanKeys.lessonGoal)}</p>
                  <div className="coach-loop" aria-label={t("coach.practiceLoopLabel")}>{coachPlanKeys.practiceLoop.map((step) => <span key={step}>{t(step)}</span>)}</div>
                  <small><AlertCircle size={13} /> {t(coachPlanKeys.boundary)}</small>
                </div>

                <div className="loop-steps" aria-label={t("study.stageLabel", { stage: lessonStage })}><span className={lessonStage === "listen" ? "is-current" : "is-complete"}><b>01</b> {t("study.stageListen")}</span><span className={lessonStage === "repeat" ? "is-current" : lessonStage === "review" ? "is-complete" : ""}><b>02</b> {t("study.stageRepeat")}</span><span className={lessonStage === "review" ? "is-current" : ""}><b>03</b> {t("study.stageReview")}</span></div>
                {feedback && <p className="feedback-note"><AlertCircle size={13} /> {feedback.note}</p>}
              </details>
            </div>
            {/* A dot per ayah reads well for short surahs; al-Baqarah's 286 would
                not, so longer surahs get a counter instead. */}
            <div className="study-pagination"><button type="button" onClick={() => moveVerse(-1)} disabled={!previousVerse}><ArrowLeft size={17} /> {t("study.previous")}</button>{ayahs.length <= 20 ? <div>{ayahs.map((verse) => <button key={verse.verseKey} type="button" className={selectedVerse === verse.number ? "dot is-current" : "dot"} aria-label={t("study.chooseAyah", { number: verse.number })} onClick={() => selectVerse(verse.number)} />)}</div> : <span className="pagination-count">{activeVerse.number} / {ayahs.length}</span>}<button type="button" onClick={() => moveVerse(1)} disabled={!nextVerse}>{t("study.next")} <ArrowRight size={17} /></button></div>
          </div>)}

          {view === "memorise" && (!activeVerse ? contentFallback : <div className="memory-layout"><div className="memory-topline"><span className="eyebrow">{t("memorise.eyebrow")}</span><span>{t("memorise.place", { number: activeVerse.number, total: ayahs.length })}</span></div><div className="memory-review-panel"><div><span className="eyebrow">{t("memory.practiceNext")}</span><strong>{reviewSummary.nextRecommended ? t("memory.nextIs", { surah: reviewSummary.nextRecommended.surah, ayah: reviewSummary.nextRecommended.ayah }) : t("memory.startNew")}</strong></div><small>{t("memory.overview", { due: reviewSummary.dueToday.length, weak: reviewSummary.weakAyat.length, strong: reviewSummary.strongOrMasteredCount })}</small></div><p className="memory-prompt">{t("memorise.prompt")}</p><div className={`memory-verse ${covered ? "is-covered" : ""}`} lang="ar" dir="rtl">{covered ? <span className="covered-copy">{t("memorise.covered")}</span> : activeVerse.arabic}</div><p className="memory-meaning">{showTranslation ? activeVerse.translation ?? "" : t("memorise.meaningHidden")}</p><div className="memory-actions"><button type="button" className="quiet-action" onClick={() => setCovered((current) => !current)}>{covered ? <BookOpen size={17} /> : <Sparkles size={17} />}{t(covered ? "memorise.reveal" : "memorise.cover")}</button><button type="button" className="quiet-action" onClick={() => setShowTranslation((current) => !current)}><RotateCcw size={17} /> {t("memorise.toggleMeaning")}</button><button type="button" className="quiet-action" onClick={() => setView("study")}><Mic size={17} /> {t("memorise.practise")}</button></div><div className="memory-steps">{ayahs.map((verse) => <button type="button" key={verse.verseKey} onClick={() => selectVerse(verse.number)} className={selectedVerse === verse.number ? "step is-active" : "step"} aria-label={t("memorise.practiseAyah", { number: verse.number })}><span>{verse.number}</span></button>)}</div></div>)}
        </section>
        <div className="page-controls"><button type="button" onClick={() => moveVerse(-1)} disabled={!previousVerse}><ArrowLeft size={16} /> {t("reader.previousAyah")}</button><span>{surahLabel} · {activeVerse?.number ?? "—"}/{ayahs.length || "—"}</span><button type="button" onClick={() => moveVerse(1)} disabled={!nextVerse}>{t("reader.nextAyah")} <ArrowRight size={16} /></button></div>
      </main>

      <aside className="study-panel" aria-label={t("panel.label")}>
        <div className="panel-topbar"><p className="eyebrow">{t("panel.keepPlace")}</p><button type="button" className={`save-button ${saved ? "is-saved" : ""}`} onClick={() => setSaved((current) => !current)} aria-pressed={saved}><Bookmark size={16} fill={saved ? "currentColor" : "none"} /> {t(saved ? "panel.saved" : "panel.save")}</button></div>
        {activeVerse && <div className="selected-ayah"><div className="ayah-reference"><span>{surahLabel}</span><VerseMedallion number={activeVerse.number} /></div><p lang="ar" dir="rtl">{activeVerse.arabic}</p>{showTranslation && <>{activeVerse.transliteration && <p className="panel-transliteration">{activeVerse.transliteration}</p>}{activeVerse.translation && <p className="panel-translation">{activeVerse.translation}</p>}</>}</div>}
        <div className="audio-module"><div className="audio-heading"><span className={`audio-pulse ${isPlaying ? "is-playing" : ""}`} /><span>{t(isPlaying ? "panel.audioPlaying" : "panel.listenRepeat")}</span></div><div className="audio-track"><span className={isPlaying ? "track-fill is-moving" : "track-fill"} /></div><div className="audio-times"><span>{activeReciterName}</span><span>{t("panel.ayahNumber", { number: activeVerse?.number ?? "—" })}</span></div><button type="button" className="listen-button" onClick={() => void playReciter(1)} disabled={audioUnavailable}>{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />} {t(isPlaying ? "panel.playingReciter" : "panel.listenSelected")}</button><p className="audio-note"><Headphones size={14} /> {t("panel.audioNote")}</p></div>
        <div className="practice-note"><img src="/assets/quran-study-lantern-illustration.svg" alt="" /><div><span className="eyebrow">{t("panel.sequenceEyebrow")}</span><p>{t("panel.sequenceCopy")}</p></div></div>
        {/* This is the learner's place in the surah — ayah 2 of 7 is 29% — and it
            sat under the heading "This reading" beside a percentage, which reads
            exactly like a mark for the recitation just attempted. It is labelled
            for what it is, shows the ayah count that produced it, and says
            plainly that it is not a score. */}
        <div className="completion-card"><div><span className="eyebrow">{t("panel.placeInSurah")}</span><strong>{activeVerse ? t("now.place", { ayah: activeVerse.number, total: ayahs.length }) : "—"}</strong></div><div className="completion-track" role="presentation"><span style={{ width: `${readingPercent}%` }} /></div><p>{t("panel.placeNote")}</p></div>
      </aside>
      <div className="mobile-dock" aria-label={t("dock.label")}><button type="button" onClick={() => setView("read")} className={view === "read" ? "is-active" : ""}><BookOpen size={18} /><span>{t("dock.read")}</span></button><button type="button" onClick={() => setView("study")} className="dock-listen"><Mic size={19} /><span>{t("dock.practise")}</span></button><button type="button" onClick={() => setView("memorise")} className={view === "memorise" ? "is-active" : ""}><Sparkles size={18} /><span>{t("dock.recall")}</span></button>{/* On a phone the dock is the only chrome always in reach, so the language menu lives here too rather than only in the desk header. */}<LanguagePicker variant="dock" /></div>
    </div>
  );
}
