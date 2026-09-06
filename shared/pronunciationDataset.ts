/**
 * The recording, labeling and ground-truth model for a future Quran
 * pronunciation dataset.
 *
 * This module defines *what a qualified teacher must label* so that pronunciation
 * evaluation could one day be trained and measured honestly. It trains nothing,
 * evaluates nothing, and makes no claim about pronunciation accuracy. The
 * existing acoustic evaluator, its confidence gate and the live correction path
 * are untouched by it — see docs/pronunciation-dataset-spec.md.
 *
 * Four rules shape the design, and each is asserted by a test:
 *
 *  1. **Machine output is never ground truth.** A transcript, an alignment and a
 *     model prediction are three separate layers, all of them distinct from what
 *     a teacher said. `groundTruthFor` reads teacher layers only, and no function
 *     here can write a machine value into a teacher field.
 *  2. **Uncertainty survives.** `uncertain-cannot-classify` and
 *     `audio-quality-insufficient` are first-class outcomes. Nothing collapses
 *     them into "correct", and a sample whose reviewers were unsure stays
 *     unsure.
 *  3. **Disagreement is not merged.** Independent reviews are stored side by
 *     side. A disagreement becomes ground truth only through an adjudication
 *     recorded by a named, qualified adjudicator with a written rationale.
 *  4. **The Quran text is immutable.** `expectedText` on a sample is the ayah as
 *     the app's Quran data gives it. Labeling copies it and never rewrites it; a
 *     teacher correction records what was *recited*, never a new scripture text.
 *
 * The label taxonomy below is a **proposal**. It was assembled from the app's
 * existing vocabulary and standard tajwid terminology by a software team, and it
 * is neither religiously authoritative nor known to be complete. Every category
 * carries `requiresQualifiedTeacher`, and the taxonomy as a whole carries
 * `TAXONOMY_STATUS` — which no code may treat as approved.
 */
import type { TranscriptAlignment } from "./verseFollowing";

// ---------------------------------------------------------------------------
// Provenance of the taxonomy itself
// ---------------------------------------------------------------------------

/**
 * The state of this taxonomy, as a value rather than a comment, so that any
 * surface using it has to render the caveat rather than assume approval.
 */
export const TAXONOMY_STATUS = "proposed-pending-qualified-teacher-approval" as const;

export type TaxonomyStatus = typeof TAXONOMY_STATUS;

/**
 * Said plainly, because it is the single most important sentence in this file:
 * these categories are a starting point for a qualified Qari to correct, not a
 * complete description of what can be right or wrong in recitation.
 */
export const TAXONOMY_COMPLETENESS_NOTE =
  "This label set is not religiously complete. It was drafted by a software team from standard tajwid terminology and must be reviewed, corrected and extended by qualified Quran teachers before any of it is used to train or evaluate a model.";

// ---------------------------------------------------------------------------
// Label taxonomy
// ---------------------------------------------------------------------------

export const PRONUNCIATION_LABELS = [
  // -- Whole-attempt outcome ------------------------------------------------
  "correct-recitation",
  // -- Word-level recitation accuracy (visible in a transcript alignment) ----
  "word-substitution",
  "word-omission",
  "word-insertion",
  "repeated-word",
  "wrong-ayah-or-position",
  // -- Vowelling and gemination --------------------------------------------
  "harakah-vowel-error",
  "sukoon-error",
  "shaddah-error",
  // -- Tajwid rules that depend on hearing ---------------------------------
  "madd-duration-issue",
  "ghunnah-issue",
  "qalqalah-issue",
  "tajweed-rule-issue",
  // -- Articulation and letter-level production ----------------------------
  "makhraj-articulation-issue",
  "letter-substitution",
  "letter-deletion",
  "letter-insertion",
  // -- Stopping and starting ------------------------------------------------
  "waqf-stop-issue",
  "ibtida-start-issue",
  // -- Outcomes that are not errors ----------------------------------------
  "uncertain-cannot-classify",
  "audio-quality-insufficient",
] as const;

export type PronunciationLabel = (typeof PRONUNCIATION_LABELS)[number];

/** Where a label may be attached. See `LabelLocation`. */
export const LABEL_SCOPES = ["recording", "ayah", "word", "letter", "time-range"] as const;

export type LabelScope = (typeof LABEL_SCOPES)[number];

/**
 * How a label groups for reporting, and — more importantly — how much of it a
 * transcript could ever support.
 *
 * `text-observable` labels are the ones a word alignment can *evidence*, which
 * is why the app already surfaces them. `heard-only` labels cannot be read off
 * a transcript at all: they need a teacher's ear, and they are exactly the
 * labels a future model would have to earn the right to predict.
 */
export const LABEL_FAMILIES = ["outcome", "text-observable", "heard-only", "meta"] as const;

export type LabelFamily = (typeof LABEL_FAMILIES)[number];

