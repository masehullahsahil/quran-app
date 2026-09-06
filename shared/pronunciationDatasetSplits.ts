/**
 * Keeping the training data out of the evaluation data.
 *
 * A pronunciation model that has heard a speaker in training will do better on
 * that speaker at test time, and the difference has nothing to do with whether
 * it can judge recitation. The same is true, more sharply, of the *same
 * recording* appearing on both sides — and near-duplicates make that easy to do
 * by accident: two takes of the same ayah in one sitting, or one long recording
 * cut into ayat.
 *
 * So splits are assigned at the level of a speaker, and every recording of that
 * speaker follows. This module holds the assignment, the rules, and a leakage
 * report that names any violation rather than quietly correcting it.
 *
 * It measures nothing about audio and trains nothing. See
 * docs/pronunciation-dataset-spec.md.
 */
import type { LabeledSample, RecordingSample } from "./pronunciationDataset";

export const DATASET_SPLITS = [
  /** Model fitting. Anything here is assumed to have been memorised. */
  "training",
  /** Tuning and threshold selection. Not a headline number. */
  "validation",
  /** Held out until a model is finished. Reported once per model version. */
  "test",
  /**
   * A frozen set used to compare releases over time, kept separate from `test`
   * so that repeated measurement against it cannot quietly become tuning.
   */
  "production-benchmark",
] as const;

export type DatasetSplit = (typeof DATASET_SPLITS)[number];

/** The splits a sample must never be used for training from. */
export const EVALUATION_SPLITS: readonly DatasetSplit[] = ["validation", "test", "production-benchmark"];

export function isEvaluationSplit(split: DatasetSplit): boolean {
  return EVALUATION_SPLITS.includes(split);
}

/**
 * A split assignment.
 *
 * Assignment is per speaker, not per recording. Recording it this way makes the
 * unit of separation explicit, and makes "which split is this recording in?" a
 * derived question rather than a field somebody can edit for one recording.
 */
export type SpeakerSplitAssignment = {
  speakerAnonymizedId: string;
  split: DatasetSplit;
  /** Why this speaker sits here — a sampling plan, a quota, a manual choice. */
  reason?: string;
  assignedAt: string;
};

export type SplitPlan = {
  version: string;
  assignments: readonly SpeakerSplitAssignment[];
};

export function splitForSpeaker(plan: SplitPlan, speakerAnonymizedId: string): DatasetSplit | null {
  return plan.assignments.find((entry) => entry.speakerAnonymizedId === speakerAnonymizedId)?.split ?? null;
}

export function splitForSample(plan: SplitPlan, sample: RecordingSample): DatasetSplit | null {
  return splitForSpeaker(plan, sample.speakerAnonymizedId);
}

// ---------------------------------------------------------------------------
// Leakage
// ---------------------------------------------------------------------------

export const LEAKAGE_KINDS = [
  /** One speaker's recordings appear in more than one split. */
  "speaker-across-splits",
  /** One session's recordings appear in more than one split. */
  "session-across-splits",
  /** One recording family — retakes, or one recording cut up — is split. */
  "family-across-splits",
  /** The same audio, by content hash, appears in more than one split. */
  "duplicate-audio-across-splits",
  /** A sample is used for training although consent or usability forbids it. */
  "training-use-not-permitted",
  /** A sample in an evaluation split is also marked usable for training. */
  "evaluation-sample-marked-trainable",
  /** A sample belongs to no split, so its use is undefined. */
  "unassigned-sample",
] as const;

export type LeakageKind = (typeof LEAKAGE_KINDS)[number];

export type LeakageFinding = {
  kind: LeakageKind;
  /** The speaker, session, family or sample the finding is about. */
  subject: string;
  /** The splits involved, where the finding is about a boundary crossing. */
  splits: DatasetSplit[];
  detail: string;
};

const KIND_EXPLANATIONS: Record<LeakageKind, string> = {
  "speaker-across-splits":
    "A model that has trained on a voice recognises that voice, not the recitation. Speaker-level separation is the minimum bar for any reported number.",
  "session-across-splits":
    "One sitting shares a microphone, a room and a state of voice. Splitting a session lets room acoustics carry across the boundary even when the speaker does not.",
  "family-across-splits":
    "Retakes of one ayah, or one long recording cut into ayat, are near-duplicates. Separating them is the same as testing on training data.",
  "duplicate-audio-across-splits": "The identical file on both sides of the boundary. Nothing measured this way means anything.",
  "training-use-not-permitted":
    "Consent or usability marks this sample as not for training. Using it anyway is a consent violation before it is a methodology one.",
  "evaluation-sample-marked-trainable":
    "A sample held out for evaluation must not also be offered to training, or the separation depends on whoever writes the next loader.",
  "unassigned-sample": "A sample with no split can be picked up by any consumer. Undefined membership is leakage waiting to happen.",
};

export function explainLeakage(kind: LeakageKind): string {
  return KIND_EXPLANATIONS[kind];
}

type Grouped = Map<string, Set<DatasetSplit>>;

function record(map: Grouped, key: string, split: DatasetSplit): void {
  const existing = map.get(key);
  if (existing) existing.add(split);
  else map.set(key, new Set([split]));
}

