/**
 * Dari — complete pack.
 *
 * Locale `fa-AF`: the Afghan variety of Persian. See shared/languages.ts for
 * why the region-tagged Persian code is used rather than `fa` or `prs`.
 *
 * Everything a learner reads is in Dari: the interface, the teacher's
 * instructions, the study controls, all 28 articulation notes, and the whole
 * Qaida course prose — every lesson and every exercise prompt. Nothing falls
 * back to English, and a coverage test fails the day something does.
 *
 * The register is Afghanistan Dari rather than Iranian Persian product
 * language: آیت rather than آیه, کوشش کنید rather than تلاش کنید, پروگرام for
 * the app. Established Arabic terms (سکون، شده، تنوین، قلقله، غنه، تجوید،
 * مخرج) are kept and explained in Dari where a lesson introduces them.
 *
 * The Quran itself is untouched by this file: its Arabic text, the ayah
 * recitations and the letter recordings are shared by every language.
 *
 * NOT YET REVIEWED BY A NATIVE SPEAKER. `nativeReviewed: false` in
 * shared/languages.ts records that.
 */
import type { LocaleLessons, LocaleManifest } from "../types";
import type { TranslatableStrings } from "../index";
import { QAIDA_LESSONS } from "../../shared/qaidaCurriculum";
import { promptsFromPhrasebook, type QaidaTextPack } from "../../shared/qaidaText";
import { SUPPORTED_LANGUAGES } from "../../shared/languages";

export const manifest: LocaleManifest = { ...SUPPORTED_LANGUAGES["fa-AF"] };

