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
import { markIndexComplete, progressPercent, toggleCompletion, type ReadingStepId } from "@/lib/learningProgress";
import { ARABIC_LETTERS, HARAKAT, letterAudioPath } from "@/lib/arabicLetters";
import { useLetterAudio } from "@/hooks/useLetterAudio";
import type { Ayah } from "@shared/quran";

type View = "read" | "learn" | "study" | "memorise";
type LessonStage = "listen" | "repeat" | "review";
type LearningLevel = "starter" | "reading" | "advanced";
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

const navigation = [
  { label: "Today", icon: HomeIcon, active: true },
  { label: "My library", icon: Library },
  { label: "Bookmarks", icon: Bookmark },
];

const tabs: { id: View; label: string; caption: string; icon: typeof BookOpen }[] = [
  { id: "read", label: "Read", caption: "Follow the page", icon: BookOpen },
  { id: "learn", label: "Learn", caption: "Letters to recitation", icon: Languages },
  { id: "study", label: "Study", caption: "Learn with a teacher loop", icon: ListMusic },
  { id: "memorise", label: "Memorise", caption: "Cover, recall, review", icon: Sparkles },
];

const learningLevels: Array<{ id: LearningLevel; order: string; title: string; arabic: string; summary: string; cue: string }> = [
  { id: "starter", order: "01", title: "Starter", arabic: "الحروف", summary: "Begin with Arabic letters, short vowels, and joining forms.", cue: "Letters & sounds" },
  { id: "reading", order: "02", title: "Reading", arabic: "القراءة", summary: "Build from familiar words into steady Quran reading.", cue: "Words & flow" },
  { id: "advanced", order: "03", title: "Advanced", arabic: "التلاوة", summary: "Practise listening, recall, and guided recitation with care.", cue: "Recitation & hifz" },
];

const alphabet = ARABIC_LETTERS;

const readingSteps: Array<{ id: ReadingStepId; order: string; title: string; summary: string }> = [
  { id: "vowels", order: "01", title: "Short vowels", summary: "Recognise fatha, kasra, and damma with familiar letters." },
  { id: "joining", order: "02", title: "Joining letters", summary: "Notice how a letter changes at the start, middle, and end of a word." },
  { id: "first-ayah", order: "03", title: "First ayah reading", summary: "Open Al-Fātiḥah with transliteration and a slower reciter pace." },
];

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

/** Quran.com serves ayah audio per reciter, so a surah with no recording is still readable. */
const MISSING_AUDIO_MESSAGE = "This reciter has no recording for this ayah. Try another reciter.";

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

