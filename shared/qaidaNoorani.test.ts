/**
 * The Noorani-style depth of the course.
 *
 * These lock in what the expansion added: that each mark is drilled across the
 * whole alphabet rather than on two or three letters, that the lessons a
 * Noorani Qaida teaches are present and in a sensible order, and that no
 * existing lesson id was lost — saved progress, in the browser and in the
 * database, refers to lessons by id.
 *
 * Like the other curriculum tests, none of this says the teaching is right.
 * That is for a qualified teacher (docs/qaida-teacher-audit.md).
 */
import { describe, expect, it } from "vitest";
import { ARABIC_LETTERS } from "./arabicLetters";
import { QAIDA_LESSONS, getQaidaLesson, lessonOrder } from "./qaidaCurriculum";

/** Every lesson id the course had before the expansion. Never remove one. */
const LESSON_IDS_BEFORE_EXPANSION = [
  "letters-alif-ba-ta-tha", "letters-jeem-hha-kha", "letters-dal-dhal", "letters-ra-zay", "letters-seen-sheen",
  "letters-sad-dad", "letters-tta-zza", "letters-ayn-ghayn", "letters-fa-qaf", "letters-kaf-to-ya", "letters-similar",
  "letters-similar-shapes", "forms-four-positions", "forms-non-connectors", "forms-joining-practice", "harakat-fatha",
  "harakat-kasra", "harakat-damma", "harakat-combinations", "tanween-three-marks", "tanween-reading", "madd-long-vowels",
  "madd-short-vs-long", "sukoon-basics", "sukoon-quran-words", "shaddah-basics", "shaddah-quran-words", "lam-sun-moon",
  "lam-reading-practice", "hamzah-seats", "hamzah-wasl", "hamzah-orthography", "tajweed-qalqalah", "tajweed-noon-sakinah",
  "tajweed-meem-ghunnah", "symbols-stop-marks", "symbols-small-marks", "quran-words", "quran-phrases", "quran-first-ayah",
  "quran-short-ayat", "quran-short-surah",
];

/** All Arabic text a lesson's practice puts on screen as a subject. */
function subjects(lessonId: string): string {
  const lesson = getQaidaLesson(lessonId);
  if (!lesson) throw new Error(`missing lesson ${lessonId}`);
  return lesson.practice.map((item) => item.subject?.arabic ?? "").join(" ");
}

