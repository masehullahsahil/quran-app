/**
 * Drill generators for the Qaida course.
 *
 * A Noorani-style Qaida teaches each mark by running it across the whole
 * alphabet, row after row, until reading it is automatic: اَ بَ تَ ثَ …, then
 * اِ بِ تِ ثِ …, then the same with tanween, madd, sukoon and shaddah. Writing
 * those rows by hand would be hundreds of lines that can drift out of step, so
 * they are generated here from the alphabet and a handful of rules.
 *
 * Everything generated is `source: "teaching"`: rows built to practise a shape,
 * never presented as Quran. The prompts are a small fixed set so each language
 * pack translates each one once (see promptsFromPhrasebook in qaidaText.ts);
 * the specific letters live in the subject and the options, which are Arabic or
 * transliteration and need no translation.
 *
 * Like the rest of the course this is AI-drafted reading practice. It makes no
 * claim about how anything sounds; see docs/qaida-curriculum.md.
 */

import { ARABIC_LETTERS, type ArabicLetter } from "./arabicLetters";
import { choices, teaching, type QaidaExercise } from "./qaidaExercises";

/** Prompts used by generated drills. Each is translated once per language pack. */
export const DRILL_PROMPTS = {
  readRow: "Read this row aloud, letter by letter.",
  howDoesThisRead: "How does this read?",
  howDoesCombinationRead: "How does this combination read?",
  readAloud: "Read this aloud, then continue.",
  whichTwoLetters: "Which two letters make this combination?",
  sayLetterNames: "Say the name of each letter in this group, right to left.",
} as const;

export type Vowel = "fatha" | "kasra" | "damma";

const VOWELS: readonly Vowel[] = ["fatha", "kasra", "damma"];

const SHORT_MARK: Record<Vowel, string> = { fatha: "َ", kasra: "ِ", damma: "ُ" };
const TANWEEN_MARK: Record<Vowel, string> = { fatha: "ً", kasra: "ٍ", damma: "ٌ" };
const VOWEL_SOUND: Record<Vowel, string> = { fatha: "a", kasra: "i", damma: "u" };
const LONG_SOUND: Record<Vowel, string> = { fatha: "aa", kasra: "ii", damma: "uu" };
/** The madd letter that lengthens each vowel. */
const MADD_LETTER: Record<Vowel, string> = { fatha: "ا", kasra: "ي", damma: "و" };
const SUKOON = "ْ";
const SHADDAH = "ّ";
const ALIF = "ا";

/** Canonical (NFC) order, so generated text compares equal to hand-written text. */
const nfc = (text: string) => text.normalize("NFC");

/** Transliteration of a letter's consonant. Alif carrying a vowel has none of its own. */
function consonant(letter: ArabicLetter): string {
  return letter.slug === "alif" ? "" : letter.sound;
}

/** The alphabet without alif, which cannot carry tanween, madd, sukoon or shaddah here. */
const CONSONANTS = ARABIC_LETTERS.filter((letter) => letter.slug !== "alif");

function letterBySlug(slug: string): ArabicLetter {
  const letter = ARABIC_LETTERS.find((entry) => entry.slug === slug);
  if (!letter) throw new Error(`Unknown letter slug: ${slug}`);
  return letter;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}

type Syllable = { arabic: string; sound: string };

function rowExercise(id: string, syllables: Syllable[], prompt: string = DRILL_PROMPTS.readRow): QaidaExercise {
  return {
    id,
    type: "read-word",
    prompt,
    subject: teaching(nfc(syllables.map((s) => s.arabic).join(" ")), syllables.map((s) => s.sound).join(" · ")),
  };
}

/** A "how does this read?" item whose options differ only in the vowel. */
function readingChoice(id: string, subject: Syllable, options: string[], prompt: string = DRILL_PROMPTS.howDoesThisRead): QaidaExercise {
  return {
    id,
    type: "build-combination",
    prompt,
    subject: teaching(nfc(subject.arabic), subject.sound),
    choices: choices(options.map((label) => ({ label, correct: label === subject.sound }))),
  };
}

// ---------------------------------------------------------------------------
// Short vowels: every letter, every vowel.
// ---------------------------------------------------------------------------

const short = (letter: ArabicLetter, vowel: Vowel): Syllable => ({
  arabic: `${letter.letter}${SHORT_MARK[vowel]}`,
  sound: `${consonant(letter)}${VOWEL_SOUND[vowel]}`,
});

/**
 * The whole alphabet carrying one vowel, in rows of seven (اَ بَ تَ ثَ جَ حَ خَ …),
 * followed by "how does this read?" checks on letters spread across the alphabet.
 */
