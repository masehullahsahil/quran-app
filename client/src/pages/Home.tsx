/**
 * Quiet Sanctuary design reminder: Quranic Arabic remains primary, while the
 * teacher loop makes listening, repetition, and careful review immediately usable.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  Headphones,
  Globe,
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
import { markIndexComplete, progressPercent, toggleCompletion, type QaidaStepId } from "@/lib/learningProgress";
import { ARABIC_LETTERS, HARAKAT, letterAudioPath, type Harakat } from "@/lib/arabicLetters";
import { ACTIVE_LETTER_AUDIO_SOURCE } from "@/lib/letterAudioSources";
import { useLetterAudio } from "@/hooks/useLetterAudio";
import { useLocale } from "@/contexts/LocaleContext";
import { SurahPicker } from "@/components/SurahPicker";
import type { StringKey } from "@locales/index";
import type { Ayah, Translation } from "@shared/quran";
import { MAX_AUDIO_BYTES, formatMegabytes, isRecordingTooLarge } from "@shared/recording";
import { getLearningCoachPlan, type LearningLevel } from "@shared/learningPath";

type View = "read" | "learn" | "study" | "memorise";
type LessonStage = "listen" | "repeat" | "review";
type ExerciseResult = "correct" | "retry" | null;

type RecitationFeedback = {
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
  wordReviewAvailable: boolean;
  learningPlan: {
    level: LearningLevel;
    title: string;
    focus: string;
    practiceLoop: readonly string[];
    boundary: string;
  };
  note: string;
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

const qaidaSteps: Array<{ id: QaidaStepId; order: string; titleKey: StringKey; summaryKey: StringKey }> = [
  { id: "vowels", order: "01", titleKey: "qaida.step.vowels", summaryKey: "qaida.step.vowelsSummary" },
  { id: "joining", order: "02", titleKey: "qaida.step.joining", summaryKey: "qaida.step.joiningSummary" },
  { id: "first-ayah", order: "03", titleKey: "qaida.step.firstAyah", summaryKey: "qaida.step.firstAyahSummary" },
];

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

/**
 * Speaks English coaching text — practice cues from the recitation review.
 *
 * Never pass Arabic letters, harakat, or Quranic text to this. An English voice
 * has no phoneme for ح ع ص ض ط ظ ق غ and renders them as unrelated English
 * sounds ("Taa" comes out as "Te AA"). Arabic is played from a reciter's
 * recording (see useLetterAudio) or not at all.
 */
function speakGuidance(text: string) {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
  return true;
}

function storedNumberList(key: string): number[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is number => Number.isInteger(value)) : [];
  } catch {
    return [];
  }
}

