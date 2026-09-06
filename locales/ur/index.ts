/**
 * Urdu — complete pack.
 *
 * Everything a learner reads is in Urdu: the interface, the teacher's
 * instructions, the study controls, all 28 articulation notes, the coaching
 * plans, and the whole Qaida course prose — every lesson and every exercise
 * prompt. Nothing falls back to English, and a coverage test fails the day
 * something does.
 *
 * The wording follows how a qaida is taught in Urdu rather than the English
 * sentence order. Established Arabic terms (سکون، شد، تنوین، قلقلہ، غنہ،
 * تجوید، مخرج) are kept and explained in Urdu where a lesson introduces
 * them.
 *
 * The Quran itself is untouched by this file: its Arabic text, the ayah
 * recitations and the letter recordings are shared by every language.
 *
 * NOT YET REVIEWED BY A NATIVE SPEAKER. `nativeReviewed: false` in
 * shared/languages.ts records that. Religious terms (آیت، سورت، تجوید) keep
 * their standard Urdu form rather than being paraphrased.
 */
import type { LocaleLessons, LocaleManifest } from "../types";
import type { TranslatableStrings } from "../index";
import { QAIDA_LESSONS } from "../../shared/qaidaCurriculum";
import { promptsFromPhrasebook, type QaidaTextPack } from "../../shared/qaidaText";
import { SUPPORTED_LANGUAGES } from "../../shared/languages";

export const manifest: LocaleManifest = { ...SUPPORTED_LANGUAGES.ur };

