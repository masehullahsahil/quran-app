/**
 * What a future pronunciation evaluator would have to be measured on.
 *
 * These are metric *definitions*, not results. Nothing here evaluates a model,
 * and no number in this file is a claim about the current app: the existing
 * acoustic evaluator abstains by default and has never been measured against
 * teacher labels, because those labels do not exist yet.
 *
 * Two design choices worth stating:
 *
 *  - **False corrections are the expensive error.** Telling a learner they made
 *    a mistake in the Quran when they did not is worse than staying quiet, so
 *    the false-correction rate is a first-class metric rather than a footnote of
 *    precision, and every proposed operating point favours abstention.
 *  - **Every target is a placeholder.** Real targets come from what qualified
 *    teachers consider acceptable, measured on a real dataset. The ones marked
 *    `proposed-placeholder` exist so a review has something concrete to argue
 *    with, and `hasApprovedTarget` reports false for all of them.
 */
import type { PronunciationLabel } from "./pronunciationDataset";

export const BENCHMARK_METRIC_IDS = [
  "word-position-accuracy",
  "omission-detection",
  "insertion-detection",
  "substitution-detection",
  "letter-phoneme-error-detection",
  "false-correction-rate",
  "missed-correction-rate",
  "latency-to-correction",
  "confidence-calibration",
] as const;

export type BenchmarkMetricId = (typeof BENCHMARK_METRIC_IDS)[number];

/** What kind of number the metric produces, so a report cannot mislabel it. */
export const METRIC_UNITS = ["ratio", "milliseconds", "calibration-error", "count"] as const;

export type MetricUnit = (typeof METRIC_UNITS)[number];

/** Which way is better. Reported so nobody reads a lower error as worse. */
export type MetricDirection = "higher-is-better" | "lower-is-better";

/**
 * A proposed operating point.
 *
 * `status` is always `proposed-placeholder`: these numbers were chosen by a
 * software team to make the shape of the argument concrete, not derived from
 * data or agreed with teachers. Anything reported against them must say so.
 */
export type ProposedTarget = {
  value: number;
  status: "proposed-placeholder";
  rationale: string;
};

export type BenchmarkMetric = {
  id: BenchmarkMetricId;
  title: string;
  /** What is being counted, in one sentence. */
  definition: string;
  /** How it is computed, in words rather than notation. */
  computation: string;
  unit: MetricUnit;
  direction: MetricDirection;
  /** The ground-truth labels this metric reads. */
  labels: readonly PronunciationLabel[];
  /** Why the metric matters to a learner rather than to a leaderboard. */
  learnerImpact: string;
  /** How the metric can be gamed or misread. */
  caveat: string;
  proposedTarget: ProposedTarget | null;
  /** What has to exist before the metric can be computed at all. */
  requires: readonly string[];
};

const NEEDS_DATASET = "A teacher-labeled, consented dataset with held-out speakers";
const NEEDS_ADJUDICATION = "Adjudicated ground truth for every sample counted";
const NEEDS_TIMING = "Word-level timings from an aligner, checked by a teacher";

