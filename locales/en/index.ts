/**
 * English — the reference pack.
 *
 * Every other language is typed against the keys defined here and may leave any
 * of them out; the loader falls back to this pack per key. That makes this file
 * the one place where a string must exist, and the source a translator works
 * from.
 *
 * Nothing Quranic belongs in this file. Arabic ayah text, ayah recitations, and
 * the Arabic letter recordings are shared across every language — see
 * locales/types.ts for where each of those lives.
 *
 * Placeholders are `{name}` and are substituted by `t()`.
 */
import type { LocaleLessons, LocaleManifest } from "../types";

export const manifest: LocaleManifest = {
  code: "en",
  name: "English",
  englishName: "English",
  direction: "ltr",
  instructionAudioDir: "/audio/instruction/en",
  preferredTranslationLanguage: "english",
};

export const strings = {
  // -- Shell and navigation ------------------------------------------------
  "app.tagline": "Reading plan",
  "nav.sectionLabel": "Your place",
  "nav.today": "Today",
  "nav.library": "My library",
  "nav.bookmarks": "Bookmarks",
  "nav.primaryLabel": "Primary navigation",
  "nav.practiceTitle": "Today’s practice",
  "nav.practiceCopy": "Listen, repeat, return.",
  "nav.minutesShort": "min",

  // -- Language picker -----------------------------------------------------
  "language.label": "Instruction language",
  "language.hint": "Arabic text and recitation stay the same in every language.",

  // -- Reader chrome -------------------------------------------------------
  "reader.eyebrow": "Quran",
  "reader.surahLabel": "Surah",
  "reader.juzLabel": "Juz",
  "reader.juzNumbered": "Juz’ {number}",
  "reader.reciterLabel": "Reciter",
  "reader.translationLabel": "Translation",
  "reader.loadingTranslations": "Loading translations…",
  "reader.surahSearch": "Search surahs…",
  "reader.surahNoMatch": "No surah matches that.",
  "reader.translationUnavailable": "Translations could not be listed. Showing the default English translation.",
  "reader.searchLabel": "Search Quran",
  "reader.settingsLabel": "Reading settings",
  "reader.loadingSurahs": "Loading surahs…",
  "reader.loadingJuz": "Loading juz…",
  "reader.loadingReciters": "Loading reciters…",
  "reader.makki": "Makki",
  "reader.madani": "Madani",
  "reader.ayahCount": "{count} ayahs",
  "reader.versesLabel": "Surah {surah} verses",
  "reader.footerHint": "Tap an ayah, then move to Study to hear and repeat it.",
  "reader.showMeaning": "Show meaning",
  "reader.hideMeaning": "Hide meaning",
  "reader.previousAyah": "Previous ayah",
  "reader.nextAyah": "Next ayah",
  "reader.chapterCopy": "Read the ayah, hear it from a reciter, repeat it yourself, then return gently to the place that needs practice.",
  "reader.loading": "Loading",

  // -- Playback ------------------------------------------------------------
  "playback.label": "Ayah playback",
  "playback.previous": "Previous ayah",
  "playback.next": "Next",
  "playback.listen": "Listen",
  "playback.pause": "Pause",
  "playback.place": "Ayah {number} of {total}",
  "playback.keepPlaying": "Keep playing",
  "playback.noAudio": "This reciter has no recording for this ayah. Try another reciter.",
  "playback.audioFailed": "Audio unavailable for {reciter}. This recording could not be played — try another reciter.",

  // -- Loading and failure -------------------------------------------------
  "content.loading": "Loading the Quran text and recitation…",
  "content.retry": "Try again",

  // -- Mode tabs -----------------------------------------------------------
  "mode.label": "Reading mode",
  "mode.read": "Read",
  "mode.readCaption": "Follow the page",
  "mode.learn": "Learn",
  "mode.learnCaption": "Letters to recitation",
  "mode.study": "Study",
  "mode.studyCaption": "Learn with a teacher loop",
  "mode.memorise": "Memorise",
  "mode.memoriseCaption": "Cover, recall, review",

  // -- Learn: levels -------------------------------------------------------
  "learn.heading": "Your Quran learning path",
  "learn.eyebrow": "Learn at your level",
  "learn.copy": "Start from the alphabet, develop reading confidence, then move into recitation and memorisation practice.",
  "learn.paceEyebrow": "Choose your pace",
  "learn.paceHeading": "From first letters to confident recitation.",
  "learn.levelsLabel": "Learning levels",
  "learn.percentComplete": "{percent}% complete",
  "learn.level.starter": "Starter",
  "learn.level.starterSummary": "Begin with Arabic letters, short vowels, and joining forms.",
  "learn.level.starterCue": "Letters & sounds",
  "learn.level.reading": "Reading",
  "learn.level.readingSummary": "Build from familiar words into steady Quran reading.",
  "learn.level.readingCue": "Words & flow",
  "learn.level.advanced": "Advanced",
  "learn.level.advancedSummary": "Practise listening, recall, and guided recitation with care.",
  "learn.level.advancedCue": "Recitation & hifz",

  // -- Learn: starter ------------------------------------------------------
  "starter.eyebrow": "Starter · lesson 1",
  "starter.heading": "Letters before words.",
  "starter.copy": "Learn one letter at a time, hear it from a qualified reciter, then practise the sound with a teacher.",
  "starter.practisedCount": "practised",
  "starter.alphabetLabel": "Arabic alphabet",
  "starter.writtenAs": "Written as {transliteration} · {sound}",
  "starter.playLetter": "Letter",
  "starter.playLetterLabel": "Play the recitation of {letter} on its own",
  "starter.playHarakatLabel": "Play {letter} with {harakat}",
  "starter.markPractised": "Mark practised",
  "starter.practised": "Practised",
  "starter.nextLetter": "Next letter",
  "starter.audioIdle": "Choose the letter alone or with a harakat to hear the reciter.",
  "starter.audioPlaying": "Playing the reciter’s recording.",
  "starter.audioUnavailable": "This recording has not been added yet. Recitation audio is recorded by a qualified reciter — the app will not read Arabic with a synthetic English voice.",
  "starter.quickCheck": "Quick check",
  "starter.quickCheckPrompt": "Which letter is this?",
  "starter.quickCheckCorrect": "Correct. You can mark this letter as practised when you have said it with your teacher.",
  "starter.quickCheckRetry": "Not yet. Look at the letter shape, then play the reciter’s recording and try again.",
  "starter.boundary": "Single letter sounds are not auto-scored. AI can help you structure practice, but a qualified teacher should confirm articulation and makhraj.",

  // -- Learn: harakat names ------------------------------------------------
  "harakat.fatha": "Fatha",
  "harakat.fathaHint": "short a",
  "harakat.kasra": "Kasra",
  "harakat.kasraHint": "short i",
  "harakat.damma": "Damma",
  "harakat.dammaHint": "short u",

  // -- Learn: reading path -------------------------------------------------
  "reading.eyebrow": "Reading path",
  "reading.heading": "Build words, then read in flow.",
  "reading.copy": "Move through vowels, joining forms, and short Quranic words before reading complete ayahs.",
  "reading.stepsProgress": "{done} / {total} steps",
  "reading.step.vowels": "Short vowels",
  "reading.step.vowelsSummary": "Recognise fatha, kasra, and damma with familiar letters.",
  "reading.step.joining": "Joining letters",
  "reading.step.joiningSummary": "Notice how a letter changes at the start, middle, and end of a word.",
  "reading.step.firstAyah": "First ayah reading",
  "reading.step.firstAyahSummary": "Open Al-Fātiḥah with transliteration and a slower reciter pace.",
  "reading.vowelCheck": "Short vowel check",
  "reading.vowelPrompt": "How do you read this?",
  "reading.vowelCorrect": "Correct. The kasra below the letter gives the short i sound: bi.",
  "reading.vowelRetry": "Look below the letter. A kasra gives the short i sound. Try bi.",
  "reading.openFirstAyah": "Open first ayah practice",

  // -- Learn: advanced path ------------------------------------------------
  "advanced.eyebrow": "Advanced path",
  "advanced.heading": "Recitation and hifz, one deliberate return at a time.",
  "advanced.copy": "Listen to a qualified reciter, repeat, review the words your recording captured, and return to your teacher for tajwid correction.",
  "advanced.principleAudio": "Real reciter audio",
  "advanced.principleReview": "AI word-recall review",
  "advanced.principleTeacher": "Teacher-confirmed tajwid",
  "advanced.begin": "Begin guided recitation",

  // -- Study: teacher loop -------------------------------------------------
  "study.ayah": "Ayah",
  "study.ayahOf": "of {total}",
  "study.listenSlowly": "Listen slowly",
  "study.lessonLabel": "Recitation lesson",
  "study.eyebrow": "Guided recitation",
  "study.heading": "Listen. Repeat. Review.",
  "study.badge": "Teacher loop",
  "study.stageLabel": "Current stage: {stage}",
  "study.stageListen": "Listen",
  "study.stageRepeat": "Your turn",
  "study.stageReview": "Review",
  "study.hearReciter": "Hear the reciter",
  "study.reciterPlaying": "Reciter is playing",
  "study.record": "I will repeat",
  "study.stopRecording": "Stop & review",
  "study.reviewing": "Reviewing…",
  "study.previous": "Previous",
  "study.next": "Next",
  "study.chooseAyah": "Choose ayah {number}",

  // -- Study: recorder messages -------------------------------------------
  "recorder.intro": "Listen to the reciter, then record your own repetition.",
  "recorder.listenSlow": "Listen slowly. Notice each word, then repeat it back.",
  "recorder.listenOnce": "Listen once through. When you are ready, it is your turn.",
  "recorder.audioFailed": "Audio could not start. Check your device volume, then try again.",
  "recorder.noLiveGuide": "Recording is available. Live word guidance works in browsers that support Arabic speech recognition; your recorded attempt will still be reviewed after you stop.",
  "recorder.liveGuidePaused": "Live guidance paused, but the recording will still receive a word-recall review when you stop.",
  "recorder.reviewing": "Reviewing the words you recited…",
  "recorder.reviewReady": "Your word-recall review is ready. Replay the reciter, then retry the marked place.",
  "recorder.reviewFailed": "The recording could not be reviewed. Please try a shorter clip.",
  "recorder.tooLarge": "That recording is {size} MB, over the {limit} MB limit, so it was not sent for review. Record one ayah at a calm pace and try again.",
  "recorder.listening": "Listening now. Recite the ayah at a calm pace, then press Stop & review.",
  "recorder.noRecorder": "This browser cannot record audio. Please use a current browser and allow microphone access.",
  "recorder.noMicrophone": "Microphone access was not granted. Allow it in your browser settings, then try again.",
  "recorder.retry": "Start by listening once more, then repeat the ayah in your own voice.",

  // -- Study: live guidance ------------------------------------------------
  "live.guideTitle": "Live word guide",
  "live.heardTitle": "What your browser heard",
  "live.source": "device speech recognition",
  "live.waiting": "waiting for your voice",

  // -- Study: feedback -----------------------------------------------------
  "feedback.available": "Word recall review",
  "feedback.unavailable": "Word review unavailable",
  "feedback.matched": "words matched in the transcript",
  "feedback.notRecognised": "the service did not recognise Arabic words",
  "feedback.coachEyebrow": "AI audio coach",
  "feedback.coachCopy": "Hear the practice cue in English, then use the qualified reciter for Quranic Arabic.",
  "feedback.playGuidance": "Play guidance",
  "feedback.reviewUnavailable": "The recording is saved, but this response cannot support a reliable word-by-word score. Replay the qualified reciter and retry in a quieter place; use a teacher for pronunciation and tajwid.",
  "feedback.wordIndex": "Word {number}",
  "feedback.extra": "Extra",
  "feedback.missing": "Not heard",
  "feedback.review": "Review",
  "feedback.allMatched": "Every expected word was recognised in this recording.",
  "feedback.readAloudToggle": "Read new guidance aloud",
  "feedback.tryAgain": "Listen and try again",

  // -- Memorise ------------------------------------------------------------
  "memorise.eyebrow": "Recall gently",
  "memorise.place": "Ayah {number} of {total}",
  "memorise.prompt": "Read aloud, then let the teacher loop help you check your place.",
  "memorise.covered": "The ayah is covered",
  "memorise.meaningHidden": "Meaning hidden for a focused recall.",
  "memorise.reveal": "Reveal ayah",
  "memorise.cover": "Cover ayah",
  "memorise.toggleMeaning": "Toggle meaning",
  "memorise.practise": "Practise aloud",
  "memorise.practiseAyah": "Practise ayah {number}",

  // -- Side panel ----------------------------------------------------------
  "panel.label": "Selected ayah details",
  "panel.keepPlace": "Keep your place",
  "panel.save": "Save",
  "panel.saved": "Saved",
  "panel.audioPlaying": "Reciter audio playing",
  "panel.listenRepeat": "Listen & repeat",
  "panel.reciterFallback": "Reciter",
  "panel.ayahNumber": "Ayah {number}",
  "panel.listenSelected": "Listen to selected",
  "panel.playingReciter": "Playing reciter",
  "panel.audioNote": "Real reciter audio at full device volume. Use headphones for focused practice.",
  "panel.sequenceEyebrow": "Today’s sequence",
  "panel.sequenceCopy": "Hear the ayah once, repeat it in your own voice, then return calmly to the one place that needs practice.",
  "panel.thisReading": "This reading",
  "panel.progressNote": "One attentive repetition is useful progress.",

  // -- Mobile dock ---------------------------------------------------------
  "dock.label": "Mobile reading actions",
  "dock.read": "Read",
  "dock.practise": "Practise",
  "dock.recall": "Recall",

  // -- Not found -----------------------------------------------------------
  "notFound.title": "Page Not Found",
  "notFound.copy": "Sorry, the page you are looking for doesn’t exist. It may have been moved or deleted.",
  "notFound.goHome": "Go Home",
} as const;

