/**
 * Pashto — interface pack.
 *
 * The interface, the teacher's instructions and the study controls are in
 * Pashto. Long-form teaching text still falls back to English, per key, and the
 * picker says so.
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
};

export const lessons: LocaleLessons = { letters: {} };

export default { manifest, strings, lessons };