export type LabelDefinition = {
  id: PronunciationLabel;
  title: string;
  /** What the teacher is asserting when they choose it. */
  summary: string;
  family: LabelFamily;
  /** Scopes this label may legitimately attach to. */
  scopes: readonly LabelScope[];
  /**
   * True where the judgement is religious or phonetic rather than clerical.
   * Only a qualified teacher may apply these, and no automated process may
   * assert them as ground truth. Kept as data because the review interface has
   * to show it and the tests have to check it.
   */
  requiresQualifiedTeacher: boolean;
  /** What a reviewer should record alongside the label, where it applies. */
  expectedEvidence?: string;
  /** Open questions a Qari has to settle before this category is used. */
  openQuestion?: string;
};

const ALL_SCOPES = LABEL_SCOPES;

export const LABEL_DEFINITIONS: Record<PronunciationLabel, LabelDefinition> = {
  "correct-recitation": {
    id: "correct-recitation",
    title: "Correct recitation",
    summary:
      "Within the reviewed scope, the reviewer heard no error they are qualified to name. It is not a statement that the recitation was excellent, nor that no error exists outside the scope reviewed.",
    family: "outcome",
    scopes: ["recording", "ayah", "word"],
    requiresQualifiedTeacher: true,
    openQuestion:
      "Does 'correct' at word scope need a minimum standard (e.g. tajwid-correct vs merely intelligible), and should the two be separate labels?",
  },
  "word-substitution": {
    id: "word-substitution",
    title: "Word substitution",
    summary: "A different word was recited in place of the expected word.",
    family: "text-observable",
    scopes: ["word", "time-range"],
    requiresQualifiedTeacher: false,
    expectedEvidence: "The word actually recited, in the teacher's correction field.",
  },
  "word-omission": {
    id: "word-omission",
    title: "Word omission",
    summary: "An expected word was not recited.",
    family: "text-observable",
    scopes: ["word", "time-range"],
    requiresQualifiedTeacher: false,
  },
  "word-insertion": {
    id: "word-insertion",
    title: "Word insertion",
    summary: "A word not in the ayah was recited.",
    family: "text-observable",
    scopes: ["word", "time-range"],
    requiresQualifiedTeacher: false,
    expectedEvidence: "The inserted word, and where it fell relative to the expected words.",
  },
  "repeated-word": {
    id: "repeated-word",
    title: "Repeated word",
    summary:
      "A word was recited more than once. Repetition is often deliberate self-correction rather than an error, and the reviewer should say which.",
    family: "text-observable",
    scopes: ["word", "time-range"],
    requiresQualifiedTeacher: false,
    openQuestion:
      "Should deliberate self-correction be labelled at all, or recorded as a separate non-error observation?",
  },
  "wrong-ayah-or-position": {
    id: "wrong-ayah-or-position",
    title: "Wrong ayah or position",
    summary: "The recitation belongs to a different ayah, or resumes at a different position than expected.",
    family: "text-observable",
    scopes: ["recording", "ayah", "time-range"],
    requiresQualifiedTeacher: false,
  },
  "harakah-vowel-error": {
    id: "harakah-vowel-error",
    title: "Harakah / short-vowel error",
    summary: "A short vowel was read differently from the mushaf's vowelling (fatha, kasra, damma, tanween).",
    family: "heard-only",
    scopes: ["word", "letter", "time-range"],
    requiresQualifiedTeacher: true,
    expectedEvidence: "Expected and heard vowel on the identified letter.",
  },
  "sukoon-error": {
    id: "sukoon-error",
    title: "Sukoon error",
    summary: "A letter marked sakin was given a vowel, or a vowelled letter was read sakin.",
    family: "heard-only",
    scopes: ["word", "letter", "time-range"],
    requiresQualifiedTeacher: true,
  },
  "shaddah-error": {
    id: "shaddah-error",
    title: "Shaddah error",
    summary: "A doubled letter was not held, or a letter was doubled where the mushaf does not double it.",
    family: "heard-only",
    scopes: ["word", "letter", "time-range"],
    requiresQualifiedTeacher: true,
  },
  "madd-duration-issue": {
    id: "madd-duration-issue",
    title: "Madd duration issue",
    summary: "A required lengthening was materially shortened or over-lengthened.",
    family: "heard-only",
    scopes: ["word", "letter", "time-range"],
    requiresQualifiedTeacher: true,
    expectedEvidence: "The madd type, and the duration heard against the duration expected in the reviewer's riwayah.",
    openQuestion:
      "Counts differ between schools and reciters. Which riwayah and which tolerance define 'materially' for this dataset?",
  },
  "ghunnah-issue": {
    id: "ghunnah-issue",
    title: "Ghunnah issue",
    summary: "Nasalisation was absent, excessive, or applied where it does not belong.",
    family: "heard-only",
    scopes: ["word", "letter", "time-range"],
    requiresQualifiedTeacher: true,
    expectedEvidence: "The context (noon/meem sakinah, shaddah, ikhfa) the reviewer judged it under.",
  },
  "qalqalah-issue": {
    id: "qalqalah-issue",
    title: "Qalqalah issue",
    summary: "Qalqalah was missing, excessive, or applied to a letter or position that does not take it.",
    family: "heard-only",
    scopes: ["word", "letter", "time-range"],
    requiresQualifiedTeacher: true,
    expectedEvidence: "The qalqalah letter and whether the position was a stop or a continuation.",
  },
  "tajweed-rule-issue": {
    id: "tajweed-rule-issue",
    title: "Other tajweed-rule issue",
    summary:
      "A rule of recitation not covered by the more specific labels was applied incorrectly. The reviewer names the rule.",
    family: "heard-only",
    scopes: ["word", "letter", "time-range", "ayah"],
    requiresQualifiedTeacher: true,
    expectedEvidence: "The name of the rule, in the reviewer's own terminology.",
    openQuestion:
      "Which rules deserve their own label rather than falling here? The list of specific labels above is a guess and needs a Qari's ordering.",
  },
  "makhraj-articulation-issue": {
    id: "makhraj-articulation-issue",
    title: "Makhraj / articulation issue",
    summary:
      "A letter was produced from the wrong place or with the wrong manner, without becoming a different letter outright.",
    family: "heard-only",
    scopes: ["letter", "word", "time-range"],
    requiresQualifiedTeacher: true,
    expectedEvidence: "The letter, and how the articulation differed.",
    openQuestion:
      "Where is the boundary between an imprecise makhraj and an outright letter substitution? Two teachers may split the same audio differently.",
  },
  "letter-substitution": {
    id: "letter-substitution",
    title: "Letter substitution",
    summary: "One letter was produced in place of another (for example ق read as ك).",
    family: "heard-only",
    scopes: ["letter", "word", "time-range"],
    requiresQualifiedTeacher: true,
    expectedEvidence: "Expected and heard letter; a confusion-pair id where one applies.",
  },
  "letter-deletion": {
    id: "letter-deletion",
    title: "Letter deletion",
    summary: "A letter of the expected word was not produced.",
    family: "heard-only",
    scopes: ["letter", "word", "time-range"],
    requiresQualifiedTeacher: true,
  },
  "letter-insertion": {
    id: "letter-insertion",
    title: "Letter insertion",
    summary: "A letter not in the expected word was produced.",
    family: "heard-only",
    scopes: ["letter", "word", "time-range"],
    requiresQualifiedTeacher: true,
  },
  "waqf-stop-issue": {
    id: "waqf-stop-issue",
    title: "Waqf / stop issue",
    summary: "A stop was taken where it should not be, omitted where it should be, or taken incorrectly.",
    family: "heard-only",
    scopes: ["word", "time-range", "ayah"],
    requiresQualifiedTeacher: true,
    expectedEvidence: "The waqf sign or context the reviewer judged against.",
    openQuestion: "Which stops count as errors rather than permissible choices, and under whose ruling?",
  },
  "ibtida-start-issue": {
    id: "ibtida-start-issue",
    title: "Start / ibtida issue",
    summary: "The restart after a stop began at a place or in a manner that is not sound.",
    family: "heard-only",
    scopes: ["word", "time-range", "ayah"],
    requiresQualifiedTeacher: true,
  },
  "uncertain-cannot-classify": {
    id: "uncertain-cannot-classify",
    title: "Uncertain — cannot classify",
    summary:
      "The reviewer heard something but cannot confidently name it, or cannot decide between categories. A first-class outcome: it is never scored as correct and never as an error.",
    family: "meta",
    scopes: ALL_SCOPES,
    requiresQualifiedTeacher: false,
  },
  "audio-quality-insufficient": {
    id: "audio-quality-insufficient",
    title: "Audio quality insufficient",
    summary:
      "The recording cannot support a judgement at this scope — noise, clipping, distance, overlap or truncation. A statement about the recording, not about the reciter.",
    family: "meta",
    scopes: ALL_SCOPES,
    requiresQualifiedTeacher: false,
  },
};

