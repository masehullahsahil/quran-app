/**
 * Pashto — complete pack.
 *
 * Everything a learner reads is in Pashto: the interface, the teacher's
 * instructions, the study controls, all 28 articulation notes, and the whole
 * Qaida course prose — every lesson and every exercise prompt. Nothing falls
 * back to English, and a coverage test fails the day something does.
 *
 * The wording is Afghan Pashto rather than a Persianised or word-for-word
 * rendering of the English: instructions are phrased the way a teacher would
 * say them. Established Arabic terms (سکون، شده، تنوین، قلقله، غنه، تجوید،
 * مخرج) are kept, with a short Pashto explanation beside them where the lesson
 * introduces one, because translating them would blur what they mean.
 *
 * The Quran itself is untouched by this file: its Arabic text, the ayah
 * recitations and the letter recordings are shared by every language.
 *
 * NOT YET REVIEWED BY A NATIVE SPEAKER. `nativeReviewed: false` in
 * shared/languages.ts records that. Religious terms (آیت، سورت) keep their
 * standard Pashto form.
 */
import type { LocaleLessons, LocaleManifest } from "../types";
import type { TranslatableStrings } from "../index";
import { QAIDA_LESSONS } from "../../shared/qaidaCurriculum";
import { promptsFromPhrasebook, type QaidaTextPack } from "../../shared/qaidaText";
import { SUPPORTED_LANGUAGES } from "../../shared/languages";

export const manifest: LocaleManifest = { ...SUPPORTED_LANGUAGES.ps };