export const strings: TranslatableStrings = {
  "now.label": "حالا چه کنید",
  "now.place": "آیت {ayah} از {total}",
  "now.placeWord": "کلمهٔ {number}",
  "now.listening": "می‌شنوم…",
  "now.reviewing": "آنچه خواندید بررسی می‌شود…",
  "now.recordAgain": "این ضبط بررسی شده نتوانست",
  "now.unclear": "این به اندازهٔ کافی واضح نبود",
  "now.repeatWord": "کلمهٔ {number} را تکرار کنید",
  "now.repeatWordAgain": "همین کلمه دوباره — کلمهٔ {number}",
  "now.repeatWordSound": "کلمهٔ {number} را به دقت بشنوید، سپس تکرار کنید",
  "now.repeatAyah": "آیت {number} را دوباره بخوانید",
  "now.continueFromWord": "از کلمهٔ {number} ادامه دهید",
  "now.nextAyah": "آیت تمام شد — به آیت {number} بروید",
  "now.surahComplete": "به پایان این سوره رسیدید",
  "now.reviewToday": "امروز این آیت را مرور کنید",
  "now.listenFirst": "اول بشنوید، بعد آیت را بخوانید",
  "now.repeat": "تکرار کنید",
  "now.tryAgain": "دوباره کوشش کنید",
  "now.goToAyah": "به آیت {number} بروید",
  "now.stepsLabel": "چگونه تمرین کنید",

  "correction.label": "کلمه‌ای که باید اصلاح شود",
  "correction.notHeard": "این کلمه شنیده نشد.",
  "correction.different": "به جای آن چیز دیگری شنیده شد.",
  "correction.sound": "کلمه‌ها درست بودند. ادای این کلمه را به دقت بشنوید.",
  "correction.unsure": "این به اندازهٔ کافی واضح نبود که مطمئن شویم.",
  "correction.listen": "آیت را آهسته بشنوید",
  "correction.retry": "بشنوید، کلمه را تکرار کنید، سپس تمام آیت را بخوانید.",
  "correction.wordAt": "کلمهٔ {number}",

  "step.showWord": "به کلمه نگاه کنید",
  "step.listen": "بشنوید",
  "step.repeatWord": "کلمه را تکرار کنید",
  "step.reciteAyah": "آیت را بخوانید",
  "step.recordAgain": "دوباره ضبط کنید",

  "study.hearReciter": "قاری را بشنوید",
  "study.reciterPlaying": "قاری در حال خواندن است",
  "study.record": "خواندن مرا ضبط کن",
  "study.stopRecording": "توقف و بررسی",
  "study.reviewing": "در حال بررسی…",
  "study.listenSlowly": "آهسته بشنوید",
  "study.previous": "قبلی",
  "study.next": "بعدی",
  "study.ayah": "آیت",
  "recorder.intro": "قاری را بشنوید، سپس خواندن خود را ضبط کنید.",
  "recorder.listening": "اکنون می‌شنوم. آیت را با آرامش بخوانید، سپس توقف و بررسی را فشار دهید.",
  "recorder.reviewing": "کلمه‌هایی که خواندید بررسی می‌شوند…",
  "recorder.reviewReady": "بررسی کلمه‌ها آماده است. قاری را دوباره بشنوید و جای نشانی‌شده را تکرار کنید.",
  "recorder.retryNow": "دوباره ضبط کنید",

  "mode.read": "خواندن",
  "mode.learn": "آموزش",
  "mode.study": "تمرین",
  "mode.memorise": "حفظ",
  "dock.read": "خواندن",
  "dock.practise": "تمرین",
  "dock.recall": "مرور",
  "notes.summary": "یادداشت‌های استاد",
  "language.label": "زبان برنامه",

  "mastery.new": "نو",
  "mastery.learning": "در حال آموختن",
  "mastery.needs_review": "نیاز به مرور",
  "mastery.strong": "قوی",
  "mastery.mastered": "کاملاً حفظ",

  "course.continue": "ادامه",
  "course.tryAgain": "دوباره کوشش کنید",
  "course.readAloud": "با صدای بلند خواندم",
  "course.completedBadge": "تکمیل شد",
  "course.locked": "اول درس‌های پیشین را تمام کنید",

  // -- Supporting interface -------------------------------------------------
  "nav.sectionLabel": "جای شما",
  "nav.today": "امروز",
  "nav.library": "کتابخانهٔ من",
  "nav.bookmarks": "نشانی‌شده‌ها",
  "nav.practiceTitle": "تمرین امروز",
  "nav.practiceCopy": "بشنوید، تکرار کنید، برگردید.",
  "nav.minutesShort": "دقیقه",
  "language.partial": "فقط رابط",
  "language.aiDrafted": "مسودهٔ هوش مصنوعی، از سوی گویندهٔ زبان بررسی نشده",
  "language.hint": "متن عربی و تلاوت در هر زبان یکسان می‌ماند.",
  "mode.label": "شیوهٔ خواندن",
  "mode.readCaption": "صفحه را دنبال کنید",
  "mode.learnCaption": "از حروف تا تلاوت",
  "mode.studyCaption": "تمرین با استاد",
  "mode.memoriseCaption": "بپوشانید، به یاد آورید، مرور کنید",
  "study.ayahOf": "از {total}",
  "study.lessonLabel": "درس تلاوت",
  "study.eyebrow": "تلاوت با راهنمایی",
  "study.heading": "بشنوید. تکرار کنید. مرور کنید.",
  "study.badge": "روش استاد",
  "study.stageListen": "بشنوید",
  "study.stageRepeat": "نوبت شما",
  "study.stageReview": "مرور",
  "study.chooseAyah": "آیت {number} را انتخاب کنید",
  "playback.previous": "آیت پیشین",
  "playback.next": "بعدی",
  "playback.listen": "بشنوید",
  "playback.pause": "توقف",
  "playback.place": "آیت {number} از {total}",
  "playback.keepPlaying": "ادامه بدهد",

  // -- Teacher notes --------------------------------------------------------
  "notes.observedLabel": "این کوشش چه نشان داد",
  "notes.observedMissing": "کلمهٔ {number} شنیده نشد.",
  "notes.observedReview": "کلمهٔ {number} طور دیگری آمد.",
  "notes.observedRecurring": "کلمهٔ {number} پیش از این هم کار می‌خواست.",
  "notes.observedExtra": "{count} کلمهٔ اضافی شنیده شد.",
  "notes.observedAcoustic": "دربارهٔ آوای کلمهٔ {number} یک مشاهده وجود دارد.",
  "notes.observedBoundary": "این‌ها مشاهده است، نه حکم بر تلاوت شما. اینکه چه کنید، همان یک راهنمایی بالاست.",
  "notes.hint": "نتیجهٔ شما، پیشینهٔ شما با این آیت، و برنامهٔ تمرین.",
  "notes.placeLabel": "کجا هستید",
  "notes.whyLabel": "چرا",

  // -- Memorisation and review ---------------------------------------------
  "memory.eyebrow": "این آیت تا اکنون",
  "memory.reviewToday": "مرور امروز است.",
  "memory.nextReview": "مرور بعدی: {date}.",
  "memory.none": "برای آغاز برنامهٔ مرور، این آیت را یک بار بخوانید.",
  "memory.repeatedOmission": "کلمهٔ {number} اینجا اغلب از قلم می‌افتد.",
  "memory.repeatedSubstitution": "کلمهٔ {number} بارها نیاز به مرور دارد.",
  "memory.streak": "{count} مرور پیاپی بدون اشتباه",
  "memory.overview": "{due} امروز · {weak} نیاز به مرور · {strong} قوی",
  "memory.practiceNext": "تمرین بعدی",
  "memory.nextIs": "سورهٔ {surah}، آیت {ayah}",
  "memory.startNew": "آیت تازه را آغاز کنید",

  // -- Where you are (secondary detail) -------------------------------------
  "follow.label": "کجا هستید",
  "follow.eyebrow": "جای شما",
  "follow.ayah": "آیت {number}",
  "follow.stateFollowing": "ادامه",
  "follow.stateCorrecting": "دوباره کوشش",
  "follow.stateUncertain": "مطمئن نیست",
  "follow.stateCompleted": "تمام",
  "follow.continueAt": "از کلمهٔ {number} ادامه دهید.",
  "follow.surahComplete": "به پایان این سوره رسیدید.",
  "follow.correctionFocus": "نخست به کلمهٔ {number} برگردید:",
  "follow.moveToAyah": "با آیت {number} ادامه دهید",
  "follow.stayOnAyah": "آیت {number} را دوباره بخوانید",
  "follow.reasonNoTranscript": "چیز قابل استفاده‌ای شنیده نشد، پس جای شما تغییر نکرد.",
  "follow.reasonTooLittleEvidence": "از این آیت آنقدر شناخته نشد که جای شما پیش برود.",
  "follow.reasonNoisyTranscript": "ضبط کلمه‌های زیادی داشت که از این آیت نیست، پس جای شما تغییر نکرد. در جای آرام‌تر دوباره کوشش کنید.",
  "follow.reasonPreviousAyah": "این با آیت پیشین می‌خواند، پس جای شما روی همین آیت نگه داشته شد.",
  "follow.reasonNextAyahEarly": "این آغاز آیت بعدی بود. نخست همین را تمام کنید.",
  "follow.reasonPartialProgress": "بخشی از آیت شناخته شد. از کلمهٔ زیر ادامه دهید.",
  "follow.reasonMistakeToCorrect": "آیت از کلمه‌ای گذشت که نخواند. به کلمهٔ زیر برگردید.",
  "follow.reasonAyahCompleted": "این آیت تا پایان خوانده شد.",
  "follow.reasonSurahCompleted": "آن آخرین آیت این سوره بود.",
  "follow.boundary": "جای شما تنها از روی کلمه‌های شناخته‌شده در متن نگه داشته می‌شود. این دربارهٔ تجوید، مخرج، مد، لحن یا آهنگ چیزی نمی‌گوید.",

  // -- Recorder -------------------------------------------------------------
  "recorder.listenSlow": "آهسته بشنوید. به هر کلمه توجه کنید، سپس تکرار کنید.",
  "recorder.listenOnce": "یک بار کامل بشنوید. وقتی آماده شدید، نوبت شماست.",
  "recorder.audioFailed": "صدا آغاز نشد. آواز دستگاه خود را ببینید، سپس دوباره کوشش کنید.",
  "recorder.retry": "نخست یک بار دیگر بشنوید، سپس آیت را با صدای خود تکرار کنید.",

  // -- Shell, reader and playback -------------------------------------------
  "app.tagline": "پلان خواندن",
  "nav.primaryLabel": "منوی اصلی",
  "reader.eyebrow": "قرآن",
  "reader.surahLabel": "سوره",
  "reader.juzLabel": "پاره",
  "reader.juzNumbered": "پارهٔ {number}",
  "reader.reciterLabel": "قاری",
  "reader.translationLabel": "ترجمه",
  "reader.loadingTranslations": "ترجمه‌ها می‌آیند…",
  "reader.surahSearch": "جستجوی سوره‌ها…",
  "reader.surahNoMatch": "هیچ سوره‌ای با این جور نمی‌خورد.",
  "reader.translationUnavailable": "فهرست ترجمه‌ها به دست نیامد. ترجمهٔ انگلیسی پیش‌فرض نشان داده می‌شود.",
  "reader.searchLabel": "جستجو در قرآن",
  "reader.settingsLabel": "تنظیمات خواندن",
  "reader.loadingSurahs": "سوره‌ها می‌آیند…",
  "reader.loadingJuz": "پاره‌ها می‌آیند…",
  "reader.loadingReciters": "قاری‌ها می‌آیند…",
  "reader.noReciters": "صدای هیچ قاری موجود نیست",
  "reader.reciterUnavailable": "{reciter} (صدا موجود نیست)",
  "reader.makki": "مکی",
  "reader.madani": "مدنی",
  "reader.ayahCount": "{count} آیت",
  "reader.versesLabel": "آیت‌های سورهٔ {surah}",
  "reader.footerHint": "بالای یک آیت بزنید، بعد به بخش تمرین بروید تا آن را بشنوید و تکرار کنید.",
  "reader.showMeaning": "معنا را نشان بده",
  "reader.hideMeaning": "معنا را پنهان کن",
  "reader.previousAyah": "آیت پیشین",
  "reader.nextAyah": "آیت بعدی",
  "reader.chapterCopy": "آیت را بخوانید، از قاری بشنوید، خودتان تکرار کنید، بعد به آرامی به همان جایی برگردید که تمرین می‌خواهد.",
  "reader.loading": "در حال آمدن…",
  "playback.label": "پخش آیت",
  "playback.noAudio": "این قاری برای این آیت ضبطی ندارد. قاری دیگری را انتخاب کنید.",
  "playback.audioFailed": "صدای {reciter} موجود نیست. این ضبط پخش شده نتوانست — قاری دیگری را انتخاب کنید.",
  "content.loading": "متن قرآن و تلاوت می‌آید…",
  "content.retry": "دوباره کوشش کنید",

  // -- Learn: levels and the qaida overview ---------------------------------
  "learn.heading": "راه یادگیری قرآن شما",
  "learn.eyebrow": "در سطح خودتان یاد بگیرید",
  "learn.copy": "از الفبا و شکل‌های وصل شروع کنید، بعد با یک استاد واجد شرایط به قواعد تلاوت بروید.",
  "learn.paceEyebrow": "سرعت خود را انتخاب کنید",
  "learn.paceHeading": "از نخستین حروف تا تلاوت با دقت.",
  "learn.levelsLabel": "سطح‌های یادگیری",
  "learn.percentComplete": "{percent}% تکمیل",
  "learn.level.qaida": "قاعده",
  "learn.level.qaidaSummary": "حروف عربی، مخرج‌ها، حرکت‌های کوتاه و شکل‌های وصل.",
  "learn.level.qaidaCue": "حروف و وصل",
  "learn.level.tajweed": "تجوید",
  "learn.level.tajweedSummary": "قواعد تلاوت — مد، غنه و وقف — با دقت تمرین می‌شود.",
  "learn.level.tajweedCue": "قواعد تلاوت",
  "qaida.eyebrow": "قاعده · درس اول",
  "qaida.heading": "پیش از کلمه‌ها، حروف.",
  "qaida.copy": "یک‌یک حرف را یاد بگیرید، صدایش را بشنوید، بعد با استاد تمرین کنید.",
  "qaida.practisedCount": "تمرین‌شده · {percent}%",
  "qaida.alphabetLabel": "الفبای عربی",
  "qaida.writtenAs": "نوشته می‌شود {transliteration} · {sound}",
  "qaida.playLetter": "حرف",
  "qaida.playLetterLabel": "{letter} را تنها پخش کن",
  "qaida.playHarakatLabel": "{letter} را با {harakat} پخش کن",
  "qaida.markPractised": "تمرین‌شده نشانی کنید",
  "qaida.practised": "تمرین‌شده",
  "qaida.nextLetter": "حرف بعدی",
  "qaida.audioIdle": "حرف را تنها یا با یک حرکت انتخاب کنید تا صدای قاری را بشنوید.",
  "qaida.audioPlaying": "ضبط قاری پخش می‌شود.",
  "qaida.audioUnavailable": "این ضبط هنوز افزوده نشده است. صدای تلاوت را یک قاری واجد شرایط ثبت می‌کند — پروگرام عربی را با صدای ساختگی انگلیسی نمی‌خواند.",
  "qaida.audioAttribution": "صدای حروف را {source} ساخته است، تا زمانی که ضبط‌های یک قاری جای آن را بگیرد.",
  "qaida.audioIdlePlaceholder": "حرف را تنها یا با یک حرکت انتخاب کنید تا بشنوید. این صدا ساختگی است، از قاری نیست.",
  "qaida.audioPlayingPlaceholder": "یک صدای ساختگی پخش می‌شود، نه ضبط قاری.",
  "qaida.audioUnavailablePlaceholder": "این قطعه هنوز ساخته نشده است. پروگرام به جایش عربی را با صدای ساختگی انگلیسی نمی‌خواند — انگلیسی چند تا از این صداها را اصلاً ادا کرده نمی‌تواند.",
  "qaida.audioFormUnavailable": "این مجموعه فقط حروف تنها را دارد. شکل‌های حرکت‌دار با مجموعهٔ قاری می‌آیند — پروگرام صدای دیگری را به جای آن‌ها نمی‌گذارد.",
  "qaida.quickCheck": "بررسی کوتاه",
  "qaida.quickCheckPrompt": "این کدام حرف است؟",
  "qaida.quickCheckCorrect": "درست است. وقتی آن را با استاد خود گفتید، می‌توانید این حرف را تمرین‌شده نشانی کنید.",
  "qaida.quickCheckRetry": "هنوز نه. به شکل حرف نگاه کنید، حرف را دوباره پخش کنید و یک بار دیگر کوشش کنید.",
  "qaida.boundary": "به صدای حروف تنها نمرهٔ خودکار داده نمی‌شود. هوش مصنوعی می‌تواند تمرین شما را منظم کند، اما ادا و مخرج را باید یک استاد واجد شرایط تأیید کند.",
  "harakat.fatha": "فتحه (زبر)",
  "harakat.fathaHint": "اَ کوتاه",
  "harakat.kasra": "کسره (زیر)",
  "harakat.kasraHint": "اِ کوتاه",
  "harakat.damma": "ضمه (پیش)",
  "harakat.dammaHint": "اُ کوتاه",
  "qaida.openFirstAyah": "تمرین آیت اول را باز کنید",
  "tajweed.eyebrow": "راه تجوید",
  "tajweed.heading": "قواعد تلاوت، هر بار یک بازگشت با دقت.",
  "tajweed.copy": "از یک قاری واجد شرایط بشنوید، تکرار کنید، کلماتی را که ضبط شما گرفت ببینید، و برای اصلاح تجوید نزد استاد خود برگردید.",
  "tajweed.principleAudio": "صدای قاری واقعی",
  "tajweed.principleReview": "بررسی کلمات با هوش مصنوعی",
  "tajweed.principleTeacher": "تجوید تأییدشده توسط استاد",
  "tajweed.begin": "تلاوت با راهنمایی را شروع کنید",
  "study.stageLabel": "مرحلهٔ فعلی: {stage}",

  // -- The Qaida course chrome ----------------------------------------------
  "course.eyebrow": "کورس قاعده",
  "course.levelLabel": "سطح {order} — {title}",
  "course.percentComplete": "{percent}% کورس",
  "course.levelsLabel": "سطح‌های کورس",
  "course.levelProgress": "{done} / {total} درس",
  "course.lessonPosition": "درس {number} از {total}",
  "course.stagesLabel": "این درس چگونه پیش می‌رود",
  "course.stageLearn": "یادگیری",
  "course.stageListen": "شنیدن",
  "course.stageRecognize": "شناختن",
  "course.stageRepeat": "تکرار",
  "course.stageRead": "خواندن",
  "course.stageCheck": "بررسی",
  "course.stageComplete": "تکمیل",
  "course.examplesLabel": "نمونه‌ها",
  "course.teachingSummary": "این درس چه می‌آموزد",
  "course.quranBadge": "قرآن {reference}",
  "course.teachingBadge": "نمونهٔ آموزشی",
  "course.exerciseLabel": "تمرین",
  "course.exerciseProgress": "سوال {number} از {total}",
  "course.playAudio": "نمونه را پخش کن",
  "course.audioUnavailable": "برای این شکل هنوز هیچ ضبط نمونه‌ای موجود نیست.",
  "course.correct": "درست است.",
  "course.retry": "هنوز درست نیست. دوباره نگاه کنید و یک بار دیگر کوشش کنید.",
  "course.letterReference": "فهرست حروف",
  "course.letterReferenceHint": "هر ۲۸ حرف، با ضبط یک قاری برای هر کدام.",
  "course.openInStudy": "{reference} را در بخش تمرین باز کن",
  "course.lessonComplete": "درس تمام شد.",
  "course.nextLesson": "بعدی: {title}",
  "course.finishCourse": "کورس را تمام کنید",
  "course.practiseAgain": "این درس را دوباره تمرین کنید",
  "course.courseComplete": "این تمام قاعده بود. در بخش تمرین ادامه دهید، جایی که اول قاری می‌خواند و بعد ضبط شما کلمه به کلمه بررسی می‌شود.",
  "course.lessonListLabel": "درس‌های این سطح",
  "course.reviewLesson": "مرور",

  // -- Recorder, live guidance and the practice plan ------------------------
  "recorder.noLiveGuide": "ضبط کردن ممکن است. راهنمایی زنده تنها در براوزرهایی کار می‌کند که شناخت گفتار عربی دارند؛ ضبط شما در هر صورت پس از توقف بررسی می‌شود.",
  "recorder.liveGuidePaused": "راهنمایی زنده متوقف شد، اما ضبط شما پس از توقف باز هم بررسی کلمات را می‌گیرد.",
  "recorder.reviewFailed": "این ضبط بررسی شده نتوانست. لطفاً یک قطعهٔ کوتاه‌تر کوشش کنید.",
  "recorder.empty": "هیچ صدایی گرفته نشد. دسترسی مایکروفون را ببینید، بعد آیت را دوباره ضبط کنید.",
  "recorder.tooLarge": "این ضبط {size} MB است و از حد {limit} MB بالاتر می‌رود، بنابراین برای بررسی فرستاده نشد. یک آیت را به آرامی ضبط کنید و دوباره کوشش کنید.",
  "recorder.noRecorder": "این براوزر صدا ضبط کرده نمی‌تواند. لطفاً یک براوزر نو استفاده کنید و به مایکروفون اجازه بدهید.",
  "recorder.noMicrophone": "به مایکروفون اجازه داده نشد. در تنظیمات براوزر اجازه بدهید، بعد دوباره کوشش کنید.",
  "live.guideTitle": "راهنمای زندهٔ کلمات",
  "live.heardTitle": "براوزر شما چه شنید",
  "live.source": "شناخت گفتار دستگاه",
  "live.waiting": "منتظر صدای شما",
  "coach.contextLabel": "پلان تمرین با راهنمایی هوش مصنوعی",
  "coach.contextEyebrow": "پلان تمرین",
  "coach.practiceLoopLabel": "دور تمرین",
  "coach.reviewPlanLabel": "پلان تمرینی که در این بررسی به کار رفت",
  "coach.reviewPlanEyebrow": "راهنمای تمرین هوش مصنوعی",

  // -- The coaching plan, by learning level ---------------------------------
  "plan.qaida.title": "قاعده",
  "plan.qaida.focus": "حروف، مخرج‌ها، حرکت‌های کوتاه و شکل‌های وصل",
  "plan.qaida.lessonGoal": "شناخت حروف و عادت شنیدن و تکرار را محکم کنید، بعد حروف را در کلمات وصل کنید.",
  "plan.qaida.boundary": "ادا و مخرج حروف تنها را باید یک استاد واجد شرایط تأیید کند.",
  "plan.qaida.loopListen": "بشنوید",
  "plan.qaida.loopIdentify": "بشناسید",
  "plan.qaida.loopJoin": "وصل کنید",
  "plan.qaida.loopRepeat": "تکرار کنید",
  "plan.qaida.loopReview": "مرور کنید",
  "plan.tajweed.title": "تجوید",
  "plan.tajweed.focus": "قواعد تلاوت — مد، غنه و وقف — با راهنمایی استاد",
  "plan.tajweed.lessonGoal": "با تکرار سنجیده بخوانید و جایی را پیدا کنید که به تمرین زیر نظر استاد نیاز دارد.",
  "plan.tajweed.boundary": "تجوید، مخرج، مد، وقف، لحن و درستی دینی را تنها یک استاد واجد شرایط تأیید کرده می‌تواند.",
  "plan.tajweed.loopRecall": "به یاد بیاورید",
  "plan.tajweed.loopRecord": "ضبط کنید",
  "plan.tajweed.loopLocate": "جای بازگشت را پیدا کنید",
  "plan.tajweed.loopTeacher": "با استاد تکرار کنید",

  // -- Review feedback ------------------------------------------------------
  "feedback.available": "کلمات شناخته‌شده",
  "feedback.unavailable": "بررسی شده نتوانست",
  "feedback.matched": "از این آیت شناخته شد",
  "feedback.notRecognised": "این سرویس هیچ کلمهٔ عربی را نشناخت",
  "feedback.coachEyebrow": "راهنمای صوتی هوش مصنوعی",
  "feedback.coachCopy": "راهنمایی تمرین را به انگلیسی بشنوید، بعد برای عربی قرآنی از قاری واجد شرایط استفاده کنید.",
  "feedback.playGuidance": "راهنمایی را پخش کن",
  "feedback.transcriptionFailed": "این ضبط بررسی شده نتوانست — سرویس شناخت گفتار جواب نداد. اتصال خود را ببینید، بعد آیت را دوباره ضبط کنید.",
  "feedback.noArabicReturned": "در این ضبط هیچ کلمهٔ عربی شناخته نشد. در جای آرام‌تر و با مایکروفون نزدیک دوباره کوشش کنید.",
  "feedback.reviewUnavailable": "ضبط ذخیره شد، اما این جواب از یک ارزیابی معتبر کلمه به کلمه پشتیبانی کرده نمی‌تواند. قاری واجد شرایط را دوباره بشنوید و در جای آرام‌تر کوشش کنید؛ برای ادا و تجوید نزد استاد بروید.",
  "feedback.wordIndex": "کلمهٔ {number}",
  "feedback.extra": "اضافی",
  "feedback.missing": "شنیده نشد",
  "feedback.review": "مرور",
  "feedback.allMatched": "در این ضبط هر کلمهٔ انتظارشده شناخته شد.",
  "feedback.readAloudToggle": "راهنمایی نو را بلند بخوان",
  "feedback.tryAgain": "بشنوید و دوباره کوشش کنید",
  "feedback.acousticLabel": "مشاهدات صوتی",
  "feedback.acousticAvailable": "مشاهدهٔ تمرینی مشروط به اطمینان",
  "feedback.acousticAbstained": "بررسی صوتی شنید، اما آن‌قدر مطمئن نبود که اصلاحی پیشنهاد کند.",
  "feedback.acousticUnavailable": "بررسی صوتی تخصصی در دسترس نیست. بررسی کلمات شما باز هم آماده است.",
  "feedback.acousticConfidence": "اطمینان صوتی: {percent}%",
  "feedback.acousticPhoneme": "توجه به صدا",
  "feedback.acousticVowelLength": "توجه به درازی حرکت",
  "feedback.acousticPause": "توجه به وقف",
  "feedback.acousticTajweed": "توجه به قاعده",
  "feedback.acousticBoundary": "این را تنها راهنمایی تمرین بگیرید. تجوید، مخرج و درستی دینی را باید یک استاد واجد شرایط تأیید کند.",

  // -- Memorise, side panel and the rest ------------------------------------
  "memorise.eyebrow": "به آرامی به یاد بیاورید",
  "memorise.place": "آیت {number} از {total}",
  "memorise.prompt": "بلند بخوانید، بعد بگذارید دور استاد جای شما را بررسی کند.",
  "memorise.covered": "آیت پوشانده شده است",
  "memorise.meaningHidden": "برای تمرکز بیشتر، معنا پنهان است.",
  "memorise.reveal": "آیت را نشان بده",
  "memorise.cover": "آیت را بپوشان",
  "memorise.toggleMeaning": "نشان دادن یا پنهان کردن معنا",
  "memorise.practise": "بلند تمرین کنید",
  "memorise.practiseAyah": "آیت {number} را تمرین کنید",
  "panel.label": "جزئیات آیت انتخاب‌شده",
  "panel.keepPlace": "جای خود را نگه دارید",
  "panel.save": "ذخیره",
  "panel.saved": "ذخیره شد",
  "panel.audioPlaying": "صدای قاری پخش می‌شود",
  "panel.listenRepeat": "بشنوید و تکرار کنید",
  "panel.reciterFallback": "قاری",
  "panel.ayahNumber": "آیت {number}",
  "panel.listenSelected": "آیت انتخاب‌شده را بشنوید",
  "panel.playingReciter": "قاری پخش می‌شود",
  "panel.audioNote": "صدای قاری واقعی با آواز کامل دستگاه. برای تمرین بهتر از هدفون استفاده کنید.",
  "panel.sequenceEyebrow": "ترتیب امروز",
  "panel.sequenceCopy": "آیت را یک بار بشنوید، با صدای خود تکرار کنید، بعد به آرامی به همان یک جایی برگردید که تمرین می‌خواهد.",
  "panel.thisReading": "این خواندن",
  "panel.progressNote": "یک تکرار با دقت هم پیشرفت مفید است.",
  "dock.label": "کارهای خواندن در موبایل",
  "notFound.title": "صفحه پیدا نشد",
  "notFound.copy": "ببخشید، صفحه‌ای که می‌گردید وجود ندارد. شاید انتقال یافته یا حذف شده باشد.",
  "notFound.goHome": "به صفحهٔ اصلی بروید",
};