/** Labels that only a qualified teacher may assert. */
export const TEACHER_ONLY_LABELS: PronunciationLabel[] = PRONUNCIATION_LABELS.filter(
  (label) => LABEL_DEFINITIONS[label].requiresQualifiedTeacher,
);

/** Labels that mean "no judgement was reached", which must survive every merge. */
export const UNCERTAIN_LABELS = ["uncertain-cannot-classify", "audio-quality-insufficient"] as const;

export type UncertainLabel = (typeof UNCERTAIN_LABELS)[number];

export function isUncertainLabel(label: PronunciationLabel): label is UncertainLabel {
  return (UNCERTAIN_LABELS as readonly PronunciationLabel[]).includes(label);
}

// ---------------------------------------------------------------------------
// Severity — proposed, and gated
// ---------------------------------------------------------------------------

/**
 * How much an observation should matter to a learner.
 *
 * This ordering is a proposal from a software team. It decides, eventually, what
 * the app interrupts a learner for — which makes it a teaching decision, not an
 * engineering one. `SEVERITY_STATUS` says so, and
 * `mayDriveLearnerFacingCorrection` refuses to let it drive behaviour until a
 * qualified teacher has approved it.
 */
export const SEVERITY_LEVELS = ["informational", "minor", "meaningful", "blocking-correction"] as const;

