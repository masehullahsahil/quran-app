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
  placeChoices,
  quranWord,
  teaching,
  type QaidaArabicText,
  type QaidaExercise,
  type QaidaExerciseType,
} from "./qaidaExercises";
import {
  harakatExerciseDrills,
  joinedLetterDrills,
  leenDrills,
  maddDrills,
  maddExerciseDrills,
  shaddahCombinationDrills,
  shaddahDrills,
  shortVowelDrills,
  sukoonDrills,
  tanweenDrills,
  tanweenExerciseDrills,
} from "./qaidaDrills";

export const QAIDA_LEVEL_IDS = [
  "letters",
  "forms",
  "harakat",
  "tanween",
  // Long vowels come before sukoon and shaddah, as a Qaida teaches them: a madd
  // letter is the short vowel just learned, held longer, while sukoon closes a
  // syllable and shaddah is a sakin letter joined to a vowelled one — so
  // shaddah depends on sukoon, and both are harder than madd. Long vowels also
  // appear in almost every Quranic word, so the learner needs them to read
  // anything real.
  "madd",
  "sukoon",
  "shaddah",
  // The definite article comes before hamzah: hamzat al-wasl is explained
  // through ال, which the learner should already be reading by then, and the
  // small alif belongs with the other orthographic forms rather than in front
  // of them.
  "lam",
  "hamzah",
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
  { id: "madd", order: 5, title: "Long vowels", arabicTitle: "المد", objective: "Hold a vowel longer when its own letter follows it: alif, waw and ya." },
  { id: "sukoon", order: 6, title: "Sukoon", arabicTitle: "السكون", objective: "Read a vowelled letter joined into a letter carrying sukoon." },
  { id: "shaddah", order: 7, title: "Shaddah", arabicTitle: "الشدة", objective: "Read a doubled letter, and a shaddah carrying fatha, kasra or damma." },
  { id: "lam", order: 8, title: "The definite article", arabicTitle: "أل التعريف", objective: "Read ال before sun letters and moon letters as the mushaf writes it." },
  { id: "hamzah", order: 9, title: "Hamzah and written forms", arabicTitle: "الهمزة", objective: "Read hamzah on its seats, the joining alif, ى and ة, and the small alif of the mushaf." },
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

/**
 * A lesson as written. `next` and `prerequisites` are not written by hand: the
 * course is one sequence, so each lesson's prerequisite is the lesson before it
 * and `next` is the one after, both derived from course order below. Inserting
 * a lesson therefore cannot leave a dangling or skipped prerequisite.
 */
type LessonSeed = Omit<QaidaLesson, "next" | "mastery" | "examples" | "prerequisites"> & {
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
 * The 28 letters in teaching order, as the course itself declares them.
 *
 * Exported so tooling — the teacher audit inventory, the review report — can
 * name a letter without restating its glyph or its name anywhere else. This is
 * a view of the data above, not a second copy of it.
 */
export type QaidaLetter = CurriculumLetter;
export const QAIDA_LETTERS: readonly CurriculumLetter[] = ALL_LETTERS;

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
}));

/**
 * The letters a beginner actually confuses, split into two sittings.
 *
 * The first group is told apart by dots alone; the second adds the pairs whose
 * bodies differ slightly as well, plus the two that sound close enough to be
 * worth contrasting on the page (ه/ح and ك/ق). Every group named in a standard
 * Qaida's revision page is covered, and a test checks that.
 *
 * Each item asks for one named letter among its look-alikes, so the learner has
 * to read the shape rather than eliminate an obviously different one.
 */
type SimilarGroup = { id: string; letters: CurriculumLetter[]; ask: number };

const SIMILAR_DOTS: SimilarGroup[] = [
  { id: "ba-ta-tha", ask: 2, letters: [
    { slug: "ba", glyph: "ب", name: "Baa" },
    { slug: "ta", glyph: "ت", name: "Taa" },
    { slug: "tha", glyph: "ث", name: "Thaa" },
  ] },
  { id: "jeem-hha-kha", ask: 1, letters: [
    { slug: "jeem", glyph: "ج", name: "Jeem" },
    { slug: "hha", glyph: "ح", name: "Haa" },
    { slug: "kha", glyph: "خ", name: "Khaa" },
  ] },
  { id: "dal-dhal", ask: 1, letters: [
    { slug: "dal", glyph: "د", name: "Daal" },
    { slug: "dhal", glyph: "ذ", name: "Dhaal" },
  ] },
  { id: "ra-zay", ask: 1, letters: [
    { slug: "ra", glyph: "ر", name: "Raa" },
    { slug: "zay", glyph: "ز", name: "Zaay" },
  ] },
  { id: "seen-sheen", ask: 0, letters: [
    { slug: "seen", glyph: "س", name: "Seen" },
    { slug: "sheen", glyph: "ش", name: "Sheen" },
  ] },
];

const SIMILAR_SHAPES: SimilarGroup[] = [
  { id: "sad-dad", ask: 1, letters: [
    { slug: "sad", glyph: "ص", name: "Saad" },
    { slug: "dad", glyph: "ض", name: "Daad" },
  ] },
  { id: "tta-zza", ask: 1, letters: [
    { slug: "tta", glyph: "ط", name: "Taa" },
    { slug: "zza", glyph: "ظ", name: "Zaa" },
  ] },
  { id: "ayn-ghayn", ask: 0, letters: [
    { slug: "ayn", glyph: "ع", name: "Ayn" },
    { slug: "ghayn", glyph: "غ", name: "Ghayn" },
  ] },
  { id: "fa-qaf", ask: 1, letters: [
    { slug: "fa", glyph: "ف", name: "Faa" },
    { slug: "qaf", glyph: "ق", name: "Qaaf" },
  ] },
  { id: "ha-hha", ask: 0, letters: [
    { slug: "ha", glyph: "ه", name: "Haa (soft)" },
    { slug: "hha", glyph: "ح", name: "Haa (deep)" },
  ] },
  { id: "kaf-qaf", ask: 0, letters: [
    { slug: "kaf", glyph: "ك", name: "Kaaf" },
    { slug: "qaf", glyph: "ق", name: "Qaaf" },
  ] },
];