export const strings: TranslatableStrings = {
  "now.label": "اب کیا کرنا ہے",
  "now.place": "آیت {ayah} از {total}",
  "now.placeWord": "لفظ {number}",
  "now.listening": "سن رہا ہوں…",
  "now.reviewing": "آپ کی تلاوت دیکھی جا رہی ہے…",
  "now.recordAgain": "یہ ریکارڈنگ جانچی نہیں جا سکی",
  "now.unclear": "یہ اتنا واضح نہیں تھا کہ جانچا جا سکے",
  "now.repeatWord": "لفظ {number} دہرائیں",
  "now.repeatWordAgain": "یہی لفظ دوبارہ — لفظ {number}",
  "now.repeatWordSound": "لفظ {number} غور سے سنیں، پھر دہرائیں",
  "now.repeatAyah": "آیت {number} دوبارہ پڑھیں",
  "now.continueFromWord": "لفظ {number} سے جاری رکھیں",
  "now.nextAyah": "آیت مکمل — آیت {number} کی طرف بڑھیں",
  "now.surahComplete": "آپ اس سورت کے اختتام تک پہنچ گئے",
  "now.reviewToday": "آج اس آیت کا دہرانا ہے",
  "now.listenFirst": "پہلے سنیں، پھر آیت پڑھیں",
  "now.repeat": "دہرائیں",
  "now.tryAgain": "دوبارہ کوشش کریں",
  "now.goToAyah": "آیت {number} پر جائیں",
  "now.stepsLabel": "اس کی مشق کیسے کریں",

  "correction.label": "وہ لفظ جو درست کرنا ہے",
  "correction.notHeard": "یہ لفظ سنائی نہیں دیا۔",
  "correction.different": "اس کی جگہ کچھ اور سنائی دیا۔",
  "correction.sound": "الفاظ درست تھے۔ اس لفظ کی ادائیگی غور سے سنیں۔",
  "correction.unsure": "یہ اتنا واضح نہیں تھا کہ یقین سے کہا جا سکے۔",
  "correction.listen": "آیت آہستہ سنیں",
  "correction.retry": "سنیں، لفظ دہرائیں، پھر پوری آیت پڑھیں۔",
  "correction.wordAt": "لفظ {number}",

  "step.showWord": "لفظ دیکھیں",
  "step.listen": "سنیں",
  "step.repeatWord": "لفظ دہرائیں",
  "step.reciteAyah": "آیت پڑھیں",
  "step.recordAgain": "دوبارہ ریکارڈ کریں",

  "study.hearReciter": "قاری کو سنیں",
  "study.reciterPlaying": "قاری پڑھ رہے ہیں",
  "study.record": "میری تلاوت ریکارڈ کریں",
  "study.stopRecording": "روکیں اور جائزہ لیں",
  "study.reviewing": "جانچا جا رہا ہے…",
  "study.listenSlowly": "آہستہ سنیں",
  "study.previous": "پچھلی",
  "study.next": "اگلی",
  "study.ayah": "آیت",
  "recorder.intro": "قاری کو سنیں، پھر اپنی تلاوت ریکارڈ کریں۔",
  "recorder.listening": "اب سن رہا ہوں۔ آیت اطمینان سے پڑھیں، پھر روکیں اور جائزہ لیں دبائیں۔",
  "recorder.reviewing": "آپ کے پڑھے ہوئے الفاظ دیکھے جا رہے ہیں…",
  "recorder.reviewReady": "الفاظ کا جائزہ تیار ہے۔ قاری کو دوبارہ سنیں، پھر نشان زدہ مقام دہرائیں۔",
  "recorder.retryNow": "دوبارہ ریکارڈ کریں",

  "mode.read": "پڑھیں",
  "mode.learn": "سیکھیں",
  "mode.study": "مشق",
  "mode.memorise": "حفظ",
  "dock.read": "پڑھیں",
  "dock.practise": "مشق",
  "dock.recall": "دہرائیں",
  "notes.summary": "استاد کے نوٹس",
  "language.label": "انٹرفیس کی زبان",

  "mastery.new": "نئی",
  "mastery.learning": "سیکھی جا رہی ہے",
  "mastery.needs_review": "دہرانے کی ضرورت",
  "mastery.strong": "مضبوط",
  "mastery.mastered": "پختہ",

  "course.continue": "جاری رکھیں",
  "course.tryAgain": "دوبارہ کوشش کریں",
  "course.readAloud": "میں نے بلند آواز میں پڑھا",
  "course.completedBadge": "مکمل",
  "course.locked": "پہلے کے اسباق مکمل کریں",

  // -- Supporting interface -------------------------------------------------
  "nav.sectionLabel": "آپ کا مقام",
  "nav.today": "آج",
  "nav.library": "میری لائبریری",
  "nav.bookmarks": "نشان زدہ",
  "nav.practiceTitle": "آج کی مشق",
  "nav.practiceCopy": "سنیں، دہرائیں، لوٹیں۔",
  "nav.minutesShort": "منٹ",
  "language.partial": "صرف انٹرفیس",
  "language.aiDrafted": "اے آئی مسودہ، اہلِ زبان نے نہیں دیکھا",
  "language.hint": "عربی متن اور تلاوت ہر زبان میں ایک ہی رہتی ہے۔",
  "mode.label": "پڑھنے کا انداز",
  "mode.readCaption": "صفحہ پڑھیں",
  "mode.learnCaption": "حروف سے تلاوت تک",
  "mode.studyCaption": "استاد کے ساتھ مشق",
  "mode.memoriseCaption": "چھپائیں، یاد کریں، دہرائیں",
  "study.ayahOf": "از {total}",
  "study.lessonLabel": "تلاوت کا سبق",
  "study.eyebrow": "رہنمائی کے ساتھ تلاوت",
  "study.heading": "سنیں۔ دہرائیں۔ جائزہ لیں۔",
  "study.badge": "استاد کا طریقہ",
  "study.stageListen": "سنیں",
  "study.stageRepeat": "آپ کی باری",
  "study.stageReview": "جائزہ",
  "study.chooseAyah": "آیت {number} منتخب کریں",
  "playback.previous": "پچھلی آیت",
  "playback.next": "اگلی",
  "playback.listen": "سنیں",
  "playback.pause": "روکیں",
  "playback.place": "آیت {number} از {total}",
  "playback.keepPlaying": "چلتا رہنے دیں",

  // -- Teacher notes --------------------------------------------------------
  "notes.observedLabel": "اس کوشش میں کیا سامنے آیا",
  "notes.observedMissing": "لفظ {number} سنائی نہیں دیا۔",
  "notes.observedReview": "لفظ {number} مختلف انداز میں آیا۔",
  "notes.observedRecurring": "لفظ {number} پہلے بھی محنت مانگ چکا ہے۔",
  "notes.observedExtra": "{count} اضافی الفاظ سنائی دیے۔",
  "notes.observedAcoustic": "لفظ {number} کی آواز کے بارے میں ایک مشاہدہ ہے۔",
  "notes.observedBoundary": "یہ مشاہدات ہیں، آپ کی تلاوت پر فیصلہ نہیں۔ کرنا کیا ہے، وہ اوپر ایک ہی ہدایت میں ہے۔",
  "notes.hint": "آپ کا نتیجہ، اس آیت کے ساتھ آپ کی تاریخ، اور مشق کا منصوبہ۔",
  "notes.placeLabel": "آپ کہاں ہیں",
  "notes.whyLabel": "کیوں",

  // -- Memorisation and review ---------------------------------------------
  "memory.eyebrow": "یہ آیت اب تک",
  "memory.reviewToday": "آج دہرانا ہے۔",
  "memory.nextReview": "اگلا دہرانا: {date}۔",
  "memory.none": "دہرانے کا شیڈول شروع کرنے کے لیے یہ آیت ایک بار پڑھیں۔",
  "memory.repeatedOmission": "یہاں لفظ {number} اکثر رہ جاتا ہے۔",
  "memory.repeatedSubstitution": "لفظ {number} بار بار توجہ مانگتا ہے۔",
  "memory.streak": "مسلسل {count} صاف دہرائیاں",
  "memory.overview": "{due} آج، {weak} کو دہرانا ہے، {strong} مضبوط",
  "memory.practiceNext": "اگلی مشق",
  "memory.nextIs": "سورت {surah}، آیت {ayah}",
  "memory.startNew": "نئی آیت شروع کریں",

  // -- Where you are (secondary detail) -------------------------------------
  "follow.label": "آپ کہاں ہیں",
  "follow.eyebrow": "آپ کا مقام",
  "follow.ayah": "آیت {number}",
  "follow.stateFollowing": "جاری رکھیں",
  "follow.stateCorrecting": "دوبارہ کوشش",
  "follow.stateUncertain": "یقین نہیں",
  "follow.stateCompleted": "مکمل",
  "follow.continueAt": "لفظ {number} سے جاری رکھیں۔",
  "follow.surahComplete": "آپ اس سورت کے اختتام تک پہنچ گئے۔",
  "follow.correctionFocus": "پہلے لفظ {number} پر لوٹیں:",
  "follow.moveToAyah": "آیت {number} کے ساتھ جاری رکھیں",
  "follow.stayOnAyah": "آیت {number} دوبارہ پڑھیں",
  "follow.reasonNoTranscript": "کچھ قابلِ استعمال سنائی نہیں دیا، اس لیے آپ کا مقام وہیں ہے۔",
  "follow.reasonTooLittleEvidence": "اس آیت کا اتنا حصہ پہچانا نہیں گیا کہ مقام آگے بڑھایا جائے۔",
  "follow.reasonNoisyTranscript": "ریکارڈنگ میں اس آیت سے باہر کے کئی الفاظ تھے، اس لیے مقام وہیں ہے۔ کسی پرسکون جگہ دوبارہ کوشش کریں۔",
  "follow.reasonPreviousAyah": "یہ پچھلی آیت سے ملتا ہے، اس لیے آپ کا مقام اسی آیت پر رکھا گیا ہے۔",
  "follow.reasonNextAyahEarly": "یہ اگلی آیت کا آغاز تھا۔ پہلے یہ آیت مکمل کریں۔",
  "follow.reasonPartialProgress": "آیت کا کچھ حصہ پہچانا گیا۔ نیچے دیے گئے لفظ سے جاری رکھیں۔",
  "follow.reasonMistakeToCorrect": "آیت ایک ایسے لفظ سے آگے چلی گئی جو میل نہیں کھایا۔ نیچے دیے گئے لفظ پر لوٹیں۔",
  "follow.reasonAyahCompleted": "یہ آیت آخر تک پڑھی گئی۔",
  "follow.reasonSurahCompleted": "یہ اس سورت کی آخری آیت تھی۔",
  "follow.boundary": "آپ کا مقام صرف ان الفاظ سے رکھا جاتا ہے جو تحریر میں پہچانے گئے۔ یہ تجوید، مخرج، مد، لحن یا رفتار کے بارے میں کچھ نہیں کہتا۔",

  // -- Recorder -------------------------------------------------------------
  "recorder.listenSlow": "آہستہ سنیں۔ ہر لفظ پر دھیان دیں، پھر دہرائیں۔",
  "recorder.listenOnce": "ایک بار پورا سنیں۔ تیار ہوں تو آپ کی باری ہے۔",
  "recorder.audioFailed": "آواز شروع نہ ہو سکی۔ اپنے آلے کی آواز دیکھیں، پھر دوبارہ کوشش کریں۔",
  "recorder.retry": "پہلے ایک بار اور سنیں، پھر آیت اپنی آواز میں دہرائیں۔",

  // -- Shell, reader and playback -------------------------------------------
  "app.tagline": "پڑھنے کا منصوبہ",
  "nav.primaryLabel": "بنیادی مینو",
  "reader.eyebrow": "قرآن",
  "reader.surahLabel": "سورت",
  "reader.juzLabel": "پارہ",
  "reader.juzNumbered": "پارہ {number}",
  "reader.reciterLabel": "قاری",
  "reader.translationLabel": "ترجمہ",
  "reader.loadingTranslations": "ترجمے آ رہے ہیں…",
  "reader.surahSearch": "سورتیں تلاش کریں…",
  "reader.surahNoMatch": "اس سے کوئی سورت نہیں ملتی۔",
  "reader.translationUnavailable": "ترجموں کی فہرست نہیں مل سکی۔ طے شدہ انگریزی ترجمہ دکھایا جا رہا ہے۔",
  "reader.searchLabel": "قرآن میں تلاش",
  "reader.settingsLabel": "پڑھنے کی ترتیبات",
  "reader.loadingSurahs": "سورتیں آ رہی ہیں…",
  "reader.loadingJuz": "پارے آ رہے ہیں…",
  "reader.loadingReciters": "قاری آ رہے ہیں…",
  "reader.noReciters": "کسی قاری کی آواز دستیاب نہیں",
  "reader.reciterUnavailable": "{reciter} (آواز دستیاب نہیں)",
  "reader.makki": "مکی",
  "reader.madani": "مدنی",
  "reader.ayahCount": "{count} آیات",
  "reader.versesLabel": "سورت {surah} کی آیات",
  "reader.footerHint": "کسی آیت پر ٹیپ کریں، پھر مشق میں جا کر اسے سنیں اور دہرائیں۔",
  "reader.showMeaning": "معنی دکھائیں",
  "reader.hideMeaning": "معنی چھپائیں",
  "reader.previousAyah": "پچھلی آیت",
  "reader.nextAyah": "اگلی آیت",
  "reader.chapterCopy": "آیت پڑھیں، قاری سے سنیں، خود دہرائیں، پھر اطمینان سے اسی جگہ لوٹیں جہاں مشق درکار ہے۔",
  "reader.loading": "آ رہا ہے…",
  "playback.label": "آیت کی آواز",
  "playback.noAudio": "اس قاری کی اس آیت کی ریکارڈنگ نہیں ہے۔ کوئی دوسرا قاری منتخب کریں۔",
  "playback.audioFailed": "{reciter} کی آواز دستیاب نہیں۔ یہ ریکارڈنگ نہیں چل سکی — کوئی دوسرا قاری منتخب کریں۔",
  "content.loading": "قرآن کا متن اور تلاوت آ رہی ہے…",
  "content.retry": "دوبارہ کوشش کریں",

  // -- Learn: levels and the qaida overview ---------------------------------
  "learn.heading": "قرآن سیکھنے کا آپ کا راستہ",
  "learn.eyebrow": "اپنی سطح پر سیکھیں",
  "learn.copy": "حروفِ تہجی اور ملانے کی صورتوں سے آغاز کریں، پھر کسی اہل استاد کے ساتھ تلاوت کے قواعد کی طرف بڑھیں۔",
  "learn.paceEyebrow": "اپنی رفتار چنیں",
  "learn.paceHeading": "پہلے حروف سے لے کر بغور تلاوت تک۔",
  "learn.levelsLabel": "سیکھنے کے درجے",
  "learn.percentComplete": "{percent}% مکمل",
  "learn.level.qaida": "قاعدہ",
  "learn.level.qaidaSummary": "عربی حروف، مخارج، چھوٹی حرکات اور ملانے کی صورتیں۔",
  "learn.level.qaidaCue": "حروف اور ملانا",
  "learn.level.tajweed": "تجوید",
  "learn.level.tajweedSummary": "تلاوت کے قواعد — مد، غنہ اور وقف — غور سے مشق کیے جاتے ہیں۔",
  "learn.level.tajweedCue": "تلاوت کے قواعد",
  "qaida.eyebrow": "قاعدہ · پہلا سبق",
  "qaida.heading": "الفاظ سے پہلے حروف۔",
  "qaida.copy": "ایک ایک حرف سیکھیں، اس کی آواز سنیں، پھر استاد کے ساتھ اس کی مشق کریں۔",
  "qaida.practisedCount": "مشق شدہ · {percent}%",
  "qaida.alphabetLabel": "عربی حروفِ تہجی",
  "qaida.writtenAs": "لکھا جاتا ہے {transliteration} · {sound}",
  "qaida.playLetter": "حرف",
  "qaida.playLetterLabel": "{letter} اکیلا سنائیں",
  "qaida.playHarakatLabel": "{letter} کو {harakat} کے ساتھ سنائیں",
  "qaida.markPractised": "مشق شدہ کے طور پر نشان لگائیں",
  "qaida.practised": "مشق شدہ",
  "qaida.nextLetter": "اگلا حرف",
  "qaida.audioIdle": "حرف اکیلا یا کسی حرکت کے ساتھ منتخب کریں تاکہ قاری کی آواز سنیں۔",
  "qaida.audioPlaying": "قاری کی ریکارڈنگ چل رہی ہے۔",
  "qaida.audioUnavailable": "یہ ریکارڈنگ ابھی شامل نہیں کی گئی۔ تلاوت کی آواز کسی اہل قاری کی ریکارڈ کی ہوئی ہوتی ہے — یہ ایپ عربی کو مصنوعی انگریزی آواز میں نہیں پڑھے گی۔",
  "qaida.audioAttribution": "حروف کی آواز {source} نے بنائی ہے، جب تک کسی قاری کی ریکارڈنگ اس کی جگہ نہ لے لے۔",
  "qaida.audioIdlePlaceholder": "حرف اکیلا یا کسی حرکت کے ساتھ منتخب کریں تاکہ اسے سنیں۔ یہ آواز مصنوعی ہے، کسی قاری کی نہیں۔",
  "qaida.audioPlayingPlaceholder": "ایک مصنوعی آواز چل رہی ہے، قاری کی ریکارڈنگ نہیں۔",
  "qaida.audioUnavailablePlaceholder": "یہ کلپ ابھی تیار نہیں ہوا۔ ایپ اس کی جگہ عربی کو مصنوعی انگریزی آواز میں نہیں پڑھے گی — انگریزی ان میں سے کئی آوازیں ادا ہی نہیں کر سکتی۔",
  "qaida.audioFormUnavailable": "اس مجموعے میں صرف اکیلے حروف ہیں۔ حرکت والی صورتیں قاری کے مجموعے کے ساتھ آئیں گی — ایپ ان کی جگہ کوئی اور آواز نہیں رکھے گی۔",
  "qaida.quickCheck": "مختصر جانچ",
  "qaida.quickCheckPrompt": "یہ کون سا حرف ہے؟",
  "qaida.quickCheckCorrect": "درست۔ جب آپ اسے اپنے استاد کے ساتھ ادا کر لیں، تو اس حرف کو مشق شدہ نشان کر سکتے ہیں۔",
  "qaida.quickCheckRetry": "ابھی نہیں۔ حرف کی شکل دیکھیں، حرف دوبارہ سنائیں، اور ایک بار پھر کوشش کریں۔",
  "qaida.boundary": "اکیلے حروف کی آواز کو خودکار نمبر نہیں دیے جاتے۔ اے آئی آپ کی مشق کو ترتیب دینے میں مدد دے سکتا ہے، مگر ادائیگی اور مخرج کی تصدیق کسی اہل استاد سے ہونی چاہیے۔",
  "harakat.fatha": "فتحہ (زبر)",
  "harakat.fathaHint": "چھوٹی اَ",
  "harakat.kasra": "کسرہ (زیر)",
  "harakat.kasraHint": "چھوٹی اِ",
  "harakat.damma": "ضمہ (پیش)",
  "harakat.dammaHint": "چھوٹی اُ",
  "qaida.openFirstAyah": "پہلی آیت کی مشق کھولیں",
  "tajweed.eyebrow": "تجوید کا راستہ",
  "tajweed.heading": "تلاوت کے قواعد، ہر بار ایک سوچا سمجھا اعادہ۔",
  "tajweed.copy": "کسی اہل قاری سے سنیں، دہرائیں، وہ الفاظ دیکھیں جو آپ کی ریکارڈنگ میں آئے، اور تجوید کی درستی کے لیے اپنے استاد کی طرف لوٹیں۔",
  "tajweed.principleAudio": "حقیقی قاری کی آواز",
  "tajweed.principleReview": "اے آئی سے الفاظ کی جانچ",
  "tajweed.principleTeacher": "استاد کی تصدیق کردہ تجوید",
  "tajweed.begin": "رہنمائی کے ساتھ تلاوت شروع کریں",
  "study.stageLabel": "موجودہ مرحلہ: {stage}",

  // -- The Qaida course chrome ----------------------------------------------
  "course.eyebrow": "قاعدہ کورس",
  "course.levelLabel": "درجہ {order} — {title}",
  "course.percentComplete": "کورس کا {percent}%",
  "course.levelsLabel": "کورس کے درجے",
  "course.levelProgress": "{done} / {total} اسباق",
  "course.lessonPosition": "سبق {number} از {total}",
  "course.stagesLabel": "یہ سبق کیسے چلتا ہے",
  "course.stageLearn": "سیکھنا",
  "course.stageListen": "سننا",
  "course.stageRecognize": "پہچاننا",
  "course.stageRepeat": "دہرانا",
  "course.stageRead": "پڑھنا",
  "course.stageCheck": "جانچ",
  "course.stageComplete": "تکمیل",
  "course.examplesLabel": "مثالیں",
  "course.teachingSummary": "یہ سبق کیا سکھاتا ہے",
  "course.quranBadge": "قرآن {reference}",
  "course.teachingBadge": "تعلیمی مثال",
  "course.exerciseLabel": "مشق",
  "course.exerciseProgress": "سوال {number} از {total}",
  "course.playAudio": "نمونہ سنائیں",
  "course.audioUnavailable": "اس صورت کے لیے ابھی کوئی نمونہ ریکارڈنگ دستیاب نہیں۔",
  "course.correct": "درست۔",
  "course.retry": "ابھی درست نہیں۔ دوبارہ دیکھیں، پھر ایک بار اور کوشش کریں۔",
  "course.letterReference": "حروف کی فہرست",
  "course.letterReferenceHint": "تمام ۲۸ حروف، ہر ایک کے لیے قاری کی ریکارڈنگ کے ساتھ۔",
  "course.openInStudy": "{reference} مشق میں کھولیں",
  "course.lessonComplete": "سبق مکمل ہوا۔",
  "course.nextLesson": "اگلا: {title}",
  "course.finishCourse": "کورس مکمل کریں",
  "course.practiseAgain": "یہ سبق دوبارہ مشق کریں",
  "course.courseComplete": "یہ پورا قاعدہ تھا۔ مشق کے حصے میں جاری رکھیں، جہاں پہلے قاری پڑھتا ہے اور پھر آپ کی ریکارڈنگ لفظ بہ لفظ دیکھی جاتی ہے۔",
  "course.lessonListLabel": "اس درجے کے اسباق",
  "course.reviewLesson": "دہرائی",

  // -- Recorder, live guidance and the practice plan ------------------------
  "recorder.noLiveGuide": "ریکارڈنگ ممکن ہے۔ لمحہ بہ لمحہ رہنمائی صرف ان براؤزروں میں چلتی ہے جن میں عربی کی آواز پہچاننے کی سہولت ہو؛ رکنے کے بعد آپ کی ریکارڈنگ بہرحال جانچی جائے گی۔",
  "recorder.liveGuidePaused": "لمحہ بہ لمحہ رہنمائی رک گئی، مگر رکنے کے بعد ریکارڈنگ کی الفاظ والی جانچ بہرحال ہو گی۔",
  "recorder.reviewFailed": "یہ ریکارڈنگ جانچی نہیں جا سکی۔ براہِ کرم کوئی چھوٹا ٹکڑا آزمائیں۔",
  "recorder.empty": "کوئی آواز نہیں آئی۔ مائیکروفون کی اجازت دیکھیں، پھر آیت دوبارہ ریکارڈ کریں۔",
  "recorder.tooLarge": "یہ ریکارڈنگ {size} MB کی ہے، جو {limit} MB کی حد سے زیادہ ہے، اس لیے جانچ کے لیے نہیں بھیجی گئی۔ ایک آیت اطمینان سے ریکارڈ کریں اور دوبارہ کوشش کریں۔",
  "recorder.noRecorder": "یہ براؤزر آواز ریکارڈ نہیں کر سکتا۔ براہِ کرم کوئی نیا براؤزر استعمال کریں اور مائیکروفون کی اجازت دیں۔",
  "recorder.noMicrophone": "مائیکروفون کی اجازت نہیں ملی۔ براؤزر کی ترتیبات میں اجازت دیں، پھر دوبارہ کوشش کریں۔",
  "live.guideTitle": "الفاظ کی فوری رہنمائی",
  "live.heardTitle": "آپ کے براؤزر نے کیا سنا",
  "live.source": "آلے کی آواز پہچان",
  "live.waiting": "آپ کی آواز کا انتظار",
  "coach.contextLabel": "اے آئی کی رہنمائی میں مشق کا منصوبہ",
  "coach.contextEyebrow": "مشق کا منصوبہ",
  "coach.practiceLoopLabel": "مشق کا دور",
  "coach.reviewPlanLabel": "اس جانچ میں استعمال ہونے والا مشق کا منصوبہ",
  "coach.reviewPlanEyebrow": "اے آئی مشق رہنما",

  // -- The coaching plan, by learning level ---------------------------------
  "plan.qaida.title": "قاعدہ",
  "plan.qaida.focus": "حروف، مخارج، چھوٹی حرکات اور ملانے کی صورتیں",
  "plan.qaida.lessonGoal": "حروف کی پہچان اور سننے پھر دہرانے کی عادت مضبوط کریں، پھر حروف کو الفاظ میں ملائیں۔",
  "plan.qaida.boundary": "اکیلے حروف کی ادائیگی اور مخرج کی تصدیق کسی اہل استاد سے ہونی چاہیے۔",
  "plan.qaida.loopListen": "سنیں",
  "plan.qaida.loopIdentify": "پہچانیں",
  "plan.qaida.loopJoin": "ملائیں",
  "plan.qaida.loopRepeat": "دہرائیں",
  "plan.qaida.loopReview": "جانچیں",
  "plan.tajweed.title": "تجوید",
  "plan.tajweed.focus": "تلاوت کے قواعد — مد، غنہ اور وقف — استاد کی رہنمائی کے ساتھ",
  "plan.tajweed.lessonGoal": "سوچے سمجھے اعادے کے ساتھ پڑھیں اور وہ جگہ پہچانیں جہاں استاد کی نگرانی میں مشق درکار ہے۔",
  "plan.tajweed.boundary": "تجوید، مخرج، مد، وقف، لحن اور دینی درستی کی تصدیق صرف کوئی اہل استاد ہی کر سکتا ہے۔",
  "plan.tajweed.loopRecall": "یاد کریں",
  "plan.tajweed.loopRecord": "ریکارڈ کریں",
  "plan.tajweed.loopLocate": "واپسی کی جگہ ڈھونڈیں",
  "plan.tajweed.loopTeacher": "استاد کے ساتھ دہرائیں",

  // -- Review feedback ------------------------------------------------------
  "feedback.available": "پہچانے گئے الفاظ",
  "feedback.unavailable": "جانچا نہیں جا سکا",
  "feedback.matched": "اس آیت کا پہچانا گیا",
  "feedback.notRecognised": "سروس نے کوئی عربی لفظ نہیں پہچانا",
  "feedback.coachEyebrow": "اے آئی آواز رہنما",
  "feedback.coachCopy": "مشق کی ہدایت انگریزی میں سنیں، پھر قرآنی عربی کے لیے اہل قاری سے رجوع کریں۔",
  "feedback.playGuidance": "رہنمائی سنائیں",
  "feedback.transcriptionFailed": "یہ ریکارڈنگ جانچی نہیں جا سکی — آواز پہچاننے والی سروس نے جواب نہیں دیا۔ اپنا رابطہ دیکھیں، پھر آیت دوبارہ ریکارڈ کریں۔",
  "feedback.noArabicReturned": "اس ریکارڈنگ میں کوئی عربی لفظ نہیں پہچانا گیا۔ کسی پُرسکون جگہ، مائیکروفون قریب رکھ کر دوبارہ کوشش کریں۔",
  "feedback.reviewUnavailable": "ریکارڈنگ محفوظ ہو گئی، مگر یہ جواب لفظ بہ لفظ قابلِ اعتماد جانچ کے لیے کافی نہیں۔ اہل قاری کو دوبارہ سنیں اور کسی پُرسکون جگہ دوبارہ کوشش کریں؛ ادائیگی اور تجوید کے لیے استاد سے رجوع کریں۔",
  "feedback.wordIndex": "لفظ {number}",
  "feedback.extra": "زائد",
  "feedback.missing": "سنائی نہیں دیا",
  "feedback.review": "دہرائی",
  "feedback.allMatched": "اس ریکارڈنگ میں ہر متوقع لفظ پہچانا گیا۔",
  "feedback.readAloudToggle": "نئی رہنمائی بلند آواز میں پڑھیں",
  "feedback.tryAgain": "سنیں اور دوبارہ کوشش کریں",
  "feedback.acousticLabel": "آواز سے متعلق مشاہدات",
  "feedback.acousticAvailable": "اعتماد کی شرط کے ساتھ مشق کا مشاہدہ",
  "feedback.acousticAbstained": "آواز کی جانچ نے سنا، مگر اتنا اعتماد نہیں تھا کہ کوئی درستی تجویز کرے۔",
  "feedback.acousticUnavailable": "خصوصی آواز جانچ دستیاب نہیں۔ آپ کی الفاظ والی جانچ بہرحال تیار ہے۔",
  "feedback.acousticConfidence": "آواز کا اعتماد: {percent}%",
  "feedback.acousticPhoneme": "آواز پر توجہ",
  "feedback.acousticVowelLength": "حرکت کی لمبائی پر توجہ",
  "feedback.acousticPause": "وقف پر توجہ",
  "feedback.acousticTajweed": "قاعدے پر توجہ",
  "feedback.acousticBoundary": "اسے صرف مشق کی رہنمائی سمجھیں۔ تجوید، مخرج اور دینی درستی کی تصدیق کسی اہل استاد سے ہونی چاہیے۔",

  // -- Memorise, side panel and the rest ------------------------------------
  "memorise.eyebrow": "اطمینان سے یاد کریں",
  "memorise.place": "آیت {number} از {total}",
  "memorise.prompt": "بلند آواز میں پڑھیں، پھر استاد کے دور کو اپنی جگہ جانچنے دیں۔",
  "memorise.covered": "آیت ڈھکی ہوئی ہے",
  "memorise.meaningHidden": "بہتر توجہ کے لیے معنی چھپا دیا گیا ہے۔",
  "memorise.reveal": "آیت ظاہر کریں",
  "memorise.cover": "آیت ڈھانپیں",
  "memorise.toggleMeaning": "معنی دکھائیں یا چھپائیں",
  "memorise.practise": "بلند آواز میں مشق",
  "memorise.practiseAyah": "آیت {number} کی مشق کریں",
  "panel.label": "منتخب آیت کی تفصیل",
  "panel.keepPlace": "اپنی جگہ محفوظ رکھیں",
  "panel.save": "محفوظ کریں",
  "panel.saved": "محفوظ ہو گیا",
  "panel.audioPlaying": "قاری کی آواز چل رہی ہے",
  "panel.listenRepeat": "سنیں اور دہرائیں",
  "panel.reciterFallback": "قاری",
  "panel.ayahNumber": "آیت {number}",
  "panel.listenSelected": "منتخب آیت سنیں",
  "panel.playingReciter": "قاری چل رہا ہے",
  "panel.audioNote": "حقیقی قاری کی آواز، آلے کی پوری آواز پر۔ بہتر مشق کے لیے ہیڈفون استعمال کریں۔",
  "panel.sequenceEyebrow": "آج کی ترتیب",
  "panel.sequenceCopy": "آیت ایک بار سنیں، اپنی آواز میں دہرائیں، پھر اطمینان سے اسی ایک جگہ لوٹیں جہاں مشق درکار ہے۔",
  "panel.thisReading": "یہ پڑھائی",
  "panel.progressNote": "ایک متوجہ اعادہ بھی مفید پیش رفت ہے۔",
  "dock.label": "موبائل پر پڑھنے کے اعمال",
  "notFound.title": "صفحہ نہیں ملا",
  "notFound.copy": "معذرت، جو صفحہ آپ ڈھونڈ رہے ہیں وہ موجود نہیں۔ ممکن ہے اسے منتقل یا حذف کر دیا گیا ہو۔",
  "notFound.goHome": "مرکزی صفحے پر جائیں",
};

