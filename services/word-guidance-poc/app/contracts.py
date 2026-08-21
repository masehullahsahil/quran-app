"""Contracts for the offline Phase A word-guidance prototype.

This service reports recognition evidence only. It deliberately does not make
phonetic, tajwid, makhraj, melody, religious, or recitation-quality claims.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


WORD_GUIDANCE_BOUNDARY = (
    "This is transcription-based word-recognition evidence only. It does not "
    "assess tajwid, makhraj, pronunciation quality, melody, or religious correctness."
)


class RecognitionEvidence(BaseModel):
    """Raw decoder evidence, not a calibrated pronunciation-confidence score."""

    average_log_probability: float | None = Field(
        default=None,
        description="Decoder evidence from Whisper; not calibrated as learner pronunciation accuracy.",
    )
    no_speech_probability: float | None = Field(
        default=None,
        description="Model estimate that the segment contains no speech.",
    )
    compression_ratio: float | None = Field(
        default=None,
        description="Decoder compression ratio for diagnostic analysis.",
    )


class TranscriptSegment(BaseModel):
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(ge=0)
    text: str
    recognition_evidence: RecognitionEvidence


class OfflineTranscriptionResponse(BaseModel):
    """A result intended for benchmark collection, not the learner UI."""

    status: Literal["available", "unavailable"]
    transcript: str = ""
    detected_language: str | None = None
    detected_language_probability: float | None = None
    segments: list[TranscriptSegment] = Field(default_factory=list)
    processing_milliseconds: int = Field(ge=0)
    model_id: str
    runtime: str
    recognition_scope: Literal["word-recognition-only"] = "word-recognition-only"
    safety_boundary: str = WORD_GUIDANCE_BOUNDARY
    warnings: list[str] = Field(default_factory=list)
    unavailable_reason: str | None = None
