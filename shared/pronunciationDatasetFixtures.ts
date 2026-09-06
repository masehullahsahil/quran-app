/**
 * Synthetic samples, for tests and for the labeling prototype.
 *
 * **No real learner audio exists in this repository and none may be added.**
 * Every sample below is invented: the speaker ids are placeholders, the storage
 * keys point nowhere, the consent records do not exist, and there is no audio
 * file behind any of them. They exist so the schema can be exercised and the
 * review prototype can be opened without a dataset — not as data.
 *
 * The expected Quran text on each fixture is a short, well-known ayah taken from
 * the same source the app's curriculum uses. It is the anchor labels attach to,
 * and tests assert that labeling never rewrites it.
 */
import type {
  Adjudication,
  LabeledSample,
  LabelObservation,
  RecordingSample,
  TeacherReview,
  TeacherReviewer,
} from "./pronunciationDataset";

/** A reviewer identity that is obviously not a real person. */
export const FIXTURE_REVIEWERS: Record<"first" | "second" | "adjudicator", TeacherReviewer> = {
  first: { reviewerId: "reviewer-fixture-1", qualification: "Fixture reviewer — not a real qualification", riwayah: "Hafs" },
  second: { reviewerId: "reviewer-fixture-2", qualification: "Fixture reviewer — not a real qualification", riwayah: "Hafs" },
  adjudicator: {
    reviewerId: "reviewer-fixture-3",
    qualification: "Fixture adjudicator — not a real qualification",
    riwayah: "Hafs",
  },
};

function sample(overrides: Partial<RecordingSample> & Pick<RecordingSample, "sampleId" | "surah" | "ayah" | "expectedText">): RecordingSample {
  return {
    speakerAnonymizedId: "speaker-fixture-001",
    sessionId: "session-fixture-001",
    recordingFamilyId: `${overrides.sampleId}-family`,
    audioRef: { storageKey: `fixture://no-audio/${overrides.sampleId}`, mimeType: "audio/webm" },
    device: {
      deviceClass: "phone",
      deviceFamily: "android-midrange",
      microphone: "built-in",
      sampleRateHz: 16000,
      channels: 1,
      codec: "opus",
      durationMs: 4200,
      environment: "quiet-room",
    },
    consent: {
      consentRecordId: "consent-fixture-000",
      obtainedAt: "2026-01-01",
      permittedUses: ["teacher-review", "training", "evaluation"],
      retainUntil: "2027-01-01",
      withdrawalRoute: "Fixture only — no consent system exists yet and no audio was collected.",
    },
    quality: "clean",
    usability: { training: true, evaluation: false },
    capturedAt: "2026-01-02T10:00:00.000Z",
    ...overrides,
  };
}

/** Al-Ikhlas 112:1, the shortest ayah the curriculum already opens for practice. */
export const FIXTURE_SAMPLE_IKHLAS: RecordingSample = sample({
  sampleId: "sample-fixture-ikhlas-1",
  surah: 112,
  ayah: 1,
  expectedText: "قُلْ هُوَ اللَّهُ أَحَدٌ",
});

/** A second sitting by the same speaker, for leakage tests. */
export const FIXTURE_SAMPLE_IKHLAS_RETAKE: RecordingSample = sample({
  sampleId: "sample-fixture-ikhlas-1-retake",
  surah: 112,
  ayah: 1,
  expectedText: "قُلْ هُوَ اللَّهُ أَحَدٌ",
  recordingFamilyId: "sample-fixture-ikhlas-1-family",
  usability: { training: true, evaluation: false },
});

/** A different speaker, for the evaluation side of a split. */
export const FIXTURE_SAMPLE_FATIHA: RecordingSample = sample({
  sampleId: "sample-fixture-fatiha-2",
  surah: 1,
  ayah: 2,
  expectedText: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
  speakerAnonymizedId: "speaker-fixture-002",
  sessionId: "session-fixture-002",
  recordingFamilyId: "sample-fixture-fatiha-2-family",
  device: {
    deviceClass: "laptop",
    microphone: "external",
    sampleRateHz: 48000,
    channels: 1,
    codec: "pcm",
    durationMs: 6100,
    environment: "office",
  },
  consent: {
    consentRecordId: "consent-fixture-001",
    obtainedAt: "2026-01-01",
    permittedUses: ["teacher-review", "evaluation", "benchmark"],
    retainUntil: "2027-01-01",
    withdrawalRoute: "Fixture only — no consent system exists yet and no audio was collected.",
  },
  usability: { training: false, evaluation: true, reason: "Held out for evaluation." },
});