export const strings: TranslatableStrings = {
  "now.label": "اوس څه وکړئ",
  "now.place": "آیت {ayah} له {total} څخه",
  "now.placeWord": "کلمه {number}",
  "now.listening": "اورم…",
  "now.reviewing": "ستاسو لوستل بیاکتل کیږي…",
  "now.recordAgain": "دا ثبت و نه څیړل شو",
  "now.unclear": "دا دومره روښانه نه وه چې وڅیړل شي",
  "now.repeatWord": "کلمه {number} بیا ووایاست",
  "now.repeatWordAgain": "همدا کلمه بیا — کلمه {number}",
  "now.repeatWordSound": "کلمه {number} په ځیر واورئ، بیا یې ووایاست",
  "now.repeatAyah": "آیت {number} بیا ولولئ",
  "now.continueFromWord": "له کلمې {number} څخه دوام ورکړئ",
  "now.nextAyah": "آیت بشپړ شو — آیت {number} ته لاړ شئ",
  "now.surahComplete": "تاسو د دې سورت پای ته ورسیدئ",
  "now.reviewToday": "نن دا آیت بیا ولولئ",
  "now.listenFirst": "لومړی واورئ، بیا آیت ولولئ",
  "now.repeat": "بیا ووایاست",
  "now.tryAgain": "بیا هڅه وکړئ",
  "now.goToAyah": "آیت {number} ته لاړ شئ",
  "now.stepsLabel": "څنګه یې تمرین کړئ",

  "correction.label": "هغه کلمه چې سمېدو ته اړتیا لري",
  "correction.notHeard": "دا کلمه وا نه اورېدل شوه.",
  "correction.different": "د دې پر ځای بل څه واورېدل شول.",
  "correction.sound": "کلمې سمې وې. د دې کلمې ادا په ځیر واورئ.",
  "correction.unsure": "دا دومره روښانه نه وه چې ډاډ ترلاسه شي.",
  "correction.listen": "آیت ورو واورئ",
  "correction.retry": "واورئ، کلمه بیا ووایاست، بیا ټول آیت ولولئ.",
  "correction.wordAt": "کلمه {number}",

  "step.showWord": "کلمې ته وګورئ",
  "step.listen": "واورئ",
  "step.repeatWord": "کلمه بیا ووایاست",
  "step.reciteAyah": "آیت ولولئ",
  "step.recordAgain": "بیا ثبت کړئ",

  "study.hearReciter": "قاري واورئ",
  "study.reciterPlaying": "قاري لولي",
  "study.record": "زما لوستل ثبت کړئ",
  "study.stopRecording": "ودروئ او وګورئ",
  "study.reviewing": "څېړل کیږي…",
  "study.listenSlowly": "ورو واورئ",
  "study.previous": "پخوانی",
  "study.next": "راتلونکی",
  "study.ayah": "آیت",
  "recorder.intro": "قاري واورئ، بیا خپل لوستل ثبت کړئ.",
  "recorder.listening": "اوس اورم. آیت په ارامۍ ولولئ، بیا ودروئ او وګورئ کېکاږئ.",
  "recorder.reviewing": "هغه کلمې چې لوستې دي څېړل کیږي…",
  "recorder.reviewReady": "د کلمو کتنه چمتو ده. قاري بیا واورئ، بیا نښه شوې برخه تکرار کړئ.",
  "recorder.retryNow": "بیا ثبت کړئ",

  "mode.read": "لوستل",
  "mode.learn": "زده کړه",
  "mode.study": "تمرین",
  "mode.memorise": "حفظ",
  "dock.read": "لوستل",
  "dock.practise": "تمرین",
  "dock.recall": "تکرار",
  "notes.summary": "د استاد یادښتونه",
  "language.label": "د کارونې ژبه",

  "mastery.new": "نوی",
  "mastery.learning": "په زده کړه کې",
  "mastery.needs_review": "بیاکتنې ته اړتیا",
  "mastery.strong": "پیاوړی",
  "mastery.mastered": "بشپړ حفظ",

  "course.continue": "دوام ورکړئ",
  "course.tryAgain": "بیا هڅه وکړئ",
  "course.readAloud": "ما په لوړ غږ ولوستل",
  "course.completedBadge": "بشپړ",
  "course.locked": "لومړی پخواني درسونه بشپړ کړئ",

  // -- Supporting interface -------------------------------------------------
  "nav.sectionLabel": "ستاسو ځای",
  "nav.today": "نن",
  "nav.library": "زما کتابتون",
  "nav.bookmarks": "نښه شوي",
  "nav.practiceTitle": "د نن تمرین",
  "nav.practiceCopy": "واورئ، تکرار کړئ، بیرته راشئ.",
  "nav.minutesShort": "دقیقې",
  "language.partial": "یوازې مخ",
  "language.aiDrafted": "د مصنوعي ځیرکتیا مسوده، د ژبې خبرې کوونکي نه ده لوستلې",
  "language.hint": "عربي متن او تلاوت په هره ژبه کې یو شان پاتې کیږي.",
  "mode.label": "د لوستلو ډول",
  "mode.readCaption": "مخ تعقیب کړئ",
  "mode.learnCaption": "له حروفو تر تلاوته",
  "mode.studyCaption": "له استاد سره تمرین",
  "mode.memoriseCaption": "پټ کړئ، یاد کړئ، بیا وګورئ",
  "study.ayahOf": "له {total} څخه",
  "study.lessonLabel": "د تلاوت درس",
  "study.eyebrow": "لارښوونه شوې تلاوت",
  "study.heading": "واورئ. تکرار کړئ. وګورئ.",
  "study.badge": "د استاد لاره",
  "study.stageListen": "واورئ",
  "study.stageRepeat": "ستاسو وار",
  "study.stageReview": "کتنه",
  "study.chooseAyah": "آیت {number} وټاکئ",
  "playback.previous": "پخوانی آیت",
  "playback.next": "راتلونکی",
  "playback.listen": "واورئ",
  "playback.pause": "ودروئ",
  "playback.place": "آیت {number} له {total} څخه",
  "playback.keepPlaying": "روان دې وي",

  // -- Teacher notes --------------------------------------------------------
  "notes.observedLabel": "دې هڅې څه وښودل",
  "notes.observedMissing": "کلمه {number} وا نه اورېدل شوه.",
  "notes.observedReview": "کلمه {number} په بل ډول راغله.",
  "notes.observedRecurring": "کلمه {number} مخکې هم کار غوښتی.",
  "notes.observedExtra": "{count} اضافي کلمې واورېدل شوې.",
  "notes.observedAcoustic": "د کلمې {number} د غږ په اړه یوه کتنه شته.",
  "notes.observedBoundary": "دا کتنې دي، ستاسو پر تلاوت پرېکړه نه ده. څه وکړئ، هغه یوازې پورتنۍ لارښوونه ده.",
  "notes.hint": "ستاسو پایله، له دې آیت سره ستاسو پخوانۍ کړنه، او د تمرین پلان.",
  "notes.placeLabel": "چیرې یاست",
  "notes.whyLabel": "ولې",

  // -- Memorisation and review ---------------------------------------------
  "memory.eyebrow": "دا آیت تر اوسه",
  "memory.reviewToday": "نن یې بیا کتنه ده.",
  "memory.nextReview": "راتلونکې کتنه: {date}.",
  "memory.none": "د بیاکتنې مهال ویش پیل کولو لپاره دا آیت یو ځل ولولئ.",
  "memory.repeatedOmission": "دلته کلمه {number} ډېر ځله پاتې کیږي.",
  "memory.repeatedSubstitution": "کلمه {number} بیا بیا کتنې ته اړتیا لري.",
  "memory.streak": "{count} پرله پسې سمې بیاکتنې",
  "memory.overview": "{due} نن · {weak} بیاکتنې ته اړتیا · {strong} پیاوړي",
  "memory.practiceNext": "راتلونکی تمرین",
  "memory.nextIs": "سورت {surah}، آیت {ayah}",
  "memory.startNew": "نوی آیت پیل کړئ",

  // -- Where you are (secondary detail) -------------------------------------
  "follow.label": "چیرې یاست",
  "follow.eyebrow": "ستاسو ځای",
  "follow.ayah": "آیت {number}",
  "follow.stateFollowing": "دوام",
  "follow.stateCorrecting": "بیا هڅه",
  "follow.stateUncertain": "ډاډه نه دی",
  "follow.stateCompleted": "بشپړ",
  "follow.continueAt": "له کلمې {number} څخه دوام ورکړئ.",
  "follow.surahComplete": "تاسو د دې سورت پای ته ورسیدئ.",
  "follow.correctionFocus": "لومړی کلمې {number} ته راشئ:",
  "follow.moveToAyah": "له آیت {number} سره دوام ورکړئ",
  "follow.stayOnAyah": "آیت {number} بیا ولولئ",
  "follow.reasonNoTranscript": "د کارولو وړ څه وا نه اورېدل شول، نو ستاسو ځای بدل نه شو.",
  "follow.reasonTooLittleEvidence": "د دې آیت دومره برخه ونه پېژندل شوه چې ځای مخته یووړل شي.",
  "follow.reasonNoisyTranscript": "ثبت کې ډېرې داسې کلمې وې چې له دې آیت څخه نه دي، نو ځای بدل نه شو. په آرام ځای کې بیا هڅه وکړئ.",
  "follow.reasonPreviousAyah": "دا له پخواني آیت سره سمون خوري، نو ستاسو ځای پر همدې آیت وساتل شو.",
  "follow.reasonNextAyahEarly": "دا د راتلونکي آیت پیل و. لومړی دا بشپړ کړئ.",
  "follow.reasonPartialProgress": "د آیت یوه برخه وپېژندل شوه. له لاندې کلمې څخه دوام ورکړئ.",
  "follow.reasonMistakeToCorrect": "آیت له یوې کلمې تېر شو چې سمون یې نه خوړ. لاندې کلمې ته راشئ.",
  "follow.reasonAyahCompleted": "دا آیت تر پایه ولوستل شو.",
  "follow.reasonSurahCompleted": "هغه د دې سورت وروستی آیت و.",
  "follow.boundary": "ستاسو ځای یوازې له هغو کلمو ساتل کیږي چې په متن کې وپېژندل شوې. دا د تجوید، مخرج، مد، لحن یا وزن په اړه څه نه وایي.",

  // -- Recorder -------------------------------------------------------------
  "recorder.listenSlow": "ورو واورئ. هرې کلمې ته پام وکړئ، بیا یې تکرار کړئ.",
  "recorder.listenOnce": "یو ځل بشپړ واورئ. کله چې چمتو شئ، ستاسو وار دی.",
  "recorder.audioFailed": "غږ پیل نه شو. د خپل وسیلې غږ وګورئ، بیا هڅه وکړئ.",
  "recorder.retry": "لومړی یو ځل بیا واورئ، بیا آیت په خپل غږ ولولئ.",

  // -- Shell, reader and playback -------------------------------------------
  "app.tagline": "د لوستلو پلان",
  "nav.primaryLabel": "اصلي مینو",
  "reader.eyebrow": "قرآن",
  "reader.surahLabel": "سورت",
  "reader.juzLabel": "پاره",
  "reader.juzNumbered": "{number} پاره",
  "reader.reciterLabel": "قاري",
  "reader.translationLabel": "ژباړه",
  "reader.loadingTranslations": "ژباړې راځي…",
  "reader.surahSearch": "سورتونه ولټوئ…",
  "reader.surahNoMatch": "هیڅ سورت ورسره سمون نه خوري.",
  "reader.translationUnavailable": "د ژباړو لړ لیک ترلاسه نه شو. اصلي انګلیسي ژباړه ښودل کیږي.",
  "reader.searchLabel": "په قرآن کې لټون",
  "reader.settingsLabel": "د لوستلو تنظیمات",
  "reader.loadingSurahs": "سورتونه راځي…",
  "reader.loadingJuz": "پارې راځي…",
  "reader.loadingReciters": "قاریان راځي…",
  "reader.noReciters": "د هیڅ قاري غږ شتون نه لري",
  "reader.reciterUnavailable": "{reciter} (غږ یې نشته)",
  "reader.makki": "مکي",
  "reader.madani": "مدني",
  "reader.ayahCount": "{count} آیتونه",
  "reader.versesLabel": "د {surah} سورت آیتونه",
  "reader.footerHint": "پر یوه آیت ټک ووهئ، بیا تمرین ته لاړ شئ چې واورئ او تکرار یې کړئ.",
  "reader.showMeaning": "مانا ښکاره کړئ",
  "reader.hideMeaning": "مانا پټه کړئ",
  "reader.previousAyah": "پخوانی آیت",
  "reader.nextAyah": "راتلونکی آیت",
  "reader.chapterCopy": "آیت ولولئ، له قاري یې واورئ، پخپله یې تکرار کړئ، بیا په ارامۍ هغه ځای ته راستون شئ چې تمرین ته اړتیا لري.",
  "reader.loading": "راځي…",
  "playback.label": "د آیت غږ",
  "playback.noAudio": "دې قاري د دې آیت ثبت نه لري. بل قاري وټاکئ.",
  "playback.audioFailed": "د {reciter} غږ شتون نه لري. دا ثبت و نه غږېد — بل قاري وټاکئ.",
  "content.loading": "د قرآن متن او تلاوت راځي…",
  "content.retry": "بیا هڅه وکړئ",

  // -- Learn: levels and the qaida overview ---------------------------------
  "learn.heading": "ستاسو د قرآن د زده کړې لاره",
  "learn.eyebrow": "په خپله کچه زده کړه وکړئ",
  "learn.copy": "له الفبا او د نښلولو له شکلونو پیل وکړئ، بیا له وړ استاد سره د تلاوت قواعدو ته ورشئ.",
  "learn.paceEyebrow": "خپله چټکتیا وټاکئ",
  "learn.paceHeading": "له لومړیو حروفو څخه تر پام سره تلاوته.",
  "learn.levelsLabel": "د زده کړې کچې",
  "learn.percentComplete": "{percent}% بشپړ",
  "learn.level.qaida": "قاعده",
  "learn.level.qaidaSummary": "عربي حروف، مخرجونه، لنډ حرکتونه او د نښلولو شکلونه.",
  "learn.level.qaidaCue": "حروف او نښلول",
  "learn.level.tajweed": "تجوید",
  "learn.level.tajweedSummary": "د تلاوت قواعد — مد، غنه او وقف — په پام سره تمرین کیږي.",
  "learn.level.tajweedCue": "د تلاوت قواعد",
  "qaida.eyebrow": "قاعده · لومړی درس",
  "qaida.heading": "له کلمو مخکې حروف.",
  "qaida.copy": "یو یو حرف زده کړئ، غږ یې واورئ، بیا یې له استاد سره تمرین کړئ.",
  "qaida.practisedCount": "تمرین شوي · {percent}%",
  "qaida.alphabetLabel": "عربي الفبا",
  "qaida.writtenAs": "لیکل کیږي {transliteration} · {sound}",
  "qaida.playLetter": "حرف",
  "qaida.playLetterLabel": "{letter} یوازې وغږوئ",
  "qaida.playHarakatLabel": "{letter} له {harakat} سره وغږوئ",
  "qaida.markPractised": "د تمرین شوي په توګه ونښه کړئ",
  "qaida.practised": "تمرین شوی",
  "qaida.nextLetter": "راتلونکی حرف",
  "qaida.audioIdle": "حرف یوازې یا له حرکت سره وټاکئ چې د قاري غږ واورئ.",
  "qaida.audioPlaying": "د قاري ثبت غږیږي.",
  "qaida.audioUnavailable": "دا ثبت لا نه دی زیات شوی. د تلاوت غږ د یوه وړ قاري له خوا ثبتیږي — اپلیکیشن به عربي په جوړ شوي انګلیسي غږ ونه لولي.",
  "qaida.audioAttribution": "د حروفو غږ د {source} له لارې جوړ شوی، تر هغې چې د قاري ثبتونه یې ځای ونیسي.",
  "qaida.audioIdlePlaceholder": "حرف یوازې یا له حرکت سره وټاکئ چې واورئ یې. دا غږ جوړ شوی دی، د قاري نه دی.",
  "qaida.audioPlayingPlaceholder": "یو جوړ شوی غږ غږیږي، د قاري ثبت نه دی.",
  "qaida.audioUnavailablePlaceholder": "دا ټوټه لا نه ده جوړه شوې. اپلیکیشن به یې پر ځای عربي په جوړ شوي انګلیسي غږ ونه لولي — انګلیسي ځینې دا غږونه بېخي نه شي ادا کولی.",
  "qaida.audioFormUnavailable": "دا ټولګه یوازې حروف په خپله کې لري. حرکت لرونکي شکلونه د قاري له ټولګې سره راځي — اپلیکیشن به بل غږ د دوی پر ځای ونه کاروي.",
  "qaida.quickCheck": "چټکه کتنه",
  "qaida.quickCheckPrompt": "دا کوم حرف دی؟",
  "qaida.quickCheckCorrect": "سم دی. کله چې مو له استاد سره ووایه، بیا کولای شئ دا حرف تمرین شوی ونښه کړئ.",
  "qaida.quickCheckRetry": "لا نه. د حرف شکل ته وګورئ، حرف بیا وغږوئ، او یو ځل بیا هڅه وکړئ.",
  "qaida.boundary": "یوازینیو حروفو ته پخپله نمره نه ورکول کیږي. مصنوعي ځیرکتیا کولای شي ستاسو تمرین منظم کړي، خو ادا او مخرج باید وړ استاد تایید کړي.",
  "harakat.fatha": "فتحه (زور)",
  "harakat.fathaHint": "لنډ اَ",
  "harakat.kasra": "کسره (زېر)",
  "harakat.kasraHint": "لنډ اِ",
  "harakat.damma": "ضمه (پېښ)",
  "harakat.dammaHint": "لنډ اُ",
  "qaida.openFirstAyah": "د لومړي آیت تمرین پرانیزئ",
  "tajweed.eyebrow": "د تجوید لاره",
  "tajweed.heading": "د تلاوت قواعد، هر ځل یو له پامه ډک تکرار.",
  "tajweed.copy": "له وړ قاري واورئ، تکرار یې کړئ، هغه کلمې وګورئ چې ستاسو ثبت ونیولې، بیا د تجوید د سمون لپاره خپل استاد ته راستون شئ.",
  "tajweed.principleAudio": "د ریښتیني قاري غږ",
  "tajweed.principleReview": "د مصنوعي ځیرکتیا د کلمو کتنه",
  "tajweed.principleTeacher": "د استاد تایید شوی تجوید",
  "tajweed.begin": "لارښود شوی تلاوت پیل کړئ",
  "study.stageLabel": "اوسنۍ مرحله: {stage}",

  // -- The Qaida course chrome ----------------------------------------------
  "course.eyebrow": "د قاعدې کورس",
  "course.levelLabel": "کچه {order} — {title}",
  "course.percentComplete": "د کورس {percent}%",
  "course.levelsLabel": "د کورس کچې",
  "course.levelProgress": "{done} / {total} درسونه",
  "course.lessonPosition": "درس {number} له {total} څخه",
  "course.stagesLabel": "دا درس څنګه روان دی",
  "course.stageLearn": "زده کړه",
  "course.stageListen": "اورېدل",
  "course.stageRecognize": "پېژندل",
  "course.stageRepeat": "تکرار",
  "course.stageRead": "لوستل",
  "course.stageCheck": "کتنه",
  "course.stageComplete": "بشپړول",
  "course.examplesLabel": "بېلګې",
  "course.teachingSummary": "دا درس څه ښیي",
  "course.quranBadge": "قرآن {reference}",
  "course.teachingBadge": "زده کړیزه بېلګه",
  "course.exerciseLabel": "تمرین",
  "course.exerciseProgress": "پوښتنه {number} له {total} څخه",
  "course.playAudio": "بېلګه وغږوئ",
  "course.audioUnavailable": "د دې شکل لپاره لا هیڅ ثبت شوې بېلګه نشته.",
  "course.correct": "سم دی.",
  "course.retry": "لا سم نه دی. بیا وګورئ، بیا یو ځل هڅه وکړئ.",
  "course.letterReference": "د حروفو لړ",
  "course.letterReferenceHint": "ټول ۲۸ حروف، د هر یوه لپاره د قاري ثبت.",
  "course.openInStudy": "{reference} په تمرین کې پرانیزئ",
  "course.lessonComplete": "درس بشپړ شو.",
  "course.nextLesson": "راتلونکی: {title}",
  "course.finishCourse": "کورس پای ته ورسوئ",
  "course.practiseAgain": "دا درس بیا تمرین کړئ",
  "course.courseComplete": "دا ټوله قاعده وه. په تمرین برخه کې دوام ورکړئ، چیرې چې لومړی قاري لولي او بیا ستاسو ثبت کلمه په کلمه کتل کیږي.",
  "course.lessonListLabel": "په دې کچه کې درسونه",
  "course.reviewLesson": "بیاکتنه",

  // -- Recorder, live guidance and the practice plan ------------------------
  "recorder.noLiveGuide": "ثبتول شونی دي. ژوندۍ لارښوونه یوازې په هغو براوزرونو کې کار کوي چې د عربي غږ پېژندنه لري؛ ستاسو ثبت به بیا هم د درېدو وروسته وکتل شي.",
  "recorder.liveGuidePaused": "ژوندۍ لارښوونه ودرېده، خو ثبت به بیا هم د درېدو وروسته د کلمو کتنه ترلاسه کړي.",
  "recorder.reviewFailed": "ثبت و نه کتل شو. لطفاً یوه لنډه ټوټه هڅه کړئ.",
  "recorder.empty": "هیڅ غږ ونه نیول شو. مایکروفون ته لاسرسی وګورئ، بیا آیت بیا ثبت کړئ.",
  "recorder.tooLarge": "دا ثبت {size} MB دی، له {limit} MB بریده اوړي، نو کتنې ته و نه لېږل شو. یو آیت په ارامۍ ثبت کړئ او بیا هڅه وکړئ.",
  "recorder.noRecorder": "دا براوزر غږ نه شي ثبتولی. لطفاً یو نوی براوزر وکاروئ او مایکروفون ته اجازه ورکړئ.",
  "recorder.noMicrophone": "مایکروفون ته اجازه ورنه کړل شوه. په براوزر تنظیماتو کې یې اجازه ورکړئ، بیا هڅه وکړئ.",
  "live.guideTitle": "د کلمو ژوندی لارښود",
  "live.heardTitle": "ستاسو براوزر څه واورېدل",
  "live.source": "د وسیلې د غږ پېژندنه",
  "live.waiting": "ستاسو غږ ته انتظار",
  "coach.contextLabel": "د مصنوعي ځیرکتیا لارښود تمرین پلان",
  "coach.contextEyebrow": "د تمرین پلان",
  "coach.practiceLoopLabel": "د تمرین دوره",
  "coach.reviewPlanLabel": "هغه تمرین پلان چې په دې کتنه کې وکارول شو",
  "coach.reviewPlanEyebrow": "د مصنوعي ځیرکتیا تمرین لارښود",

  // -- The coaching plan, by learning level ---------------------------------
  "plan.qaida.title": "قاعده",
  "plan.qaida.focus": "حروف، مخرجونه، لنډ حرکتونه او د نښلولو شکلونه",
  "plan.qaida.lessonGoal": "د حروفو پېژندل او د اورېدو-تکرار عادت پیاوړی کړئ، بیا حروف په کلمو کې سره ونښلوئ.",
  "plan.qaida.boundary": "د یوازینیو حروفو ادا او مخرج باید وړ استاد تایید کړي.",
  "plan.qaida.loopListen": "واورئ",
  "plan.qaida.loopIdentify": "وپېژنئ",
  "plan.qaida.loopJoin": "ونښلوئ",
  "plan.qaida.loopRepeat": "تکرار کړئ",
  "plan.qaida.loopReview": "وګورئ",
  "plan.tajweed.title": "تجوید",
  "plan.tajweed.focus": "د تلاوت قواعد — مد، غنه او وقف — د استاد په لارښوونه سره",
  "plan.tajweed.lessonGoal": "په پام سره تکرار سره ولولئ او هغه ځای وټاکئ چې د استاد تر څارنې لاندې تمرین ته اړتیا لري.",
  "plan.tajweed.boundary": "تجوید، مخرج، مد، وقف، لحن او شرعي سموالی یوازې وړ استاد تاییدولی شي.",
  "plan.tajweed.loopRecall": "یاد کړئ",
  "plan.tajweed.loopRecord": "ثبت کړئ",
  "plan.tajweed.loopLocate": "د راستنېدو ځای ومومئ",
  "plan.tajweed.loopTeacher": "له استاد سره یې تکرار کړئ",

  // -- Review feedback ------------------------------------------------------
  "feedback.available": "پېژندل شوې کلمې",
  "feedback.unavailable": "و نه کتل شو",
  "feedback.matched": "د دې آیت وپېژندل شو",
  "feedback.notRecognised": "خدمت هیڅ عربي کلمه ونه پېژندله",
  "feedback.coachEyebrow": "د مصنوعي ځیرکتیا غږیز لارښود",
  "feedback.coachCopy": "د تمرین لارښوونه په انګلیسي واورئ، بیا د قرآني عربي لپاره وړ قاري وکاروئ.",
  "feedback.playGuidance": "لارښوونه وغږوئ",
  "feedback.transcriptionFailed": "ثبت و نه کتل شو — د غږ پېژندنې خدمت ځواب ورنه کړ. خپله اړیکه وګورئ، بیا آیت بیا ثبت کړئ.",
  "feedback.noArabicReturned": "په دې ثبت کې هیڅ عربي کلمه ونه پېژندل شوه. په ارام ځای کې، مایکروفون نږدې ونیسئ او بیا هڅه وکړئ.",
  "feedback.reviewUnavailable": "ثبت خوندي شو، خو دا ځواب د کلمه په کلمه باوري ارزونې ملاتړ نه کوي. وړ قاري بیا واورئ او په ارام ځای کې بیا هڅه وکړئ؛ د ادا او تجوید لپاره استاد ته مراجعه وکړئ.",
  "feedback.wordIndex": "کلمه {number}",
  "feedback.extra": "اضافي",
  "feedback.missing": "وا نه اورېدل شوه",
  "feedback.review": "بیاکتنه",
  "feedback.allMatched": "په دې ثبت کې هره تمه شوې کلمه وپېژندل شوه.",
  "feedback.readAloudToggle": "نوې لارښوونه په لوړ غږ ولولئ",
  "feedback.tryAgain": "واورئ او بیا هڅه وکړئ",
  "feedback.acousticLabel": "د غږ کتنې",
  "feedback.acousticAvailable": "د باور پر کچه ولاړه د تمرین کتنه",
  "feedback.acousticAbstained": "غږیزې کتنې واورېدل، خو دومره باور یې نه درلود چې سمون وړاندیز کړي.",
  "feedback.acousticUnavailable": "ځانګړې غږیزه کتنه اوس شتون نه لري. ستاسو د کلمو کتنه بیا هم چمتو ده.",
  "feedback.acousticConfidence": "د غږ باور: {percent}%",
  "feedback.acousticPhoneme": "د غږ پام",
  "feedback.acousticVowelLength": "د حرکت د اوږدوالي پام",
  "feedback.acousticPause": "د درېدو پام",
  "feedback.acousticTajweed": "د قاعدې پام",
  "feedback.acousticBoundary": "دا یوازې د تمرین لارښوونه ده. تجوید، مخرج او شرعي سموالی باید وړ استاد تایید کړي.",

  // -- Memorise, side panel and the rest ------------------------------------
  "memorise.eyebrow": "په ارامۍ تکرار",
  "memorise.place": "آیت {number} له {total} څخه",
  "memorise.prompt": "په لوړ غږ ولولئ، بیا پرېږدئ چې د استاد دوره مو ځای وګوري.",
  "memorise.covered": "آیت پټ دی",
  "memorise.meaningHidden": "د ښه تمرکز لپاره مانا پټه ده.",
  "memorise.reveal": "آیت ښکاره کړئ",
  "memorise.cover": "آیت پټ کړئ",
  "memorise.toggleMeaning": "مانا ښکاره یا پټه کړئ",
  "memorise.practise": "په لوړ غږ تمرین",
  "memorise.practiseAyah": "آیت {number} تمرین کړئ",
  "panel.label": "د ټاکل شوي آیت جزئیات",
  "panel.keepPlace": "خپل ځای وساتئ",
  "panel.save": "خوندي کړئ",
  "panel.saved": "خوندي شو",
  "panel.audioPlaying": "د قاري غږ روان دی",
  "panel.listenRepeat": "واورئ او تکرار کړئ",
  "panel.reciterFallback": "قاري",
  "panel.ayahNumber": "آیت {number}",
  "panel.listenSelected": "ټاکل شوی آیت واورئ",
  "panel.playingReciter": "قاري غږیږي",
  "panel.audioNote": "د ریښتیني قاري غږ په بشپړ اواز. د ښه تمرین لپاره هدفون وکاروئ.",
  "panel.sequenceEyebrow": "د نن ترتیب",
  "panel.sequenceCopy": "آیت یو ځل واورئ، په خپل غږ یې تکرار کړئ، بیا په ارامۍ هغه یوه ځای ته راستون شئ چې تمرین غواړي.",
  "panel.thisReading": "دا لوستل",
  "panel.progressNote": "یو له پامه ډک تکرار هم ګټوره پرمختیا ده.",
  "dock.label": "د موبایل د لوستلو کړنې",
  "notFound.title": "پاڼه و نه موندل شوه",
  "notFound.copy": "بښنه غواړو، هغه پاڼه چې لټوئ یې شتون نه لري. کېدای شي لېږدول شوې یا ړنګه شوې وي.",
  "notFound.goHome": "کور ته لاړ شئ",
};

