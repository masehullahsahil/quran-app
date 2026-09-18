# Optional Quran acoustic model worker

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

## Muaalem shadow mode

The same worker can load the open-source Muaalem multi-level CTC checkpoint for
full-utterance research inference. This path is deliberately **shadow-only**:
its phoneme and sifat tokens are reduced to aggregate diagnostics by the Node
service and cannot create a correction, change a score, or advance a learner.

The worker requires an explicit learner-microphone provenance marker and rejects
other origins. This preserves ECHO-01: tutor and Qari playback are never accepted
as learner evidence. Configure an optional bearer key when the service is not
fully isolated on a private network.

```bash
QURAN_ACOUSTIC_SHADOW_MODEL=obadx/muaalem-model-v3_2 \
QURAN_ACOUSTIC_SHADOW_REVISION=01a1ef9fbe40d144ef845101e89ff924aed3fef5 \
QURAN_ACOUSTIC_API_KEY=replace-with-a-private-service-key \
uvicorn app:app --host 0.0.0.0 --port 4318

QURAN_ACOUSTIC_SHADOW_URL=http://127.0.0.1:4318/v1/shadow/analyze \
QURAN_ACOUSTIC_SHADOW_API_KEY=replace-with-a-private-service-key \
QURAN_EVALUATOR_API_KEY=replace-with-a-private-service-key \
pnpm acoustic:dev
```

`QURAN_EVALUATOR_API_KEY` protects the Node evaluator itself. The app server and
private benchmark runner send the same value as a bearer token. The acoustic
shadow key protects the Python worker and may be a different secret.

The checkpoint is approximately 2.4 GB and should run on a separately managed
GPU service, not Vercel. Its decoded frame posteriors are not calibrated
correctness probabilities. Before any output can become learner-facing, it must
be benchmarked on consented, teacher-labelled recordings from held-out learners
and devices. No recording or decoded token is logged.

The documented revision is pinned so deployment cannot silently change model
weights when the upstream repository moves. Changing it requires a new benchmark.

Run the dependency-free decoder regression tests with:

```bash
python services/quran-acoustic-evaluator-python/test_muaalem_shadow.py
```

Once the worker and Node evaluator are running, measure inference coverage and
latency against an authorized private manifest with:

```bash
QURAN_EVALUATOR_URL=http://127.0.0.1:4317 \
ACOUSTIC_BENCHMARK_MANIFEST=/private/path/manifest.json \
pnpm benchmark:muaalem-shadow
```

This command intentionally does not print recording paths, expected text, or
decoded tokens. It reports runtime coverage and latency only—not pronunciation
accuracy. Accuracy remains unavailable until adjudicated teacher labels exist.
