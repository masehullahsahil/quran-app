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
 * correctness stay in the curriculum. Levels 1–4 are translated; later levels
 * fall back to English, per field.
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
  },
  exercises: promptsFromPhrasebook(QAIDA_LESSONS, {
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
    "The recording is a qualified reciter's, played as a reference. The app is not listening to you here.":
      "ثبت د یوه وړ قاري دی، یوازې د لارښوونې لپاره غږول کیږي. اپلیکیشن دلته تاسو ته غوږ نه نیسي.",
  }),
};

export default { manifest, strings, lessons, qaida };