export const lessons: LocaleLessons = {
  letters: {
    alif: { articulation: "ستونی خلاص دی، هیڅ تنګوالی نشته. حرکت اخلي او خپل غږ نه ورزیاتوي.", tip: "خوله ارامه او غږ پاک وساتئ." },
    ba: { articulation: "دواړه شونډې سره لګیږي، بیا په سپک غږ سره خلاصیږي.", tip: "شونډې پاک خلاصې شي — وروسته پوکی نه وي." },
    ta: { articulation: "د ژبې څوکه د پورتنیو مخکینیو غاښونو بیخ ته رسیږي، بې غږه.", tip: "له ط څخه سپک او مخکې." },
    tha: { articulation: "د ژبې څوکه د پورتنیو غاښونو څنډه لمسوي او هوا پرې تېریږي.", tip: "نری او سپک غږ." },
    jeem: { articulation: "د ژبې منځ د خولې چت ته پورته کیږي او په غږ سره خوشې کیږي.", tip: "یوه شیبه یې ونیسئ؛ دا بیړنی غږ نه دی." },
    hha: { articulation: "د ستوني له منځه، یو پیاوړی بې غږه ساه پرته له خراش.", tip: "له ه څخه بېل، چې نرم او ښکته دی." },
    kha: { articulation: "د ستوني له پاسه، له خراش سره.", tip: "له ح څخه درنه او په څرګنده کرکېچنه." },
    dal: { articulation: "د ژبې څوکه د پورتنیو مخکینیو غاښونو بیخ ته رسیږي، په غږ سره.", tip: "د ت غږ لرونکی جوړه." },
    dhal: { articulation: "د ژبې څوکه د پورتنیو غاښونو څنډه لمسوي، په غږ سره.", tip: "د ث همغه ځای، خو په غږ سره." },
    ra: { articulation: "د ژبې څوکه د پورتنیو غاښونو شاته یو سپک ټک وهي.", tip: "یو سپک ټک، اوږده څرخېدنه نه." },
    zay: { articulation: "د ژبې څوکه د ښکتنیو غاښونو شاته وي؛ یو غږ لرونکی شپېلی تېریږي.", tip: "نری او سپک، درانه نه." },
    seen: { articulation: "یو نری بې غږه شپېلی، د ژبې څوکه د ښکتنیو غاښونو شاته.", tip: "خوله هواره وساتئ؛ ص یې درنه جوړه ده." },
    sheen: { articulation: "هوا د ژبې په پراخ مخ خپریږي او تېریږي.", tip: "له س څخه پراخ او نرم." },
    sad: { articulation: "د س همغه ځای، خو ژبه پورته او خوله ډکه.", tip: "درنه غږ؛ له س سره یې پرتله کړئ." },
    dad: { articulation: "د ژبې څنډه د پورتنیو ورخو غاښونو ته رسیږي او غږ درنه پاتې کیږي.", tip: "ځانګړی عربي حرف؛ له استاد یې واورئ او زده یې کړئ." },
    tta: { articulation: "د ت همغه ځای، خو ژبه پورته او غږ درنه.", tip: "د ت درنه جوړه." },
    zza: { articulation: "د ذ همغه ځای، خو ژبه پورته او غږ درنه.", tip: "د ذ درنه جوړه." },
    ayn: { articulation: "د ستوني له منځه، په غږ او خلاص.", tip: "له همزې څخه ژور او نرم." },
    ghayn: { articulation: "د ستوني له پاسه، په غږ سره.", tip: "د خ غږ لرونکې جوړه." },
    fa: { articulation: "ښکتنۍ شونډه پورتنیو غاښونو ته رسیږي او هوا تېریږي.", tip: "سپک او پاک." },
    qaf: { articulation: "د ژبې شا د ستوني نږدې پورته کیږي.", tip: "له ک څخه شاته او درنه." },
    kaf: { articulation: "د ژبې شا د خولې نرم چت ته رسیږي.", tip: "له ق څخه مخکې او سپک." },
    lam: { articulation: "د ژبې څوکه د پورتنیو غاښونو شاته لګیږي او هوا له څنډو تېریږي.", tip: "سپک، پرته له ځانګړو ځایونو د لفظ جلاله." },
    meem: { articulation: "دواړه شونډې تړل کیږي او غږ له پزې راوځي.", tip: "شونډې په نرمۍ تړلې وساتئ." },
    noon: { articulation: "د ژبې څوکه د پورتنیو غاښونو شاته لګیږي او غږ له پزې راوځي.", tip: "لکه م، خو شونډې خلاصې." },
    ha: { articulation: "د ستوني له ژورې، یوه نرمه ساه.", tip: "له ح څخه نری او نرم." },
    waw: { articulation: "شونډې ګردې کیږي، په غږ سره.", tip: "همدا حرف ضمه اوږدوي." },
    ya: { articulation: "د ژبې منځ چت ته پورته کیږي، په غږ سره.", tip: "همدا حرف کسره اوږدوي." },
  },
};


