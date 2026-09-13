# Quran ASR bake-off

An isolated harness for comparing the app's current transcription path against
Quran-fine-tuned Whisper models, using the exact same real recitation
recordings and the exact production alignment engine.

**This is not a WER competition.** The bake-off exists because our real-device
failures were never about benchmark scores: Whisper returned zero Arabic
characters for Ayah 3, and silently dropped the dagger alif in مَـٰلِكِ (the
PR #75 root cause). Candidates are scored on those failure modes first.

## Candidates

| Adapter id | Model | License (verified 2026-09-13) |
|---|---|---|
| `production-openai-whisper` | OpenAI `whisper-1` via API (current production path) | API service, no weights ship |
| `tarteel-whisper-base-ar-quran` | `tarteel-ai/whisper-base-ar-quran` | Apache-2.0 |
| `quran-whisper-large-v3-turbo` | `naazimsnh02/whisper-large-v3-turbo-ar-quran` | Apache-2.0 |

See `server/asrBakeoff/LICENSES.md` for the verification log. Models with
non-commercial / no-profit licenses (Quran-Lab NPL-1.1, Muno459/fastconformer-quran)
are refused by the adapter factory — not just by convention.

## Quick start

```bash
# 1. Harness only (no models): runs unit tests + empty-corpus report
pnpm test -- server/asrBakeoff
pnpm benchmark:asr-bakeoff

# 2. Add real recordings: drop audio into server/asrBakeoff/corpus/audio/
#    and add manifest entries (see server/asrBakeoff/corpus/README.md).

# 3. Include the production baseline (needs the same key the app uses):
OPENAI_API_KEY=... pnpm benchmark:asr-bakeoff

# 4. Include local HF models (one-time ~300MB + ~1.6GB downloads into the
#    HF cache — never into git):
python3 -m venv .venv-asr-bakeoff
source .venv-asr-bakeoff/bin/activate
pip install -r server/asrBakeoff/requirements.txt
pnpm benchmark:asr-bakeoff -- --allow-download
```

Useful flags:

```bash
pnpm benchmark:asr-bakeoff -- --adapters production-openai-whisper,tarteel-whisper-base-ar-quran
pnpm benchmark:asr-bakeoff -- --corpus /path/to/corpus --out /tmp/report.md
```

Reports go to `server/asrBakeoff/last-report.md` (+ `.json`) by default and
are git-ignored — they can contain transcripts.

## How it works

1. **Manifest** (`corpus/manifest.json`) lists real recordings with the
   expected verse text and the labelled outcome (`correct`, `omission`,
   `substitution`, `repetition`, `hesitation`, `other`).
2. **Adapters** (`server/asrBakeoff/adapters.ts`) expose one interface:
   same audio bytes in, comparable transcript out. The production adapter
   calls `transcribeAudio()` exactly the way `server/routers.ts` does
   (`language: "ar"`). The Hugging Face adapters run a persistent Python
   worker (`hfTranscribe.py`) so each model loads once per run.
3. **Evaluation** (`evaluate.ts`) reuses the production `assessRecitationTranscript`,
   `tokenizeArabic`, and `hasArabicScript` from `server/recitation.ts` —
   never a reimplementation — and captures the 13 bake-off points: Arabic
   output, raw transcript, normalized transcript, canonical text, word
   alignment, missing/extra/review decisions, false-correction check,
   omission/substitution detection, latency, memory, and failures.
4. **Metrics** (`metrics.ts`) aggregates per adapter. The **primary metric**
   is the false-correction rate on correct recitations: how often the ASR
   would cause the tutor to falsely correct a learner who recited correctly.
   WER/CER are computed but secondary.
5. **Report** (`report.ts`) renders Markdown + JSON.

### Adding another candidate later

Implement `AsrAdapter` in `adapters.ts`, add it to `createAdapters()`, and
log its license verification in `LICENSES.md`. No changes to evaluation,
metrics, or alignment code are needed.

## Metrics glossary

- **Arabic out** — % of recordings producing any Arabic script.
- **Exact match** — % where the normalized transcript exactly equals the
  normalized canonical verse.
- **False corr. (correct)** — PRIMARY. % of *correct* recitations where the
  production alignment produced any correction (missing/review/extra). A
  failed or non-Arabic transcript on a correct recitation counts, because the
  learner recited correctly and the tutor could say nothing true.
- **Omission TP** — labelled omissions where the intended word came back
  `missing`.
- **Omission FP** — % of correct recitations with at least one word marked
  `missing`.
- **Subst. det.** — labelled substitutions surfaced as `review` at the
  intended index.
- **Repet. handled** — labelled repetitions surfaced as extra words without
  breaking the other matches.
- **Empty/garbage** — % with null, empty, or non-Arabic output.
- **Median / p95 latency** — wall-clock per transcribe call.
- **WER / CER** — secondary; word/character edit distance on normalized text.

## Production feasibility

### tarteel-ai/whisper-base-ar-quran (~74M params)
- Size: ~290MB fp32 (`pytorch_model.bin`); ~170MB as int8 ONNX and ~78MB as
  ggml q8_0 in community conversions (the Taqwa iOS app ships the latter).
- Runtime: transformers (PyTorch) or whisper.cpp / sherpa-onnx for the
  converted weights. CPU-feasible, including faster-than-real-time on a
  modest server CPU with quantization.
- Vercel: not directly — serverless functions cannot host a ~300MB model
  with a warm inference loop. Realistic: a small dedicated CPU container
  (or HF Inference API) fronted by the app server.
- 1.4s chunks: comfortable on CPU; per-chunk latency well under the chunk
  length with quantized weights.

### naazimsnh02/whisper-large-v3-turbo-ar-quran (~809M params)
- Size: ~1.6GB (safetensors, fp32); ~800MB in fp16.
- Runtime: transformers (PyTorch). GPU recommended; CPU inference works but
  is several times slower than the base model and unlikely to keep up with
  live chunking.
- Vercel: not feasible. Realistic: a GPU inference service (or serverless
  GPU) called from the app server.
- 1.4s chunks: fine on GPU; on CPU expect multi-second latency per chunk —
  not viable for the live path without a GPU.

### Production baseline (OpenAI whisper-1 API)
- No model to host; latency is network + API queue. Already runs inside the
  current architecture. Cost scales per audio minute; failure modes are the
  generic-Whisper behaviors this bake-off measures (non-Arabic output,
  orthography loss).

No infrastructure is redesigned by this harness. These notes are decision
inputs for a later production proposal, not a plan.

## Safety

- The bake-off evaluates **transcription** only. A transcript mismatch is
  never a pronunciation or tajweed judgement.
- Do not claim any evaluated model can judge makhraj, madd correctness,
  ghunnah, or qalqalah. Those need the separate phoneme/tajweed architecture
  track, which is explicitly out of scope here.
- Corpus audio is git-ignored. Do not commit private recordings.
- Reports are git-ignored. Do not publish transcripts without consent.
