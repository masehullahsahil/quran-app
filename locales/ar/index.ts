/**
 * Arabic — interface pack.
 *
 * The interface, the teacher's instructions and the study controls are in
 * Arabic. Long-form teaching text (the Qaida lessons, the coaching plans) still
 * falls back to English, per key, and the picker says so.
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
};

export const lessons: LocaleLessons = { letters: {} };

export default { manifest, strings, lessons };