function similarGroupExercise(group: SimilarGroup): QaidaExercise {
  const target = group.letters[group.ask];
  return {
    id: `similar-${group.id}`,
    type: "distinguish-similar" as QaidaExerciseType,
    prompt: `Which of these is ${target.name}?`,
    choices: choices(
      group.letters.map((letter) => ({
        arabic: letter.glyph,
        label: letter.name,
        correct: letter.slug === target.slug,
      })),
    ),
  };
}

const similarLettersLesson: LessonSeed = {
  id: "letters-similar",
  level: "letters",
  title: "Letters told apart by their dots",
  objective: "Tell apart the letters that share one body and differ only in their dots.",
  teaching: "Most Arabic letters share a body with one or two others. The dots are the whole difference: read the body first, then count the dots and notice whether they sit above or below the line.",
  examples: SIMILAR_DOTS.map((group) => teaching(group.letters.map((letter) => letter.glyph).join(" "), group.letters.map((letter) => letter.name).join(", "))),
  stages: ["learn", "recognize", "check", "complete"],
  practice: SIMILAR_DOTS.map(similarGroupExercise),
};

const similarShapesLesson: LessonSeed = {
  id: "letters-similar-shapes",
  level: "letters",
  title: "More letters that are easily mixed up",
  objective: "Tell apart the heavy and light partners, and the pairs a beginner most often reads for one another.",
  teaching: "These pairs differ by a dot, a loop or a stroke. Two of them — ه and ح, ك and ق — are worth looking at side by side because beginners often read one for the other. Look at the shape on the page; how each one is said is something to hear from your teacher and from the reciter.",
  examples: SIMILAR_SHAPES.map((group) => teaching(group.letters.map((letter) => letter.glyph).join(" "), group.letters.map((letter) => letter.name).join(" and "))),
  stages: ["learn", "recognize", "check", "complete"],
  practice: SIMILAR_SHAPES.map(similarGroupExercise),
  boundary: "This is telling shapes apart on the page. Which part of the mouth each letter is made from — its makhraj — has to be heard from a qualified teacher; a written exercise cannot show it and the app does not judge it.",
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
  },
  {
    id: "harakat-combinations",
    level: "harakat",
    title: "Two-letter combinations",
    objective: "Read two vowelled letters together, then a short Quranic word made only of short vowels.",
    teaching: "Read each letter with its own vowel, then join them without a pause: بَتَ reads ba-ta. Once the pair is comfortable the same reading carries a real word — هُوَ, from Surah al-Ikhlas, is two letters with two short vowels and nothing else.",
    examples: [teaching("بَتَ", "ba-ta"), teaching("نِمَ", "ni-ma"), quranWord("هُوَ", "huwa — 'He'; two letters, two short vowels", "112:1")],
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
  },

  {
    id: "tanween-three-marks",
    level: "tanween",
    title: "The three tanween",
    objective: "Recognise fathatayn, kasratayn and dammatayn.",
    teaching: "Tanween is a doubled vowel mark at the end of a word. Fathatayn ً reads 'an', kasratayn ٍ reads 'in', dammatayn ٌ reads 'un'. Fathatayn usually sits on an alif written at the end.",
    examples: [teaching("بًا", "ban — fathatayn, written on the alif"), teaching("بٍ", "bin"), teaching("بٌ", "bun")],
    stages: ["learn", "recognize", "check", "complete"],
    practice: [
      {
        id: "tanween-pick-un",
        type: "choose-vowelled-form",
        prompt: "Which one reads 'bun'?",
        choices: choices([{ arabic: "بٌ", correct: true }, { arabic: "بًا" }, { arabic: "بٍ" }]),
      },
      {
        id: "tanween-name-in",
        type: "identify-symbol",
        prompt: "What is this ending called?",
        subject: teaching("تٍ", "tin"),
        choices: choices([{ label: "Kasratayn", correct: true }, { label: "Fathatayn" }, { label: "Dammatayn" }]),
      },
    ],
  },
  {
    id: "tanween-reading",
    level: "tanween",
    title: "Reading words that end in tanween",
    objective: "Read a Quranic word ending in tanween.",
    teaching: "A word ending in tanween is read with the doubled vowel when you continue past it. Read the word through to its ending rather than stopping short of the mark.",
    examples: [quranWord("أَحَدٌ", "ahadun — 'One', ending in dammatayn", "112:1"), teaching("بَتٍ", "batin — a teaching combination ending in kasratayn")],
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
    boundary: "This lesson is about noticing a long vowel on the page. How long to hold it, and how it sounds, is for a qualified teacher and the reciter\u2019s recording; the app does not measure it.",
  },
  {
    id: "madd-short-vs-long",
    level: "madd",
    title: "Short against long",
    objective: "Tell a short vowel from its long partner at a glance.",
    teaching: "بَ and بَا are the same letter with the same vowel; the alif is what makes it long. Reading them the same way is the most common beginner's mistake, and it is a reading mistake before it is a sound one.",
    examples: [teaching("بَ / بَا", "ba against baa"), quranWord("مَالِكِ", "malik — the alif holds the first vowel long", "1:4")],
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
        prompt: "Read this word from the Quran aloud, holding the long vowel.",
        subject: quranWord("مَالِكِ", "malik — from Surah al-Fatiha", "1:4"),
      },
    ],
    boundary: "The app checks that you can tell the two apart on the page. Whether you held the long one for the right count is for a qualified teacher; the app does not measure it.",
  },
  {
    id: "sukoon-basics",
    level: "sukoon",
    title: "Sukoon",
    objective: "Read a letter carrying sukoon.",
    teaching: "Sukoon is a small circle above the letter. It means the letter has no vowel of its own: it closes the sound that came before it. بَبْ reads bab.",
    examples: [teaching("بْ", "Baa with no vowel of its own"), teaching("بَبْ", "bab"), teaching("نَمْ", "nam")],
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
  },
  {
    id: "sukoon-quran-words",
    level: "sukoon",
    title: "Sukoon in Quranic words",
    objective: "Read short Quranic words that contain a sakin letter.",
    teaching: "Most Quranic words join a vowelled letter into a sakin one. Read the vowelled letter, then close it on the sakin letter without adding a vowel of your own.",
    examples: [quranWord("قُلْ", "qul — 'say'", "112:1"), quranWord("أَنْعَمْتَ", "an'amta — two sakin letters, one after the other", "1:7")],
    stages: ["learn", "read", "check", "complete"],
    practice: [
      {
        id: "sukoon-read-qul",
        type: "read-word",
        prompt: "Read this word from the Quran aloud, closing the Laam without a vowel.",
        subject: quranWord("قُلْ", "qul — from Surah al-Ikhlas", "112:1"),
      },
      {
        id: "sukoon-read-anamta",
        type: "read-word",
        prompt: "Read this one aloud — two sakin letters in the same word.",
        subject: quranWord("أَنْعَمْتَ", "an'amta — from Surah al-Fatiha", "1:7"),
      },
      {
        id: "sukoon-find-sakin",
        type: "identify-symbol",
        prompt: "In this word, which letter carries the sukoon?",
        subject: quranWord("قُلْ", "qul", "112:1"),
        choices: choices([{ arabic: "لْ", label: "Laam", correct: true }, { arabic: "قُ", label: "Qaaf" }, { arabic: "ق", label: "Qaaf, with no mark" }]),
      },
    ],
  },

  {
    id: "shaddah-basics",
    level: "shaddah",
    title: "Shaddah",
    objective: "Read a doubled consonant.",
    teaching: "Shaddah is a small shape like a rounded w above the letter. It doubles that letter: the first of the two carries sukoon and the second carries the vowel, so the letter is held rather than said twice. This is why sukoon comes first — a shaddah is a sakin letter joined to a vowelled one.",
    examples: [teaching("بَّ", "bba — the Baa held, then a fatha"), teaching("رَبَّ", "rabba"), teaching("مَدَّ", "madda")],
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
  },
  {
    id: "shaddah-quran-words",
    level: "shaddah",
    title: "Shaddah in Quranic words",
    objective: "Read Quranic words that carry a shaddah.",
    teaching: "Shaddah is everywhere in the Quran, and it changes the word: read the doubled letter as one held sound rather than two separate letters.",
    examples: [quranWord("رَبِّ", "rabbi — 'Lord of'", "1:2"), quranWord("إِيَّاكَ", "iyyaka — 'You alone'", "1:5"), quranWord("إِنَّ", "inna — a held Noon", "103:2")],
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
        choices: choices([{ arabic: "إِيَّاكَ", label: "iyyaka", correct: true }, { arabic: "قُلْ", label: "qul" }, { arabic: "أَحَدٌ", label: "ahadun" }]),
      },
    ],
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
  },
  {
    id: "lam-reading-practice",
    level: "lam",
    title: "Reading ال in place",
    objective: "Read words with ال without stopping to work out which kind of letter follows.",
    teaching: "With practice the shaddah and the sukoon do the work for you: you read what is printed. Read these aloud in turn and notice how the Laam behaves each time.",
    examples: [quranWord("الرَّحِيمِ", "ar-rahim — sun letter", "1:1"), quranWord("الْعَالَمِينَ", "al-'alamin — moon letter", "1:2"), quranWord("الدِّينِ", "ad-din — sun letter", "1:4")],
    stages: ["read", "check", "complete"],
    practice: [
      {
        id: "lam-read-rahim",
        type: "read-word",
        prompt: "Read this aloud — a sun letter, so the Laam merges into it.",
        subject: quranWord("الرَّحِيمِ", "ar-rahim — from Surah al-Fatiha", "1:1"),
      },
      {
        id: "lam-read-alamin",
        type: "read-word",
        prompt: "Read this aloud — a moon letter, so the Laam is read with its sukoon.",
        subject: quranWord("الْعَالَمِينَ", "al-'alamin — from Surah al-Fatiha", "1:2"),
      },
    ],
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
  },
  {
    id: "hamzah-wasl",
    level: "hamzah",
    title: "Hamzat al-wasl",
    objective: "Recognise the alif that is read when you start on it and passed over when you continue.",
    teaching: "The alif of ال, and of words like اهْدِنَا, is a joining alif. Start a phrase on it and you read it; continue into it from the word before and you read straight past it into the next letter. Many mushafs print it as ٱ, with a small ص-like sign above, to show that it is passed over.",
    examples: [teaching("ٱ", "the joining alif as many mushafs print it"), quranWord("الْحَمْدُ", "al-hamdu — begun on the joining alif", "1:2"), quranWord("اهْدِنَا", "ihdina — begun on the joining alif", "1:6")],
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
  },
  {
    id: "hamzah-orthography",
    level: "hamzah",
    title: "Three written forms to know: ى, ة and the small alif",
    objective: "Read the three written forms a beginner meets constantly in the mushaf.",
    teaching: "Three shapes to know by sight. ى looks like a Yaa without its dots, and at the end of a word it is read as a long 'a' — its name is alif maqsura, the 'shortened alif'. ة is a Haa with two dots, called ta marbuta; read it as 't' when you carry on into the next word, and as 'h' when you stop on it. The small alif is a tiny alif printed above a letter: read a long 'a' there even though no full alif is written.",
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
        id: "qalqalah-in-word",
        type: "identify-symbol",
        prompt: "Which of these words ends in a qalqalah letter, so it echoes when you stop on it?",
        choices: choices([
          { arabic: "الْفَلَقِ", label: "al-falaq", correct: true },
          { arabic: "الرَّحِيمِ", label: "ar-rahim" },
          { arabic: "نَسْتَعِينُ", label: "nasta'in" },
        ]),
        note: "Listen to the reciter's recording for how the echo sounds. This exercise only asks you to spot the letter.",
      },
    ],
    boundary: "Recognising a qalqalah letter is a reading skill. Whether your qalqalah was produced correctly is for a qualified teacher; the app does not judge it from a transcript.",
  },
  {
    id: "tajweed-noon-sakinah",
    level: "tajweed-patterns",
    title: "Noon sakinah and tanween",
    objective: "Recognise a Noon carrying sukoon, and tanween, and know that the letter after them decides which of four ways they are read.",
    teaching: "A Noon carrying sukoon, and tanween, are read in one of four ways depending on the letter that follows: izhar (said clearly), idgham (merged into the next letter), iqlab (turned towards a Meem), ikhfa (hidden between the two). At this level you are learning to spot the Noon and the tanween on the page and to know that four possibilities exist — which one applies, and how each is said, you learn with a teacher and by listening to the reciter.",
    examples: [teaching("نْ", "noon with sukoon"), teaching("ـً ـٍ ـٌ", "the three tanween")],
    stages: ["learn", "recognize", "check", "complete"],
    practice: [
      {
        id: "noon-sakinah-spot",
        type: "identify-symbol",
        prompt: "Which of these carries a Noon with sukoon?",
        choices: choices([
          { arabic: "أَنْعَمْتَ", label: "an'amta", correct: true },
          { arabic: "نَعْبُدُ", label: "na'budu" },
          { arabic: "أَحَدٌ", label: "ahadun" },
        ]),
      },
      {
        id: "noon-tanween-same-rule",
        type: "identify-symbol",
        prompt: "Tanween follows the same four cases as a sakin Noon. Which of these carries tanween?",
        choices: choices([
          { arabic: "أَحَدٌ", label: "ahadun", correct: true },
          { arabic: "قُلْ", label: "qul" },
          { arabic: "رَبِّ", label: "rabbi" },
        ]),
        note: "Which of the four cases applies, and how each one sounds, is learned with a teacher and by listening to the reciter.",
      },
    ],
    boundary: "These are names for what is written. The app does not assess whether your ikhfa, idgham or ghunnah was produced correctly — only a qualified teacher, or a specialist acoustic evaluation, can speak to that.",
  },
  {
    id: "tajweed-meem-ghunnah",
    level: "tajweed-patterns",
    title: "Meem sakinah and ghunnah",
    objective: "Recognise a Meem carrying sukoon, and the mark that tells you a Noon or Meem is held with ghunnah.",
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
        id: "ghunnah-mark",
        type: "identify-symbol",
        prompt: "Which mark on a Noon or a Meem tells you the reader holds a ghunnah there?",
        choices: choices([
          { arabic: "نَّ", label: "Shaddah", correct: true },
          { arabic: "نْ", label: "Sukoon" },
          { arabic: "نٌ", label: "Dammatayn" },
        ]),
      },
    ],
    boundary: "This is recognition on the page. How long a ghunnah is held, and how it should sound, comes from a qualified teacher and from listening to the reciter; the app does not measure it.",
  },

  {
    id: "symbols-stop-marks",
    level: "mushaf-symbols",
    title: "Stop marks",
    objective: "Recognise the small letters printed above the line that tell you where you may stop.",
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
    boundary: "These marks tell you where a stop is allowed or preferred. Where to stop for meaning, and how to begin again afterwards, is guided by a qualified teacher; the app does not check where you stopped.",
  },
  {
    id: "symbols-small-marks",
    level: "mushaf-symbols",
    title: "Small marks in the text",
    objective: "Recognise the small signs printed inside the words themselves.",
    teaching: "Besides the stop marks, the mushaf prints small signs inside the line itself: the small alif you met earlier, for a long 'a' where no alif is written; the wavy madd sign ٓ, which says this long vowel is held longer than usual; and the ayah number in its own medallion at the end of each ayah.",
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
        id: "symbols-madd-sign",
        type: "identify-symbol",
        prompt: "What does the wavy madd sign above a letter tell the reader?",
        subject: teaching("ـٓـ", "the madd sign"),
        choices: choices([
          { label: "Hold this long vowel longer than the usual length", correct: true },
          { label: "Stop here" },
          { label: "Read the letter twice" },
        ]),
        note: "How much longer is settled by the way you were taught to recite, with a qualified teacher. The sign only tells you that it is longer.",
      },
    ],
    boundary: "Recognising a sign is a reading skill. How long a madd is held is settled with a qualified teacher; the app does not measure it.",
  },

  {
    id: "quran-words",
    level: "quran-reading",
    title: "Quranic words",
    objective: "Read single Quranic words that use everything learned so far.",
    teaching: "Almost everything you have met appears in these four words: a sakin letter, a long vowel, a shaddah, a sun letter and a moon letter, and the small alif. Read each one slowly, then again at a steady pace.",
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
  },
  {
    id: "quran-phrases",
    level: "quran-reading",
    title: "Two words together",
    objective: "Read two Quranic words joined into a phrase without stopping between them.",
    teaching: "Single words are the hard part; joining them is the next step. Read each pair straight through, without a pause in the middle, then listen to the reciter read the same phrase and follow along.",
    examples: [quranWord("بِسْمِ اللَّهِ", "bismillah — the first two words of the Quran", "1:1"), quranWord("الْحَمْدُ لِلَّهِ", "al-hamdu lillah", "1:2")],
    stages: ["learn", "listen", "read", "check", "complete"],
    practice: [
      {
        id: "quran-read-phrase-bismillah",
        type: "read-word",
        prompt: "Read these two words as one phrase.",
        subject: quranWord("بِسْمِ اللَّهِ", "bismillah — from Surah al-Fatiha", "1:1"),
      },
      {
        id: "quran-read-phrase-hamd",
        type: "read-word",
        prompt: "Read this phrase — a sun letter, then a held Laam.",
        subject: quranWord("الْحَمْدُ لِلَّهِ", "al-hamdu lillah — from Surah al-Fatiha", "1:2"),
      },
    ],
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
  },
  {
    id: "quran-short-ayat",
    level: "quran-reading",
    title: "Short ayat",
    objective: "Read several short ayat in sequence.",
    teaching: "Read these one after another, shortest first. Each is short enough to hold in one breath, and each uses only the letters, vowels and signs you now know.",
    examples: [],
    stages: ["listen", "read", "complete"],
    practice: [
      {
        id: "quran-open-asr-1",
        type: "read-quran",
        prompt: "Start with the shortest — one word. Listen, then read it aloud.",
        quran: { surah: 103, ayah: 1, label: "Al-'Asr 103:1" },
      },
      {
        id: "quran-open-ikhlas-1",
        type: "read-quran",
        prompt: "Now four words, all of them familiar by this point.",
        quran: { surah: 112, ayah: 1, label: "Al-Ikhlas 112:1" },
      },
      {
        id: "quran-open-fatiha-2",
        type: "read-quran",
        prompt: "And the ayah your phrases came from.",
        quran: { surah: 1, ayah: 2, label: "Al-Fatiha 1:2" },
      },
    ],
  },
  {
    id: "quran-short-surah",
    level: "quran-reading",
    title: "A whole surah, recorded",
    objective: "Finish a complete short surah, recording each ayah for word-recall review.",
    teaching: "The last step of the Qaida is the first step of your recitation practice. You read the opening ayah of al-Ikhlas in the last lesson; these three complete it. Open each one in Study mode, listen to the reciter, then record yourself. The review tells you which words were recognised and where to pick up again — a reading check, not a judgement of how it sounded.",
    examples: [],
    stages: ["listen", "read", "repeat", "complete"],
    practice: [
      {
        id: "quran-open-ikhlas-2",
        type: "read-quran",
        prompt: "You have read the first ayah of al-Ikhlas. Carry on: listen, then record the second.",
        quran: { surah: 112, ayah: 2, label: "Al-Ikhlas 112:2" },
      },
      {
        id: "quran-open-ikhlas-3",
        type: "read-quran",
        prompt: "The third ayah.",
        quran: { surah: 112, ayah: 3, label: "Al-Ikhlas 112:3" },
      },
      {
        id: "quran-open-ikhlas-4",
        type: "read-quran",
        prompt: "And the fourth, which completes the surah.",
        quran: { surah: 112, ayah: 4, label: "Al-Ikhlas 112:4" },
      },
    ],
    boundary: "The recorded review compares transcribed words with the ayah. It does not assess tajwid, makhraj, madd duration or ghunnah.",
  },
];