export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

export const SEVERITY_DEFINITIONS: Record<SeverityLevel, string> = {
  informational: "Worth recording for research; a learner would not be told.",
  minor: "A small imprecision. Mentioned only in review, never mid-recitation.",
  meaningful: "A learner should be told and should repeat the word.",
  "blocking-correction":
    "The recitation should not be continued past this without correction — proposed for errors that change the words of the Quran or make a word unrecognisable.",
};

export const SEVERITY_STATUS = "proposed-pending-qualified-teacher-approval" as const;

/**
 * The approval a severity taxonomy needs before it may shape what a learner is
 * told. Recorded the same way the curriculum audit records approvals: a named
 * person, their qualification, a date, and their own words.
 */
export type TaxonomyApproval = {
  approvedBy: string;
  qualification: string;
  approvedAt: string;
  attestation: string;
  /** Which taxonomy this approval covers. */
  taxonomy: "labels" | "severity";
};

/**
 * Whether the severity taxonomy may be used to decide learner-facing correction
 * behaviour. False until a qualified teacher has approved it; there is
 * deliberately no way to pass this by configuration.
 */
export function mayDriveLearnerFacingCorrection(approvals: readonly TaxonomyApproval[] = []): boolean {
  return approvals.some(
    (approval) =>
      approval.taxonomy === "severity" &&
      approval.approvedBy.trim().length > 0 &&
      approval.qualification.trim().length > 0 &&
      approval.attestation.trim().length > 0 &&
      approval.approvedAt.trim().length > 0,
  );
}

// ---------------------------------------------------------------------------
// Where an observation sits
// ---------------------------------------------------------------------------

/** A span of the recording, in milliseconds from the start of the audio. */
export type TimeRange = {
  startMs: number;
  endMs: number;
};

/**
 * The place an observation is attached to.
 *
 * Coarser scopes are legitimate answers, not fallbacks: "somewhere in this word"
 * is what a teacher can honestly say more often than "this phoneme". Any scope
 * may additionally carry a `timeRange`, so a word-scope observation can still
 * point at the exact audio.
 */
export type LabelLocation =
  | { scope: "recording"; timeRange?: TimeRange }
  | { scope: "ayah"; surah: number; ayah: number; timeRange?: TimeRange }
  | { scope: "word"; surah: number; ayah: number; wordIndex: number; timeRange?: TimeRange }
  | {
      scope: "letter";
      surah: number;
      ayah: number;
      wordIndex: number;
      /** 1-based index of the letter within the expected word. */
      letterIndex: number;
      /** The expected grapheme at that index, copied for review display. */
      grapheme?: string;
      timeRange?: TimeRange;
    }
  | { scope: "time-range"; timeRange: TimeRange };

/** How sure the reviewer is of this particular observation. */
export const OBSERVATION_CONFIDENCE = ["confident", "probable", "uncertain"] as const;

export type ObservationConfidence = (typeof OBSERVATION_CONFIDENCE)[number];

/**
 * One thing a reviewer noticed, in one place.
 *
 * Several observations may share a location: a single word can carry a madd
 * issue and a makhraj issue at once, and forcing a reviewer to pick one would
 * lose the second. Ids are unique per review, not globally.
 */
export type LabelObservation = {
  id: string;
  label: PronunciationLabel;
  location: LabelLocation;
  severity: SeverityLevel;
  confidence: ObservationConfidence;
  /** The letter or word expected here, where the label names one. */
  expected?: string;
  /** What the reviewer heard instead. Never written into the Quran text. */
  heard?: string;
  /** Confusion pair id from shared/quranAcoustic.ts, where one applies. */
  confusionPairId?: string;
  /** The tajwid rule the reviewer judged against, in their own terminology. */
  rule?: string;
  /** Free text from the reviewer. Kept separate from learner-facing guidance. */
  note?: string;
};

// ---------------------------------------------------------------------------
// The recording sample
// ---------------------------------------------------------------------------

/** Controlled vocabulary for how usable a recording is, as heard. */
export const RECORDING_QUALITY = ["clean", "minor_noise", "noisy", "clipped", "truncated", "unusable"] as const;

export type RecordingQuality = (typeof RECORDING_QUALITY)[number];

/**
 * Device and capture facts, kept deliberately coarse.
 *
 * Everything here describes the *recording*, not the person: no serial numbers,
 * no advertising identifiers, no IP addresses, no precise location. Device
 * diversity matters for a dataset that must work on a cheap phone in a noisy
 * room, and this is the least identifying way to record it.
 */
