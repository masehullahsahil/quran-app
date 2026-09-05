import type { QuranEvaluationFindingKind, QuranEvaluationStatus } from "./quranEvaluation";

export const ACOUSTIC_BENCHMARK_CATEGORIES = [
  "correct_pronunciation",
  "unclear_noisy_audio",
  "phoneme_confusion",
  "vowel_length_issue",
  "pause_stop_issue",
  "tajweed_rule_observation",
] as const;
export type AcousticBenchmarkCategory = (typeof ACOUSTIC_BENCHMARK_CATEGORIES)[number];

export type AcousticBenchmarkFixture = {
  id: string;
  surah: number;
  ayah: number;
  expectedWordIndex: number | null;
  expectedArabic: string;
  category: AcousticBenchmarkCategory;
  expectedFindingKind: QuranEvaluationFindingKind | null;
  expectedConfidenceRange: readonly [minimum: number, maximum: number] | null;
  shouldAbstain: boolean;
  notes: string;
};

/** Metadata for research and labeling only; this is not a claim of detection capability. */
export const QURAN_PRONUNCIATION_CONFUSIONS = [
  { id: "qaf-kaf", graphemes: ["ق", "ك"] as const, note: "Uvular qāf versus velar kāf." },
  { id: "sad-sin", graphemes: ["ص", "س"] as const, note: "Emphatic ṣād versus sīn." },
  { id: "dad-dal", graphemes: ["ض", "د"] as const, note: "Emphatic ḍād versus dāl." },
  { id: "ta-ta", graphemes: ["ط", "ت"] as const, note: "Emphatic ṭāʾ versus tāʾ." },
  { id: "za-zay-dhal", graphemes: ["ظ", "ز", "ذ"] as const, note: "Interdental/emphatic distinctions." },
  { id: "ha-ha", graphemes: ["ح", "ه"] as const, note: "Pharyngeal ḥāʾ versus glottal hāʾ." },
  { id: "ayn-hamza", graphemes: ["ع", "أ"] as const, note: "Pharyngeal ʿayn versus hamza." },
  { id: "ghayn-kha", graphemes: ["غ", "خ"] as const, note: "Voiced ghayn versus voiceless khāʾ where applicable." },
] as const;

export type AcousticPrediction = {
  status: QuranEvaluationStatus;
  findingKind: QuranEvaluationFindingKind | null;
  confidence: number | null;
  confusionPairId?: string | null;
  rule?: string | null;
};
