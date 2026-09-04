import type { WordStatus } from "./recitation";

export const RECITATION_BENCHMARK_CATEGORIES = [
  "perfect",
  "omission",
  "insertion",
  "substitution",
  "repetition",
  "restart",
  "normalization",
  "mixed-errors",
  "noisy-transcript",
] as const;

export type RecitationBenchmarkCategory =
  (typeof RECITATION_BENCHMARK_CATEGORIES)[number];

export type RecitationBenchmarkCase = {
  id: string;
  name: string;
  category: RecitationBenchmarkCategory;
  expectedArabic: string;
  transcript: string;
  expected: {
    statuses: Exclude<WordStatus, "extra">[];
    extras: string[];
    correctionWordIndexes: Array<number | null>;
    score: number | { min: number; max: number };
  };
  notes: string;
};

const fixture = (value: RecitationBenchmarkCase): RecitationBenchmarkCase =>
  value;

/**
 * Text-only, deterministic examples. These fixtures make no claim about audio,
 * pronunciation, tajweed, makhraj, or other acoustic recitation qualities.
 */
export const RECITATION_BENCHMARK_CASES: RecitationBenchmarkCase[] = [
  fixture({
    id: "perfect-01",
    name: "Al-Fatihah opening",
    category: "perfect",
    expectedArabic: "بسم الله الرحمن الرحيم",
    transcript: "بسم الله الرحمن الرحيم",
    expected: {
      statuses: ["matched", "matched", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [],
      score: 100,
    },
    notes: "Exact short ayah.",
  }),
  fixture({
    id: "perfect-02",
    name: "Al-Ikhlas opening",
    category: "perfect",
    expectedArabic: "قل هو الله أحد",
    transcript: "قل هو الله أحد",
    expected: {
      statuses: ["matched", "matched", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [],
      score: 100,
    },
    notes: "Exact short ayah.",
  }),
  fixture({
    id: "perfect-03",
    name: "Two-word ayah",
    category: "perfect",
    expectedArabic: "الله الصمد",
    transcript: "الله الصمد",
    expected: {
      statuses: ["matched", "matched"],
      extras: [],
      correctionWordIndexes: [],
      score: { min: 100, max: 100 },
    },
    notes: "Score-range form is supported.",
  }),

  fixture({
    id: "omission-01",
    name: "Single middle omission",
    category: "omission",
    expectedArabic: "الحمد لله رب العالمين",
    transcript: "الحمد لله العالمين",
    expected: {
      statuses: ["matched", "matched", "missing", "matched"],
      extras: [],
      correctionWordIndexes: [3],
      score: 75,
    },
    notes: "One omitted Quran word.",
  }),
  fixture({
    id: "omission-02",
    name: "Consecutive omissions",
    category: "omission",
    expectedArabic: "إياك نعبد وإياك نستعين",
    transcript: "إياك نستعين",
    expected: {
      statuses: ["matched", "missing", "missing", "matched"],
      extras: [],
      correctionWordIndexes: [2, 3],
      score: 50,
    },
    notes: "Two adjacent omissions.",
  }),
  fixture({
    id: "omission-03",
    name: "Opening omission",
    category: "omission",
    expectedArabic: "قل أعوذ برب الفلق",
    transcript: "أعوذ برب الفلق",
    expected: {
      statuses: ["missing", "matched", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [1],
      score: 75,
    },
    notes: "First word omitted.",
  }),
  fixture({
    id: "omission-04",
    name: "Ending omission",
    category: "omission",
    expectedArabic: "من شر ما خلق",
    transcript: "من شر ما",
    expected: {
      statuses: ["matched", "matched", "matched", "missing"],
      extras: [],
      correctionWordIndexes: [4],
      score: 75,
    },
    notes: "Last word omitted.",
  }),
  fixture({
    id: "omission-05",
    name: "Empty transcript",
    category: "omission",
    expectedArabic: "لم يلد ولم يولد",
    transcript: "",
    expected: {
      statuses: ["missing", "missing", "missing", "missing"],
      extras: [],
      correctionWordIndexes: [1, 2, 3, 4],
      score: 0,
    },
    notes: "No transcript tokens.",
  }),
  fixture({
    id: "omission-06",
    name: "Very short partial transcript",
    category: "omission",
    expectedArabic: "الحمد لله رب العالمين",
    transcript: "الحمد",
    expected: {
      statuses: ["matched", "missing", "missing", "missing"],
      extras: [],
      correctionWordIndexes: [2, 3, 4],
      score: 25,
    },
    notes: "Only the opening word was heard.",
  }),

  fixture({
    id: "insertion-01",
    name: "Single insertion",
    category: "insertion",
    expectedArabic: "قل هو الله أحد",
    transcript: "قل هو يا الله أحد",
    expected: {
      statuses: ["matched", "matched", "matched", "matched"],
      extras: ["يا"],
      correctionWordIndexes: [null],
      score: 100,
    },
    notes: "One non-Quran transcript token.",
  }),
  fixture({
    id: "insertion-02",
    name: "Consecutive insertions",
    category: "insertion",
    expectedArabic: "الله الصمد",
    transcript: "الله هو ربي الصمد",
    expected: {
      statuses: ["matched", "matched"],
      extras: ["هو", "ربي"],
      correctionWordIndexes: [null, null],
      score: 100,
    },
    notes: "Two adjacent transcript extras.",
  }),
  fixture({
    id: "insertion-03",
    name: "Trailing insertion",
    category: "insertion",
    expectedArabic: "ولم يكن له كفوا أحد",
    transcript: "ولم يكن له كفوا أحد صدق",
    expected: {
      statuses: ["matched", "matched", "matched", "matched", "matched"],
      extras: ["صدق"],
      correctionWordIndexes: [null],
      score: 100,
    },
    notes: "Extra after the ayah.",
  }),

  fixture({
    id: "substitution-01",
    name: "Single substitution",
    category: "substitution",
    expectedArabic: "الحمد لله رب العالمين",
    transcript: "الحمد للرحمن رب العالمين",
    expected: {
      statuses: ["matched", "review", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [2],
      score: 75,
    },
    notes: "One lexical replacement.",
  }),
  fixture({
    id: "substitution-02",
    name: "Beginning mistake then recovery",
    category: "substitution",
    expectedArabic: "قل أعوذ برب الناس",
    transcript: "قال أعوذ برب الناس",
    expected: {
      statuses: ["review", "matched", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [1],
      score: 75,
    },
    notes: "Alignment recovers after initial replacement.",
  }),
  fixture({
    id: "substitution-03",
    name: "Middle mistake then recovery",
    category: "substitution",
    expectedArabic: "ملك يوم الدين",
    transcript: "ملك ليلة الدين",
    expected: {
      statuses: ["matched", "review", "matched"],
      extras: [],
      correctionWordIndexes: [2],
      score: 67,
    },
    notes: "Alignment recovers after middle replacement.",
  }),
  fixture({
    id: "substitution-04",
    name: "Final substitution",
    category: "substitution",
    expectedArabic: "من الجنة والناس",
    transcript: "من الجنة والعالمين",
    expected: {
      statuses: ["matched", "matched", "review"],
      extras: [],
      correctionWordIndexes: [3],
      score: 67,
    },
    notes: "Final word needs review.",
  }),

  fixture({
    id: "repeated-word-01",
    name: "Repeated opening word",
    category: "repetition",
    expectedArabic: "الله الصمد",
    transcript: "الله الله الصمد",
    expected: {
      statuses: ["matched", "matched"],
      extras: ["الله"],
      correctionWordIndexes: [null],
      score: 100,
    },
    notes: "Repeated spoken word is extra.",
  }),
  fixture({
    id: "repeated-word-02",
    name: "Repeated middle word",
    category: "repetition",
    expectedArabic: "من شر الوسواس الخناس",
    transcript: "من شر شر الوسواس الخناس",
    expected: {
      statuses: ["matched", "matched", "matched", "matched"],
      extras: ["شر"],
      correctionWordIndexes: [null],
      score: 100,
    },
    notes: "Repeated middle token.",
  }),
  fixture({
    id: "repeated-phrase-01",
    name: "Repeated phrase",
    category: "repetition",
    expectedArabic: "قل أعوذ برب الفلق",
    transcript: "قل أعوذ قل أعوذ برب الفلق",
    expected: {
      statuses: ["matched", "matched", "matched", "matched"],
      extras: ["قل", "أعوذ"],
      correctionWordIndexes: [null, null],
      score: 100,
    },
    notes: "Repeated two-word phrase.",
  }),
  fixture({
    id: "repeated-word-03",
    name: "Repeated Quran words ambiguity",
    category: "repetition",
    expectedArabic: "فإن مع العسر يسرا إن مع العسر يسرا",
    transcript: "فإن مع العسر إن مع العسر يسرا",
    expected: {
      statuses: [
        "matched",
        "matched",
        "matched",
        "missing",
        "matched",
        "matched",
        "matched",
        "matched",
      ],
      extras: [],
      correctionWordIndexes: [4],
      score: 88,
    },
    notes: "Repeated phrase should align omission to the first يسرا.",
  }),

  fixture({
    id: "restart-01",
    name: "False start then full restart",
    category: "restart",
    expectedArabic: "قل هو الله أحد",
    transcript: "قل هو قل هو الله أحد",
    expected: {
      statuses: ["matched", "matched", "matched", "matched"],
      extras: ["قل", "هو"],
      correctionWordIndexes: [null, null],
      score: 100,
    },
    notes: "Full alignment retains the completed attempt.",
  }),
  fixture({
    id: "restart-02",
    name: "Wrong opening then restart",
    category: "restart",
    expectedArabic: "إنا أعطيناك الكوثر",
    transcript: "إن أعطينا إنا أعطيناك الكوثر",
    expected: {
      statuses: ["matched", "matched", "matched"],
      extras: ["إن", "أعطينا"],
      correctionWordIndexes: [null, null],
      score: 100,
    },
    notes: "Discarded false-start tokens are extras.",
  }),
  fixture({
    id: "restart-03",
    name: "Mid-ayah restart",
    category: "restart",
    expectedArabic: "فصل لربك وانحر",
    transcript: "فصل لربك فصل لربك وانحر",
    expected: {
      statuses: ["matched", "matched", "matched"],
      extras: ["فصل", "لربك"],
      correctionWordIndexes: [null, null],
      score: 100,
    },
    notes: "Restart after two correct words.",
  }),

  fixture({
    id: "normalization-01",
    name: "Arabic diacritics variants",
    category: "normalization",
    expectedArabic: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
    transcript: "الحمد لله رب العالمين",
    expected: {
      statuses: ["matched", "matched", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [],
      score: 100,
    },
    notes: "Harakat do not alter textual match.",
  }),
  fixture({
    id: "normalization-02",
    name: "Quranic marks",
    category: "normalization",
    expectedArabic: "قُلْ هُوَ ٱللَّهُ أَحَدٌ۝",
    transcript: "قل هو الله أحد",
    expected: {
      statuses: ["matched", "matched", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [],
      score: 100,
    },
    notes: "Quranic annotation marks are stripped.",
  }),
  fixture({
    id: "normalization-03",
    name: "Alif variants",
    category: "normalization",
    expectedArabic: "إنا أعطيناك الكوثر",
    transcript: "انا اعطيناك الكوثر",
    expected: {
      statuses: ["matched", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [],
      score: 100,
    },
    notes: "Hamzated alif variants normalize.",
  }),
  fixture({
    id: "normalization-04",
    name: "Alif maqsura and ya",
    category: "normalization",
    expectedArabic: "والضحى والليل إذا سجى",
    transcript: "والضحي والليل اذا سجي",
    expected: {
      statuses: ["matched", "matched", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [],
      score: 100,
    },
    notes: "Alif maqsura normalizes to ya.",
  }),
  fixture({
    id: "normalization-05",
    name: "Tatweel and punctuation",
    category: "normalization",
    expectedArabic: "قل هو الله أحد",
    transcript: "قـل، هو؛ الله أحد!",
    expected: {
      statuses: ["matched", "matched", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [],
      score: 100,
    },
    notes: "Supported punctuation and tatweel are ignored.",
  }),

  fixture({
    id: "mixed-01",
    name: "Insertion followed by omission",
    category: "mixed-errors",
    expectedArabic: "اهدنا الصراط المستقيم صراط الذين",
    transcript: "اهدنا يا الصراط صراط الذين",
    expected: {
      statuses: ["matched", "matched", "missing", "matched", "matched"],
      extras: ["يا"],
      correctionWordIndexes: [3, null],
      score: 80,
    },
    notes: "Two error types without cascade.",
  }),
  fixture({
    id: "mixed-02",
    name: "Omission followed by insertion",
    category: "mixed-errors",
    expectedArabic: "غير المغضوب عليهم ولا الضالين",
    transcript: "غير عليهم جدا ولا الضالين",
    expected: {
      statuses: ["matched", "missing", "matched", "matched", "matched"],
      extras: ["جدا"],
      correctionWordIndexes: [2, null],
      score: 80,
    },
    notes: "Omission precedes transcript extra.",
  }),
  fixture({
    id: "mixed-03",
    name: "Substitution and insertion",
    category: "mixed-errors",
    expectedArabic: "تبت يدا أبي لهب وتب",
    transcript: "تبت يد أبي يا لهب وتب",
    expected: {
      statuses: ["matched", "review", "matched", "matched", "matched"],
      extras: ["يا"],
      correctionWordIndexes: [2, null],
      score: 80,
    },
    notes: "Review plus extra.",
  }),
  fixture({
    id: "mixed-04",
    name: "Substitution omission recovery",
    category: "mixed-errors",
    expectedArabic: "والعصر إن الإنسان لفي خسر",
    transcript: "والعصر البشر لفي خسر",
    expected: {
      statuses: ["matched", "review", "missing", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [2, 3],
      score: 60,
    },
    notes:
      "Adjacent different errors then recovery; the deterministic tie-break reviews the earlier word.",
  }),

  fixture({
    id: "noise-01",
    name: "Spacing noise",
    category: "noisy-transcript",
    expectedArabic: "قل هو الله أحد",
    transcript: "  قل   هو\nالله\tأحد  ",
    expected: {
      statuses: ["matched", "matched", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [],
      score: 100,
    },
    notes: "Whitespace tokenization is stable.",
  }),
  fixture({
    id: "noise-02",
    name: "Punctuation attached to words",
    category: "noisy-transcript",
    expectedArabic: "ملك يوم الدين",
    transcript: "ملك، يوم... الدين؟",
    expected: {
      statuses: ["matched", "matched", "matched"],
      extras: [],
      correctionWordIndexes: [],
      score: 100,
    },
    notes: "Supported punctuation is token-local noise.",
  }),
  fixture({
    id: "noise-03",
    name: "Only non-Arabic text",
    category: "noisy-transcript",
    expectedArabic: "الله الصمد",
    transcript: "background noise",
    expected: {
      statuses: ["review", "review"],
      extras: [],
      correctionWordIndexes: [1, 2],
      score: 0,
    },
    notes:
      "Documents raw aligner behavior; callers may reject non-Arabic transcripts first.",
  }),
  fixture({
    id: "noise-04",
    name: "Non-Arabic prefix",
    category: "noisy-transcript",
    expectedArabic: "قل هو الله أحد",
    transcript: "noise قل هو الله أحد",
    expected: {
      statuses: ["matched", "matched", "matched", "matched"],
      extras: ["noise"],
      correctionWordIndexes: [null],
      score: 100,
    },
    notes: "A stray transcription token remains explicit.",
  }),
];
