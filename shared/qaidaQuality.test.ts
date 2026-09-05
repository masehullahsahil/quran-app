/**
 * Curriculum quality gates.
 *
 * These check the things a reviewer would otherwise have to re-check by hand
 * every time a lesson changes: that the Arabic is well-formed, that a lesson
 * never needs a mark the course has not taught yet, that an exercise cannot be
 * passed without reading, and that anything touching how a recitation *sounds*
 * says plainly that the app is not judging it.
 *
 * They deliberately do not encode teaching quality. Whether the wording of a
 * lesson is good, whether a makhraj description is accurate, and whether a
 * Quran example is correctly transcribed are matters for a qualified teacher —
 * see the review checklist in docs/qaida-curriculum.md.
 */
import { describe, expect, it } from "vitest";
import {
  QAIDA_LESSONS,
  QAIDA_LEVELS,
  lessonOrder,
  lessonsForLevel,
  type QaidaLesson,
} from "./qaidaCurriculum";
import { isChoiceExercise, isReadExercise, placeChoices, type QaidaArabicText } from "./qaidaExercises";

const levelOrder = new Map(QAIDA_LEVELS.map((level) => [level.id, level.order]));
const orderOf = (lesson: QaidaLesson) => levelOrder.get(lesson.level) ?? 0;

/** Every piece of Arabic a lesson puts on screen, with where it came from. */
function arabicOf(lesson: QaidaLesson): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [];
  for (const example of lesson.examples) out.push({ where: `${lesson.id} example`, text: example.arabic });
  for (const item of lesson.practice) {
    if (item.subject) out.push({ where: `${item.id} subject`, text: item.subject.arabic });
    for (const choice of item.choices ?? []) {
      if (choice.arabic) out.push({ where: `${item.id}/${choice.id}`, text: choice.arabic });
    }
  }
  return out;
}

function everyQuranText(): Array<{ where: string; text: QaidaArabicText }> {
  const out: Array<{ where: string; text: QaidaArabicText }> = [];
  for (const lesson of QAIDA_LESSONS) {
    for (const example of lesson.examples) if (example.source === "quran") out.push({ where: lesson.id, text: example });
    for (const item of lesson.practice) {
      if (item.subject?.source === "quran") out.push({ where: item.id, text: item.subject });
    }
  }
  return out;
}

describe("Arabic is well formed", () => {
  const ARABIC = /[؀-ۿ]/;
  const COMBINING = /[ً-ْٰ]/;

  it("has no empty or non-Arabic teaching text", () => {
    for (const lesson of QAIDA_LESSONS) {
      for (const { where, text } of arabicOf(lesson)) {
        expect(text.trim().length, where).toBeGreaterThan(0);
        expect(ARABIC.test(text), `${where}: ${text}`).toBe(true);
      }
    }
  });

  it("never starts a run with a combining mark, which would leave it orphaned", () => {
    for (const lesson of QAIDA_LESSONS) {
      for (const { where, text } of arabicOf(lesson)) {
        for (const word of text.split(/\s+/).filter(Boolean)) {
          // Tatweel is the one legitimate carrier for showing a mark alone.
          const first = word[0];
          expect(COMBINING.test(first) && first !== "ـ", `${where}: ${word}`).toBe(false);
        }
      }
    }
  });

  it("keeps every mark in Unicode canonical order", () => {
    // A vowel and a shaddah on one letter must be stored in the order NFC
    // produces, or two visually identical strings will not compare equal —
    // including against the transcript aligner, which normalises.
    for (const lesson of QAIDA_LESSONS) {
      for (const { where, text } of arabicOf(lesson)) {
        expect(text.normalize("NFC"), where).toBe(text);
      }
    }
  });

  it("gives every piece of Arabic a gloss saying how it reads", () => {
    for (const lesson of QAIDA_LESSONS) {
      for (const example of lesson.examples) expect(example.gloss.trim().length, `${lesson.id}: ${example.arabic}`).toBeGreaterThan(1);
      for (const item of lesson.practice) {
        if (item.subject) expect(item.subject.gloss.trim().length, item.id).toBeGreaterThan(1);
      }
    }
  });
});

