/**
 * The Qaida curriculum: twelve levels that take a learner from recognising an
 * isolated Arabic letter to reading short ayat of the Quran.
 *
 * The curriculum is data, not markup. Levels, lessons, prerequisites and
 * practice items are declared here; the Learn view renders whatever this module
 * says. Adding a lesson is a data change.
 *
 * Two rules govern the content:
 *
 *  1. **Quran text is never invented.** Anything marked `source: "quran"` is a
 *     short, well-known word or phrase carried with its reference, and Level 12
 *     practises whole ayat by opening them from the app's own Quran data rather
 *     than copying text here. Everything else is marked `source: "teaching"` — a
 *     combination built to practise a shape, which must never be shown as Quran.
 *  2. **No acoustic claims.** These are reading exercises. Recognising a
 *     qalqalah letter on the page is not a judgement of how it was pronounced;
 *     the app can only observe sound where the separate Quran-aware evaluator
 *     returns a confidence-gated finding. Lessons that touch tajwid say so.
 *
 * English teaching text is inline here, as in shared/learningPath.ts, so the
 * whole curriculum is reviewable in one file.
 */

import {
  choices,
  isChoiceExercise,
  quranWord,
  teaching,
  type QaidaArabicText,
  type QaidaExercise,
  type QaidaExerciseType,
} from "./qaidaExercises";

export const QAIDA_LEVEL_IDS = [
  "letters",
  "forms",
  "harakat",
  "tanween",
  "sukoon",
  "shaddah",
  "madd",
  "hamzah",
  "lam",
  "tajweed-patterns",
  "mushaf-symbols",
  "quran-reading",
] as const;

export type QaidaLevelId = (typeof QAIDA_LEVEL_IDS)[number];

export type QaidaLevel = {
  id: QaidaLevelId;
  /** 1-based position in the course. */
  order: number;
  title: string;
  arabicTitle: string;
  objective: string;
};

export const QAIDA_LEVELS: QaidaLevel[] = [
  { id: "letters", order: 1, title: "Arabic letters", arabicTitle: "الحروف", objective: "Recognise all 28 letters by shape and by name, including the pairs that look alike." },
  { id: "forms", order: 2, title: "Letter forms and joining", arabicTitle: "الاتصال", objective: "Read a letter in its isolated, beginning, middle and ending forms, and know which letters never join forward." },
  { id: "harakat", order: 3, title: "Short vowels", arabicTitle: "الحركات", objective: "Read fatha, kasra and damma on a single letter, then across two-letter combinations." },
  { id: "tanween", order: 4, title: "Tanween", arabicTitle: "التنوين", objective: "Read the doubled endings — fathatayn, kasratayn and dammatayn." },
  { id: "sukoon", order: 5, title: "Sukoon", arabicTitle: "السكون", objective: "Read a vowelled letter joined into a letter carrying sukoon." },
  { id: "shaddah", order: 6, title: "Shaddah", arabicTitle: "الشدة", objective: "Read a doubled consonant, and a shaddah carrying fatha, kasra or damma." },
  { id: "madd", order: 7, title: "Long vowels", arabicTitle: "المد", objective: "Tell a short vowel from its long partner: alif, waw and ya madd." },
  { id: "hamzah", order: 8, title: "Hamzah and orthographic forms", arabicTitle: "الهمزة", objective: "Read hamzah on its seats, alif maqsura, ta marbuta, and the small alif of the mushaf." },
  { id: "lam", order: 9, title: "The definite article", arabicTitle: "أل التعريف", objective: "Read ال before sun letters and moon letters as the mushaf writes it." },
  { id: "tajweed-patterns", order: 10, title: "Introductory tajweed patterns", arabicTitle: "التجويد", objective: "Recognise qalqalah letters, noon and meem sakinah cases, and ghunnah on the page." },
  { id: "mushaf-symbols", order: 11, title: "Mushaf symbols", arabicTitle: "علامات المصحف", objective: "Read the stop marks and small signs printed in the mushaf." },
  { id: "quran-reading", order: 12, title: "Guided Quran reading", arabicTitle: "القراءة", objective: "Read Quranic words, phrases and short ayat, then carry them into recorded practice." },
];

/**
 * The stages a lesson may move through. Not every lesson uses every stage; the
 * lesson lists the ones it uses, in order, and the Learn view shows them as the
 * shape of the lesson.
 */
export const QAIDA_LESSON_STAGES = ["learn", "listen", "recognize", "repeat", "read", "check", "complete"] as const;

export type QaidaLessonStage = (typeof QAIDA_LESSON_STAGES)[number];

/**
 * Deterministic mastery. A lesson is complete when the learner has answered
 * `correctRequired` practice items correctly and attempted `itemsRequired` of
 * them. Nothing here is a confidence score, and nothing here is acoustic.
 *
 * Future pronunciation work can add a second, optional requirement without
 * changing any lesson definition — see `evaluateLessonAttempt`.
 */
export type QaidaMastery = {
  correctRequired: number;
  itemsRequired: number;
};

export type QaidaLesson = {
  id: string;
  level: QaidaLevelId;
  title: string;
  /** One sentence: what the learner will be able to read after this lesson. */
  objective: string;
  /** The teaching text shown before practice begins. */
  teaching: string;
  examples: QaidaArabicText[];
  stages: readonly QaidaLessonStage[];
  practice: QaidaExercise[];
  prerequisites: string[];
  mastery: QaidaMastery;
  /** The lesson that follows this one, or null at the end of the course. */
  next: string | null;
  /** Shown when a lesson touches something the app cannot judge acoustically. */
  boundary?: string;
};

type LessonSeed = Omit<QaidaLesson, "next" | "mastery" | "examples"> & {
  mastery?: Partial<QaidaMastery>;
  examples?: QaidaLesson["examples"];
};

// ---------------------------------------------------------------------------
// Level 1 — the letters, generated from the groups a Qaida teaches them in.
// ---------------------------------------------------------------------------

type CurriculumLetter = { slug: string; glyph: string; name: string };

/**
 * The letters in teaching order, grouped as a Qaida introduces them. `slug`
 * matches the app's letter recordings (client/src/lib/arabicLetters.ts), which
 * is what lets these lessons reuse the existing audio rather than generating
 * anything new. A client-side test keeps the two lists in step.
 */
