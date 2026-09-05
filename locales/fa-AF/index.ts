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
 * correctness stay in the curriculum. Levels 1–4 are translated; later levels
 * fall back to English, per field.
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
  },
  exercises: promptsFromPhrasebook(QAIDA_LESSONS, {
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
    "The recording is a qualified reciter's, played as a reference. The app is not listening to you here.":
      "ضبط از یک قاری شایسته است و تنها برای راهنمایی پخش می‌شود. برنامه اینجا به شما گوش نمی‌دهد.",
  }),
};

export default { manifest, strings, lessons, qaida };
