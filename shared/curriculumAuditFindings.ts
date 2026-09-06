/**
 * Questions raised for the teacher while building the audit — not corrections.
 *
 * Reading 42 lessons closely turns up things that *might* be wrong: a
 * transliteration used for two different letters, a spelling convention, a rule
 * stated in one sentence and answered slightly differently in the next. None of
 * those is a call this repository can make. Each one is recorded here as a
 * question addressed to a qualified teacher, pointing at the inventory items it
 * concerns, and the curriculum is left exactly as it is until the teacher
 * decides.
 *
 * These are explicitly *not* reviews. A finding carries no status a reviewer
 * could mistake for a verdict, cannot be authored by a teacher, and never
 * changes an item's provenance: an item with three findings against it is still
 * `ai-drafted` until a teacher looks at it. A test enforces all three.
 */
import { QAIDA_LESSONS } from "./qaidaCurriculum";
import type { AuditCategory, ReviewSeverity } from "./curriculumAudit";

/**
 * One question for the teacher.
 *
 * `severity` is a suggestion about ordering the queue, nothing more — the
 * reviewer's own severity goes on their review record, and disagreeing with the
 * one here is an expected outcome.
 */
export type AuditFinding = {
  id: string;
  /** Inventory items the question concerns. May be empty for a scope note. */
  itemIds: string[];
  categories: AuditCategory[];
  /** What was noticed, stated as an observation about the text as it stands. */
  observation: string;
  /** What the teacher is being asked to decide. Always a question. */
  question: string;
  /** Suggested triage order only. Never a judgement that something is wrong. */
  severity: ReviewSeverity;
  /** Where the content lives, when it is outside the curriculum module. */
  sourcePath?: string;
};

/** Every finding is raised by tooling, never by a reviewer. */
export const FINDING_AUTHOR = "automated-inventory-review" as const;

/** A finding waits for a teacher; it has no other state. */
export const FINDING_STATE = "awaiting-teacher" as const;

const masteryItems = QAIDA_LESSONS.map((lesson) => `mastery:${lesson.id}`);

