# Quran pronunciation dataset — staging area

This directory describes a dataset that **does not exist yet**. It holds the
manifest shape, an example split plan, and nothing else.

**No audio may be committed here, ever.** Not learner recordings, not staff
recordings, not "just one example". The examples below carry no audio and point
at storage keys that resolve to nothing.

## Before any collection begins

Collection of learner voice must not start until all four exist:

1. **Consent** — a record per reciter, naming what the recording may be used for
   (teacher review, training, evaluation, benchmark), captured before recording.
2. **Retention** — a date on every sample after which it is deleted.
3. **Deletion** — a working route by which a reciter withdraws and their audio and
   labels are removed, including from any derived set.
4. **Access control** — a named list of who can play recordings, and a log of who did.

Until then, the only lawful material here is synthetic fixtures. See
`docs/pronunciation-dataset-spec.md` §Privacy.

## Layout

```
datasets/quran-pronunciation/
  README.md                  this file
  manifest.example.json      one synthetic sample, showing the schema
  split-plan.example.json    speaker-level split assignment
  manifest.json              local only, never committed
  audio/                     never committed, never created in this repository
```

`manifest.json` and `audio/` are ignored by git. If you find yourself arguing
about whether a particular recording is safe to commit, the answer is no.

## Schema

The manifest is a list of `RecordingSample` records as defined in
`shared/pronunciationDataset.ts` — surah, ayah, expected text, privacy-safe
speaker id, session and recording-family ids, device metadata, consent
reference, quality, and per-purpose usability. Labels are **not** in the
manifest: teacher reviews, adjudications and machine output are separate
documents keyed by `sampleId`, so that a labeling pass can never rewrite the
recording record and machine output can never be mistaken for a teacher label.

The split plan assigns **speakers**, not recordings, to `training`,
`validation`, `test` or `production-benchmark`. Every recording of a speaker
follows their assignment; `leakageReport` in
`shared/pronunciationDatasetSplits.ts` names any crossing.

## Relationship to the existing acoustic staging area

`datasets/quran-acoustic/` is the older, narrower staging area used by
`pnpm benchmark:acoustic` for the confidence-gated evaluator prototype. This
directory is the fuller dataset design that would eventually supersede it; the
two are kept apart so that adding a design does not change what the existing
benchmark reads.