export const BENCHMARK_METRICS: Record<BenchmarkMetricId, BenchmarkMetric> = {
  "word-position-accuracy": {
    id: "word-position-accuracy",
    title: "Word-position tracking accuracy",
    definition:
      "How often the system's belief about which word the learner is on matches the word a teacher says they were on.",
    computation:
      "Sample the system's reported position at each teacher-marked word boundary; count exact matches over total boundaries. Report separately for the first word of an ayah, mid-ayah, and after a stop.",
    unit: "ratio",
    direction: "higher-is-better",
    labels: ["wrong-ayah-or-position", "correct-recitation"],
    learnerImpact:
      "Position is what the app already acts on: it decides which word is shown as the one to repeat. A wrong position sends the learner to the wrong place.",
    caveat:
      "Easy to inflate on slow, clear recitation of short ayat. Report by recitation speed and by ayah length, or the number says little.",
    proposedTarget: {
      value: 0.95,
      status: "proposed-placeholder",
      rationale:
        "Placeholder only: chosen so that at most one word in twenty is misplaced, which is roughly where a returning learner would stop trusting the position display. Needs a teacher's judgement and real data.",
    },
    requires: [NEEDS_DATASET, NEEDS_TIMING],
  },
  "omission-detection": {
    id: "omission-detection",
    title: "Omission detection",
    definition: "Whether words the teacher marked as not recited are found, and only those.",
    computation:
      "Precision, recall and F1 over `word-omission` labels at word scope, matched by word index. Report the confusion with `word-substitution`, which is the neighbouring error.",
    unit: "ratio",
    direction: "higher-is-better",
    labels: ["word-omission"],
    learnerImpact: "A missed word is the most common real error in memorisation practice and the most useful to catch.",
    caveat:
      "Recall alone rewards a system that flags everything. Report precision beside it and the false-correction rate below.",
    proposedTarget: {
      value: 0.9,
      status: "proposed-placeholder",
      rationale: "Placeholder F1, for argument. No basis in measurement yet.",
    },
    requires: [NEEDS_DATASET, NEEDS_ADJUDICATION],
  },
  "insertion-detection": {
    id: "insertion-detection",
    title: "Insertion detection",
    definition: "Whether words the teacher marked as added are found, and only those.",
    computation:
      "Precision, recall and F1 over `word-insertion` labels. Count a detection as correct only when it falls between the same two expected words the teacher marked.",
    unit: "ratio",
    direction: "higher-is-better",
    labels: ["word-insertion", "repeated-word"],
    learnerImpact:
      "Insertions are often self-correction or hesitation rather than error. A system that reports them as mistakes is unpleasant to practise with.",
    caveat:
      "Depends heavily on whether repetition-as-self-correction counts as an insertion — an open question for teachers, recorded in the spec.",
    proposedTarget: null,
    requires: [NEEDS_DATASET, NEEDS_ADJUDICATION, "A teacher ruling on self-correction"],
  },
  "substitution-detection": {
    id: "substitution-detection",
    title: "Substitution detection",
    definition: "Whether a word recited in place of another is found, and identified as the right kind of error.",
    computation:
      "Precision, recall and F1 over `word-substitution` at word scope. Separately, the share of detections where the system's proposed heard word matches the teacher's transcription.",
    unit: "ratio",
    direction: "higher-is-better",
    labels: ["word-substitution"],
    learnerImpact: "A substituted word changes the recitation and is worth interrupting for.",
    caveat:
      "Transcription-driven substitution detection inherits the speech recogniser's Arabic error rate, which for Quranic recitation is not the same as for speech.",
    proposedTarget: null,
    requires: [NEEDS_DATASET, NEEDS_ADJUDICATION],
  },
  "letter-phoneme-error-detection": {
    id: "letter-phoneme-error-detection",
    title: "Letter / phoneme error detection",
    definition:
      "Whether letter-level errors a teacher heard — substitution, deletion, insertion, makhraj — are detected at the right letter.",
    computation:
      "Precision and recall over letter-scope labels, matched by (word index, letter index). Report per confusion pair from shared/quranAcoustic.ts, since the pairs behave very differently.",
    unit: "ratio",
    direction: "higher-is-better",
    labels: ["letter-substitution", "letter-deletion", "letter-insertion", "makhraj-articulation-issue"],
    learnerImpact:
      "This is the capability the app does not have and does not claim. It is also the one a learner without a teacher most needs.",
    caveat:
      "Teacher agreement on letter-level labels is itself unknown. Until inter-rater agreement is measured, a model cannot be scored above the agreement ceiling — a model matching adjudicated labels better than two teachers match each other is a sign of a broken benchmark, not a good model.",
    proposedTarget: null,
    requires: [NEEDS_DATASET, NEEDS_ADJUDICATION, "Measured inter-rater agreement at letter scope"],
  },
  "false-correction-rate": {
    id: "false-correction-rate",
    title: "False correction rate",
    definition:
      "How often the system tells a learner they made an error where the adjudicated ground truth says the recitation was correct.",
    computation:
      "Corrections surfaced to a learner on samples whose ground truth is `correct-recitation`, over all such samples. Counted at whatever scope the correction was shown at.",
    unit: "ratio",
    direction: "lower-is-better",
    labels: ["correct-recitation"],
    learnerImpact:
      "The costly error. Being told you mis-recited the Quran when you did not is discouraging, and it teaches the learner to distrust every later correction.",
    caveat:
      "Trivially minimised by abstaining always — which is why it is reported beside the missed-correction rate and never alone.",
    proposedTarget: {
      value: 0.02,
      status: "proposed-placeholder",
      rationale:
        "Placeholder: chosen to express that false corrections should be rare enough that a learner meets one only occasionally in a session. A qualified teacher should set the real bar, and it may well be stricter.",
    },
    requires: [NEEDS_DATASET, NEEDS_ADJUDICATION],
  },
  "missed-correction-rate": {
    id: "missed-correction-rate",
    title: "Missed correction rate",
    definition:
      "How often an error the teacher marked at meaningful severity or above is not surfaced to the learner at all.",
    computation:
      "Ground-truth observations at `meaningful` or `blocking-correction` severity with no corresponding surfaced correction, over all such observations. Reported by label family.",
    unit: "ratio",
    direction: "lower-is-better",
    labels: [
      "word-omission",
      "word-substitution",
      "harakah-vowel-error",
      "letter-substitution",
      "madd-duration-issue",
      "ghunnah-issue",
      "qalqalah-issue",
    ],
    learnerImpact:
      "A missed correction leaves a learner practising an error. It is the cost of a conservative system, and it has to be reported so that the trade-off is visible rather than hidden behind a low false-correction rate.",
    caveat: "Depends entirely on the severity taxonomy, which is itself unapproved.",
    proposedTarget: null,
    requires: [NEEDS_DATASET, NEEDS_ADJUDICATION, "An approved severity taxonomy"],
  },
  "latency-to-correction": {
    id: "latency-to-correction",
    title: "Latency to correction",
    definition: "How long after the error the learner is told about it.",
    computation:
      "Milliseconds from the end of the teacher-marked time range of the error to the moment the correction is presented. Report median and 95th percentile, and separately for live guidance and after-recording review.",
    unit: "milliseconds",
    direction: "lower-is-better",
    labels: [],
    learnerImpact:
      "A correction that arrives after the learner has moved on costs them the place they were in. Speed matters, but not at the cost of the false-correction rate.",
    caveat:
      "A latency figure means nothing without the accuracy it was achieved at; the two must be reported from the same run.",
    proposedTarget: null,
    requires: [NEEDS_DATASET, NEEDS_TIMING, "A live-path implementation to measure"],
  },
  "confidence-calibration": {
    id: "confidence-calibration",
    title: "Confidence calibration",
    definition:
      "Whether the confidence the system reports means what it says: of the corrections it makes at 0.8 confidence, roughly 80% should be right.",
    computation:
      "Expected calibration error over ten confidence bins, plus a reliability curve. Report the abstention rate at each threshold alongside it.",
    unit: "calibration-error",
    direction: "lower-is-better",
    labels: [],
    learnerImpact:
      "The app's confidence gate is what keeps unreliable observations away from learners. A miscalibrated confidence makes that gate meaningless.",
    caveat:
      "Calibration measured on the validation split does not transfer to a different microphone or a different recitation speed; report per device class.",
    proposedTarget: {
      value: 0.05,
      status: "proposed-placeholder",
      rationale:
        "Placeholder expected-calibration-error ceiling, so that the confidence gate has a number to be held to. Not derived from data.",
    },
    requires: [NEEDS_DATASET, NEEDS_ADJUDICATION],
  },
};