export function shortVowelDrills(vowel: Vowel, checkSlugs: readonly string[]): QaidaExercise[] {
  const rows = chunk(ARABIC_LETTERS, 7).map((letters, index) =>
    rowExercise(`drill-${vowel}-row-${index + 1}`, letters.map((letter) => short(letter, vowel))),
  );
  const checks = checkSlugs.map((slug) => {
    const letter = letterBySlug(slug);
    return readingChoice(
      `drill-${vowel}-read-${slug}`,
      short(letter, vowel),
      VOWELS.map((v) => short(letter, v).sound),
    );
  });
  return [...rows, ...checks];
}

/**
 * Three-letter teaching combinations with mixed vowels — the "exercise page"
 * after the harakat. Built from consecutive letters of the alphabet so a row
 * reads as a drill, not as a word.
 */
const HARAKAT_TRIPLES: Array<[string, string, string]> = [
  ["ba", "ta", "tha"], ["jeem", "hha", "kha"], ["dal", "dhal", "ra"], ["zay", "seen", "sheen"],
  ["sad", "dad", "tta"], ["zza", "ayn", "ghayn"], ["fa", "qaf", "kaf"], ["lam", "meem", "noon"], ["ha", "waw", "ya"],
];
const HARAKAT_PATTERNS: Vowel[][] = [
  ["fatha", "fatha", "fatha"], ["kasra", "kasra", "kasra"], ["damma", "damma", "damma"],
  ["fatha", "kasra", "damma"], ["damma", "fatha", "kasra"], ["kasra", "damma", "fatha"],
  ["fatha", "damma", "kasra"], ["damma", "kasra", "fatha"], ["kasra", "fatha", "damma"],
];

function combination(slugs: readonly string[], vowels: readonly Vowel[]): Syllable {
  const letters = slugs.map(letterBySlug);
  return {
    arabic: letters.map((letter, i) => `${letter.letter}${SHORT_MARK[vowels[i]]}`).join(""),
    sound: letters.map((letter, i) => `${consonant(letter)}${VOWEL_SOUND[vowels[i]]}`).join("-"),
  };
}

/** Rotate a vowel pattern by one place, for a distractor that keeps the same vowels. */
const rotate = (vowels: readonly Vowel[], by: number) => vowels.map((_, i) => vowels[(i + by) % vowels.length]);

export function harakatExerciseDrills(): QaidaExercise[] {
  const reads = HARAKAT_TRIPLES.map((slugs, i) =>
    rowExercise(`drill-harakat-combo-${i + 1}`, [combination(slugs, HARAKAT_PATTERNS[i])], DRILL_PROMPTS.readAloud),
  );
  // Mixed-vowel triples make the useful checks: the options are the same three
  // vowels in other orders, so only reading each mark gets it right.
  const checks = [3, 4, 5, 6, 7].map((i) => {
    const slugs = HARAKAT_TRIPLES[i];
    const pattern = HARAKAT_PATTERNS[i];
    const answer = combination(slugs, pattern);
    return readingChoice(
      `drill-harakat-combo-read-${i + 1}`,
      answer,
      [answer.sound, combination(slugs, rotate(pattern, 1)).sound, combination(slugs, rotate(pattern, 2)).sound],
      DRILL_PROMPTS.howDoesCombinationRead,
    );
  });
  return [...reads, ...checks];
}

// ---------------------------------------------------------------------------
// Tanween.
// ---------------------------------------------------------------------------

const tanween = (letter: ArabicLetter, vowel: Vowel): Syllable => ({
  // Fathatayn is written with an alif after it.
  arabic: `${letter.letter}${TANWEEN_MARK[vowel]}${vowel === "fatha" ? ALIF : ""}`,
  sound: `${consonant(letter)}${VOWEL_SOUND[vowel]}n`,
});

/**
 * Each tanween across the whole alphabet, in rows of seven, then checks.
 *
 * Every tanween runs over every chunk of the alphabet. (An earlier version
 * picked two chunks per tanween with a modulo, so the first and third tanween
 * drilled the same letters and each covered only half the alphabet.)
 */
