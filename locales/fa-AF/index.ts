/**
 * Dari — interface pack.
 *
 * Locale `fa-AF`: the Afghan variety of Persian. See shared/languages.ts for
 * why the region-tagged Persian code is used rather than `fa` or `prs`.
 *
 * The interface, the teacher's instructions and the study controls are in Dari.
 * Long-form teaching text still falls back to English, per key, and the picker
 * says so.
 *
 * The Quran itself is untouched by this file: its Arabic text, the ayah
 * recitations and the letter recordings are shared by every language.
 *
 * NOT YET REVIEWED BY A NATIVE SPEAKER. `nativeReviewed: false` in
 * shared/languages.ts records that.
 */
import type { LocaleLessons, LocaleManifest } from "../types";
import type { TranslatableStrings } from "../index";
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
};

export const lessons: LocaleLessons = { letters: {} };

export default { manifest, strings, lessons };