// ---------------------------------------------------------------------------
// Lessons a Noorani-style Qaida teaches that the course did not have.
//
// Each is inserted into the level it belongs to (see NOORANI_INSERTIONS). Like
// the rest of the course they are AI-drafted and need a qualified teacher's
// review before being presented as finished teaching material.
// ---------------------------------------------------------------------------

const hamzahLamAlifLesson: LessonSeed = {
  id: "letters-hamzah-lam-alif",
  level: "letters",
  title: "Hamzah and Laam-Alif",
  objective: "Recognise Hamzah as a letter of its own, and Laam-Alif as Laam joined to Alif.",
  teaching: "A Noorani Qaida counts 29 letters: the 28 you have met and Hamzah ء, a letter of its own that is often written sitting on another letter (you meet those seats later). Laam-Alif لا is not a new letter. It is Laam joined to Alif, written in one special shape that you will see constantly in the Quran.",
  examples: [teaching("ء", "Hamzah"), teaching("لا", "Laam joined to Alif")],
  stages: ["learn", "recognize", "check", "complete"],
  practice: [
    {
      id: "letters-pick-hamzah",
      type: "distinguish-similar",
      prompt: "Which of these is Hamzah?",
      choices: choices([{ arabic: "ء", label: "Hamzah", correct: true }, { arabic: "ع", label: "Ayn" }, { arabic: "ا", label: "Alif" }]),
    },
    {
      id: "letters-name-hamzah",
      type: "identify-symbol",
      prompt: "Which letter is this?",
      subject: teaching("ء", "Hamzah"),
      choices: choices([{ label: "Hamzah", correct: true }, { label: "Ayn" }, { label: "Alif" }]),
    },
    {
      id: "letters-pick-lam-alif",
      type: "distinguish-similar",
      prompt: "Which of these is Laam-Alif?",
      choices: choices([{ arabic: "لا", label: "Laam-Alif", correct: true }, { arabic: "لم", label: "Laam, Meem" }, { arabic: "كا", label: "Kaaf, Alif" }]),
    },
    {
      id: "letters-build-lam-alif",
      type: "build-combination",
      prompt: "Which two letters make this combination?",
      subject: teaching("لا", "Laam then Alif"),
      choices: choices([{ label: "Laam + Alif", correct: true }, { label: "Alif + Laam" }, { label: "Kaaf + Alif" }]),
    },
  ],
};

