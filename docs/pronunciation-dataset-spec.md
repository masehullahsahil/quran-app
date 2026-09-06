# Quran pronunciation dataset specification

This document defines **what qualified Quran teachers must label** so that pronunciation evaluation could one day be trained and measured properly.

It is a data specification. Nothing here trains a model, evaluates a recitation, or claims any pronunciation accuracy. The app's existing acoustic evaluator, its confidence gate, the live correction path and the Qaida curriculum are untouched by this work.

> **The dataset does not exist.** No learner audio has been collected, no teacher has labeled anything, and no benchmark has been run. Everything below describes a system to be built, in the order it must be built: consent first, labels second, models last.

| | |
|---|---|
| Schema and label taxonomy | `shared/pronunciationDataset.ts` |
| Splits and leakage detection | `shared/pronunciationDatasetSplits.ts` |
| Benchmark metric definitions | `shared/pronunciationBenchmark.ts` |
| Synthetic fixtures (no audio) | `shared/pronunciationDatasetFixtures.ts` |
| Labeling prototype | `/pronunciation-labeling`, `client/src/pages/PronunciationLabeling.tsx` |
| Staging area and manifest examples | `datasets/quran-pronunciation/` |
| Tests | `shared/pronunciationDataset.test.ts`, `shared/pronunciationDatasetSplits.test.ts`, `client/src/lib/pronunciationLabelStore.test.ts` |

An earlier, narrower labeling vocabulary exists in [quran-acoustic-teacher-labeling.md](./quran-acoustic-teacher-labeling.md) for the confidence-gated evaluator prototype. This spec is a superset of it; the older document stays in force for `pnpm benchmark:acoustic` until a teacher-labeled dataset replaces it.

## 1. Label taxonomy

**21 categories.** Each carries a definition, the scopes it may attach to, and whether only a qualified teacher may assert it. **14 of the 21 require a qualified teacher.**

| Label | Family | Qualified teacher required | Scopes |
|---|---|---|---|
| `correct-recitation` | outcome | yes | recording, ayah, word |
| `word-substitution` | text-observable | no | word, time-range |
| `word-omission` | text-observable | no | word, time-range |
| `word-insertion` | text-observable | no | word, time-range |
| `repeated-word` | text-observable | no | word, time-range |
| `wrong-ayah-or-position` | text-observable | no | recording, ayah, time-range |
| `harakah-vowel-error` | heard-only | yes | word, letter, time-range |
| `sukoon-error` | heard-only | yes | word, letter, time-range |
| `shaddah-error` | heard-only | yes | word, letter, time-range |
| `madd-duration-issue` | heard-only | yes | word, letter, time-range |
| `ghunnah-issue` | heard-only | yes | word, letter, time-range |
| `qalqalah-issue` | heard-only | yes | word, letter, time-range |
| `tajweed-rule-issue` | heard-only | yes | word, letter, time-range, ayah |
| `makhraj-articulation-issue` | heard-only | yes | letter, word, time-range |
| `letter-substitution` | heard-only | yes | letter, word, time-range |
| `letter-deletion` | heard-only | yes | letter, word, time-range |
| `letter-insertion` | heard-only | yes | letter, word, time-range |
| `waqf-stop-issue` | heard-only | yes | word, time-range, ayah |
| `ibtida-start-issue` | heard-only | yes | word, time-range, ayah |
| `uncertain-cannot-classify` | meta | no | all |
| `audio-quality-insufficient` | meta | no | all |

**This taxonomy is not religiously complete.** It was drafted by a software team from standard tajwid terminology, and it carries `TAXONOMY_STATUS = "proposed-pending-qualified-teacher-approval"` as a value in code, so that no interface can render it as settled. Adding, splitting, merging or renaming categories is expected — see §12.

The `family` column matters more than it looks. **`text-observable`** labels are the ones a word alignment can evidence, which is why the app already surfaces that class of correction. **`heard-only`** labels cannot be read off a transcript at all; they are exactly what a future model would have to earn the right to predict, and exactly what only a teacher can supply today.

### Uncertainty is an outcome

`uncertain-cannot-classify` and `audio-quality-insufficient` are first-class results, not missing data. A reviewer who cannot tell must be able to say so without their sample being dropped or, worse, counted as correct. Nothing in the model collapses them: `groundTruthFor` propagates `uncertain`, and a test asserts an uncertain review never becomes a correct one.

## 2. Sample schema

One `RecordingSample` per recording (`shared/pronunciationDataset.ts`):