const LETTER_GROUPS: Array<{ id: string; title: string; teaching: string; letters: CurriculumLetter[] }> = [
  {
    id: "alif-ba-ta-tha",
    title: "Alif, Baa, Taa, Thaa",
    teaching: "The first four letters. Baa, Taa and Thaa share one shape and differ only in their dots: one below, two above, three above. Alif stands alone as a single upright stroke.",
    letters: [
      { slug: "alif", glyph: "ا", name: "Alif" },
      { slug: "ba", glyph: "ب", name: "Baa" },
      { slug: "ta", glyph: "ت", name: "Taa" },
      { slug: "tha", glyph: "ث", name: "Thaa" },
    ],
  },
  {
    id: "jeem-hha-kha",
    title: "Jeem, Haa, Khaa",
    teaching: "Three letters on one shape. Jeem carries a dot inside, Haa carries none, and Khaa carries a dot above.",
    letters: [
      { slug: "jeem", glyph: "ج", name: "Jeem" },
      { slug: "hha", glyph: "ح", name: "Haa" },
      { slug: "kha", glyph: "خ", name: "Khaa" },
    ],
  },
  {
    id: "dal-dhal",
    title: "Daal and Dhaal",
    teaching: "One shape, one dot apart. Daal is bare; Dhaal carries a dot above. Neither of them joins to the letter that follows.",
    letters: [
      { slug: "dal", glyph: "د", name: "Daal" },
      { slug: "dhal", glyph: "ذ", name: "Dhaal" },
    ],
  },
  {
    id: "ra-zay",
    title: "Raa and Zaay",
    teaching: "A shape that dips below the line. Raa is bare, Zaay carries a dot above. Like Daal, neither joins forward.",
    letters: [
      { slug: "ra", glyph: "ر", name: "Raa" },
      { slug: "zay", glyph: "ز", name: "Zaay" },
    ],
  },
  {
    id: "seen-sheen",
    title: "Seen and Sheen",
    teaching: "Three teeth followed by a bowl. Seen is bare; Sheen carries three dots above.",
    letters: [
      { slug: "seen", glyph: "س", name: "Seen" },
      { slug: "sheen", glyph: "ش", name: "Sheen" },
    ],
  },
  {
    id: "sad-dad",
    title: "Saad and Daad",
    teaching: "A loop and a bowl. Saad is bare; Daad carries a dot above. These are the heavy partners of Seen and Daal.",
    letters: [
      { slug: "sad", glyph: "ص", name: "Saad" },
      { slug: "dad", glyph: "ض", name: "Daad" },
    ],
  },
  {
    id: "tta-zza",
    title: "Taa and Zaa",
    teaching: "A loop with an upright stroke. Taa is bare; Zaa carries a dot above. Both are heavy letters, written differently from the light Taa you met in the first lesson.",
    letters: [
      { slug: "tta", glyph: "ط", name: "Taa" },
      { slug: "zza", glyph: "ظ", name: "Zaa" },
    ],
  },
  {
    id: "ayn-ghayn",
    title: "Ayn and Ghayn",
    teaching: "One shape again. Ayn is bare; Ghayn carries a dot above.",
    letters: [
      { slug: "ayn", glyph: "ع", name: "Ayn" },
      { slug: "ghayn", glyph: "غ", name: "Ghayn" },
    ],
  },
  {
    id: "fa-qaf",
    title: "Faa and Qaaf",
    teaching: "Faa carries one dot above; Qaaf carries two. Their bowls differ as well: Qaaf's dips below the line.",
    letters: [
      { slug: "fa", glyph: "ف", name: "Faa" },
      { slug: "qaf", glyph: "ق", name: "Qaaf" },
    ],
  },
  {
    id: "kaf-to-ya",
    title: "Kaaf to Yaa",
    teaching: "The last seven letters of the alphabet, each with a shape of its own.",
    letters: [
      { slug: "kaf", glyph: "ك", name: "Kaaf" },
      { slug: "lam", glyph: "ل", name: "Laam" },
      { slug: "meem", glyph: "م", name: "Meem" },
      { slug: "noon", glyph: "ن", name: "Noon" },
      { slug: "ha", glyph: "ه", name: "Haa" },
      { slug: "waw", glyph: "و", name: "Waaw" },
      { slug: "ya", glyph: "ي", name: "Yaa" },
    ],
  },
];

const ALL_LETTERS: CurriculumLetter[] = LETTER_GROUPS.flatMap((group) => group.letters);

/**
 * Two wrong answers for a letter, taken from the letters after it in teaching
 * order. Names are filtered, not glyphs: ت and ط are both written "Taa", and ح
 * and ه are both "Haa", so a name-based question must never offer the same word
 * twice as two different options.
 */
function letterDistractors(letter: CurriculumLetter, count = 2): CurriculumLetter[] {
  const start = ALL_LETTERS.findIndex((entry) => entry.slug === letter.slug);
  const picked: CurriculumLetter[] = [];
  for (let step = 1; picked.length < count && step < ALL_LETTERS.length; step += 1) {
    const candidate = ALL_LETTERS[(start + step) % ALL_LETTERS.length];
    const clashes = candidate.name === letter.name || picked.some((entry) => entry.name === candidate.name);
    if (!clashes) picked.push(candidate);
  }
  return picked;
}

function identifyLetterExercise(letter: CurriculumLetter): QaidaExercise {
  const [first, second] = letterDistractors(letter);
  return {
    id: `identify-${letter.slug}`,
    type: "identify-letter",
    prompt: "Which letter is this?",
    subject: teaching(letter.glyph, `The letter ${letter.name}`),
    audio: { letterSlug: letter.slug },
    choices: choices([
      { label: letter.name, correct: true },
      { label: first.name },
      { label: second.name },
    ]),
  };
}

function matchAudioExercise(letter: CurriculumLetter): QaidaExercise {
  const [first, second] = letterDistractors(letter);
  return {
    id: `hear-${letter.slug}`,
    type: "match-audio",
    prompt: "Play the recording, then choose the letter you heard.",
    audio: { letterSlug: letter.slug },
    choices: choices([
      { arabic: letter.glyph, label: letter.name, correct: true },
      { arabic: first.glyph, label: first.name },
      { arabic: second.glyph, label: second.name },
    ]),
    note: "The recording is a qualified reciter's, played as a reference. The app is not listening to you here.",
  };
}

const letterLessons: LessonSeed[] = LETTER_GROUPS.map((group, index) => ({
  id: `letters-${group.id}`,
  level: "letters",
  title: group.title,
  objective: `Recognise ${group.letters.map((letter) => letter.name).join(", ")} by shape and by name.`,
  teaching: group.teaching,
  examples: group.letters.map((letter) => teaching(letter.glyph, letter.name)),
  stages: ["learn", "listen", "recognize", "check", "complete"],
  practice: [...group.letters.map(identifyLetterExercise), matchAudioExercise(group.letters[0])],
  prerequisites: index === 0 ? [] : [`letters-${LETTER_GROUPS[index - 1].id}`],
}));

/** Pairs that are told apart by their dots alone — the classic Qaida review. */
const SIMILAR_PAIRS: Array<[CurriculumLetter, CurriculumLetter]> = [
  [{ slug: "ba", glyph: "ب", name: "Baa" }, { slug: "ta", glyph: "ت", name: "Taa" }],
  [{ slug: "jeem", glyph: "ج", name: "Jeem" }, { slug: "kha", glyph: "خ", name: "Khaa" }],
  [{ slug: "dal", glyph: "د", name: "Daal" }, { slug: "dhal", glyph: "ذ", name: "Dhaal" }],
  [{ slug: "seen", glyph: "س", name: "Seen" }, { slug: "sheen", glyph: "ش", name: "Sheen" }],
  [{ slug: "sad", glyph: "ص", name: "Saad" }, { slug: "dad", glyph: "ض", name: "Daad" }],
  [{ slug: "ayn", glyph: "ع", name: "Ayn" }, { slug: "ghayn", glyph: "غ", name: "Ghayn" }],
];