const observation = (over: Partial<LabelObservation> & Pick<LabelObservation, "id" | "label" | "location">): LabelObservation => ({
  severity: "meaningful",
  confidence: "confident",
  ...over,
});

/** Two reviewers who agree: a straightforward word omission. */
export const FIXTURE_REVIEW_AGREEING_A: TeacherReview = {
  reviewId: "review-fixture-a1",
  sampleId: FIXTURE_SAMPLE_IKHLAS.sampleId,
  reviewer: FIXTURE_REVIEWERS.first,
  reviewedAt: "2026-01-05T09:00:00.000Z",
  overallLabel: "word-omission",
  observations: [
    observation({
      id: "obs-a1",
      label: "word-omission",
      location: { scope: "word", surah: 112, ayah: 1, wordIndex: 2, timeRange: { startMs: 900, endMs: 1500 } },
    }),
  ],
  correction: { heardText: "قُلْ اللَّهُ أَحَدٌ", guidance: "The second word was not recited; repeat from it." },
  quality: "clean",
  uncertain: false,
};

export const FIXTURE_REVIEW_AGREEING_B: TeacherReview = {
  ...FIXTURE_REVIEW_AGREEING_A,
  reviewId: "review-fixture-a2",
  reviewer: FIXTURE_REVIEWERS.second,
  reviewedAt: "2026-01-05T11:30:00.000Z",
  observations: [
    observation({
      id: "obs-a2",
      label: "word-omission",
      location: { scope: "word", surah: 112, ayah: 1, wordIndex: 2, timeRange: { startMs: 880, endMs: 1520 } },
    }),
  ],
};

/** Two reviewers who disagree about the same word — the adjudication case. */
export const FIXTURE_REVIEW_DISAGREEING_A: TeacherReview = {
  reviewId: "review-fixture-d1",
  sampleId: FIXTURE_SAMPLE_FATIHA.sampleId,
  reviewer: FIXTURE_REVIEWERS.first,
  reviewedAt: "2026-01-06T09:00:00.000Z",
  overallLabel: "madd-duration-issue",
  observations: [
    observation({
      id: "obs-d1",
      label: "madd-duration-issue",
      location: { scope: "word", surah: 1, ayah: 2, wordIndex: 4, timeRange: { startMs: 3200, endMs: 4300 } },
      rule: "madd tabee'i",
      note: "Heard shorter than two counts.",
    }),
  ],
  quality: "minor_noise",
  uncertain: false,
};

export const FIXTURE_REVIEW_DISAGREEING_B: TeacherReview = {
  reviewId: "review-fixture-d2",
  sampleId: FIXTURE_SAMPLE_FATIHA.sampleId,
  reviewer: FIXTURE_REVIEWERS.second,
  reviewedAt: "2026-01-06T14:00:00.000Z",
  overallLabel: "correct-recitation",
  observations: [],
  quality: "minor_noise",
  uncertain: false,
};

/** A reviewer who could not tell. Uncertainty is an outcome, not a gap. */
export const FIXTURE_REVIEW_UNCERTAIN: TeacherReview = {
  reviewId: "review-fixture-u1",
  sampleId: FIXTURE_SAMPLE_IKHLAS_RETAKE.sampleId,
  reviewer: FIXTURE_REVIEWERS.first,
  reviewedAt: "2026-01-07T09:00:00.000Z",
  overallLabel: "uncertain-cannot-classify",
  observations: [
    observation({
      id: "obs-u1",
      label: "audio-quality-insufficient",
      location: { scope: "recording", timeRange: { startMs: 0, endMs: 4200 } },
      severity: "informational",
      confidence: "confident",
      note: "Background noise covers the second half.",
    }),
  ],
  quality: "noisy",
  uncertain: true,
};

/** How the disagreement above is resolved: by a named adjudicator, with reasons. */
export const FIXTURE_ADJUDICATION: Adjudication = {
  sampleId: FIXTURE_SAMPLE_FATIHA.sampleId,
  adjudicator: FIXTURE_REVIEWERS.adjudicator,
  adjudicatedAt: "2026-01-08T09:00:00.000Z",
  consideredReviewIds: [FIXTURE_REVIEW_DISAGREEING_A.reviewId, FIXTURE_REVIEW_DISAGREEING_B.reviewId],
  overallLabel: "uncertain-cannot-classify",
  observations: [
    observation({
      id: "obs-adj-1",
      label: "uncertain-cannot-classify",
      location: { scope: "word", surah: 1, ayah: 2, wordIndex: 4, timeRange: { startMs: 3200, endMs: 4300 } },
      severity: "informational",
      confidence: "uncertain",
      note: "Fixture rationale: reviewers heard the madd differently and the recording is not clean enough to settle it.",
    }),
  ],
  rationale:
    "Fixture text only. The two reviewers differ on the madd and the recording carries noise across that word; the sample is recorded as uncertain rather than resolved in either direction.",
};