describe("existing progress keeps resolving", () => {
  it("still has every lesson id the course had before", () => {
    const missing = LESSON_IDS_BEFORE_EXPANSION.filter((id) => !getQaidaLesson(id));
    expect(missing).toEqual([]);
  });

  it("keeps the original lessons in their original relative order", () => {
    const orders = LESSON_IDS_BEFORE_EXPANSION.map(lessonOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("has unique practice item ids across the whole course", () => {
    const ids = QAIDA_LESSONS.flatMap((lesson) => lesson.practice.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("each mark is drilled across the whole alphabet", () => {
  const MARK = { fatha: "َ", kasra: "ِ", damma: "ُ" } as const;

  it.each([
    ["harakat-fatha", MARK.fatha],
    ["harakat-kasra", MARK.kasra],
    ["harakat-damma", MARK.damma],
  ])("%s puts its vowel on all 28 letters", (lessonId, mark) => {
    const text = subjects(lessonId);
    const missing = ARABIC_LETTERS.filter((letter) => !text.includes(`${letter.letter}${mark}`));
    expect(missing.map((letter) => letter.name)).toEqual([]);
  });

  const consonants = ARABIC_LETTERS.filter((letter) => letter.slug !== "alif");

  // Each tanween and each long-vowel form separately, across every letter. An
  // earlier generator picked two alphabet chunks per mark with a modulo, so the
  // first and third mark drilled the same letters and each covered only half
  // the alphabet; a combined "any mark" check could not see that.
  const TANWEEN_FORMS: Array<[string, (glyph: string) => string]> = [
    ["fathatayn", (g) => `${g}\u064B\u0627`],
    ["kasratayn", (g) => `${g}\u064D`],
    ["dammatayn", (g) => `${g}\u064C`],
  ];
  const MADD_FORMS: Array<[string, (glyph: string) => string]> = [
    // Indo-Pak: alif madd is bare, waw and ya madd carry a sukoon.
    ["alif after fatha", (g) => `${g}\u064E\u0627`],
    ["ya after kasra", (g) => `${g}\u0650\u064A\u0652`],
    ["waw after damma", (g) => `${g}\u064F\u0648\u0652`],
  ];

  it.each(TANWEEN_FORMS)("drills %s on every letter that can carry it", (_name, form) => {
    const text = subjects("tanween-three-marks");
    const missing = consonants.filter((letter) => !text.split(/\s+/).includes(form(letter.letter)));
    expect(missing.map((letter) => letter.name)).toEqual([]);
  });

  it.each(MADD_FORMS)("drills the long vowel %s on every letter", (_name, form) => {
    const text = subjects("madd-long-vowels");
    const missing = consonants.filter((letter) => !text.split(/\s+/).includes(form(letter.letter)));
    expect(missing.map((letter) => letter.name)).toEqual([]);
  });

  it("sukoon closes every letter except the two taught as leen", () => {
    const text = subjects("sukoon-basics");
    const missing = consonants
      .filter((letter) => letter.slug !== "waw" && letter.slug !== "ya")
      .filter((letter) => !text.includes(`${letter.letter}ْ`));
    expect(missing.map((letter) => letter.name)).toEqual([]);
  });

  it("shaddah doubles every letter", () => {
    const text = subjects("shaddah-basics").normalize("NFC");
    const missing = consonants.filter((letter) => !text.includes(letter.letter + "َّ".normalize("NFC")) && !text.includes(`${letter.letter}ّ`));
    expect(missing.map((letter) => letter.name)).toEqual([]);
  });

  it("asks a reading question, not only a row to read, in every drilled lesson", () => {
    for (const id of ["harakat-fatha", "harakat-kasra", "harakat-damma", "tanween-three-marks", "madd-long-vowels", "sukoon-basics", "shaddah-basics"]) {
      const lesson = getQaidaLesson(id)!;
      expect(lesson.practice.filter((item) => item.id.startsWith("drill-") && item.choices).length, id).toBeGreaterThanOrEqual(4);
      expect(lesson.practice.filter((item) => item.id.startsWith("drill-") && item.type === "read-word").length, id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("the lessons a Noorani Qaida teaches are all present", () => {
  // In Noorani order. Each entry is the lesson that covers that takhti here.
  const NOORANI_SEQUENCE: Array<[string, string]> = [
    ["single letters", "letters-alif-ba-ta-tha"],
    ["hamzah and laam-alif", "letters-hamzah-lam-alif"],
    ["joined letters (murakkabat)", "forms-compound-letters"],
    ["disjointed letters (muqatta'at)", "forms-muqattaat"],
    ["short vowels", "harakat-fatha"],
    ["short-vowel exercises", "harakat-exercises"],
    ["tanween", "tanween-three-marks"],
    ["tanween exercises", "tanween-exercises"],
    ["long vowels (madd)", "madd-long-vowels"],
    ["standing harakat", "madd-standing-harakat"],
    ["madd exercises", "madd-exercises"],
    ["sukoon", "sukoon-basics"],
    ["soft letters (leen)", "sukoon-leen"],
    ["shaddah", "shaddah-basics"],
    ["shaddah with sukoon, and ghunnah", "shaddah-combinations"],
    ["stopping (waqf)", "symbols-stopping"],
  ];

  it.each(NOORANI_SEQUENCE)("teaches %s", (_name, id) => {
    expect(getQaidaLesson(id), id).not.toBeNull();
  });

  it("teaches them in Noorani order", () => {
    const orders = NOORANI_SEQUENCE.map(([, id]) => lessonOrder(id));
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("reads the disjointed letters by their names", () => {
    const lesson = getQaidaLesson("forms-muqattaat")!;
    for (const item of lesson.practice) {
      expect(item.subject?.source, item.id).toBe("quran");
      const answer = item.choices?.find((choice) => choice.correct)?.label ?? "";
      expect(answer.split(" · ").length, item.id).toBeGreaterThan(1);
    }
  });

  it("gives every stopping question a sukoon, long alif or sakin Haa as the answer", () => {
    const lesson = getQaidaLesson("symbols-stopping")!;
    for (const item of lesson.practice) {
      const answer = item.choices?.find((choice) => choice.correct)?.arabic ?? "";
      expect(/(ْ|َا|هْ)$/.test(answer), `${item.id}: ${answer}`).toBe(true);
    }
  });
});