const heavyLettersLesson: LessonSeed = {
  id: "letters-heavy",
  level: "letters",
  title: "The seven heavy letters",
  objective: "Tell the seven heavy letters apart from the light ones on the page.",
  teaching: "Seven letters are always read heavy, with a full mouth: خ ص ض غ ط ق ظ, remembered by the phrase khuṣṣa ḍaghṭin qiẓ. Every other letter is light. Many of them have a light partner you have already met — ص and س, ط and ت, ق and ك. This lesson is spotting the heavy ones on the page.",
  examples: [teaching("خ ص ض غ ط ق ظ", "the seven heavy letters"), teaching("ص س", "heavy Saad, light Seen"), teaching("ط ت", "heavy Taa, light Taa")],
  stages: ["learn", "recognize", "check", "complete"],
  practice: ([
    ["sad", "ص", "Saad", "س", "Seen", "ث", "Thaa"],
    ["tta", "ط", "Taa (heavy)", "ت", "Taa (light)", "د", "Daal"],
    ["qaf", "ق", "Qaaf", "ك", "Kaaf", "ف", "Faa"],
    ["zza", "ظ", "Zaa", "ذ", "Dhaal", "ز", "Zaay"],
    ["ghayn", "غ", "Ghayn", "ع", "Ayn", "ه", "Haa"],
    ["dad", "ض", "Daad", "د", "Daal", "ن", "Noon"],
    ["kha", "خ", "Khaa", "ح", "Haa", "ج", "Jeem"],
  ] as const).map(([slug, heavy, heavyName, a, aName, b, bName]) => ({
    id: `letters-heavy-${slug}`,
    type: "distinguish-similar" as const,
    prompt: "Which of these is a heavy letter?",
    choices: choices([{ arabic: heavy, label: heavyName, correct: true }, { arabic: a, label: aName }, { arabic: b, label: bName }]),
  })),
  boundary: "This is spotting the heavy letters on the page. How a heavy letter is made to sound full is heard from a qualified teacher and the reciter; the app does not judge it.",
};

