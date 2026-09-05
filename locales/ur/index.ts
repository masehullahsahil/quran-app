/**
 * Urdu — interface pack.
 *
 * The interface, the teacher's instructions and the study controls are in Urdu.
 * Long-form teaching text (the Qaida lessons, the coaching plans) still falls
 * back to English, per key, and the picker says so.
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
 * are the same in every language. Levels 1–4 are translated; later levels fall
 * back to English, per field.
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
  },
  exercises: promptsFromPhrasebook(QAIDA_LESSONS, {
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
    "The recording is a qualified reciter's, played as a reference. The app is not listening to you here.":
      "ریکارڈنگ ایک اہل قاری کی ہے، صرف حوالے کے لیے۔ یہاں ایپ آپ کو نہیں سن رہی۔",
  }),
};

export default { manifest, strings, lessons, qaida };