describe("Quran references", () => {
  /**
   * Ayah counts for the surahs the curriculum quotes. A reference past the end
   * of its surah is a typo this catches; whether the *words* belong to that
   * ayah is checked by scripts/verify-qaida-quran.ts against the app's own
   * Quran data, and finally by a qualified teacher.
   */
  const AYAH_COUNTS: Record<number, number> = { 1: 7, 103: 3, 108: 3, 112: 4, 113: 5, 114: 6 };

  it("resolves every reference to a real surah and ayah", () => {
    for (const { where, text } of everyQuranText()) {
      expect(text.reference, where).toMatch(/^\d{1,3}:\d{1,3}$/);
      const [surah, ayah] = (text.reference ?? "").split(":").map(Number);
      expect(AYAH_COUNTS[surah], `${where}: surah ${surah} is not in the checked set`).toBeDefined();
      expect(ayah, `${where}: ${text.reference}`).toBeGreaterThanOrEqual(1);
      expect(ayah, `${where}: ${text.reference}`).toBeLessThanOrEqual(AYAH_COUNTS[surah]);
    }
  });

  it("points every read-quran item at a real ayah and copies no text", () => {
    for (const lesson of QAIDA_LESSONS) {
      for (const item of lesson.practice) {
        if (item.type !== "read-quran") continue;
        expect(item.quran, item.id).toBeDefined();
        expect(AYAH_COUNTS[item.quran!.surah], `${item.id}: surah ${item.quran!.surah}`).toBeDefined();
        expect(item.quran!.ayah, item.id).toBeLessThanOrEqual(AYAH_COUNTS[item.quran!.surah]);
        expect(item.quran!.label, item.id).toContain(`${item.quran!.surah}:${item.quran!.ayah}`);
        // Whole ayat are opened from the app's Quran data, never transcribed here.
        expect(item.subject, item.id).toBeUndefined();
      }
    }
  });

  it("quotes only short words and phrases inline", () => {
    for (const { where, text } of everyQuranText()) {
      expect(text.arabic.split(/\s+/).filter(Boolean).length, `${where}: ${text.arabic}`).toBeLessThanOrEqual(2);
    }
  });
});

