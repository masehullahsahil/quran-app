"""Configuration for the offline Phase A proof of concept."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_DIR = PROJECT_ROOT / "models" / "tarteel-whisper-base-ar-quran-ct2"


@dataclass(frozen=True)
class Settings:
    model_dir: Path
    model_id: str
    device: str
    compute_type: str
    max_audio_bytes: int

    @classmethod
    def from_environment(cls) -> "Settings":
        device = os.getenv("WORD_GUIDANCE_DEVICE", "cpu").strip().lower()
        if device not in {"cpu", "cuda"}:
            raise ValueError("WORD_GUIDANCE_DEVICE must be either 'cpu' or 'cuda'.")

        default_compute = "int8" if device == "cpu" else "float16"
        compute_type = os.getenv("WORD_GUIDANCE_COMPUTE_TYPE", default_compute).strip()
        max_audio_bytes = int(os.getenv("WORD_GUIDANCE_MAX_AUDIO_BYTES", str(10 * 1024 * 1024)))
        if max_audio_bytes <= 0:
            raise ValueError("WORD_GUIDANCE_MAX_AUDIO_BYTES must be greater than zero.")

        return cls(
            model_dir=Path(os.getenv("WORD_GUIDANCE_MODEL_DIR", str(DEFAULT_MODEL_DIR))).expanduser(),
            model_id=os.getenv("WORD_GUIDANCE_MODEL_ID", "tarteel-ai/whisper-base-ar-quran"),
            device=device,
            compute_type=compute_type,
            max_audio_bytes=max_audio_bytes,
        )
