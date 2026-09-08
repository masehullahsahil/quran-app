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
  "language.partial": "interface only",
  // The trigger label on the language control. Short on purpose: it sits beside
  // the language's own name and has to fit a phone's bottom bar.
  "language.short": "Language",
  "language.aiDrafted": "AI draft, not reviewed by a speaker",
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
  "reader.noReciters": "No reciter audio available",
  "reader.reciterUnavailable": "{reciter} (audio unavailable)",
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
  "learn.copy": "Start from the alphabet and joining forms, then move into recitation rules with a qualified teacher.",
  "learn.paceEyebrow": "Choose your pace",
  "learn.paceHeading": "From first letters to careful recitation.",
  "learn.levelsLabel": "Learning levels",
  "learn.percentComplete": "{percent}% complete",
  "learn.level.qaida": "Qaida",
  "learn.level.qaidaSummary": "Arabic letters, articulation points, short vowels, and joining forms.",
  "learn.level.qaidaCue": "Letters & joining",
  "learn.level.tajweed": "Tajweed",
  "learn.level.tajweedSummary": "Recitation rules — elongation, nasalization, and stopping — practised with care.",
  "learn.level.tajweedCue": "Recitation rules",

  // -- Learn: qaida --------------------------------------------------------
  "qaida.eyebrow": "Qaida · lesson 1",
  "qaida.heading": "Letters before words.",
  "qaida.copy": "Learn one letter at a time, hear how it sounds, then practise it with a teacher.",
  "qaida.practisedCount": "practised · {percent}%",
  "qaida.alphabetLabel": "Arabic alphabet",
  "qaida.writtenAs": "Written as {transliteration} · {sound}",
  "qaida.playLetter": "Letter",
  "qaida.playLetterLabel": "Play {letter} on its own",
  "qaida.playHarakatLabel": "Play {letter} with {harakat}",
  "qaida.markPractised": "Mark practised",
  "qaida.practised": "Practised",
  "qaida.nextLetter": "Next letter",
  "qaida.listenLetter": "Hear this letter",
  "qaida.audioLoading": "Loading the recording…",
  "qaida.audioRetry": "Play it again",
  "qaida.audioIdle":
    "Choose a letter, alone or with a harakat. Only recordings a qualified teacher has approved are played here — the rest are not ready yet.",
  "qaida.audioPlaying": "Playing the reciter’s recording.",
  "qaida.audioUnavailable":
    "This recording has not been added yet. Reference audio for the Qaida is recorded by a qualified teacher and approved before a learner hears it — the app will not read Arabic with a synthesised voice in its place.",
  "qaida.audioAttribution": "Letter audio generated by {source}, until a reciter’s recordings replace it.",
  "qaida.audioIdlePlaceholder":
    "Choose the letter alone or with a harakat to hear it. This voice is synthesised, not a reciter’s.",
  "qaida.audioPlayingPlaceholder": "Playing a synthesised voice, not a reciter’s recording.",
  "qaida.audioUnavailablePlaceholder":
    "This clip has not been generated yet. The app will not read Arabic with a synthetic English voice in its place — English cannot make several of these sounds at all.",
  "qaida.audioFormUnavailable":
    "This set covers the letters on their own. Vowelled forms arrive with the reciter’s set — the app will not substitute a different sound for them.",
  "qaida.quickCheck": "Quick check",
  "qaida.quickCheckPrompt": "Which letter is this?",
  "qaida.quickCheckCorrect": "Correct. You can mark this letter as practised when you have said it with your teacher.",
  "qaida.quickCheckRetry": "Not yet. Look at the letter shape, play the letter again, and try once more.",
  "qaida.boundary": "Single letter sounds are not auto-scored. AI can help you structure practice, but a qualified teacher should confirm articulation and makhraj.",

  // -- Learn: harakat names ------------------------------------------------
  "harakat.fatha": "Fatha",
  "harakat.fathaHint": "short a",
  "harakat.kasra": "Kasra",
  "harakat.kasraHint": "short i",
  "harakat.damma": "Damma",
  "harakat.dammaHint": "short u",

  // -- Learn: qaida joining path -------------------------------------------
  "qaida.openFirstAyah": "Open first ayah practice",

  // -- Learn: tajweed path -------------------------------------------------
  "tajweed.eyebrow": "Tajweed path",
  "tajweed.heading": "Recitation rules, one deliberate return at a time.",
  "tajweed.copy": "Listen to a qualified reciter, repeat, review the words your recording captured, and return to your teacher for tajwid correction.",
  "tajweed.principleAudio": "Real reciter audio",
  "tajweed.principleReview": "AI word-recall review",
  "tajweed.principleTeacher": "Teacher-confirmed tajwid",
  "tajweed.begin": "Begin guided recitation",

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
  "study.record": "Record my recitation",
  "study.stopRecording": "Stop & review",
  "study.reviewing": "Checking…",
  "study.previous": "Previous",
  "study.next": "Next",
  "study.chooseAyah": "Choose ayah {number}",

  // -- Learn: the Qaida course -------------------------------------------
  // Chrome only. The lessons themselves — titles, teaching text, exercises and
  // Arabic examples — live in shared/qaidaCurriculum.ts, next to the data they
  // describe, in the same way the coach plans do.
  "course.eyebrow": "Qaida course",
  "course.levelLabel": "Level {order} — {title}",
  "course.percentComplete": "{percent}% of the course",
  "course.levelsLabel": "Course levels",
  "course.levelProgress": "{done} / {total} lessons",
  "course.locked": "Finish the earlier lessons first",
  "course.lessonPosition": "Lesson {number} of {total}",
  "course.completedBadge": "Completed",
  "course.stagesLabel": "How this lesson runs",
  "course.stageLearn": "Learn",
  "course.stageListen": "Listen",
  "course.stageRecognize": "Recognise",
  "course.stageRepeat": "Repeat",
  "course.stageRead": "Read",
  "course.stageCheck": "Check",
  "course.stageComplete": "Complete",
  "course.examplesLabel": "Examples",
  "course.teachingSummary": "What this lesson teaches",
  "course.quranBadge": "Quran {reference}",
  "course.teachingBadge": "Teaching example",
  "course.exerciseLabel": "Practice",
  "course.exerciseProgress": "Question {number} of {total}",
  "course.playAudio": "Play the reference",
  "course.audioUnavailable": "No reference recording is available for this form yet.",
  "course.correct": "Correct.",
  "course.retry": "Not quite. Look again, then try once more.",
  "course.continue": "Continue",
  "course.tryAgain": "Try again",
  "course.letterReference": "Letter reference",
  "course.letterReferenceHint": "All 28 letters, with a reciter's recording for each.",
  "course.readAloud": "I read this aloud",
  "course.openInStudy": "Open {reference} in Study",
  "course.lessonComplete": "Lesson complete.",
  "course.nextLesson": "Next: {title}",
  "course.finishCourse": "Finish the course",
  "course.practiseAgain": "Practise this lesson again",
  "course.courseComplete": "That is the whole Qaida. Keep going in Study mode, where a reciter reads first and your recording is reviewed word by word.",
  "course.lessonListLabel": "Lessons in this level",
  "course.reviewLesson": "Review",

  // -- Study: the one instruction ------------------------------------------
  // The dominant line in Study mode. One instruction, in the words a teacher
  // would use — never the tracker's internal state names. See
  // client/src/lib/teacherAction.ts for which one is chosen when.
  // -- Study: the active correction (tier 2) --------------------------------
  // What was observed about one word, in a teacher's words. Never a score, and
  // never a claim about how it sounded unless the acoustic evaluator said so.
  "correction.label": "The word to fix",
  "correction.notHeard": "I didn’t hear this word clearly.",
  "correction.different": "This word sounded different from the expected word.",
  "correction.sound": "The words were right — this is an observation about how this one sounded.",
  "correction.unsure": "This was not clear enough to be sure.",
  "correction.listen": "Listen to the ayah slowly",
  "correction.retry": "Listen, repeat the word, then recite the ayah again.",
  "correction.wordAt": "Word {number}",

  // The exact-word card: the eyebrow above the Arabic, the steps beneath it,
  // and the honest note that no word-level recording exists to play.
  "correction.eyebrow": "Needs attention",
  "correction.stepsLabel": "What to do",
  "correction.recordAgain": "Record again",
  "correction.referenceNote": "There is no separate recording of a single word, so this plays the whole ayah slowly.",
  "correction.after": "When your next recording no longer stops at this word, this card goes and you carry on.",
  "correction.listenAgain": "Listen again",

  // The tier-two card when the decision named no word at all. Kept apart from
  // the wording above so an unreviewable attempt never reads as a mistake.
  "outcome.label": "How that attempt went",
  "outcome.ayahHeadline": "Recite the whole ayah again",
  "outcome.ayahDetail": "No single word was singled out. The attempt as a whole needs another recitation.",
  "outcome.unclearHeadline": "I couldn’t confidently review that attempt",
  "outcome.unclearDetail": "Nothing has been marked wrong. Listen once, then record again.",
  "outcome.problemHeadline": "That recording could not be checked",
  "outcome.problemDetail": "The recording did not reach the review, so nothing about your recitation was judged.",
  "outcome.acceptedHeadline": "Good — continue.",
  "outcome.acceptedDetail": "This ayah was accepted. Carry on when you are ready.",
  "outcome.surahHeadline": "Good — you reached the end of this surah.",
  "outcome.surahDetail": "Every ayah in this surah has been recited.",

  // -- Study: practising one word ------------------------------------------
  // The guided lesson a learner is put through when one word needs another
  // attempt: hear it, say it, put it back in the ayah, carry on. None of this
  // wording claims anything about pronunciation quality — see
  // docs/ai-teacher-decisions.md for why that distinction is load-bearing.
  "lesson.label": "Practising one word",
  "lesson.eyebrow": "Needs attention",
  "lesson.wordOf": "Word {number} of {total}",
  "lesson.stepsLabel": "Steps in this correction",
  "lesson.stageHear": "Hear",
  "lesson.stageSay": "Say the word",
  "lesson.stageRecite": "Recite the ayah",
  "lesson.stageContinue": "Continue",
  "lesson.contextLabel": "Where the word belongs",
  "lesson.hearHeadline": "Hear this word, then say it back",
  "lesson.hearDetail": "You are practising this one place before going on.",
  "lesson.sayHeadline": "Your turn — say this word",
  "lesson.sayDetail": "Just the one word. The ayah comes next.",
  "lesson.notRecognisedDetail": "I still couldn’t clearly match this word. Hear it once more and try again.",
  "lesson.reciteHeadline": "Now put it back into the ayah",
  "lesson.reciteDetail": "Recite the whole ayah, with this word in its place.",
  "lesson.continueHeadline": "Good — that word is back in the ayah.",
  "lesson.continueDetail": "Carry on when you are ready.",
  "lesson.hearWord": "Hear {word}",
  "lesson.sayWord": "Say {word}",
  "lesson.reciteAyah": "Recite the full ayah",
  "lesson.continue": "Continue",
  "lesson.stopRecording": "Stop",
  "lesson.checking": "Checking this word…",
  "lesson.listening": "Listening…",
  "lesson.recognised": "Good — I heard the marked word this time.",
  "lesson.referenceNote": "This plays the whole ayah slowly: there is no separate recording of a single word.",

  // The per-word reference recitation. `lesson.hearWord` above names the word
  // itself; these are its states and the honest note about whose voice it is.
  "lesson.hearFullAyah": "Hear the full ayah",
  "lesson.wordLoading": "Loading the recording…",
  "lesson.wordPlaying": "The reciter is playing this word",
  "lesson.wordUnavailable": "That word recording could not be played.",
  "lesson.playAyahInstead": "Hear the full ayah instead",
  "lesson.wordReferenceNote": "A word-by-word reference recitation — a different reciter from the ayah above.",

  // A recording that matched too little of the ayah for any word to be judged.
  "outcome.unrelatedHeadline": "This recording didn’t match enough of the current ayah",
  "outcome.unrelatedDetail": "Individual words were not reviewed. Hear the ayah, then record again.",

  // Where the learner is in the surah. Not a score, and labelled so.
  "panel.placeInSurah": "Place in this surah",
  "panel.placeNote": "How far through the surah you are — not a score for your recitation.",

  // -- Study: safe diagnostics --------------------------------------------
  "diagnostics.label": "Recitation diagnostics",
  "diagnostics.transcriptStatus": "Transcript",
  "diagnostics.matchCount": "Matches",
  "diagnostics.teacherReason": "Teacher reason",
  "diagnostics.focus": "Focus",
  "diagnostics.acoustic": "Acoustic",
  "diagnostics.available": "available",
  "diagnostics.unavailable": "unavailable",
  "diagnostics.none": "none",
  "diagnostics.yes": "yes",
  "diagnostics.no": "no",

  "now.label": "What to do now",
  "now.stepsLabel": "How to practise this",
  "step.showWord": "Look at the word",
  "step.listen": "Listen",
  "step.repeatWord": "Repeat the word",
  "step.reciteAyah": "Recite the ayah",
  "step.recordAgain": "Record again",
  "now.place": "Ayah {ayah} of {total}",
  "now.placeWord": "Word {number}",
  "now.listening": "Listening…",
  "now.reviewing": "Checking what you recited…",
  "now.recordAgain": "That recording could not be checked",
  "now.repeatWord": "Repeat word {number}",
  // A word the learner has missed before, and a word a confidence-gated
  // acoustic observation named. Both still say what to do, not how it sounded.
  "now.repeatWordAgain": "This word again — word {number}",
  "now.repeatWordSound": "Listen closely to word {number}, then repeat it",
  "now.unclear": "That was not clear enough to check",
  "now.repeatAyah": "Repeat ayah {number}",
  "now.continueFromWord": "Continue from word {number}",
  "now.nextAyah": "Ayah complete — move to ayah {number}",
  "now.surahComplete": "You reached the end of this surah",
  "now.reviewToday": "Review this ayah today",
  "now.listenFirst": "Listen, then recite the ayah",
  "now.repeat": "Repeat",
  "now.tryAgain": "Try again",
  "now.goToAyah": "Go to ayah {number}",

  // -- Study: teacher notes (secondary detail) ------------------------------
  "notes.summary": "Teacher notes",
  "notes.observedLabel": "What this attempt showed",
  "notes.observedMissing": "Word {number} was not heard.",
  "notes.observedReview": "Word {number} came through differently.",
  "notes.observedRecurring": "Word {number} has needed work before.",
  "notes.observedExtra": "{count} extra word(s) were heard.",
  "notes.observedAcoustic": "A sound observation was made about word {number}.",
  "notes.observedBoundary": "These are observations, not a judgement of your recitation. What to do about them is the one instruction above.",
  "notes.hint": "Your score, your history with this ayah, and the practice plan.",
  "notes.placeLabel": "Where you are",
  "notes.whyLabel": "Why",

  // -- Study: memorization history -----------------------------------------
  "memory.eyebrow": "This ayah so far",
  "memory.reviewToday": "Review due today.",
  "memory.nextReview": "Next review: {date}.",
  "memory.none": "Recite this ayah once to start review scheduling.",
  "memory.repeatedOmission": "Word {number} is often missed here.",
  "memory.repeatedSubstitution": "Word {number} keeps needing review.",
  "memory.streak": "{count} clean reviews in a row",
  "memory.overview": "{due} due today · {weak} need review · {strong} strong",
  "memory.practiceNext": "Practise next",
  "memory.nextIs": "Surah {surah}, ayah {ayah}",
  "memory.startNew": "Start a new ayah",
  "mastery.new": "New",
  "mastery.learning": "Learning",
  "mastery.needs_review": "Needs review",
  "mastery.strong": "Strong",
  "mastery.mastered": "Mastered",

  // -- Study: verse-following (memorisation position) ----------------------
  // These describe where the learner is in the surah, from word-level
  // transcript alignment only. Nothing here comments on how the words sounded.
  "follow.label": "Where you are",
  "follow.eyebrow": "Your place",
  "follow.ayah": "Ayah {number}",
  "follow.stateFollowing": "Continue",
  "follow.stateCorrecting": "Try again",
  "follow.stateUncertain": "Not sure",
  "follow.stateCompleted": "Complete",
  "follow.continueAt": "Continue from word {number}.",
  "follow.surahComplete": "You reached the end of this surah.",
  "follow.correctionFocus": "Return to word {number} first:",
  "follow.moveToAyah": "Continue with ayah {number}",
  "follow.stayOnAyah": "Recite ayah {number} again",
  "follow.reasonNoTranscript": "Nothing usable was heard, so your place has not moved.",
  "follow.reasonTooLittleEvidence": "Too little of this ayah was recognised to move your place.",
  "follow.reasonNoisyTranscript": "The recording carried many words that are not in this ayah, so your place has not moved. Try again somewhere quieter.",
  "follow.reasonPreviousAyah": "That matched the previous ayah, so your place has been kept on this one.",
  "follow.reasonNextAyahEarly": "That began the next ayah. Finish this one first.",
  "follow.reasonPartialProgress": "Part of the ayah was recognised. Continue from the word below.",
  "follow.reasonMistakeToCorrect": "The ayah continued past a word that did not match. Return to the word below.",
  "follow.reasonAyahCompleted": "This ayah was recited through to the end.",
  "follow.reasonSurahCompleted": "That was the last ayah of this surah.",
  "follow.boundary": "Your place is kept from the words recognised in the transcript. It says nothing about tajwid, makhraj, vowel length, melody, or rhythm.",

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
  "recorder.empty": "No audio was captured. Check microphone access, then record the ayah again.",
  "recorder.retryNow": "Try recording again",
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

  // -- AI coaching context -------------------------------------------------
  "coach.contextLabel": "AI-guided practice plan",
  "coach.contextEyebrow": "Practice plan",
  "coach.practiceLoopLabel": "Practice loop",
  "coach.reviewPlanLabel": "Coaching plan used for this review",
  "coach.reviewPlanEyebrow": "AI practice coach",

  // -- AI coaching plans, by learning level --------------------------------
  // The plan itself — level, loop, boundary — is declared once in
  // shared/learningPath.ts. These are the words a learner reads for it.
  "plan.qaida.title": "Qaida",
  "plan.qaida.focus": "Letters, articulation points, short vowels, and joining forms",
  "plan.qaida.lessonGoal": "Build letter recognition and a deliberate listen–repeat habit, then join letters into words.",
  "plan.qaida.boundary": "Single-letter articulation and makhraj must be confirmed by a qualified teacher.",
  "plan.qaida.loopListen": "Listen",
  "plan.qaida.loopIdentify": "Identify",
  "plan.qaida.loopJoin": "Join",
  "plan.qaida.loopRepeat": "Repeat",
  "plan.qaida.loopReview": "Review",
  "plan.tajweed.title": "Tajweed",
  "plan.tajweed.focus": "Recitation rules — elongation, nasalization, and stopping — with teacher-guided refinement",
  "plan.tajweed.lessonGoal": "Recite with deliberate repetition and identify where to return for focused supervised practice.",
  "plan.tajweed.boundary": "Only a qualified teacher should confirm tajwid, makhraj, madd, waqf, melody, or religious correctness.",
  "plan.tajweed.loopRecall": "Recall",
  "plan.tajweed.loopRecord": "Record",
  "plan.tajweed.loopLocate": "Locate return",
  "plan.tajweed.loopTeacher": "Repeat with a teacher",

  // -- Study: feedback -----------------------------------------------------
  "feedback.available": "Words recognised",
  "feedback.unavailable": "Could not be checked",
  "feedback.matched": "of this ayah recognised",
  "feedback.notRecognised": "the service did not recognise Arabic words",
  "feedback.coachEyebrow": "AI audio coach",
  "feedback.coachCopy": "Hear the practice cue in English, then use the qualified reciter for Quranic Arabic.",
  "feedback.playGuidance": "Play guidance",
  "feedback.transcriptionFailed": "The recording could not be checked — the speech service did not respond. Check your connection, then record the ayah again.",
  "feedback.noArabicReturned": "No Arabic words were recognised in that recording. Try again in a quieter place, with the microphone close.",
  "feedback.reviewUnavailable": "The recording is saved, but this response cannot support a reliable word-by-word score. Replay the qualified reciter and retry in a quieter place; use a teacher for pronunciation and tajwid.",
  "feedback.wordIndex": "Word {number}",
  "feedback.extra": "Extra",
  "feedback.missing": "Not heard",
  "feedback.review": "Review",
  "feedback.allMatched": "Every expected word was recognised in this recording.",
  "feedback.readAloudToggle": "Read new guidance aloud",
  "feedback.tryAgain": "Listen and try again",
  "feedback.acousticLabel": "Sound observations",
  "feedback.acousticAvailable": "Confidence-gated practice observation",
  "feedback.acousticAbstained": "The audio review listened but was not confident enough to make a correction.",
  "feedback.acousticUnavailable": "The specialised audio review is unavailable. Your word-recall review is still ready.",
  "feedback.acousticConfidence": "Audio confidence: {percent}%",
  "feedback.acousticPhoneme": "Sound focus",
  "feedback.acousticVowelLength": "Vowel-length focus",
  "feedback.acousticPause": "Pause focus",
  "feedback.acousticTajweed": "Rule focus",
  "feedback.acousticBoundary": "Use this as practice guidance only. A qualified teacher should confirm tajwid, articulation, and religious correctness.",

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