export const lessons: LocaleLessons = {
  letters: {
    alif: { articulation: "گلا کھلا رہتا ہے، کوئی رکاوٹ نہیں۔ یہ اپنی آواز شامل کیے بغیر حرکت اٹھاتا ہے۔", tip: "منہ ڈھیلا رکھیں اور آواز صاف رہے۔" },
    ba: { articulation: "دونوں ہونٹ ملتے ہیں، پھر ہلکی آواز کے ساتھ کھلتے ہیں۔", tip: "ہونٹ صاف کھلیں — بعد میں پھونک نہ ہو۔" },
    ta: { articulation: "زبان کی نوک اوپر کے سامنے والے دانتوں کی جڑ سے لگتی ہے، بغیر آواز کے۔", tip: "ط سے ہلکا اور آگے کی طرف۔" },
    tha: { articulation: "زبان کی نوک اوپر کے دانتوں کے کنارے کو چھوتی ہے اور ہوا اوپر سے گزرتی ہے۔", tip: "پتلی اور ہلکی آواز۔" },
    jeem: { articulation: "زبان کا درمیانی حصہ تالو سے لگتا ہے، آواز کے ساتھ کھلتا ہے۔", tip: "ذرا ٹھہر کر ادا کریں؛ یہ جلدی والی آواز نہیں۔" },
    hha: { articulation: "حلق کے درمیان سے، بغیر آواز کے مضبوط سانس۔", tip: "ه سے مختلف، جو نرم اور نیچے سے ہے۔" },
    kha: { articulation: "حلق کے اوپری حصے سے، کھرچنے والی آواز کے ساتھ۔", tip: "ح سے بھاری اور واضح طور پر کھردری۔" },
    dal: { articulation: "زبان کی نوک اوپر کے سامنے والے دانتوں کی جڑ سے لگتی ہے، آواز کے ساتھ۔", tip: "ت کا آواز والا جوڑا۔" },
    dhal: { articulation: "زبان کی نوک اوپر کے دانتوں کے کنارے کو چھوتی ہے، آواز کے ساتھ۔", tip: "ث جیسی جگہ، مگر آواز کے ساتھ۔" },
    ra: { articulation: "زبان کی نوک اوپر کے دانتوں کے پیچھے والی جگہ پر ہلکی سی لگتی ہے۔", tip: "ایک ہلکا ٹھپہ، لمبی گھما گھمی نہیں۔" },
    zay: { articulation: "زبان کی نوک نیچے کے دانتوں کے پیچھے رہتی ہے؛ آواز کے ساتھ سیٹی جیسی ہوا گزرتی ہے۔", tip: "ہلکی اور پتلی، بھاری نہیں۔" },
    seen: { articulation: "بغیر آواز کے پتلی سیٹی، زبان کی نوک نیچے کے دانتوں کے پیچھے۔", tip: "منہ چپٹا رکھیں؛ ص اس کا بھاری جوڑا ہے۔" },
    sheen: { articulation: "ہوا زبان کے چوڑے حصے پر پھیل کر گزرتی ہے۔", tip: "س سے چوڑی اور نرم آواز۔" },
    sad: { articulation: "س جیسی جگہ، مگر زبان اٹھی ہوئی اور منہ بھرا ہوا۔", tip: "بھاری آواز؛ س سے موازنہ کریں۔" },
    dad: { articulation: "زبان کا کنارہ اوپر کی داڑھوں سے لگتا ہے اور آواز بھاری رہتی ہے۔", tip: "عربی کا خاص حرف؛ استاد سے سن کر سیکھیں۔" },
    tta: { articulation: "ت جیسی جگہ، مگر زبان اٹھی ہوئی اور آواز بھاری۔", tip: "ت کا بھاری جوڑا۔" },
    zza: { articulation: "ذ جیسی جگہ، مگر زبان اٹھی ہوئی اور آواز بھاری۔", tip: "ذ کا بھاری جوڑا۔" },
    ayn: { articulation: "حلق کے درمیان سے، آواز کے ساتھ اور کھلی۔", tip: "ء سے گہری اور نرم۔" },
    ghayn: { articulation: "حلق کے اوپری حصے سے، آواز کے ساتھ۔", tip: "خ کا آواز والا جوڑا۔" },
    fa: { articulation: "نیچے کا ہونٹ اوپر کے دانتوں سے ملتا ہے، ہوا گزرتی ہے۔", tip: "ہلکی اور صاف۔" },
    qaf: { articulation: "زبان کا پچھلا حصہ حلق کے قریب اوپر اٹھتا ہے۔", tip: "ک سے پیچھے اور بھاری۔" },
    kaf: { articulation: "زبان کا پچھلا حصہ تالو کے نرم حصے سے لگتا ہے۔", tip: "ق سے آگے اور ہلکا۔" },
    lam: { articulation: "زبان کی نوک اوپر کے دانتوں کے پیچھے لگتی ہے اور ہوا کناروں سے گزرتی ہے۔", tip: "ہلکی آواز، سوائے لفظِ اللہ کے مخصوص مواقع کے۔" },
    meem: { articulation: "دونوں ہونٹ بند ہوتے ہیں اور آواز ناک سے نکلتی ہے۔", tip: "ہونٹ نرمی سے بند رہیں۔" },
    noon: { articulation: "زبان کی نوک اوپر کے دانتوں کے پیچھے لگتی ہے اور آواز ناک سے نکلتی ہے۔", tip: "م جیسی، مگر ہونٹ کھلے۔" },
    ha: { articulation: "حلق کے نیچے سے، ایک نرم سانس۔", tip: "ح سے ہلکی اور نرم۔" },
    waw: { articulation: "ہونٹ گول ہوتے ہیں، آواز کے ساتھ۔", tip: "لمبی ‘او’ کے لیے بھی یہی حرف آتا ہے۔" },
    ya: { articulation: "زبان کا درمیانی حصہ تالو کی طرف اٹھتا ہے، آواز کے ساتھ۔", tip: "لمبی ‘ای’ کے لیے بھی یہی حرف آتا ہے۔" },
  },
};


