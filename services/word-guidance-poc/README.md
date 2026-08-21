# Offline Quran Word-Guidance Proof of Concept

This is a **Phase A research prototype**. It loads a locally converted `tarteel-ai/whisper-base-ar-quran` checkpoint using `faster-whisper`, accepts a short audio upload, and returns Arabic transcription evidence with segment timing.

> **Safety boundary:** The prototype supports transcription-based **word recognition only**. It does not evaluate or claim tajwid, makhraj, pronunciation quality, melody, religious correctness, or teacher-equivalent feedback.

## Deliberate exclusions

The prototype is not connected to the React app, tRPC route, Vercel deployment, QRC, any hosted inference provider, microphone capture, VAD, WebSocket transport, or live streaming. It has no learner-facing user interface.

## Local setup

Install the dependencies in `requirements.txt`, then convert the approved Tarteel checkpoint to a local CTranslate2 directory:

```bash
./scripts/convert_tarteel_checkpoint.sh
PYTHONPATH=. python3 scripts/verify_model_load.py
```

The converter uses the Tarteel fine-tune weights and retrieves the standard Whisper tokenizer and preprocessor assets from `openai/whisper-base`, because the Tarteel model repository does not publish those two files. The local converted model stays under `models/` and is ignored by Git.

## Test and run

```bash
PYTHONPATH=. pytest -q
PYTHONPATH=. uvicorn app.main:app --host 127.0.0.1 --port 8100
```

`POST /v1/offline-transcriptions` accepts a short `audio/*` upload. A missing local model, a decode failure, empty audio, or an oversize upload yields a structured safe error rather than a fabricated result.

## Benchmarking

Use only recordings for which explicit Phase A consent was obtained. Follow [BENCHMARK_PROTOCOL.md](./BENCHMARK_PROTOCOL.md). Raw audio and benchmark manifests belong in `benchmark-data/`, are excluded from version control, and must not be uploaded to GitHub.

No streaming/VAD/WebSocket work begins until the Phase A latency and transcript-alignment report is available and reviewed. The separate IqraEval research track must remain offline and use only samples that also have explicit Phase B research consent.
