/**
 * Arabic — complete pack.
 *
 * Everything a learner reads is in Arabic: the interface, the teacher's
 * instructions, the study controls, all 28 articulation notes, the coaching
 * plans, and the whole Qaida course prose — every lesson and every exercise
 * prompt. Nothing falls back to English, and a coverage test fails the day
 * something does.
 *
 * The teaching text uses the terminology a qaida uses — السكون، الشدة،
 * التنوين، القلقلة، الغنة — and explains each where its lesson introduces it.
 * Nothing here is a religious ruling; the boundary notes say who confirms
 * what.
 *
 * The Quran itself is untouched by this file. Its Arabic text, the ayah
 * recitations and the letter recordings are shared by every language, and no
 * pack may restate them.
 *
 * NOT YET REVIEWED BY A NATIVE SPEAKER. The strings below were written with
 * care but have not been read by an Arabic speaker; `nativeReviewed: false` in
 * shared/languages.ts records that. Religious terms are kept in their standard
 * Arabic form rather than paraphrased.
 */
import type { LocaleLessons, LocaleManifest } from "../types";
import type { TranslatableStrings } from "../index";
import { QAIDA_LESSONS } from "../../shared/qaidaCurriculum";
import { promptsFromPhrasebook, type QaidaTextPack } from "../../shared/qaidaText";
import { SUPPORTED_LANGUAGES } from "../../shared/languages";

export const manifest: LocaleManifest = { ...SUPPORTED_LANGUAGES.ar };