/**
 * Teaching text. Articulation notes describe where a sound is made — the kind
 * of explanation a teacher gives before a learner attempts the letter. They
 * accompany the reciter's recording; they do not replace it, and the app is
 * explicit that a teacher confirms makhraj.
 */
export const lessons: LocaleLessons = {
  letters: {
    alif: { articulation: "An open throat with no constriction. Carries the vowel rather than adding a sound of its own.", tip: "Keep the mouth relaxed and the sound clean." },
    ba: { articulation: "Both lips press together, then release with a light voiced burst.", tip: "The lips part cleanly — no puff of air after it." },
    ta: { articulation: "The tip of the tongue meets the base of the upper front teeth, released voiceless.", tip: "Lighter and further forward than ط." },
    tha: { articulation: "The tip of the tongue touches the edge of the upper front teeth; the air passes over it.", tip: "As in the English word ‘think’." },
    jeem: { articulation: "The middle of the tongue rises against the roof of the mouth, released with voice.", tip: "Hold it a moment; it is not a hurried sound." },
    hha: { articulation: "From the middle of the throat, a strong voiceless breath with no scrape.", tip: "Distinct from ه, which is softer and further down." },
    kha: { articulation: "From the upper throat, with a scraping sound.", tip: "Heavier than ح, and audibly rougher." },
    dal: { articulation: "The tip of the tongue meets the base of the upper front teeth, released with voice.", tip: "The voiced counterpart of ت." },
    dhal: { articulation: "The tip of the tongue touches the edge of the upper front teeth, released with voice.", tip: "As in the English word ‘this’." },
    ra: { articulation: "The tip of the tongue taps the ridge behind the upper front teeth.", tip: "A single light tap, not a long roll." },
    zay: { articulation: "The tongue tip sits behind the lower front teeth; a voiced hiss passes through.", tip: "Light and thin, not emphatic." },
    seen: { articulation: "A thin voiceless hiss with the tongue tip behind the lower front teeth.", tip: "Keep the mouth flat; ص is its heavy pair." },
    sheen: { articulation: "The middle of the tongue rises toward the palate and the air spreads across it.", tip: "The sound spreads rather than points." },
    sad: { articulation: "As س, but the tongue body rises and the sound becomes heavy and full.", tip: "The mouth rounds; compare directly with س." },
    dad: { articulation: "The side of the tongue presses against the upper molars, heavy and voiced.", tip: "Distinctive to Arabic — worth a teacher's ear early." },
    tta: { articulation: "As ت, but with the tongue raised and the sound made heavy.", tip: "Full and rounded; compare directly with ت." },
    zza: { articulation: "As ذ, but heavy, with the tongue body raised.", tip: "Compare with ذ to feel the weight change." },
    ayn: { articulation: "From the middle of the throat, voiced and steady, with the throat gently constricted.", tip: "Has no English equivalent — learn it by ear." },
    ghayn: { articulation: "From the upper throat, voiced, with a light gargling quality.", tip: "The voiced pair of خ." },
    fa: { articulation: "The upper front teeth rest on the inside of the lower lip; the air passes through.", tip: "Voiceless — no vibration." },
    qaf: { articulation: "The back of the tongue meets the very back of the palate; the sound is deep and heavy.", tip: "Further back than ك and noticeably heavier." },
    kaf: { articulation: "The back of the tongue meets the palate, released voiceless and light.", tip: "Forward and light; compare with ق." },
    lam: { articulation: "The tip of the tongue meets the ridge behind the upper front teeth; the air flows along the sides.", tip: "Light in most words." },
    meem: { articulation: "Both lips close and the sound passes through the nose.", tip: "Keep the lips gently closed, not pressed." },
    noon: { articulation: "The tip of the tongue meets the ridge behind the upper front teeth; the sound passes through the nose.", tip: "The nasal quality should be audible." },
    ha: { articulation: "From the deepest part of the throat, a soft voiceless breath.", tip: "Softer and deeper than ح." },
    waw: { articulation: "The lips round without closing.", tip: "As in the English word ‘we’." },
    ya: { articulation: "The middle of the tongue rises toward the palate without touching it.", tip: "As in the English word ‘yes’." },
  },
};

export type StringKey = keyof typeof strings;
export type ReferenceStrings = Record<StringKey, string>;

export default { manifest, strings, lessons };
