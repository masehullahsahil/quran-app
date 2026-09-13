/**
 * Quran ASR bake-off harness — shared types.
 *
 * ISOLATION CONTRACT: everything in server/asrBakeoff is benchmark tooling.
 * Nothing here is imported by production code (routers, live tutor, review
 * pipeline). The harness *reads* the production alignment engine
 * (server/recitation.ts) and the production transcription path
 * (server/_core/voiceTranscription.ts) so candidates are judged by the exact
 * logic the app ships — it never duplicates or modifies that logic.
 *
 * SAFETY: this harness evaluates ASR/transcription quality only. A transcript
 * mismatch is never interpreted as a pronunciation or tajweed judgement.
 * Do not claim any model here can judge makhraj, madd, ghunnah, or qalqalah.
 */

/** Stable adapter identifiers. */
export const ADAPTER_IDS = {
  production: "production-openai-whisper",
  tarteelBase: "tarteel-whisper-base-ar-quran",
  quranTurbo: "quran-whisper-large-v3-turbo",
} as const;

export type AsrAdapterId = (typeof ADAPTER_IDS)[keyof typeof ADAPTER_IDS];

/** Licenses the bake-off is allowed to evaluate. Anything else is refused. */
export const ALLOWED_LICENSES = ["Apache-2.0", "MIT", "BSD-3-Clause", "BSD-2-Clause"] as const;

/** Raw output of one adapter transcribing one recording. */
export type AdapterTranscribeResult = {
  /** Raw transcript text, or null when transcription failed. */
  transcript: string | null;
  /** Wall-clock time spent inside the adapter's transcribe call. */
  latencyMs: number;
  /**
   * Approximate peak RSS delta (MB) measured around the transcribe call.
   * Null when the adapter cannot measure it (e.g. remote API). This is a
   * rough process-level number, not a per-model accounting.
   */
  peakRssMb: number | null;
  /** Present when transcription failed. Never includes audio or transcripts. */
  error: { code: string; detail?: string } | null;
};

/**
 * A swappable transcription backend. Every candidate receives the same audio
 * bytes and returns a comparable result, so the harness — not each model —
 * owns normalization, alignment, and scoring.
 */
export type AsrAdapter = {
  id: string;
  displayName: string;
  /** HF repo / API identifier, e.g. "tarteel-ai/whisper-base-ar-quran". */
  modelRef: string;
  /** Verified SPDX license string. Adapters with other licenses are refused. */
  license: string;
  /**
   * Whether this adapter can run right now (API key present, python deps
   * installed, model cached, …). The runner skips unavailable adapters with
   * a recorded reason instead of failing the whole bake-off.
   */
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
  transcribe(audio: Buffer, mimeType: string): Promise<AdapterTranscribeResult>;
};

/** What the learner was asked to do in a corpus sample. */
export type ExpectedResult =
  | "correct"
  | "omission"
  | "substitution"
  | "repetition"
  | "hesitation"
  | "other";

/** One row of the corpus manifest. Audio lives in corpus/audio/<audio>. */
export type SampleManifestEntry = {
  id: string;
  surah: number;
  ayah: number;
  /** Canonical expected Arabic (Uthmani spelling as the app stores it). */
  canonicalArabic: string;
  expectedResult: ExpectedResult;
  intendedError?: {
    /** 1-based word index in the canonical ayah. */
    wordIndex: number;
    kind: "omitted" | "substituted" | "repeated";
  };
  speaker?: string;
  device?: string;
  notes?: string;
  /** Filename under corpus/audio/. Never committed unless intentionally public. */
  audio: string;
};

export type CorpusManifest = {
  version: 1;
  samples: SampleManifestEntry[];
};

/** Per-recording evaluation — the 13 capture points from the bake-off brief. */
export type PerRecordingResult = {
  sampleId: string;
  adapterId: string;
  skipped: boolean;
  skipReason: string | null;
  /** 1. Did the recognizer produce Arabic script at all? */
  producedArabic: boolean;
  /** 2. Raw transcript (kept in the JSON artifact, never in logs). */
  rawTranscript: string | null;
  /** 3. Transcript after the app's own alignment normalization. */
  normalizedTokens: string[];
  /** 4. Expected canonical tokens, same normalization. */
  expectedTokens: string[];
  /** 5–8. Word-level alignment outcome from the production engine. */
  alignment: {
    matched: number;
    total: number;
    score: number;
    missingWordIndexes: number[];
    extraCount: number;
    reviewCount: number;
  } | null;
  /** 9. Null unless the sample is a correct recitation. */
  falseCorrectionOnCorrect: boolean | null;
  /** 10. Null unless the sample is a labelled omission. */
  omissionDetected: boolean | null;
  /** 10b. Null unless the sample is a labelled substitution. */
  substitutionDetected: boolean | null;
  /** 11. Wall-clock latency of the transcribe call. */
  latencyMs: number | null;
  /** 12. Approximate peak RSS delta in MB, where measurable. */
  peakRssMb: number | null;
  /** 13. Adapter/runtime failure code, if any. */
  adapterError: string | null;
};

/** Aggregate metrics per adapter. WER/CER are secondary; the false-correction
 * rate on correct recitations is the primary product decision metric. */
export type AdapterAggregateMetrics = {
  adapterId: string;
  displayName: string;
  totalSamples: number;
  skippedSamples: number;
  evaluatedSamples: number;
  /** % of evaluated recordings that produced Arabic script. */
  arabicOutputRate: number | null;
  /** % where normalized transcript exactly equals normalized canonical text. */
  exactWordMatchRate: number | null;
  /**
   * PRIMARY METRIC. % of *correct* recitations where the production alignment
   * would have produced at least one correction (missing/review/extra).
   * Lower is better; this is "how often would this ASR cause the tutor to
   * falsely correct a learner who recited correctly".
   */
  falseCorrectionRateOnCorrect: number | null;
  /** Labelled omissions where the intended word came back "missing". */
  omissionTruePositiveRate: number | null;
  /** % of correct recitations with at least one word marked "missing". */
  omissionFalsePositiveRate: number | null;
  /** Labelled substitutions surfaced as "review" at the intended index. */
  substitutionDetectionRate: number | null;
  /** Labelled repetitions surfaced as extra words without corrupting matches. */
  repetitionHandledRate: number | null;
  /** % of evaluated recordings with null/empty/non-Arabic output. */
  emptyGarbageRate: number | null;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  /** Secondary only. Null when no reference transcripts are comparable. */
  meanWer: number | null;
  meanCer: number | null;
};

export type BakeoffReport = {
  generatedAt: string;
  corpusDir: string;
  adapters: string[];
  perRecording: PerRecordingResult[];
  aggregates: AdapterAggregateMetrics[];
  notes: string[];
};
