# Optional phoneme representation worker

This worker extracts pooled **XLS-R 300M** speech embeddings from already-aligned
16 kHz phoneme segments and applies a locally supplied, temperature-calibrated
linear classification head. It does not transcribe audio. The checkpoint must be
trained and calibrated on authorized, teacher-labelled Quran recordings and
contain `labels`, `temperature`, `model_id`, and `head_state_dict`. Without that
checkpoint `/v1/classify` returns 503, causing the Node evaluator to abstain.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
QURAN_PHONEME_HEAD=/secure/quran-head.pt uvicorn app:app --host 127.0.0.1 --port 4318
QURAN_PHONEME_CLASSIFIER_URL=http://127.0.0.1:4318/v1/classify pnpm acoustic:dev
```

Model weights and recordings are deliberately not included in this repository.