/** No metric here has an approved target. Stated as code so a report cannot claim one. */
export function hasApprovedTarget(_metric: BenchmarkMetricId): boolean {
  return false;
}

/** Every target currently proposed, for a review to argue with. */
export function proposedTargets(): Array<{ metric: BenchmarkMetricId; target: ProposedTarget }> {
  return BENCHMARK_METRIC_IDS.flatMap((id) => {
    const target = BENCHMARK_METRICS[id].proposedTarget;
    return target ? [{ metric: id, target }] : [];
  });
}

/**
 * What is still missing before any of these can be computed.
 *
 * Returned as a set rather than prose so that a status page can show it and a
 * test can assert it is non-empty — which it will be until a dataset exists.
 */
export function unmetPrerequisites(): string[] {
  const all = new Set<string>();
  for (const id of BENCHMARK_METRIC_IDS) for (const requirement of BENCHMARK_METRICS[id].requires) all.add(requirement);
  return Array.from(all).sort();
}

/**
 * The sentence a benchmark report has to open with while the dataset does not
 * exist. Computed, so it cannot drift from the state of the repository.
 */
export const BENCHMARK_READINESS_STATEMENT =
  "No pronunciation benchmark has been run. These metrics are definitions awaiting a teacher-labeled dataset; the app's acoustic evaluator has never been measured against qualified-teacher labels, and no accuracy claim is made anywhere in this repository.";