/**
 * Every way this dataset would fool its own benchmark.
 *
 * Returns findings; it does not fix anything. A split plan that leaks has to be
 * changed by whoever owns the sampling, not silently repaired by a loader — the
 * repair is where the leak usually gets hidden.
 */
export function leakageReport(samples: readonly LabeledSample[], plan: SplitPlan): LeakageFinding[] {
  const findings: LeakageFinding[] = [];
  const bySpeaker: Grouped = new Map();
  const bySession: Grouped = new Map();
  const byFamily: Grouped = new Map();
  const byHash: Grouped = new Map();

  for (const labeled of samples) {
    const sample = labeled.sample;
    const split = splitForSample(plan, sample);

    if (!split) {
      findings.push({
        kind: "unassigned-sample",
        subject: sample.sampleId,
        splits: [],
        detail: `Sample ${sample.sampleId} (speaker ${sample.speakerAnonymizedId}) has no split assignment.`,
      });
      continue;
    }

    record(bySpeaker, sample.speakerAnonymizedId, split);
    record(bySession, sample.sessionId, split);
    record(byFamily, sample.recordingFamilyId, split);
    if (sample.audioRef.sha256) record(byHash, sample.audioRef.sha256, split);

    if (isEvaluationSplit(split) && sample.usability.training) {
      findings.push({
        kind: "evaluation-sample-marked-trainable",
        subject: sample.sampleId,
        splits: [split],
        detail: `Sample ${sample.sampleId} is in ${split} but is marked usable for training.`,
      });
    }

    if (split === "training") {
      if (!sample.usability.training) {
        findings.push({
          kind: "training-use-not-permitted",
          subject: sample.sampleId,
          splits: [split],
          detail: `Sample ${sample.sampleId} is in training but is marked not usable for training${sample.usability.reason ? `: ${sample.usability.reason}` : "."}`,
        });
      }
      if (!sample.consent.permittedUses.includes("training")) {
        findings.push({
          kind: "training-use-not-permitted",
          subject: sample.sampleId,
          splits: [split],
          detail: `Sample ${sample.sampleId} is in training but its consent does not permit training use.`,
        });
      }
    }
  }

  const crossings: Array<[Grouped, LeakageKind, string]> = [
    [bySpeaker, "speaker-across-splits", "Speaker"],
    [bySession, "session-across-splits", "Session"],
    [byFamily, "family-across-splits", "Recording family"],
    [byHash, "duplicate-audio-across-splits", "Audio hash"],
  ];

  for (const [group, kind, noun] of crossings) {
    for (const [subject, splits] of Array.from(group.entries())) {
      if (splits.size > 1) {
        const list = Array.from(splits).sort();
        findings.push({
          kind,
          subject,
          splits: list,
          detail: `${noun} ${subject} appears in ${list.join(" and ")}. ${explainLeakage(kind)}`,
        });
      }
    }
  }

  return findings;
}

/** True when a set of samples can be reported on without qualification. */
export function isCleanSplit(samples: readonly LabeledSample[], plan: SplitPlan): boolean {
  return leakageReport(samples, plan).length === 0;
}

/**
 * The samples a training loader may read.
 *
 * Everything is checked at the point of use rather than trusted from the plan:
 * the split, the usability flag and the consent scope all have to agree. A
 * sample that fails any of them is simply not returned, and `leakageReport`
 * names it separately so the gap is visible rather than silently smaller.
 */
export function trainingSamples(samples: readonly LabeledSample[], plan: SplitPlan): LabeledSample[] {
  return samples.filter((labeled) => {
    const sample = labeled.sample;
    return (
      splitForSample(plan, sample) === "training" &&
      sample.usability.training &&
      sample.consent.permittedUses.includes("training")
    );
  });
}

/** The samples an evaluation may read, for one evaluation split. */
export function evaluationSamples(
  samples: readonly LabeledSample[],
  plan: SplitPlan,
  split: DatasetSplit,
): LabeledSample[] {
  if (!isEvaluationSplit(split)) return [];
  const permitted = split === "production-benchmark" ? "benchmark" : "evaluation";
  return samples.filter((labeled) => {
    const sample = labeled.sample;
    return (
      splitForSample(plan, sample) === split &&
      sample.usability.evaluation &&
      sample.consent.permittedUses.includes(permitted)
    );
  });
}

/** Counts per split, for a dataset card. */
export function splitSummary(samples: readonly LabeledSample[], plan: SplitPlan) {
  const counts = Object.fromEntries(DATASET_SPLITS.map((split) => [split, 0])) as Record<DatasetSplit, number>;
  const speakers = Object.fromEntries(DATASET_SPLITS.map((split) => [split, new Set<string>()])) as Record<
    DatasetSplit,
    Set<string>
  >;
  let unassigned = 0;

  for (const labeled of samples) {
    const split = splitForSample(plan, labeled.sample);
    if (!split) {
      unassigned += 1;
      continue;
    }
    counts[split] += 1;
    speakers[split].add(labeled.sample.speakerAnonymizedId);
  }

  return {
    counts,
    speakerCounts: Object.fromEntries(DATASET_SPLITS.map((split) => [split, speakers[split].size])) as Record<
      DatasetSplit,
      number
    >,
    unassigned,
  };
}
