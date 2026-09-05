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
};

export const lessons: LocaleLessons = { letters: {} };

export default { manifest, strings, lessons };