| Field | Purpose |
|---|---|
| `sampleId` | Stable id. Labels reference it; nothing else joins on audio. |
| `speakerAnonymizedId` | Privacy-safe reciter id (`speaker-0007`). Never a name, email or account id. |
| `sessionId` | The sitting. One microphone, one room, one voice on one day. |
| `recordingFamilyId` | Near-duplicates: retakes of an ayah, or one long recording cut up. |
| `surah`, `ayah` | Position in the mushaf. |
| `expectedText` | The ayah from the app's Quran data. **Immutable through labeling.** |
| `audioRef` | `storageKey` outside the repository, `mimeType`, optional `sha256` for duplicate detection. |
| `device` | Class, family, microphone, sample rate, channels, codec, duration, environment. |
| `consent` | Consent record id, date obtained, permitted uses, retention date, withdrawal route. |
| `research` | Optional, justified speaker attributes — see below. |
| `quality` | `clean` / `minor_noise` / `noisy` / `clipped` / `truncated` / `unusable`. |
| `usability.training` | Whether this sample may be used to fit a model. |
| `usability.evaluation` | Whether it may be used to measure one. |
| `capturedAt` | When it was recorded. |

### Research metadata is gated by justification

Speaker background genuinely matters for a dataset serving learners whose first language is not Arabic — and it is the most sensitive thing here. Each research attribute is a `ResearchAttribute<T>`: a value, **the research question it answers**, and the consent scope it was given under. There is no way to record one without stating why. Anything not needed for a stated question is not collected.

### What is deliberately absent

No name, email, account id, IP address, device serial, precise location, or date of birth. Device metadata is coarse by design: `android-midrange`, not a model string that identifies a household.

## 3. Location granularity

An observation attaches at one of five scopes, and **any scope may also carry a millisecond time range**:

- `recording` — the whole attempt.
- `ayah` — surah + ayah.
- `word` — surah + ayah + 1-based word index.
- `letter` — the above plus a 1-based letter index and the expected grapheme.
- `time-range` — start and end in milliseconds, where the teacher can point at the audio but not at a specific word.

Coarser is a legitimate answer, not a fallback: "somewhere in this word" is what a teacher can honestly say more often than "this phoneme".

**Several observations may share one location.** A single word can carry a madd issue and a makhraj issue at once; forcing a reviewer to choose loses the second. `observationsForWord` returns all of them, and a test asserts that two observations on the same word both survive.

## 4. Ground-truth model

Five layers, kept apart:

| Layer | Field | Who produces it |
|---|---|---|
| 1. Raw machine transcript | `machine.transcript` | Speech service |
| 2. Alignment result | `machine.alignment` | The app's aligner (`TranscriptAlignment` + optional word timings) |
| 3. Machine prediction | `machine.prediction` | A future model |
| 4. Teacher label + correction | `reviews[]` | A qualified teacher |
| 5. Adjudicated final label | `adjudication` | A named adjudicator |

`groundTruthFor` reads **layers 4 and 5 only**. A sample can carry a transcript, an alignment and a confident prediction and still return `source: "none"` — which is the right answer for a sample no teacher has reviewed. There is no function anywhere in the module that writes a machine value into a teacher field, and a test asserts a prediction cannot become ground truth.

A teacher's `correction` records **what was recited** and what the learner should do. It never rewrites `expectedText`.

The labeling prototype never pre-fills the model's answer into the reviewer's form. A tool that suggests the prediction produces labels that agree with the prediction.

## 5. Multi-reviewer workflow

States (`workflowState`):

```
pending → independently-reviewed → adjudication-required → adjudicated
                               ↘ (agreement) → ground truth
```

| State | Meaning |
|---|---|
| `pending` | No teacher has reviewed it. |
| `independently-reviewed` | One or more reviews recorded; agreeing so far. |
| `disagreement` | Two or more reviews differ (policy without mandatory adjudication). |
| `adjudication-required` | Default policy: a disagreement must be adjudicated before use. |
| `adjudicated` | An adjudicator recorded a final label with a rationale. |

Rules, all enforced in code:

- Reviews are stored **independently**, in submission order, and are never modified or merged. Importing a colleague's file adds their reviews beside yours.
- Agreement is **strict**: same overall label, same set of (label, location) pairs. Reviewers who found the same error in different places have not agreed.
- A disagreement produces **no ground truth**. It is not averaged, not voted on, and not resolved by seniority.
- `adjudicate` refuses without a named adjudicator, their qualification, a rationale in their own words, and the ids of the reviews considered. An adjudication missing any of those is a merge wearing a hat, and is rejected on write *and* on read-back from a file.
- Uncertain remains a valid adjudicated outcome.

Default policy: **2 independent reviews**, adjudication mandatory on disagreement (`DEFAULT_WORKFLOW_POLICY`).

## 6. Severity taxonomy — proposed

| Level | Proposed meaning |
|---|---|
| `informational` | Worth recording for research; a learner would not be told. |
| `minor` | A small imprecision. Mentioned only in review, never mid-recitation. |
| `meaningful` | The learner should be told and should repeat the word. |
| `blocking-correction` | Recitation should not continue past it without correction. |