const similarLettersLesson: LessonSeed = {
  id: "letters-similar",
  level: "letters",
  title: "Letters that look alike",
  objective: "Tell apart the letters that share a shape and differ only in their dots.",
  teaching: "Most Arabic letters share a body with one or two others. The dots are the whole difference: read the shape first, then count the dots and see whether they sit above or below.",
  examples: SIMILAR_PAIRS.map(([left, right]) => teaching(`${left.glyph} ${right.glyph}`, `${left.name} and ${right.name}`)),
  stages: ["learn", "recognize", "check", "complete"],
  practice: SIMILAR_PAIRS.map(([left, right]) => ({
    id: `similar-${left.slug}-${right.slug}`,
    type: "distinguish-similar" as QaidaExerciseType,
    prompt: `Which of these is ${left.name}?`,
    choices: choices([
      { arabic: left.glyph, label: left.name, correct: true },
      { arabic: right.glyph, label: right.name },
    ]),
  })),
  prerequisites: [`letters-${LETTER_GROUPS[LETTER_GROUPS.length - 1].id}`],
};

// ---------------------------------------------------------------------------
// Levels 2–12, written out.
// ---------------------------------------------------------------------------

const laterLessons: LessonSeed[] = [
  {
    id: "forms-four-positions",
    level: "forms",
    title: "The four positions",
    objective: "Read one letter in its isolated, beginning, middle and ending forms.",
    teaching: "A letter changes shape according to where it stands in a word. Baa is ب on its own, بـ at the beginning, ـبـ in the middle and ـب at the end. The body is the same each time — only the joining strokes change.",
    examples: [teaching("ب بـ ـبـ ـب", "Baa isolated, beginning, middle, ending"), teaching("ن نـ ـنـ ـن", "Noon in the same four positions")],
    stages: ["learn", "recognize", "check", "complete"],
    practice: [
      {
        id: "forms-ba-initial",
        type: "choose-connected-form",
        prompt: "Which is Baa at the beginning of a word?",
        choices: choices([{ arabic: "بـ", correct: true }, { arabic: "ـب" }, { arabic: "ـبـ" }]),
      },
      {
        id: "forms-noon-medial",
        type: "choose-connected-form",
        prompt: "Which is Noon in the middle of a word?",
        choices: choices([{ arabic: "ـنـ", correct: true }, { arabic: "نـ" }, { arabic: "ن" }]),
      },
      {
        id: "forms-meem-final",
        type: "choose-connected-form",
        prompt: "Which is Meem at the end of a word?",
        choices: choices([{ arabic: "ـم", correct: true }, { arabic: "مـ" }, { arabic: "ـمـ" }]),
      },
    ],
    prerequisites: ["letters-similar"],
  },
  {
    id: "forms-non-connectors",
    level: "forms",
    title: "Letters that do not join forward",
    objective: "Recognise the six letters that never connect to the letter after them.",
    teaching: "Six letters — ا د ذ ر ز و — join to the letter before them but never to the letter after. A word breaks into pieces at each of them, which is why some words look like two words.",
    examples: [teaching("ا د ذ ر ز و", "The six letters that do not join forward"), teaching("اب", "Alif then Baa — the two stay apart")],
    stages: ["learn", "recognize", "check", "complete"],
    practice: [
      {
        id: "forms-pick-non-connector",
        type: "choose-connected-form",
        prompt: "Which of these does not join to the letter after it?",
        choices: choices([{ arabic: "د", label: "Daal", correct: true }, { arabic: "ب", label: "Baa" }, { arabic: "س", label: "Seen" }]),
      },
      {
        id: "forms-pick-connector",
        type: "choose-connected-form",
        prompt: "Which of these does join forward?",
        choices: choices([{ arabic: "ن", label: "Noon", correct: true }, { arabic: "ر", label: "Raa" }, { arabic: "و", label: "Waaw" }]),
      },
    ],
    prerequisites: ["forms-four-positions"],
  },
  {
    id: "forms-joining-practice",
    level: "forms",
    title: "Joining letters together",
    objective: "Read short joined combinations and see where the breaks fall.",
    teaching: "Read a joined combination letter by letter, left to right in your mind but right to left on the page. Where a non-joining letter appears, the following letter starts a fresh shape.",
    examples: [teaching("بت", "Baa joined to Taa"), teaching("سن", "Seen joined to Noon"), teaching("ادم", "Alif, then Daal — both break; then Meem")],
    stages: ["learn", "read", "check", "complete"],
    practice: [
      {
        id: "forms-read-bt",
        type: "build-combination",
        prompt: "Which two letters make this combination?",
        subject: teaching("بت", "Baa then Taa"),
        choices: choices([{ label: "Baa + Taa", correct: true }, { label: "Taa + Baa" }, { label: "Noon + Taa" }]),
      },
      {
        id: "forms-read-sn",
        type: "build-combination",
        prompt: "Which two letters make this combination?",
        subject: teaching("سن", "Seen then Noon"),
        choices: choices([{ label: "Seen + Noon", correct: true }, { label: "Sheen + Noon" }, { label: "Seen + Baa" }]),
      },
      {
        id: "forms-read-aloud",
        type: "read-word",
        prompt: "Read this teaching combination aloud, then continue.",
        subject: teaching("بتث", "Baa, Taa, Thaa joined"),
      },
    ],
    prerequisites: ["forms-non-connectors"],
  },

  {
    id: "harakat-fatha",
    level: "harakat",
    title: "Fatha",
    objective: "Read a letter carrying fatha.",
    teaching: "Fatha is a small stroke above the letter. It gives the letter a short 'a' sound: بَ reads ba, تَ reads ta.",
    examples: [teaching("بَ", "ba"), teaching("تَ", "ta"), teaching("نَ", "na")],
    stages: ["learn", "listen", "recognize", "repeat", "check", "complete"],
    practice: [
      {
        id: "harakat-fatha-pick",
        type: "choose-vowelled-form",
        prompt: "Which one reads 'ba'?",
        audio: { letterSlug: "ba", harakat: "fatha" },
        choices: choices([{ arabic: "بَ", correct: true }, { arabic: "بِ" }, { arabic: "بُ" }]),
      },
      {
        id: "harakat-fatha-name",
        type: "identify-symbol",
        prompt: "What is the mark above this letter called?",
        subject: teaching("تَ", "ta"),
        choices: choices([{ label: "Fatha", correct: true }, { label: "Kasra" }, { label: "Damma" }]),
      },
    ],
    prerequisites: ["forms-joining-practice"],
  },
  {
    id: "harakat-kasra",
    level: "harakat",
    title: "Kasra",
    objective: "Read a letter carrying kasra.",
    teaching: "Kasra is the same small stroke written below the letter. It gives a short 'i' sound: بِ reads bi.",
    examples: [teaching("بِ", "bi"), teaching("تِ", "ti"), teaching("مِ", "mi")],
    stages: ["learn", "listen", "recognize", "repeat", "check", "complete"],
    practice: [
      {
        id: "harakat-kasra-pick",
        type: "choose-vowelled-form",
        prompt: "Which one reads 'bi'?",
        audio: { letterSlug: "ba", harakat: "kasra" },
        choices: choices([{ arabic: "بِ", correct: true }, { arabic: "بَ" }, { arabic: "بُ" }]),
      },
      {
        id: "harakat-kasra-name",
        type: "identify-symbol",
        prompt: "Where is a kasra written?",
        subject: teaching("مِ", "mi"),
        choices: choices([{ label: "Below the letter", correct: true }, { label: "Above the letter" }, { label: "Inside the letter" }]),
      },
    ],
    prerequisites: ["harakat-fatha"],
  },
  {
    id: "harakat-damma",
    level: "harakat",
    title: "Damma",
    objective: "Read a letter carrying damma.",
    teaching: "Damma is a small waw written above the letter. It gives a short 'u' sound: بُ reads bu.",
    examples: [teaching("بُ", "bu"), teaching("تُ", "tu"), teaching("نُ", "nu")],
    stages: ["learn", "listen", "recognize", "repeat", "check", "complete"],
    practice: [
      {
        id: "harakat-damma-pick",
        type: "choose-vowelled-form",
        prompt: "Which one reads 'bu'?",
        audio: { letterSlug: "ba", harakat: "damma" },
        choices: choices([{ arabic: "بُ", correct: true }, { arabic: "بَ" }, { arabic: "بِ" }]),
      },
      {
        id: "harakat-damma-contrast",
        type: "choose-vowelled-form",
        prompt: "Which one reads 'nu'?",
        choices: choices([{ arabic: "نُ", correct: true }, { arabic: "نِ" }, { arabic: "نَ" }]),
      },
    ],
    prerequisites: ["harakat-kasra"],
  },
  {
    id: "harakat-combinations",
    level: "harakat",
    title: "Two-letter combinations",
    objective: "Read two vowelled letters together, then a short Quranic word made only of short vowels.",
    teaching: "Read each letter with its own vowel, then join them without a pause: بَتَ reads ba-ta. Once the pair is comfortable, the same reading carries a short Quranic word.",
    examples: [teaching("بَتَ", "ba-ta"), teaching("نِمَ", "ni-ma"), quranWord("لَكَ", "laka — 'for you'", "108:1")],
    stages: ["learn", "read", "check", "complete"],
    practice: [
      {
        id: "harakat-read-bata",
        type: "build-combination",
        prompt: "How does this combination read?",
        subject: teaching("بَتَ", "ba-ta"),
        choices: choices([{ label: "ba-ta", correct: true }, { label: "bi-ta" }, { label: "ba-tu" }]),
      },
      {
        id: "harakat-read-numa",
        type: "build-combination",
        prompt: "How does this combination read?",
        subject: teaching("نُمَ", "nu-ma"),
        choices: choices([{ label: "nu-ma", correct: true }, { label: "na-mu" }, { label: "ni-ma" }]),
      },
      {
        id: "harakat-read-aloud",
        type: "read-word",
        prompt: "Read this aloud, then continue.",
        subject: teaching("بَتَثَ", "ba-ta-tha"),
      },
    ],
    prerequisites: ["harakat-damma"],
  },

  {
    id: "tanween-three-marks",
    level: "tanween",
    title: "The three tanween",
    objective: "Recognise fathatayn, kasratayn and dammatayn.",
    teaching: "Tanween is a doubled vowel mark at the end of a word. Fathatayn ً reads 'an', kasratayn ٍ reads 'in', dammatayn ٌ reads 'un'. Fathatayn usually sits on an alif written at the end.",
    examples: [teaching("بً", "ban"), teaching("بٍ", "bin"), teaching("بٌ", "bun")],
    stages: ["learn", "recognize", "check", "complete"],
    practice: [
      {
        id: "tanween-pick-un",
        type: "choose-vowelled-form",
        prompt: "Which one reads 'bun'?",
        choices: choices([{ arabic: "بٌ", correct: true }, { arabic: "بً" }, { arabic: "بٍ" }]),
      },
      {
        id: "tanween-name-in",
        type: "identify-symbol",
        prompt: "What is this ending called?",
        subject: teaching("تٍ", "tin"),
        choices: choices([{ label: "Kasratayn", correct: true }, { label: "Fathatayn" }, { label: "Dammatayn" }]),
      },
    ],
    prerequisites: ["harakat-combinations"],
  },
  {
    id: "tanween-reading",
    level: "tanween",
    title: "Reading words that end in tanween",
    objective: "Read a Quranic word ending in tanween.",
    teaching: "A word ending in tanween is read with the doubled vowel when you continue past it. Read the word through to its ending rather than stopping short of the mark.",
    examples: [quranWord("أَحَدٌ", "ahadun — 'One', ending in dammatayn", "112:1"), teaching("كِتَابٍ", "kitabin — a teaching example of kasratayn")],
    stages: ["learn", "read", "check", "complete"],
    practice: [
      {
        id: "tanween-read-ahad",
        type: "read-word",
        prompt: "Read this Quranic word aloud, then continue.",
        subject: quranWord("أَحَدٌ", "ahadun — from Surah al-Ikhlas", "112:1"),
      },
      {
        id: "tanween-identify-ending",
        type: "identify-symbol",
        prompt: "Which ending does this word carry?",
        subject: quranWord("أَحَدٌ", "ahadun", "112:1"),
        choices: choices([{ label: "Dammatayn", correct: true }, { label: "Kasratayn" }, { label: "Fathatayn" }]),
      },
    ],
    prerequisites: ["tanween-three-marks"],
  },

  {
    id: "sukoon-basics",
    level: "sukoon",
    title: "Sukoon",
    objective: "Read a letter carrying sukoon.",
    teaching: "Sukoon is a small circle above the letter. It means the letter has no vowel of its own: it closes the sound that came before it. بَبْ reads bab.",
    examples: [teaching("بْ", "b with no vowel"), teaching("بَبْ", "bab"), teaching("مِنْ", "min — a teaching combination")],
    stages: ["learn", "recognize", "read", "check", "complete"],
    practice: [
      {
        id: "sukoon-name",
        type: "identify-symbol",
        prompt: "What does this small circle above the letter mean?",
        subject: teaching("بْ", "b with sukoon"),
        choices: choices([{ label: "The letter carries no vowel", correct: true }, { label: "The letter is doubled" }, { label: "The letter is lengthened" }]),
      },
      {
        id: "sukoon-read-pair",
        type: "build-combination",
        prompt: "How does this read?",
        subject: teaching("نَمْ", "nam"),
        choices: choices([{ label: "nam", correct: true }, { label: "na-ma" }, { label: "nim" }]),
      },
    ],
    prerequisites: ["tanween-reading"],
  },
  {
    id: "sukoon-quran-words",
    level: "sukoon",
    title: "Sukoon in Quranic words",
    objective: "Read short Quranic words that contain a sakin letter.",
    teaching: "Most Quranic words join a vowelled letter into a sakin one. Read the vowelled letter, then close it on the sakin letter without adding a vowel of your own.",
    examples: [quranWord("قُلْ", "qul — 'say'", "112:1"), quranWord("الْحَمْدُ", "al-hamdu — 'all praise'", "1:2")],
    stages: ["learn", "read", "check", "complete"],
    practice: [
      {
        id: "sukoon-read-qul",
        type: "read-word",
        prompt: "Read this Quranic word aloud, then continue.",
        subject: quranWord("قُلْ", "qul — from Surah al-Ikhlas", "112:1"),
      },
      {
        id: "sukoon-find-sakin",
        type: "identify-symbol",
        prompt: "In قُلْ, which letter carries the sukoon?",
        subject: quranWord("قُلْ", "qul", "112:1"),
        choices: choices([{ arabic: "ل", label: "Laam", correct: true }, { arabic: "ق", label: "Qaaf" }, { label: "Neither" }]),
      },
    ],
    prerequisites: ["sukoon-basics"],
  },

  {
    id: "shaddah-basics",
    level: "shaddah",
    title: "Shaddah",
    objective: "Read a doubled consonant.",
    teaching: "Shaddah is a small shape like a rounded w above the letter. It doubles the letter: the first is sakin, the second carries the vowel. بَبَّ is read with the Baa held.",
    examples: [teaching("بَّ", "bba"), teaching("رَبَّ", "rabba")],
    stages: ["learn", "recognize", "read", "check", "complete"],
    practice: [
      {
        id: "shaddah-name",
        type: "identify-symbol",
        prompt: "What does the shaddah tell you to do?",
        subject: teaching("بَّ", "the letter doubled"),
        choices: choices([{ label: "Read the letter twice as one held sound", correct: true }, { label: "Skip the letter" }, { label: "Lengthen the vowel" }]),
      },
      {
        id: "shaddah-with-vowel",
        type: "choose-vowelled-form",
        prompt: "Which shows a shaddah carrying kasra?",
        choices: choices([{ arabic: "بِّ", correct: true }, { arabic: "بَّ" }, { arabic: "بُّ" }]),
      },
    ],
    prerequisites: ["sukoon-quran-words"],
  },
  {
    id: "shaddah-quran-words",
    level: "shaddah",
    title: "Shaddah in Quranic words",
    objective: "Read Quranic words that carry a shaddah.",
    teaching: "Shaddah is everywhere in the Quran, and it changes the word: read the doubled letter as one held sound rather than two separate letters.",
    examples: [quranWord("رَبِّ", "rabbi — 'Lord of'", "1:2"), quranWord("إِيَّاكَ", "iyyaka — 'You alone'", "1:5"), quranWord("الصَّمَدُ", "as-samad", "112:2")],
    stages: ["learn", "read", "check", "complete"],
    practice: [
      {
        id: "shaddah-read-rabbi",
        type: "read-word",
        prompt: "Read this Quranic word aloud, then continue.",
        subject: quranWord("رَبِّ", "rabbi — from Surah al-Fatiha", "1:2"),
      },
      {
        id: "shaddah-spot",
        type: "identify-symbol",
        prompt: "Which of these words carries a shaddah?",
        choices: choices([{ arabic: "إِيَّاكَ", correct: true }, { arabic: "قُلْ" }, { arabic: "أَحَدٌ" }]),
      },
    ],
    prerequisites: ["shaddah-basics"],
  },

  {
    id: "madd-long-vowels",
    level: "madd",
    title: "The three long vowels",
    objective: "Recognise alif, waw and ya madd after their matching vowel.",
    teaching: "A short vowel becomes long when it is followed by its own letter: fatha with alif (بَا), damma with waw (بُو), kasra with ya (بِي). The mouth holds the same sound for longer.",
    examples: [teaching("بَا", "baa"), teaching("بُو", "buu"), teaching("بِي", "bii")],
    stages: ["learn", "listen", "recognize", "check", "complete"],
    practice: [
      {
        id: "madd-pick-alif",
        type: "choose-vowelled-form",
        prompt: "Which shows a fatha followed by alif?",
        choices: choices([{ arabic: "بَا", correct: true }, { arabic: "بُو" }, { arabic: "بِي" }]),
      },
      {
        id: "madd-pick-waw",
        type: "choose-vowelled-form",
        prompt: "Which shows a damma followed by waw?",
        choices: choices([{ arabic: "نُو", correct: true }, { arabic: "نِي" }, { arabic: "نَا" }]),
      },
    ],
    prerequisites: ["shaddah-quran-words"],
    boundary: "This lesson is about seeing a long vowel on the page. How long to hold it is a matter for a qualified teacher; the app does not measure it.",
  },
  {
    id: "madd-short-vs-long",
    level: "madd",
    title: "Short against long",
    objective: "Tell a short vowel from its long partner at a glance.",
    teaching: "بَ and بَا are the same letter with the same vowel; the alif is what makes it long. Reading them the same way is the most common beginner's mistake, and it is a reading mistake before it is a sound one.",
    examples: [teaching("بَ / بَا", "ba against baa"), quranWord("الْعَالَمِينَ", "al-'alamin — carries a long alif", "1:2")],
    stages: ["learn", "recognize", "read", "check", "complete"],
    practice: [
      {
        id: "madd-contrast",
        type: "distinguish-similar",
        prompt: "Which of these is the long one?",
        choices: choices([{ arabic: "بَا", correct: true }, { arabic: "بَ" }]),
      },
      {
        id: "madd-read-quran-word",
        type: "read-word",
        prompt: "Read this Quranic word aloud, holding the long vowel.",
        subject: quranWord("الْعَالَمِينَ", "al-'alamin — from Surah al-Fatiha", "1:2"),
      },
    ],
    prerequisites: ["madd-long-vowels"],
    boundary: "The app checks that you can see the difference, not that you held it for the right count.",
  },
  {
    id: "madd-signs",
    level: "madd",
    title: "The madd sign",
    objective: "Recognise the madd sign written above a long vowel in the mushaf.",
    teaching: "The mushaf marks some long vowels with a wavy sign, ٓ, above the letter. It tells the reader this madd is longer than the basic two counts.",
    examples: [teaching("ـٓـ", "the madd sign"), quranWord("الرَّحْمَٰنِ", "ar-rahman — written with a small alif", "1:1")],
    stages: ["learn", "recognize", "check", "complete"],
    practice: [
      {
        id: "madd-sign-meaning",
        type: "identify-symbol",
        prompt: "What does the wavy madd sign above a letter tell the reader?",
        choices: choices([{ label: "This long vowel is held longer than the basic length", correct: true }, { label: "Stop here" }, { label: "The letter is doubled" }]),
      },
    ],
    prerequisites: ["madd-short-vs-long"],
    boundary: "Recognising the sign is a reading skill. The exact count belongs to a qualified teacher, and the app does not measure duration.",
  },

  {
    id: "hamzah-seats",
    level: "hamzah",
    title: "Hamzah and its seats",
    objective: "Read hamzah written on alif, waw and ya.",
    teaching: "Hamzah is a sound of its own, written as ء or carried on a seat: أ and إ on alif, ؤ on waw, ئ on ya. The seat is spelling, not sound — the hamzah reads the same on all of them.",
    examples: [teaching("أ إ ؤ ئ ء", "hamzah on its seats"), quranWord("أَحَدٌ", "ahadun — hamzah on alif with fatha", "112:1"), quranWord("إِيَّاكَ", "iyyaka — hamzah under alif with kasra", "1:5")],
    stages: ["learn", "recognize", "read", "check", "complete"],
    practice: [
      {
        id: "hamzah-above-below",
        type: "choose-vowelled-form",
        prompt: "Which one carries a kasra, with the hamzah written below the alif?",
        choices: choices([{ arabic: "إِ", correct: true }, { arabic: "أَ" }, { arabic: "أُ" }]),
      },
      {
        id: "hamzah-seat",
        type: "identify-symbol",
        prompt: "In ئ, what is the hamzah sitting on?",
        choices: choices([{ label: "Yaa", correct: true }, { label: "Waaw" }, { label: "Alif" }]),
      },
    ],
    prerequisites: ["madd-signs"],
  },
  {
    id: "hamzah-wasl",
    level: "hamzah",
    title: "Hamzat al-wasl",
    objective: "Recognise the alif that is read when you start on it and passed over when you continue.",
    teaching: "The alif of ال and of some verbs is a joining alif. Start a phrase on it and you read it; continue into it from the word before and you read straight past it into the next letter.",
    examples: [quranWord("الْحَمْدُ", "al-hamdu — begun with the joining alif", "1:2"), quranWord("اهْدِنَا", "ihdina — begun with the joining alif", "1:6")],
    stages: ["learn", "recognize", "read", "check", "complete"],
    practice: [
      {
        id: "hamzah-wasl-behaviour",
        type: "identify-symbol",
        prompt: "You are continuing from the previous word into ال. What happens to its alif?",
        choices: choices([{ label: "It is passed over and not read", correct: true }, { label: "It is read as a full hamzah" }, { label: "It is lengthened" }]),
      },
      {
        id: "hamzah-wasl-read",
        type: "read-word",
        prompt: "Start on this word and read it aloud, sounding the opening alif.",
        subject: quranWord("اهْدِنَا", "ihdina — from Surah al-Fatiha", "1:6"),
      },
    ],
    prerequisites: ["hamzah-seats"],
  },
  {
    id: "hamzah-orthography",
    level: "hamzah",
    title: "Alif maqsura, ta marbuta and the small alif",
    objective: "Read the three written forms a beginner meets constantly in the mushaf.",
    teaching: "Alif maqsura ى is written like a ya without dots and read as a long 'a'. Ta marbuta ة is read as 't' when you continue and as 'h' when you stop on it. The small alif is a miniature alif printed above a letter where a long 'a' is read but no alif is written.",
    examples: [teaching("ى", "alif maqsura"), teaching("ة", "ta marbuta"), quranWord("الرَّحْمَٰنِ", "ar-rahman — the small alif above the Meem", "1:1")],
    stages: ["learn", "recognize", "check", "complete"],
    practice: [
      {
        id: "orthography-maqsura",
        type: "identify-symbol",
        prompt: "How is ى at the end of a word read?",
        choices: choices([{ label: "As a long 'a'", correct: true }, { label: "As a long 'i'" }, { label: "As a 'y' sound" }]),
      },
      {
        id: "orthography-small-alif",
        type: "identify-symbol",
        prompt: "What does a small alif printed above a letter tell you?",
        subject: quranWord("الرَّحْمَٰنِ", "ar-rahman", "1:1"),
        choices: choices([{ label: "Read a long 'a' there, though no alif is written", correct: true }, { label: "Stop there" }, { label: "Double the letter" }]),
      },
      {
        id: "orthography-ta-marbuta",
        type: "identify-symbol",
        prompt: "You stop at the end of a word ending in ة. How is it read?",
        choices: choices([{ label: "As 'h'", correct: true }, { label: "As 't'" }, { label: "It is silent" }]),
      },
    ],
    prerequisites: ["hamzah-wasl"],
  },

  {
    id: "lam-sun-moon",
    level: "lam",
    title: "Sun letters and moon letters",
    objective: "Read ال correctly before both kinds of letter.",
    teaching: "Before a moon letter the Laam of ال is read and carries sukoon: الْحَمْدُ. Before a sun letter the Laam is not read; the next letter is doubled instead and carries a shaddah: الصِّرَاطَ. The mushaf shows you which: look for the sukoon on the Laam, or the shaddah on the letter after it.",
    examples: [quranWord("الْحَمْدُ", "al-hamdu — moon letter, Laam read", "1:2"), quranWord("الصِّرَاطَ", "as-sirat — sun letter, Laam not read", "1:6"), quranWord("الرَّحِيمِ", "ar-rahim — sun letter", "1:1")],
    stages: ["learn", "recognize", "read", "check", "complete"],
    practice: [
      {
        id: "lam-moon-example",
        type: "identify-symbol",
        prompt: "In الْحَمْدُ, is the Laam of ال read?",
        subject: quranWord("الْحَمْدُ", "al-hamdu", "1:2"),
        choices: choices([{ label: "Yes — the Laam carries sukoon and is read", correct: true }, { label: "No — the Haa is doubled instead" }]),
      },
      {
        id: "lam-sun-example",
        type: "identify-symbol",
        prompt: "In الصِّرَاطَ, why is there a shaddah on the Saad?",
        subject: quranWord("الصِّرَاطَ", "as-sirat", "1:6"),
        choices: choices([{ label: "Saad is a sun letter, so the Laam merges into it", correct: true }, { label: "The word is emphasised" }, { label: "The Saad is lengthened" }]),
      },
    ],
    prerequisites: ["hamzah-orthography"],
  },
  {
    id: "lam-reading-practice",
    level: "lam",
    title: "Reading ال in place",
    objective: "Read words with ال without stopping to work out which kind of letter follows.",
    teaching: "With practice the shaddah and the sukoon do the work for you: you read what is printed. Read these aloud in turn and notice how the Laam behaves each time.",
    examples: [quranWord("الرَّحْمَٰنِ", "ar-rahman", "1:1"), quranWord("الْعَالَمِينَ", "al-'alamin", "1:2"), quranWord("الدِّينِ", "ad-din", "1:4")],
    stages: ["read", "check", "complete"],
    practice: [
      {
        id: "lam-read-rahman",
        type: "read-word",
        prompt: "Read this aloud — a sun letter, so the Laam merges.",
        subject: quranWord("الرَّحْمَٰنِ", "ar-rahman — from Surah al-Fatiha", "1:1"),
      },
      {
        id: "lam-read-alamin",
        type: "read-word",
        prompt: "Read this aloud — a moon letter, so the Laam is read.",
        subject: quranWord("الْعَالَمِينَ", "al-'alamin — from Surah al-Fatiha", "1:2"),
      },
    ],
    prerequisites: ["lam-sun-moon"],
  },

  {
    id: "tajweed-qalqalah",
    level: "tajweed-patterns",
    title: "Qalqalah letters",
    objective: "Recognise the five qalqalah letters when they carry sukoon.",
    teaching: "Five letters — ق ط ب ج د, remembered as قطب جد — give a small echo when they carry sukoon or when you stop on them. This lesson is recognising them on the page.",
    examples: [teaching("ق ط ب ج د", "the qalqalah letters"), quranWord("الْفَلَقِ", "al-falaq — stopping on the Qaaf", "113:1")],
    stages: ["learn", "recognize", "check", "complete"],
    practice: [
      {
        id: "qalqalah-pick",
        type: "identify-symbol",
        prompt: "Which of these is a qalqalah letter?",
        choices: choices([{ arabic: "ط", label: "Taa", correct: true }, { arabic: "س", label: "Seen" }, { arabic: "ف", label: "Faa" }]),
      },
      {
        id: "qalqalah-count",
        type: "identify-symbol",
        prompt: "How many qalqalah letters are there?",
        choices: choices([{ label: "Five", correct: true }, { label: "Three" }, { label: "Seven" }]),
      },
    ],
    prerequisites: ["lam-reading-practice"],
    boundary: "Recognising a qalqalah letter is a reading skill. Whether your qalqalah was produced correctly is for a qualified teacher; the app does not judge it from a transcript.",
  },
  {
    id: "tajweed-noon-sakinah",
    level: "tajweed-patterns",
    title: "Noon sakinah and tanween",
    objective: "Name the four cases of noon sakinah and tanween by the letter that follows.",
    teaching: "A sakin Noon, and tanween, behave in one of four ways depending on the letter after them: izhar (clear), idgham (merged), iqlab (turned into a Meem sound), ikhfa (hidden). At this level you are learning to recognise which case a printed word falls into.",
    examples: [teaching("نْ", "noon with sukoon"), teaching("ـً ـٍ ـٌ", "the three tanween")],
    stages: ["learn", "recognize", "check", "complete"],
    practice: [
      {
        id: "noon-cases-count",
        type: "identify-symbol",
        prompt: "How many cases does a sakin Noon have?",
        choices: choices([{ label: "Four", correct: true }, { label: "Two" }, { label: "Six" }]),
      },
      {
        id: "noon-iqlab",
        type: "identify-symbol",
        prompt: "Which case turns the Noon sound towards a Meem?",
        choices: choices([{ label: "Iqlab", correct: true }, { label: "Izhar" }, { label: "Ikhfa" }]),
      },
    ],
    prerequisites: ["tajweed-qalqalah"],
    boundary: "These are names for what is written. The app does not assess whether your ikhfa, idgham or ghunnah was produced correctly — only a qualified teacher, or a specialist acoustic evaluation, can speak to that.",
  },
  {
    id: "tajweed-meem-ghunnah",
    level: "tajweed-patterns",
    title: "Meem sakinah and ghunnah",
    objective: "Recognise a sakin Meem and the nasal sound carried by a doubled Noon or Meem.",
    teaching: "A sakin Meem has three cases of its own, and any Noon or Meem carrying a shaddah is read with ghunnah — a nasal hum. On the page, look for the shaddah.",
    examples: [teaching("مْ", "meem with sukoon"), quranWord("إِنَّ", "inna — a doubled Noon, read with ghunnah", "103:2")],
    stages: ["learn", "recognize", "check", "complete"],
    practice: [
      {
        id: "ghunnah-spot",
        type: "identify-symbol",
        prompt: "Which of these is read with ghunnah?",
        choices: choices([{ arabic: "إِنَّ", label: "Doubled Noon", correct: true }, { arabic: "قُلْ", label: "Sakin Laam" }, { arabic: "بَا", label: "Long alif" }]),
      },
      {
        id: "ghunnah-source",
        type: "identify-symbol",
        prompt: "Where in the body does ghunnah resonate?",
        choices: choices([{ label: "The nose", correct: true }, { label: "The throat" }, { label: "The lips" }]),
      },
    ],
    prerequisites: ["tajweed-noon-sakinah"],
    boundary: "This is recognition on the page. Ghunnah duration is not something the app measures.",
  },

  {
    id: "symbols-stop-marks",
    level: "mushaf-symbols",
    title: "Stop marks",
    objective: "Read the small letters printed above the line that tell you where to stop.",
    teaching: "The mushaf marks stopping places with small letters: م a required stop, لا do not stop here, ج stopping is allowed, قلى stopping is better, صلى continuing is better. They are a reading aid, put there so the meaning is not broken.",
    examples: [teaching("م", "required stop"), teaching("لا", "do not stop"), teaching("ج", "stop permitted"), teaching("قلى", "stopping preferred"), teaching("صلى", "continuing preferred")],
    stages: ["learn", "recognize", "check", "complete"],
    practice: [
      {
        id: "symbols-laa",
        type: "identify-symbol",
        prompt: "What does لا above the line mean?",
        subject: teaching("لا", "the no-stop mark"),
        choices: choices([{ label: "Do not stop here", correct: true }, { label: "Stop here" }, { label: "Repeat the word" }]),
      },
      {
        id: "symbols-meem",
        type: "identify-symbol",
        prompt: "What does م above the line mean?",
        subject: teaching("م", "the compulsory stop mark"),
        choices: choices([{ label: "A stop is required here", correct: true }, { label: "Stopping is optional" }, { label: "Continue without stopping" }]),
      },
      {
        id: "symbols-qila",
        type: "identify-symbol",
        prompt: "What does قلى tell the reader?",
        subject: teaching("قلى", "stopping preferred"),
        choices: choices([{ label: "Stopping is preferred, though continuing is allowed", correct: true }, { label: "Never stop here" }, { label: "The ayah ends here" }]),
      },
    ],
    prerequisites: ["tajweed-meem-ghunnah"],
  },
  {
    id: "symbols-small-marks",
    level: "mushaf-symbols",
    title: "Small marks in the text",
    objective: "Read the small signs printed inside the words themselves.",
    teaching: "Besides the stop marks, the mushaf prints small signs inside the line: the small alif for an unwritten long 'a', the madd sign for a lengthened vowel, and the ayah number in its own medallion at the end of each ayah.",
    examples: [quranWord("الرَّحْمَٰنِ", "the small alif above the Meem", "1:1"), teaching("ـٓـ", "the madd sign")],
    stages: ["learn", "recognize", "check", "complete"],
    practice: [
      {
        id: "symbols-medallion",
        type: "identify-symbol",
        prompt: "What is the decorated circle at the end of an ayah?",
        choices: choices([{ label: "The ayah number", correct: true }, { label: "A required stop" }, { label: "A madd sign" }]),
      },
      {
        id: "symbols-small-alif-again",
        type: "identify-symbol",
        prompt: "A small alif is printed above a letter. What do you read?",
        choices: choices([{ label: "A long 'a', as though an alif were written", correct: true }, { label: "Nothing — it is decorative" }, { label: "A short 'a'" }]),
      },
    ],
    prerequisites: ["symbols-stop-marks"],
  },

  {
    id: "quran-words",
    level: "quran-reading",
    title: "Quranic words",
    objective: "Read single Quranic words that use everything learned so far.",
    teaching: "Every rule you have met appears in these four words: a joining alif, a sun letter, a shaddah, a long vowel, a sakin letter. Read each one slowly, then again at a steady pace.",
    examples: [quranWord("بِسْمِ", "bismi", "1:1"), quranWord("اللَّهِ", "Allahi", "1:1"), quranWord("الرَّحْمَٰنِ", "ar-rahman", "1:1"), quranWord("الرَّحِيمِ", "ar-rahim", "1:1")],
    stages: ["learn", "read", "check", "complete"],
    practice: [
      {
        id: "quran-read-bismi",
        type: "read-word",
        prompt: "Read this word aloud.",
        subject: quranWord("بِسْمِ", "bismi — from Surah al-Fatiha", "1:1"),
      },
      {
        id: "quran-read-rahim",
        type: "read-word",
        prompt: "Read this word aloud — a sun letter and a long vowel.",
        subject: quranWord("الرَّحِيمِ", "ar-rahim — from Surah al-Fatiha", "1:1"),
      },
    ],
    prerequisites: ["symbols-small-marks"],
  },
  {
    id: "quran-first-ayah",
    level: "quran-reading",
    title: "Your first ayah",
    objective: "Read a complete ayah from the mushaf.",
    teaching: "The words you have just read make one ayah. Open it in Study mode: the text comes from the app's Quran data, with a qualified reciter to listen to first.",
    examples: [],
    stages: ["listen", "read", "complete"],
    practice: [
      {
        id: "quran-open-fatiha-1",
        type: "read-quran",
        prompt: "Listen to the reciter, then read this ayah aloud.",
        quran: { surah: 1, ayah: 1, label: "Al-Fatiha 1:1" },
      },
    ],
    prerequisites: ["quran-words"],
  },
  {
    id: "quran-short-ayat",
    level: "quran-reading",
    title: "Short ayat",
    objective: "Read several short ayat in sequence.",
    teaching: "Read these one after another. Each is short enough to hold in one breath, and each uses the letters, vowels and signs you now know.",
    examples: [],
    stages: ["listen", "read", "complete"],
    practice: [
      {
        id: "quran-open-fatiha-2",
        type: "read-quran",
        prompt: "Read this ayah aloud.",
        quran: { surah: 1, ayah: 2, label: "Al-Fatiha 1:2" },
      },
      {
        id: "quran-open-ikhlas-1",
        type: "read-quran",
        prompt: "Read this ayah aloud.",
        quran: { surah: 112, ayah: 1, label: "Al-Ikhlas 112:1" },
      },
      {
        id: "quran-open-asr-1",
        type: "read-quran",
        prompt: "Read this ayah aloud.",
        quran: { surah: 103, ayah: 1, label: "Al-'Asr 103:1" },
      },
    ],
    prerequisites: ["quran-first-ayah"],
  },
  {
    id: "quran-short-surah",
    level: "quran-reading",
    title: "A short surah, recorded",
    objective: "Read a short surah from beginning to end and record it for word-recall review.",
    teaching: "The last step of the Qaida is the first step of your recitation practice. Open the surah in Study mode, listen to the reciter, then record yourself. The review tells you which words were recognised and where to pick up again — it is a reading check, not a judgement of tajwid.",
    examples: [],
    stages: ["listen", "read", "repeat", "complete"],
    practice: [
      {
        id: "quran-open-ikhlas-full",
        type: "read-quran",
        prompt: "Open Surah al-Ikhlas and record your recitation of its first ayah.",
        quran: { surah: 112, ayah: 1, label: "Al-Ikhlas 112:1" },
      },
      {
        id: "quran-open-kawthar",
        type: "read-quran",
        prompt: "Open Surah al-Kawthar and record its first ayah.",
        quran: { surah: 108, ayah: 1, label: "Al-Kawthar 108:1" },
      },
    ],
    prerequisites: ["quran-short-ayat"],
    boundary: "The recorded review compares transcribed words with the ayah. It does not assess tajwid, makhraj, madd duration or ghunnah.",
  },
];

