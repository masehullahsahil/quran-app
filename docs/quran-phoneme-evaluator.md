# Quran phoneme/makhraj evaluator — Phase 2 prototype

This is conservative phoneme infrastructure, not evidence that the application
can reliably judge recitation. The existing `/v1/evaluate` contract and main-app
fallback remain unchanged. Generic STT is neither used nor accepted as truth.

## Implemented

The Node service extracts consonant targets from the known, aligned Quran word,
localizes a short region within the VAD-constrained word, computes deterministic
signal/spectral diagnostics, and calls an optional model worker. Quranic combining
marks are removed only in this acoustic view; shaddah repeats its consonant and
hamza seat forms canonicalize to `أ`. Display and textual-recall normalization are
not modified.

The optional Python worker uses `facebook/wav2vec2-xls-r-300m` embeddings and a
locally supplied temperature-calibrated linear head. XLS-R provides a practical,
widely available multilingual speech representation with Arabic exposure, while
Python/PyTorch keeps model weight and compute outside Node and Vercel. It has no
decoder or transcription path. An unconfigured/untrained worker returns 503 and
the evaluator abstains. A real checkpoint must be trained using authorized labels;
repository tones validate plumbing only.

Supported taxonomy is **ق/ك, ص/س, ح/ه, ط/ت, and ض/د**, plus the cleanly supported
groups **ظ/ز/ذ, ع/أ, and غ/خ**. “Supported” means target extraction, model label,
and scoring architecture exist—not that discrimination accuracy is established.

## Alignment and confidence gates

No target is scored when the word is missing/unsupported, VAD localization is
weak, the segment is too short/long or silent, or signal/alignment quality is low.
Silence and clipping are rejected before model inference. Final promotion checks
the preprocessing signal quality, word alignment, segment confidence, classifier
candidate confidence, candidate-over-target margin, evidence quality, model ID,
and overall confidence again at the service trust boundary. Thus a mocked or
remote classifier cannot bypass safety gates. At most three findings are returned.

All thresholds live in `thresholds.ts`. They are deliberately strict prototype
values pending calibration on held-out, teacher-labelled Quran audio. False
negatives are preferred over false-positive corrections. Learner-facing output is
the existing generic `phoneme` finding; model jargon and candidate labels remain
internal development metadata. Logs contain target word/grapheme, alignment,
duration, model confidence, candidate, and finding/abstain decision, never audio.

## Benchmark interpretation

`pnpm benchmark:acoustic` separately prints contract/pipeline validation and the
real phoneme benchmark. Synthetic tones/TTS are **pipeline validation**, never
“phoneme accuracy.” Without an authorized manifest, real evaluation and per-pair
precision, recall, false-positive rate, abstention rate, and support are explicitly
reported as not evaluated. Manifest v2 can record target grapheme, observed label,
confusion pair, one-based word index, anonymized speaker, recording quality,
teacher confidence, and adjudication. Private audio must remain outside Git.

## Not established

Real-world makhraj accuracy, dialect/reciter robustness, child/adult robustness,
microphone robustness, tajweed correctness, and teacher equivalence remain wholly
unestablished. This phase does not implement madd, ghunnah, or qalqalah.

## Data and models required next

Train, calibrate, and evaluate the classifier head with consented teacher-labelled
Quran word/phoneme recordings from multiple speakers, including correct examples,
intentional or independently verified confusions, clean and noisy microphones,
and held-out speakers. Qualified reviewers must supply confidence and adjudicate
disagreements. Only those held-out results can justify threshold changes or claims.