const joinedLettersLesson: LessonSeed = {
  id: "forms-compound-letters",
  level: "forms",
  title: "Joined letters (huroof murakkabat)",
  objective: "Read which letters are joined together, in many pairs, including Laam-Alif.",
  teaching: "This is the Qaida's page of joined letters. Each pair or group below is written joined, the way letters appear inside a word. Find where one letter ends and the next begins, and name each one, right to left. Laam-Alif لا is the pair you will meet most.",
  examples: [teaching("لا", "Laam, Alif"), teaching("كل", "Kaaf, Laam"), teaching("عن", "Ayn, Noon")],
  stages: ["learn", "recognize", "read", "check", "complete"],
  practice: joinedLetterDrills(),
};

/**
 * The disjointed letters that open twenty-nine surahs. Quoted from the mushaf
 * (the waqf signs some carry are left off). They are read by the letters'
 * names, so they belong here, straight after joined letters, as in a Qaida.
 */
const MUQATTAAT: Array<{ arabic: string; reference: string; names: string[]; wrong: string[][] }> = [
  { arabic: "الٓمٓ", reference: "2:1", names: ["Alif", "Laam", "Meem"], wrong: [["Alif", "Laam", "Raa"], ["Alif", "Meem", "Laam"]] },
  { arabic: "كٓهيعٓصٓ", reference: "19:1", names: ["Kaaf", "Haa", "Yaa", "Ayn", "Saad"], wrong: [["Kaaf", "Haa", "Yaa", "Ghayn", "Saad"], ["Qaaf", "Haa", "Yaa", "Ayn", "Saad"]] },
  { arabic: "طه", reference: "20:1", names: ["Taa", "Haa"], wrong: [["Zaa", "Haa"], ["Taa", "Yaa"]] },
  { arabic: "طسٓمٓ", reference: "26:1", names: ["Taa", "Seen", "Meem"], wrong: [["Taa", "Sheen", "Meem"], ["Taa", "Seen", "Noon"]] },
  { arabic: "يسٓ", reference: "36:1", names: ["Yaa", "Seen"], wrong: [["Yaa", "Sheen"], ["Baa", "Seen"]] },
  { arabic: "حمٓ", reference: "40:1", names: ["Haa", "Meem"], wrong: [["Khaa", "Meem"], ["Jeem", "Meem"]] },
];

