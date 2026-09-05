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
 * references and answer correctness stay in the curriculum. Levels 1–4 are
 * translated; later levels fall back to English, per field.
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
  },
  exercises: promptsFromPhrasebook(QAIDA_LESSONS, {
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
    "The recording is a qualified reciter's, played as a reference. The app is not listening to you here.":
      "التسجيل لقارئ مؤهَّل، يُشغَّل للاسترشاد. والتطبيق لا يستمع إليك هنا.",
  }),
};

export default { manifest, strings, lessons, qaida };
