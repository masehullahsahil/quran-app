# Phase A Benchmark Protocol — Consented Word-Recognition Recordings

This protocol applies only to the **offline word-guidance** proof of concept. It evaluates whether the model recognises expected Quran words in a selected ayah. It does **not** evaluate or label tajwid, makhraj, melody, religious correctness, or overall recitation quality.

## Consent and data handling

Each participant must opt in before providing a recording. The opt-in must be separate from ordinary app use, state that the recording will be analysed by a local ASR benchmark, and state whether the recording may also be retained as a separate seed dataset for the later offline IqraEval research track. A participant may consent to Phase A without consenting to Phase B.

Store recordings only in `benchmark-data/`, which is ignored by Git. Do not upload raw recordings to GitHub. Assign each recording a random participant code rather than a name, email address, or account ID. Remove a recording and its row from the manifest if the participant withdraws consent.

## Required recording set

Record a small initial set across the browser and microphone conditions the app supports. Each sample should contain one selected ayah read at a normal learner pace. Preserve the original browser-produced WebM/Opus file, and note the browser, platform, microphone type, selected surah/ayah, and reference Arabic text.

Create `benchmark-data/manifest.csv` from this header:

```csv
sample_id,phase_a_consent,phase_b_research_consent,participant_code,browser,platform,microphone,codec,surah,ayah,reference_arabic,recorded_at_utc,notes
```

For longer recordings intended as a possible Phase B seed dataset, set `phase_b_research_consent` to `yes` only when that separate consent was obtained. No IqraEval testing may use any row where it is not `yes`.

## Measurements to report

| Measurement | Definition |
| --- | --- |
| Cold-start time | Process start to model-ready time; measured separately from audio inference. |
| Per-sample inference time | Start of transcriber call to completed response, in milliseconds. Report p50 and p95 after enough samples exist. |
| Transcript alignment quality | Reference-aware word recall, precision, and F1 for each selected ayah. |
| Unavailable/error rate | Proportion of requests without a usable transcript, grouped by codec/browser/device where possible. |
| Decoder evidence | Preserve only the response’s diagnostic ASR evidence. Do not reinterpret it as pronunciation accuracy. |

## Stop condition

Do not add WebSocket/VAD/live-streaming work and do not expose any learner-facing judgement until the user has reviewed the Phase A benchmark report. The only admissible future learner wording from this track is conservative transcript-alignment guidance such as “heard this word” or “try this word again.”
