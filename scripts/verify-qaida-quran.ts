/**
 * Checks every Quranic example in the curriculum against the app's own Quran
 * data, using the same client the reader uses.
 *
 * The unit tests can only check that a reference points at a surah and ayah that
 * exist — they run offline, and the Quran text is not bundled. This script does
 * the part that needs the network: it fetches each referenced ayah from
 * Quran.com and confirms that the word or phrase the lesson shows really occurs
 * in it, comparing with the same normalisation the recitation aligner uses so
 * that spelling conventions (Uthmani against simplified) do not cause false
 * alarms.
 *
 *   pnpm verify:qaida
 *
 * A mismatch is not automatically an error in the curriculum — it may be a
 * difference of orthography — but every one of them needs a human, and finally a
 * qualified teacher, to look at. See the review checklist in
 * docs/qaida-curriculum.md.
 */
import { QAIDA_LESSONS } from "../shared/qaidaCurriculum";
import type { QaidaArabicText } from "../shared/qaidaExercises";
import { normaliseArabicToken, tokenizeArabic } from "../server/recitation";
import { getSurahContent, DEFAULT_RECITER_ID, DEFAULT_TRANSLATION_ID } from "../server/quranApi";

type Quotation = { where: string; text: QaidaArabicText };
type AyahReference = { surah: number; ayah: number; where: string; label: string };

function quotations(): Quotation[] {
  const found: Quotation[] = [];
  for (const lesson of QAIDA_LESSONS) {
    for (const example of lesson.examples) {
      if (example.source === "quran") found.push({ where: `${lesson.id} · example`, text: example });
    }
    for (const item of lesson.practice) {
      if (item.subject?.source === "quran") found.push({ where: item.id, text: item.subject });
    }
  }
  return found;
}

function ayahReferences(): AyahReference[] {
  return QAIDA_LESSONS.flatMap((lesson) => lesson.practice)
    .filter((item) => item.type === "read-quran" && item.quran)
    .map((item) => ({ surah: item.quran!.surah, ayah: item.quran!.ayah, where: item.id, label: item.quran!.label }));
}

const cache = new Map<number, Awaited<ReturnType<typeof getSurahContent>>>();

async function surah(number: number) {
  const cached = cache.get(number);
  if (cached) return cached;
  const content = await getSurahContent(number, DEFAULT_RECITER_ID, DEFAULT_TRANSLATION_ID);
  cache.set(number, content);
  return content;
}

/** Whether the quoted words appear consecutively in the ayah, normalised. */
function occursIn(quote: string, ayah: string): boolean {
  const needle = tokenizeArabic(quote).map(normaliseArabicToken).filter(Boolean);
  const haystack = tokenizeArabic(ayah).map(normaliseArabicToken).filter(Boolean);
  if (!needle.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, offset) => word === haystack[start + offset])) return true;
  }
  return false;
}

async function main() {
  const problems: string[] = [];
  let checked = 0;

  for (const { where, text } of quotations()) {
    const [surahNumber, ayahNumber] = (text.reference ?? "").split(":").map(Number);
    if (!surahNumber || !ayahNumber) {
      problems.push(`${where}: "${text.arabic}" has no usable reference`);
      continue;
    }
    const content = await surah(surahNumber);
    const verse = content.ayahs.find((item) => item.number === ayahNumber);
    if (!verse) {
      problems.push(`${where}: ${text.reference} does not exist in surah ${surahNumber}`);
      continue;
    }
    checked += 1;
    if (!occursIn(text.arabic, verse.arabic)) {
      problems.push(`${where}: "${text.arabic}" was not found in ${text.reference}\n    ayah reads: ${verse.arabic}`);
    }
  }

  for (const reference of ayahReferences()) {
    const content = await surah(reference.surah);
    const verse = content.ayahs.find((item) => item.number === reference.ayah);
    checked += 1;
    if (!verse) {
      problems.push(`${reference.where}: ${reference.label} does not exist`);
      continue;
    }
    if (!reference.label.includes(`${reference.surah}:${reference.ayah}`)) {
      problems.push(`${reference.where}: label "${reference.label}" does not match its reference`);
    }
  }

  console.log(`Qaida Quran references: ${checked - problems.length}/${checked} verified against Quran.com`);
  if (problems.length) {
    console.log("\nNeeds a human — and then a qualified teacher — to look at:\n");
    for (const problem of problems) console.log(`  • ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log("Every quoted word was found in the ayah it names.");
  console.log("This checks the text only. Teaching wording, letter names and tajwid explanations still need a qualified Qaida teacher — see docs/qaida-curriculum.md.");
}

main().catch((error) => {
  console.error("Verification could not run:", error instanceof Error ? error.message : error);
  console.error("This script needs network access to Quran.com. The offline checks are in shared/qaidaQuality.test.ts.");
  process.exitCode = 1;
});