const muqattaatLesson: LessonSeed = {
  id: "forms-muqattaat",
  level: "forms",
  title: "The disjointed letters (huroof muqatta'at)",
  objective: "Read the disjointed letters at the start of a surah by naming each letter.",
  teaching: "Twenty-nine surahs open with letters that are not a word: الٓمٓ is read by saying the letters' names — Alif, Laam, Meem. You already know every letter and its name, so you can read them now. Some of these names are held long when recited; that is shown by the wavy sign above them.",
  examples: [
    ...MUQATTAAT.slice(0, 3).map((entry) => quranWord(entry.arabic, entry.names.join(" · "), entry.reference)),
    quranWord("صٓ", "Saad", "38:1"),
    quranWord("قٓ", "Qaaf", "50:1"),
    quranWord("نٓ", "Noon", "68:1"),
  ],
  stages: ["learn", "recognize", "read", "check", "complete"],
  practice: MUQATTAAT.map((entry) => ({
    id: `forms-muqattaat-${entry.reference.replace(":", "-")}`,
    type: "build-combination" as const,
    prompt: "These letters are read by their names. Which names do you say?",
    subject: quranWord(entry.arabic, entry.names.join(" · "), entry.reference),
    choices: choices([
      { label: entry.names.join(" · "), correct: true },
      ...entry.wrong.map((names) => ({ label: names.join(" · ") })),
    ]),
  })),
  boundary: "This is reading the letters' names from the page. How long each name is held in recitation is for a qualified teacher and the reciter; the app does not measure it.",
};

const harakatExerciseLesson: LessonSeed = {
  id: "harakat-exercises",
  level: "harakat",
  title: "Exercise page: mixed short vowels",
  objective: "Read three-letter combinations where each letter carries its own short vowel.",
  teaching: "This is the Qaida's exercise page for the short vowels. Every letter now carries a fatha, kasra or damma, and they are mixed. Read each letter with its own vowel, then join them without a pause. Go slowly: the aim is to read each mark, not to guess the word.",
  examples: [teaching("بَتَثَ", "ba-ta-tha"), teaching("جِحِخِ", "ji-ḥi-khi"), teaching("زَسِشُ", "za-si-shu")],
  stages: ["learn", "read", "check", "complete"],
  practice: harakatExerciseDrills(),
};

const tanweenExerciseLesson: LessonSeed = {
  id: "tanween-exercises",
  level: "tanween",
  title: "Exercise page: tanween",
  objective: "Read two-letter combinations that end in tanween.",
  teaching: "The tanween exercise page. The first letter carries a short vowel; the last carries tanween. Read the first, then finish on the doubled ending: بَتٌ reads ba-tun.",
  examples: [teaching("بَتٌ", "ba-tun"), teaching("ثِجٍ", "thi-jin"), teaching("حُخًا", "ḥu-khan")],
  stages: ["learn", "read", "check", "complete"],
  practice: tanweenExerciseDrills(),
};

