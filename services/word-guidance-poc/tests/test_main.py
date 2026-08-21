from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings
from app.transcriber import TranscriptionResult


class FakeTranscriber:
    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        assert audio_path.exists()
        return TranscriptionResult(
            transcript="الْحَمْدُ لِلَّهِ",
            detected_language="ar",
            detected_language_probability=0.98,
            segments=[],
            processing_milliseconds=42,
            warnings=[],
        )


def test_transcription_contract_is_word_recognition_only(tmp_path: Path) -> None:
    settings = Settings(
        model_dir=tmp_path / "prepared-model",
        model_id="tarteel-ai/whisper-base-ar-quran",
        device="cpu",
        compute_type="int8",
        max_audio_bytes=1024,
    )
    client = TestClient(create_app(settings, transcriber_factory=lambda _: FakeTranscriber()))

    response = client.post(
        "/v1/offline-transcriptions",
        files={"audio": ("sample.webm", b"synthetic-test-bytes", "audio/webm")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "available"
    assert body["transcript"] == "الْحَمْدُ لِلَّهِ"
    assert body["recognition_scope"] == "word-recognition-only"
    assert "does not assess tajwid" in body["safety_boundary"].lower()
    assert "pronunciation_score" not in body


def test_model_not_prepared_returns_retryable_unavailable_state(tmp_path: Path) -> None:
    settings = Settings(
        model_dir=tmp_path / "missing-model",
        model_id="tarteel-ai/whisper-base-ar-quran",
        device="cpu",
        compute_type="int8",
        max_audio_bytes=1024,
    )
    client = TestClient(create_app(settings))

    response = client.post(
        "/v1/offline-transcriptions",
        files={"audio": ("sample.webm", b"synthetic-test-bytes", "audio/webm")},
    )

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["transcript"] == ""
    assert body["unavailable_reason"]


def test_empty_audio_is_rejected(tmp_path: Path) -> None:
    settings = Settings(
        model_dir=tmp_path / "missing-model",
        model_id="tarteel-ai/whisper-base-ar-quran",
        device="cpu",
        compute_type="int8",
        max_audio_bytes=1024,
    )
    client = TestClient(create_app(settings))

    response = client.post(
        "/v1/offline-transcriptions",
        files={"audio": ("sample.webm", b"", "audio/webm")},
    )

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()