**This ordering decides what the app interrupts a learner for, which makes it a teaching decision, not an engineering one.** It carries `SEVERITY_STATUS = "proposed-pending-qualified-teacher-approval"`, and `mayDriveLearnerFacingCorrection()` returns `false` until a `TaxonomyApproval` exists naming an approver, their qualification, a date and their own attestation. There is no configuration flag that bypasses this.

## 7. Dataset separation

Four splits: `training`, `validation`, `test`, `production-benchmark`. The benchmark set is kept separate from `test` so that repeated measurement against it cannot quietly become tuning.

**Assignment is per speaker, not per recording.** Every recording of a speaker follows their assignment, so "which split is this recording in?" is derived rather than a field someone can edit for one row.

`leakageReport` names seven failure modes:

| Kind | Why it matters |
|---|---|
| `speaker-across-splits` | A model that trained on a voice recognises the voice, not the recitation. |
| `session-across-splits` | One sitting shares a microphone and a room; acoustics carry across the boundary. |
| `family-across-splits` | Retakes and cut-up recordings are near-duplicates — testing on training data. |
| `duplicate-audio-across-splits` | The identical file on both sides. Nothing measured this way means anything. |
| `training-use-not-permitted` | Consent or usability forbids training use. A consent violation before a methodology one. |
| `evaluation-sample-marked-trainable` | Held-out data that also offers itself to training. |
| `unassigned-sample` | Undefined membership — leakage waiting to happen. |

The report **names violations and fixes nothing**. A loader that silently repaired a leak would be the place the leak got hidden. `trainingSamples` and `evaluationSamples` re-check split, usability *and* consent scope at the point of use, so a sample must pass all three to be read.

### Leakage risks that no code can catch

- **The same person under two speaker ids.** A learner who records on two devices, or re-enrols, becomes two speakers. Needs an enrolment process, not a check.
- **Relatives and students of one teacher** share prosody and regional pronunciation. Speaker separation does not separate a household or a halaqah.
- **The same ayah everywhere.** Short surahs dominate practice; a test set of al-Ikhlas measures memorised audio, not recitation.
- **Reviewer leakage.** If the same teacher labels a speaker in both training and test, their idiosyncrasies transfer through the labels. Track reviewer coverage per split.

## 8. Benchmark design

Nine metrics are defined in `shared/pronunciationBenchmark.ts`, each with what it counts, how it is computed, the labels it reads, the learner impact, and how it can be gamed:

| Metric | Unit | Direction |
|---|---|---|
| Word-position tracking accuracy | ratio | higher is better |
| Omission detection (P/R/F1) | ratio | higher is better |
| Insertion detection (P/R/F1) | ratio | higher is better |
| Substitution detection (P/R/F1) | ratio | higher is better |
| Letter / phoneme error detection | ratio | higher is better |
| **False correction rate** | ratio | lower is better |
| Missed correction rate | ratio | lower is better |
| Latency to correction (p50, p95) | ms | lower is better |
| Confidence calibration (ECE) | calibration error | lower is better |

**False corrections are the expensive error.** Telling a learner they mis-recited the Quran when they did not is discouraging and teaches them to distrust every later correction. It is reported as a first-class metric — and always beside the missed-correction rate, because a system that abstains always scores perfectly on one and terribly on the other.

**Every target is a placeholder.** Four metrics carry a proposed number (word-position accuracy 0.95, omission-detection F1 0.90, false-correction rate 0.02, calibration ECE 0.05), each marked `status: "proposed-placeholder"` with reasoning that says plainly it exists to be argued with. `hasApprovedTarget()` returns `false` for every metric. The other five carry no number at all, because inventing one would be worse than admitting it is unknown.

**The agreement ceiling.** A model cannot be scored above the rate at which two qualified teachers agree with each other. Until inter-rater agreement is measured at each scope, a letter-level score has no meaning — a model matching adjudicated labels better than teachers match each other indicates a broken benchmark, not a good model.

## 9. Privacy and consent

**Meaningful learner voice collection must not begin until all four of these exist:**

1. **Consent** — per reciter, captured before recording, naming permitted uses (teacher review, training, evaluation, benchmark) and recorded as an id on every sample.
2. **Retention** — a deletion date on every sample, enforced by something that actually deletes.
3. **Deletion / withdrawal** — a working route by which a reciter withdraws, removing audio *and* labels, including from derived sets, with a stated turnaround.
4. **Access control** — a named list of who may play recordings, and a log of who did.

Additional standing rules:

- **No learner audio in this repository.** Not one file, not "just an example". `.gitignore` excludes `datasets/*/manifest.json`, `audio/` and `labels/`; the tracked examples carry no audio and reference storage keys that resolve to nothing.
- **Tests use synthetic fixtures only** (`shared/pronunciationDatasetFixtures.ts`) — invented speakers, invented consent ids, no audio behind any of them.
- **The labeling prototype collects nothing.** A reviewer may open an authorised recording from their own disk to listen; the file is played locally, never uploaded, never attached to a label, never persisted.
- **Minors.** Quran learners include children. Collection from a minor needs guardian consent and a separate retention rule, and until that path is designed, no recording from a minor should be collected at all.
- **Recitation is religious speech.** A recording of someone reciting the Quran is not neutral personal data; it may be embarrassing to have a poor attempt retained. Retention defaults should be short and deletion should be easy.

## 10. Collection protocol

A sketch, to be reviewed with teachers before use:

1. **Enrol** the reciter: consent captured, speaker id issued, research attributes collected only where a stated question needs them.
2. **Prompt** with a specific ayah from the app's own Quran data, displayed as the learner normally sees it.
3. **Record** one ayah per sample where possible. Where a longer recording is cut into ayat, all pieces share a `recordingFamilyId`.
4. **Retakes** stay in the same family and the same session.
5. **Capture** device metadata automatically; never ask the reciter for it.
6. **Quality-check** on ingest: duration, clipping, silence, sample rate. Mark, do not discard — an unusable recording is evidence about collection conditions.
7. **Queue** for review. Two independent reviews by default.

### Device diversity requirements

A dataset recorded on one phone model in one quiet room measures that room. Target coverage across:

- device class: phone (low-end and high-end), tablet, laptop, headset;
- microphone: built-in, wired headset, Bluetooth (which resamples and denoises aggressively), external;
- sample rate: at least 16 kHz and 44.1/48 kHz sources;
- codec: Opus/WebM as the app records, plus at least one uncompressed source;
- environment: quiet room, room with background speech, outdoors, reverberant hall.

Report the distribution in the dataset card. A metric that is not reported per device class hides the case that fails.

### Speaker diversity considerations

The app teaches in Pashto, Dari, Urdu, Arabic and English. A dataset that is mostly fluent Arabic speakers will not measure what the app is for. Consider coverage across: first language; recitation experience from absolute beginner to qari; age band including children (subject to §9); gender; and regional recitation style. Every one of these is a research attribute requiring justification and consent — collect only what a stated question needs, and report what was collected.

## 11. Quality control

- **Reviewer calibration set.** A small set of samples labeled by every reviewer, to measure inter-rater agreement per label and per scope, repeated periodically.
- **Agreement reporting** as a first-class dataset statistic. Low agreement on a category is a finding about the *taxonomy*, not about the reviewers.
- **Adjudication audit.** A sample of adjudications re-read by a third teacher, checking that rationales are real reasons.
- **Gold samples** seeded into review queues to detect drift.
- **Review time** recorded per review (`reviewMinutes`): implausibly fast labeling is a quality signal.
- **Label distribution** monitored: a category nobody ever uses is a category that needs rewording or removal.
- **Ingest checks** on every manifest: schema validity, split-plan leakage, consent scope, retention dates in the future.

## 12. Known unknowns requiring qualified Qari input

Each of these is recorded in code as an `openQuestion` on the label it concerns:

1. **Is the taxonomy complete?** Which categories are missing, which should be split (is a wrong harakah on the last letter of a word a `harakah-vowel-error` or a `waqf-stop-issue`?), which should be merged.
2. **Which riwayah?** Madd counts, some waqf rulings and permissible variation differ. A dataset labeled across riwayat without recording which is being applied is unusable. `TeacherReviewer.riwayah` records it; the policy is unwritten.
3. **Where does an imprecise makhraj become a letter substitution?** Two teachers may split the same audio differently, and the boundary decides which metric a model is measured on.
4. **Is self-correction an error?** A learner who repeats a word to fix it has done the right thing. Should `repeated-word` apply, or a separate non-error observation?
5. **What does `correct-recitation` assert at word scope?** Tajwid-correct, or merely correct words? Two different labels?
6. **Which errors are `blocking-correction`?** The severity ordering decides what interrupts a learner mid-recitation, and it needs teacher approval before it shapes any behaviour.
7. **When should the app stay silent?** A learner practising alone may be better served by silence than by an uncertain correction. This is a teaching judgement about the *product*, not a threshold.
8. **How much agreement is enough?** What inter-rater agreement makes a category usable as ground truth at all.
9. **Who may adjudicate?** What qualification an adjudicator needs, and whether a single adjudicator suffices.
10. **Is a stop an error?** Which waqf choices are wrong rather than merely non-preferred, and under whose ruling.

Until these are answered, the taxonomy stays `proposed`, the severity levels may not drive learner-facing behaviour, and no accuracy claim can be made about anything.