export type DeviceMetadata = {
  /** "phone" | "tablet" | "laptop" | "headset" | "studio" | "unknown". */
  deviceClass: string;
  /** Coarse model family at most, e.g. "android-midrange". Never a serial. */
  deviceFamily?: string;
  microphone?: "built-in" | "wired-headset" | "bluetooth" | "external" | "unknown";
  sampleRateHz: number;
  channels: number;
  codec: string;
  durationMs: number;
  /** Coarse capture setting, for acoustic diversity: "quiet-room", "outdoors"… */
  environment?: string;
};

/**
 * Research attributes about the reciter.
 *
 * Speaker background genuinely matters for a dataset that must serve learners
 * whose first language is not Arabic — and it is also the most sensitive thing
 * here. Each attribute therefore carries the reason it was collected and the
 * consent scope it was collected under; there is no way to record one without
 * saying why. Anything not needed for a stated research question is not
 * collected at all.
 */
export type ResearchAttribute<T> = {
  value: T;
  /** The research question this attribute answers. Required. */
  justification: string;
  /** The consent scope under which it was given. Required. */
  consentScope: string;
};

export type ReciterResearchMetadata = {
  /** Coarse band, never a date of birth. */
  ageBand?: ResearchAttribute<string>;
  /** Language background, where a study needs it. */
  firstLanguage?: ResearchAttribute<string>;
  /** Self-declared level: "beginner" | "intermediate" | "advanced" | "qari". */
  recitationExperience?: ResearchAttribute<string>;
  /** Whether the reciter has studied tajwid formally. */
  tajweedTraining?: ResearchAttribute<boolean>;
};

/**
 * Consent, as a pointer rather than a copy.
 *
 * The consent record itself lives in the consent system — which does not exist
 * yet, and until it does no learner audio may be collected at all. What a sample
 * carries is the id of that record, what it permits, and when the recording must
 * be deleted.
 */
export type ConsentReference = {
  consentRecordId: string;
  obtainedAt: string;
  /** What the reciter agreed their recording may be used for. */
  permittedUses: readonly ("training" | "evaluation" | "benchmark" | "teacher-review")[];
  /** When the recording must be deleted unless consent is renewed. */
  retainUntil: string;
  /** How the reciter can withdraw, in one line, for the record. */
  withdrawalRoute: string;
};

/**
 * One recitation recording, as the dataset describes it.
 *
 * `expectedText` is the ayah from the app's Quran data. It is the anchor for
 * every label and is never edited by labeling: `withReview` and friends copy the
 * sample and leave it byte-identical, and a test asserts that.
 */
export type RecordingSample = {
  sampleId: string;
  /** Privacy-safe reciter id, e.g. "speaker-0007". Never a name or an account id. */
  speakerAnonymizedId: string;
  /**
   * The sitting this recording came from. Two recordings sharing a session share
   * a microphone, a room and a voice on one day — which is why splits are
   * assigned by session and speaker rather than by recording.
   */
  sessionId: string;
  /**
   * A family of near-duplicate recordings: retries of the same ayah in the same
   * sitting, or a long recording cut into ayat. Members must never be split
   * across an evaluation boundary.
   */
  recordingFamilyId: string;
  surah: number;
  ayah: number;
  /** The expected Quran text, exactly as the app's Quran data supplies it. */
  expectedText: string;
  /** Where the audio lives outside the repository. No audio is stored here. */
  audioRef: {
    /** Opaque storage key. Never a path inside this repository. */
    storageKey: string;
    mimeType: string;
    /** Content hash, for duplicate and leakage detection without the audio. */
    sha256?: string;
  };
  device: DeviceMetadata;
  consent: ConsentReference;
  /** Only present where a research question needs it. See ResearchAttribute. */
  research?: ReciterResearchMetadata;
  /** How the recording sounds, as judged in review. */
  quality: RecordingQuality;
  /** Whether this sample may be used for each purpose, and why not when not. */
  usability: {
    training: boolean;
    evaluation: boolean;
    reason?: string;
  };
  capturedAt: string;
};

// ---------------------------------------------------------------------------
// The four layers: machine, teacher, correction, adjudication
// ---------------------------------------------------------------------------

/** Layer 1: what a speech service returned. Text, not truth. */
export type MachineTranscript = {
  provider: string;
  producedAt: string;
  text: string;
  /** Provider-reported confidence, where it gives one. */
  confidence?: number | null;
};

/** Layer 2: what the aligner made of that transcript against the expected text. */
export type AlignmentRecord = {
  provider: string;
  producedAt: string;
  alignment: TranscriptAlignment;
  /** Approximate word boundaries, where the aligner produced any. */
  wordTimings?: readonly { wordIndex: number; startMs: number; endMs: number; confidence?: number }[];
};

