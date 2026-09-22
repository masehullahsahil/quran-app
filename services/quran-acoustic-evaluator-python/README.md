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
ACOUSTIC_GPU_HOURLY_USD=0.69 \
ACOUSTIC_DEEP_REVIEW_MINUTES_PER_LEARNER_MONTH=15 \
ACOUSTIC_MAX_GPU_USD_PER_AUDIO_HOUR=0.60 \
pnpm benchmark:muaalem-shadow
```

This command intentionally does not print recording paths, expected text, or
decoded tokens. It reports runtime coverage and latency only—not pronunciation
accuracy. When an hourly GPU price is supplied, it also reports sustained
processing throughput, an active-compute cost estimate, and an optional cost
gate. The estimate excludes idle time, cold starts, storage, egress, and the
separate transcription service. Accuracy remains unavailable until adjudicated
teacher labels exist.

The example affordability gate reflects the free-first pilot target: at most 15
deep-review audio minutes per highly active learner each month, with GPU cost no
higher than $0.60 per processed audio hour. Prices are inputs rather than
hard-coded assumptions so every deployment uses the provider's current rate.

## Private GPU container

The repository includes a single container that runs the Node evaluator on port
4317 and the Python model worker on loopback port 4318. Only the authenticated
Node service is exposed. The container refuses to start without
`QURAN_EVALUATOR_API_KEY`, and it remains unhealthy until the pinned Muaalem
checkpoint has loaded successfully.
It also sets `QURAN_ACOUSTIC_REQUIRE_CUDA=1`, so a misconfigured GPU host fails
startup instead of silently benchmarking slow CPU inference.

Build from the repository root:

```bash
docker build \
  --file services/quran-acoustic-evaluator/Dockerfile.gpu \
  --tag quran-acoustic-evaluator:shadow .
```

After this change is merged, the manually triggered **Publish Acoustic GPU
Image** GitHub workflow can build the same Dockerfile and publish an immutable
`ghcr.io/masehullahsahil/quran-acoustic-evaluator:sha-<commit>` image. It never
runs automatically on pushes or pull requests because the CUDA/PyTorch image is
large. Do not place service keys in the image or workflow; inject them only into
the selected GPU host at runtime.

Run on a host with the NVIDIA container runtime and a persistent model cache:

```bash
docker run --rm --gpus all \
  --publish 4317:4317 \
  --env QURAN_EVALUATOR_API_KEY=replace-with-a-private-service-key \
  --volume quran-model-cache:/models/huggingface \
  quran-acoustic-evaluator:shadow
```

Do not expose port 4318. Do not configure the production Quran app to call this
container during the first deployment. First verify `GET /health` returns HTTP
200 with `shadowReady: true`, then run the private benchmark against consented
recordings. The health route contains no key, audio, transcript, or decoded
token. All evaluation requests still require the bearer key.

Use a persistent GPU instance for the initial benchmark. Scale-to-zero and
serverless GPU products can hide model-load latency behind cold starts, which
would make the first measurements misleading. A provider and paid instance must
be selected separately; this repository does not create billable infrastructure.

The local Muaalem loader is derived from the upstream MIT-licensed reference
implementation. Its required copyright and license notice is retained in
`THIRD_PARTY_NOTICES.md`.