export const lessons: LocaleLessons = {
  letters: {
    alif: { articulation: "گلو باز است و هیچ تنگی ندارد. حرکت را می‌گیرد و آوای خود را نمی‌افزاید.", tip: "دهان را آرام و آوا را پاک نگه دارید." },
    ba: { articulation: "هر دو لب به هم می‌آید و سپس با آوایی سبک باز می‌شود.", tip: "لب‌ها پاک باز شود — پس از آن دمیدن نباشد." },
    ta: { articulation: "نوک زبان به بیخ دندان‌های بالا می‌رسد، بدون آوا.", tip: "سبک‌تر و پیش‌تر از ط." },
    tha: { articulation: "نوک زبان لبهٔ دندان‌های بالا را می‌گیرد و هوا از رویش می‌گذرد.", tip: "آوایی نازک و سبک." },
    jeem: { articulation: "میان زبان به سقف دهان بلند می‌شود و با آوا رها می‌گردد.", tip: "لحظه‌ای نگه دارید؛ آوای شتاب‌زده نیست." },
    hha: { articulation: "از میان گلو، دَمی نیرومند و بی‌آوا و بدون خراش.", tip: "از ه جداست، که نرم‌تر و پایین‌تر است." },
    kha: { articulation: "از بالای گلو، با آوایی خراشیده.", tip: "سنگین‌تر از ح و آشکارا خشن‌تر." },
    dal: { articulation: "نوک زبان به بیخ دندان‌های بالا می‌رسد، با آوا.", tip: "جفت آوادار ت." },
    dhal: { articulation: "نوک زبان لبهٔ دندان‌های بالا را می‌گیرد، با آوا.", tip: "همان جای ث، اما با آوا." },
    ra: { articulation: "نوک زبان پشت دندان‌های بالا یک ضربهٔ سبک می‌زند.", tip: "یک ضربهٔ سبک، نه غلتاندن دراز." },
    zay: { articulation: "نوک زبان پشت دندان‌های پایین است و سوتی آوادار می‌گذرد.", tip: "نازک و سبک، نه سنگین." },
    seen: { articulation: "سوتی نازک و بی‌آوا با نوک زبان پشت دندان‌های پایین.", tip: "دهان را هموار نگه دارید؛ ص جفت سنگین آن است." },
    sheen: { articulation: "هوا بر پهنای زبان پخش می‌شود و می‌گذرد.", tip: "پهن‌تر و نرم‌تر از س." },
    sad: { articulation: "همان جای س، اما زبان بلند و دهان پر.", tip: "آوای سنگین؛ با س بسنجید." },
    dad: { articulation: "کنارهٔ زبان به دندان‌های آسیای بالا می‌رسد و آوا سنگین می‌ماند.", tip: "حرف ویژهٔ عربی؛ از استاد بشنوید و بیاموزید." },
    tta: { articulation: "همان جای ت، اما زبان بلند و آوا سنگین.", tip: "جفت سنگین ت." },
    zza: { articulation: "همان جای ذ، اما زبان بلند و آوا سنگین.", tip: "جفت سنگین ذ." },
    ayn: { articulation: "از میان گلو، با آوا و باز.", tip: "ژرف‌تر و نرم‌تر از همزه." },
    ghayn: { articulation: "از بالای گلو، با آوا.", tip: "جفت آوادار خ." },
    fa: { articulation: "لب پایین به دندان‌های بالا می‌رسد و هوا می‌گذرد.", tip: "سبک و پاک." },
    qaf: { articulation: "پس زبان نزدیک گلو بالا می‌رود.", tip: "پس‌تر و سنگین‌تر از ک." },
    kaf: { articulation: "پس زبان به سقف نرم دهان می‌رسد.", tip: "پیش‌تر و سبک‌تر از ق." },
    lam: { articulation: "نوک زبان پشت دندان‌های بالا می‌رسد و هوا از کناره‌ها می‌گذرد.", tip: "سبک، جز در جاهای ویژهٔ لفظ جلاله." },
    meem: { articulation: "هر دو لب بسته می‌شود و آوا از بینی بیرون می‌آید.", tip: "لب‌ها را به نرمی بسته نگه دارید." },
    noon: { articulation: "نوک زبان پشت دندان‌های بالا می‌رسد و آوا از بینی بیرون می‌آید.", tip: "مانند م، اما لب‌ها باز." },
    ha: { articulation: "از ژرفای گلو، دَمی نرم.", tip: "نازک‌تر و نرم‌تر از ح." },
    waw: { articulation: "لب‌ها گرد می‌شود، با آوا.", tip: "همین حرف ضمه را دراز می‌کند." },
    ya: { articulation: "میان زبان به سوی سقف بالا می‌رود، با آوا.", tip: "همین حرف کسره را دراز می‌کند." },
  },
};