export const strings: TranslatableStrings = {
  "now.label": "ماذا تفعل الآن",
  "now.place": "الآية {ayah} من {total}",
  "now.placeWord": "الكلمة {number}",
  "now.listening": "أستمع…",
  "now.reviewing": "أراجع ما قرأت…",
  "now.recordAgain": "لم أتمكن من فحص هذا التسجيل",
  "now.unclear": "لم يكن هذا واضحًا بما يكفي للتحقق",
  "now.repeatWord": "أعد الكلمة {number}",
  "now.repeatWordAgain": "هذه الكلمة مرة أخرى — الكلمة {number}",
  "now.repeatWordSound": "استمع جيدًا إلى الكلمة {number} ثم أعدها",
  "now.repeatAyah": "أعد الآية {number}",
  "now.continueFromWord": "تابع من الكلمة {number}",
  "now.nextAyah": "تمت الآية — انتقل إلى الآية {number}",
  "now.surahComplete": "وصلت إلى نهاية هذه السورة",
  "now.reviewToday": "راجع هذه الآية اليوم",
  "now.listenFirst": "استمع ثم اقرأ الآية",
  "now.repeat": "أعد",
  "now.tryAgain": "حاول مرة أخرى",
  "now.goToAyah": "انتقل إلى الآية {number}",
  "now.stepsLabel": "كيف تتدرب على هذا",

  "correction.label": "الكلمة التي تحتاج مراجعة",
  "correction.notHeard": "لم تُسمع هذه الكلمة.",
  "correction.different": "سُمع شيء آخر مكانها.",
  "correction.sound": "الكلمات صحيحة. استمع جيدًا إلى نطق هذه الكلمة.",
  "correction.unsure": "لم يكن هذا واضحًا بما يكفي للتأكد.",
  "correction.listen": "استمع إلى الآية ببطء",
  "correction.retry": "استمع، ثم أعد الكلمة، ثم اقرأ الآية كاملة.",
  "correction.wordAt": "الكلمة {number}",

  "step.showWord": "انظر إلى الكلمة",
  "step.listen": "استمع",
  "step.repeatWord": "أعد الكلمة",
  "step.reciteAyah": "اقرأ الآية",
  "step.recordAgain": "سجّل مرة أخرى",

  "study.hearReciter": "استمع إلى القارئ",
  "study.reciterPlaying": "القارئ يقرأ الآن",
  "study.record": "سجّل قراءتي",
  "study.stopRecording": "أوقف وراجع",
  "study.reviewing": "جارٍ الفحص…",
  "study.listenSlowly": "استمع ببطء",
  "study.previous": "السابق",
  "study.next": "التالي",
  "study.ayah": "الآية",
  "recorder.intro": "استمع إلى القارئ، ثم سجّل قراءتك.",
  "recorder.listening": "أستمع الآن. اقرأ الآية بتمهل، ثم اضغط أوقف وراجع.",
  "recorder.reviewing": "أراجع الكلمات التي قرأتها…",
  "recorder.reviewReady": "مراجعة الكلمات جاهزة. استمع إلى القارئ ثم أعد الموضع المحدد.",
  "recorder.retryNow": "سجّل مرة أخرى",

  "mode.read": "اقرأ",
  "mode.learn": "تعلّم",
  "mode.study": "تدرّب",
  "mode.memorise": "احفظ",
  "dock.read": "اقرأ",
  "dock.practise": "تدرّب",
  "dock.recall": "استذكر",
  "notes.summary": "ملاحظات المعلم",
  "language.label": "لغة الواجهة",

  "mastery.new": "جديدة",
  "mastery.learning": "قيد التعلّم",
  "mastery.needs_review": "تحتاج مراجعة",
  "mastery.strong": "قوية",
  "mastery.mastered": "متقنة",

  "course.continue": "تابع",
  "course.tryAgain": "حاول مرة أخرى",
  "course.readAloud": "قرأتها بصوت مرتفع",
  "course.completedBadge": "مكتمل",
  "course.locked": "أكمل الدروس السابقة أولًا",

  // -- Supporting interface -------------------------------------------------
  "nav.sectionLabel": "موضعك",
  "nav.today": "اليوم",
  "nav.library": "مكتبتي",
  "nav.bookmarks": "المحفوظات",
  "nav.practiceTitle": "تدريب اليوم",
  "nav.practiceCopy": "استمع، أعد، ثم ارجع.",
  "nav.minutesShort": "دقيقة",
  "language.partial": "الواجهة فقط",
  "language.aiDrafted": "مسودة بالذكاء الاصطناعي، لم يراجعها ناطق باللغة",
  "language.hint": "النص العربي والتلاوة لا يتغيران مع تغيّر اللغة.",
  "mode.label": "طريقة القراءة",
  "mode.readCaption": "اتبع الصفحة",
  "mode.learnCaption": "من الحروف إلى التلاوة",
  "mode.studyCaption": "تدرّب مع المعلم",
  "mode.memoriseCaption": "اخفِ، تذكّر، راجع",
  "study.ayahOf": "من {total}",
  "study.lessonLabel": "درس التلاوة",
  "study.eyebrow": "تلاوة موجَّهة",
  "study.heading": "استمع. أعد. راجع.",
  "study.badge": "حلقة المعلم",
  "study.stageListen": "استمع",
  "study.stageRepeat": "دورك",
  "study.stageReview": "مراجعة",
  "study.chooseAyah": "اختر الآية {number}",
  "playback.previous": "الآية السابقة",
  "playback.next": "التالية",
  "playback.listen": "استمع",
  "playback.pause": "إيقاف مؤقت",
  "playback.place": "الآية {number} من {total}",
  "playback.keepPlaying": "استمر في التشغيل",

  // -- Teacher notes --------------------------------------------------------
  "notes.observedLabel": "ما أظهرته هذه المحاولة",
  "notes.observedMissing": "الكلمة {number} لم تُسمع.",
  "notes.observedReview": "الكلمة {number} جاءت بشكل مختلف.",
  "notes.observedRecurring": "الكلمة {number} احتاجت عملًا من قبل.",
  "notes.observedExtra": "سُمعت {count} كلمة زائدة.",
  "notes.observedAcoustic": "هناك ملاحظة صوتية حول الكلمة {number}.",
  "notes.observedBoundary": "هذه ملاحظات، لا حكم على تلاوتك. أما ما تفعله فهو التوجيه الواحد في الأعلى.",
  "notes.hint": "نتيجتك، وتاريخك مع هذه الآية، وخطة التدريب.",
  "notes.placeLabel": "أين أنت",
  "notes.whyLabel": "لماذا",

  // -- Memorisation and review ---------------------------------------------
  "memory.eyebrow": "هذه الآية حتى الآن",
  "memory.reviewToday": "المراجعة مستحقة اليوم.",
  "memory.nextReview": "المراجعة القادمة: {date}.",
  "memory.none": "اقرأ هذه الآية مرة لتبدأ جدولة المراجعة.",
  "memory.repeatedOmission": "الكلمة {number} كثيرًا ما تُترك هنا.",
  "memory.repeatedSubstitution": "الكلمة {number} تحتاج مراجعة متكررة.",
  "memory.streak": "{count} مراجعات متتالية بلا خطأ",
  "memory.overview": "{due} اليوم · {weak} تحتاج مراجعة · {strong} قوية",
  "memory.practiceNext": "التدريب التالي",
  "memory.nextIs": "سورة {surah}، الآية {ayah}",
  "memory.startNew": "ابدأ آية جديدة",

  // -- Where you are (secondary detail) -------------------------------------
  "follow.label": "أين أنت",
  "follow.eyebrow": "موضعك",
  "follow.ayah": "الآية {number}",
  "follow.stateFollowing": "تابع",
  "follow.stateCorrecting": "حاول مرة أخرى",
  "follow.stateUncertain": "غير مؤكد",
  "follow.stateCompleted": "مكتملة",
  "follow.continueAt": "تابع من الكلمة {number}.",
  "follow.surahComplete": "وصلت إلى نهاية هذه السورة.",
  "follow.correctionFocus": "ارجع إلى الكلمة {number} أولًا:",
  "follow.moveToAyah": "تابع مع الآية {number}",
  "follow.stayOnAyah": "اقرأ الآية {number} مرة أخرى",
  "follow.reasonNoTranscript": "لم يُسمع شيء صالح، فبقي موضعك كما هو.",
  "follow.reasonTooLittleEvidence": "لم يُتعرَّف على قدر كافٍ من هذه الآية لتحريك موضعك.",
  "follow.reasonNoisyTranscript": "حمل التسجيل كلمات كثيرة ليست من هذه الآية، فبقي موضعك كما هو. حاول في مكان أهدأ.",
  "follow.reasonPreviousAyah": "هذا يطابق الآية السابقة، فأُبقي موضعك على هذه الآية.",
  "follow.reasonNextAyahEarly": "هذا بداية الآية التالية. أتمّ هذه أولًا.",
  "follow.reasonPartialProgress": "تُعرِّف على جزء من الآية. تابع من الكلمة أدناه.",
  "follow.reasonMistakeToCorrect": "تجاوزت الآية كلمة لم تطابق. ارجع إلى الكلمة أدناه.",
  "follow.reasonAyahCompleted": "قُرئت هذه الآية إلى آخرها.",
  "follow.reasonSurahCompleted": "كانت تلك آخر آية في هذه السورة.",
  "follow.boundary": "يُحفظ موضعك من الكلمات المتعرَّف عليها في النص المكتوب. وهو لا يقول شيئًا عن التجويد أو المخارج أو المد أو اللحن أو الإيقاع.",

  // -- Recorder -------------------------------------------------------------
  "recorder.listenSlow": "استمع ببطء. تنبّه لكل كلمة، ثم أعدها.",
  "recorder.listenOnce": "استمع مرة كاملة. وحين تستعد، جاء دورك.",
  "recorder.audioFailed": "لم يبدأ الصوت. تحقّق من مستوى صوت جهازك، ثم حاول مرة أخرى.",
  "recorder.retry": "ابدأ بالاستماع مرة أخرى، ثم أعد الآية بصوتك.",

  // -- Shell, reader and playback -------------------------------------------
  "app.tagline": "خطة القراءة",
  "nav.primaryLabel": "التنقل الرئيسي",
  "reader.eyebrow": "القرآن",
  "reader.surahLabel": "السورة",
  "reader.juzLabel": "الجزء",
  "reader.juzNumbered": "الجزء {number}",
  "reader.reciterLabel": "القارئ",
  "reader.translationLabel": "الترجمة",
  "reader.loadingTranslations": "جارٍ تحميل الترجمات…",
  "reader.surahSearch": "ابحث في السور…",
  "reader.surahNoMatch": "لا توجد سورة تطابق ذلك.",
  "reader.translationUnavailable": "تعذّر عرض قائمة الترجمات. تُعرض الترجمة الإنجليزية الافتراضية.",
  "reader.searchLabel": "البحث في القرآن",
  "reader.settingsLabel": "إعدادات القراءة",
  "reader.loadingSurahs": "جارٍ تحميل السور…",
  "reader.loadingJuz": "جارٍ تحميل الأجزاء…",
  "reader.loadingReciters": "جارٍ تحميل القراء…",
  "reader.noReciters": "لا يتوفر صوت لأي قارئ",
  "reader.reciterUnavailable": "{reciter} (الصوت غير متوفر)",
  "reader.makki": "مكية",
  "reader.madani": "مدنية",
  "reader.ayahCount": "{count} آية",
  "reader.versesLabel": "آيات سورة {surah}",
  "reader.footerHint": "اضغط على آية، ثم انتقل إلى التدريب لسماعها وترديدها.",
  "reader.showMeaning": "إظهار المعنى",
  "reader.hideMeaning": "إخفاء المعنى",
  "reader.previousAyah": "الآية السابقة",
  "reader.nextAyah": "الآية التالية",
  "reader.chapterCopy": "اقرأ الآية، واسمعها من قارئ، ثم رددها بصوتك، ثم ارجع في هدوء إلى الموضع الذي يحتاج تدريبًا.",
  "reader.loading": "جارٍ التحميل…",
  "playback.label": "تشغيل الآية",
  "playback.noAudio": "لا يوجد تسجيل لهذه الآية عند هذا القارئ. اختر قارئًا آخر.",
  "playback.audioFailed": "صوت {reciter} غير متوفر. تعذّر تشغيل هذا التسجيل — اختر قارئًا آخر.",
  "content.loading": "جارٍ تحميل نص القرآن والتلاوة…",
  "content.retry": "حاول مرة أخرى",

  // -- Learn: levels and the qaida overview ---------------------------------
  "learn.heading": "طريقك في تعلّم القرآن",
  "learn.eyebrow": "تعلّم على مستواك",
  "learn.copy": "ابدأ بالحروف وأشكال الاتصال، ثم انتقل إلى أحكام التلاوة مع معلم مؤهل.",
  "learn.paceEyebrow": "اختر إيقاعك",
  "learn.paceHeading": "من أول الحروف إلى تلاوة متأنية.",
  "learn.levelsLabel": "مستويات التعلّم",
  "learn.percentComplete": "{percent}% مكتمل",
  "learn.level.qaida": "القاعدة",
  "learn.level.qaidaSummary": "الحروف العربية ومخارجها والحركات القصيرة وأشكال الاتصال.",
  "learn.level.qaidaCue": "الحروف والاتصال",
  "learn.level.tajweed": "التجويد",
  "learn.level.tajweedSummary": "أحكام التلاوة — المد والغنة والوقف — تُتدرَّب بعناية.",
  "learn.level.tajweedCue": "أحكام التلاوة",
  "qaida.eyebrow": "القاعدة · الدرس الأول",
  "qaida.heading": "الحروف قبل الكلمات.",
  "qaida.copy": "تعلّم حرفًا واحدًا في كل مرة، واسمع صوته، ثم تدرّب عليه مع معلمك.",
  "qaida.practisedCount": "مُتدرَّب عليه · {percent}%",
  "qaida.alphabetLabel": "الحروف العربية",
  "qaida.writtenAs": "يُكتب {transliteration} · {sound}",
  "qaida.playLetter": "الحرف",
  "qaida.playLetterLabel": "شغّل {letter} وحده",
  "qaida.playHarakatLabel": "شغّل {letter} مع {harakat}",
  "qaida.markPractised": "علّمه كمُتدرَّب عليه",
  "qaida.practised": "مُتدرَّب عليه",
  "qaida.nextLetter": "الحرف التالي",
  "qaida.audioIdle": "اختر الحرف وحده أو مع حركة لتسمع القارئ.",
  "qaida.audioPlaying": "يُشغَّل تسجيل القارئ.",
  "qaida.audioUnavailable": "لم يُضَف هذا التسجيل بعد. صوت التلاوة يسجّله قارئ مؤهل — ولن يقرأ التطبيق العربية بصوت إنجليزي مركّب.",
  "qaida.audioAttribution": "صوت الحروف من إنتاج {source}، إلى أن تحل محله تسجيلات قارئ.",
  "qaida.audioIdlePlaceholder": "اختر الحرف وحده أو مع حركة لتسمعه. هذا الصوت مركّب، وليس صوت قارئ.",
  "qaida.audioPlayingPlaceholder": "يُشغَّل صوت مركّب، لا تسجيل قارئ.",
  "qaida.audioUnavailablePlaceholder": "لم يُنتَج هذا المقطع بعد. ولن يقرأ التطبيق العربية مكانه بصوت إنجليزي مركّب — فالإنجليزية لا تنطق عدة أصوات منها أصلًا.",
  "qaida.audioFormUnavailable": "هذه المجموعة تغطي الحروف وحدها. أما الأشكال المتحركة فتأتي مع مجموعة القارئ — ولن يضع التطبيق صوتًا آخر مكانها.",
  "qaida.quickCheck": "تحقّق سريع",
  "qaida.quickCheckPrompt": "ما هذا الحرف؟",
  "qaida.quickCheckCorrect": "صحيح. ويمكنك تعليم هذا الحرف كمُتدرَّب عليه بعد أن تنطقه مع معلمك.",
  "qaida.quickCheckRetry": "ليس بعد. انظر إلى شكل الحرف، وشغّله مرة أخرى، ثم حاول من جديد.",
  "qaida.boundary": "أصوات الحروف المفردة لا تُقيَّم آليًا. يمكن للذكاء الاصطناعي أن ينظّم تدريبك، لكن النطق والمخرج يؤكدهما معلم مؤهل.",
  "harakat.fatha": "الفتحة",
  "harakat.fathaHint": "أَ قصيرة",
  "harakat.kasra": "الكسرة",
  "harakat.kasraHint": "إِ قصيرة",
  "harakat.damma": "الضمة",
  "harakat.dammaHint": "أُ قصيرة",
  "qaida.openFirstAyah": "افتح تدريب الآية الأولى",
  "tajweed.eyebrow": "مسار التجويد",
  "tajweed.heading": "أحكام التلاوة، رجعة واعية في كل مرة.",
  "tajweed.copy": "استمع إلى قارئ مؤهل، ثم ردّد، ثم راجع الكلمات التي التقطها تسجيلك، وارجع إلى معلمك لتصحيح التجويد.",
  "tajweed.principleAudio": "صوت قارئ حقيقي",
  "tajweed.principleReview": "مراجعة الكلمات بالذكاء الاصطناعي",
  "tajweed.principleTeacher": "تجويد يؤكده المعلم",
  "tajweed.begin": "ابدأ التلاوة الموجَّهة",
  "study.stageLabel": "المرحلة الحالية: {stage}",

  // -- The Qaida course chrome ----------------------------------------------
  "course.eyebrow": "دورة القاعدة",
  "course.levelLabel": "المستوى {order} — {title}",
  "course.percentComplete": "{percent}% من الدورة",
  "course.levelsLabel": "مستويات الدورة",
  "course.levelProgress": "{done} / {total} درسًا",
  "course.lessonPosition": "الدرس {number} من {total}",
  "course.stagesLabel": "كيف يسير هذا الدرس",
  "course.stageLearn": "تعلّم",
  "course.stageListen": "استماع",
  "course.stageRecognize": "تمييز",
  "course.stageRepeat": "ترديد",
  "course.stageRead": "قراءة",
  "course.stageCheck": "تحقّق",
  "course.stageComplete": "إتمام",
  "course.examplesLabel": "أمثلة",
  "course.teachingSummary": "ما يعلّمه هذا الدرس",
  "course.quranBadge": "القرآن {reference}",
  "course.teachingBadge": "مثال تعليمي",
  "course.exerciseLabel": "تدريب",
  "course.exerciseProgress": "السؤال {number} من {total}",
  "course.playAudio": "شغّل النموذج",
  "course.audioUnavailable": "لا يتوفر بعد تسجيل نموذجي لهذا الشكل.",
  "course.correct": "صحيح.",
  "course.retry": "ليس تمامًا. انظر مرة أخرى، ثم حاول من جديد.",
  "course.letterReference": "قائمة الحروف",
  "course.letterReferenceHint": "الحروف الثمانية والعشرون كلها، ولكل حرف تسجيل قارئ.",
  "course.openInStudy": "افتح {reference} في التدريب",
  "course.lessonComplete": "اكتمل الدرس.",
  "course.nextLesson": "التالي: {title}",
  "course.finishCourse": "أنهِ الدورة",
  "course.practiseAgain": "تدرّب على هذا الدرس مرة أخرى",
  "course.courseComplete": "هذه هي القاعدة كاملة. واصل في وضع التدريب، حيث يقرأ القارئ أولًا ثم يُراجَع تسجيلك كلمة كلمة.",
  "course.lessonListLabel": "دروس هذا المستوى",
  "course.reviewLesson": "مراجعة",

  // -- Recorder, live guidance and the practice plan ------------------------
  "recorder.noLiveGuide": "التسجيل متاح. أما التوجيه المباشر للكلمات فيعمل في المتصفحات التي تدعم التعرّف على الكلام العربي؛ وتسجيلك سيُراجَع على أي حال بعد التوقف.",
  "recorder.liveGuidePaused": "توقّف التوجيه المباشر، لكن التسجيل سيحصل على مراجعة الكلمات بعد أن تتوقف.",
  "recorder.reviewFailed": "تعذّرت مراجعة التسجيل. جرّب مقطعًا أقصر من فضلك.",
  "recorder.empty": "لم يُلتقط أي صوت. تحقّق من إذن الميكروفون، ثم سجّل الآية من جديد.",
  "recorder.tooLarge": "حجم هذا التسجيل {size} MB، وهو فوق حد {limit} MB، فلم يُرسل للمراجعة. سجّل آية واحدة بإيقاع هادئ ثم حاول مرة أخرى.",
  "recorder.noRecorder": "هذا المتصفح لا يستطيع تسجيل الصوت. استخدم متصفحًا حديثًا واسمح بالوصول إلى الميكروفون.",
  "recorder.noMicrophone": "لم يُمنح إذن الميكروفون. اسمح به في إعدادات المتصفح، ثم حاول مرة أخرى.",
  "live.guideTitle": "الدليل المباشر للكلمات",
  "live.heardTitle": "ما سمعه متصفحك",
  "live.source": "التعرّف على الكلام في جهازك",
  "live.waiting": "في انتظار صوتك",
  "coach.contextLabel": "خطة تدريب موجَّهة بالذكاء الاصطناعي",
  "coach.contextEyebrow": "خطة التدريب",
  "coach.practiceLoopLabel": "دورة التدريب",
  "coach.reviewPlanLabel": "خطة التدريب المستخدمة في هذه المراجعة",
  "coach.reviewPlanEyebrow": "مدرّب التدريب بالذكاء الاصطناعي",

  // -- The coaching plan, by learning level ---------------------------------
  "plan.qaida.title": "القاعدة",
  "plan.qaida.focus": "الحروف ومخارجها والحركات القصيرة وأشكال الاتصال",
  "plan.qaida.lessonGoal": "ثبّت معرفة الحروف وعادة الاستماع ثم الترديد، ثم صِل الحروف في الكلمات.",
  "plan.qaida.boundary": "نطق الحروف المفردة ومخارجها يؤكدهما معلم مؤهل.",
  "plan.qaida.loopListen": "استمع",
  "plan.qaida.loopIdentify": "ميّز",
  "plan.qaida.loopJoin": "صِل",
  "plan.qaida.loopRepeat": "ردّد",
  "plan.qaida.loopReview": "راجع",
  "plan.tajweed.title": "التجويد",
  "plan.tajweed.focus": "أحكام التلاوة — المد والغنة والوقف — بتوجيه من معلم",
  "plan.tajweed.lessonGoal": "اقرأ بترديد متأنٍّ، وحدّد الموضع الذي يحتاج تدريبًا تحت إشراف معلم.",
  "plan.tajweed.boundary": "التجويد والمخارج والمد والوقف واللحن وصحة ما يتعلق بالدين لا يؤكدها إلا معلم مؤهل.",
  "plan.tajweed.loopRecall": "استرجع",
  "plan.tajweed.loopRecord": "سجّل",
  "plan.tajweed.loopLocate": "حدّد موضع الرجوع",
  "plan.tajweed.loopTeacher": "ردّد مع معلم",

  // -- Review feedback ------------------------------------------------------
  "feedback.available": "الكلمات المتعرَّف عليها",
  "feedback.unavailable": "تعذّرت المراجعة",
  "feedback.matched": "من هذه الآية تُعرِّف عليه",
  "feedback.notRecognised": "لم تتعرّف الخدمة على كلمات عربية",
  "feedback.coachEyebrow": "المدرّب الصوتي بالذكاء الاصطناعي",
  "feedback.coachCopy": "استمع إلى توجيه التدريب بالإنجليزية، ثم ارجع إلى القارئ المؤهل للعربية القرآنية.",
  "feedback.playGuidance": "شغّل التوجيه",
  "feedback.transcriptionFailed": "تعذّرت مراجعة التسجيل — لم تستجب خدمة التعرّف على الكلام. تحقّق من اتصالك، ثم سجّل الآية من جديد.",
  "feedback.noArabicReturned": "لم يُتعرَّف على أي كلمة عربية في هذا التسجيل. حاول في مكان أهدأ والميكروفون قريب منك.",
  "feedback.reviewUnavailable": "حُفظ التسجيل، لكن هذه الاستجابة لا تكفي لمراجعة موثوقة كلمة كلمة. أعد سماع القارئ المؤهل وحاول في مكان أهدأ؛ وارجع إلى معلم في النطق والتجويد.",
  "feedback.wordIndex": "الكلمة {number}",
  "feedback.extra": "زائدة",
  "feedback.missing": "لم تُسمع",
  "feedback.review": "مراجعة",
  "feedback.allMatched": "تُعرِّف على كل كلمة متوقعة في هذا التسجيل.",
  "feedback.readAloudToggle": "اقرأ التوجيه الجديد بصوت مسموع",
  "feedback.tryAgain": "استمع وحاول مرة أخرى",
  "feedback.acousticLabel": "ملاحظات صوتية",
  "feedback.acousticAvailable": "ملاحظة تدريبية مشروطة بدرجة الثقة",
  "feedback.acousticAbstained": "استمعت المراجعة الصوتية، لكنها لم تبلغ من الثقة ما يكفي لاقتراح تصحيح.",
  "feedback.acousticUnavailable": "المراجعة الصوتية المتخصصة غير متاحة. ومراجعة الكلمات جاهزة على أي حال.",
  "feedback.acousticConfidence": "ثقة الصوت: {percent}%",
  "feedback.acousticPhoneme": "التركيز على الصوت",
  "feedback.acousticVowelLength": "التركيز على مقدار المد",
  "feedback.acousticPause": "التركيز على الوقف",
  "feedback.acousticTajweed": "التركيز على الحكم",
  "feedback.acousticBoundary": "خذ هذا توجيهًا للتدريب فقط. أما التجويد والمخارج وصحة ما يتعلق بالدين فيؤكدها معلم مؤهل.",

  // -- Memorise, side panel and the rest ------------------------------------
  "memorise.eyebrow": "استرجع في هدوء",
  "memorise.place": "الآية {number} من {total}",
  "memorise.prompt": "اقرأ بصوت مسموع، ثم دع دورة المعلم تساعدك على تفقّد موضعك.",
  "memorise.covered": "الآية مغطاة",
  "memorise.meaningHidden": "أُخفي المعنى ليكون الاسترجاع أكثر تركيزًا.",
  "memorise.reveal": "أظهر الآية",
  "memorise.cover": "غطِّ الآية",
  "memorise.toggleMeaning": "إظهار المعنى أو إخفاؤه",
  "memorise.practise": "تدرّب بصوت مسموع",
  "memorise.practiseAyah": "تدرّب على الآية {number}",
  "panel.label": "تفاصيل الآية المختارة",
  "panel.keepPlace": "احفظ موضعك",
  "panel.save": "حفظ",
  "panel.saved": "تم الحفظ",
  "panel.audioPlaying": "صوت القارئ يعمل",
  "panel.listenRepeat": "استمع وردّد",
  "panel.reciterFallback": "القارئ",
  "panel.ayahNumber": "الآية {number}",
  "panel.listenSelected": "استمع إلى المختارة",
  "panel.playingReciter": "يُشغَّل القارئ",
  "panel.audioNote": "صوت قارئ حقيقي بكامل مستوى صوت الجهاز. استخدم سماعات لتدريب أكثر تركيزًا.",
  "panel.sequenceEyebrow": "ترتيب اليوم",
  "panel.sequenceCopy": "اسمع الآية مرة، ثم رددها بصوتك، ثم ارجع في هدوء إلى الموضع الوحيد الذي يحتاج تدريبًا.",
  "panel.thisReading": "هذه القراءة",
  "panel.progressNote": "ترديدة واحدة بانتباه تقدّم نافع.",
  "dock.label": "إجراءات القراءة على الهاتف",
  "notFound.title": "الصفحة غير موجودة",
  "notFound.copy": "عذرًا، الصفحة التي تبحث عنها غير موجودة. ربما نُقلت أو حُذفت.",
  "notFound.goHome": "إلى الصفحة الرئيسية",
};

