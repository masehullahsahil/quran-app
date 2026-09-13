# License verification log — ASR bake-off candidates

Verified 2026-09-13 by querying the Hugging Face Hub model API
(`GET https://huggingface.co/api/models/<repo>`, `cardData.license` field)
and reading each model card. Re-verify before any production use: licenses
and weights can change.

## Allowed in this bake-off

### tarteel-ai/whisper-base-ar-quran
- License: **Apache-2.0** (verified via HF API `cardData.license = "apache-2.0"`)
- Model card: fine-tune of `openai/whisper-base` for Quranic Arabic ASR.
  Published eval WER 5.7544. Training/evaluation dataset is undocumented on
  the card ("More information needed") — do not trust the published number
  without our own measurement.
- Files: 42 (PyTorch `pytorch_model.bin` format, no safetensors, no ONNX).
- Commercial use: permitted by Apache-2.0 (attribution + license notice).

### naazimsnh02/whisper-large-v3-turbo-ar-quran
- License: **Apache-2.0** (verified via HF API `cardData.license = "apache-2.0"`)
- Model card: fine-tune of `openai/whisper-large-v3-turbo` (LoRA, r=128) on
  the `tarteel-ai/everyayah` dataset (167,908 train / 20,976 validation /
  23,473 test). Published 1.18% WER / 0.34% CER on the test split.
  Independent measurement on our own recordings still required.
- Files: 12 (safetensors format).
- Commercial use: permitted by Apache-2.0 (attribution + license notice).

## Explicitly excluded

The bake-off adapter factory (`adapters.ts`) refuses any model whose license
is not in `ALLOWED_LICENSES` (Apache-2.0, MIT, BSD-3-Clause, BSD-2-Clause).
In particular, do NOT integrate:

- **Quran-Lab models under NPL-1.1** (e.g. `zipformer_p-arabic-v3`): the
  no-profit license forbids paid tiers, subscriptions, paywalls, and
  advertising, and states no commercial license will ever be granted.
- **Muno459/fastconformer-quran**: NPL-1.1, same terms — verified on its
  model card README ("no profit may be made from it … no commercial license
  … none will be granted").

These are technically interesting but legally incompatible with a product
that may ever monetize. Revisit only if their licensing changes.
