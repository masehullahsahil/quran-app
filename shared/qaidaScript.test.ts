/**
 * The Qaida course is in the Indo-Pak script.
 *
 * These enumerate every lesson and check every piece of Arabic it shows against
 * the mapping in shared/qaidaScript.ts, and check that the bundled Indo-Pak font
 * can draw every codepoint used. They do not check that the teaching is right;
 * that is for a qualified teacher (docs/qaida-teacher-audit.md).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { QAIDA_LESSONS, getQaidaLesson, lessonOrder, type QaidaLesson } from "./qaidaCurriculum";
import { INDOPAK_QURAN_WORDS, arabicRuns, oldScriptFindings, toIndoPak } from "./qaidaScript";
import { localizedExercise, localizedLesson } from "./qaidaText";
import { woff2Codepoints } from "./fontCoverage";
import { SUPPORTED_LANGUAGE_CODES } from "./languages";
import { loadLocale } from "../locales/index";

const BRIDGE_ID = "quran-two-scripts";

type Piece = { where: string; arabic: string; uthmani: boolean };

/** Every piece of Arabic a lesson shows: examples, subjects, options, and Arabic inside its English text. */
function arabicPieces(lesson: QaidaLesson): Piece[] {
  const pieces: Piece[] = [];
  lesson.examples.forEach((example, i) => pieces.push({ where: `${lesson.id} example ${i + 1}`, arabic: example.arabic, uthmani: example.script === "uthmani" }));
  for (const item of lesson.practice) {
    if (item.subject) pieces.push({ where: `${item.id} subject`, arabic: item.subject.arabic, uthmani: item.subject.script === "uthmani" });
    for (const choice of item.choices ?? []) {
      if (choice.arabic) pieces.push({ where: `${item.id}/${choice.id}`, arabic: choice.arabic, uthmani: choice.script === "uthmani" });
    }
    for (const run of arabicRuns(`${item.prompt} ${item.note ?? ""}`)) pieces.push({ where: `${item.id} prompt`, arabic: run, uthmani: false });
  }
  for (const field of [lesson.title, lesson.objective, lesson.teaching, lesson.boundary ?? ""]) {
    for (const run of arabicRuns(field)) pieces.push({ where: `${lesson.id} text`, arabic: run, uthmani: false });
  }
  return pieces;
}

describe("every lesson is in the Indo-Pak script", () => {
  it("has 54 lessons, the last of them the bridge lesson", () => {
    expect(QAIDA_LESSONS).toHaveLength(54);
    expect(QAIDA_LESSONS[QAIDA_LESSONS.length - 1].id).toBe(BRIDGE_ID);
  });

  it.each(QAIDA_LESSONS.map((lesson) => [lesson.id, lesson] as const))("%s uses only Indo-Pak forms", (_id, lesson) => {
    const problems = arabicPieces(lesson)
      .filter((piece) => !piece.uthmani)
      .flatMap((piece) => oldScriptFindings(piece.arabic).map((finding) => `${piece.where}: ${piece.arabic} — ${finding.why}`));
    expect(problems).toEqual([]);
  });

  it("keeps Uthmani spellings to the bridge lesson", () => {
    const outside = QAIDA_LESSONS.filter((lesson) => lesson.id !== BRIDGE_ID)
      .flatMap((lesson) => arabicPieces(lesson).filter((piece) => piece.uthmani).map((piece) => piece.where));
    expect(outside).toEqual([]);
  });

  it("is idempotent: converting the course again changes nothing", () => {
    for (const lesson of QAIDA_LESSONS) {
      for (const piece of arabicPieces(lesson).filter((p) => !p.uthmani)) {
        expect(toIndoPak(piece.arabic), piece.where).toBe(piece.arabic.normalize("NFC"));
      }
    }
  });

  it("quotes every Quranic word in the spelling recorded from the reference texts", () => {
    const recorded = new Map(Object.values(INDOPAK_QURAN_WORDS).map((entry) => [entry.indoPak, entry.reference]));
    for (const lesson of QAIDA_LESSONS) {
      const quoted = [...lesson.examples, ...lesson.practice.map((item) => item.subject)].filter(
        (text): text is NonNullable<typeof text> => Boolean(text && text.source === "quran" && text.script !== "uthmani"),
      );
      for (const text of quoted) {
        for (const word of text.arabic.split(/\s+/)) {
          expect(recorded.has(word), `${lesson.id}: ${word} (${text.reference}) is not in INDOPAK_QURAN_WORDS`).toBe(true);
        }
      }
    }
  });

  it("does not use any of the old Quran spellings anywhere in the course", () => {
    const retired = Object.entries(INDOPAK_QURAN_WORDS).filter(([old, entry]) => old !== entry.indoPak).map(([old]) => old);
    for (const lesson of QAIDA_LESSONS) {
      for (const piece of arabicPieces(lesson).filter((p) => !p.uthmani)) {
        for (const word of piece.arabic.split(/\s+/)) expect(retired, `${piece.where}: ${word}`).not.toContain(word);
      }
    }
  });
});