function storedStepList(key: string): ReadingStepId[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    const allowed = new Set<ReadingStepId>(["vowels", "joining", "first-ayah"]);
    return Array.isArray(parsed) ? parsed.filter((value): value is ReadingStepId => typeof value === "string" && allowed.has(value as ReadingStepId)) : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const [view, setView] = useState<View>("read");
  const [surahNumber, setSurahNumber] = useState(1);
  const [reciterId, setReciterId] = useState<number | null>(null);
  const [selectedVerse, setSelectedVerse] = useState(1);
  const [continuousListening, setContinuousListening] = useState(true);
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
  const [learningLevel, setLearningLevel] = useState<LearningLevel>("starter");
  const [selectedLetter, setSelectedLetter] = useState(0);
  const [coachAudioOn, setCoachAudioOn] = useState(true);
  const [starterPractised, setStarterPractised] = useState<number[]>(() => storedNumberList("miqra-starter-practised"));
  const [readingComplete, setReadingComplete] = useState<ReadingStepId[]>(() => storedStepList("miqra-reading-complete"));
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

  const letterAudio = useLetterAudio();
  const evaluateRecitation = trpc.recitation.evaluate.useMutation();

  // The Quran's text does not change, so both queries are cached indefinitely
  // for the session and the server keeps its own TTL cache in front of
  // Quran.com. Paging back to a surah you have already opened costs nothing.
  const quranIndex = trpc.quran.index.useQuery(undefined, { staleTime: Infinity, gcTime: Infinity });
  const activeReciterId = reciterId ?? quranIndex.data?.reciters[0]?.id ?? null;
  const surahQuery = trpc.quran.surah.useQuery(
    { surah: surahNumber, ...(activeReciterId === null ? {} : { reciterId: activeReciterId }) },
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
  const surahLabel = activeSurah?.nameSimple ?? "Loading";
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
  const activeLetter = alphabet[selectedLetter] ?? alphabet[0];
  const soloAudioSrc = letterAudioPath(activeLetter.slug);
  const starterProgress = progressPercent(starterPractised.length, alphabet.length);
  const readingProgress = progressPercent(readingComplete.length, readingSteps.length);

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
    setRecorderMessage("Listen to the reciter, then record your own repetition.");
  }, [selectedVerse, surahNumber]);

  // A surah change carries the selection with it (juz navigation lands mid-surah,
  // for instance). If the landing ayah is not in the surah that loaded, fall back
  // to its first ayah rather than rendering an empty reader.
  useEffect(() => {
    if (!ayahs.length) return;
    if (!ayahs.some((verse) => verse.number === selectedVerse)) setSelectedVerse(ayahs[0].number);
  }, [ayahs, selectedVerse]);

  useEffect(() => {
    window.localStorage.setItem("miqra-starter-practised", JSON.stringify(starterPractised));
  }, [starterPractised]);

  useEffect(() => {
    window.localStorage.setItem("miqra-reading-complete", JSON.stringify(readingComplete));
  }, [readingComplete]);

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
    if (!activeVerse?.audioUrl) {
      setRecorderMessage(MISSING_AUDIO_MESSAGE);
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
      setRecorderMessage(rate < 1 ? "Listen slowly. Notice each word, then repeat it back." : "Listen once through. When you are ready, it is your turn.");
    } catch {
      setRecorderMessage("Audio could not start. Check your device volume, then try again.");
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
      setRecorderMessage("Recording is available. Live word guidance works in browsers that support Arabic speech recognition; your recorded attempt will still be reviewed after you stop.");
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
      if (event.error !== "aborted" && event.error !== "no-speech") setRecorderMessage("Live guidance paused, but the recording will still receive a word-recall review when you stop.");
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch { /* an existing browser recognition session may still be closing */ }
  };

  const reviewRecording = async (blob: Blob) => {
    if (!activeVerse) return;
    try {
      setRecorderMessage("Reviewing the words you recited…");
      const audioBase64 = await blobToBase64(blob);
      const result = await evaluateRecitation.mutateAsync({
        expectedArabic: activeVerse.arabic,
        audioBase64,
        mimeType: blob.type === "audio/ogg" ? "audio/ogg" : blob.type === "audio/wav" ? "audio/wav" : blob.type === "audio/mp4" ? "audio/mp4" : "audio/webm",
        surah: surahNumber,
        ayah: activeVerse.number,
      });
      setFeedback(result as RecitationFeedback);
      setLessonStage("review");
      setRecorderMessage("Your word-recall review is ready. Replay the reciter, then retry the marked place.");
      if (coachAudioOn) speakGuidance((result as RecitationFeedback).spokenGuidance);
    } catch (error) {
      setRecorderMessage(error instanceof Error ? error.message : "The recording could not be reviewed. Please try a shorter clip.");
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
      setRecorderMessage("This browser cannot record audio. Please use a current browser and allow microphone access.");
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
      setRecorderMessage("Listening now. Recite the ayah at a calm pace, then press Stop & review.");
      beginLiveGuide();
    } catch {
      setRecorderMessage("Microphone access was not granted. Allow it in your browser settings, then try again.");
    }
  };

  const retryLesson = () => {
    setFeedback(null);
    setLiveTranscript("");
    setLiveMatched([]);
    setLessonStage("listen");
    setRecorderMessage("Start by listening once more, then repeat the ayah in your own voice.");
    void playReciter(0.8);
  };

  const openRecitationPractice = () => {
    selectSurah(1);
    setView("study");
  };

  const markCurrentLetterPractised = () => {
    setStarterPractised((current) => markIndexComplete(current, selectedLetter));
  };

  const toggleReadingStep = (step: ReadingStepId) => {
    setReadingComplete((current) => toggleCompletion(current, step));
  };

  const chapterHeading = view === "learn" ? "Your Quran learning path" : `Surah ${surahLabel}`;
  const chapterEyebrow = view === "learn"
    ? "Learn at your level"
    : `${String(surahNumber).padStart(2, "0")} · ${activeSurah?.translatedName ?? "Loading"}`;
  const chapterCopy = view === "learn"
    ? "Start from the alphabet, develop reading confidence, then move into recitation and memorisation practice."
    : "Read the ayah, hear it from a reciter, repeat it yourself, then return gently to the place that needs practice.";

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
      <button type="button" onClick={retryContent}><RotateCcw size={15} /> Try again</button>
    </div>
  ) : (
    <div className="content-state" role="status">
      <span className="content-spinner" aria-hidden="true" />
      <p>Loading the Quran text and recitation…</p>
    </div>
  );

  return (
    <div className="sanctuary-shell">
      <audio ref={audioRef} src={activeVerse?.audioUrl ?? undefined} preload="auto" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={handleAudioEnded} />
      <aside className="app-rail" aria-label="Primary navigation">
        <div className="rail-brand">
          <img src="/manus-storage/quran-open-book-arch-logo_db76dbd9.png" alt="" className="brand-mark" />
          <div><p className="brand-name">Miqra</p><p className="brand-arabic" lang="ar" dir="rtl">مِقْرَأ</p></div>
        </div>
        <nav className="rail-nav">
          <p className="rail-label">Your place</p>
          {navigation.map((item) => { const Icon = item.icon; return <button key={item.label} className={`rail-item ${item.active ? "is-active" : ""}`} type="button"><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span></button>; })}
        </nav>
        <div className="rail-practice"><div className="practice-orbit" aria-hidden="true"><span>8</span><small>min</small></div><div><p>Today’s practice</p><span>Listen, repeat, return.</span></div></div>
        <button type="button" className="rail-account"><span className="avatar">S</span><span><strong>Sahil</strong><small>Reading plan</small></span><MoreHorizontal size={18} /></button>
      </aside>

      <main className="reading-desk">
        <header className="desk-header">
          <div className="crumbs">
            <span className="eyebrow">Quran</span>
            <span className="crumb-separator">/</span>
            <label className="quran-picker">
              <span className="sr-only">Surah</span>
              <select value={surahNumber} onChange={(event) => selectSurah(Number(event.target.value))} disabled={!surahs.length}>
                {surahs.length
                  ? surahs.map((surah) => <option key={surah.number} value={surah.number}>{surah.number}. {surah.nameSimple} · {surah.translatedName}</option>)
                  : <option value={surahNumber}>Loading surahs…</option>}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <label className="quran-picker">
              <span className="sr-only">Juz</span>
              <select value={currentJuz ?? ""} onChange={(event) => selectJuz(Number(event.target.value))} disabled={!juzs.length}>
                {juzs.length
                  ? juzs.map((juz) => <option key={juz.number} value={juz.number}>Juz’ {juz.number}</option>)
                  : <option value="">Loading juz…</option>}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          </div>
          <div className="header-tools">
            <label className="quran-picker reciter-picker">
              <Headphones size={15} aria-hidden="true" />
              <span className="sr-only">Reciter</span>
              <select value={activeReciterId ?? ""} onChange={(event) => setReciterId(Number(event.target.value))} disabled={!reciters.length}>
                {reciters.length
                  ? reciters.map((reciter) => <option key={reciter.id} value={reciter.id}>{reciter.name}{reciter.style ? ` · ${reciter.style}` : ""}</option>)
                  : <option value="">Loading reciters…</option>}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <button type="button" className="icon-button" aria-label="Search Quran"><Search size={18} /></button>
            <button type="button" className="icon-button" aria-label="Reading settings"><Settings2 size={18} /></button>
          </div>
        </header>
        <section className="chapter-intro" aria-labelledby="chapter-title"><div><p className="eyebrow">{chapterEyebrow}</p><h1 id="chapter-title">{chapterHeading}</h1><p className="intro-copy">{chapterCopy}</p></div><div className="chapter-arabic" lang="ar" dir="rtl">{view === "learn" ? activeLevel.arabic : "سُورَةُ ٱلْفَاتِحَةِ"}</div></section>
        <section className="mode-tabs" aria-label="Reading mode">
          {tabs.map((tab) => { const Icon = tab.icon; const active = view === tab.id; return <button type="button" key={tab.id} className={`mode-tab ${active ? "is-active" : ""}`} aria-pressed={active} onClick={() => setView(tab.id)}><span className="tab-icon"><Icon size={17} /></span><span><strong>{tab.label}</strong><small>{tab.caption}</small></span></button>; })}
        </section>

        <section className={`manuscript-stage stage-${view}`} aria-live="polite">
          <div className="manuscript-light" aria-hidden="true" /><div className="manuscript-frame" />
          {view === "read" && <div className="reader-layout">
            <div className="manuscript-meta"><span>{surahLabel}</span><span>{activeSurah ? `${activeSurah.versesCount} ayahs · ${activeSurah.revelationPlace === "makkah" ? "Makki" : "Madani"}` : "—"}</span><span>{currentJuz ? `Juz’ ${currentJuz}` : "—"}</span></div>
            {contentPending || contentError ? contentFallback : <>
              {activeSurah?.bismillahPre && <div className="basmala" lang="ar" dir="rtl">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>}
              <div className="quran-flow" dir="rtl" lang="ar" aria-label={`Surah ${surahLabel} verses`}>{ayahs.map((verse) => <button key={verse.verseKey} type="button" className={`quran-ayah ${selectedVerse === verse.number ? "is-selected" : ""} ${isPlaying && selectedVerse === verse.number ? "is-playing" : ""}`} onClick={() => selectVerse(verse.number)} aria-pressed={selectedVerse === verse.number}>{verse.arabic} <VerseMedallion number={verse.number} /></button>)}</div>

              {/* Listening runs forward from the selected ayah: Next hands over to
                  the following one, and with continuous listening on, the end of
                  an ayah does the same without a click. */}
              <div className="reader-playback" aria-label="Ayah playback">
                <button type="button" className="playback-step" onClick={() => moveVerse(-1)} disabled={!previousVerse} aria-label="Previous ayah"><ArrowLeft size={16} /></button>
                <button type="button" className="playback-main" onClick={toggleReaderPlayback} disabled={!activeVerse?.audioUrl}>{isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}{isPlaying ? "Pause" : "Listen"}</button>
                <button type="button" className="playback-step is-next" onClick={listenToNext} disabled={!nextVerse}>Next <ArrowRight size={16} /></button>
                <span className="playback-place">Ayah {activeVerse?.number ?? "—"} of {ayahs.length || "—"}</span>
                <label className="playback-continuous"><input type="checkbox" checked={continuousListening} onChange={(event) => setContinuousListening(event.target.checked)} /> Keep playing</label>
              </div>
              {!activeVerse?.audioUrl && <p className="playback-warning"><AlertCircle size={14} /> {MISSING_AUDIO_MESSAGE}</p>}
            </>}
            <div className="reader-footer"><span>Tap an ayah, then move to Study to hear and repeat it.</span><button type="button" onClick={() => setShowTranslation((current) => !current)}>{showTranslation ? "Hide meaning" : "Show meaning"}</button></div>
          </div>}

          {view === "learn" && <div className="learning-layout">
            <div className="learning-topline"><div><span className="eyebrow">Choose your pace</span><h2>From first letters to confident recitation.</h2></div><span>{activeLevel.cue}</span></div>
            <div className="level-picker" role="tablist" aria-label="Learning levels">{learningLevels.map((level) => { const progress = level.id === "starter" ? starterProgress : level.id === "reading" ? readingProgress : feedback ? 100 : 0; return <button key={level.id} type="button" role="tab" aria-selected={learningLevel === level.id} className={learningLevel === level.id ? "is-selected" : ""} onClick={() => setLearningLevel(level.id)}><span>{level.order}</span><strong>{level.title}</strong><small>{progress ? `${progress}% complete` : level.cue}</small></button>; })}</div>
            {learningLevel === "starter" && <div className="starter-workspace"><div className="starter-intro"><div><span className="eyebrow">Starter · lesson 1</span><h3>Letters before words.</h3><p>Learn one letter at a time, hear it from a qualified reciter, then practise the sound with a teacher.</p></div><span className="starter-count">{starterPractised.length} / {alphabet.length}<small>practised</small></span></div><div className="alphabet-grid" aria-label="Arabic alphabet">{alphabet.map((item, index) => <button type="button" key={item.letter} className={`${selectedLetter === index ? "is-selected" : ""} ${starterPractised.includes(index) ? "is-practised" : ""}`} onClick={() => setSelectedLetter(index)}><span lang="ar" dir="rtl">{item.letter}</span><small>{item.name}</small></button>)}</div><div className="letter-lesson"><div className="letter-focus"><span lang="ar" dir="rtl">{activeLetter.letter}</span><div><p>{activeLetter.name}</p><small>Written as {activeLetter.transliteration} · {activeLetter.sound}</small></div><button type="button" className={`letter-play ${letterAudio.playingSrc === soloAudioSrc ? "is-playing" : ""} ${letterAudio.unavailableSrc === soloAudioSrc ? "is-unavailable" : ""}`} onClick={() => void letterAudio.play(soloAudioSrc)} aria-label={`Play the recitation of ${activeLetter.name} on its own`}><Volume2 size={16} /> Letter</button></div>

              {/* One recording per harakat. Nothing here is synthesised: if a
                  reciter's file is not present the control says so rather than
                  approximating the sound with an English voice. */}
              <div className="harakat-strip">{HARAKAT.map((harakat) => { const src = letterAudioPath(activeLetter.slug, harakat.id); return <button type="button" key={harakat.id} className={`harakat-play ${letterAudio.playingSrc === src ? "is-playing" : ""} ${letterAudio.unavailableSrc === src ? "is-unavailable" : ""}`} onClick={() => void letterAudio.play(src)} aria-label={`Play ${activeLetter.name} with ${harakat.label}`}><span lang="ar" dir="rtl">{activeLetter.letter}{harakat.mark}</span><small>{harakat.label} · {harakat.hint}</small></button>; })}</div>

              <p className="letter-audio-status" role="status">{letterAudio.unavailableSrc ? <><AlertCircle size={13} /> This recording has not been added yet. Recitation audio is recorded by a qualified reciter — the app will not read Arabic with a synthetic English voice.</> : letterAudio.playingSrc ? <><Volume2 size={13} /> Playing the reciter’s recording.</> : <><Headphones size={13} /> Choose the letter alone or with a harakat to hear the reciter.</>}</p>

              <div className="letter-actions"><button type="button" className={`quiet-action ${starterPractised.includes(selectedLetter) ? "is-complete" : ""}`} onClick={markCurrentLetterPractised}>{starterPractised.includes(selectedLetter) ? <Check size={16} /> : <Bookmark size={16} />}{starterPractised.includes(selectedLetter) ? "Practised" : "Mark practised"}</button><button type="button" className="quiet-action" onClick={() => setSelectedLetter((current) => Math.min(alphabet.length - 1, current + 1))}>Next letter <ArrowRight size={16} /></button></div><div className="micro-practice"><div><span className="eyebrow">Quick check</span><p>Which letter is <strong lang="ar" dir="rtl">{activeLetter.letter}</strong>?</p></div><div className="answer-options"><button type="button" className={letterExerciseResult === "correct" ? "is-correct" : ""} onClick={() => setLetterExerciseResult("correct")}>{activeLetter.name}</button><button type="button" className={letterExerciseResult === "retry" ? "is-retry" : ""} onClick={() => setLetterExerciseResult("retry")}>{alphabet[(selectedLetter + 1) % alphabet.length].name}</button><button type="button" className={letterExerciseResult === "retry" ? "is-retry" : ""} onClick={() => setLetterExerciseResult("retry")}>{alphabet[(selectedLetter + 2) % alphabet.length].name}</button></div>{letterExerciseResult && <p className={`exercise-response is-${letterExerciseResult}`}>{letterExerciseResult === "correct" ? "Correct. You can mark this letter as practised when you have said it with your teacher." : "Not yet. Look at the letter shape, then play the reciter’s recording and try again."}</p>}</div><p className="lesson-boundary"><AlertCircle size={14} /> Single letter sounds are not auto-scored. AI can help you structure practice, but a qualified teacher should confirm articulation and makhraj.</p></div></div>}
            {learningLevel === "reading" && <div className="path-workspace"><div className="path-copy"><span className="eyebrow">Reading path</span><h3>Build words, then read in flow.</h3><p>Move through vowels, joining forms, and short Quranic words before reading complete ayahs.</p></div><span className="path-progress">{readingComplete.length} / {readingSteps.length} steps</span><div className="path-steps">{readingSteps.map((step) => <button type="button" key={step.id} className={readingComplete.includes(step.id) ? "is-complete" : ""} aria-pressed={readingComplete.includes(step.id)} onClick={() => toggleReadingStep(step.id)}><span>{readingComplete.includes(step.id) ? <Check size={12} /> : step.order}</span><strong>{step.title}</strong><small>{step.summary}</small></button>)}</div><div className="micro-practice vowel-practice"><div><span className="eyebrow">Short vowel check</span><p>How do you read <strong lang="ar" dir="rtl">بِ</strong>?</p></div><div className="answer-options"><button type="button" className={vowelExerciseResult === "retry" ? "is-retry" : ""} onClick={() => setVowelExerciseResult("retry")}>Ba</button><button type="button" className={vowelExerciseResult === "correct" ? "is-correct" : ""} onClick={() => setVowelExerciseResult("correct")}>Bi</button><button type="button" className={vowelExerciseResult === "retry" ? "is-retry" : ""} onClick={() => setVowelExerciseResult("retry")}>Bu</button></div>{vowelExerciseResult && <p className={`exercise-response is-${vowelExerciseResult}`}>{vowelExerciseResult === "correct" ? "Correct. The kasra below the letter gives the short i sound: bi." : "Look below the letter. A kasra gives the short i sound. Try bi."}</p>}</div><button type="button" className="path-cta" onClick={openRecitationPractice}><BookOpen size={17} /> Open first ayah practice <ArrowRight size={17} /></button></div>}
            {learningLevel === "advanced" && <div className="path-workspace advanced-path"><div className="path-copy"><span className="eyebrow">Advanced path</span><h3>Recitation and hifz, one deliberate return at a time.</h3><p>Listen to a qualified reciter, repeat, review the words your recording captured, and return to your teacher for tajwid correction.</p></div><div className="advanced-principles"><span>Real reciter audio</span><span>AI word-recall review</span><span>Teacher-confirmed tajwid</span></div><button type="button" className="path-cta" onClick={openRecitationPractice}><Mic size={17} /> Begin guided recitation <ArrowRight size={17} /></button></div>}
          </div>}

          {view === "study" && (!activeVerse ? contentFallback : <div className="study-layout">
            <div className="study-index"><span>Ayah</span><strong>{String(activeVerse.number).padStart(2, "0")}</strong><span>of {String(ayahs.length).padStart(2, "0")}</span></div>
            <div className="study-card"><img src="/manus-storage/quran-audio-study-abstract_0f1c8a87.png" alt="" className="study-visual" /><p className="study-arabic" lang="ar" dir="rtl">{activeVerse.arabic}</p><div className="study-divider" />{activeVerse.transliteration && <p className="transliteration">{activeVerse.transliteration}</p>}{activeVerse.translation && <p className="study-translation">{activeVerse.translation}</p>}<button type="button" className="listen-inline" onClick={() => void playReciter(0.78)} disabled={!activeVerse.audioUrl}><Volume2 size={17} />Listen slowly</button></div>
            <div className="teacher-loop" aria-label="Recitation lesson">
              <div className="loop-header"><div><span className="eyebrow">Guided recitation</span><h2>Listen. Repeat. Review.</h2></div><span className="teacher-badge">Teacher loop</span></div>
              <div className="loop-steps" aria-label={`Current stage: ${lessonStage}`}><span className={lessonStage === "listen" ? "is-current" : "is-complete"}><b>01</b> Listen</span><span className={lessonStage === "repeat" ? "is-current" : lessonStage === "review" ? "is-complete" : ""}><b>02</b> Your turn</span><span className={lessonStage === "review" ? "is-current" : ""}><b>03</b> Review</span></div>
              <div className="loop-actions">
                <button type="button" className="loop-listen" onClick={() => void playReciter(1)}>{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}{isPlaying ? "Reciter is playing" : "Hear the reciter"}</button>
                <button type="button" className={`loop-record ${isRecording ? "is-recording" : ""}`} onClick={isRecording ? stopRecording : () => void startRecording()} disabled={evaluateRecitation.isPending}>{isRecording ? <Square size={17} fill="currentColor" /> : <Mic size={18} />}{isRecording ? "Stop & review" : evaluateRecitation.isPending ? "Reviewing…" : "I will repeat"}</button>
              </div>
              <p className="loop-message" role="status">{recorderMessage}</p>
              {(isRecording || liveTranscript) && <div className="live-guidance"><div className="live-guidance-top"><span>{isRecording ? "Live word guide" : "What your browser heard"}</span><small>{liveTranscript ? "device speech recognition" : "waiting for your voice"}</small></div><div className="live-word-row" lang="ar" dir="rtl">{expectedWords.map((word, index) => <span key={`${word}-${index}`} className={liveMatched.includes(index) ? "is-heard" : ""}>{word}</span>)}</div>{liveTranscript && <p className="heard-transcript" lang="ar" dir="rtl">{liveTranscript}</p>}</div>}
              {recordingUrl && <audio className="learner-playback" src={recordingUrl} controls />}
              {feedback && <div className="feedback-panel"><div className="feedback-summary"><div><span className="eyebrow">{feedback.wordReviewAvailable ? "Word recall review" : "Word review unavailable"}</span><strong>{feedback.wordReviewAvailable ? `${feedback.matchedCount} / ${feedback.totalWords}` : "—"}</strong><small>{feedback.wordReviewAvailable ? "words matched in the transcript" : "the service did not recognise Arabic words"}</small></div><span className={`feedback-score ${feedback.wordReviewAvailable && feedback.score === 100 ? "is-strong" : ""}`}>{feedback.wordReviewAvailable ? `${feedback.score}%` : "—"}</span></div><p className="coach-copy">{feedback.encouragement}</p><div className="audio-coach"><div><span className="eyebrow">AI audio coach</span><p>Hear the practice cue in English, then use the qualified reciter for Quranic Arabic.</p></div><button type="button" onClick={() => speakGuidance(feedback.spokenGuidance)}><Volume2 size={16} /> Play guidance</button></div>{!feedback.wordReviewAvailable ? <div className="review-unavailable"><AlertCircle size={16} /><span>The recording is saved, but this response cannot support a reliable word-by-word score. Replay the qualified reciter and retry in a quieter place; use a teacher for pronunciation and tajwid.</span></div> : feedback.corrections.length > 0 ? <div className="correction-list">{feedback.corrections.slice(0, 4).map((item, index) => <div key={`${item.expected}-${index}`} className="correction-row"><span className="correction-index">{item.wordIndex ? `Word ${item.wordIndex}` : "Extra"}</span><span className="correction-word" lang="ar" dir="rtl">{item.expected || item.heard}</span><span className={`correction-state is-${item.status}`}>{item.status === "missing" ? "Not heard" : item.status === "review" ? "Review" : "Extra"}</span></div>)}</div> : <div className="all-matched"><Check size={16} /> Every expected word was recognised in this recording.</div>}<div className="next-step"><Volume2 size={16} /><span>{feedback.nextStep}</span></div><label className="coach-audio-toggle"><input type="checkbox" checked={coachAudioOn} onChange={(event) => setCoachAudioOn(event.target.checked)} /> Read new guidance aloud</label><p className="feedback-note"><AlertCircle size={13} /> {feedback.note}</p><button type="button" className="retry-button" onClick={retryLesson}><RotateCcw size={16} /> Listen and try again</button></div>}
            </div>
            {/* A dot per ayah reads well for short surahs; al-Baqarah's 286 would
                not, so longer surahs get a counter instead. */}
            <div className="study-pagination"><button type="button" onClick={() => moveVerse(-1)} disabled={!previousVerse}><ArrowLeft size={17} /> Previous</button>{ayahs.length <= 20 ? <div>{ayahs.map((verse) => <button key={verse.verseKey} type="button" className={selectedVerse === verse.number ? "dot is-current" : "dot"} aria-label={`Choose ayah ${verse.number}`} onClick={() => selectVerse(verse.number)} />)}</div> : <span className="pagination-count">{activeVerse.number} / {ayahs.length}</span>}<button type="button" onClick={() => moveVerse(1)} disabled={!nextVerse}>Next <ArrowRight size={17} /></button></div>
          </div>)}

          {view === "memorise" && (!activeVerse ? contentFallback : <div className="memory-layout"><div className="memory-topline"><span className="eyebrow">Recall gently</span><span>Ayah {activeVerse.number} of {ayahs.length}</span></div><p className="memory-prompt">Read aloud, then let the teacher loop help you check your place.</p><div className={`memory-verse ${covered ? "is-covered" : ""}`} lang="ar" dir="rtl">{covered ? <span className="covered-copy">The ayah is covered</span> : activeVerse.arabic}</div><p className="memory-meaning">{showTranslation ? activeVerse.translation ?? "" : "Meaning hidden for a focused recall."}</p><div className="memory-actions"><button type="button" className="quiet-action" onClick={() => setCovered((current) => !current)}>{covered ? <BookOpen size={17} /> : <Sparkles size={17} />}{covered ? "Reveal ayah" : "Cover ayah"}</button><button type="button" className="quiet-action" onClick={() => setShowTranslation((current) => !current)}><RotateCcw size={17} /> Toggle meaning</button><button type="button" className="quiet-action" onClick={() => setView("study")}><Mic size={17} /> Practise aloud</button></div><div className="memory-steps">{ayahs.map((verse) => <button type="button" key={verse.verseKey} onClick={() => selectVerse(verse.number)} className={selectedVerse === verse.number ? "step is-active" : "step"} aria-label={`Practise ayah ${verse.number}`}><span>{verse.number}</span></button>)}</div></div>)}
        </section>
        <div className="page-controls"><button type="button" onClick={() => moveVerse(-1)} disabled={!previousVerse}><ArrowLeft size={16} /> Previous ayah</button><span>{surahLabel} · {activeVerse?.number ?? "—"}/{ayahs.length || "—"}</span><button type="button" onClick={() => moveVerse(1)} disabled={!nextVerse}>Next ayah <ArrowRight size={16} /></button></div>
      </main>

      <aside className="study-panel" aria-label="Selected ayah details">
        <div className="panel-topbar"><p className="eyebrow">Keep your place</p><button type="button" className={`save-button ${saved ? "is-saved" : ""}`} onClick={() => setSaved((current) => !current)} aria-pressed={saved}><Bookmark size={16} fill={saved ? "currentColor" : "none"} /> {saved ? "Saved" : "Save"}</button></div>
        {activeVerse && <div className="selected-ayah"><div className="ayah-reference"><span>{surahLabel}</span><VerseMedallion number={activeVerse.number} /></div><p lang="ar" dir="rtl">{activeVerse.arabic}</p>{showTranslation && <>{activeVerse.transliteration && <p className="panel-transliteration">{activeVerse.transliteration}</p>}{activeVerse.translation && <p className="panel-translation">{activeVerse.translation}</p>}</>}</div>}
        <div className="audio-module"><div className="audio-heading"><span className={`audio-pulse ${isPlaying ? "is-playing" : ""}`} /><span>{isPlaying ? "Reciter audio playing" : "Listen & repeat"}</span></div><div className="audio-track"><span className={isPlaying ? "track-fill is-moving" : "track-fill"} /></div><div className="audio-times"><span>{reciters.find((reciter) => reciter.id === activeReciterId)?.name ?? "Reciter"}</span><span>Ayah {activeVerse?.number ?? "—"}</span></div><button type="button" className="listen-button" onClick={() => void playReciter(1)} disabled={!activeVerse?.audioUrl}>{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />} {isPlaying ? "Playing reciter" : "Listen to selected"}</button><p className="audio-note"><Headphones size={14} /> Real reciter audio at full device volume. Use headphones for focused practice.</p></div>
        <div className="practice-note"><img src="/manus-storage/quran-study-lantern-illustration_3d7eaf67.png" alt="" /><div><span className="eyebrow">Today’s sequence</span><p>Hear the ayah once, repeat it in your own voice, then return calmly to the one place that needs practice.</p></div></div>
        <div className="completion-card"><div><span className="eyebrow">This reading</span><strong>{readingPercent}%</strong></div><div className="completion-track"><span style={{ width: `${readingPercent}%` }} /></div><p>One attentive repetition is useful progress.</p></div>
      </aside>
      <div className="mobile-dock" aria-label="Mobile reading actions"><button type="button" onClick={() => setView("read")} className={view === "read" ? "is-active" : ""}><BookOpen size={18} /><span>Read</span></button><button type="button" onClick={() => setView("study")} className="dock-listen"><Mic size={19} /><span>Practise</span></button><button type="button" onClick={() => setView("memorise")} className={view === "memorise" ? "is-active" : ""}><Sparkles size={18} /><span>Recall</span></button></div>
    </div>
  );
}
