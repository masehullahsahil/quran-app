"""Shadow-only inference helpers for the Muaalem Quran acoustic model."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

import numpy as np

DEFAULT_MODEL_ID = "obadx/muaalem-model-v3_2"
DEFAULT_MODEL_REVISION = "01a1ef9fbe40d144ef845101e89ff924aed3fef5"
PAD_TOKEN_ID = 0


def collapse_ctc_frames(
    token_ids: Iterable[int],
    posteriors: Iterable[float],
    blank_id: int = PAD_TOKEN_ID,
) -> tuple[list[int], list[float]]:
    """Greedily collapse CTC frames and retain one posterior per emitted token."""
    collapsed_ids: list[int] = []
    collapsed_posteriors: list[float] = []
    previous: int | None = None
    run_posterior = 0.0
    for raw_token_id, raw_posterior in zip(token_ids, posteriors, strict=True):
        token_id = int(raw_token_id)
        posterior = float(raw_posterior)
        if previous is not None and token_id != previous:
            if previous != blank_id:
                collapsed_ids.append(previous)
                collapsed_posteriors.append(run_posterior)
            run_posterior = 0.0
        previous = token_id
        run_posterior = max(run_posterior, posterior)
    if previous is not None and previous != blank_id:
        collapsed_ids.append(previous)
        collapsed_posteriors.append(run_posterior)
    return collapsed_ids, collapsed_posteriors


def decode_level(
    token_ids: Iterable[int],
    posteriors: Iterable[float],
    id_to_token: dict[int, str],
) -> dict[str, Any]:
    collapsed_ids, collapsed_posteriors = collapse_ctc_frames(
        token_ids, posteriors
    )
    tokens = [id_to_token[token_id] for token_id in collapsed_ids]
    return {
        "tokens": tokens,
        # These are raw greedy CTC posteriors, not calibrated correctness scores.
        "meanPosterior": (
            sum(collapsed_posteriors) / len(collapsed_posteriors)
            if collapsed_posteriors
            else 0.0
        ),
    }


class MuaalemShadowRuntime:
    """Loads Muaalem only when the explicitly configured shadow mode is enabled."""

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL_ID,
        revision: str = DEFAULT_MODEL_REVISION,
    ) -> None:
        self.model_id = model_id
        self.revision = revision
        self.feature_extractor = None
        self.model = None
        self.device = None
        self.vocabulary: dict[str, dict[int, str]] = {}

    @property
    def ready(self) -> bool:
        return self.model is not None

    def load(self) -> None:
        import torch
        from huggingface_hub import hf_hub_download
        from transformers import AutoFeatureExtractor

        from muaalem_model import MuaalemConfig, MuaalemForMultiLevelCTC

        config = MuaalemConfig.from_pretrained(
            self.model_id, revision=self.revision
        )
        self.feature_extractor = AutoFeatureExtractor.from_pretrained(
            self.model_id, revision=self.revision
        )
        self.model = MuaalemForMultiLevelCTC.from_pretrained(
            self.model_id, config=config, revision=self.revision
        ).eval()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)
        vocabulary_path = Path(
            hf_hub_download(
                self.model_id, "vocab.json", revision=self.revision
            )
        )
        raw_vocabulary = json.loads(vocabulary_path.read_text(encoding="utf-8"))
        self.vocabulary = {
            level: {int(token_id): token for token, token_id in tokens.items()}
            for level, tokens in raw_vocabulary.items()
        }

    def analyze(self, samples: np.ndarray, sample_rate: int) -> dict[str, Any]:
        if not self.ready or self.feature_extractor is None or self.device is None:
            raise RuntimeError("Muaalem shadow model is not loaded")
        import torch

        inputs = self.feature_extractor(
            samples, sampling_rate=sample_rate, return_tensors="pt"
        )
        model_inputs = {
            key: value.to(self.device) for key, value in inputs.items()
        }
        with torch.inference_mode():
            outputs = self.model(**model_inputs)

        levels: dict[str, dict[str, Any]] = {}
        for level, logits in outputs.logits.items():
            if level not in self.vocabulary:
                continue
            probabilities = torch.softmax(logits[0], dim=-1)
            frame_posteriors, frame_ids = probabilities.max(dim=-1)
            levels[level] = decode_level(
                frame_ids.detach().cpu().tolist(),
                frame_posteriors.detach().cpu().tolist(),
                self.vocabulary[level],
            )
        return levels