describe("the bundled Indo-Pak font draws everything the course shows", () => {
  const fontPath = resolve(import.meta.dirname, "../client/public/fonts/qaida/DigitalKhattIndoPak.woff2");
  let coverage: Set<number>;
  beforeAll(() => {
    coverage = woff2Codepoints(readFileSync(fontPath));
  });

  it("is a real font with Arabic coverage, shipped with its licence", () => {
    expect(coverage.has(0x0628)).toBe(true);
    expect(coverage.has(0x0656)).toBe(true);
    expect(coverage.has(0x0657)).toBe(true);
    expect(readFileSync(resolve(fontPath, "../OFL.txt"), "utf-8")).toContain("SIL Open Font License");
  });

  it("covers every Arabic codepoint in every non-Uthmani piece of every lesson", () => {
    const missing = new Set<string>();
    for (const lesson of QAIDA_LESSONS) {
      for (const piece of arabicPieces(lesson).filter((p) => !p.uthmani)) {
        for (const char of piece.arabic) {
          const cp = char.codePointAt(0)!;
          if (cp >= 0x0600 && cp <= 0x06ff && !coverage.has(cp)) missing.add(`U+${cp.toString(16).toUpperCase()} in ${piece.where}`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("covers the Indo-Pak letter forms the mapping uses, and lacks the ones it rejects", () => {
    for (const cp of [0x064a, 0x0643, 0x0647, 0x0629, 0x0670, 0x0652]) expect(coverage.has(cp), cp.toString(16)).toBe(true);
    // The reason Yeh stays U+064A: this font has no Farsi Yeh.
    expect(coverage.has(0x06cc)).toBe(false);
  });
});

describe("the bridge lesson shows the same words in both scripts", () => {
  const bridge = getQaidaLesson(BRIDGE_ID)!;
  const fold = (word: string) =>
    word
      .normalize("NFC")
      .replace(/[ً-ٰٟۖ-ۭ]/g, "")
      .replace(/[أإٱ]/g, "ا");

  it("is last in course order, in the final level", () => {
    expect(bridge.level).toBe("quran-reading");
    expect(lessonOrder(BRIDGE_ID)).toBe(QAIDA_LESSONS.length); // 1-based
    expect(bridge.prerequisites).toEqual(["quran-short-surah"]);
  });

  it("pairs each Indo-Pak word with the same word in Uthmani, at the same reference", () => {
    const examples = bridge.examples;
    expect(examples.length).toBeGreaterThanOrEqual(6);
    expect(examples.length % 2).toBe(0);
    for (let i = 0; i < examples.length; i += 2) {
      const [indoPak, uthmani] = [examples[i], examples[i + 1]];
      expect(indoPak.script, indoPak.arabic).toBeUndefined();
      expect(uthmani.script, uthmani.arabic).toBe("uthmani");
      expect(indoPak.reference).toBe(uthmani.reference);
      expect(fold(indoPak.arabic), `${indoPak.arabic} / ${uthmani.arabic}`).toBe(fold(uthmani.arabic));
      expect(oldScriptFindings(indoPak.arabic)).toEqual([]);
    }
    // The point of the lesson: the two scripts really do differ on the page.
    const differing = examples.filter((_, i) => i % 2 === 0).filter((e, i) => e.arabic !== examples[i * 2 + 1].arabic);
    expect(differing.length).toBe(examples.length / 2);
  });

  it("asks the learner to pick the Indo-Pak form, then sends them to Study", () => {
    const picks = bridge.practice.filter((item) => item.type === "identify-symbol");
    expect(picks.length).toBeGreaterThan(0);
    for (const item of picks) {
      const correct = item.choices!.find((choice) => choice.correct)!;
      expect(correct.script).toBeUndefined();
      expect(item.choices!.some((choice) => choice.script === "uthmani")).toBe(true);
    }
    expect(bridge.practice.some((item) => item.type === "read-quran")).toBe(true);
  });
});

describe("the language packs carry the Indo-Pak examples too", () => {
  const retired = Object.entries(INDOPAK_QURAN_WORDS).filter(([old, entry]) => old !== entry.indoPak).map(([old]) => old);
  const ARABIC = "[\\u0610-\\u061A\\u0620-\\u065F\\u0670-\\u06D3\\u06D6-\\u06ED\\u0640]";

  it.each(SUPPORTED_LANGUAGE_CODES.map((code) => [code]))("%s quotes no old-script Quran spelling in any lesson", async (code) => {
    const pack = await loadLocale(code);
    const problems: string[] = [];
    for (const lesson of QAIDA_LESSONS) {
      const text = localizedLesson(lesson, pack.qaida);
      const fields = [text.title, text.objective, text.teaching, text.boundary ?? "", ...lesson.practice.map((item) => localizedExercise(item, pack.qaida).prompt)];
      for (const field of fields) {
        for (const old of retired) {
          if (new RegExp(`(?<!${ARABIC})${old}(?!${ARABIC})`).test(field)) problems.push(`${lesson.id}: ${old}`);
        }
        // Vowelled tokens are examples (prose is not vowelled throughout); none may be in the old script.
        if (lesson.id === BRIDGE_ID) continue;
        for (const token of field.split(/[\s«»”“"'(),.:;؛،—]+/)) {
          const letters = (token.match(/[ؠ-يٱ-ۓ]/g) ?? []).length;
          const marks = (token.match(/[ً-ْٰٖٗ]/g) ?? []).length;
          if (letters === 0 || marks / letters < 0.6) continue;
          // Pashto, Dari and Urdu write ی in their own words; only the course's examples are checked.
          const findings = oldScriptFindings(token).filter((finding) => !finding.codepoint.startsWith("U+06CC"));
          // يُؤدَّى is Arabic prose ("is performed"), fully vowelled, not an example.
          if (findings.length && token !== "يُؤدَّى") problems.push(`${lesson.id}: ${token}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