function storedStepList(key: string): QaidaStepId[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    const allowed = new Set<QaidaStepId>(["vowels", "joining", "first-ayah"]);
    return Array.isArray(parsed) ? parsed.filter((value): value is QaidaStepId => typeof value === "string" && allowed.has(value as QaidaStepId)) : [];
  } catch {
    return [];
  }
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
  const [recorderMessage, setRecorderMessage] = useState("Listen to the reciter, then record your own repetition.");
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<RecitationFeedback | null>(null);
  const [learningLevel, setLearningLevel] = useState<LearningLevel>("qaida");
  const [selectedLetter, setSelectedLetter] = useState(0);
  const [coachAudioOn, setCoachAudioOn] = useState(true);
  // The storage keys still carry the old level names so a learner who practised
  // under Starter/Reading keeps that progress after the rename.
  const [lettersPractised, setLettersPractised] = useState<number[]>(() => storedNumberList("miqra-starter-practised"));
  const [qaidaStepsComplete, setQaidaStepsComplete] = useState<QaidaStepId[]>(() => storedStepList("miqra-reading-complete"));
  const [letterExerciseResult, setLetterExerciseResult] = useState<ExerciseResult>(null);
  const [vowelExerciseResult, setVowelExerciseResult] = useState<ExerciseResult>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef<string | null>(null);
  // Set when a verse change should start playing on its own — the Next control
  // and the end-of-ayah handover both use it, so continuous listening survives
  // the src swap that a verse change causes.
  const resumeOnVerseChangeRef = useRef(false);

  const { t, locale, setLocale, locales, letterLesson, manifest } = useLocale();
  const letterAudio = useLetterAudio();
  const evaluateRecitation = trpc.recitation.evaluate.useMutation();

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
  const activeCoachPlan = useMemo(() => getLearningCoachPlan(learningLevel), [learningLevel]);
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
  // Qaida now holds both the letters and the joining steps, so its progress bar
  // counts them together rather than tracking two separate levels.
  const qaidaProgress = progressPercent(lettersPractised.length + qaidaStepsComplete.length, alphabet.length + qaidaSteps.length);

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
    setFeedback(null);
    setLiveTranscript("");
    setLiveMatched([]);
    setRecorderMessage(t("recorder.intro"));
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
    window.localStorage.setItem("miqra-reading-complete", JSON.stringify(qaidaStepsComplete));
  }, [qaidaStepsComplete]);

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

  const playReciter = async (rate = 1) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioUnavailable) {
      setRecorderMessage(audioUnavailableMessage);
      return;
    }
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
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) transcript += `${event.results[index][0].transcript} `;
      updateLiveGuide(transcript.trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") setRecorderMessage(t("recorder.liveGuidePaused"));
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch { /* an existing browser recognition session may still be closing */ }
  };

  const reviewRecording = async (blob: Blob) => {
    if (!activeVerse) return;
    // Checked before encoding: base64 inflates the payload by a third, and a
    // serverless host rejects an oversized body before our code can explain
    // why. Failing here means the learner gets a sentence instead of a dead
    // request.
    if (isRecordingTooLarge(blob.size)) {
      setRecorderMessage(t("recorder.tooLarge", {
        size: formatMegabytes(blob.size),
        limit: formatMegabytes(MAX_AUDIO_BYTES),
      }));
      setLessonStage("listen");
      return;
    }
    try {
      setRecorderMessage(t("recorder.reviewing"));
      const audioBase64 = await blobToBase64(blob);
      const result = await evaluateRecitation.mutateAsync({
        expectedArabic: activeVerse.arabic,
        audioBase64,
        mimeType: blob.type === "audio/ogg" ? "audio/ogg" : blob.type === "audio/wav" ? "audio/wav" : blob.type === "audio/mp4" ? "audio/mp4" : "audio/webm",
        surah: surahNumber,
        ayah: activeVerse.number,
        learningLevel,
      });
      setFeedback(result as RecitationFeedback);
      setLessonStage("review");
      setRecorderMessage(t("recorder.reviewReady"));
      if (coachAudioOn) speakGuidance((result as RecitationFeedback).spokenGuidance);
    } catch (error) {
      setRecorderMessage(error instanceof Error ? error.message : t("recorder.reviewFailed"));
    }
  };

  const stopRecording = () => {
    stopRecognition();
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    setIsRecording(false);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setRecorderMessage(t("recorder.noRecorder"));
      return;
    }
    try {
      audioRef.current?.pause();
      setFeedback(null);
      setLiveTranscript("");
      setLiveMatched([]);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
        const nextUrl = URL.createObjectURL(blob);
        recordingUrlRef.current = nextUrl;
        setRecordingUrl(nextUrl);
        void reviewRecording(blob);
      };
      recorder.start();
      setIsRecording(true);
      setLessonStage("repeat");
      setRecorderMessage(t("recorder.listening"));
      beginLiveGuide();
    } catch {
      setRecorderMessage(t("recorder.noMicrophone"));
    }
  };

  const retryLesson = () => {
    setFeedback(null);
    setLiveTranscript("");
    setLiveMatched([]);
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

  const toggleQaidaStep = (step: QaidaStepId) => {
    setQaidaStepsComplete((current) => toggleCompletion(current, step));
  };

  const chapterHeading = view === "learn" ? t("learn.heading") : `${t("reader.surahLabel")} ${surahLabel}`;
  const chapterEyebrow = view === "learn"
    ? t("learn.eyebrow")
    : `${String(surahNumber).padStart(2, "0")} · ${activeSurah?.translatedName ?? t("reader.loading")}`;
  const chapterCopy = t(view === "learn" ? "learn.copy" : "reader.chapterCopy");

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
          <img src="/manus-storage/quran-open-book-arch-logo_db76dbd9.png" alt="" className="brand-mark" />
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
            <label className="quran-picker language-picker">
              <Globe size={15} aria-hidden="true" />
              <span className="sr-only">{t("language.label")}</span>
              <select value={locale} onChange={(event) => setLocale(event.target.value)}>
                {locales.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
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
              {audioUnavailable && <p className="playback-warning" role="status"><AlertCircle size={14} /> {audioUnavailableMessage}</p>}
            </>}
            <div className="reader-footer"><span>{t("reader.footerHint")}</span><button type="button" onClick={() => setShowTranslation((current) => !current)}>{t(showTranslation ? "reader.hideMeaning" : "reader.showMeaning")}</button></div>
          </div>}

          {view === "learn" && <div className="learning-layout">
            <div className="learning-topline"><div><span className="eyebrow">{t("learn.paceEyebrow")}</span><h2>{t("learn.paceHeading")}</h2></div><span>{t(activeLevel.cueKey)}</span></div>
            <div className="level-picker" role="tablist" aria-label={t("learn.levelsLabel")}>{learningLevels.map((level) => { const progress = level.id === "qaida" ? qaidaProgress : feedback ? 100 : 0; return <button key={level.id} type="button" role="tab" aria-selected={learningLevel === level.id} className={learningLevel === level.id ? "is-selected" : ""} onClick={() => setLearningLevel(level.id)}><span>{level.order}</span><strong>{t(level.titleKey)}</strong><small>{progress ? t("learn.percentComplete", { percent: progress }) : t(level.cueKey)}</small></button>; })}</div>
            {learningLevel === "qaida" && <div className="qaida-workspace"><div className="qaida-intro"><div><span className="eyebrow">{t("qaida.eyebrow")}</span><h3>{t("qaida.heading")}</h3><p>{t("qaida.copy")}</p></div><span className="qaida-count">{lettersPractised.length} / {alphabet.length}<small>{t("qaida.practisedCount")}</small></span></div><div className="alphabet-grid" aria-label={t("qaida.alphabetLabel")}>{alphabet.map((item, index) => <button type="button" key={item.letter} className={`${selectedLetter === index ? "is-selected" : ""} ${lettersPractised.includes(index) ? "is-practised" : ""}`} onClick={() => setSelectedLetter(index)}><span lang="ar" dir="rtl">{item.letter}</span><small>{item.name}</small></button>)}</div><div className="letter-lesson"><div className="letter-focus"><span lang="ar" dir="rtl">{activeLetter.letter}</span><div><p>{activeLetter.name}</p><small>{t("qaida.writtenAs", { transliteration: activeLetter.transliteration, sound: activeLetter.sound })}</small></div><button type="button" className={`letter-play ${letterAudio.playingSrc === soloAudioSrc ? "is-playing" : ""} ${letterAudio.unavailableSrc === soloAudioSrc ? "is-unavailable" : ""}`} onClick={() => soloAudioSrc && void letterAudio.play(soloAudioSrc)} disabled={!soloAudioSrc} aria-label={t("qaida.playLetterLabel", { letter: activeLetter.name })}><Volume2 size={16} /> {t("qaida.playLetter")}</button></div>

              {/* One recording per harakat. Nothing here is synthesised: if a
                  reciter's file is not present the control says so rather than
                  approximating the sound with an English voice. */}
              <div className="harakat-strip">{HARAKAT.map((harakat) => { const src = letterAudioPath(activeLetter.slug, harakat.id); return <button type="button" key={harakat.id} className={`harakat-play ${letterAudio.playingSrc === src ? "is-playing" : ""} ${letterAudio.unavailableSrc === src ? "is-unavailable" : ""}`} onClick={() => src && void letterAudio.play(src)} disabled={!src} aria-label={t("qaida.playHarakatLabel", { letter: activeLetter.name, harakat: t(harakatLabelKeys[harakat.id].label) })}><span lang="ar" dir="rtl">{activeLetter.letter}{harakat.mark}</span><small>{t(harakatLabelKeys[harakat.id].label)} · {t(harakatLabelKeys[harakat.id].hint)}</small></button>; })}</div>

              {activeLesson && <div className="letter-lesson-text"><p>{activeLesson.articulation}</p>{activeLesson.tip && <small>{activeLesson.tip}</small>}</div>}

              {harakatAudioMissing && <p className="letter-audio-status" role="note"><AlertCircle size={13} /> {t("qaida.audioFormUnavailable")}</p>}

              <p className="letter-audio-status" role="status">{letterAudio.unavailableSrc ? <><AlertCircle size={13} /> {t(usingPlaceholderAudio ? "qaida.audioUnavailablePlaceholder" : "qaida.audioUnavailable")}</> : letterAudio.playingSrc ? <><Volume2 size={13} /> {t(usingPlaceholderAudio ? "qaida.audioPlayingPlaceholder" : "qaida.audioPlaying")}</> : <><Headphones size={13} /> {t(usingPlaceholderAudio ? "qaida.audioIdlePlaceholder" : "qaida.audioIdle")}</>}</p>

              {usingPlaceholderAudio && ACTIVE_LETTER_AUDIO_SOURCE.attribution && <p className="letter-audio-credit">{t("qaida.audioAttribution", { source: ACTIVE_LETTER_AUDIO_SOURCE.attribution })}</p>}

              <div className="letter-actions"><button type="button" className={`quiet-action ${lettersPractised.includes(selectedLetter) ? "is-complete" : ""}`} onClick={markCurrentLetterPractised}>{lettersPractised.includes(selectedLetter) ? <Check size={16} /> : <Bookmark size={16} />}{t(lettersPractised.includes(selectedLetter) ? "qaida.practised" : "qaida.markPractised")}</button><button type="button" className="quiet-action" onClick={() => setSelectedLetter((current) => Math.min(alphabet.length - 1, current + 1))}>{t("qaida.nextLetter")} <ArrowRight size={16} /></button></div><div className="micro-practice"><div><span className="eyebrow">{t("qaida.quickCheck")}</span><p>{t("qaida.quickCheckPrompt")} <strong lang="ar" dir="rtl">{activeLetter.letter}</strong></p></div><div className="answer-options"><button type="button" className={letterExerciseResult === "correct" ? "is-correct" : ""} onClick={() => setLetterExerciseResult("correct")}>{activeLetter.name}</button><button type="button" className={letterExerciseResult === "retry" ? "is-retry" : ""} onClick={() => setLetterExerciseResult("retry")}>{alphabet[(selectedLetter + 1) % alphabet.length].name}</button><button type="button" className={letterExerciseResult === "retry" ? "is-retry" : ""} onClick={() => setLetterExerciseResult("retry")}>{alphabet[(selectedLetter + 2) % alphabet.length].name}</button></div>{letterExerciseResult && <p className={`exercise-response is-${letterExerciseResult}`}>{t(letterExerciseResult === "correct" ? "qaida.quickCheckCorrect" : "qaida.quickCheckRetry")}</p>}</div><p className="lesson-boundary"><AlertCircle size={14} /> {t("qaida.boundary")}</p></div></div>}
            {learningLevel === "qaida" && <div className="path-workspace"><div className="path-copy"><span className="eyebrow">{t("qaida.pathEyebrow")}</span><h3>{t("qaida.pathHeading")}</h3><p>{t("qaida.pathCopy")}</p></div><span className="path-progress">{t("qaida.stepsProgress", { done: qaidaStepsComplete.length, total: qaidaSteps.length })}</span><div className="path-steps">{qaidaSteps.map((step) => <button type="button" key={step.id} className={qaidaStepsComplete.includes(step.id) ? "is-complete" : ""} aria-pressed={qaidaStepsComplete.includes(step.id)} onClick={() => toggleQaidaStep(step.id)}><span>{qaidaStepsComplete.includes(step.id) ? <Check size={12} /> : step.order}</span><strong>{t(step.titleKey)}</strong><small>{t(step.summaryKey)}</small></button>)}</div><div className="micro-practice vowel-practice"><div><span className="eyebrow">{t("qaida.vowelCheck")}</span><p>{t("qaida.vowelPrompt")} <strong lang="ar" dir="rtl">بِ</strong></p></div><div className="answer-options"><button type="button" className={vowelExerciseResult === "retry" ? "is-retry" : ""} onClick={() => setVowelExerciseResult("retry")}>Ba</button><button type="button" className={vowelExerciseResult === "correct" ? "is-correct" : ""} onClick={() => setVowelExerciseResult("correct")}>Bi</button><button type="button" className={vowelExerciseResult === "retry" ? "is-retry" : ""} onClick={() => setVowelExerciseResult("retry")}>Bu</button></div>{vowelExerciseResult && <p className={`exercise-response is-${vowelExerciseResult}`}>{t(vowelExerciseResult === "correct" ? "qaida.vowelCorrect" : "qaida.vowelRetry")}</p>}</div><button type="button" className="path-cta" onClick={openRecitationPractice}><BookOpen size={17} /> {t("qaida.openFirstAyah")} <ArrowRight size={17} /></button></div>}
            {learningLevel === "tajweed" && <div className="path-workspace tajweed-path"><div className="path-copy"><span className="eyebrow">{t("tajweed.eyebrow")}</span><h3>{t("tajweed.heading")}</h3><p>{t("tajweed.copy")}</p></div><div className="tajweed-principles"><span>{t("tajweed.principleAudio")}</span><span>{t("tajweed.principleReview")}</span><span>{t("tajweed.principleTeacher")}</span></div><button type="button" className="path-cta" onClick={openRecitationPractice}><Mic size={17} /> {t("tajweed.begin")} <ArrowRight size={17} /></button></div>}
          </div>}

          {view === "study" && (!activeVerse ? contentFallback : <div className="study-layout">
            <div className="study-index"><span>{t("study.ayah")}</span><strong>{String(activeVerse.number).padStart(2, "0")}</strong><span>{t("study.ayahOf", { total: String(ayahs.length).padStart(2, "0") })}</span></div>
            <div className="study-card"><img src="/manus-storage/quran-audio-study-abstract_0f1c8a87.png" alt="" className="study-visual" /><p className="study-arabic" lang="ar" dir="rtl">{activeVerse.arabic}</p><div className="study-divider" />{activeVerse.transliteration && <p className="transliteration">{activeVerse.transliteration}</p>}{activeVerse.translation && <p className="study-translation">{activeVerse.translation}</p>}<button type="button" className="listen-inline" onClick={() => void playReciter(0.78)} disabled={audioUnavailable}><Volume2 size={17} />{t("study.listenSlowly")}</button></div>
            <div className="teacher-loop" aria-label={t("study.lessonLabel")}>
              <div className="loop-header"><div><span className="eyebrow">{t("study.eyebrow")}</span><h2>{t("study.heading")}</h2></div><span className="teacher-badge">{t("study.badge")}</span></div>
              <div className="loop-steps" aria-label={t("study.stageLabel", { stage: lessonStage })}><span className={lessonStage === "listen" ? "is-current" : "is-complete"}><b>01</b> {t("study.stageListen")}</span><span className={lessonStage === "repeat" ? "is-current" : lessonStage === "review" ? "is-complete" : ""}><b>02</b> {t("study.stageRepeat")}</span><span className={lessonStage === "review" ? "is-current" : ""}><b>03</b> {t("study.stageReview")}</span></div>
              <div className="loop-actions">
                <button type="button" className="loop-listen" onClick={() => void playReciter(1)} disabled={audioUnavailable}>{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}{t(isPlaying ? "study.reciterPlaying" : "study.hearReciter")}</button>
                <button type="button" className={`loop-record ${isRecording ? "is-recording" : ""}`} onClick={isRecording ? stopRecording : () => void startRecording()} disabled={evaluateRecitation.isPending}>{isRecording ? <Square size={17} fill="currentColor" /> : <Mic size={18} />}{isRecording ? t("study.stopRecording") : evaluateRecitation.isPending ? t("study.reviewing") : t("study.record")}</button>
              </div>
              {audioUnavailable && <p className="playback-warning" role="status"><AlertCircle size={14} /> {audioUnavailableMessage}</p>}
              <p className="loop-message" role="status">{recorderMessage}</p>
              <section className="coach-context" aria-label={t("coach.contextLabel")}>
                <div><span className="eyebrow">{t("coach.contextEyebrow")}</span><strong>{activeCoachPlan.title}</strong></div>
                <p>{activeCoachPlan.lessonGoal}</p>
                <div className="coach-loop" aria-label={t("coach.practiceLoopLabel")}>{activeCoachPlan.practiceLoop.map((step) => <span key={step}>{step}</span>)}</div>
                <small><AlertCircle size={13} /> {activeCoachPlan.boundary}</small>
              </section>
              {(isRecording || liveTranscript) && <div className="live-guidance"><div className="live-guidance-top"><span>{t(isRecording ? "live.guideTitle" : "live.heardTitle")}</span><small>{t(liveTranscript ? "live.source" : "live.waiting")}</small></div><div className="live-word-row" lang="ar" dir="rtl">{expectedWords.map((word, index) => <span key={`${word}-${index}`} className={liveMatched.includes(index) ? "is-heard" : ""}>{word}</span>)}</div>{liveTranscript && <p className="heard-transcript" lang="ar" dir="rtl">{liveTranscript}</p>}</div>}
              {recordingUrl && <audio className="learner-playback" src={recordingUrl} controls />}
              {feedback && <div className="feedback-panel"><section className="coach-context feedback-coach-context" aria-label={t("coach.reviewPlanLabel")}><div><span className="eyebrow">{t("coach.reviewPlanEyebrow")}</span><strong>{feedback.learningPlan.title}</strong></div><p>{feedback.learningPlan.focus}</p><div className="coach-loop">{feedback.learningPlan.practiceLoop.map((step) => <span key={step}>{step}</span>)}</div><small><AlertCircle size={13} /> {feedback.learningPlan.boundary}</small></section><div className="feedback-summary"><div><span className="eyebrow">{t(feedback.wordReviewAvailable ? "feedback.available" : "feedback.unavailable")}</span><strong>{feedback.wordReviewAvailable ? `${feedback.matchedCount} / ${feedback.totalWords}` : "—"}</strong><small>{t(feedback.wordReviewAvailable ? "feedback.matched" : "feedback.notRecognised")}</small></div><span className={`feedback-score ${feedback.wordReviewAvailable && feedback.score === 100 ? "is-strong" : ""}`}>{feedback.wordReviewAvailable ? `${feedback.score}%` : "—"}</span></div><p className="coach-copy">{feedback.encouragement}</p><div className="audio-coach"><div><span className="eyebrow">{t("feedback.coachEyebrow")}</span><p>{t("feedback.coachCopy")}</p></div><button type="button" onClick={() => speakGuidance(feedback.spokenGuidance)}><Volume2 size={16} /> {t("feedback.playGuidance")}</button></div>{!feedback.wordReviewAvailable ? <div className="review-unavailable"><AlertCircle size={16} /><span>{t("feedback.reviewUnavailable")}</span></div> : feedback.corrections.length > 0 ? <div className="correction-list">{feedback.corrections.slice(0, 4).map((item, index) => <div key={`${item.expected}-${index}`} className="correction-row"><span className="correction-index">{item.wordIndex ? t("feedback.wordIndex", { number: item.wordIndex }) : t("feedback.extra")}</span><span className="correction-word" lang="ar" dir="rtl">{item.expected || item.heard}</span><span className={`correction-state is-${item.status}`}>{item.status === "missing" ? t("feedback.missing") : item.status === "review" ? t("feedback.review") : t("feedback.extra")}</span></div>)}</div> : <div className="all-matched"><Check size={16} /> {t("feedback.allMatched")}</div>}<div className="next-step"><Volume2 size={16} /><span>{feedback.nextStep}</span></div><label className="coach-audio-toggle"><input type="checkbox" checked={coachAudioOn} onChange={(event) => setCoachAudioOn(event.target.checked)} /> {t("feedback.readAloudToggle")}</label><p className="feedback-note"><AlertCircle size={13} /> {feedback.note}</p><button type="button" className="retry-button" onClick={retryLesson}><RotateCcw size={16} /> {t("feedback.tryAgain")}</button></div>}
            </div>
            {/* A dot per ayah reads well for short surahs; al-Baqarah's 286 would
                not, so longer surahs get a counter instead. */}
            <div className="study-pagination"><button type="button" onClick={() => moveVerse(-1)} disabled={!previousVerse}><ArrowLeft size={17} /> {t("study.previous")}</button>{ayahs.length <= 20 ? <div>{ayahs.map((verse) => <button key={verse.verseKey} type="button" className={selectedVerse === verse.number ? "dot is-current" : "dot"} aria-label={t("study.chooseAyah", { number: verse.number })} onClick={() => selectVerse(verse.number)} />)}</div> : <span className="pagination-count">{activeVerse.number} / {ayahs.length}</span>}<button type="button" onClick={() => moveVerse(1)} disabled={!nextVerse}>{t("study.next")} <ArrowRight size={17} /></button></div>
          </div>)}

          {view === "memorise" && (!activeVerse ? contentFallback : <div className="memory-layout"><div className="memory-topline"><span className="eyebrow">{t("memorise.eyebrow")}</span><span>{t("memorise.place", { number: activeVerse.number, total: ayahs.length })}</span></div><p className="memory-prompt">{t("memorise.prompt")}</p><div className={`memory-verse ${covered ? "is-covered" : ""}`} lang="ar" dir="rtl">{covered ? <span className="covered-copy">{t("memorise.covered")}</span> : activeVerse.arabic}</div><p className="memory-meaning">{showTranslation ? activeVerse.translation ?? "" : t("memorise.meaningHidden")}</p><div className="memory-actions"><button type="button" className="quiet-action" onClick={() => setCovered((current) => !current)}>{covered ? <BookOpen size={17} /> : <Sparkles size={17} />}{t(covered ? "memorise.reveal" : "memorise.cover")}</button><button type="button" className="quiet-action" onClick={() => setShowTranslation((current) => !current)}><RotateCcw size={17} /> {t("memorise.toggleMeaning")}</button><button type="button" className="quiet-action" onClick={() => setView("study")}><Mic size={17} /> {t("memorise.practise")}</button></div><div className="memory-steps">{ayahs.map((verse) => <button type="button" key={verse.verseKey} onClick={() => selectVerse(verse.number)} className={selectedVerse === verse.number ? "step is-active" : "step"} aria-label={t("memorise.practiseAyah", { number: verse.number })}><span>{verse.number}</span></button>)}</div></div>)}
        </section>
        <div className="page-controls"><button type="button" onClick={() => moveVerse(-1)} disabled={!previousVerse}><ArrowLeft size={16} /> {t("reader.previousAyah")}</button><span>{surahLabel} · {activeVerse?.number ?? "—"}/{ayahs.length || "—"}</span><button type="button" onClick={() => moveVerse(1)} disabled={!nextVerse}>{t("reader.nextAyah")} <ArrowRight size={16} /></button></div>
      </main>

      <aside className="study-panel" aria-label={t("panel.label")}>
        <div className="panel-topbar"><p className="eyebrow">{t("panel.keepPlace")}</p><button type="button" className={`save-button ${saved ? "is-saved" : ""}`} onClick={() => setSaved((current) => !current)} aria-pressed={saved}><Bookmark size={16} fill={saved ? "currentColor" : "none"} /> {t(saved ? "panel.saved" : "panel.save")}</button></div>
        {activeVerse && <div className="selected-ayah"><div className="ayah-reference"><span>{surahLabel}</span><VerseMedallion number={activeVerse.number} /></div><p lang="ar" dir="rtl">{activeVerse.arabic}</p>{showTranslation && <>{activeVerse.transliteration && <p className="panel-transliteration">{activeVerse.transliteration}</p>}{activeVerse.translation && <p className="panel-translation">{activeVerse.translation}</p>}</>}</div>}
        <div className="audio-module"><div className="audio-heading"><span className={`audio-pulse ${isPlaying ? "is-playing" : ""}`} /><span>{t(isPlaying ? "panel.audioPlaying" : "panel.listenRepeat")}</span></div><div className="audio-track"><span className={isPlaying ? "track-fill is-moving" : "track-fill"} /></div><div className="audio-times"><span>{activeReciterName}</span><span>{t("panel.ayahNumber", { number: activeVerse?.number ?? "—" })}</span></div><button type="button" className="listen-button" onClick={() => void playReciter(1)} disabled={audioUnavailable}>{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />} {t(isPlaying ? "panel.playingReciter" : "panel.listenSelected")}</button><p className="audio-note"><Headphones size={14} /> {t("panel.audioNote")}</p></div>
        <div className="practice-note"><img src="/manus-storage/quran-study-lantern-illustration_3d7eaf67.png" alt="" /><div><span className="eyebrow">{t("panel.sequenceEyebrow")}</span><p>{t("panel.sequenceCopy")}</p></div></div>
        <div className="completion-card"><div><span className="eyebrow">{t("panel.thisReading")}</span><strong>{readingPercent}%</strong></div><div className="completion-track"><span style={{ width: `${readingPercent}%` }} /></div><p>{t("panel.progressNote")}</p></div>
      </aside>
      <div className="mobile-dock" aria-label={t("dock.label")}><button type="button" onClick={() => setView("read")} className={view === "read" ? "is-active" : ""}><BookOpen size={18} /><span>{t("dock.read")}</span></button><button type="button" onClick={() => setView("study")} className="dock-listen"><Mic size={19} /><span>{t("dock.practise")}</span></button><button type="button" onClick={() => setView("memorise")} className={view === "memorise" ? "is-active" : ""}><Sparkles size={18} /><span>{t("dock.recall")}</span></button></div>
    </div>
  );
}