/**
 * Layer 3: what a model predicted.
 *
 * Structurally similar to a teacher's observations on purpose — that is what
 * makes them comparable in a benchmark — and kept in a different field for the
 * same reason. Nothing in this module reads predictions when computing ground
 * truth.
 */
export type MachinePrediction = {
  provider: string;
  modelVersion: string;
  producedAt: string;
  observations: readonly LabelObservation[];
  /** Whether the model declined to make a call. Abstention is a valid output. */
  abstained: boolean;
  confidence?: number | null;
};

export type MachineLayers = {
  transcript?: MachineTranscript;
  alignment?: AlignmentRecord;
  prediction?: MachinePrediction;
};

/** Who reviewed, and on what authority. */
export type TeacherReviewer = {
  /** Privacy-safe reviewer id, e.g. "reviewer-003". */
  reviewerId: string;
  /** Their qualification, in their own words. Recorded, never validated here. */
  qualification: string;
  /** The riwayah they review against — reviewers may differ, and that matters. */
  riwayah?: string;
};

/**
 * Layer 4: what a teacher heard.
 *
 * `correction` is what the reviewer says was actually recited, or what the
 * learner should do — never a rewriting of the Quran text, which stays in
 * `RecordingSample.expectedText`.
 */
export type TeacherReview = {
  reviewId: string;
  sampleId: string;
  reviewer: TeacherReviewer;
  reviewedAt: string;
  /** The reviewer's overall call for the recording. */
  overallLabel: PronunciationLabel;
  observations: readonly LabelObservation[];
  /** What the reviewer says was recited, where it differs from the expected text. */
  correction?: {
    /** Transcription of what was heard, in the reviewer's own writing. */
    heardText?: string;
    /** What the learner should do about it, in the reviewer's words. */
    guidance?: string;
  };
  /** The reviewer's judgement of the recording itself. */
  quality: RecordingQuality;
  /** True where the reviewer could not reach a judgement at all. */
  uncertain: boolean;
  /** Minutes spent, for quality control of the labeling process itself. */
  reviewMinutes?: number;
  notes?: string;
};

/**
 * Layer 5: the adjudicated label.
 *
 * Produced only by a named adjudicator, only with a written rationale, and only
 * with the reviews it was derived from recorded. It supersedes nothing: the
 * independent reviews stay exactly as they were written.
 */
export type Adjudication = {
  sampleId: string;
  adjudicator: TeacherReviewer;
  adjudicatedAt: string;
  /** Reviews considered, by id. Kept so the reasoning can be retraced. */
  consideredReviewIds: readonly string[];
  overallLabel: PronunciationLabel;
  observations: readonly LabelObservation[];
  /** Why this call, in the adjudicator's words. Required. */
  rationale: string;
};

/** A sample with everything recorded about it so far. */
export type LabeledSample = {
  sample: RecordingSample;
  machine: MachineLayers;
  /** Independent reviews, in the order they were submitted. Never merged. */
  reviews: readonly TeacherReview[];
  adjudication: Adjudication | null;
};

// ---------------------------------------------------------------------------
// Ground truth
// ---------------------------------------------------------------------------

export const GROUND_TRUTH_SOURCES = ["none", "single-review", "agreed-reviews", "adjudicated"] as const;

export type GroundTruthSource = (typeof GROUND_TRUTH_SOURCES)[number];

export type GroundTruth = {
  source: GroundTruthSource;
  /** Null until a teacher has provided one. A prediction never fills this in. */
  overallLabel: PronunciationLabel | null;
  observations: readonly LabelObservation[];
  /** The reviews this rests on, so a benchmark can report its own provenance. */
  reviewIds: readonly string[];
  /** True where the ground truth is "nobody could tell", which is a result. */
  uncertain: boolean;
};

/**
 * The ground truth for a sample.
 *
 * Reads teacher layers only. A machine transcript, an alignment and a model
 * prediction can all be present and this function will still return
 * `source: "none"` — which is the correct answer for a sample no teacher has
 * reviewed, however confident the model was.
 *
 * Two independent reviews that agree are ground truth. Two that disagree are
 * not: they wait for adjudication rather than being averaged, voted on, or
 * resolved by preferring the more senior reviewer.
 */