export function tanweenDrills(checkSlugs: readonly string[]): QaidaExercise[] {
  const chunks = chunk(CONSONANTS, 7);
  const rows: QaidaExercise[] = [];
  for (const vowel of ["damma", "kasra", "fatha"] as Vowel[]) {
    chunks.forEach((letters, index) => {
      rows.push(rowExercise(`drill-tanween-${vowel}-row-${index + 1}`, letters.map((letter) => tanween(letter, vowel))));
    });
  }
  const checks = checkSlugs.map((slug, i) => {
    const letter = letterBySlug(slug);
    const vowel = VOWELS[i % 3];
    return readingChoice(`drill-tanween-read-${slug}`, tanween(letter, vowel), VOWELS.map((v) => tanween(letter, v).sound));
  });
  return [...rows, ...checks];
}

/** Two-letter teaching combinations ending in tanween. */
const TANWEEN_PAIRS: Array<[string, string]> = [
  ["ba", "ta"], ["tha", "jeem"], ["hha", "kha"], ["dal", "ra"], ["seen", "sheen"], ["sad", "dad"], ["ayn", "ghayn"], ["fa", "qaf"],
];

export function tanweenExerciseDrills(): QaidaExercise[] {
  const build = ([a, b]: [string, string], first: Vowel, last: Vowel): Syllable => {
    const one = letterBySlug(a);
    const two = letterBySlug(b);
    const end = tanween(two, last);
    return { arabic: `${one.letter}${SHORT_MARK[first]}${end.arabic}`, sound: `${consonant(one)}${VOWEL_SOUND[first]}-${end.sound}` };
  };
  const reads = TANWEEN_PAIRS.map((pair, i) =>
    rowExercise(`drill-tanween-combo-${i + 1}`, [build(pair, VOWELS[i % 3], VOWELS[(i + 1) % 3])], DRILL_PROMPTS.readAloud),
  );
  const checks = TANWEEN_PAIRS.slice(0, 4).map((pair, i) => {
    const first = VOWELS[(i + 2) % 3];
    const answer = build(pair, first, VOWELS[i % 3]);
    return readingChoice(
      `drill-tanween-combo-read-${i + 1}`,
      answer,
      VOWELS.map((v) => build(pair, first, v).sound),
      DRILL_PROMPTS.howDoesCombinationRead,
    );
  });
  return [...reads, ...checks];
}

// ---------------------------------------------------------------------------
// Long vowels (madd).
// ---------------------------------------------------------------------------

/**
 * A long vowel in the Indo-Pak script: alif after a fatha is bare (بَا), while
 * waw after a damma and ya after a kasra carry a sukoon (بُوْ, بِيْ), as the
 * Indo-Pak mushaf and a Noorani Qaida print them (see shared/qaidaScript.ts).
 */
const long = (letter: ArabicLetter, vowel: Vowel): Syllable => ({
  arabic: `${letter.letter}${SHORT_MARK[vowel]}${MADD_LETTER[vowel]}${vowel === "fatha" ? "" : SUKOON}`,
  sound: `${consonant(letter)}${LONG_SOUND[vowel]}`,
});

/** Each long vowel across the whole alphabet, in rows of seven, then checks. */
export function maddDrills(checkSlugs: readonly string[]): QaidaExercise[] {
  const chunks = chunk(CONSONANTS, 7);
  const rows: QaidaExercise[] = [];
  for (const vowel of VOWELS) {
    chunks.forEach((letters, index) => {
      rows.push(rowExercise(`drill-madd-${vowel}-row-${index + 1}`, letters.map((letter) => long(letter, vowel))));
    });
  }
  const checks = checkSlugs.map((slug, i) => {
    const letter = letterBySlug(slug);
    return readingChoice(`drill-madd-read-${slug}`, long(letter, VOWELS[i % 3]), VOWELS.map((v) => long(letter, v).sound));
  });
  return [...rows, ...checks];
}

/** Two-syllable teaching combinations, each syllable long. */
const MADD_PAIRS: Array<[string, string]> = [
  ["ba", "ta"], ["tha", "jeem"], ["hha", "kha"], ["dal", "dhal"], ["zay", "seen"], ["sad", "dad"], ["fa", "qaf"], ["kaf", "lam"],
];

export function maddExerciseDrills(): QaidaExercise[] {
  const build = ([a, b]: [string, string], first: Vowel, second: Vowel): Syllable => {
    const one = long(letterBySlug(a), first);
    const two = long(letterBySlug(b), second);
    return { arabic: `${one.arabic}${two.arabic}`, sound: `${one.sound}-${two.sound}` };
  };
  const reads = MADD_PAIRS.map((pair, i) =>
    rowExercise(`drill-madd-combo-${i + 1}`, [build(pair, VOWELS[i % 3], VOWELS[(i + 1) % 3])], DRILL_PROMPTS.readAloud),
  );
  const checks = MADD_PAIRS.slice(0, 4).map((pair, i) => {
    const first = VOWELS[(i + 1) % 3];
    const answer = build(pair, first, VOWELS[i % 3]);
    return readingChoice(
      `drill-madd-combo-read-${i + 1}`,
      answer,
      VOWELS.map((v) => build(pair, first, v).sound),
      DRILL_PROMPTS.howDoesCombinationRead,
    );
  });
  return [...reads, ...checks];
}

