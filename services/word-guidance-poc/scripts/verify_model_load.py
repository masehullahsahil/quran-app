"""Verify that the locally converted Phase A checkpoint can be loaded.

This script deliberately performs no transcription and processes no learner audio.
"""

from pathlib import Path

from faster_whisper import WhisperModel

from app.settings import Settings


def main() -> None:
    settings = Settings.from_environment()
    if not settings.model_dir.exists():
        raise SystemExit(f"Converted model directory is missing: {settings.model_dir}")

    WhisperModel(
        str(Path(settings.model_dir)),
        device=settings.device,
        compute_type=settings.compute_type,
    )
    print(
        "Loaded local Quran ASR checkpoint successfully. "
        "No learner audio was processed and no pronunciation assessment was performed."
    )


if __name__ == "__main__":
    main()