const LESSON_SEEDS: LessonSeed[] = [...letterLessons, similarLettersLesson, ...laterLessons];

/**
 * Every lesson, in course order. `next` is filled in from that order so a lesson
 * always carries the one that follows without the two being able to drift.
 */
export const QAIDA_LESSONS: QaidaLesson[] = LESSON_SEEDS.map((seed, index) => ({
  ...seed,
  examples: seed.examples ?? [],
  mastery: {
    correctRequired: seed.mastery?.correctRequired ?? seed.practice.length,
    itemsRequired: seed.mastery?.itemsRequired ?? seed.practice.length,
  },
  next: LESSON_SEEDS[index + 1]?.id ?? null,
}));

export const FIRST_LESSON_ID = QAIDA_LESSONS[0].id;

const LESSONS_BY_ID = new Map(QAIDA_LESSONS.map((lesson) => [lesson.id, lesson]));

export function getQaidaLesson(lessonId: string): QaidaLesson | null {
  return LESSONS_BY_ID.get(lessonId) ?? null;
}

export function getQaidaLevel(levelId: QaidaLevelId): QaidaLevel | null {
  return QAIDA_LEVELS.find((level) => level.id === levelId) ?? null;
}

export function lessonsForLevel(levelId: QaidaLevelId): QaidaLesson[] {
  return QAIDA_LESSONS.filter((lesson) => lesson.level === levelId);
}