// ---------------------------------------------------------------------------
// Sukoon: اَبْ اِبْ اُبْ — alif carrying each vowel, closed on a sakin letter.
// ---------------------------------------------------------------------------

/** Waw and ya after a fatha are the leen letters, taught in their own lesson. */
const SUKOON_LETTERS = CONSONANTS.filter((letter) => letter.slug !== "waw" && letter.slug !== "ya");

const closed = (letter: ArabicLetter, vowel: Vowel): Syllable => ({
  arabic: `${ALIF}${SHORT_MARK[vowel]}${letter.letter}${SUKOON}`,
  sound: `${VOWEL_SOUND[vowel]}${consonant(letter)}`,
});

export function sukoonDrills(checkSlugs: readonly string[]): QaidaExercise[] {
  const rows = chunk(SUKOON_LETTERS, 3).map((letters, index) =>
    rowExercise(`drill-sukoon-row-${index + 1}`, letters.flatMap((letter) => VOWELS.map((v) => closed(letter, v)))),
  );
  const checks = checkSlugs.map((slug, i) => {
    const letter = letterBySlug(slug);
    return readingChoice(`drill-sukoon-read-${slug}`, closed(letter, VOWELS[i % 3]), VOWELS.map((v) => closed(letter, v).sound));
  });
  return [...rows, ...checks];
}

// ---------------------------------------------------------------------------
// Leen: a fatha followed by a sakin waw or ya.
// ---------------------------------------------------------------------------

const leen = (letter: ArabicLetter, which: "waw" | "ya"): Syllable => ({
  arabic: `${letter.letter}${SHORT_MARK.fatha}${which === "waw" ? "و" : "ي"}${SUKOON}`,
  sound: `${consonant(letter)}${which === "waw" ? "aw" : "ay"}`,
});

export function leenDrills(checkSlugs: readonly string[]): QaidaExercise[] {
  const letters = CONSONANTS.filter((letter) => letter.slug !== "waw" && letter.slug !== "ya").slice(0, 9);
  const rows = chunk(letters, 3).map((group, index) =>
    rowExercise(`drill-leen-row-${index + 1}`, group.flatMap((letter) => [leen(letter, "waw"), leen(letter, "ya")])),
  );
  const checks = checkSlugs.map((slug, i) => {
    const letter = letterBySlug(slug);
    const which = i % 2 === 0 ? "waw" : "ya";
    const answer = leen(letter, which);
    // The long vowel is the confusion worth testing: بَوْ against بُوْ.
    const longSound = `${consonant(letter)}${which === "waw" ? LONG_SOUND.damma : LONG_SOUND.kasra}`;
    return readingChoice(`drill-leen-read-${slug}`, answer, [answer.sound, leen(letter, which === "waw" ? "ya" : "waw").sound, longSound]);
  });
  return [...rows, ...checks];
}

// ---------------------------------------------------------------------------
// Shaddah: اَبَّ اِبِّ اُبُّ.
// ---------------------------------------------------------------------------

const doubled = (letter: ArabicLetter, vowel: Vowel): Syllable => ({
  arabic: `${ALIF}${SHORT_MARK[vowel]}${letter.letter}${SHADDAH}${SHORT_MARK[vowel]}`,
  sound: `${VOWEL_SOUND[vowel]}${consonant(letter)}${consonant(letter)}${VOWEL_SOUND[vowel]}`,
});

export function shaddahDrills(checkSlugs: readonly string[]): QaidaExercise[] {
  const rows = chunk(CONSONANTS, 3).map((letters, index) =>
    rowExercise(`drill-shaddah-row-${index + 1}`, letters.flatMap((letter) => VOWELS.map((v) => doubled(letter, v)))),
  );
  const checks = checkSlugs.map((slug, i) => {
    const letter = letterBySlug(slug);
    return readingChoice(`drill-shaddah-read-${slug}`, doubled(letter, VOWELS[i % 3]), VOWELS.map((v) => doubled(letter, v).sound));
  });
  return [...rows, ...checks];
}

/**
 * Shaddah followed by a sakin letter (اَبَّتْ), and Noon and Meem carrying a
 * shaddah — the ghunnah rows a Qaida ends its shaddah section with.
 */
