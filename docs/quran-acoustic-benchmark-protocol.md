# Controlled benchmark protocol for the Quran acoustic shadow evaluator

> **Scope.** This protocol governs the teacher-labeled benchmark that would let the
> acoustic shadow evaluator's predictions be _measured_. It is a readiness tool, not a
> result. The current shadow responses abstained safely; that is not accuracy evidence,
> and this protocol must not be used to claim otherwise.

## 1. Purpose and boundaries

The benchmark answers one question, later: given adjudicated teacher labels for a set
of consented recordings, how does the shadow evaluator behave — abstention rate,
agreement with adjudicated labels, precision on issue detection — so a go/no-go can be
made with evidence.

Non-goals, stated plainly:

- The benchmark does not prove the evaluator is accurate. Successful shadow responses
  that abstained safely are not accuracy evidence.
- An abstention is never evidence that a recitation was correct or incorrect.
- Labels collected here never change learner feedback, recitation capture, evaluator
  calls, Quran text, or ayah boundaries. This is a teacher-review tool only.
- No tajweed, makhraj, pronunciation, madd, ghunnah, or qalqalah claim about a
  _model_ may be made until adjudicated labels exist and the comparison has actually
  been run.

## 2. Consent and retention

Audio is the regulated part of this benchmark, not the labels. Every sample must have,
before any teacher opens it:

1. **Consent covering teacher review for this benchmark** — a consent record ID on the
   sample, naming the permitted uses. A recording whose consent does not name review
   is not eligible.
2. **A retention window** — a retain-until date on the sample. A teacher may not label a
   sample whose retention has expired.
3. **A withdrawal route** — how a speaker's withdrawal reaches the benchmark keeper,
   and what happens to their samples and labels when it does.

The teacher confirms both on every review in the labeling workflow
(`Consent and retention confirmed`). The confirmation is stored on the review itself.

## 3. Sample manifest

The benchmark runs off a manifest, not a folder of files. Each row:

| field                 | required | notes                                                                                         |
| --------------------- | -------- | --------------------------------------------------------------------------------------------- |
| sample ID             | yes      | unique, stable, no learner names                                                              |
| surah, ayah           | yes      | the expected position, from the app's Quran data                                              |
| speaker anonymized ID | yes      | never a name; speakers must not repeat across splits                                          |
| consent record ID     | yes      | per section 2                                                                                 |
| retain-until          | yes      | per section 2                                                                                 |
| audio reference       | yes      | **off-repo**: a storage pointer under the retention window, never a path into this repository |

Rules:

- **No raw audio in the repository, in a PR, in logs, or in exports.** The label files
  reference sample IDs only. The labeling page plays a recording the reviewer opens
  from their own machine; it never leaves the browser tab.
- Quran text is never copied into labels as "the answer": the expected text is the
  anchor labels attach to, exactly as the app's Quran data gives it.
- Held-out speakers: the same speaker must not appear in both the calibration set
  and the evaluation set. Splits are by speaker, not by recording.

## 4. The label schema

One review records:

1. **sample ID** — which recording this judgement belongs to.
2. **surah and ayah** — the expected position, positive integers.
3. **teacher label** — exactly one:
   - `correct` — the teacher heard no pronunciation issue in the recitation.
   - `issue` — the teacher heard a specific pronunciation issue.
   - `insufficient` — audio quality, scope, or reviewer confidence was insufficient
     to judge. A first-class outcome: never scored as correct, never as an error.
4. **issue scope (optional)** — when the label is `issue`, the teacher may locate it:
   `word` (by word index) or `phoneme` (described in words). Absent scope is valid;
   it means the teacher heard an issue without locating it.
5. **reviewer notes** — free text, kept separate from any learner-facing guidance.
6. **consent/retention confirmation** — required; a review without it is refused.

The workflow also records reviewer identity (ID + qualification, riwayah optional)
and the review timestamp. A review without a qualification is refused.

## 5. Reviewers and independence

- Reviewers are qualified Quran teachers (Qari/Qariah or equivalent). The benchmark
  release documents qualifications, but never names learners.
- Reviews are independent: a reviewer labels before seeing any other reviewer's labels
  and before seeing any model output. The labeling workflow shows no prediction —
  a tool that suggests the model's answer produces labels that agree with the model.
  Blinding is enforced in-browser: until independent review is marked complete, each
  reviewer sees only their own labels — the other reviewer's labels, notes, scope,
  and identity stay hidden, and exports contain only the reviewer's own labels.
- Disagreements go to adjudication: a named, qualified adjudicator records a final
  label with a written rationale. Reviews are never averaged, voted on, or merged.
  `insufficient` remains a valid adjudicated outcome.

## 6. Workflow

1. Assemble the manifest (section 3) and verify consent/retention on every row.
2. Assign each sample to **two** independent reviewers.
3. Each reviewer opens the consented recording locally, labels per section 4, and
   confirms consent/retention on every review.
4. Where the two reviews disagree, a third qualified adjudicator records the final
   label with rationale.
5. **Only now** run the shadow evaluator over the same samples and compare:
   adjudicated labels are the ground truth; everything else is measured against them.
6. Report per section 7, then hold a go/no-go on the evidence.

## 7. What to report

Report in this order:

1. **Inter-reviewer agreement** on the benchmark set, and the adjudication rate. Low
   agreement is a finding about the task and the guidelines, not about the model.
2. **Abstention rate** — what fraction of samples the evaluator declined to judge.
   Abstention is the conservative behaviour; report it before anything else.
3. **Agreement with adjudicated labels**, precision-first: false-positive corrections
   are especially costly for learners, so precision on `issue` matters more than
   recall.
4. **Cost/latency** from the shadow benchmark (per `summarizeShadowBenchmark`), kept
   separate from accuracy — cheap and wrong is still wrong.

Never report model accuracy before adjudicated labels exist. Never collapse
`insufficient` into `correct` or `issue` in any metric.

## 8. Readiness checklist

The benchmark may start when all of these are true:

- [ ] Consent system exists and covers teacher review for this benchmark
- [ ] Withdrawal route is defined and reaches the benchmark keeper
- [ ] Retention windows are recorded and enforced; expired samples are excluded
- [ ] Audio storage is off-repo with access limited to reviewers
- [ ] Reviewer roster of qualified teachers is confirmed
- [ ] Adjudication rule for disagreements is agreed
- [ ] Blinding verified: a second teacher on the same browser sees only their own labels
      until review is complete
- [ ] Coordinates validated (surah 1–114, valid ayah per surah); no non-issue label
      carries issue metadata
- [ ] Sample manifest is complete per section 3, with held-out speakers for splits
- [ ] The labeling workflow records the section-4 schema and refuses unconfirmed reviews

Until the checklist is green, the shadow evaluator's safe abstentions stand as the
evidence: conservative, and saying nothing about accuracy.