export function groundTruthFor(labeled: LabeledSample): GroundTruth {
  const { reviews, adjudication } = labeled;

  if (adjudication) {
    return {
      source: "adjudicated",
      overallLabel: adjudication.overallLabel,
      observations: adjudication.observations,
      reviewIds: adjudication.consideredReviewIds,
      uncertain: isUncertainLabel(adjudication.overallLabel),
    };
  }

  if (reviews.length === 0) {
    return { source: "none", overallLabel: null, observations: [], reviewIds: [], uncertain: false };
  }

  if (reviews.length === 1) {
    const [review] = reviews;
    return {
      source: "single-review",
      overallLabel: review.overallLabel,
      observations: review.observations,
      reviewIds: [review.reviewId],
      uncertain: review.uncertain || isUncertainLabel(review.overallLabel),
    };
  }

  if (reviewsAgree(reviews)) {
    return {
      source: "agreed-reviews",
      overallLabel: reviews[0].overallLabel,
      observations: reviews[0].observations,
      reviewIds: reviews.map((review) => review.reviewId),
      uncertain: reviews.some((review) => review.uncertain) || isUncertainLabel(reviews[0].overallLabel),
    };
  }

  // Disagreement, unadjudicated: there is no ground truth, and inventing one
  // here is exactly the failure this model exists to prevent.
  return {
    source: "none",
    overallLabel: null,
    observations: [],
    reviewIds: reviews.map((review) => review.reviewId),
    uncertain: false,
  };
}

/**
 * Whether two reviews say the same thing.
 *
 * Agreement is deliberately strict: the same overall label, the same set of
 * (label, location) pairs. Reviewers who found the same error in different
 * places have not agreed, and a benchmark built on a looser rule would report
 * an agreement rate that does not exist.
 */
export function reviewsAgree(reviews: readonly TeacherReview[]): boolean {
  if (reviews.length < 2) return true;
  const [first, ...rest] = reviews;
  const signature = observationSignature(first);
  return rest.every((review) => review.overallLabel === first.overallLabel && observationSignature(review) === signature);
}

function locationKey(location: LabelLocation): string {
  switch (location.scope) {
    case "recording":
      return "recording";
    case "ayah":
      return `ayah:${location.surah}:${location.ayah}`;
    case "word":
      return `word:${location.surah}:${location.ayah}:${location.wordIndex}`;
    case "letter":
      return `letter:${location.surah}:${location.ayah}:${location.wordIndex}:${location.letterIndex}`;
    case "time-range":
      return `time:${location.timeRange.startMs}-${location.timeRange.endMs}`;
  }
}

function observationSignature(review: TeacherReview): string {
  return [...review.observations]
    .map((observation) => `${observation.label}@${locationKey(observation.location)}`)
    .sort()
    .join("|");
}

/** Every point two reviews differ on, for the adjudicator to look at. */
export type Disagreement = {
  kind: "overall-label" | "observation";
  /** Human-readable location key, or "overall". */
  where: string;
  /** What each reviewer said, keyed by reviewer id. */
  positions: Record<string, string>;
};

export function disagreements(reviews: readonly TeacherReview[]): Disagreement[] {
  if (reviews.length < 2) return [];
  const found: Disagreement[] = [];

  const overall = new Set(reviews.map((review) => review.overallLabel));
  if (overall.size > 1) {
    found.push({
      kind: "overall-label",
      where: "overall",
      positions: Object.fromEntries(reviews.map((review) => [review.reviewer.reviewerId, review.overallLabel])),
    });
  }

  const locations = new Set<string>();
  for (const review of reviews) for (const observation of review.observations) locations.add(locationKey(observation.location));

  for (const location of Array.from(locations).sort()) {
    const positions: Record<string, string> = {};
    for (const review of reviews) {
      const labels = review.observations
        .filter((observation) => locationKey(observation.location) === location)
        .map((observation) => observation.label)
        .sort();
      positions[review.reviewer.reviewerId] = labels.length ? labels.join(", ") : "(nothing recorded)";
    }
    if (new Set(Object.values(positions)).size > 1) found.push({ kind: "observation", where: location, positions });
  }

  return found;
}

// ---------------------------------------------------------------------------
// Review workflow
// ---------------------------------------------------------------------------

export const REVIEW_WORKFLOW_STATES = [
  /** No teacher has reviewed it. */
  "pending",
  /** One or more reviews recorded; not yet enough or not yet compared. */
  "independently-reviewed",
  /** Two or more reviews recorded and they differ. */
  "disagreement",
  /** A disagreement that must be adjudicated before the sample can be used. */
  "adjudication-required",
  /** An adjudicator has recorded a final label with a rationale. */
  "adjudicated",
] as const;

export type ReviewWorkflowState = (typeof REVIEW_WORKFLOW_STATES)[number];

export type WorkflowPolicy = {
  /** How many independent reviews a sample needs before it can be used. */
  requiredIndependentReviews: number;
  /** Whether a disagreement must be adjudicated rather than dropped. */
  adjudicationRequiredOnDisagreement: boolean;
};

export const DEFAULT_WORKFLOW_POLICY: WorkflowPolicy = {
  requiredIndependentReviews: 2,
  adjudicationRequiredOnDisagreement: true,
};

export function workflowState(
  labeled: LabeledSample,
  policy: WorkflowPolicy = DEFAULT_WORKFLOW_POLICY,
): ReviewWorkflowState {
  if (labeled.adjudication) return "adjudicated";
  if (labeled.reviews.length === 0) return "pending";
  if (labeled.reviews.length >= 2 && !reviewsAgree(labeled.reviews)) {
    return policy.adjudicationRequiredOnDisagreement ? "adjudication-required" : "disagreement";
  }
  return "independently-reviewed";
}