/**
 * Qaida course prose in Urdu, keyed by the curriculum's own lesson and exercise
 * ids. Only text: the lesson order, the prerequisites, the Arabic examples, the
 * Quran references and which answer is correct all live in the curriculum and
 * are the same in every language. Every level is translated; a lesson added to
 * the curriculum appears here in English until its four strings are written,
 * and the coverage test reports it.
 */
export const qaida: QaidaTextPack = {
  lessons: {
    "letters-alif-ba-ta-tha": {
      title: "الف، با، تا، ثا",
      objective: "الف، با، تا اور ثا کو شکل اور نام سے پہچانیں۔",
      teaching: "پہلے چار حروف۔ با، تا اور ثا کی شکل ایک ہی ہے اور فرق صرف نقطوں کا ہے: ایک نیچے، دو اوپر، تین اوپر۔ الف ایک سیدھی کھڑی لکیر ہے۔",
    },
    "letters-jeem-hha-kha": {
      title: "جیم، حا، خا",
      objective: "جیم، حا اور خا کو شکل اور نام سے پہچانیں۔",
      teaching: "ایک ہی شکل پر تین حروف۔ جیم کے اندر نقطہ ہے، حا پر کوئی نقطہ نہیں، اور خا کے اوپر نقطہ ہے۔",
    },
    "letters-dal-dhal": {
      title: "دال اور ذال",
      objective: "دال اور ذال کو شکل اور نام سے پہچانیں۔",
      teaching: "ایک ہی شکل، فرق صرف ایک نقطے کا۔ دال سادہ ہے؛ ذال کے اوپر نقطہ ہے۔ دونوں اپنے بعد والے حرف سے نہیں ملتے۔",
    },
    "letters-ra-zay": {
      title: "را اور زے",
      objective: "را اور زے کو شکل اور نام سے پہچانیں۔",
      teaching: "ایسی شکل جو سطر سے نیچے جھکتی ہے۔ را سادہ ہے، زے کے اوپر نقطہ ہے۔ دال کی طرح یہ بھی آگے نہیں ملتے۔",
    },
    "letters-seen-sheen": {
      title: "سین اور شین",
      objective: "سین اور شین کو شکل اور نام سے پہچانیں۔",
      teaching: "تین دندانے اور اس کے بعد ایک پیالہ۔ سین سادہ ہے؛ شین کے اوپر تین نقطے ہیں۔",
    },
    "letters-sad-dad": {
      title: "صاد اور ضاد",
      objective: "صاد اور ضاد کو شکل اور نام سے پہچانیں۔",
      teaching: "ایک حلقہ اور ایک پیالہ۔ صاد سادہ ہے؛ ضاد کے اوپر نقطہ ہے۔ یہ سین اور دال کے بھاری جوڑے ہیں۔",
    },
    "letters-tta-zza": {
      title: "طا اور ظا",
      objective: "طا اور ظا کو شکل اور نام سے پہچانیں۔",
      teaching: "ایک حلقہ جس پر کھڑی لکیر ہے۔ طا سادہ ہے؛ ظا کے اوپر نقطہ ہے۔ دونوں بھاری حروف ہیں، اور پہلے سبق والی ہلکی تا سے الگ لکھے جاتے ہیں۔",
    },
    "letters-ayn-ghayn": {
      title: "عین اور غین",
      objective: "عین اور غین کو شکل اور نام سے پہچانیں۔",
      teaching: "پھر ایک ہی شکل۔ عین سادہ ہے؛ غین کے اوپر نقطہ ہے۔",
    },
    "letters-fa-qaf": {
      title: "فا اور قاف",
      objective: "فا اور قاف کو شکل اور نام سے پہچانیں۔",
      teaching: "فا کے اوپر ایک نقطہ ہے، قاف کے اوپر دو۔ ان کے پیالے بھی مختلف ہیں: قاف کا پیالہ سطر سے نیچے جاتا ہے۔",
    },
    "letters-kaf-to-ya": {
      title: "کاف سے یا تک",
      objective: "کاف، لام، میم، نون، ہا، واو اور یا کو شکل اور نام سے پہچانیں۔",
      teaching: "حروفِ تہجی کے آخری سات حرف، ہر ایک کی اپنی الگ شکل ہے۔",
    },
    "letters-similar": {
      title: "وہ حروف جو نقطوں سے پہچانے جاتے ہیں",
      objective: "ان حروف کو الگ کریں جن کی شکل ایک ہے اور فرق صرف نقطوں کا ہے۔",
      teaching: "عربی کے اکثر حروف اپنی شکل ایک یا دو حروف کے ساتھ بانٹتے ہیں۔ سارا فرق نقطوں کا ہے: پہلے شکل دیکھیں، پھر نقطے گنیں اور دیکھیں کہ وہ اوپر ہیں یا نیچے۔",
    },
    "letters-similar-shapes": {
      title: "مزید حروف جو آپس میں مل جاتے ہیں",
      objective: "بھاری اور ہلکے جوڑے، اور وہ حروف الگ کریں جو ابتدا میں اکثر ایک دوسرے کی جگہ پڑھ لیے جاتے ہیں۔",
      teaching: "ان جوڑوں میں فرق ایک نقطے، ایک حلقے یا ایک لکیر کا ہے۔ دو جوڑے — ہ اور ح، ک اور ق — ساتھ رکھ کر دیکھنے کے قابل ہیں کیونکہ ابتدا میں اکثر ایک کو دوسرا پڑھ لیا جاتا ہے۔ صفحے پر شکل دیکھیں؛ ہر حرف کیسے ادا ہوتا ہے، یہ اپنے استاد اور قاری سے سنیں۔",
      boundary: "یہ صفحے پر شکلیں الگ کرنے کی مشق ہے۔ ہر حرف منہ کے کس حصے سے نکلتا ہے — اس کا مخرج — یہ کسی اہل استاد سے سن کر ہی سیکھا جا سکتا ہے؛ تحریری مشق یہ نہیں دکھا سکتی اور ایپ اس کا فیصلہ نہیں کرتی۔",
    },
    "forms-four-positions": {
      title: "چار حالتیں",
      objective: "ایک حرف کو الگ، شروع، درمیان اور آخر کی شکلوں میں پڑھیں۔",
      teaching: "حرف کی شکل اس کی جگہ کے مطابق بدلتی ہے۔ با تنہا ب ہے، شروع میں بـ، درمیان میں ـبـ اور آخر میں ـب۔ اصل جسم وہی رہتا ہے — صرف جوڑنے والی لکیریں بدلتی ہیں۔",
    },
    "forms-non-connectors": {
      title: "وہ حروف جو آگے نہیں ملتے",
      objective: "ان چھ حروف کو پہچانیں جو اپنے بعد والے حرف سے کبھی نہیں ملتے۔",
      teaching: "چھ حروف — ا د ذ ر ز و — اپنے پہلے والے حرف سے ملتے ہیں مگر بعد والے سے کبھی نہیں۔ لفظ ان پر ٹوٹ جاتا ہے، اسی لیے کچھ الفاظ دو لفظ لگتے ہیں۔",
    },
    "forms-joining-practice": {
      title: "حروف کو ملانا",
      objective: "چھوٹے ملے ہوئے مجموعے پڑھیں اور دیکھیں کہ وقفے کہاں آتے ہیں۔",
      teaching: "ملے ہوئے مجموعے کو حرف بہ حرف پڑھیں، دائیں سے بائیں۔ جہاں نہ ملنے والا حرف آئے، اس کے بعد والا حرف نئی شکل سے شروع ہوتا ہے۔",
    },
    "harakat-fatha": {
      title: "فتحہ (زبر)",
      objective: "فتحہ والے حرف کو پڑھیں۔",
      teaching: "فتحہ حرف کے اوپر ایک چھوٹی لکیر ہے۔ یہ حرف کو مختصر ‘اَ’ کی آواز دیتی ہے: بَ ‘بَ’ پڑھا جاتا ہے، تَ ‘تَ’۔",
    },
    "harakat-kasra": {
      title: "کسرہ (زیر)",
      objective: "کسرہ والے حرف کو پڑھیں۔",
      teaching: "کسرہ وہی چھوٹی لکیر ہے جو حرف کے نیچے لکھی جاتی ہے۔ یہ مختصر ‘اِ’ کی آواز دیتی ہے: بِ ‘بِ’ پڑھا جاتا ہے۔",
    },
    "harakat-damma": {
      title: "ضمہ (پیش)",
      objective: "ضمہ والے حرف کو پڑھیں۔",
      teaching: "ضمہ حرف کے اوپر ایک چھوٹے واو کی شکل ہے۔ یہ مختصر ‘اُ’ کی آواز دیتا ہے: بُ ‘بُ’ پڑھا جاتا ہے۔",
    },
    "harakat-combinations": {
      title: "دو حرفوں کے مجموعے",
      objective: "دو حرکت والے حروف ایک ساتھ پڑھیں، پھر ایک مختصر قرآنی لفظ جس میں صرف مختصر حرکتیں ہوں۔",
      teaching: "ہر حرف کو اس کی اپنی حرکت کے ساتھ پڑھیں، پھر بغیر رکے ملا دیں: بَتَ ‘بَ-تَ’ پڑھا جاتا ہے۔ جب یہ جوڑا آسان ہو جائے تو یہی پڑھنا ایک اصل لفظ پر لاگو ہوتا ہے — سورۃ الاخلاص کا ہُوَ دو حرف اور دو مختصر حرکتیں ہیں، اور کچھ نہیں۔",
    },
    "tanween-three-marks": {
      title: "تین تنوین",
      objective: "دو زبر، دو زیر اور دو پیش کو پہچانیں۔",
      teaching: "تنوین لفظ کے آخر میں دُہری حرکت ہے۔ دو زبر ‘اً’ پڑھی جاتی ہے، دو زیر ‘اٍ’، دو پیش ‘اٌ’۔ دو زبر عام طور پر آخر میں لکھے ہوئے الف پر آتی ہے۔",
    },
    "tanween-reading": {
      title: "تنوین پر ختم ہونے والے الفاظ پڑھنا",
      objective: "تنوین پر ختم ہونے والا قرآنی لفظ پڑھیں۔",
      teaching: "جب آپ تنوین والے لفظ سے آگے بڑھتے ہیں تو اسے دُہری حرکت کے ساتھ پڑھا جاتا ہے۔ لفظ کو آخر تک پڑھیں، نشان سے پہلے نہ رکیں۔",
    },
    "madd-long-vowels": {
      title: "تین لمبی حرکات (مد)",
      objective: "الف، واو اور یائے مد کو پہچانیں جب وہ اپنی ہم جنس حرکت کے بعد آئیں۔",
      teaching: "چھوٹی حرکت اُس وقت لمبی ہو جاتی ہے جب اس کا اپنا حرف اس کے بعد آئے: فتحہ کے ساتھ الف (بَا)، ضمہ کے ساتھ واو (بُو)، کسرہ کے ساتھ یا (بِي)۔ منہ وہی آواز زیادہ دیر تک قائم رکھتا ہے۔",
      boundary: "یہ سبق صفحے پر مد کو پہچاننے کے بارے میں ہے۔ اسے کتنا کھینچنا ہے اور کیسے ادا کرنا ہے، یہ اہل استاد اور قاری کی ریکارڈنگ کا معاملہ ہے؛ ایپ اسے نہیں ناپتی۔",
    },
    "madd-short-vs-long": {
      title: "چھوٹی اور لمبی کا فرق",
      objective: "چھوٹی حرکت کو اس کی لمبی جوڑ سے ایک نظر میں الگ کریں۔",
      teaching: "بَ اور بَا ایک ہی حرف ہے، ایک ہی حرکت کے ساتھ؛ الف ہی اسے لمبا کرتا ہے۔ دونوں کو ایک جیسا پڑھنا مبتدی کی سب سے عام غلطی ہے، اور یہ آواز کی غلطی سے پہلے پڑھنے کی غلطی ہے۔",
      boundary: "ایپ صرف یہ دیکھتی ہے کہ آپ صفحے پر دونوں میں فرق کر سکتے ہیں یا نہیں۔ آپ نے لمبی کو صحیح مقدار میں کھینچا یا نہیں، یہ اہل استاد کا معاملہ ہے؛ ایپ اسے نہیں ناپتی۔",
    },
    "sukoon-basics": {
      title: "سکون",
      objective: "وہ حرف پڑھیں جس پر سکون ہو۔",
      teaching: "سکون حرف کے اوپر ایک چھوٹا دائرہ ہے۔ اس کا مطلب یہ ہے کہ حرف کی اپنی کوئی حرکت نہیں: یہ اس آواز کو بند کرتا ہے جو اس سے پہلے آئی۔ بَبْ ”بَب“ پڑھا جاتا ہے۔",
    },
    "sukoon-quran-words": {
      title: "قرآنی الفاظ میں سکون",
      objective: "وہ مختصر قرآنی الفاظ پڑھیں جن میں ساکن حرف ہو۔",
      teaching: "بیشتر قرآنی الفاظ ایک متحرک حرف کو ساکن حرف سے جوڑتے ہیں۔ پہلے متحرک حرف پڑھیں، پھر اسے ساکن حرف پر بند کریں، اپنی طرف سے کوئی حرکت لگائے بغیر۔",
    },
    "shaddah-basics": {
      title: "شد",
      objective: "مشدد حرف پڑھیں۔",
      teaching: "شد حرف کے اوپر ایک چھوٹی سی علامت ہے، گول ”و“ جیسی۔ یہ اس حرف کو دوہرا کر دیتی ہے: پہلا ساکن ہوتا ہے اور دوسرا متحرک، اس لیے حرف کھینچا جاتا ہے، دو بار نہیں کہا جاتا۔ اسی لیے سکون پہلے آتا ہے — شد ایک ساکن حرف ہی ہے جو متحرک حرف سے ملا ہوا ہو۔",
    },
    "shaddah-quran-words": {
      title: "قرآنی الفاظ میں شد",
      objective: "وہ قرآنی الفاظ پڑھیں جن پر شد ہو۔",
      teaching: "شد پورے قرآن میں ہے، اور یہ لفظ کو بدل دیتی ہے: مشدد حرف کو ایک کھنچی ہوئی آواز کے طور پر پڑھیں، دو الگ حروف کے طور پر نہیں۔",
    },
    "lam-sun-moon": {
      title: "حروفِ شمسی اور حروفِ قمری",
      objective: "”ال“ کو دونوں قسم کے حروف سے پہلے درست پڑھیں۔",
      teaching: "قمری حرف سے پہلے ”ال“ کا لام پڑھا جاتا ہے اور اس پر سکون ہوتا ہے: الْحَمْدُ۔ شمسی حرف سے پہلے لام نہیں پڑھا جاتا؛ اس کے بجائے اگلا حرف مشدد ہو جاتا ہے اور اس پر شد آتی ہے: الصِّرَاطَ۔ مصحف خود بتا دیتا ہے: لام پر سکون دیکھیں، یا اس کے بعد والے حرف پر شد۔",
    },
    "lam-reading-practice": {
      title: "”ال“ کو متن میں پڑھنا",
      objective: "”ال“ والے الفاظ بغیر رکے پڑھیں، یہ سوچے بغیر کہ آگے کس قسم کا حرف ہے۔",
      teaching: "مشق کے ساتھ شد اور سکون خود کام کر دیتے ہیں: آپ وہی پڑھتے ہیں جو لکھا ہے۔ انہیں باری باری بلند آواز میں پڑھیں اور دیکھیں کہ لام ہر بار کیسا برتاؤ کرتا ہے۔",
    },
    "hamzah-seats": {
      title: "ہمزہ اور اس کی کرسیاں",
      objective: "الف، واو اور یا پر لکھا ہوا ہمزہ پڑھیں۔",
      teaching: "ہمزہ کی اپنی آواز ہے، جو یا تو ”ء“ لکھی جاتی ہے یا کسی کرسی پر بیٹھتی ہے: أ اور إ الف پر، ؤ واو پر، ئ یا پر۔ کرسی املا ہے، آواز نہیں — ہمزہ ان سب پر ایک ہی طرح پڑھا جاتا ہے۔",
    },
    "hamzah-wasl": {
      title: "ہمزۃ الوصل",
      objective: "وہ الف پہچانیں جو ابتدا کرنے پر پڑھا جاتا ہے اور ملا کر پڑھنے پر چھوڑ دیا جاتا ہے۔",
      teaching: "”ال“ کا الف، اور اہْدِنَا جیسے الفاظ کا الف، وصل کا الف ہے۔ اگر آپ اسی سے آغاز کریں تو یہ پڑھا جاتا ہے؛ اگر پچھلے لفظ سے ملا کر آئیں تو اس سے گزر کر سیدھے اگلے حرف پر جاتے ہیں۔ بہت سے مصاحف اسے ”ٱ“ لکھتے ہیں، اوپر ص جیسی چھوٹی علامت کے ساتھ، تاکہ معلوم ہو کہ اس سے گزرا جاتا ہے۔",
    },
    "hamzah-orthography": {
      title: "تین لکھی ہوئی صورتیں: ى، ة اور چھوٹا الف",
      objective: "وہ تین لکھی ہوئی صورتیں پڑھیں جو مبتدی کو مصحف میں مسلسل ملتی ہیں۔",
      teaching: "تین شکلیں جنہیں دیکھ کر پہچاننا ہے۔ ”ى“ یا جیسی ہے مگر نقطوں کے بغیر، اور لفظ کے آخر میں لمبی ”ا“ پڑھی جاتی ہے — اس کا نام الف مقصورہ ہے۔ ”ة“ دو نقطوں والی ہا ہے، جسے تائے مربوطہ کہتے ہیں؛ اگلے لفظ سے ملاتے وقت اسے ”ت“ پڑھیں، اور اس پر ٹھہرتے وقت ”ہ“۔ چھوٹا الف ایک ننھا الف ہے جو حرف کے اوپر لکھا جاتا ہے: وہاں لمبی ”ا“ پڑھیں، اگرچہ پورا الف لکھا نہیں گیا۔",
    },
    "tajweed-qalqalah": {
      title: "قلقلہ کے حروف",
      objective: "قلقلہ کے پانچ حروف کو اُس وقت پہچانیں جب ان پر سکون ہو۔",
      teaching: "پانچ حروف — ق ط ب ج د، جو ”قطب جد“ کے طور پر یاد رکھے جاتے ہیں — جب ساکن ہوں یا ان پر ٹھہرا جائے تو ایک ہلکی گونج دیتے ہیں۔ یہ سبق انہیں صفحے پر پہچاننے کا ہے۔",
      boundary: "قلقلہ کا حرف پہچاننا پڑھنے کی مہارت ہے۔ آپ کا قلقلہ درست ادا ہوا یا نہیں، یہ اہل استاد کا معاملہ ہے؛ ایپ لکھے ہوئے متن سے اس کا فیصلہ نہیں کرتی۔",
    },
    "tajweed-noon-sakinah": {
      title: "نون ساکنہ اور تنوین",
      objective: "ساکن نون اور تنوین کو پہچانیں، اور جانیں کہ اگلا حرف طے کرتا ہے کہ چار میں سے کون سی صورت لاگو ہو گی۔",
      teaching: "ساکن نون اور تنوین اگلے حرف کے لحاظ سے چار میں سے ایک طرح پڑھے جاتے ہیں: اظہار (صاف ادا)، ادغام (اگلے حرف میں ملا دینا)، اقلاب (میم کی طرف پلٹنا)، اخفا (دونوں کے درمیان چھپانا)۔ اس درجے میں آپ صرف یہ سیکھ رہے ہیں کہ نون اور تنوین کو صفحے پر پہچانیں اور جانیں کہ چار صورتیں موجود ہیں — کون سی لاگو ہوتی ہے اور ہر ایک کیسے ادا ہوتی ہے، یہ استاد سے اور قاری کو سن کر سیکھا جاتا ہے۔",
      boundary: "یہ اُسی چیز کے نام ہیں جو لکھی ہوئی ہے۔ ایپ یہ نہیں پرکھتی کہ آپ کا اخفا، ادغام یا غنہ درست ادا ہوا یا نہیں — یہ صرف اہل استاد، یا کوئی خصوصی صوتی جانچ ہی بتا سکتی ہے۔",
    },
    "tajweed-meem-ghunnah": {
      title: "میم ساکنہ اور غنہ",
      objective: "ساکن میم کو پہچانیں، اور وہ علامت بھی جو بتاتی ہے کہ نون یا میم کو غنہ کے ساتھ کھینچا جاتا ہے۔",
      teaching: "ساکن میم کی اپنی تین صورتیں ہیں، اور جس نون یا میم پر شد ہو اسے غنہ کے ساتھ — یعنی ناک کی نرم آواز کے ساتھ — پڑھا جاتا ہے۔ صفحے پر شد تلاش کریں۔",
      boundary: "یہ صفحے پر پہچاننے کی بات ہے۔ غنہ کتنی دیر کھینچا جاتا ہے اور کیسا سنائی دینا چاہیے، یہ اہل استاد سے اور قاری کو سننے سے آتا ہے؛ ایپ اسے نہیں ناپتی۔",
    },
    "symbols-stop-marks": {
      title: "وقف کی علامات",
      objective: "سطر کے اوپر چھپے وہ چھوٹے حروف پہچانیں جو بتاتے ہیں کہ کہاں ٹھہر سکتے ہیں۔",
      teaching: "مصحف ٹھہرنے کی جگہیں چھوٹے حروف سے ظاہر کرتا ہے: م لازمی وقف، لا یہاں نہ ٹھہریں، ج ٹھہرنا جائز ہے، قلى ٹھہرنا بہتر ہے، صلى ملانا بہتر ہے۔ یہ پڑھنے میں مدد کے لیے ہیں، تاکہ معنی نہ ٹوٹے۔",
      boundary: "یہ علامات بتاتی ہیں کہ وقف کہاں جائز یا بہتر ہے۔ معنی کے لحاظ سے کہاں ٹھہرنا ہے اور پھر کہاں سے شروع کرنا ہے، یہ اہل استاد کی رہنمائی سے طے ہوتا ہے؛ ایپ یہ نہیں دیکھتی کہ آپ کہاں ٹھہرے۔",
    },
    "symbols-small-marks": {
      title: "متن کے اندر چھوٹی علامات",
      objective: "وہ چھوٹی علامات پہچانیں جو خود الفاظ کے اندر چھپی ہوتی ہیں۔",
      teaching: "وقف کی علامات کے علاوہ، مصحف سطر کے اندر بھی چھوٹی علامات چھاپتا ہے: وہی چھوٹا الف جو آپ پہلے دیکھ چکے ہیں، لمبی ”ا“ کے لیے جہاں الف لکھا نہ ہو؛ مد کی لہردار علامت ”ٓ“، جو بتاتی ہے کہ یہ لمبی حرکت معمول سے زیادہ کھینچی جاتی ہے؛ اور ہر آیت کے آخر میں اپنے پھول میں آیت کا نمبر۔",
      boundary: "کسی علامت کو پہچاننا پڑھنے کی مہارت ہے۔ مد کتنی دیر کھینچا جاتا ہے، یہ اہل استاد کے ساتھ طے ہوتا ہے؛ ایپ اسے نہیں ناپتی۔",
    },
    "quran-words": {
      title: "قرآنی الفاظ",
      objective: "وہ اکیلے قرآنی الفاظ پڑھیں جن میں اب تک سیکھی ہوئی ہر چیز آتی ہے۔",
      teaching: "جو کچھ آپ نے سیکھا ہے، تقریباً سب انہی چار الفاظ میں آ جاتا ہے: ساکن حرف، لمبی حرکت، شد، شمسی اور قمری حرف، اور چھوٹا الف۔ ہر ایک کو آہستہ پڑھیں، پھر ایک بار یکساں رفتار سے۔",
    },
    "quran-phrases": {
      title: "دو الفاظ ایک ساتھ",
      objective: "دو قرآنی الفاظ کو ایک ترکیب کے طور پر پڑھیں، درمیان میں رکے بغیر۔",
      teaching: "اکیلے الفاظ ہی مشکل حصہ ہیں؛ انہیں ملانا اگلا قدم ہے۔ ہر جوڑے کو ایک ہی سانس میں پڑھیں، درمیان میں وقفے کے بغیر، پھر سنیں کہ قاری وہی ترکیب کیسے پڑھتا ہے اور اس کے ساتھ چلیں۔",
    },
    "quran-first-ayah": {
      title: "آپ کی پہلی آیت",
      objective: "مصحف سے ایک مکمل آیت پڑھیں۔",
      teaching: "جو الفاظ آپ نے ابھی پڑھے، وہ مل کر ایک آیت بناتے ہیں۔ اسے مشق کے حصے میں کھولیں: متن ایپ کے اپنے قرآنی مواد سے آتا ہے، اور پہلے سننے کے لیے ایک اہل قاری موجود ہے۔",
    },
    "quran-short-ayat": {
      title: "مختصر آیات",
      objective: "کئی مختصر آیات یکے بعد دیگرے پڑھیں۔",
      teaching: "انہیں ایک کے بعد ایک پڑھیں، سب سے چھوٹی سے شروع کریں۔ ہر ایک اتنی مختصر ہے کہ ایک سانس میں آ جائے، اور ہر ایک میں صرف وہی حروف، حرکات اور علامات ہیں جو اب آپ جانتے ہیں۔",
    },
    "quran-short-surah": {
      title: "ایک پوری سورت، ریکارڈنگ کے ساتھ",
      objective: "ایک مکمل مختصر سورت ختم کریں، اور ہر آیت الفاظ کی جانچ کے لیے ریکارڈ کریں۔",
      teaching: "قاعدے کا آخری قدم آپ کی تلاوت کی مشق کا پہلا قدم ہے۔ پچھلے سبق میں آپ نے سورۃ الاخلاص کی پہلی آیت پڑھی؛ یہ تین آیتیں اسے مکمل کرتی ہیں۔ ہر ایک کو مشق کے حصے میں کھولیں، قاری کو سنیں، پھر اپنی آواز ریکارڈ کریں۔ جانچ بتائے گی کہ کون سے الفاظ پہچانے گئے اور کہاں سے دوبارہ شروع کرنا ہے — یہ پڑھنے کی جانچ ہے، تلاوت کے حسن پر فیصلہ نہیں۔",
      boundary: "ریکارڈنگ کی جانچ صرف لکھے ہوئے الفاظ کا آیت سے موازنہ کرتی ہے۔ یہ تجوید، مخرج، مد کی لمبائی یا غنہ کو نہیں پرکھتی۔",
    },
  },
  exercises: promptsFromPhrasebook(QAIDA_LESSONS, {
    "Which of these is Thaa?":
      "ان میں سے ثا کون سا ہے؟",
    "Which of these is Haa?":
      "ان میں سے حا کون سا ہے؟",
    "Which of these is Dhaal?":
      "ان میں سے ذال کون سا ہے؟",
    "Which of these is Zaay?":
      "ان میں سے زے کون سا ہے؟",
    "Which of these is Seen?":
      "ان میں سے سین کون سا ہے؟",
    "Which of these is Daad?":
      "ان میں سے ضاد کون سا ہے؟",
    "Which of these is Zaa?":
      "ان میں سے ظا کون سا ہے؟",
    "Which of these is Ayn?":
      "ان میں سے عین کون سا ہے؟",
    "Which of these is Qaaf?":
      "ان میں سے قاف کون سا ہے؟",
    "Which of these is Haa (soft)?":
      "ان میں سے نرم ہا کون سی ہے؟",
    "Which of these is Kaaf?":
      "ان میں سے کاف کون سا ہے؟",
    "Which shows a fatha followed by alif?":
      "کون سا فتحہ دکھاتا ہے جس کے بعد الف ہو؟",
    "Which shows a damma followed by waw?":
      "کون سا ضمہ دکھاتا ہے جس کے بعد واو ہو؟",
    "Which of these is the long one?":
      "ان میں سے لمبا کون سا ہے؟",
    "Read this word from the Quran aloud, holding the long vowel.":
      "یہ قرآنی لفظ بلند آواز میں پڑھیں اور لمبی حرکت کو کھینچیں۔",
    "What does this small circle above the letter mean?":
      "حرف کے اوپر یہ چھوٹا دائرہ کیا بتاتا ہے؟",
    "How does this read?":
      "یہ کیسے پڑھا جاتا ہے؟",
    "Read this word from the Quran aloud, closing the Laam without a vowel.":
      "یہ قرآنی لفظ بلند آواز میں پڑھیں اور لام کو بغیر حرکت کے بند کریں۔",
    "Read this one aloud — two sakin letters in the same word.":
      "یہ والا بلند آواز میں پڑھیں — ایک ہی لفظ میں دو ساکن حروف۔",
    "In this word, which letter carries the sukoon?":
      "اس لفظ میں سکون کس حرف پر ہے؟",
    "What does the shaddah tell you to do?":
      "شد آپ کو کیا کرنے کو کہتی ہے؟",
    "Which shows a shaddah carrying kasra?":
      "کون سا وہ شد دکھاتا ہے جس پر کسرہ ہو؟",
    "Which of these words carries a shaddah?":
      "ان الفاظ میں سے کس پر شد ہے؟",
    "In الْحَمْدُ, is the Laam of ال read?":
      "الْحَمْدُ میں، کیا ”ال“ کا لام پڑھا جاتا ہے؟",
    "In الصِّرَاطَ, why is there a shaddah on the Saad?":
      "الصِّرَاطَ میں، صاد پر شد کیوں ہے؟",
    "Read this aloud — a sun letter, so the Laam merges into it.":
      "یہ بلند آواز میں پڑھیں — شمسی حرف ہے، اس لیے لام اس میں مدغم ہو جاتا ہے۔",
    "Read this aloud — a moon letter, so the Laam is read with its sukoon.":
      "یہ بلند آواز میں پڑھیں — قمری حرف ہے، اس لیے لام اپنے سکون کے ساتھ پڑھا جاتا ہے۔",
    "Which one carries a kasra, with the hamzah written below the alif?":
      "کس پر کسرہ ہے، جس کا ہمزہ الف کے نیچے لکھا گیا ہے؟",
    "In ئ, what is the hamzah sitting on?":
      "ئ میں ہمزہ کس پر بیٹھا ہوا ہے؟",
    "You are continuing from the previous word into ال. What happens to its alif?":
      "آپ پچھلے لفظ سے ملا کر ”ال“ تک آ رہے ہیں۔ اس کے الف کا کیا ہوتا ہے؟",
    "Start on this word and read it aloud, sounding the opening alif.":
      "اسی لفظ سے آغاز کریں اور بلند آواز میں پڑھیں، شروع کا الف ادا کرتے ہوئے۔",
    "How is ى at the end of a word read?":
      "لفظ کے آخر میں ”ى“ کیسے پڑھا جاتا ہے؟",
    "What does a small alif printed above a letter tell you?":
      "حرف کے اوپر چھپا ہوا چھوٹا الف آپ کو کیا بتاتا ہے؟",
    "You stop at the end of a word ending in ة. How is it read?":
      "آپ ”ة“ پر ختم ہونے والے لفظ پر ٹھہرتے ہیں۔ یہ کیسے پڑھا جائے گا؟",
    "Which of these is a qalqalah letter?":
      "ان میں سے قلقلہ کا حرف کون سا ہے؟",
    "Which of these words ends in a qalqalah letter, so it echoes when you stop on it?":
      "ان الفاظ میں سے کون سا قلقلہ کے حرف پر ختم ہوتا ہے، کہ اس پر ٹھہرنے سے گونج پیدا ہو؟",
    "Which of these carries a Noon with sukoon?":
      "ان میں سے کس پر ساکن نون ہے؟",
    "Tanween follows the same four cases as a sakin Noon. Which of these carries tanween?":
      "تنوین بھی ساکن نون کی طرح انہی چار صورتوں پر چلتی ہے۔ ان میں سے کس پر تنوین ہے؟",
    "Which of these is read with ghunnah?":
      "ان میں سے کون سا غنہ کے ساتھ پڑھا جاتا ہے؟",
    "Which mark on a Noon or a Meem tells you the reader holds a ghunnah there?":
      "نون یا میم پر کون سی علامت بتاتی ہے کہ پڑھنے والا وہاں غنہ کھینچتا ہے؟",
    "What does لا above the line mean?":
      "سطر کے اوپر ”لا“ کا کیا مطلب ہے؟",
    "What does م above the line mean?":
      "سطر کے اوپر ”م“ کا کیا مطلب ہے؟",
    "What does قلى tell the reader?":
      "”قلى“ پڑھنے والے کو کیا بتاتا ہے؟",
    "What is the decorated circle at the end of an ayah?":
      "آیت کے آخر میں آراستہ دائرہ کیا ہے؟",
    "What does the wavy madd sign above a letter tell the reader?":
      "حرف کے اوپر مد کی لہردار علامت پڑھنے والے کو کیا بتاتی ہے؟",
    "Read this word aloud.":
      "یہ لفظ بلند آواز میں پڑھیں۔",
    "Read this word aloud — a sun letter and a long vowel.":
      "یہ لفظ بلند آواز میں پڑھیں — ایک شمسی حرف اور ایک لمبی حرکت۔",
    "Read these two words as one phrase.":
      "یہ دونوں الفاظ ایک ترکیب کے طور پر پڑھیں۔",
    "Read this phrase — a sun letter, then a held Laam.":
      "یہ ترکیب پڑھیں — ایک شمسی حرف، پھر کھنچا ہوا لام۔",
    "Listen to the reciter, then read this ayah aloud.":
      "قاری کو سنیں، پھر یہ آیت بلند آواز میں پڑھیں۔",
    "Start with the shortest — one word. Listen, then read it aloud.":
      "سب سے چھوٹے سے شروع کریں — ایک لفظ۔ سنیں، پھر بلند آواز میں پڑھیں۔",
    "Now four words, all of them familiar by this point.":
      "اب چار الفاظ، جو اس مقام تک سب آپ کے جانے پہچانے ہیں۔",
    "And the ayah your phrases came from.":
      "اور وہ آیت جس سے آپ کی ترکیبیں لی گئی تھیں۔",
    "You have read the first ayah of al-Ikhlas. Carry on: listen, then record the second.":
      "آپ سورۃ الاخلاص کی پہلی آیت پڑھ چکے ہیں۔ جاری رکھیں: سنیں، پھر دوسری ریکارڈ کریں۔",
    "The third ayah.":
      "تیسری آیت۔",
    "And the fourth, which completes the surah.":
      "اور چوتھی، جو سورت مکمل کرتی ہے۔",
    "Which letter is this?": "یہ کون سا حرف ہے؟",
    "Play the recording, then choose the letter you heard.": "ریکارڈنگ چلائیں، پھر وہ حرف منتخب کریں جو آپ نے سنا۔",
    "Which two letters make this combination?": "یہ مجموعہ کن دو حرفوں سے بنا ہے؟",
    "How does this combination read?": "یہ مجموعہ کیسے پڑھا جاتا ہے؟",
    "Read this Quranic word aloud, then continue.": "یہ قرآنی لفظ بلند آواز میں پڑھیں، پھر آگے بڑھیں۔",
    "Read this teaching combination aloud, then continue.": "یہ تعلیمی مجموعہ بلند آواز میں پڑھیں، پھر آگے بڑھیں۔",
    "Read this aloud, then continue.": "اسے بلند آواز میں پڑھیں، پھر آگے بڑھیں۔",
    "Which is Baa at the beginning of a word?": "لفظ کے شروع میں با کون سا ہے؟",
    "Which is Noon in the middle of a word?": "لفظ کے درمیان میں نون کون سا ہے؟",
    "Which is Meem at the end of a word?": "لفظ کے آخر میں میم کون سا ہے؟",
    "Which of these does not join to the letter after it?": "ان میں سے کون سا اپنے بعد والے حرف سے نہیں ملتا؟",
    "Which of these does join forward?": "ان میں سے کون سا آگے ملتا ہے؟",
    "Which one reads 'ba'?": "کون سا ‘بَ’ پڑھا جاتا ہے؟",
    "Which one reads 'bi'?": "کون سا ‘بِ’ پڑھا جاتا ہے؟",
    "Which one reads 'bu'?": "کون سا ‘بُ’ پڑھا جاتا ہے؟",
    "Which one reads 'nu'?": "کون سا ‘نُ’ پڑھا جاتا ہے؟",
    "Which one reads 'bun'?": "کون سا ‘بٌ’ پڑھا جاتا ہے؟",
    "What is the mark above this letter called?": "اس حرف کے اوپر والے نشان کا نام کیا ہے؟",
    "Where is a kasra written?": "کسرہ کہاں لکھا جاتا ہے؟",
    "What is this ending called?": "اس اختتام کا نام کیا ہے؟",
    "Which ending does this word carry?": "یہ لفظ کون سا اختتام رکھتا ہے؟",
  }, {
    "Listen to the reciter's recording for how the echo sounds. This exercise only asks you to spot the letter.":
      "گونج کیسی سنائی دیتی ہے، یہ قاری کی ریکارڈنگ سے سنیں۔ یہ مشق صرف حرف پہچاننے کو کہتی ہے۔",
    "Which of the four cases applies, and how each one sounds, is learned with a teacher and by listening to the reciter.":
      "چار میں سے کون سی صورت لاگو ہوتی ہے اور ہر ایک کیسی سنائی دیتی ہے، یہ استاد سے اور قاری کو سن کر سیکھا جاتا ہے۔",
    "How much longer is settled by the way you were taught to recite, with a qualified teacher. The sign only tells you that it is longer.":
      "کتنا زیادہ کھینچنا ہے، یہ آپ کی سیکھی ہوئی طرزِ تلاوت اور اہل استاد سے طے ہوتا ہے۔ علامت صرف اتنا بتاتی ہے کہ یہ زیادہ لمبی ہے۔",
    "The recording is a qualified reciter's, played as a reference. The app is not listening to you here.":
      "ریکارڈنگ ایک اہل قاری کی ہے، صرف حوالے کے لیے۔ یہاں ایپ آپ کو نہیں سن رہی۔",
  }),
};

export default { manifest, strings, lessons, qaida };
