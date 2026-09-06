# Quran acoustic teacher-labeling guide

## Purpose and boundary

A qualified Qari/Quran teacher supplies the religious and phonetic judgment. Software records structured observations; generic transcription is not evidence of correct makhraj or tajweed. When the recording or rule is ambiguous, choose **uncertain** rather than forcing a diagnosis.

## Workflow

1. Confirm consent/source notes and an anonymized speaker ID before listening.
2. Verify the surah, ayah, and one-based word index against the Mushaf text.
3. Listen independently at normal speed, then replay only as needed. Note clipping, noise, overlap, and microphone artifacts under recording quality.
4. Select exactly one primary label below. Add a secondary note only when needed; do not infer an error from transcription output.
5. A second qualified reviewer adjudicates disagreements. Preserve `uncertain` if evidence remains insufficient.
6. Record the rule or confusion pair only when audible evidence supports it. Never turn metadata taxonomy into a claim that the product detects it.

## Primary labels

- **correct** — no target error is heard within the reviewed scope.
- **phoneme_error** — the produced consonant differs in makhraj or relevant quality; record intended and observed phoneme when confident.
- **madd_duration_issue** — a required vowel length is materially shortened or lengthened; note the applicable madd and measured/estimated duration.
- **ghunnah_issue** — nasalization is missing, excessive, or applied where it should not be; name the context.
- **qalqalah_issue** — qalqalah is missing, excessive, or incorrectly applied; identify the letter and stop/continuation context.
- **pause_waqf_issue** — the stop, continuation, or restart is problematic; record the waqf sign/context.
- **uncertain** — audio quality, recitation variation, scope, or reviewer confidence is insufficient. This is a first-class outcome and must not be scored as correct or incorrect.

## Quality and review

Use a controlled vocabulary such as `clean`, `minor_noise`, `noisy`, `clipped`, or `unusable`. Keep raw teacher notes separate from learner-facing guidance. Benchmark releases should document reviewer qualifications, agreement/adjudication, consent, collection conditions, and label distribution. False-positive corrections are especially costly, so threshold selection should prioritize precision and abstain on weak evidence.