export const lessons: LocaleLessons = {
  letters: {
    alif: { articulation: "حلق مفتوح بلا ضيق. يحمل الحركة ولا يضيف صوتًا من عنده.", tip: "أبقِ الفم مسترخيًا والصوت نظيفًا." },
    ba: { articulation: "تنطبق الشفتان ثم تنفرجان بانفجار خفيف مجهور.", tip: "تنفرج الشفتان بنظافة، بلا نفخة بعدها." },
    ta: { articulation: "طرف اللسان يلتقي بأصول الثنايا العليا، مهموسًا.", tip: "أخف وأقدم من الطاء." },
    tha: { articulation: "طرف اللسان يمس أطراف الثنايا العليا ويمر الهواء فوقه.", tip: "صوت رقيق خفيف." },
    jeem: { articulation: "وسط اللسان يرتفع إلى وسط الحنك، ويُطلق مجهورًا.", tip: "أمسكه لحظة؛ ليس صوتًا عجولًا." },
    hha: { articulation: "من وسط الحلق، نفَس قوي مهموس بلا خشونة.", tip: "يختلف عن الهاء، وهي أرق وأسفل منها." },
    kha: { articulation: "من أعلى الحلق، بصوت فيه خشونة.", tip: "أثقل من الحاء وأوضح خشونة." },
    dal: { articulation: "طرف اللسان يلتقي بأصول الثنايا العليا، مجهورًا.", tip: "نظير التاء المجهور." },
    dhal: { articulation: "طرف اللسان يمس أطراف الثنايا العليا، مجهورًا.", tip: "مخرج الثاء نفسه، لكن بجهر." },
    ra: { articulation: "طرف اللسان يطرق ما وراء الثنايا العليا طرقة خفيفة.", tip: "طرقة واحدة خفيفة، لا تكرار طويل." },
    zay: { articulation: "طرف اللسان خلف الثنايا السفلى، ويمر صفير مجهور.", tip: "رقيق غير مفخم." },
    seen: { articulation: "صفير مهموس رقيق وطرف اللسان خلف الثنايا السفلى.", tip: "أبقِ الفم مسطحًا؛ الصاد نظيرها المفخم." },
    sheen: { articulation: "ينتشر الهواء على وسط اللسان عريضًا.", tip: "أعرض وألين من السين." },
    sad: { articulation: "مخرج السين نفسه، مع إطباق اللسان وامتلاء الفم.", tip: "صوت مفخم؛ قارنه بالسين." },
    dad: { articulation: "حافة اللسان تلتقي بالأضراس العليا والصوت مُطبَق.", tip: "حرف عربي خاص؛ تعلَّمه سماعًا من معلم." },
    tta: { articulation: "مخرج التاء نفسه، مع إطباق اللسان وتفخيم الصوت.", tip: "نظير التاء المفخم." },
    zza: { articulation: "مخرج الذال نفسه، مع إطباق اللسان وتفخيم الصوت.", tip: "نظير الذال المفخم." },
    ayn: { articulation: "من وسط الحلق، مجهورًا ومنفتحًا.", tip: "أعمق وألين من الهمزة." },
    ghayn: { articulation: "من أعلى الحلق، مجهورًا.", tip: "نظير الخاء المجهور." },
    fa: { articulation: "الشفة السفلى تلتقي بأطراف الثنايا العليا ويمر الهواء.", tip: "خفيف نظيف." },
    qaf: { articulation: "أقصى اللسان يرتفع قرب الحلق.", tip: "أبعد وأثقل من الكاف." },
    kaf: { articulation: "أقصى اللسان يلتقي بالحنك اللين.", tip: "أقدم وأخف من القاف." },
    lam: { articulation: "طرف اللسان يلتقي بما وراء الثنايا العليا ويمر الهواء من الجانبين.", tip: "مرقق، إلا في مواضع لفظ الجلالة." },
    meem: { articulation: "تنطبق الشفتان ويخرج الصوت من الأنف.", tip: "أبقِ الشفتين منطبقتين برفق." },
    noon: { articulation: "طرف اللسان يلتقي بما وراء الثنايا العليا ويخرج الصوت من الأنف.", tip: "كالميم لكن الشفتان مفتوحتان." },
    ha: { articulation: "من أقصى الحلق، نفَس لين.", tip: "أرق وألين من الحاء." },
    waw: { articulation: "تستدير الشفتان، مجهورًا.", tip: "الحرف نفسه يمد الضمة." },
    ya: { articulation: "وسط اللسان يرتفع نحو الحنك، مجهورًا.", tip: "الحرف نفسه يمد الكسرة." },
  },
};


