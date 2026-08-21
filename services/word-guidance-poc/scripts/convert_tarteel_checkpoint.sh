#!/usr/bin/env bash
# Converts the approved Tarteel Quran ASR checkpoint for *local* faster-whisper use.
# This script does not launch a server, stream microphone audio, or modify the app.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_ID="${WORD_GUIDANCE_MODEL_ID:-tarteel-ai/whisper-base-ar-quran}"
OUTPUT_DIR="${WORD_GUIDANCE_MODEL_DIR:-${ROOT_DIR}/models/tarteel-whisper-base-ar-quran-ct2}"
QUANTIZATION="${WORD_GUIDANCE_CONVERSION_QUANTIZATION:-int8}"
ASSET_SOURCE_MODEL="${WORD_GUIDANCE_ASSET_SOURCE_MODEL:-openai/whisper-base}"

if [[ -e "${OUTPUT_DIR}" && -n "$(find "${OUTPUT_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "Refusing to overwrite non-empty model directory: ${OUTPUT_DIR}" >&2
  echo "Remove it manually only if you intend to rebuild the local conversion." >&2
  exit 1
fi

mkdir -p "$(dirname "${OUTPUT_DIR}")"
ct2-transformers-converter \
  --model "${MODEL_ID}" \
  --output_dir "${OUTPUT_DIR}" \
  --quantization "${QUANTIZATION}"

# The fine-tuned Tarteel repository does not publish these standard Whisper assets.
# Retrieve only the tokenizer and feature-extractor files from the compatible base model.
hf download "${ASSET_SOURCE_MODEL}" tokenizer.json preprocessor_config.json --local-dir "${OUTPUT_DIR}"

echo "Converted ${MODEL_ID} to ${OUTPUT_DIR} (${QUANTIZATION}) with tokenizer assets from ${ASSET_SOURCE_MODEL}."
