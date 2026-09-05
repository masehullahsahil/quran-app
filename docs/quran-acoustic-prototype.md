# Quran acoustic evaluator prototype

This standalone, deliberately conservative service implements the existing `POST /v1/evaluate` boundary. It is engineering infrastructure, not a production makhraj, tajweed, or teacher-level pronunciation judge.

## Run it

Install **ffmpeg** on the service host (required for WebM, Ogg, MP3, and MP4 decoding; PCM WAV is decoded directly), then run:

```bash
pnpm acoustic:dev
QURAN_EVALUATOR_URL=http://localhost:4317 pnpm benchmark:acoustic
```

The service accepts the app's base64 audio, MIME type, expected Arabic, surah, ayah, and learning level. The default maximum duration is 120 seconds. It converts to mono 16 kHz PCM, normalizes low-amplitude usable input, measures clipping and speech/silence, and safely abstains on empty, silent, clipped, undecodable, or excessive recordings. It does not store or log audio or expected text.

## What works now

* Deterministic PCM WAV decoding/resampling and ffmpeg conversion for the app's other recording formats.
* Energy-based voice activity regions, recording-quality confidence, and silence detection.
* Quran-aware alignment against the **known expected words**, rather than free-form transcription. Approximate word boundaries are constrained to measured active-speech time and include confidence, energy, voiced/unvoiced duration, and pauses. Uncertain regions remain measurements rather than invented corrections.
* A narrow pause observation: sufficiently long measured internal silence, calibrated relative to the recording's median word duration, can produce a confidence-gated `pause` finding. End-of-ayah silence and continuation are retained as timing measurements but do not imply a religious waqf ruling.
* Madd candidates can be located from future Quran rule metadata. Current word-level VAD cannot reliably isolate vowel-bearing segments, so no `vowel_length` finding is emitted. Word-duration measurements are retained for later speed-relative calibration.

The JSON response includes the existing contract fields. An additional `measurements` member is diagnostic and ignored safely by the current adapter. Logs contain request/audio duration, preprocessing outcome, alignment confidence, aligned-word count, abstention, and finding count—never raw audio or user text.

## What does not work yet

Reliable phoneme/makhraj detection, production tajweed scoring, teacher-level judgment, and calibrated madd or ghunnah assessment are not supported. The confusion taxonomy (ق/ك, ص/س, ض/د, ط/ت, ظ/ز/ذ, ح/ه, ع/أ, غ/خ) feeds a future `PhonemeEvaluator` interface only. Its default implementation abstains, and non-model-backed observations cannot become findings.

The aligner is a VAD-constrained timing prototype, not phoneme forced alignment. It abstains frequently. It never treats generic transcription, TTS, synthetic tones, or metadata as pronunciation ground truth.

## Benchmark meaning and next steps

`pnpm benchmark:acoustic` continues to report metadata-only fixtures as **not evaluated** without authorized recordings. When a URL is configured it separately sends a generated tone/silence case labeled **pipeline/contract validation**; that result is not Quran acoustic accuracy.

Accuracy work requires a consented, representative Quran recitation dataset; qualified-teacher labels and adjudication; held-out speakers; a phoneme/alignment model; confusion-pair training/evaluation; labeled madd, ghunnah, and pause examples; recitation-speed normalization; and confidence calibration. Only those data can justify expanding learner-facing findings.
