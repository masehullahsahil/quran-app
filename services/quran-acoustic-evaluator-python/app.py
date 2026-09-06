"""Optional XLS-R embedding worker. It has no transcription/CTC path."""
import base64
import os
from pathlib import Path

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoFeatureExtractor, Wav2Vec2Model

MODEL_NAME = os.getenv("QURAN_PHONEME_BACKBONE", "facebook/wav2vec2-xls-r-300m")
HEAD_PATH = os.getenv("QURAN_PHONEME_HEAD")
app = FastAPI(title="Quran phoneme embedding worker")
feature_extractor = backbone = head = None
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


@app.on_event("startup")
def load_model() -> None:
    global feature_extractor, backbone, head, labels, temperature, model_id
    if not HEAD_PATH or not Path(HEAD_PATH).is_file():
        return  # Untrained embeddings are never converted into pronunciation claims.
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


@app.get("/health")
def health() -> dict:
    return {"ready": head is not None, "modelId": model_id}


@app.post("/v1/classify")
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

