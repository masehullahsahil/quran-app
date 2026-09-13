#!/usr/bin/env python3
"""Persistent transcription worker for the Quran ASR bake-off.

Loads one Hugging Face ASR model once, then reads JSON lines from stdin:
    {"id": "<req id>", "audio_path": "/tmp/.../sample.wav"}
and writes one JSON line per request to stdout:
    {"id": "<req id>", "ok": true, "text": "...", "latencyMs": 123}
    {"id": "<req id>", "ok": false, "error": "...", "detail": "...", "latencyMs": 123}

First line on stdout is {"event": "ready", "device": "cuda"|"cpu"}.

Model download policy: weights are NEVER committed to git. On first run the
model is fetched from the Hugging Face Hub into the standard HF cache
($HF_HOME / ~/.cache/huggingface) ONLY when --allow-download is passed.
Otherwise the worker refuses to start unless the weights are already cached.

Requires: transformers, torch, huggingface_hub, librosa
(see server/asrBakeoff/requirements.txt)
"""

import argparse
import json
import sys
import time


def log_event(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="HF repo, e.g. tarteel-ai/whisper-base-ar-quran")
    parser.add_argument("--allow-download", action="store_true",
                        help="permit downloading weights into the HF cache")
    args = parser.parse_args()

    import torch
    from huggingface_hub import snapshot_download
    from transformers import pipeline

    # Resolve (and optionally fetch) the weights before loading the pipeline,
    # so a missing cache fails fast with a clear message instead of hanging.
    try:
        snapshot_download(repo_id=args.model, local_files_only=not args.allow_download)
    except Exception as exc:  # noqa: BLE001 - surfaced to the operator verbatim
        sys.stderr.write(
            f"model '{args.model}' is not cached and --allow-download was not given: {exc}\n"
        )
        sys.exit(3)

    device = 0 if torch.cuda.is_available() else -1
    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

    pipe = pipeline(
        "automatic-speech-recognition",
        model=args.model,
        device=device,
        torch_dtype=torch_dtype,
        chunk_length_s=30,
    )

    import librosa  # noqa: E402  (import after pipeline setup keeps startup errors ordered)

    log_event({"event": "ready", "device": "cuda" if device == 0 else "cpu"})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        req_id = req.get("id", "")
        t0 = time.time()
        try:
            # 16 kHz mono is what Whisper-family models expect.
            audio, _sr = librosa.load(req["audio_path"], sr=16000, mono=True)
            if audio is None or len(audio) == 0:
                raise ValueError("decoded audio is empty")
            out = pipe(audio)
            text = out["text"] if isinstance(out, dict) else ""
            log_event({"id": req_id, "ok": True, "text": text,
                       "latencyMs": int((time.time() - t0) * 1000)})
        except Exception as exc:  # noqa: BLE001 - reported per-request, worker stays up
            log_event({"id": req_id, "ok": False, "error": type(exc).__name__,
                       "detail": str(exc)[:300],
                       "latencyMs": int((time.time() - t0) * 1000)})


if __name__ == "__main__":
    main()