/**
 * Qaida course prose in Arabic, keyed by the curriculum's own lesson and
 * exercise ids. Text only: lesson order, prerequisites, Arabic examples, Quran
 * references and answer correctness stay in the curriculum. Every level is
 * translated; a lesson added to the curriculum appears here in English until
 * its four strings are written, and the coverage test reports it.
 */
export const qaida: QaidaTextPack = {
  lessons: {
    "letters-alif-ba-ta-tha": {
      title: "الألف والباء والتاء والثاء",
      objective: "تعرَّف على الألف والباء والتاء والثاء شكلًا واسمًا.",
      teaching: "الحروف الأربعة الأولى. الباء والتاء والثاء تشترك في شكل واحد ولا تفترق إلا بالنقط: واحدة تحت، واثنتان فوق، وثلاث فوق. أما الألف فخط قائم وحده.",
    },
    "letters-jeem-hha-kha": {
      title: "الجيم والحاء والخاء",
      objective: "تعرَّف على الجيم والحاء والخاء شكلًا واسمًا.",
      teaching: "ثلاثة حروف على شكل واحد. الجيم فيها نقطة من الداخل، والحاء بلا نقطة، والخاء فوقها نقطة.",
    },
    "letters-dal-dhal": {
      title: "الدال والذال",
      objective: "تعرَّف على الدال والذال شكلًا واسمًا.",
      teaching: "شكل واحد، والفرق نقطة. الدال مجردة، والذال فوقها نقطة. وكلتاهما لا تتصل بما بعدها.",
    },
    "letters-ra-zay": {
      title: "الراء والزاي",
      objective: "تعرَّف على الراء والزاي شكلًا واسمًا.",
      teaching: "شكل ينزل تحت السطر. الراء مجردة، والزاي فوقها نقطة. ومثل الدال، لا تتصل واحدة منهما بما بعدها.",
    },
    "letters-seen-sheen": {
      title: "السين والشين",
      objective: "تعرَّف على السين والشين شكلًا واسمًا.",
      teaching: "ثلاث أسنان يتبعها كأس. السين مجردة، والشين فوقها ثلاث نقط.",
    },
    "letters-sad-dad": {
      title: "الصاد والضاد",
      objective: "تعرَّف على الصاد والضاد شكلًا واسمًا.",
      teaching: "حلقة وكأس. الصاد مجردة، والضاد فوقها نقطة. وهما النظيران المفخمان للسين والدال.",
    },
    "letters-tta-zza": {
      title: "الطاء والظاء",
      objective: "تعرَّف على الطاء والظاء شكلًا واسمًا.",
      teaching: "حلقة عليها خط قائم. الطاء مجردة، والظاء فوقها نقطة. وكلتاهما مفخمة، وتُكتب على غير صورة التاء المرققة التي مرّت في الدرس الأول.",
    },
    "letters-ayn-ghayn": {
      title: "العين والغين",
      objective: "تعرَّف على العين والغين شكلًا واسمًا.",
      teaching: "شكل واحد مرة أخرى. العين مجردة، والغين فوقها نقطة.",
    },
    "letters-fa-qaf": {
      title: "الفاء والقاف",
      objective: "تعرَّف على الفاء والقاف شكلًا واسمًا.",
      teaching: "الفاء فوقها نقطة واحدة، والقاف فوقها نقطتان. ويختلف كأساهما أيضًا: كأس القاف ينزل تحت السطر.",
    },
    "letters-kaf-to-ya": {
      title: "من الكاف إلى الياء",
      objective: "تعرَّف على الكاف واللام والميم والنون والهاء والواو والياء شكلًا واسمًا.",
      teaching: "حروف الهجاء السبعة الأخيرة، لكل واحد منها شكله الخاص.",
    },
    "letters-similar": {
      title: "حروف تُميَّز بنقطها",
      objective: "ميِّز الحروف التي تشترك في جسم واحد ولا تفترق إلا بالنقط.",
      teaching: "أكثر الحروف العربية تشترك في جسمها مع حرف أو حرفين. والنقط هي الفارق كله: اقرأ الجسم أولًا، ثم عُدّ النقط وانظر أفوق السطر هي أم تحته.",
    },
    "letters-similar-shapes": {
      title: "حروف أخرى يسهل الخلط بينها",
      objective: "ميِّز النظائر المفخمة والمرققة، والأزواج التي يقرأ المبتدئ أحدها مكان الآخر.",
      teaching: "تفترق هذه الأزواج بنقطة أو حلقة أو خط. واثنان منها — الهاء والحاء، والكاف والقاف — يستحقان النظر جنبًا إلى جنب لأن المبتدئ كثيرًا ما يقرأ أحدهما مكان الآخر. انظر إلى الشكل على الصفحة؛ أما كيف يُنطق كل حرف فذلك يُؤخذ سماعًا من معلمك ومن القارئ.",
      boundary: "هذا تمييز للأشكال على الصفحة. أما مخرج كل حرف — من أي موضع من الفم يخرج — فلا بد من سماعه من معلم مؤهَّل؛ التمرين المكتوب لا يُظهره، والتطبيق لا يحكم فيه.",
    },
    "forms-four-positions": {
      title: "المواضع الأربعة",
      objective: "اقرأ الحرف الواحد مفردًا وفي أول الكلمة ووسطها وآخرها.",
      teaching: "يتغير شكل الحرف بحسب موضعه من الكلمة. فالباء ب مفردة، وبـ في الأول، وـبـ في الوسط، وـب في الآخر. والجسم واحد في كل مرة — وإنما تتغير خطوط الوصل.",
    },
    "forms-non-connectors": {
      title: "حروف لا تتصل بما بعدها",
      objective: "تعرَّف على الحروف الستة التي لا تتصل أبدًا بما بعدها.",
      teaching: "ستة حروف — ا د ذ ر ز و — تتصل بما قبلها ولا تتصل بما بعدها أبدًا. فتنقطع الكلمة عند كل واحد منها، ولهذا تبدو بعض الكلمات كلمتين.",
    },
    "forms-joining-practice": {
      title: "وصل الحروف",
      objective: "اقرأ تركيبات موصولة قصيرة وانظر أين تقع الفواصل.",
      teaching: "اقرأ التركيب الموصول حرفًا حرفًا من اليمين إلى اليسار. وحيث يأتي حرف لا يتصل، يبدأ الحرف الذي بعده شكلًا جديدًا.",
    },
    "harakat-fatha": {
      title: "الفتحة",
      objective: "اقرأ حرفًا عليه فتحة.",
      teaching: "الفتحة شرطة صغيرة فوق الحرف، تعطيه صوت الألف القصير: بَ تُقرأ ‏«‏بَ‏»‏، وتَ تُقرأ ‏«‏تَ‏»‏.",
    },
    "harakat-kasra": {
      title: "الكسرة",
      objective: "اقرأ حرفًا عليه كسرة.",
      teaching: "الكسرة هي الشرطة نفسها تُكتب تحت الحرف، وتعطيه صوت الياء القصير: بِ تُقرأ ‏«‏بِ‏»‏.",
    },
    "harakat-damma": {
      title: "الضمة",
      objective: "اقرأ حرفًا عليه ضمة.",
      teaching: "الضمة واو صغيرة تُكتب فوق الحرف، وتعطيه صوت الواو القصير: بُ تُقرأ ‏«‏بُ‏»‏.",
    },
    "harakat-combinations": {
      title: "تركيب حرفين",
      objective: "اقرأ حرفين متحركين معًا، ثم كلمة قرآنية قصيرة ليس فيها إلا حركات قصيرة.",
      teaching: "اقرأ كل حرف بحركته، ثم صِلهما بلا وقف: بَتَ تُقرأ ‏«‏بَ-تَ‏»‏. وإذا استقام الزوج حملت القراءة نفسها كلمة حقيقية — فـ‏«‏هُوَ‏»‏ من سورة الإخلاص حرفان وحركتان قصيرتان لا غير.",
    },
    "tanween-three-marks": {
      title: "التنوين الثلاثة",
      objective: "تعرَّف على الفتحتين والكسرتين والضمتين.",
      teaching: "التنوين حركة مضاعفة في آخر الكلمة. الفتحتان تُقرأ ‏«‏ـًا‏»‏، والكسرتان ‏«‏ـٍ‏»‏، والضمتان ‏«‏ـٌ‏»‏. والفتحتان تقعان غالبًا على ألف مكتوبة في الآخر.",
    },
    "tanween-reading": {
      title: "قراءة الكلمات المنوَّنة",
      objective: "اقرأ كلمة قرآنية آخرها تنوين.",
      teaching: "الكلمة المنوَّنة تُقرأ بالحركة المضاعفة إذا واصلت بعدها. اقرأ الكلمة إلى آخرها ولا تقف دون العلامة.",
    },
    "madd-long-vowels": {
      title: "حروف المد الثلاثة",
      objective: "تعرَّف على الألف والواو والياء حروفَ مد إذا جاءت بعد حركتها المجانسة.",
      teaching: "تصير الحركة القصيرة مدًّا إذا تلاها حرفها المجانس: فتحة مع ألف (بَا)، وضمة مع واو (بُو)، وكسرة مع ياء (بِي). ويبقى الفم على الصوت نفسه زمنًا أطول.",
      boundary: "هذا الدرس في ملاحظة المد على الصفحة. أما مقداره وكيفية أدائه فمرجعه معلم مؤهل وتسجيل القارئ؛ والتطبيق لا يقيسه.",
    },
    "madd-short-vs-long": {
      title: "القصير في مقابل الطويل",
      objective: "ميّز الحركة القصيرة من نظيرتها الطويلة بنظرة واحدة.",
      teaching: "بَ وبَا هما الحرف نفسه بالحركة نفسها؛ والألف هي التي تطيلها. وقراءتهما سواءً أشيع خطأ عند المبتدئ، وهو خطأ في القراءة قبل أن يكون خطأً في الصوت.",
      boundary: "يتحقق التطبيق من تمييزك بينهما على الصفحة فقط. أما هل أوفيت المد حقه من المقدار فمرجعه معلم مؤهل؛ والتطبيق لا يقيسه.",
    },
    "sukoon-basics": {
      title: "السكون",
      objective: "اقرأ حرفًا عليه سكون.",
      teaching: "السكون دائرة صغيرة فوق الحرف. ومعناه أن الحرف لا حركة له: فهو يُغلق الصوت الذي قبله. فـ بَبْ تُقرأ «بَبْ».",
    },
    "sukoon-quran-words": {
      title: "السكون في كلمات قرآنية",
      objective: "اقرأ كلمات قرآنية قصيرة فيها حرف ساكن.",
      teaching: "أكثر الكلمات القرآنية تصل حرفًا متحركًا بحرف ساكن. اقرأ المتحرك، ثم أغلقه على الساكن من غير أن تزيد عليه حركة من عندك.",
    },
    "shaddah-basics": {
      title: "الشدة",
      objective: "اقرأ الحرف المشدد.",
      teaching: "الشدة علامة صغيرة فوق الحرف تشبه واوًا مستديرة. وهي تضاعف الحرف: أوله ساكن وثانيه متحرك، فيُشدّ الحرف ولا يُنطق مرتين منفصلتين. ولهذا جاء السكون قبلها — فالمشدد ساكن أُدغم في متحرك.",
    },
    "shaddah-quran-words": {
      title: "الشدة في كلمات قرآنية",
      objective: "اقرأ كلمات قرآنية فيها شدة.",
      teaching: "الشدة في القرآن كثيرة، وهي تغيّر الكلمة: اقرأ الحرف المشدد صوتًا واحدًا مشدودًا، لا حرفين منفصلين.",
    },
    "lam-sun-moon": {
      title: "الحروف الشمسية والحروف القمرية",
      objective: "اقرأ «ال» قراءة صحيحة قبل النوعين.",
      teaching: "قبل الحرف القمري تُقرأ لام «ال» وعليها سكون: الْحَمْدُ. وقبل الحرف الشمسي لا تُقرأ اللام؛ بل يُشدَّد الحرف الذي بعدها وتوضع عليه شدة: الصِّرَاطَ. والمصحف يدلّك: انظر السكون على اللام، أو الشدة على الحرف بعدها.",
    },
    "lam-reading-practice": {
      title: "قراءة «ال» في موضعها",
      objective: "اقرأ الكلمات التي فيها «ال» دون أن تقف لتحسب نوع الحرف التالي.",
      teaching: "مع التدريب تقوم الشدة والسكون بالعمل عنك: فأنت تقرأ ما هو مكتوب. اقرأ هذه بالتناوب بصوت مسموع ولاحظ كيف تتصرف اللام في كل مرة.",
    },
    "hamzah-seats": {
      title: "الهمزة وكراسيها",
      objective: "اقرأ الهمزة مكتوبةً على الألف والواو والياء.",
      teaching: "الهمزة صوت مستقل، تُكتب «ء» أو تُحمل على كرسي: أ وإ على الألف، وؤ على الواو، وئ على الياء. والكرسي رسمٌ لا صوت — فالهمزة تُقرأ على كل ذلك قراءة واحدة.",
    },
    "hamzah-wasl": {
      title: "همزة الوصل",
      objective: "تعرَّف على الألف التي تُقرأ إذا ابتدأت بها ويُتجاوز عنها إذا وصلت.",
      teaching: "ألف «ال»، وألف كلمات مثل اهْدِنَا، ألف وصل. إن ابتدأت بها قرأتها؛ وإن وصلت إليها من الكلمة قبلها تجاوزتها إلى الحرف الذي بعدها. وكثير من المصاحف ترسمها «ٱ» بعلامة صغيرة تشبه الصاد فوقها، دلالةً على تجاوزها في الوصل.",
    },
    "hamzah-orthography": {
      title: "ثلاثة أشكال في الرسم: ى وة والألف الصغيرة",
      objective: "اقرأ الأشكال الثلاثة التي يلقاها المبتدئ في المصحف باستمرار.",
      teaching: "ثلاثة أشكال تُعرف بالنظر. «ى» تشبه الياء بلا نقطتين، وتُقرأ في آخر الكلمة ألفًا ممدودة — واسمها الألف المقصورة. و«ة» هاء عليها نقطتان تسمى التاء المربوطة؛ تُقرأ تاءً إذا وصلت بما بعدها، وهاءً إذا وقفت عليها. والألف الصغيرة ألف دقيقة تُرسم فوق الحرف: فاقرأ عندها ألفًا ممدودة وإن لم تُكتب ألف كاملة.",
    },
    "tajweed-qalqalah": {
      title: "حروف القلقلة",
      objective: "تعرَّف على حروف القلقلة الخمسة إذا كانت ساكنة.",
      teaching: "خمسة حروف — ق ط ب ج د، تُجمع في «قطب جد» — يظهر لها صدى خفيف إذا سكنت أو وقفت عليها. وهذا الدرس في تمييزها على الصفحة.",
      boundary: "تمييز حرف القلقلة مهارة قراءة. أما هل أدّيت القلقلة أداءً صحيحًا فمرجعه معلم مؤهل؛ والتطبيق لا يحكم في ذلك من النص المكتوب.",
    },
    "tajweed-noon-sakinah": {
      title: "النون الساكنة والتنوين",
      objective: "تعرَّف على النون الساكنة والتنوين، واعلم أن الحرف بعدهما هو الذي يحدد أي الأحكام الأربعة يجري.",
      teaching: "تُقرأ النون الساكنة والتنوين على أحد أربعة أوجه بحسب الحرف الذي يليهما: الإظهار (النطق بها بيّنة)، والإدغام (إدخالها في الحرف بعدها)، والإقلاب (قلبها ميمًا)، والإخفاء (بين ذلك). وفي هذا المستوى تتعلّم تمييز النون والتنوين على الصفحة، ومعرفة أن الوجوه أربعة — أما أيها يجري وكيف يُؤدَّى فيُتعلَّم مع معلم وبالاستماع إلى القارئ.",
      boundary: "هذه أسماء لما هو مكتوب. والتطبيق لا يقيّم صحة أدائك للإخفاء أو الإدغام أو الغنة — وإنما يتكلم في ذلك معلم مؤهل، أو تقويم صوتي متخصص.",
    },
    "tajweed-meem-ghunnah": {
      title: "الميم الساكنة والغنة",
      objective: "تعرَّف على الميم الساكنة، وعلى العلامة التي تدل على غنة في النون أو الميم.",
      teaching: "للميم الساكنة ثلاثة أحكام خاصة بها، وكل نون أو ميم مشددة تُقرأ بغنة — وهي صوت يخرج من الخيشوم. وعلى الصفحة، ابحث عن الشدة.",
      boundary: "هذا تمييز على الصفحة. أما مقدار الغنة وكيف ينبغي أن تُسمع فمن معلم مؤهل ومن الاستماع إلى القارئ؛ والتطبيق لا يقيسه.",
    },
    "symbols-stop-marks": {
      title: "علامات الوقف",
      objective: "تعرَّف على الحروف الصغيرة المرسومة فوق السطر التي تدل على مواضع الوقف.",
      teaching: "يضبط المصحف مواضع الوقف بحروف صغيرة: م وقف لازم، ولا لا تقف هنا، وج الوقف جائز، وقلى الوقف أولى، وصلى الوصل أولى. وهي عون على القراءة، وُضعت لئلا ينقطع المعنى.",
      boundary: "هذه العلامات تدل على ما يجوز الوقف عليه أو ما هو أولى. أما أين تقف للمعنى وكيف تبتدئ بعده فبتوجيه معلم مؤهل؛ والتطبيق لا يتحقق من موضع وقفك.",
    },
    "symbols-small-marks": {
      title: "العلامات الصغيرة داخل النص",
      objective: "تعرَّف على العلامات الصغيرة المرسومة داخل الكلمات نفسها.",
      teaching: "إلى جانب علامات الوقف، يرسم المصحف داخل السطر علامات صغيرة: الألف الصغيرة التي مرّت بك، لألف ممدودة حيث لا ألف مكتوبة؛ وعلامة المد المتموجة «ٓ»، ومعناها أن هذا المد يُمدّ أكثر من المعتاد؛ ورقم الآية في دائرة مزخرفة في آخر كل آية.",
      boundary: "تمييز العلامة مهارة قراءة. أما مقدار المد فيُضبط مع معلم مؤهل؛ والتطبيق لا يقيسه.",
    },
    "quran-words": {
      title: "كلمات قرآنية",
      objective: "اقرأ كلمات قرآنية مفردة تجتمع فيها كل ما تعلّمته.",
      teaching: "يكاد كل ما مرّ بك يجتمع في هذه الكلمات الأربع: حرف ساكن، ومد، وشدة، وحرف شمسي وآخر قمري، وألف صغيرة. اقرأ كل كلمة على مهل، ثم أعدها بإيقاع مستقر.",
    },
    "quran-phrases": {
      title: "كلمتان معًا",
      objective: "اقرأ كلمتين قرآنيتين موصولتين من غير وقف بينهما.",
      teaching: "الكلمات المفردة هي الجزء الصعب؛ ووصلها هو الخطوة التالية. اقرأ كل زوج موصولًا من غير سكتة في وسطه، ثم استمع إلى القارئ يقرأ العبارة نفسها وتابعه.",
    },
    "quran-first-ayah": {
      title: "أول آية تقرؤها",
      objective: "اقرأ آية كاملة من المصحف.",
      teaching: "الكلمات التي قرأتها للتو تكوّن آية واحدة. افتحها في وضع التدريب: النص يأتي من بيانات القرآن في التطبيق، ومعه قارئ مؤهل تستمع إليه أولًا.",
    },
    "quran-short-ayat": {
      title: "آيات قصيرة",
      objective: "اقرأ عدة آيات قصيرة متتابعة.",
      teaching: "اقرأها واحدة بعد أخرى، وابدأ بأقصرها. كل واحدة قصيرة يسعها نفَس واحد، وليس فيها إلا ما تعرفه الآن من الحروف والحركات والعلامات.",
    },
    "quran-short-surah": {
      title: "سورة كاملة، مسجَّلة",
      objective: "أتمّ سورة قصيرة كاملة، مسجِّلًا كل آية لمراجعة الكلمات.",
      teaching: "آخر خطوة في القاعدة هي أول خطوة في تدريبك على التلاوة. قرأت في الدرس السابق أول آية من سورة الإخلاص؛ وهذه الآيات الثلاث تتمّها. افتح كل آية في وضع التدريب، واستمع إلى القارئ، ثم سجّل صوتك. وتخبرك المراجعة بالكلمات التي تُعرِّف عليها وبالموضع الذي تعاود منه — وهي مراجعة قراءة، لا حكمًا على حسن تلاوتك.",
      boundary: "المراجعة المسجَّلة تقارن الكلمات المكتوبة بالآية فقط. وهي لا تقيّم التجويد ولا المخارج ولا مقدار المد ولا الغنة.",
    },
  },
  exercises: promptsFromPhrasebook(QAIDA_LESSONS, {
    "Which of these is Thaa?":
      "أي هذه الحروف هو الثاء؟",
    "Which of these is Haa?":
      "أي هذه الحروف هو الحاء؟",
    "Which of these is Dhaal?":
      "أي هذه الحروف هو الذال؟",
    "Which of these is Zaay?":
      "أي هذه الحروف هو الزاي؟",
    "Which of these is Seen?":
      "أي هذه الحروف هو السين؟",
    "Which of these is Daad?":
      "أي هذه الحروف هو الضاد؟",
    "Which of these is Zaa?":
      "أي هذه الحروف هو الظاء؟",
    "Which of these is Ayn?":
      "أي هذه الحروف هو العين؟",
    "Which of these is Qaaf?":
      "أي هذه الحروف هو القاف؟",
    "Which of these is Haa (soft)?":
      "أي هذه الحروف هو الهاء؟",
    "Which of these is Kaaf?":
      "أي هذه الحروف هو الكاف؟",
    "Which shows a fatha followed by alif?":
      "أيها يُظهر فتحة بعدها ألف؟",
    "Which shows a damma followed by waw?":
      "أيها يُظهر ضمة بعدها واو؟",
    "Which of these is the long one?":
      "أي هذين هو الممدود؟",
    "Read this word from the Quran aloud, holding the long vowel.":
      "اقرأ هذه الكلمة القرآنية بصوت مسموع، ووفِّ المد حقه.",
    "What does this small circle above the letter mean?":
      "ما معنى هذه الدائرة الصغيرة فوق الحرف؟",
    "How does this read?":
      "كيف تُقرأ هذه؟",
    "Read this word from the Quran aloud, closing the Laam without a vowel.":
      "اقرأ هذه الكلمة القرآنية بصوت مسموع، وأغلق اللام بلا حركة.",
    "Read this one aloud — two sakin letters in the same word.":
      "اقرأ هذه بصوت مسموع — ساكنان في كلمة واحدة.",
    "In this word, which letter carries the sukoon?":
      "في هذه الكلمة، أي حرف عليه السكون؟",
    "What does the shaddah tell you to do?":
      "ماذا تدلك عليه الشدة؟",
    "Which shows a shaddah carrying kasra?":
      "أيها يُظهر شدة معها كسرة؟",
    "Which of these words carries a shaddah?":
      "أي هذه الكلمات فيها شدة؟",
    "In الْحَمْدُ, is the Laam of ال read?":
      "في الْحَمْدُ، هل تُقرأ لام «ال»؟",
    "In الصِّرَاطَ, why is there a shaddah on the Saad?":
      "في الصِّرَاطَ، لماذا وُضعت شدة على الصاد؟",
    "Read this aloud — a sun letter, so the Laam merges into it.":
      "اقرأ هذه بصوت مسموع — حرف شمسي، فتُدغم فيه اللام.",
    "Read this aloud — a moon letter, so the Laam is read with its sukoon.":
      "اقرأ هذه بصوت مسموع — حرف قمري، فتُقرأ اللام بسكونها.",
    "Which one carries a kasra, with the hamzah written below the alif?":
      "أيها عليه كسرة، والهمزة مكتوبة تحت الألف؟",
    "In ئ, what is the hamzah sitting on?":
      "في ئ، على أي شيء تجلس الهمزة؟",
    "You are continuing from the previous word into ال. What happens to its alif?":
      "أنت واصل من الكلمة السابقة إلى «ال». فماذا يحدث لألفها؟",
    "Start on this word and read it aloud, sounding the opening alif.":
      "ابتدئ بهذه الكلمة واقرأها بصوت مسموع، ناطقًا ألف الابتداء.",
    "How is ى at the end of a word read?":
      "كيف تُقرأ «ى» في آخر الكلمة؟",
    "What does a small alif printed above a letter tell you?":
      "على أي شيء تدلك ألف صغيرة مرسومة فوق حرف؟",
    "You stop at the end of a word ending in ة. How is it read?":
      "وقفت على كلمة آخرها «ة». فكيف تُقرأ؟",
    "Which of these is a qalqalah letter?":
      "أي هذه الحروف حرف قلقلة؟",
    "Which of these words ends in a qalqalah letter, so it echoes when you stop on it?":
      "أي هذه الكلمات آخرها حرف قلقلة، فيظهر لها صدى عند الوقف عليها؟",
    "Which of these carries a Noon with sukoon?":
      "أي هذه فيه نون ساكنة؟",
    "Tanween follows the same four cases as a sakin Noon. Which of these carries tanween?":
      "التنوين يجري فيه ما يجري في النون الساكنة من الأحكام الأربعة. فأي هذه فيه تنوين؟",
    "Which of these is read with ghunnah?":
      "أي هذه يُقرأ بغنة؟",
    "Which mark on a Noon or a Meem tells you the reader holds a ghunnah there?":
      "أي علامة على النون أو الميم تدل على أن القارئ يمدّ الغنة عندها؟",
    "What does لا above the line mean?":
      "ما معنى «لا» فوق السطر؟",
    "What does م above the line mean?":
      "ما معنى «م» فوق السطر؟",
    "What does قلى tell the reader?":
      "على أي شيء تدل «قلى» القارئ؟",
    "What is the decorated circle at the end of an ayah?":
      "ما الدائرة المزخرفة في آخر الآية؟",
    "What does the wavy madd sign above a letter tell the reader?":
      "على أي شيء تدل علامة المد المتموجة فوق الحرف؟",
    "Read this word aloud.":
      "اقرأ هذه الكلمة بصوت مسموع.",
    "Read this word aloud — a sun letter and a long vowel.":
      "اقرأ هذه الكلمة بصوت مسموع — حرف شمسي ومد.",
    "Read these two words as one phrase.":
      "اقرأ هاتين الكلمتين عبارة واحدة.",
    "Read this phrase — a sun letter, then a held Laam.":
      "اقرأ هذه العبارة — حرف شمسي، ثم لام مشدودة.",
    "Listen to the reciter, then read this ayah aloud.":
      "استمع إلى القارئ، ثم اقرأ هذه الآية بصوت مسموع.",
    "Start with the shortest — one word. Listen, then read it aloud.":
      "ابدأ بالأقصر — كلمة واحدة. استمع، ثم اقرأها بصوت مسموع.",
    "Now four words, all of them familiar by this point.":
      "والآن أربع كلمات، صرن كلهن مألوفات عندك.",
    "And the ayah your phrases came from.":
      "والآية التي جاءت منها عباراتك.",
    "You have read the first ayah of al-Ikhlas. Carry on: listen, then record the second.":
      "قرأت الآية الأولى من سورة الإخلاص. فواصل: استمع، ثم سجّل الثانية.",
    "The third ayah.":
      "الآية الثالثة.",
    "And the fourth, which completes the surah.":
      "والرابعة، وبها تتم السورة.",
    "Which letter is this?": "ما هذا الحرف؟",
    "Play the recording, then choose the letter you heard.": "شغّل التسجيل، ثم اختر الحرف الذي سمعته.",
    "Which two letters make this combination?": "من أي حرفين يتكوّن هذا التركيب؟",
    "How does this combination read?": "كيف يُقرأ هذا التركيب؟",
    "Read this Quranic word aloud, then continue.": "اقرأ هذه الكلمة القرآنية بصوت مسموع، ثم تابع.",
    "Read this teaching combination aloud, then continue.": "اقرأ هذا التركيب التعليمي بصوت مسموع، ثم تابع.",
    "Read this aloud, then continue.": "اقرأ هذا بصوت مسموع، ثم تابع.",
    "Which is Baa at the beginning of a word?": "أيها الباء في أول الكلمة؟",
    "Which is Noon in the middle of a word?": "أيها النون في وسط الكلمة؟",
    "Which is Meem at the end of a word?": "أيها الميم في آخر الكلمة؟",
    "Which of these does not join to the letter after it?": "أي هذه الحروف لا يتصل بما بعده؟",
    "Which of these does join forward?": "أي هذه الحروف يتصل بما بعده؟",
    "Which one reads 'ba'?": "أيها يُقرأ ‏«‏بَ‏»‏؟",
    "Which one reads 'bi'?": "أيها يُقرأ ‏«‏بِ‏»‏؟",
    "Which one reads 'bu'?": "أيها يُقرأ ‏«‏بُ‏»‏؟",
    "Which one reads 'nu'?": "أيها يُقرأ ‏«‏نُ‏»‏؟",
    "Which one reads 'bun'?": "أيها يُقرأ ‏«‏بٌ‏»‏؟",
    "What is the mark above this letter called?": "ما اسم العلامة التي فوق هذا الحرف؟",
    "Where is a kasra written?": "أين تُكتب الكسرة؟",
    "What is this ending called?": "ما اسم هذه النهاية؟",
    "Which ending does this word carry?": "أي نهاية تحملها هذه الكلمة؟",
  }, {
    "Listen to the reciter's recording for how the echo sounds. This exercise only asks you to spot the letter.":
      "استمع إلى تسجيل القارئ لتعرف كيف يُسمع الصدى. وهذا التدريب لا يطلب منك إلا تمييز الحرف.",
    "Which of the four cases applies, and how each one sounds, is learned with a teacher and by listening to the reciter.":
      "أما أي الأحكام الأربعة يجري وكيف يُسمع كل واحد منها، فيُتعلَّم مع معلم وبالاستماع إلى القارئ.",
    "How much longer is settled by the way you were taught to recite, with a qualified teacher. The sign only tells you that it is longer.":
      "أما مقدار الزيادة فيُضبط بالرواية التي تعلّمت عليها ومع معلم مؤهل. والعلامة لا تدل إلا على أن المد أطول.",
    "The recording is a qualified reciter's, played as a reference. The app is not listening to you here.":
      "التسجيل لقارئ مؤهَّل، يُشغَّل للاسترشاد. والتطبيق لا يستمع إليك هنا.",
  }),
};

export default { manifest, strings, lessons, qaida };