const SHADDAH_SUKOON_TRIPLES: Array<[string, string]> = [["ba", "ta"], ["jeem", "hha"], ["dal", "dhal"], ["seen", "sheen"], ["fa", "qaf"], ["kaf", "lam"]];

const doubledThenClosed = ([a, b]: [string, string], vowel: Vowel): Syllable => {
  const one = letterBySlug(a);
  const two = letterBySlug(b);
  return {
    arabic: `${ALIF}${SHORT_MARK[vowel]}${one.letter}${SHADDAH}${SHORT_MARK.fatha}${two.letter}${SUKOON}`,
    sound: `${VOWEL_SOUND[vowel]}${consonant(one)}${consonant(one)}a${consonant(two)}`,
  };
};

export function shaddahCombinationDrills(): QaidaExercise[] {
  const rows = chunk(SHADDAH_SUKOON_TRIPLES, 2).map((pairs, index) =>
    rowExercise(`drill-shaddah-sukoon-row-${index + 1}`, pairs.flatMap((pair) => VOWELS.map((v) => doubledThenClosed(pair, v)))),
  );
  const ghunnah = (["noon", "meem"] as const).map((slug, index) =>
    rowExercise(`drill-ghunnah-row-${index + 1}`, VOWELS.map((v) => doubled(letterBySlug(slug), v))),
  );
  const checks = SHADDAH_SUKOON_TRIPLES.slice(0, 4).map((pair, i) => {
    const answer = doubledThenClosed(pair, VOWELS[i % 3]);
    return readingChoice(
      `drill-shaddah-sukoon-read-${i + 1}`,
      answer,
      VOWELS.map((v) => doubledThenClosed(pair, v).sound),
      DRILL_PROMPTS.howDoesCombinationRead,
    );
  });
  return [...rows, ...ghunnah, ...checks];
}

// ---------------------------------------------------------------------------
// Joined letters (huroof murakkabat).
// ---------------------------------------------------------------------------

/**
 * Pairs chosen so no option can be read as two different letters: ت/ط are
 * both "Taa" and ح/ه both "Haa", so those never appear in a pair or as a
 * distractor here.
 */
const JOINED_PAIRS: Array<[string, string]> = [
  ["lam", "alif"], ["kaf", "lam"], ["fa", "ya"], ["ayn", "noon"], ["ghayn", "ba"], ["sad", "lam"],
  ["qaf", "meem"], ["jeem", "ya"], ["tha", "ra"], ["dad", "fa"], ["seen", "kaf"], ["sheen", "meem"],
];
const AMBIGUOUS_NAMES = new Set(["ta", "tta", "hha", "ha"]);

function joinedDistractor(first: ArabicLetter, second: ArabicLetter): ArabicLetter {
  const start = ARABIC_LETTERS.indexOf(second);
  for (let step = 1; step < ARABIC_LETTERS.length; step += 1) {
    const candidate = ARABIC_LETTERS[(start + step) % ARABIC_LETTERS.length];
    if (candidate !== first && candidate !== second && !AMBIGUOUS_NAMES.has(candidate.slug)) return candidate;
  }
  throw new Error("no distractor");
}

export function joinedLetterDrills(): QaidaExercise[] {
  const builds = JOINED_PAIRS.map(([a, b]) => {
    const one = letterBySlug(a);
    const two = letterBySlug(b);
    const other = joinedDistractor(one, two);
    return {
      id: `drill-joined-${a}-${b}`,
      type: "build-combination" as const,
      prompt: DRILL_PROMPTS.whichTwoLetters,
      subject: teaching(`${one.letter}${two.letter}`, `${one.name} then ${two.name}`),
      choices: choices([
        { label: `${one.name} + ${two.name}`, correct: true },
        { label: `${two.name} + ${one.name}` },
        { label: `${one.name} + ${other.name}` },
      ]),
    };
  });
  const groups: string[][] = [["seen", "sheen", "sad"], ["dad", "tta", "zza"], ["ayn", "ghayn", "fa"], ["qaf", "kaf", "lam"], ["meem", "noon", "ha"]];
  const names = groups.map((slugs, i) => {
    const letters = slugs.map(letterBySlug);
    return {
      id: `drill-joined-names-${i + 1}`,
      type: "read-word" as const,
      prompt: DRILL_PROMPTS.sayLetterNames,
      subject: teaching(letters.map((l) => l.letter).join(""), letters.map((l) => l.name).join(" · ")),
    };
  });
  return [...builds, ...names];
}
