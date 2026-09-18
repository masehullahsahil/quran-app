"""Optional calibrated classifier and shadow-only Muaalem worker."""
import base64
import os
import secrets
from pathlib import Path
from typing import Annotated

import numpy as np
import torch
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from transformers import AutoFeatureExtractor, Wav2Vec2Model

from muaalem_shadow import MuaalemShadowRuntime

MODEL_NAME = os.getenv("QURAN_PHONEME_BACKBONE", "facebook/wav2vec2-xls-r-300m")
HEAD_PATH = os.getenv("QURAN_PHONEME_HEAD")
SHADOW_MODEL_ID = os.getenv("QURAN_ACOUSTIC_SHADOW_MODEL", "").strip()
SHADOW_MODEL_REVISION = os.getenv(
    "QURAN_ACOUSTIC_SHADOW_REVISION",
    "01a1ef9fbe40d144ef845101e89ff924aed3fef5",
).strip()
API_KEY = os.getenv("QURAN_ACOUSTIC_API_KEY", "")
app = FastAPI(title="Quran phoneme embedding worker")
feature_extractor = backbone = head = None
shadow = (
    MuaalemShadowRuntime(SHADOW_MODEL_ID, SHADOW_MODEL_REVISION)
    if SHADOW_MODEL_ID
    else None
)
labels: list[str] = []
temperature = 1.0
model_id = "unconfigured"


class Target(BaseModel):
    target: str
    candidates: list[str]


class Request(BaseModel):
    pcmBase64: str
    sampleRate: int
    target: Target
    features: dict


class ShadowRequest(BaseModel):
    pcmBase64: str
    sampleRate: int
    evidenceOrigin: str


def authorize(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    if not API_KEY:
        return
    expected = f"Bearer {API_KEY}"
    if authorization is None or not secrets.compare_digest(authorization, expected):
        raise HTTPException(401, "Unauthorized")


@app.on_event("startup")
def load_model() -> None:
    global feature_extractor, backbone, head, labels, temperature, model_id
    if HEAD_PATH and Path(HEAD_PATH).is_file():
        checkpoint = torch.load(HEAD_PATH, map_location="cpu", weights_only=True)
        labels = checkpoint["labels"]
        temperature = float(checkpoint["temperature"])
        if temperature <= 0 or not labels:
            raise RuntimeError("classifier checkpoint lacks calibration metadata")
        feature_extractor = AutoFeatureExtractor.from_pretrained(MODEL_NAME)
        backbone = Wav2Vec2Model.from_pretrained(MODEL_NAME).eval()
        head = torch.nn.Linear(backbone.config.hidden_size, len(labels))
        head.load_state_dict(checkpoint["head_state_dict"])
        head.eval()
        model_id = checkpoint.get("model_id", Path(HEAD_PATH).stem)
    if shadow is not None:
        shadow.load()


@app.get("/health")
def health() -> dict:
    return {
        "ready": head is not None,
        "modelId": model_id,
        "shadowReady": shadow is not None and shadow.ready,
        "shadowModelId": shadow.model_id if shadow is not None else None,
    }


@app.post("/v1/classify", dependencies=[Depends(authorize)])
def classify(request: Request) -> dict:
    if head is None or backbone is None or feature_extractor is None:
        raise HTTPException(503, "A calibrated teacher-labelled classifier head is not configured")
    if request.sampleRate != 16_000:
        raise HTTPException(400, "Expected mono 16 kHz PCM")
    samples = np.frombuffer(base64.b64decode(request.pcmBase64), dtype="<f4").copy()
    if samples.size < 320 or not np.isfinite(samples).all():
        raise HTTPException(400, "Invalid segment")
    inputs = feature_extractor(samples, sampling_rate=request.sampleRate, return_tensors="pt")
    with torch.inference_mode():
        embedding = backbone(**inputs).last_hidden_state.mean(dim=1)
        probabilities = torch.softmax(head(embedding)[0] / temperature, dim=-1)
    scores = {label: float(probabilities[index]) for index, label in enumerate(labels)}
    requested = {request.target.target, *request.target.candidates}
    if not requested.issubset(scores):
        raise HTTPException(422, "Classifier does not support requested confusion set")
    # Segment confidence is a separately calibrated checkpoint output if supplied;
    # otherwise conservatively use the probability mass covered by this taxonomy.
    segment_confidence = min(1.0, sum(scores[label] for label in requested))
    return {"scores": scores, "segmentConfidence": segment_confidence, "modelId": model_id}


@app.post("/v1/shadow/analyze", dependencies=[Depends(authorize)])
def analyze_shadow(request: ShadowRequest) -> dict:
    if request.evidenceOrigin != "learner_microphone":
        raise HTTPException(422, "Shadow analysis requires learner microphone evidence")
    if shadow is None or not shadow.ready:
        raise HTTPException(503, "Muaalem shadow model is not configured")
    if request.sampleRate != 16_000:
        raise HTTPException(400, "Expected mono 16 kHz PCM")
    try:
        encoded = base64.b64decode(request.pcmBase64, validate=True)
    except ValueError as error:
        raise HTTPException(400, "Invalid PCM encoding") from error
    if len(encoded) > 16_000 * 4 * 120:
        raise HTTPException(413, "Audio exceeds the shadow duration limit")
    samples = np.frombuffer(encoded, dtype="<f4").copy()
    if samples.size < 320 or not np.isfinite(samples).all():
        raise HTTPException(400, "Invalid segment")
    levels = shadow.analyze(samples, request.sampleRate)
    phoneme_tokens = levels.get("phonemes", {}).get("tokens", [])
    if not phoneme_tokens:
        return {
            "status": "abstained",
            "provider": "muaalem-shadow",
            "modelId": shadow.model_id,
            "levels": {},
        }
    return {
        "status": "available",
        "provider": "muaalem-shadow",
        "modelId": shadow.model_id,
        "levels": levels,
    }