/** Course-order position of a lesson, 1-based; 0 when the id is unknown. */
export function lessonOrder(lessonId: string): number {
  return QAIDA_LESSONS.findIndex((lesson) => lesson.id === lessonId) + 1;
}

/**
 * A lesson is unlocked once every prerequisite is complete. Completed lessons
 * stay unlocked forever: review is never taken away, and nothing here locks a
 * learner out for answering wrongly.
 */
export function isLessonUnlocked(lessonId: string, completedLessons: readonly string[]): boolean {
  const lesson = getQaidaLesson(lessonId);
  if (!lesson) return false;
  if (completedLessons.includes(lessonId)) return true;
  return lesson.prerequisites.every((prerequisite) => completedLessons.includes(prerequisite));
}

/** The first unlocked lesson that has not been completed, or null when done. */
export function nextIncompleteLesson(completedLessons: readonly string[]): QaidaLesson | null {
  return QAIDA_LESSONS.find(
    (lesson) => !completedLessons.includes(lesson.id) && isLessonUnlocked(lesson.id, completedLessons),
  ) ?? null;
}

/** The lesson that follows this one in course order. */
export function followingLesson(lessonId: string): QaidaLesson | null {
  const next = getQaidaLesson(lessonId)?.next;
  return next ? getQaidaLesson(next) : null;
}