/**
 * Machine output, kept beside the teacher layers so tests can prove the two
 * never mix. The prediction is deliberately wrong about the sample the teachers
 * called uncertain — which is exactly the case a benchmark exists to catch.
 */
export const FIXTURE_MACHINE_LAYERS: LabeledSample["machine"] = {
  transcript: {
    provider: "fixture-asr",
    producedAt: "2026-01-04T09:00:00.000Z",
    text: "قل الله احد",
    confidence: 0.62,
  },
  alignment: {
    provider: "fixture-aligner",
    producedAt: "2026-01-04T09:00:01.000Z",
    alignment: {
      expectedWords: [
        { expected: "قُلْ", heard: "قل", status: "matched", wordIndex: 1 },
        { expected: "هُوَ", heard: null, status: "missing", wordIndex: 2 },
        { expected: "اللَّهُ", heard: "الله", status: "matched", wordIndex: 3 },
        { expected: "أَحَدٌ", heard: "احد", status: "matched", wordIndex: 4 },
      ],
      extraWords: [],
      matchedCount: 3,
      totalWords: 4,
      score: 75,
    },
    wordTimings: [
      { wordIndex: 1, startMs: 200, endMs: 880, confidence: 0.7 },
      { wordIndex: 2, startMs: 900, endMs: 1500, confidence: 0.3 },
      { wordIndex: 3, startMs: 1520, endMs: 2600, confidence: 0.8 },
      { wordIndex: 4, startMs: 2620, endMs: 4100, confidence: 0.75 },
    ],
  },
  prediction: {
    provider: "fixture-model",
    modelVersion: "0.0.0-fixture",
    producedAt: "2026-01-04T09:00:02.000Z",
    abstained: false,
    confidence: 0.55,
    observations: [
      observation({
        id: "pred-1",
        label: "word-omission",
        location: { scope: "word", surah: 112, ayah: 1, wordIndex: 2, timeRange: { startMs: 900, endMs: 1500 } },
        confidence: "probable",
      }),
    ],
  },
};

/** A sample nobody has reviewed: machine output only. */
export const FIXTURE_UNREVIEWED: LabeledSample = {
  sample: FIXTURE_SAMPLE_IKHLAS,
  machine: FIXTURE_MACHINE_LAYERS,
  reviews: [],
  adjudication: null,
};

/** Two reviewers, in agreement. */
export const FIXTURE_AGREED: LabeledSample = {
  sample: FIXTURE_SAMPLE_IKHLAS,
  machine: FIXTURE_MACHINE_LAYERS,
  reviews: [FIXTURE_REVIEW_AGREEING_A, FIXTURE_REVIEW_AGREEING_B],
  adjudication: null,
};

/** Two reviewers who differ, awaiting adjudication. */
export const FIXTURE_DISPUTED: LabeledSample = {
  sample: FIXTURE_SAMPLE_FATIHA,
  machine: {},
  reviews: [FIXTURE_REVIEW_DISAGREEING_A, FIXTURE_REVIEW_DISAGREEING_B],
  adjudication: null,
};

/** The same disagreement, resolved. */
export const FIXTURE_ADJUDICATED: LabeledSample = {
  ...FIXTURE_DISPUTED,
  adjudication: FIXTURE_ADJUDICATION,
};

/** One reviewer, who could not reach a judgement. */
export const FIXTURE_UNCERTAIN: LabeledSample = {
  sample: FIXTURE_SAMPLE_IKHLAS_RETAKE,
  machine: {},
  reviews: [FIXTURE_REVIEW_UNCERTAIN],
  adjudication: null,
};

/** Every fixture, for the prototype's sample list. */
export const FIXTURE_SAMPLES: LabeledSample[] = [
  FIXTURE_UNREVIEWED,
  FIXTURE_AGREED,
  FIXTURE_DISPUTED,
  FIXTURE_ADJUDICATED,
  FIXTURE_UNCERTAIN,
];

/** Shown wherever the prototype displays fixture data, so it is never mistaken for a dataset. */
export const FIXTURE_NOTICE =
  "Synthetic fixtures. No recording exists behind any of these samples, no consent record is real, and no learner audio is stored in this repository.";