/**
 * Qaida course prose in Dari, keyed by the curriculum's own ids. Text only:
 * order, prerequisites, Arabic examples, Quran references and answer
 * correctness stay in the curriculum. Every level is translated; a lesson added
 * to the curriculum appears here in English until its four strings are written,
 * and the coverage test reports it.
 */
export const qaida: QaidaTextPack = {
  lessons: {
    "letters-alif-ba-ta-tha": {
      title: "الف، با، تا، ثا",
      objective: "الف، با، تا و ثا را از روی شکل و نام بشناسید.",
      teaching: "چهار حرف نخست. با، تا و ثا یک شکل دارند و تنها با نقطه‌ها فرق می‌کنند: یکی زیر، دو تا بالا، سه تا بالا. الف یک خط ایستادهٔ تنهاست.",
    },
    "letters-jeem-hha-kha": {
      title: "جیم، حا، خا",
      objective: "جیم، حا و خا را از روی شکل و نام بشناسید.",
      teaching: "سه حرف بر یک شکل. جیم درونش نقطه دارد، حا نقطه ندارد، و خا بالایش نقطه دارد.",
    },
    "letters-dal-dhal": {
      title: "دال و ذال",
      objective: "دال و ذال را از روی شکل و نام بشناسید.",
      teaching: "یک شکل و یک نقطه فرق. دال ساده است؛ ذال بالایش نقطه دارد. هیچ‌کدام به حرف پس از خود نمی‌پیوندد.",
    },
    "letters-ra-zay": {
      title: "را و زی",
      objective: "را و زی را از روی شکل و نام بشناسید.",
      teaching: "شکلی که زیر خط می‌رود. را ساده است، زی بالایش نقطه دارد. مانند دال، این‌ها هم به پس از خود نمی‌پیوندند.",
    },
    "letters-seen-sheen": {
      title: "سین و شین",
      objective: "سین و شین را از روی شکل و نام بشناسید.",
      teaching: "سه دندانه و پس از آن یک کاسه. سین ساده است؛ شین بالایش سه نقطه دارد.",
    },
    "letters-sad-dad": {
      title: "صاد و ضاد",
      objective: "صاد و ضاد را از روی شکل و نام بشناسید.",
      teaching: "یک حلقه و یک کاسه. صاد ساده است؛ ضاد بالایش نقطه دارد. این‌ها جفت‌های سنگین سین و دال‌اند.",
    },
    "letters-tta-zza": {
      title: "طا و ظا",
      objective: "طا و ظا را از روی شکل و نام بشناسید.",
      teaching: "یک حلقه با خط ایستاده. طا ساده است؛ ظا بالایش نقطه دارد. هر دو سنگین‌اند و جدا از تای سبکِ درس نخست نوشته می‌شوند.",
    },
    "letters-ayn-ghayn": {
      title: "عین و غین",
      objective: "عین و غین را از روی شکل و نام بشناسید.",
      teaching: "باز هم یک شکل. عین ساده است؛ غین بالایش نقطه دارد.",
    },
    "letters-fa-qaf": {
      title: "فا و قاف",
      objective: "فا و قاف را از روی شکل و نام بشناسید.",
      teaching: "فا بالایش یک نقطه دارد، قاف دو نقطه. کاسهٔ آن‌ها هم فرق دارد: کاسهٔ قاف زیر خط می‌رود.",
    },
    "letters-kaf-to-ya": {
      title: "از کاف تا یا",
      objective: "کاف، لام، میم، نون، ها، واو و یا را از روی شکل و نام بشناسید.",
      teaching: "هفت حرف پایانی الفبا، هر کدام شکل ویژهٔ خود را دارد.",
    },
    "letters-similar": {
      title: "حرف‌هایی که با نقطه شناخته می‌شوند",
      objective: "حرف‌هایی را که یک تن دارند و تنها با نقطه فرق می‌کنند از هم جدا کنید.",
      teaching: "بیشتر حرف‌های عربی تن خود را با یک یا دو حرف دیگر شریک‌اند. همهٔ فرق در نقطه‌هاست: نخست تن را بخوانید، سپس نقطه‌ها را بشمارید و ببینید بالای خط‌اند یا زیر آن.",
    },
    "letters-similar-shapes": {
      title: "حرف‌های دیگری که آسان اشتباه می‌شوند",
      objective: "جفت‌های سنگین و سبک، و حرف‌هایی را که نوآموز بیشتر به‌جای هم می‌خواند، از هم جدا کنید.",
      teaching: "این جفت‌ها با یک نقطه، یک حلقه یا یک خط فرق می‌کنند. دو تای آن‌ها — ه و ح، ک و ق — ارزش دارد پهلوی هم دیده شوند، چون نوآموز اغلب یکی را به‌جای دیگری می‌خواند. به شکل روی صفحه نگاه کنید؛ اما اینکه هر حرف چگونه گفته می‌شود، آن را از استاد و از قاری بشنوید.",
      boundary: "این جدا کردن شکل‌ها روی صفحه است. اما مخرج هر حرف — اینکه از کدام جای دهان بیرون می‌آید — باید از استاد شایسته شنیده شود؛ تمرین نوشتاری آن را نشان نمی‌دهد و برنامه دربارهٔ آن داوری نمی‌کند.",
    },
    "forms-four-positions": {
      title: "چهار جایگاه",
      objective: "یک حرف را تنها، در آغاز، در میان و در پایان کلمه بخوانید.",
      teaching: "شکل حرف بر پایهٔ جای آن در کلمه دگرگون می‌شود. با تنها ب است، در آغاز بـ، در میان ـبـ و در پایان ـب. تن حرف هر بار همان است — تنها خط‌های پیوند دگرگون می‌شود.",
    },
    "forms-non-connectors": {
      title: "حرف‌هایی که به پس از خود نمی‌پیوندند",
      objective: "شش حرفی را که هرگز به حرف پس از خود نمی‌پیوندند بشناسید.",
      teaching: "شش حرف — ا د ذ ر ز و — به حرف پیش از خود می‌پیوندند اما هرگز به حرف پس از خود نه. کلمه نزد هر یک از آن‌ها می‌شکند، و به همین سبب برخی کلمه‌ها دو کلمه به نظر می‌رسند.",
    },
    "forms-joining-practice": {
      title: "پیوند دادن حرف‌ها",
      objective: "ترکیب‌های کوتاه پیوسته را بخوانید و ببینید شکستگی‌ها کجا می‌افتند.",
      teaching: "ترکیب پیوسته را حرف به حرف از راست به چپ بخوانید. هرجا حرف نپیوندنده بیاید، حرف پس از آن شکل تازه‌ای را آغاز می‌کند.",
    },
    "harakat-fatha": {
      title: "فتحه (زبر)",
      objective: "حرفی را که فتحه دارد بخوانید.",
      teaching: "فتحه خط کوچکی بالای حرف است و به آن آوای کوتاه «اَ» می‌دهد: بَ «بَ» خوانده می‌شود و تَ «تَ».",
    },
    "harakat-kasra": {
      title: "کسره (زیر)",
      objective: "حرفی را که کسره دارد بخوانید.",
      teaching: "کسره همان خط کوچک است که زیر حرف نوشته می‌شود و آوای کوتاه «اِ» می‌دهد: بِ «بِ» خوانده می‌شود.",
    },
    "harakat-damma": {
      title: "ضمه (پیش)",
      objective: "حرفی را که ضمه دارد بخوانید.",
      teaching: "ضمه واو کوچکی است که بالای حرف نوشته می‌شود و آوای کوتاه «اُ» می‌دهد: بُ «بُ» خوانده می‌شود.",
    },
    "harakat-combinations": {
      title: "ترکیب دو حرف",
      objective: "دو حرف حرکت‌دار را با هم بخوانید، سپس کلمهٔ کوتاه قرآنی را که تنها حرکت‌های کوتاه دارد.",
      teaching: "هر حرف را با حرکت خودش بخوانید، سپس بی‌درنگ به هم بپیوندید: بَتَ «بَ-تَ» خوانده می‌شود. چون این جفت آسان شد، همین خواندن یک کلمهٔ راستین را می‌برد — «هُوَ» از سورهٔ اخلاص دو حرف است و دو حرکت کوتاه، و بس.",
    },
    "tanween-three-marks": {
      title: "سه تنوین",
      objective: "دو زبر، دو زیر و دو پیش را بشناسید.",
      teaching: "تنوین حرکت دوگانه در پایان کلمه است. دو زبر «ـاً» خوانده می‌شود، دو زیر «ـٍ» و دو پیش «ـٌ». دو زبر بیشتر بر الفی می‌نشیند که در پایان نوشته شده است.",
    },
    "tanween-reading": {
      title: "خواندن کلمه‌هایی که به تنوین پایان می‌یابند",
      objective: "کلمهٔ قرآنی‌ای را که به تنوین پایان می‌یابد بخوانید.",
      teaching: "کلمه‌ای که به تنوین پایان می‌یابد، هنگام ادامه دادن با حرکت دوگانه خوانده می‌شود. کلمه را تا پایانش بخوانید و پیش از نشانه نایستید.",
    },
    "madd-long-vowels": {
      title: "سه حرکت دراز (مد)",
      objective: "الف، واو و یای مد را وقتی پس از حرکت هم‌جنس خود می‌آیند بشناسید.",
      teaching: "حرکت کوتاه وقتی دراز می‌شود که حرف هم‌جنس خودش پس از آن بیاید: فتحه با الف (بَا)، ضمه با واو (بُو)، کسره با یا (بِي). دهان همان صدا را درازتر نگه می‌دارد.",
      boundary: "این درس دربارهٔ دیدن مد روی صفحه است. اینکه چقدر نگه داشته شود و چگونه ادا شود، کار استاد واجد شرایط و ضبط قاری است؛ پروگرام آن را اندازه نمی‌گیرد.",
    },
    "madd-short-vs-long": {
      title: "کوتاه در برابر دراز",
      objective: "حرکت کوتاه را از جفت دراز آن در یک نگاه فرق کنید.",
      teaching: "بَ و بَا همان حرف با همان حرکت است؛ الف است که آن را دراز می‌کند. یکسان خواندن این دو، عام‌ترین اشتباه شروع‌کننده‌هاست، و پیش از آنکه اشتباه صدا باشد، اشتباه خواندن است.",
      boundary: "پروگرام تنها می‌بیند که آیا این دو را روی صفحه از هم فرق کرده می‌توانید. اینکه دراز را به اندازهٔ درست نگه داشتید یا نه، کار استاد واجد شرایط است؛ پروگرام آن را اندازه نمی‌گیرد.",
    },
    "sukoon-basics": {
      title: "سکون",
      objective: "حرفی را که سکون دارد بخوانید.",
      teaching: "سکون یک دایرهٔ خرد بالای حرف است. معنایش این است که حرف حرکت خود را ندارد: صدایی را که پیش از آن آمده می‌بندد. بَبْ «بَب» خوانده می‌شود.",
    },
    "sukoon-quran-words": {
      title: "سکون در کلمات قرآنی",
      objective: "کلمات کوتاه قرآنی را که حرف ساکن دارند بخوانید.",
      teaching: "بیشتر کلمات قرآنی یک حرف حرکت‌دار را به یک حرف ساکن وصل می‌کنند. اول حرف حرکت‌دار را بخوانید، بعد آن را روی حرف ساکن ببندید، بدون آنکه حرکتی از خود اضافه کنید.",
    },
    "shaddah-basics": {
      title: "شده",
      objective: "حرف مشدد را بخوانید.",
      teaching: "شده نشانی خرد بالای حرف است، مانند یک «و» گِرد. آن حرف را دوچند می‌کند: اولی سکون دارد و دومی حرکت، پس حرف نگه داشته می‌شود، نه اینکه دو بار گفته شود. به همین سبب سکون پیشتر می‌آید — شده یک حرف ساکن است که به یک حرف حرکت‌دار وصل شده است.",
    },
    "shaddah-quran-words": {
      title: "شده در کلمات قرآنی",
      objective: "کلمات قرآنی را که شده دارند بخوانید.",
      teaching: "شده در سراسر قرآن هست و کلمه را تغییر می‌دهد: حرف مشدد را همچون یک صدای نگه‌داشته بخوانید، نه دو حرف جدا.",
    },
    "lam-sun-moon": {
      title: "حروف شمسی و حروف قمری",
      objective: "«ال» را پیش از هر دو نوع حرف درست بخوانید.",
      teaching: "پیش از حرف قمری، لام «ال» خوانده می‌شود و سکون دارد: الْحَمْدُ. پیش از حرف شمسی، لام خوانده نمی‌شود؛ به جایش حرف بعدی دوچند می‌شود و شده می‌گیرد: الصِّرَاطَ. مصحف خودش نشان می‌دهد: سکون بالای لام را ببینید، یا شده را بالای حرف پس از آن.",
    },
    "lam-reading-practice": {
      title: "خواندن «ال» در متن",
      objective: "کلمات دارای «ال» را بخوانید، بدون آنکه بایستید و فکر کنید چه نوع حرفی پس از آن آمده.",
      teaching: "با تمرین، شده و سکون کار را برای شما می‌کنند: همان را می‌خوانید که نوشته شده است. این‌ها را به نوبت بلند بخوانید و ببینید لام هر بار چگونه رفتار می‌کند.",
    },
    "hamzah-seats": {
      title: "همزه و کرسی‌های آن",
      objective: "همزه را روی الف، واو و یا بخوانید.",
      teaching: "همزه صدای خودش را دارد و یا «ء» نوشته می‌شود یا روی یک کرسی می‌نشیند: أ و إ روی الف، ؤ روی واو، ئ روی یا. کرسی املاست، نه صدا — همزه روی همهٔ آن‌ها یکسان خوانده می‌شود.",
    },
    "hamzah-wasl": {
      title: "همزهٔ وصل",
      objective: "الفی را بشناسید که با شروع از آن خوانده می‌شود و با ادامه از کلمهٔ پیشین از آن می‌گذرید.",
      teaching: "الف «ال»، و الف کلماتی مانند اهْدِنَا، الف وصل است. اگر جمله را از آن شروع کنید، خوانده می‌شود؛ اگر از کلمهٔ پیشین به آن ادامه دهید، از آن می‌گذرید و مستقیم به حرف بعدی می‌روید. بسیاری از مصحف‌ها آن را «ٱ» می‌نویسند، با نشانی خرد شبیه ص، تا نشان دهد از آن گذشته می‌شود.",
    },
    "hamzah-orthography": {
      title: "سه شکل نوشتاری: ى، ة و الف خرد",
      objective: "سه شکل نوشتاری را بخوانید که شروع‌کننده در مصحف پیوسته می‌بیند.",
      teaching: "سه شکل که باید با دیدن بشناسید. «ى» مانند یاست اما نقطه ندارد، و در آخر کلمه «ا»ی دراز خوانده می‌شود — نامش الف مقصوره است. «ة» یک ها با دو نقطه است که تای مربوطه نام دارد؛ وقتی به کلمهٔ بعدی ادامه می‌دهید «ت» بخوانیدش، و وقتی روی آن می‌ایستید «ه». الف خرد یک الف کوچک است که بالای حرف نوشته می‌شود: آنجا «ا»ی دراز بخوانید، هرچند الف کامل نوشته نشده است.",
    },
    "tajweed-qalqalah": {
      title: "حروف قلقله",
      objective: "پنج حرف قلقله را وقتی سکون دارند بشناسید.",
      teaching: "پنج حرف — ق ط ب ج د، که با «قطب جد» به یاد می‌مانند — وقتی سکون دارند یا روی آن‌ها می‌ایستید، انعکاس کوچکی می‌دهند. این درس تنها شناختن آن‌ها روی صفحه است.",
      boundary: "شناختن حرف قلقله یک مهارت خواندن است. اینکه قلقلهٔ شما درست ادا شد یا نه، کار استاد واجد شرایط است؛ پروگرام از روی متن نوشته‌شده دربارهٔ آن قضاوت نمی‌کند.",
    },
    "tajweed-noon-sakinah": {
      title: "نون ساکنه و تنوین",
      objective: "نون ساکن و تنوین را بشناسید و بدانید که حرف پس از آن‌ها تعیین می‌کند کدام یک از چهار حالت به کار می‌رود.",
      teaching: "نون ساکن و تنوین بر اساس حرفی که پس از آن‌ها می‌آید به یکی از چهار گونه خوانده می‌شوند: اظهار (آشکار گفتن)، ادغام (داخل شدن در حرف بعدی)، اقلاب (برگرداندن به سوی میم)، اخفا (پنهان میان این دو). در این سطح یاد می‌گیرید که نون و تنوین را روی صفحه ببینید و بدانید چهار امکان وجود دارد — اینکه کدام یک به کار می‌رود و هر یک چگونه گفته می‌شود، با استاد و با شنیدن قاری یاد گرفته می‌شود.",
      boundary: "این‌ها نام‌های همان چیزی‌اند که نوشته شده است. پروگرام ارزیابی نمی‌کند که اخفا، ادغام یا غنهٔ شما درست ادا شد یا نه — تنها یک استاد واجد شرایط، یا یک ارزیابی صوتی تخصصی، می‌تواند در این باره سخن بگوید.",
    },
    "tajweed-meem-ghunnah": {
      title: "میم ساکنه و غنه",
      objective: "میم ساکن را بشناسید، و آن نشانی را که می‌گوید نون یا میم با غنه نگه داشته می‌شود.",
      teaching: "میم ساکن سه حالت از خود دارد، و هر نون یا میمی که شده داشته باشد با غنه — یعنی صدای نرم بینی — خوانده می‌شود. روی صفحه، شده را بجویید.",
      boundary: "این شناختن روی صفحه است. اینکه غنه چقدر نگه داشته می‌شود و چگونه باید شنیده شود، از استاد واجد شرایط و از شنیدن قاری می‌آید؛ پروگرام آن را اندازه نمی‌گیرد.",
    },
    "symbols-stop-marks": {
      title: "نشانه‌های وقف",
      objective: "حروف خردی را بشناسید که بالای سطر چاپ می‌شوند و می‌گویند کجا ایستاده می‌توانید.",
      teaching: "مصحف جاهای وقف را با حروف خرد نشانی می‌کند: م وقف لازم، لا اینجا نایستید، ج وقف جایز است، قلى وقف بهتر است، صلى ادامه بهتر است. این‌ها کمکِ خواندن‌اند و برای آن گذاشته شده‌اند که معنا نشکند.",
      boundary: "این نشانه‌ها می‌گویند وقف کجا جایز یا بهتر است. اینکه برای معنا کجا بایستید و بعد از کجا شروع کنید، با راهنمایی استاد واجد شرایط است؛ پروگرام نمی‌بیند که کجا ایستادید.",
    },
    "symbols-small-marks": {
      title: "نشانه‌های خرد در متن",
      objective: "نشانه‌های خردی را بشناسید که در خود کلمات چاپ می‌شوند.",
      teaching: "جز نشانه‌های وقف، مصحف در خود سطر هم نشانه‌های خرد چاپ می‌کند: همان الف خرد که پیشتر دیدید، برای «ا»ی دراز جایی که الف نوشته نشده؛ نشان مد موج‌دار «ٓ» که می‌گوید این حرکت دراز بیشتر از معمول نگه داشته می‌شود؛ و شمارهٔ آیت در گل خودش در پایان هر آیت.",
      boundary: "شناختن یک نشانه، مهارت خواندن است. اینکه مد چقدر نگه داشته می‌شود با استاد واجد شرایط تعیین می‌شود؛ پروگرام آن را اندازه نمی‌گیرد.",
    },
    "quran-words": {
      title: "کلمات قرآنی",
      objective: "کلمات تنهای قرآنی را بخوانید که هر چه تا اینجا آموخته‌اید در آن‌ها به کار رفته است.",
      teaching: "تقریباً هر چه دیده‌اید در همین چهار کلمه می‌آید: حرف ساکن، حرکت دراز، شده، حرف شمسی و حرف قمری، و الف خرد. هر کدام را آهسته بخوانید، بعد یک بار دیگر با سرعت یکنواخت.",
    },
    "quran-phrases": {
      title: "دو کلمه با هم",
      objective: "دو کلمهٔ قرآنی را در یک ترکیب بخوانید، بدون توقف در میان آن‌ها.",
      teaching: "کلمات تنها بخش دشوارند؛ وصل کردن آن‌ها گام بعدی است. هر جفت را یکسره بخوانید، بدون مکث در وسط، بعد بشنوید که قاری همان ترکیب را چگونه می‌خواند و همراهش بروید.",
    },
    "quran-first-ayah": {
      title: "نخستین آیت شما",
      objective: "یک آیت کامل را از مصحف بخوانید.",
      teaching: "کلماتی که همین حالا خواندید یک آیت می‌سازند. آن را در بخش تمرین باز کنید: متن از معلومات قرآنی خود پروگرام می‌آید، و اول یک قاری واجد شرایط برای شنیدن هست.",
    },
    "quran-short-ayat": {
      title: "آیت‌های کوتاه",
      objective: "چند آیت کوتاه را پشت سر هم بخوانید.",
      teaching: "این‌ها را یکی پس از دیگری بخوانید، اول کوتاه‌ترین. هر کدام آن‌قدر کوتاه است که در یک نفس بگنجد، و هر کدام تنها همان حروف، حرکت‌ها و نشانه‌هایی را دارد که اکنون می‌شناسید.",
    },
    "quran-short-surah": {
      title: "یک سورهٔ کامل، ضبط‌شده",
      objective: "یک سورهٔ کوتاه کامل را تمام کنید و هر آیت را برای بررسی کلمات ضبط کنید.",
      teaching: "گام آخر قاعده، نخستین گام تمرین تلاوت شماست. در درس پیش آیت اول سورهٔ اخلاص را خواندید؛ این سه آیت آن را کامل می‌کنند. هر کدام را در بخش تمرین باز کنید، قاری را بشنوید، بعد صدای خود را ضبط کنید. بررسی به شما می‌گوید کدام کلمات شناخته شدند و از کجا دوباره شروع کنید — این یک بررسی خواندن است، نه قضاوت دربارهٔ زیبایی تلاوت.",
      boundary: "بررسی ضبط‌شده تنها کلمات نوشته‌شده را با آیت مقایسه می‌کند. تجوید، مخرج، درازی مد یا غنه را ارزیابی نمی‌کند.",
    },
  },
  exercises: promptsFromPhrasebook(QAIDA_LESSONS, {
    "Which of these is Thaa?":
      "کدام یک از این‌ها ثاست؟",
    "Which of these is Haa?":
      "کدام یک از این‌ها حاست؟",
    "Which of these is Dhaal?":
      "کدام یک از این‌ها ذال است؟",
    "Which of these is Zaay?":
      "کدام یک از این‌ها زای است؟",
    "Which of these is Seen?":
      "کدام یک از این‌ها سین است؟",
    "Which of these is Daad?":
      "کدام یک از این‌ها ضاد است؟",
    "Which of these is Zaa?":
      "کدام یک از این‌ها ظاست؟",
    "Which of these is Ayn?":
      "کدام یک از این‌ها عین است؟",
    "Which of these is Qaaf?":
      "کدام یک از این‌ها قاف است؟",
    "Which of these is Haa (soft)?":
      "کدام یک از این‌ها های نرم است؟",
    "Which of these is Kaaf?":
      "کدام یک از این‌ها کاف است؟",
    "Which shows a fatha followed by alif?":
      "کدام یک فتحه‌ای را نشان می‌دهد که الف پس از آن آمده؟",
    "Which shows a damma followed by waw?":
      "کدام یک ضمه‌ای را نشان می‌دهد که واو پس از آن آمده؟",
    "Which of these is the long one?":
      "کدام یک از این‌ها دراز است؟",
    "Read this word from the Quran aloud, holding the long vowel.":
      "این کلمهٔ قرآنی را بلند بخوانید و حرکت دراز را نگه دارید.",
    "What does this small circle above the letter mean?":
      "این دایرهٔ خرد بالای حرف چه معنا دارد؟",
    "How does this read?":
      "این چگونه خوانده می‌شود؟",
    "Read this word from the Quran aloud, closing the Laam without a vowel.":
      "این کلمهٔ قرآنی را بلند بخوانید و لام را بدون حرکت ببندید.",
    "Read this one aloud — two sakin letters in the same word.":
      "این یکی را بلند بخوانید — دو حرف ساکن در یک کلمه.",
    "In this word, which letter carries the sukoon?":
      "در این کلمه، کدام حرف سکون دارد؟",
    "What does the shaddah tell you to do?":
      "شده به شما می‌گوید چه کنید؟",
    "Which shows a shaddah carrying kasra?":
      "کدام یک شده‌ای را نشان می‌دهد که کسره دارد؟",
    "Which of these words carries a shaddah?":
      "کدام یک از این کلمات شده دارد؟",
    "In الْحَمْدُ, is the Laam of ال read?":
      "در الْحَمْدُ، آیا لام «ال» خوانده می‌شود؟",
    "In الصِّرَاطَ, why is there a shaddah on the Saad?":
      "در الصِّرَاطَ، چرا بالای صاد شده هست؟",
    "Read this aloud — a sun letter, so the Laam merges into it.":
      "این را بلند بخوانید — حرف شمسی است، پس لام در آن داخل می‌شود.",
    "Read this aloud — a moon letter, so the Laam is read with its sukoon.":
      "این را بلند بخوانید — حرف قمری است، پس لام با سکون خود خوانده می‌شود.",
    "Which one carries a kasra, with the hamzah written below the alif?":
      "کدام یک کسره دارد، با همزه‌ای که زیر الف نوشته شده؟",
    "In ئ, what is the hamzah sitting on?":
      "در ئ، همزه بالای چه نشسته است؟",
    "You are continuing from the previous word into ال. What happens to its alif?":
      "از کلمهٔ پیشین به «ال» ادامه می‌دهید. بر سر الف آن چه می‌آید؟",
    "Start on this word and read it aloud, sounding the opening alif.":
      "از همین کلمه شروع کنید و بلند بخوانیدش، الف آغازین را ادا کنید.",
    "How is ى at the end of a word read?":
      "«ى» در آخر کلمه چگونه خوانده می‌شود؟",
    "What does a small alif printed above a letter tell you?":
      "الف خردی که بالای یک حرف چاپ شده به شما چه می‌گوید؟",
    "You stop at the end of a word ending in ة. How is it read?":
      "روی کلمه‌ای می‌ایستید که به «ة» تمام می‌شود. چگونه خوانده می‌شود؟",
    "Which of these is a qalqalah letter?":
      "کدام یک از این‌ها حرف قلقله است؟",
    "Which of these words ends in a qalqalah letter, so it echoes when you stop on it?":
      "کدام یک از این کلمات به حرف قلقله تمام می‌شود، طوری که با ایستادن روی آن انعکاس می‌دهد؟",
    "Which of these carries a Noon with sukoon?":
      "کدام یک از این‌ها نون ساکن دارد؟",
    "Tanween follows the same four cases as a sakin Noon. Which of these carries tanween?":
      "تنوین هم مانند نون ساکن همان چهار حالت را دارد. کدام یک از این‌ها تنوین دارد؟",
    "Which of these is read with ghunnah?":
      "کدام یک از این‌ها با غنه خوانده می‌شود؟",
    "Which mark on a Noon or a Meem tells you the reader holds a ghunnah there?":
      "کدام نشانی بالای نون یا میم می‌گوید که خواننده آنجا غنه را نگه می‌دارد؟",
    "What does لا above the line mean?":
      "«لا» بالای سطر چه معنا دارد؟",
    "What does م above the line mean?":
      "«م» بالای سطر چه معنا دارد؟",
    "What does قلى tell the reader?":
      "«قلى» به خواننده چه می‌گوید؟",
    "What is the decorated circle at the end of an ayah?":
      "دایرهٔ آراسته در پایان آیت چیست؟",
    "What does the wavy madd sign above a letter tell the reader?":
      "نشان موج‌دار مد بالای یک حرف به خواننده چه می‌گوید؟",
    "Read this word aloud.":
      "این کلمه را بلند بخوانید.",
    "Read this word aloud — a sun letter and a long vowel.":
      "این کلمه را بلند بخوانید — یک حرف شمسی و یک حرکت دراز.",
    "Read these two words as one phrase.":
      "این دو کلمه را همچون یک ترکیب بخوانید.",
    "Read this phrase — a sun letter, then a held Laam.":
      "این ترکیب را بخوانید — یک حرف شمسی، بعد لامی که نگه داشته می‌شود.",
    "Listen to the reciter, then read this ayah aloud.":
      "قاری را بشنوید، بعد این آیت را بلند بخوانید.",
    "Start with the shortest — one word. Listen, then read it aloud.":
      "از کوتاه‌ترین شروع کنید — یک کلمه. بشنوید، بعد بلند بخوانیدش.",
    "Now four words, all of them familiar by this point.":
      "حالا چهار کلمه، که تا این جا همه برای شما آشنا شده‌اند.",
    "And the ayah your phrases came from.":
      "و همان آیتی که ترکیب‌های شما از آن آمده بودند.",
    "You have read the first ayah of al-Ikhlas. Carry on: listen, then record the second.":
      "آیت اول سورهٔ اخلاص را خواندید. ادامه دهید: بشنوید، بعد آیت دوم را ضبط کنید.",
    "The third ayah.":
      "آیت سوم.",
    "And the fourth, which completes the surah.":
      "و چهارم، که سوره را کامل می‌کند.",
    "Which letter is this?": "این کدام حرف است؟",
    "Play the recording, then choose the letter you heard.": "ضبط را پخش کنید، سپس حرفی را که شنیدید برگزینید.",
    "Which two letters make this combination?": "این ترکیب از کدام دو حرف ساخته شده است؟",
    "How does this combination read?": "این ترکیب چگونه خوانده می‌شود؟",
    "Read this Quranic word aloud, then continue.": "این کلمهٔ قرآنی را بلند بخوانید، سپس ادامه دهید.",
    "Read this teaching combination aloud, then continue.": "این ترکیب آموزشی را بلند بخوانید، سپس ادامه دهید.",
    "Read this aloud, then continue.": "این را بلند بخوانید، سپس ادامه دهید.",
    "Which is Baa at the beginning of a word?": "کدام یک با در آغاز کلمه است؟",
    "Which is Noon in the middle of a word?": "کدام یک نون در میان کلمه است؟",
    "Which is Meem at the end of a word?": "کدام یک میم در پایان کلمه است؟",
    "Which of these does not join to the letter after it?": "کدام یک از این‌ها به حرف پس از خود نمی‌پیوندد؟",
    "Which of these does join forward?": "کدام یک از این‌ها به پس از خود می‌پیوندد؟",
    "Which one reads 'ba'?": "کدام یک «بَ» خوانده می‌شود؟",
    "Which one reads 'bi'?": "کدام یک «بِ» خوانده می‌شود؟",
    "Which one reads 'bu'?": "کدام یک «بُ» خوانده می‌شود؟",
    "Which one reads 'nu'?": "کدام یک «نُ» خوانده می‌شود؟",
    "Which one reads 'bun'?": "کدام یک «بٌ» خوانده می‌شود؟",
    "What is the mark above this letter called?": "نام نشانهٔ بالای این حرف چیست؟",
    "Where is a kasra written?": "کسره کجا نوشته می‌شود؟",
    "What is this ending called?": "نام این پایانه چیست؟",
    "Which ending does this word carry?": "این کلمه کدام پایانه را دارد؟",
  }, {
    "Listen to the reciter's recording for how the echo sounds. This exercise only asks you to spot the letter.":
      "اینکه انعکاس چگونه شنیده می‌شود، از ضبط قاری بشنوید. این تمرین تنها از شما می‌خواهد حرف را پیدا کنید.",
    "Which of the four cases applies, and how each one sounds, is learned with a teacher and by listening to the reciter.":
      "اینکه کدام یک از چهار حالت به کار می‌رود و هر یک چگونه شنیده می‌شود، با استاد و با شنیدن قاری یاد گرفته می‌شود.",
    "How much longer is settled by the way you were taught to recite, with a qualified teacher. The sign only tells you that it is longer.":
      "اینکه چقدر درازتر نگه داشته شود، با شیوهٔ تلاوتی که آموخته‌اید و با استاد واجد شرایط تعیین می‌شود. نشانه تنها می‌گوید که درازتر است.",
    "The recording is a qualified reciter's, played as a reference. The app is not listening to you here.":
      "ضبط از یک قاری شایسته است و تنها برای راهنمایی پخش می‌شود. برنامه اینجا به شما گوش نمی‌دهد.",
  }),
};

export default { manifest, strings, lessons, qaida };
