"""Offline Phase A API: transcription evidence only, not live teaching or tajwid assessment."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Callable

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .contracts import OfflineTranscriptionResponse, WORD_GUIDANCE_BOUNDARY
from .settings import Settings
from .transcriber import AudioTranscriber, FasterWhisperTranscriber


def create_app(
    settings: Settings | None = None,
    transcriber_factory: Callable[[Settings], AudioTranscriber] = FasterWhisperTranscriber,
) -> FastAPI:
    settings = settings or Settings.from_environment()
    transcriber: AudioTranscriber | None = None

    app = FastAPI(
        title="Offline Quran Word-Guidance POC",
        version="0.1.0",
        description=(
            "Offline transcription evidence for benchmark collection. "
            "It does not assess tajwid, makhraj, pronunciation quality, melody, or religious correctness."
        ),
    )

    def get_transcriber() -> AudioTranscriber:
        nonlocal transcriber
        if transcriber is None:
            transcriber = transcriber_factory(settings)
        return transcriber

    @app.get("/health")
    def health() -> dict[str, str | bool]:
        return {
            "status": "ok",
            "offline_only": True,
            "model_present": settings.model_dir.exists(),
            "safety_boundary": WORD_GUIDANCE_BOUNDARY,
        }

    @app.post("/v1/offline-transcriptions", response_model=OfflineTranscriptionResponse)
    def transcribe_offline_audio(
        audio: UploadFile = File(..., description="A short consented PCM, WAV, or WebM sample."),
    ) -> OfflineTranscriptionResponse | JSONResponse:
        if not audio.content_type or not (
            audio.content_type.startswith("audio/") or audio.content_type == "application/octet-stream"
        ):
            raise HTTPException(status_code=415, detail="Upload an audio sample as audio/* or application/octet-stream.")

        suffix = Path(audio.filename or "sample.webm").suffix or ".webm"
        with tempfile.NamedTemporaryFile(prefix="word-guidance-", suffix=suffix, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            copied = 0
            try:
                while chunk := audio.file.read(1024 * 1024):
                    copied += len(chunk)
                    if copied > settings.max_audio_bytes:
                        raise HTTPException(
                            status_code=413,
                            detail=f"Audio exceeds the {settings.max_audio_bytes}-byte offline prototype limit.",
                        )
                    temporary.write(chunk)

                if copied == 0:
                    raise HTTPException(status_code=400, detail="The uploaded audio file is empty.")

                try:
                    result = get_transcriber().transcribe(temporary_path)
                except FileNotFoundError as error:
                    return JSONResponse(
                        status_code=503,
                        content=OfflineTranscriptionResponse(
                            status="unavailable",
                            model_id=settings.model_id,
                            runtime="faster-whisper/CTranslate2",
                            processing_milliseconds=0,
                            unavailable_reason=str(error),
                            warnings=["The local model has not been prepared yet."],
                        ).model_dump(),
                    )
                except Exception as error:  # The client receives no internal stack trace or model details.
                    return JSONResponse(
                        status_code=503,
                        content=OfflineTranscriptionResponse(
                            status="unavailable",
                            model_id=settings.model_id,
                            runtime="faster-whisper/CTranslate2",
                            processing_milliseconds=0,
                            unavailable_reason="The offline transcription service could not process this sample.",
                            warnings=[f"Diagnostic type: {type(error).__name__}"],
                        ).model_dump(),
                    )

                return OfflineTranscriptionResponse(
                    status="available",
                    transcript=result.transcript,
                    detected_language=result.detected_language,
                    detected_language_probability=result.detected_language_probability,
                    segments=result.segments,
                    processing_milliseconds=result.processing_milliseconds,
                    model_id=settings.model_id,
                    runtime="faster-whisper/CTranslate2",
                    warnings=result.warnings,
                )
            finally:
                audio.file.close()
                temporary_path.unlink(missing_ok=True)

    return app


app = create_app()