export type QaidaLevelProgress = {
  level: QaidaLevel;
  completed: number;
  total: number;
  percent: number;
  unlocked: boolean;
};

export function levelProgress(levelId: QaidaLevelId, completedLessons: readonly string[]): QaidaLevelProgress | null {
  const level = getQaidaLevel(levelId);
  if (!level) return null;
  const lessons = lessonsForLevel(levelId);
  const completed = lessons.filter((lesson) => completedLessons.includes(lesson.id)).length;
  return {
    level,
    completed,
    total: lessons.length,
    percent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
    unlocked: lessons.some((lesson) => isLessonUnlocked(lesson.id, completedLessons)),
  };
}

export function curriculumProgressPercent(completedLessons: readonly string[]): number {
  const known = completedLessons.filter((lessonId) => LESSONS_BY_ID.has(lessonId)).length;
  return QAIDA_LESSONS.length ? Math.round((known / QAIDA_LESSONS.length) * 100) : 0;
}

export type QaidaAttempt = {
  /** Practice items answered correctly in this sitting. */
  correctCount: number;
  /** Practice items attempted, right or wrong. */
  attemptedCount: number;
};

export type QaidaMasteryResult = {
  met: boolean;
  /** Correct answers still needed. */
  remainingCorrect: number;
  /** Items still to attempt. */
  remainingItems: number;
};