/**
 * Qaida course prose in Pashto, keyed by the curriculum's own ids. Text only:
 * order, prerequisites, Arabic examples, Quran references and answer
 * correctness stay in the curriculum. Every level is translated; a lesson added
 * to the curriculum appears here in English until its four strings are written,
 * and the coverage test reports it.
 */
export const qaida: QaidaTextPack = {
  lessons: {
    "letters-alif-ba-ta-tha": {
      title: "الف، با، تا، ثا",
      objective: "الف، با، تا او ثا د شکل او نوم له مخې وپېژنئ.",
      teaching: "لومړني څلور حروف. با، تا او ثا یو شکل لري او یوازې په ټکو کې توپیر لري: یو ښکته، دوه پاس، درې پاس. الف یوازې یوه نېغه ولاړه کرښه ده.",
    },
    "letters-jeem-hha-kha": {
      title: "جیم، حا، خا",
      objective: "جیم، حا او خا د شکل او نوم له مخې وپېژنئ.",
      teaching: "پر یوه شکل درې حروف. جیم دننه ټکی لري، حا ټکی نه لري، او خا پاس ټکی لري.",
    },
    "letters-dal-dhal": {
      title: "دال او ذال",
      objective: "دال او ذال د شکل او نوم له مخې وپېژنئ.",
      teaching: "یو شکل او د یوه ټکي توپیر. دال ساده دی؛ ذال پاس ټکی لري. هیڅ یو یې له ځان وروسته حرف سره نه نښلي.",
    },
    "letters-ra-zay": {
      title: "را او زې",
      objective: "را او زې د شکل او نوم له مخې وپېژنئ.",
      teaching: "یو شکل چې له کرښې ښکته ځي. را ساده ده، زې پاس ټکی لري. لکه دال، دا هم مخې ته نه نښلي.",
    },
    "letters-seen-sheen": {
      title: "سین او شین",
      objective: "سین او شین د شکل او نوم له مخې وپېژنئ.",
      teaching: "درې غاښونه او وروسته یوه پیاله. سین ساده دی؛ شین پاس درې ټکي لري.",
    },
    "letters-sad-dad": {
      title: "صاد او ضاد",
      objective: "صاد او ضاد د شکل او نوم له مخې وپېژنئ.",
      teaching: "یوه کړۍ او یوه پیاله. صاد ساده دی؛ ضاد پاس ټکی لري. دا د سین او دال درنې جوړې دي.",
    },
    "letters-tta-zza": {
      title: "طا او ظا",
      objective: "طا او ظا د شکل او نوم له مخې وپېژنئ.",
      teaching: "یوه کړۍ چې ولاړه کرښه پرې ده. طا ساده ده؛ ظا پاس ټکی لري. دواړه درانه دي او له هغه سپک تا څخه جلا لیکل کیږي چې په لومړي درس کې راغی.",
    },
    "letters-ayn-ghayn": {
      title: "عین او غین",
      objective: "عین او غین د شکل او نوم له مخې وپېژنئ.",
      teaching: "بیا هم یو شکل. عین ساده دی؛ غین پاس ټکی لري.",
    },
    "letters-fa-qaf": {
      title: "فا او قاف",
      objective: "فا او قاف د شکل او نوم له مخې وپېژنئ.",
      teaching: "فا پاس یو ټکی لري، قاف دوه. پیالې یې هم توپیر لري: د قاف پیاله له کرښې ښکته ځي.",
    },
    "letters-kaf-to-ya": {
      title: "له کاف تر یا",
      objective: "کاف، لام، میم، نون، ها، واو او یا د شکل او نوم له مخې وپېژنئ.",
      teaching: "د الفبا وروستي اوه حروف، هر یو خپل ځانګړی شکل لري.",
    },
    "letters-similar": {
      title: "هغه حروف چې په ټکو پېژندل کیږي",
      objective: "هغه حروف سره جلا کړئ چې یو تن لري او یوازې په ټکو کې توپیر لري.",
      teaching: "د عربي ډېری حروف خپل تن له یوه یا دوو نورو سره شریکوي. ټول توپیر په ټکو کې دی: لومړی تن ولولئ، بیا ټکي وشمېرئ او وګورئ چې پاس دي که ښکته.",
    },
    "letters-similar-shapes": {
      title: "نور حروف چې اسانه سره ګډیږي",
      objective: "درنې او سپکې جوړې، او هغه حروف سره جلا کړئ چې پیل کوونکی یې ډېر ځله یو د بل پر ځای لولي.",
      teaching: "دا جوړې په یوه ټکي، یوه کړۍ یا یوه کرښه سره توپیر لري. دوه یې — ه او ح، ک او ق — د دې وړ دي چې څنګ په څنګ وکتل شي، ځکه پیل کوونکی ډېر ځله یو د بل پر ځای لولي. پر مخ شکل ته وګورئ؛ خو دا چې هر حرف څنګه ویل کیږي، هغه له خپل استاد او له قاري څخه واورئ.",
      boundary: "دا پر مخ د شکلونو جلا کول دي. خو د هر حرف مخرج — چې د خولې له کوم ځایه راوځي — باید له وړ استاد څخه واورېدل شي؛ لیکلی تمرین یې نه ښیي او اپلیکیشن پرې پرېکړه نه کوي.",
    },
    "forms-four-positions": {
      title: "څلور ځایونه",
      objective: "یو حرف یوازې، په پیل، په منځ او په پای کې ولولئ.",
      teaching: "د حرف شکل د کلمې په منځ کې د هغه د ځای له مخې بدلیږي. با یوازې ب ده، په پیل کې بـ، په منځ کې ـبـ او په پای کې ـب. تن یې هر ځل همغه دی — یوازې د نښلولو کرښې بدلیږي.",
    },
    "forms-non-connectors": {
      title: "هغه حروف چې مخې ته نه نښلي",
      objective: "هغه شپږ حروف وپېژنئ چې هیڅکله له ځان وروسته حرف سره نه نښلي.",
      teaching: "شپږ حروف — ا د ذ ر ز و — له ځان مخکې حرف سره نښلي خو له ځان وروسته هیڅکله نه. کلمه پر هر یوه ماتیږي، او له همدې امله ځینې کلمې دوه کلمې ښکاري.",
    },
    "forms-joining-practice": {
      title: "د حروفو نښلول",
      objective: "لنډې نښلېدلې ترکیبونه ولولئ او وګورئ چې ماتوالی چیرې راځي.",
      teaching: "نښلېدلی ترکیب حرف په حرف له ښي څخه کیڼ ته ولولئ. چیرې چې نه نښلېدونکی حرف راشي، له هغه وروسته حرف نوی شکل پیلوي.",
    },
    "harakat-fatha": {
      title: "فتحه (زور)",
      objective: "هغه حرف ولولئ چې فتحه لري.",
      teaching: "فتحه د حرف پر سر یوه وړه کرښه ده. هغه ته د لنډ «اَ» غږ ورکوي: بَ «بَ» لوستل کیږي، تَ «تَ».",
    },
    "harakat-kasra": {
      title: "کسره (زېر)",
      objective: "هغه حرف ولولئ چې کسره لري.",
      teaching: "کسره همغه وړه کرښه ده چې د حرف لاندې لیکل کیږي. د لنډ «اِ» غږ ورکوي: بِ «بِ» لوستل کیږي.",
    },
    "harakat-damma": {
      title: "ضمه (پېښ)",
      objective: "هغه حرف ولولئ چې ضمه لري.",
      teaching: "ضمه د حرف پر سر یو وړوکی واو دی. د لنډ «اُ» غږ ورکوي: بُ «بُ» لوستل کیږي.",
    },
    "harakat-combinations": {
      title: "د دوو حروفو ترکیب",
      objective: "دوه حرکت لرونکي حروف سره ولولئ، بیا یوه لنډه قرآني کلمه چې یوازې لنډ حرکتونه لري.",
      teaching: "هر حرف د خپل حرکت سره ولولئ، بیا یې پرته له درېدو سره ونښلوئ: بَتَ «بَ-تَ» لوستل کیږي. کله چې دا جوړه اسانه شي، همدا لوستل یوه ریښتینې کلمه وړي — د سورت اخلاص «هُوَ» دوه حروف او دوه لنډ حرکتونه دي، بس.",
    },
    "tanween-three-marks": {
      title: "درې تنوینه",
      objective: "دوه زور، دوه زېر او دوه پېښ وپېژنئ.",
      teaching: "تنوین د کلمې په پای کې دوه ځله حرکت دی. دوه زور «ـاً» لوستل کیږي، دوه زېر «ـٍ» او دوه پېښ «ـٌ». دوه زور ډېر ځله پر هغه الف کېني چې په پای کې لیکل شوی وي.",
    },
    "tanween-reading": {
      title: "د هغو کلمو لوستل چې پر تنوین پای ته رسیږي",
      objective: "هغه قرآني کلمه ولولئ چې پر تنوین پای ته رسیږي.",
      teaching: "هغه کلمه چې پر تنوین پای ته رسیږي، کله چې تېر شئ، په دوه ځله حرکت لوستل کیږي. کلمه تر پایه ولولئ او له نښې مخکې مه درېږئ.",
    },
    "madd-long-vowels": {
      title: "درې اوږده حرکتونه (مد)",
      objective: "الف، واو او یا د مد په توګه وپېژنئ، کله چې له خپل حرکت وروسته راځي.",
      teaching: "لنډ حرکت هغه وخت اوږدیږي چې خپل حرف ورپسې راشي: فتحه له الف سره (بَا)، ضمه له واو سره (بُو)، کسره له یا سره (بِي). خوله همغه غږ اوږد ساتي.",
      boundary: "دا درس یوازې پر مخ د مد پېژندل دي. دا چې څومره یې ونیسئ او څنګه یې ادا کړئ، د وړ استاد او د قاري د ثبت کار دی؛ اپلیکیشن یې نه اندازه کوي.",
    },
    "madd-short-vs-long": {
      title: "لنډ او اوږد په پرتله کې",
      objective: "لنډ حرکت له خپلې اوږدې جوړې څخه په یوه کتنه جلا کړئ.",
      teaching: "بَ او بَا همغه حرف او همغه حرکت دی؛ الف هغه څه دی چې اوږد یې کوي. دواړه یو شان لوستل د پیل کوونکو تر ټولو عامه تېروتنه ده، او دا له غږیزې تېروتنې مخکې د لوستلو تېروتنه ده.",
      boundary: "اپلیکیشن یوازې دا ګوري چې پر مخ دواړه سره جلا کولی شئ. دا چې اوږد مو په سمه اندازه ونیو، د وړ استاد کار دی؛ اپلیکیشن یې نه اندازه کوي.",
    },
    "sukoon-basics": {
      title: "سکون",
      objective: "هغه حرف ولولئ چې سکون لري.",
      teaching: "سکون د حرف پر سر یوه وړه کړۍ ده. مانا یې دا ده چې حرف خپل حرکت نه لري: هغه غږ بندوي چې مخکې یې راغلی. بَبْ «بَب» لوستل کیږي.",
    },
    "sukoon-quran-words": {
      title: "سکون په قرآني کلمو کې",
      objective: "هغه لنډې قرآني کلمې ولولئ چې ساکن حرف لري.",
      teaching: "ډېری قرآني کلمې یو حرکت لرونکی حرف له ساکن حرف سره نښلوي. لومړی حرکت لرونکی حرف ولولئ، بیا یې پر ساکن حرف بند کړئ، پرته له دې چې خپل حرکت ورزیات کړئ.",
    },
    "shaddah-basics": {
      title: "شده",
      objective: "دوه چنده شوی حرف ولولئ.",
      teaching: "شده د حرف پر سر یوه وړه نښه ده، لکه ګرد «و». هغه حرف دوه چنده کوي: لومړی یې سکون لري او دویم حرکت، نو حرف نیول کیږي، نه دا چې دوه ځله ووایل شي. له همدې امله سکون مخکې راځي — شده یو ساکن حرف دی چې له حرکت لرونکي سره نښتی وي.",
    },
    "shaddah-quran-words": {
      title: "شده په قرآني کلمو کې",
      objective: "هغه قرآني کلمې ولولئ چې شده لري.",
      teaching: "شده په قرآن کې هرځای شته، او کلمه بدلوي: دوه چنده شوی حرف د یوه نیول شوي غږ په توګه ولولئ، نه د دوو جلا حروفو په توګه.",
    },
    "lam-sun-moon": {
      title: "شمسي او قمري حروف",
      objective: "«ال» د دواړو ډولونو حروفو مخکې سم ولولئ.",
      teaching: "له قمري حرف مخکې د «ال» لام لوستل کیږي او سکون لري: الْحَمْدُ. له شمسي حرف مخکې لام نه لوستل کیږي؛ پر ځای یې راتلونکی حرف دوه چنده کیږي او شده اخلي: الصِّرَاطَ. مصحف پخپله درته ښیي: پر لام سکون وګورئ، یا له هغه وروسته پر حرف شده.",
    },
    "lam-reading-practice": {
      title: "«ال» په متن کې لوستل",
      objective: "هغه کلمې ولولئ چې «ال» لري، پرته له دې چې ودرېږئ او فکر وکړئ کوم ډول حرف ورپسې دی.",
      teaching: "په تمرین سره شده او سکون پخپله کار کوي: هغه لولئ چې لیکل شوی دی. دا په وار سره په لوړ غږ ولولئ او وګورئ چې لام هر ځل څنګه چلند کوي.",
    },
    "hamzah-seats": {
      title: "همزه او د هغې کرسۍ",
      objective: "هغه همزه ولولئ چې پر الف، واو او یا لیکل کیږي.",
      teaching: "همزه خپل غږ لري، چې یا «ء» لیکل کیږي یا پر یوه کرسۍ کېني: أ او إ پر الف، ؤ پر واو، ئ پر یا. کرسۍ لیکدود دی، غږ نه — همزه پر ټولو یو شان لوستل کیږي.",
    },
    "hamzah-wasl": {
      title: "همزة الوصل",
      objective: "هغه الف وپېژنئ چې د پیل پر مهال لوستل کیږي او د دوام پر مهال ترې تېرېږي.",
      teaching: "د «ال» الف، او د اهْدِنَا په څېر کلمو الف، د وصل الف دی. که جمله پرې پیل کړئ، لوستل کیږي؛ که له مخکینۍ کلمې ورته دوام ورکړئ، ترې تېرېږئ او سیده راتلونکي حرف ته ځئ. ډېری مصحفونه یې «ٱ» لیکي، له یوې وړې ص په څېر نښې سره، چې ښیي ترې تېرېدل کیږي.",
    },
    "hamzah-orthography": {
      title: "درې لیکل شوي شکلونه: ى، ة او کوچنی الف",
      objective: "هغه درې لیکل شوي شکلونه ولولئ چې پیل کوونکی یې په مصحف کې تل ویني.",
      teaching: "درې شکلونه چې په کتلو یې وپېژنئ. «ى» د یا په څېر دی خو ټکي نه لري، او د کلمې په پای کې د اوږد «ا» په توګه لوستل کیږي — نوم یې الف مقصوره دی. «ة» یوه ها ده له دوو ټکو سره، چې تاء مربوطه بلل کیږي؛ کله چې راتلونکې کلمې ته دوام ورکړئ، «ت» یې ولولئ، او کله چې پرې ودرېږئ، «ه». کوچنی الف یو وړوکی الف دی چې د حرف پر سر لیکل کیږي: هلته اوږد «ا» ولولئ، که څه هم بشپړ الف نه دی لیکل شوی.",
    },
    "tajweed-qalqalah": {
      title: "د قلقلې حروف",
      objective: "پنځه د قلقلې حروف هغه وخت وپېژنئ چې سکون ولري.",
      teaching: "پنځه حروف — ق ط ب ج د، چې د «قطب جد» په بڼه یادیږي — کله چې سکون ولري یا پرې ودرېږئ، یوه وړه انګازه ورکوي. دا درس یوازې پر مخ د دوی پېژندل دي.",
      boundary: "د قلقلې د حرف پېژندل د لوستلو مهارت دی. دا چې ستاسو قلقله سمه ادا شوه که نه، د وړ استاد کار دی؛ اپلیکیشن یې له لیکل شوي متن څخه نه شي څېړلی.",
    },
    "tajweed-noon-sakinah": {
      title: "نون ساکنه او تنوین",
      objective: "ساکنه نون او تنوین وپېژنئ او پوه شئ چې ورپسې حرف ټاکي له څلورو حالتونو کوم یو کارول کیږي.",
      teaching: "ساکنه نون او تنوین د راتلونکي حرف له مخې په یو له څلورو ډولونو لوستل کیږي: اظهار (څرګند ویل)، ادغام (په راتلونکي حرف کې ننوتل)، اقلاب (میم ته اړول)، اخفا (د دواړو ترمنځ پټول). په دې کچه کې یوازې دا زده کوئ چې نون او تنوین پر مخ وپېژنئ او پوه شئ چې څلور حالتونه شته — دا چې کوم یو راځي او هر یو څنګه ویل کیږي، له استاد سره او د قاري په اورېدو زده کیږي.",
      boundary: "دا د هغه څه نومونه دي چې لیکل شوي دي. اپلیکیشن نه ارزوي چې ستاسو اخفا، ادغام یا غنه سمه ادا شوه که نه — دا یوازې وړ استاد، یا یوه ځانګړې غږیزه ارزونه ویلی شي.",
    },
    "tajweed-meem-ghunnah": {
      title: "میم ساکنه او غنه",
      objective: "ساکنه میم وپېژنئ، او هغه نښه چې ښیي نون یا میم په غنه سره نیول کیږي.",
      teaching: "ساکنه میم خپل درې حالتونه لري، او هره نون یا میم چې شده ولري، په غنه — یعنې د پزې په نرم غږ — لوستل کیږي. پر مخ شده ولټوئ.",
      boundary: "دا پر مخ پېژندل دي. دا چې غنه څومره نیول کیږي او څنګه باید واورېدل شي، له وړ استاد او د قاري له اورېدو راځي؛ اپلیکیشن یې نه اندازه کوي.",
    },
    "symbols-stop-marks": {
      title: "د وقف نښې",
      objective: "هغه وړې نښې وپېژنئ چې د کرښې پر سر لیکل کیږي او ښیي چې چیرې درېدلی شئ.",
      teaching: "مصحف د درېدو ځایونه په وړو حروفو نښه کوي: م لازم وقف، لا دلته مه درېږئ، ج درېدل روا دي، قلى درېدل غوره دي، صلى دوام غوره دی. دا د لوستلو مرسته ده، ځکه چې مانا ماته نه شي.",
      boundary: "دا نښې ښیي چې وقف چیرې روا یا غوره دی. دا چې د مانا لپاره چیرې ودرېږئ او بیا یې له کومه پیل کړئ، د وړ استاد په لارښوونه ده؛ اپلیکیشن نه ګوري چې چیرې ودرېدئ.",
    },
    "symbols-small-marks": {
      title: "په متن کې وړې نښې",
      objective: "هغه وړې نښې وپېژنئ چې د کلمو په دننه کې لیکل کیږي.",
      teaching: "له وقفي نښو پرته، مصحف په خپله کرښه کې هم وړې نښې لیکي: هغه کوچنی الف چې مخکې مو ولید، د اوږد «ا» لپاره چیرې چې الف نه وي لیکل شوی؛ د مد څپه یزه نښه «ٓ»، چې وایي دا اوږد حرکت له عادي څخه ډېر نیول کیږي؛ او د آیت شمېره چې د هر آیت په پای کې په خپله ګلۍ کې راځي.",
      boundary: "د یوې نښې پېژندل د لوستلو مهارت دی. دا چې مد څومره نیول کیږي، له وړ استاد سره ټاکل کیږي؛ اپلیکیشن یې نه اندازه کوي.",
    },
    "quran-words": {
      title: "قرآني کلمې",
      objective: "یوازینۍ قرآني کلمې ولولئ چې تر اوسه مو زده کړي هرڅه پکې کارول شوي.",
      teaching: "نږدې هرڅه چې مو زده کړي، په دې څلورو کلمو کې راځي: ساکن حرف، اوږد حرکت، شده، شمسي او قمري حرف، او کوچنی الف. هره یوه ورو ولولئ، بیا یې په یوه برابره چټکتیا بیا ولولئ.",
    },
    "quran-phrases": {
      title: "دوې کلمې سره یوځای",
      objective: "دوې قرآني کلمې په یوه ترکیب کې ولولئ، پرته له دې چې ترمنځ یې ودرېږئ.",
      teaching: "یوازینۍ کلمې سخته برخه ده؛ نښلول یې راتلونکی ګام دی. هره جوړه له سره تر پایه ولولئ، پرته له درېدو په منځ کې، بیا واورئ چې قاري همغه ترکیب څنګه لولي او ورسره ولاړ شئ.",
    },
    "quran-first-ayah": {
      title: "ستاسو لومړی آیت",
      objective: "له مصحف څخه یو بشپړ آیت ولولئ.",
      teaching: "هغه کلمې چې اوس مو ولوستې، یو آیت جوړوي. په تمرین برخه کې یې پرانیزئ: متن د اپلیکیشن له قرآني معلوماتو راځي، او لومړی یو وړ قاري ورته اورئ.",
    },
    "quran-short-ayat": {
      title: "لنډ آیتونه",
      objective: "څو لنډ آیتونه په ترتیب سره ولولئ.",
      teaching: "دا یو په بل پسې ولولئ، لومړی تر ټولو لنډ. هر یو دومره لنډ دی چې په یوه ساه کې ځای شي، او هر یو یوازې هغه حروف، حرکتونه او نښې لري چې اوس یې پېژنئ.",
    },
    "quran-short-surah": {
      title: "یو بشپړ سورت، ثبت شوی",
      objective: "یو بشپړ لنډ سورت پای ته ورسوئ، او هر آیت د کلمو د کتنې لپاره ثبت کړئ.",
      teaching: "د قاعدې وروستی ګام ستاسو د تلاوت د تمرین لومړی ګام دی. په تېر درس کې مو د سورت اخلاص لومړی آیت ولوست؛ دا درې یې بشپړوي. هر یو په تمرین برخه کې پرانیزئ، قاري واورئ، بیا خپل غږ ثبت کړئ. کتنه درته وایي کومې کلمې وپېژندل شوې او له کومه ځایه بیا پیل وکړئ — دا د لوستلو کتنه ده، د تلاوت پر ښکلا پرېکړه نه ده.",
      boundary: "ثبت شوې کتنه یوازې لیکل شوې کلمې له آیت سره پرتله کوي. تجوید، مخرج، د مد اوږدوالی یا غنه نه ارزوي.",
    },
  },
  exercises: promptsFromPhrasebook(QAIDA_LESSONS, {
    "Which of these is Thaa?":
      "له دې څخه کوم یو ثا دی؟",
    "Which of these is Haa?":
      "له دې څخه کوم یو حا دی؟",
    "Which of these is Dhaal?":
      "له دې څخه کوم یو ذال دی؟",
    "Which of these is Zaay?":
      "له دې څخه کوم یو زې دی؟",
    "Which of these is Seen?":
      "له دې څخه کوم یو سین دی؟",
    "Which of these is Daad?":
      "له دې څخه کوم یو ضاد دی؟",
    "Which of these is Zaa?":
      "له دې څخه کوم یو ظا دی؟",
    "Which of these is Ayn?":
      "له دې څخه کوم یو عین دی؟",
    "Which of these is Qaaf?":
      "له دې څخه کوم یو قاف دی؟",
    "Which of these is Haa (soft)?":
      "له دې څخه کوم یو نرمه ها ده؟",
    "Which of these is Kaaf?":
      "له دې څخه کوم یو کاف دی؟",
    "Which shows a fatha followed by alif?":
      "کوم یو فتحه ښیي چې الف ورپسې راځي؟",
    "Which shows a damma followed by waw?":
      "کوم یو ضمه ښیي چې واو ورپسې راځي؟",
    "Which of these is the long one?":
      "له دې څخه کوم یو اوږد دی؟",
    "Read this word from the Quran aloud, holding the long vowel.":
      "دا قرآني کلمه په لوړ غږ ولولئ او اوږد حرکت ونیسئ.",
    "What does this small circle above the letter mean?":
      "د حرف پر سر دا وړه کړۍ څه مانا لري؟",
    "How does this read?":
      "دا څنګه لوستل کیږي؟",
    "Read this word from the Quran aloud, closing the Laam without a vowel.":
      "دا قرآني کلمه په لوړ غږ ولولئ او لام پرته له حرکته بند کړئ.",
    "Read this one aloud — two sakin letters in the same word.":
      "دا یوه په لوړ غږ ولولئ — په یوه کلمه کې دوه ساکن حروف.",
    "In this word, which letter carries the sukoon?":
      "په دې کلمه کې کوم حرف سکون لري؟",
    "What does the shaddah tell you to do?":
      "شده تاسو ته څه وایي چې وکړئ؟",
    "Which shows a shaddah carrying kasra?":
      "کوم یو شده ښیي چې کسره لري؟",
    "Which of these words carries a shaddah?":
      "له دې کلمو څخه کومه یوه شده لري؟",
    "In الْحَمْدُ, is the Laam of ال read?":
      "په الْحَمْدُ کې، د «ال» لام لوستل کیږي؟",
    "In الصِّرَاطَ, why is there a shaddah on the Saad?":
      "په الصِّرَاطَ کې، ولې پر صاد شده ده؟",
    "Read this aloud — a sun letter, so the Laam merges into it.":
      "دا په لوړ غږ ولولئ — شمسي حرف دی، نو لام پکې ننوځي.",
    "Read this aloud — a moon letter, so the Laam is read with its sukoon.":
      "دا په لوړ غږ ولولئ — قمري حرف دی، نو لام له خپل سکون سره لوستل کیږي.",
    "Which one carries a kasra, with the hamzah written below the alif?":
      "کوم یو کسره لري، چې همزه یې د الف لاندې لیکل شوې؟",
    "In ئ, what is the hamzah sitting on?":
      "په ئ کې، همزه پر څه ناسته ده؟",
    "You are continuing from the previous word into ال. What happens to its alif?":
      "له مخکینۍ کلمې «ال» ته دوام ورکوئ. د هغې الف ته څه کیږي؟",
    "Start on this word and read it aloud, sounding the opening alif.":
      "پر همدې کلمه پیل وکړئ او په لوړ غږ یې ولولئ، د پیل الف ادا کړئ.",
    "How is ى at the end of a word read?":
      "د کلمې په پای کې «ى» څنګه لوستل کیږي؟",
    "What does a small alif printed above a letter tell you?":
      "د حرف پر سر لیکل شوی کوچنی الف څه ښیي؟",
    "You stop at the end of a word ending in ة. How is it read?":
      "پر هغه کلمه ودرېدئ چې پر «ة» پای ته رسیږي. څنګه لوستل کیږي؟",
    "Which of these is a qalqalah letter?":
      "له دې څخه کوم یو د قلقلې حرف دی؟",
    "Which of these words ends in a qalqalah letter, so it echoes when you stop on it?":
      "له دې کلمو څخه کومه یوه پر قلقلې حرف پای ته رسیږي، نو کله چې پرې ودرېږئ انګازه کوي؟",
    "Which of these carries a Noon with sukoon?":
      "له دې څخه کوم یو ساکنه نون لري؟",
    "Tanween follows the same four cases as a sakin Noon. Which of these carries tanween?":
      "تنوین هم د ساکنې نون په څېر همغه څلور حالتونه لري. له دې څخه کوم یو تنوین لري؟",
    "Which of these is read with ghunnah?":
      "له دې څخه کوم یو په غنه لوستل کیږي؟",
    "Which mark on a Noon or a Meem tells you the reader holds a ghunnah there?":
      "پر نون یا میم کومه نښه ښیي چې لوستونکی هلته غنه نیسي؟",
    "What does لا above the line mean?":
      "د کرښې پر سر «لا» څه مانا لري؟",
    "What does م above the line mean?":
      "د کرښې پر سر «م» څه مانا لري؟",
    "What does قلى tell the reader?":
      "«قلى» لوستونکي ته څه وایي؟",
    "What is the decorated circle at the end of an ayah?":
      "د آیت په پای کې ښکلې کړۍ څه ده؟",
    "What does the wavy madd sign above a letter tell the reader?":
      "د حرف پر سر د مد څپه یزه نښه لوستونکي ته څه وایي؟",
    "Read this word aloud.":
      "دا کلمه په لوړ غږ ولولئ.",
    "Read this word aloud — a sun letter and a long vowel.":
      "دا کلمه په لوړ غږ ولولئ — یو شمسي حرف او یو اوږد حرکت.",
    "Read these two words as one phrase.":
      "دا دوې کلمې د یوه ترکیب په توګه ولولئ.",
    "Read this phrase — a sun letter, then a held Laam.":
      "دا ترکیب ولولئ — یو شمسي حرف، بیا نیول شوی لام.",
    "Listen to the reciter, then read this ayah aloud.":
      "قاري واورئ، بیا دا آیت په لوړ غږ ولولئ.",
    "Start with the shortest — one word. Listen, then read it aloud.":
      "له تر ټولو لنډ پیل وکړئ — یوه کلمه. واورئ، بیا یې په لوړ غږ ولولئ.",
    "Now four words, all of them familiar by this point.":
      "اوس څلور کلمې، چې تر دې ځایه مو ټولې پېژندلې دي.",
    "And the ayah your phrases came from.":
      "او هغه آیت چې ستاسو ترکیبونه ترې راغلي.",
    "You have read the first ayah of al-Ikhlas. Carry on: listen, then record the second.":
      "د سورت اخلاص لومړی آیت مو ولوست. دوام ورکړئ: واورئ، بیا دویم ثبت کړئ.",
    "The third ayah.":
      "درېیم آیت.",
    "And the fourth, which completes the surah.":
      "او څلورم، چې سورت بشپړوي.",
    "Which letter is this?": "دا کوم حرف دی؟",
    "Play the recording, then choose the letter you heard.": "ثبت وغږوئ، بیا هغه حرف وټاکئ چې واورېد.",
    "Which two letters make this combination?": "دا ترکیب له کومو دوو حروفو جوړ دی؟",
    "How does this combination read?": "دا ترکیب څنګه لوستل کیږي؟",
    "Read this Quranic word aloud, then continue.": "دا قرآني کلمه په لوړ غږ ولولئ، بیا دوام ورکړئ.",
    "Read this teaching combination aloud, then continue.": "دا زده کړیز ترکیب په لوړ غږ ولولئ، بیا دوام ورکړئ.",
    "Read this aloud, then continue.": "دا په لوړ غږ ولولئ، بیا دوام ورکړئ.",
    "Which is Baa at the beginning of a word?": "کوم یو د کلمې په پیل کې با دی؟",
    "Which is Noon in the middle of a word?": "کوم یو د کلمې په منځ کې نون دی؟",
    "Which is Meem at the end of a word?": "کوم یو د کلمې په پای کې میم دی؟",
    "Which of these does not join to the letter after it?": "له دې څخه کوم یو له ځان وروسته حرف سره نه نښلي؟",
    "Which of these does join forward?": "له دې څخه کوم یو مخې ته نښلي؟",
    "Which one reads 'ba'?": "کوم یو «بَ» لوستل کیږي؟",
    "Which one reads 'bi'?": "کوم یو «بِ» لوستل کیږي؟",
    "Which one reads 'bu'?": "کوم یو «بُ» لوستل کیږي؟",
    "Which one reads 'nu'?": "کوم یو «نُ» لوستل کیږي؟",
    "Which one reads 'bun'?": "کوم یو «بٌ» لوستل کیږي؟",
    "What is the mark above this letter called?": "د دې حرف پر سر د نښې نوم څه دی؟",
    "Where is a kasra written?": "کسره چیرې لیکل کیږي؟",
    "What is this ending called?": "د دې پای نوم څه دی؟",
    "Which ending does this word carry?": "دا کلمه کوم پای لري؟",
  }, {
    "Listen to the reciter's recording for how the echo sounds. This exercise only asks you to spot the letter.":
      "دا چې انګازه څنګه اوریدل کیږي، د قاري له ثبت څخه یې واورئ. دا تمرین یوازې دا غواړي چې حرف وپېژنئ.",
    "Which of the four cases applies, and how each one sounds, is learned with a teacher and by listening to the reciter.":
      "دا چې له څلورو حالتونو کوم یو راځي او هر یو څنګه اوریدل کیږي، له استاد سره او د قاري په اورېدو زده کیږي.",
    "How much longer is settled by the way you were taught to recite, with a qualified teacher. The sign only tells you that it is longer.":
      "دا چې څومره اوږد نیول کیږي، ستاسو د تلاوت له طریقې او له وړ استاد سره ټاکل کیږي. نښه یوازې دومره وایي چې اوږد دی.",
    "The recording is a qualified reciter's, played as a reference. The app is not listening to you here.":
      "ثبت د یوه وړ قاري دی، یوازې د لارښوونې لپاره غږول کیږي. اپلیکیشن دلته تاسو ته غوږ نه نیسي.",
  }),
};

export default { manifest, strings, lessons, qaida };
