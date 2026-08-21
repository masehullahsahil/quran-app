"""Local faster-whisper adapter for the offline Phase A prototype."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Protocol

from .contracts import RecognitionEvidence, TranscriptSegment
from .settings import Settings


@dataclass(frozen=True)
class TranscriptionResult:
    transcript: str
    detected_language: str | None
    detected_language_probability: float | None
    segments: list[TranscriptSegment]
    processing_milliseconds: int
    warnings: list[str]


class AudioTranscriber(Protocol):
    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        """Transcribe an audio file without issuing pronunciation-quality claims."""


class FasterWhisperTranscriber:
    """Loads a locally converted CTranslate2 checkpoint on first use."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._model = None

    def _get_model(self):
        if self._model is None:
            if not self._settings.model_dir.exists():
                raise FileNotFoundError(
                    "The converted local model was not found. Run scripts/convert_tarteel_checkpoint.sh "
                    "before sending audio to this offline prototype."
                )
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                str(self._settings.model_dir),
                device=self._settings.device,
                compute_type=self._settings.compute_type,
            )
        return self._model

    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        model = self._get_model()
        started = perf_counter()
        raw_segments, info = model.transcribe(
            str(audio_path),
            language="ar",
            task="transcribe",
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
            word_timestamps=True,
        )

        segments: list[TranscriptSegment] = []
        for segment in raw_segments:
            segments.append(
                TranscriptSegment(
                    start_seconds=max(0.0, float(segment.start)),
                    end_seconds=max(0.0, float(segment.end)),
                    text=segment.text.strip(),
                    recognition_evidence=RecognitionEvidence(
                        average_log_probability=getattr(segment, "avg_logprob", None),
                        no_speech_probability=getattr(segment, "no_speech_prob", None),
                        compression_ratio=getattr(segment, "compression_ratio", None),
                    ),
                )
            )

        transcript = " ".join(segment.text for segment in segments if segment.text).strip()
        warnings: list[str] = []
        if not transcript:
            warnings.append("No Arabic transcript was produced from this sample.")
        if getattr(info, "language_probability", 0.0) < 0.5:
            warnings.append("Language identification confidence was low; inspect this result manually.")

        return TranscriptionResult(
            transcript=transcript,
            detected_language=getattr(info, "language", None),
            detected_language_probability=getattr(info, "language_probability", None),
            segments=segments,
            processing_milliseconds=round((perf_counter() - started) * 1000),
            warnings=warnings,
        )