/**
 * Deterministic mastery check. Everything it reads is a count of answers the
 * learner gave, so it cannot report a confidence it does not have.
 *
 * When acoustic evaluation arrives, it can be added as a further requirement on
 * `QaidaMastery` — no lesson definition needs to change for that.
 */
export function evaluateLessonAttempt(lesson: QaidaLesson, attempt: QaidaAttempt): QaidaMasteryResult {
  const remainingCorrect = Math.max(0, lesson.mastery.correctRequired - attempt.correctCount);
  const remainingItems = Math.max(0, lesson.mastery.itemsRequired - attempt.attemptedCount);
  return { met: remainingCorrect === 0 && remainingItems === 0, remainingCorrect, remainingItems };
}

/** Every exercise type the curriculum actually uses, for tests and tooling. */
export function usedExerciseTypes(): QaidaExerciseType[] {
  const seen: QaidaExerciseType[] = [];
  for (const lesson of QAIDA_LESSONS) {
    for (const item of lesson.practice) if (!seen.includes(item.type)) seen.push(item.type);
  }
  return seen;
}

/** Practice items that ask a question with options, for the Learn view. */
export function choiceItems(lesson: QaidaLesson): QaidaExercise[] {
  return lesson.practice.filter((item) => isChoiceExercise(item.type));
}