const standingHarakatLesson: LessonSeed = {
  id: "madd-standing-harakat",
  level: "madd",
  title: "Standing harakat",
  objective: "Recognise a long vowel written as a small standing mark instead of a full letter.",
  teaching: "Sometimes the long vowel is written as a small mark instead of a full alif, ya or waw. The standing fatha ـٰ is a small upright alif above the letter and reads a long 'aa'. The standing kasra ـٖ below the letter reads a long 'ii', and the inverted damma ـٗ above it reads a long 'uu'. South Asian mushafs print all three; the mushaf this app shows prints the standing fatha the same way, and writes the other two as a small ya and a small waw.",
  examples: [teaching("بٰ", "baa — standing fatha"), teaching("بٖ", "bii — standing kasra"), teaching("بٗ", "buu — inverted damma"), quranWord("ذَٰلِكَ", "dhaalika — a standing fatha on the Dhaal", "2:2")],
  stages: ["learn", "recognize", "read", "check", "complete"],
  practice: [
    {
      id: "standing-fatha-name",
      type: "identify-symbol",
      prompt: "What is the mark above this letter called?",
      subject: teaching("بٰ", "baa"),
      choices: choices([{ label: "Standing fatha", correct: true }, { label: "Fatha" }, { label: "Sukoon" }]),
    },
    {
      id: "standing-fatha-read",
      type: "build-combination",
      prompt: "How does this read?",
      subject: teaching("تٰ", "taa"),
      choices: choices([{ label: "taa", correct: true }, { label: "ta" }, { label: "tii" }]),
    },
    {
      id: "standing-kasra-read",
      type: "build-combination",
      prompt: "How does this read?",
      subject: teaching("بٖ", "bii"),
      choices: choices([{ label: "bii", correct: true }, { label: "bi" }, { label: "buu" }]),
    },
    {
      id: "inverted-damma-read",
      type: "build-combination",
      prompt: "How does this read?",
      subject: teaching("هٗ", "huu"),
      choices: choices([{ label: "huu", correct: true }, { label: "hu" }, { label: "haa" }]),
    },
    {
      id: "standing-read-dhalika",
      type: "read-word",
      prompt: "Read this Quranic word aloud, then continue.",
      subject: quranWord("ذَٰلِكَ", "dhaalika — from Surah al-Baqarah", "2:2"),
    },
  ],
  boundary: "This is recognising a long vowel on the page. How long to hold it is for a qualified teacher and the reciter's recording; the app does not measure it.",
};

const maddExerciseLesson: LessonSeed = {
  id: "madd-exercises",
  level: "madd",
  title: "Exercise page: long vowels",
  objective: "Read combinations of two long vowels, holding each one.",
  teaching: "The long-vowel exercise page. Each syllable has its own madd letter: read the vowel and hold it into the letter that lengthens it, then move to the next. بَاتُو reads baa-tuu.",
  examples: [teaching("بَاتُو", "baa-tuu"), teaching("ثِيجَا", "thii-jaa")],
  stages: ["learn", "read", "check", "complete"],
  practice: maddExerciseDrills(),
  boundary: "The app checks that you can read which vowels are long. How long you hold each one is for a qualified teacher; the app does not measure it.",
};

const leenLesson: LessonSeed = {
  id: "sukoon-leen",
  level: "sukoon",
  title: "The soft letters (huroof leen)",
  objective: "Read a waw or ya carrying sukoon after a fatha, and tell it apart from a long vowel.",
  teaching: "When waw or ya carries sukoon and the letter before it carries a fatha, it is a soft letter (leen): بَوْ reads baw, بَيْ reads bay — a gliding sound, not a long vowel. Compare بُو (buu), where waw follows a damma and makes the vowel long.",
  examples: [teaching("بَوْ", "baw"), teaching("بَيْ", "bay"), quranWord("قُرَيْشٍ", "quraysh — a soft ya", "106:1")],
  stages: ["learn", "recognize", "read", "check", "complete"],
  practice: [
    ...leenDrills(["ta", "jeem", "seen", "qaf"]),
    {
      id: "leen-read-quraysh",
      type: "read-word",
      prompt: "Read this Quranic word aloud, then continue.",
      subject: quranWord("قُرَيْشٍ", "quraysh — from Surah Quraysh", "106:1"),
    },
  ],
};

const shaddahCombinationsLesson: LessonSeed = {
  id: "shaddah-combinations",
  level: "shaddah",
  title: "Shaddah with sukoon, and ghunnah",
  objective: "Read a shaddah followed by a sakin letter, and Noon and Meem carrying a shaddah.",
  teaching: "Two last patterns before the Quranic words. A shaddah can be followed by a sakin letter: اَبَّتْ reads abbat. And a Noon or Meem carrying a shaddah — اَنَّ, اَمَّ — is held with ghunnah, a hum through the nose, which you will meet again in the tajweed lessons.",
  examples: [teaching("اَبَّتْ", "abbat"), teaching("اَنَّ اِنِّ اُنُّ", "anna inni unnu"), teaching("اَمَّ اِمِّ اُمُّ", "amma immi ummu")],
  stages: ["learn", "read", "check", "complete"],
  practice: shaddahCombinationDrills(),
  boundary: "This is reading the marks on the page. How long a ghunnah is held, and how it should sound, comes from a qualified teacher; the app does not measure it.",
};

/**
 * How to stop on the last word — the closing lesson of a Noorani Qaida.
 * Every subject is a quoted Quranic word or a teaching combination; the options
 * show how its ending is read when stopping, which is a reading of the word,
 * not a different word.
 */
const STOPPING: Array<{ id: string; subject: QaidaArabicText; answer: string; wrong: string[] }> = [
  { id: "stop-dammatayn", subject: quranWord("أَحَدٌ", "ahadun — from Surah al-Ikhlas", "112:1"), answer: "أَحَدْ", wrong: ["أَحَدٌ", "أَحَدَا"] },
  { id: "stop-kasra", subject: quranWord("الْفَلَقِ", "al-falaqi — from Surah al-Falaq", "113:1"), answer: "الْفَلَقْ", wrong: ["الْفَلَقِ", "الْفَلَقِي"] },
  { id: "stop-long-vowel", subject: quranWord("الْعَالَمِينَ", "al-'alamina — from Surah al-Fatiha", "1:2"), answer: "الْعَالَمِينْ", wrong: ["الْعَالَمِينَ", "الْعَالَمِي"] },
  { id: "stop-fathatayn", subject: teaching("بَتًا", "batan — a teaching combination"), answer: "بَتَا", wrong: ["بَتْ", "بَتًا"] },
  { id: "stop-ta-marbuta", subject: quranWord("هُمَزَةٍ", "humazatin — from Surah al-Humazah", "104:1"), answer: "هُمَزَهْ", wrong: ["هُمَزَةٍ", "هُمَزَتْ"] },
];