describe("difficulty progression", () => {
  /**
   * The mark or form each level introduces. A lesson may only show Arabic whose
   * marks have already been taught: a learner who meets a shaddah two levels
   * before the shaddah lesson has been asked to read something nobody explained.
   *
   * Hamzah written on an alif (أ إ) is exempt: it reads as a plain vowelled
   * alif, and every Qaida uses such words long before hamzah seats are named.
   */
  const FEATURES: Array<{ name: string; level: number; test: (text: string) => boolean }> = [
    { name: "short vowels", level: 3, test: (t) => /[َُِ]/.test(t) },
    { name: "tanween", level: 4, test: (t) => /[ًٌٍ]/.test(t) },
    // A waw or ya is a long vowel only when it carries no mark of its own:
    // هُوَ has a damma then a *vowelled* waw, which is an ordinary consonant,
    // and إِيَّاكَ has a doubled ya, not a madd.
    { name: "long vowels", level: 5, test: (t) => /َا|ُو(?![َُِّْ])|ِي(?![َُِّْ])/.test(t) },
    { name: "sukoon", level: 6, test: (t) => /ْ/.test(t) },
    { name: "shaddah", level: 7, test: (t) => /ّ/.test(t) },
    { name: "definite article", level: 8, test: (t) => t.split(/\s+/).some((word) => /^ال/.test(word)) },
    { name: "hamzah seats", level: 9, test: (t) => /[ءؤئٱ]/.test(t) },
    { name: "small alif", level: 9, test: (t) => /ٰ/.test(t) },
  ];

  it("shows no mark before the level that teaches it", () => {
    const violations: string[] = [];
    for (const lesson of QAIDA_LESSONS) {
      for (const { where, text } of arabicOf(lesson)) {
        for (const feature of FEATURES) {
          if (feature.test(text) && feature.level > orderOf(lesson)) {
            violations.push(`${where} (level ${orderOf(lesson)}) uses ${feature.name} (level ${feature.level}): ${text}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("puts the long vowels before sukoon and shaddah, as a Qaida does", () => {
    const order = (id: string) => QAIDA_LEVELS.find((level) => level.id === id)?.order ?? 0;

    expect(order("harakat")).toBeLessThan(order("tanween"));
    expect(order("tanween")).toBeLessThan(order("madd"));
    expect(order("madd")).toBeLessThan(order("sukoon"));
    // A shaddah is a sakin letter joined to a vowelled one, so sukoon first.
    expect(order("sukoon")).toBeLessThan(order("shaddah"));
    // Hamzat al-wasl is explained through ال, so the article comes first.
    expect(order("lam")).toBeLessThan(order("hamzah"));
    expect(order("quran-reading")).toBe(QAIDA_LEVELS.length);
  });
});

describe("exercises cannot be passed without reading", () => {
  it("does not put the answer in the same place every time", () => {
    const positions = new Map<number, number>();
    let total = 0;
    for (const lesson of QAIDA_LESSONS) {
      for (const item of lesson.practice) {
        if (!isChoiceExercise(item.type) || !item.choices) continue;
        const index = item.choices.findIndex((choice) => choice.correct);
        positions.set(index, (positions.get(index) ?? 0) + 1);
        total += 1;
      }
    }

    expect(total).toBeGreaterThan(50);
    expect(positions.size).toBeGreaterThan(1);
    // No single position may carry even half the answers, so "always tap the
    // first option" cannot get a learner through the course.
    for (const [index, count] of positions) {
      expect(count / total, `position ${index}`).toBeLessThan(0.5);
    }
  });

  it("places the options deterministically, so a lesson looks the same each time", () => {
    const item = QAIDA_LESSONS[0].practice[0];
    expect(placeChoices(item.id, item.choices ?? [])).toEqual(placeChoices(item.id, item.choices ?? []));
  });

  it("offers no option that repeats another, and none that is empty", () => {
    for (const lesson of QAIDA_LESSONS) {
      for (const item of lesson.practice) {
        const rendered = (item.choices ?? []).map((choice) => `${choice.arabic ?? ""}|${choice.label ?? ""}`);
        expect(new Set(rendered).size, item.id).toBe(rendered.length);
        for (const value of rendered) expect(value.replace("|", "").length, item.id).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every option of a question in the same shape, so the odd one out is not the answer", () => {
    for (const lesson of QAIDA_LESSONS) {
      for (const item of lesson.practice) {
        const choicesList = item.choices ?? [];
        if (choicesList.length < 2) continue;
        const withArabic = choicesList.filter((choice) => choice.arabic).length;
        expect([0, choicesList.length], `${item.id}: ${withArabic}/${choicesList.length} options carry Arabic`).toContain(withArabic);
      }
    }
  });

  it("asks the learner to read aloud, not only to recognise, from the vowels onwards", () => {
    const readingLevels = QAIDA_LEVELS.filter((level) => level.order >= 3 && level.id !== "tajweed-patterns" && level.id !== "mushaf-symbols");
    for (const level of readingLevels) {
      const lessons = lessonsForLevel(level.id);
      const readsAloud = lessons.some((lesson) => lesson.practice.some((item) => isReadExercise(item.type)));
      expect(readsAloud, `level ${level.order} (${level.id}) has no reading practice`).toBe(true);
    }
  });
});

describe("similar-letter discrimination", () => {
  const groups = QAIDA_LESSONS.flatMap((lesson) => lesson.practice)
    .filter((item) => item.type === "distinguish-similar")
    .map((item) => (item.choices ?? []).map((choice) => choice.arabic ?? "").join(""));

  it.each([
    ["ب ت ث", ["ب", "ت", "ث"]],
    ["ج ح خ", ["ج", "ح", "خ"]],
    ["د ذ", ["د", "ذ"]],
    ["ر ز", ["ر", "ز"]],
    ["س ش", ["س", "ش"]],
    ["ص ض", ["ص", "ض"]],
    ["ط ظ", ["ط", "ظ"]],
    ["ع غ", ["ع", "غ"]],
    ["ف ق", ["ف", "ق"]],
    ["ه ح", ["ه", "ح"]],
    ["ك ق", ["ك", "ق"]],
  ])("contrasts %s in one exercise", (_name, letters) => {
    expect(groups.some((group) => letters.every((letter) => group.includes(letter)))).toBe(true);
  });

  it("never claims a written exercise shows how a letter is pronounced", () => {
    const lessons = QAIDA_LESSONS.filter((lesson) => lesson.practice.some((item) => item.type === "distinguish-similar"));
    expect(lessons.length).toBeGreaterThan(0);
    for (const lesson of lessons) {
      const text = `${lesson.teaching} ${lesson.objective} ${lesson.boundary ?? ""}`;
      expect(text, lesson.id).not.toMatch(/you (said|pronounced|produced) (it|this|them) correctly/i);
    }
  });
});

describe("the tajweed and mushaf levels stay inside what the app can see", () => {
  const soundLevels = ["madd", "tajweed-patterns", "mushaf-symbols"] as const;

  it("attaches a scope note to every lesson that names a rule of recitation", () => {
    for (const level of soundLevels) {
      for (const lesson of lessonsForLevel(level)) {
        expect(lesson.boundary, `${lesson.id} has no boundary note`).toBeTruthy();
        expect(lesson.boundary, lesson.id).toMatch(/teacher|does not|not measure/i);
      }
    }
  });

  it("uses recognition wording rather than performance wording", () => {
    const performanceClaim = /\byour (ghunnah|madd|qalqalah|makhraj|pronunciation)\b(?![^.]{0,60}\b(?:teacher|not|never)\b)|you (pronounced|produced|recited) (this|it|that) correctly|was (two|four|six) counts/i;
    for (const level of soundLevels) {
      for (const lesson of lessonsForLevel(level)) {
        const text = [lesson.teaching, lesson.objective, lesson.boundary ?? "", ...lesson.practice.map((item) => `${item.prompt} ${item.note ?? ""}`)].join(" ");
        expect(text, lesson.id).not.toMatch(performanceClaim);
      }
    }
  });

  it("keeps the objectives of those levels about noticing what is written", () => {
    for (const level of soundLevels) {
      for (const lesson of lessonsForLevel(level)) {
        expect(lesson.objective, lesson.id).toMatch(/recognise|identify|notice|tell|read|hold/i);
      }
    }
  });
});

describe("the last level graduates into Study mode", () => {
  const lessons = lessonsForLevel("quran-reading");

  it("goes word, then phrase, then one ayah, then several", () => {
    const [words, phrases, firstAyah, shortAyat, surah] = lessons;

    expect(lessons).toHaveLength(5);
    for (const item of words.practice) {
      expect(item.type, item.id).toBe("read-word");
      expect(item.subject?.arabic.split(/\s+/).filter(Boolean), item.id).toHaveLength(1);
    }
    for (const item of phrases.practice) {
      expect(item.type, item.id).toBe("read-word");
      expect(item.subject?.arabic.split(/\s+/).filter(Boolean).length, item.id).toBeGreaterThan(1);
    }
    expect(firstAyah.practice.filter((item) => item.type === "read-quran")).toHaveLength(1);
    expect(shortAyat.practice.filter((item) => item.type === "read-quran").length).toBeGreaterThan(1);
    expect(surah.practice.filter((item) => item.type === "read-quran").length).toBeGreaterThan(1);
  });

  it("finishes the surah it started rather than jumping between surahs", () => {
    const surahLesson = lessons[lessons.length - 1];
    const surahs = new Set(surahLesson.practice.map((item) => item.quran?.surah));

    expect(surahs.size).toBe(1);
    const ayat = surahLesson.practice.map((item) => item.quran?.ayah ?? 0);
    expect([...ayat].sort((a, b) => a - b)).toEqual(ayat);
  });

  it("comes last, after every other level", () => {
    for (const lesson of lessons) {
      expect(lessonOrder(lesson.id)).toBeGreaterThan(QAIDA_LESSONS.length - lessons.length - 1);
    }
    expect(QAIDA_LESSONS[QAIDA_LESSONS.length - 1].level).toBe("quran-reading");
  });
});