export class LabelingError extends Error {}

const nonEmpty = (value: string | undefined | null): boolean => typeof value === "string" && value.trim().length > 0;

/**
 * Records an independent review, leaving every earlier one exactly as written.
 *
 * A reviewer never sees this function merge anything: the returned sample has
 * one more review in its list and nothing else changed. The expected Quran text
 * is carried across unchanged, and a test asserts it.
 */
export function addReview(labeled: LabeledSample, review: TeacherReview): LabeledSample {
  if (review.sampleId !== labeled.sample.sampleId) {
    throw new LabelingError("A review must name the sample it reviews.");
  }
  if (!nonEmpty(review.reviewer.reviewerId)) throw new LabelingError("A review must name its reviewer.");
  if (!nonEmpty(review.reviewer.qualification)) {
    throw new LabelingError("A review must record the reviewer's qualification.");
  }
  if (!nonEmpty(review.reviewedAt)) throw new LabelingError("A review must carry the date it was made.");
  if (labeled.reviews.some((existing) => existing.reviewId === review.reviewId)) {
    throw new LabelingError(`Review ${review.reviewId} has already been recorded for this sample.`);
  }
  for (const observation of review.observations) assertObservationFits(observation);

  return { ...labeled, reviews: [...labeled.reviews, review] };
}

/**
 * Records an adjudication.
 *
 * Refused without a named adjudicator, their qualification, a rationale, and the
 * reviews it considered — an adjudication with none of those is indistinguishable
 * from a merge, which is the thing this workflow exists to prevent.
 */
export function adjudicate(labeled: LabeledSample, adjudication: Adjudication): LabeledSample {
  if (adjudication.sampleId !== labeled.sample.sampleId) {
    throw new LabelingError("An adjudication must name the sample it resolves.");
  }
  if (!nonEmpty(adjudication.adjudicator.reviewerId)) throw new LabelingError("An adjudication must name its adjudicator.");
  if (!nonEmpty(adjudication.adjudicator.qualification)) {
    throw new LabelingError("An adjudication must record the adjudicator's qualification.");
  }
  if (!nonEmpty(adjudication.rationale)) {
    throw new LabelingError("An adjudication must say why, in the adjudicator's own words.");
  }
  if (adjudication.consideredReviewIds.length === 0) {
    throw new LabelingError("An adjudication must record the reviews it considered.");
  }
  const known = new Set(labeled.reviews.map((review) => review.reviewId));
  for (const reviewId of adjudication.consideredReviewIds) {
    if (!known.has(reviewId)) throw new LabelingError(`Adjudication references unknown review ${reviewId}.`);
  }
  for (const observation of adjudication.observations) assertObservationFits(observation);

  return { ...labeled, adjudication };
}

/**
 * Attaches machine output.
 *
 * The teacher layers are carried across by reference and the expected text is
 * untouched: there is no argument to this function that could write into a
 * review, an adjudication or the Quran text.
 */
export function attachMachineOutput(labeled: LabeledSample, machine: MachineLayers): LabeledSample {
  return {
    sample: labeled.sample,
    machine: { ...labeled.machine, ...machine },
    reviews: labeled.reviews,
    adjudication: labeled.adjudication,
  };
}

/** An observation must sit at a scope its label allows. */
export function assertObservationFits(observation: LabelObservation): void {
  const definition = LABEL_DEFINITIONS[observation.label];
  if (!definition) throw new LabelingError(`Unknown label ${observation.label}.`);
  if (!definition.scopes.includes(observation.location.scope)) {
    throw new LabelingError(
      `${definition.title} cannot be attached at ${observation.location.scope} scope; allowed: ${definition.scopes.join(", ")}.`,
    );
  }
  const range = observation.location.timeRange ?? (observation.location.scope === "time-range" ? observation.location.timeRange : undefined);
  if (range && (range.startMs < 0 || range.endMs <= range.startMs)) {
    throw new LabelingError("A time range must start at or after zero and end after it starts.");
  }
}

/** Observations attached to one word, however many there are. */
export function observationsForWord(
  observations: readonly LabelObservation[],
  surah: number,
  ayah: number,
  wordIndex: number,
): LabelObservation[] {
  return observations.filter((observation) => {
    const location = observation.location;
    if (location.scope === "word" || location.scope === "letter") {
      return location.surah === surah && location.ayah === ayah && location.wordIndex === wordIndex;
    }
    return false;
  });
}

/** Observations whose time range covers a moment in the recording. */
export function observationsAtMs(observations: readonly LabelObservation[], atMs: number): LabelObservation[] {
  return observations.filter((observation) => {
    const range = observation.location.timeRange;
    return Boolean(range && atMs >= range.startMs && atMs <= range.endMs);
  });
}