const stoppingLesson: LessonSeed = {
  id: "symbols-stopping",
  level: "mushaf-symbols",
  title: "Stopping on a word (waqf)",
  objective: "Read how the end of a word changes when you stop on it.",
  teaching: "When you stop on a word, its ending changes. A last fatha, kasra or damma becomes a sukoon: الْفَلَقِ is read al-falaq. Kasratayn and dammatayn also become a sukoon: أَحَدٌ is read ahad. Fathatayn becomes a long 'aa': بَتًا is read bataa. A ta marbuta ة becomes a sakin Haa: هُمَزَةٍ is read humazah. A long vowel before the end stays long.",
  examples: [quranWord("أَحَدٌ", "ahadun — stopping: ahad", "112:1"), quranWord("الْفَلَقِ", "al-falaqi — stopping: al-falaq", "113:1"), teaching("بَتًا", "batan — stopping: bataa")],
  stages: ["learn", "recognize", "check", "complete"],
  practice: STOPPING.map((entry) => ({
    id: `symbols-${entry.id}`,
    type: "identify-symbol" as const,
    prompt: "You stop on this word. How is its ending read?",
    subject: entry.subject,
    choices: choices([{ arabic: entry.answer, correct: true }, ...entry.wrong.map((arabic) => ({ arabic }))]),
  })),
  boundary: "These are the reading rules for a word's ending when you stop. Where to stop, and the finer rules of stopping, are learned with a qualified teacher; the app does not check where or how you stopped.",
};

/**
 * Where each new lesson goes: immediately after the named existing lesson.
 * Existing lesson ids are never changed or removed, so saved progress (in the
 * browser and in the database) keeps resolving.
 */
const NOORANI_INSERTIONS: Array<{ after: string; lessons: LessonSeed[] }> = [
  { after: "letters-similar-shapes", lessons: [heavyLettersLesson, hamzahLamAlifLesson] },
  { after: "forms-joining-practice", lessons: [joinedLettersLesson, muqattaatLesson] },
  { after: "harakat-combinations", lessons: [harakatExerciseLesson] },
  { after: "tanween-reading", lessons: [tanweenExerciseLesson] },
  { after: "madd-long-vowels", lessons: [standingHarakatLesson] },
  { after: "madd-short-vs-long", lessons: [maddExerciseLesson] },
  { after: "sukoon-basics", lessons: [leenLesson] },
  { after: "shaddah-basics", lessons: [shaddahCombinationsLesson] },
  { after: "symbols-small-marks", lessons: [stoppingLesson] },
];

/**
 * Whole-alphabet drill rows added to the existing lessons that teach each mark,
 * so every mark is practised on every letter rather than on two or three.
 */
const DRILLS: Record<string, QaidaExercise[]> = {
  "harakat-fatha": shortVowelDrills("fatha", ["jeem", "seen", "ayn", "qaf", "lam", "ya"]),
  "harakat-kasra": shortVowelDrills("kasra", ["dal", "sheen", "ghayn", "kaf", "meem", "waw"]),
  "harakat-damma": shortVowelDrills("damma", ["hha", "ra", "sad", "fa", "noon", "ha"]),
  "tanween-three-marks": tanweenDrills(["ta", "jeem", "seen", "ayn", "fa", "meem"]),
  "madd-long-vowels": maddDrills(["ta", "jeem", "dal", "seen", "qaf", "noon"]),
  "sukoon-basics": sukoonDrills(["dal", "seen", "ayn", "lam"]),
  "shaddah-basics": shaddahDrills(["ra", "seen", "qaf", "noon"]),
};

function withNooraniLessons(seeds: LessonSeed[]): LessonSeed[] {
  const out: LessonSeed[] = [];
  for (const seed of seeds) {
    const drills = DRILLS[seed.id];
    out.push(drills ? { ...seed, practice: [...seed.practice, ...drills] } : seed);
    const insertion = NOORANI_INSERTIONS.find((entry) => entry.after === seed.id);
    if (insertion) out.push(...insertion.lessons);
  }
  return out;
}

const LESSON_SEEDS: LessonSeed[] = withNooraniLessons([...letterLessons, similarLettersLesson, similarShapesLesson, ...laterLessons]);

/**
 * Every lesson, in course order. `next` is filled in from that order so a lesson
 * always carries the one that follows without the two being able to drift.
 */
export const QAIDA_LESSONS: QaidaLesson[] = LESSON_SEEDS.map((seed, index) => ({
  ...seed,
  examples: seed.examples ?? [],
  // Lesson data is written answer-first for readability. Placing the answer here
  // — once, for every item — is what stops the course being passable by tapping
  // the top option forty-two times.
  practice: seed.practice.map((item) => (item.choices ? { ...item, choices: placeChoices(item.id, item.choices) } : item)),
  prerequisites: index === 0 ? [] : [LESSON_SEEDS[index - 1].id],
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

/**
 * The alphabet index of the first letter a Level-1 lesson shows, or null
 * when the lesson is not a letters lesson.
 *
 * A letters lesson teaches a group of letters, so the reference focuses the
 * first letter the lesson shows — the group's first letter, or the first
 * letter of the first contrast group in a revision lesson — and the learner
 * can tap any other tile from there. The index is into QAIDA_LETTERS, which
 * is the alphabet in the same order the Learn view renders it.
 */
export function firstLetterIndexForLesson(lessonId: string): number | null {
  const lesson = getQaidaLesson(lessonId);
  if (!lesson || lesson.level !== "letters") return null;
  // A group lesson shows one letter per example; a revision lesson shows a
  // contrast group per example, glyphs joined with spaces. Either way the
  // first glyph of the first example is the letter the lesson starts with.
  const firstGlyph = lesson.examples[0]?.arabic.split(" ")[0];
  if (!firstGlyph) return null;
  const index = QAIDA_LETTERS.findIndex((letter) => letter.glyph === firstGlyph);
  return index === -1 ? null : index;
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

/**
 * Where finishing a lesson leads: the first incomplete lesson after the given
 * one in course order, falling back to the first incomplete lesson overall,
 * or null when the course is fully complete. The finish-button label and the
 * completion advance share this one function so they can never disagree.
 */
export function advanceTargetAfter(
  lessonId: string,
  completedLessons: readonly string[],
): QaidaLesson | null {
  return firstIncompleteAfter(lessonId, completedLessons) ?? nextIncompleteLesson(completedLessons);
}

/** First not-yet-completed lesson after the given one in course order, if any. */
function firstIncompleteAfter(lessonId: string, completedLessons: readonly string[]): QaidaLesson | null {
  let candidate = followingLesson(lessonId);
  while (candidate && completedLessons.includes(candidate.id)) {
    candidate = followingLesson(candidate.id);
  }
  return candidate;
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