export const AUDIT_FINDINGS: AuditFinding[] = [
  {
    id: "finding-letter-name-collisions",
    itemIds: ["answer:identify-ta", "answer:identify-tta", "answer:identify-ha", "answer:identify-hha", "exercise:similar-ha-hha"],
    categories: ["letter-harakat-accuracy", "beginner-clarity"],
    observation:
      "Two pairs of letters share a display name in the answer options: ت and ط are both written \"Taa\", and ح and ه are both written \"Haa\". Within a single question the distractor builder filters the duplicate out, so no question offers the same word twice — but across lessons a learner meets \"Taa\" as the name of two different letters, and only the similar-shapes lesson disambiguates them (\"Haa (soft)\", \"Haa (deep)\").",
    question:
      "Which transliteration scheme should this course use for the letter names, and should the emphatic letters be distinguished in every lesson rather than only where they are contrasted?",
    severity: "major",
  },
  {
    id: "finding-basmalah-as-first-ayah",
    itemIds: ["quran-ref:quran-open-fatiha-1", "exercise:quran-open-fatiha-1", "objective:quran-first-ayah"],
    categories: ["quran-accuracy", "instructional-sequence"],
    observation:
      "The lesson titled \"Your first ayah\" opens al-Fatiha 1:1, which in the app's Quran data is the basmalah. Whether the basmalah is counted as the first ayah of al-Fatiha is not uniform across traditions of numbering.",
    question:
      "Is opening al-Fatiha 1:1 as the learner's \"first ayah\" the right choice for the numbering this app should follow, or should the lesson open a different ayah?",
    severity: "major",
  },
  {
    id: "finding-tanween-alif-placement",
    itemIds: ["teaching:tanween-three-marks", "example:tanween-three-marks#1"],
    categories: ["letter-harakat-accuracy", "beginner-clarity"],
    observation:
      "The lesson says fathatayn \"usually sits on an alif written at the end\", and the example is written بًا — the fathatayn on the Baa, followed by the alif. Mushaf and qaida conventions differ on whether the mark is printed over the preceding letter or over the alif itself.",
    question:
      "Which placement should the course show for fathatayn before a final alif, and does the sentence describe it accurately for a beginner?",
    severity: "major",
  },
  {
    id: "finding-shaddah-answer-wording",
    itemIds: ["answer:shaddah-name", "teaching:shaddah-basics"],
    categories: ["tajweed-terminology", "beginner-clarity", "exercise-correctness"],
    observation:
      "The teaching text says a shaddah means the letter is \"held rather than said twice\". The correct option of the question that follows reads \"Read the letter twice as one held sound\". The two sentences can be read as describing the doubling differently.",
    question:
      "Is the marked answer the wording you want a beginner to learn, and should it be brought into line with the teaching sentence?",
    severity: "minor",
  },
  {
    id: "finding-madd-letters-without-sukoon",
    itemIds: ["teaching:madd-long-vowels", "example:madd-long-vowels#2", "example:madd-long-vowels#3"],
    categories: ["letter-harakat-accuracy", "tajweed-terminology"],
    observation:
      "The long-vowel examples are written بَا, بُو and بِي, with no sukoon on the waw or the ya. Qaidas differ on whether the madd letter is shown bare or marked sakin at this stage.",
    question:
      "Should the madd letters carry a sukoon in these examples, and is the description \"the mouth holds the same sound for longer\" the right level of explanation here?",
    severity: "minor",
  },
  {
    id: "finding-meem-sakinah-cases-unnamed",
    itemIds: ["teaching:tajweed-meem-ghunnah", "objective:tajweed-meem-ghunnah"],
    categories: ["tajweed-terminology", "instructional-sequence", "beginner-clarity"],
    observation:
      "The lesson states that \"a sakin Meem has three cases of its own\" but does not name them, and its practice items ask only about ghunnah on a shaddah. The preceding lesson does name the four cases of noon sakinah.",
    question:
      "Should the three cases of meem sakinah be named as the four noon cases are, or is naming them beyond what this level should carry?",
    severity: "minor",
  },
  {
    id: "finding-mastery-requires-every-item",
    itemIds: masteryItems,
    categories: ["mastery-progression"],
    observation:
      "Every lesson's completion rule defaults to the full item count: a learner must answer every practice item correctly and attempt every one of them before the lesson is complete. A wrong answer keeps them on the item rather than failing them, and completed lessons never re-lock.",
    question:
      "Is \"every item correct\" the right standard for completing a lesson at this stage, or should a lesson complete at a lower threshold with the remaining items offered as review?",
    severity: "major",
  },
  {
    id: "finding-orthography-convention",
    itemIds: ["example:lam-sun-moon#2", "example:hamzah-orthography#3", "teaching:hamzah-wasl"],
    categories: ["quran-accuracy", "letter-harakat-accuracy"],
    observation:
      "Quoted Quranic words use a simplified vowelled spelling (الصِّرَاطَ) rather than the Uthmani spelling the app's reader shows (ٱلصِّرَٰطَ), with one exception: الرَّحْمَٰنِ keeps its small alif because the lesson is about that mark. The hamzat al-wasl lesson shows ٱ while the quoted words elsewhere use bare ا.",
    question:
      "Which orthography should this course use throughout — the simplified qaida spelling or the mushaf's Uthmani spelling — and is the single exception acceptable?",
    severity: "blocking",
  },
  {
    id: "finding-similar-pairs-selection",
    itemIds: ["teaching:letters-similar-shapes", "exercise:similar-kaf-qaf", "exercise:similar-ha-hha"],
    categories: ["instructional-sequence", "makhraj-articulation"],
    observation:
      "The \"letters easily mixed up\" lesson contrasts ه/ح and ك/ق alongside pairs that differ by a dot or a stroke. Those two pairs are confused by ear as much as by eye, and the lesson says so, but the exercise itself is a visual discrimination task.",
    question:
      "Are these the right pairs to contrast on the page, is any commonly confused group missing, and should the aurally confused pairs be taught here at all or left to the teacher's own drilling?",
    severity: "major",
  },
  {
    id: "finding-articulation-notes-are-makhraj-adjacent",
    itemIds: ["articulation:dad", "articulation:ayn", "articulation:qaf", "articulation:tta", "articulation:zza"],
    categories: ["makhraj-articulation"],
    observation:
      "The curriculum makes no makhraj claims, but the letter reference shows a written articulation note for each of the 28 letters (\"the side of the tongue presses against the upper molars\"), and those notes are translated into four other languages from the English originals. They are the only place in the app that describes where a sound is made.",
    question:
      "Are these 28 notes and their practice cues accurate and appropriate as written guidance, or should some of them be shortened, changed, or removed in favour of the reciter's recording alone?",
    severity: "blocking",
  },
  {
    id: "finding-stop-mark-coverage",
    itemIds: ["teaching:symbols-stop-marks", "answer:symbols-meem", "answer:symbols-qila"],
    categories: ["tajweed-terminology", "quran-accuracy", "beginner-clarity"],
    observation:
      "The stop-marks lesson teaches five marks — م, لا, ج, قلى, صلى — with one-line meanings. Mushafs print further marks (including the three-dot pairs), and the meaning given for م is \"a required stop\".",
    question:
      "Are these five the right marks for a beginner, are the meanings stated correctly for the mushaf this app serves, and should any further mark be added?",
    severity: "major",
  },
  {
    id: "finding-alif-maqsura-reading",
    itemIds: ["teaching:hamzah-orthography", "answer:orthography-maqsura", "answer:orthography-ta-marbuta"],
    categories: ["quran-accuracy", "tajweed-terminology", "beginner-clarity"],
    observation:
      "The lesson teaches that ى at the end of a word is read as a long 'a', and that ة is read 't' when continuing and 'h' when stopping, each as a single unqualified rule.",
    question:
      "Are these rules stated correctly and completely enough for a beginner reading the mushaf this app serves, including any case where ى is not read as a long 'a'?",
    severity: "major",
  },
  {
    id: "finding-quran-words-count",
    itemIds: ["teaching:quran-words", "exercise:quran-read-bismi"],
    categories: ["beginner-clarity"],
    observation:
      "The lesson text says \"almost everything you have met appears in these four words\" and lists four examples, while the lesson's practice asks the learner to read two of them aloud.",
    question: "Should the practice cover all four words the teaching text points at, or should the text name two?",
    severity: "minor",
  },
  {
    id: "finding-letter-hints-outside-curriculum",
    itemIds: [],
    categories: ["makhraj-articulation", "letter-harakat-accuracy"],
    observation:
      "The letter reference in the Learn view also shows a short written sound hint and an academic transliteration for each letter. Those live in the client's letter table rather than in the curriculum or the language packs, so they are outside this inventory even though a learner reads them.",
    question:
      "Should the sound hints and transliterations be reviewed as part of this audit, and if so should they be moved into the curriculum so that they cannot change without review?",
    severity: "major",
    sourcePath: "client/src/lib/arabicLetters.ts",
  },
];

/** Findings raised against one inventory item. */
export function findingsForItem(itemId: string): AuditFinding[] {
  return AUDIT_FINDINGS.filter((finding) => finding.itemIds.includes(itemId));
}

/** Findings raised against any item of one lesson, for the review interface. */
export function findingsForItems(itemIds: readonly string[]): AuditFinding[] {
  const wanted = new Set(itemIds);
  return AUDIT_FINDINGS.filter((finding) => finding.itemIds.some((id) => wanted.has(id)));
}
