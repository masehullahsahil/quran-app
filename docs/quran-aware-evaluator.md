# Quran-Aware Acoustic Evaluator Contract

The web application has two separate review paths. The standard path uses Arabic speech transcription to help learners keep their place and compare recalled words. The optional path defined here accepts a **specialised Quran-aware acoustic service** that can return a limited, confidence-gated practice observation. It is designed for a separately deployed model service and is not run inside the Vercel application.

> **Instructional boundary.** An `available` response is a practice observation, not a certification of tajwid, makharij, melody, religious correctness, or a replacement for a qualified teacher. The evaluator must abstain whenever its confidence is insufficient.

## Configuration

Set the following server-side variables in the app environment. Do not expose them through `VITE_` variables.

| Variable | Purpose |
|---|---|
| `QURAN_EVALUATOR_URL` | Base URL of the specialised evaluator service. The app calls its `/v1/evaluate` route. |
| `QURAN_EVALUATOR_API_KEY` | Optional bearer token for that service. |
| `QURAN_EVALUATOR_TIMEOUT_MS` | Optional deadline; defaults to 8 seconds and is clamped between 1 and 20 seconds. |

Without `QURAN_EVALUATOR_URL`, the existing transcript-based word-recall review continues unchanged.

## Request

The app makes a server-to-server `POST` request to:

```text
{QURAN_EVALUATOR_URL}/v1/evaluate
```

with JSON content and, when configured, an `Authorization: Bearer <QURAN_EVALUATOR_API_KEY>` header.

```json
{
  "audioBase64": "raw base64 without a data-URL prefix",
  "mimeType": "audio/webm",
  "expectedArabic": "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  "surah": 1,
  "ayah": 1,
  "learningLevel": "beginner"
}
```

The input recording is already limited by the app to 3 MB. The service must treat the audio as sensitive learner data, avoid logging raw audio or credentials, and apply its own size validation.

## Response

The service may return `available` only when it has a grounded, confidence-gated observation. The app rejects values outside `0–1`, filters unknown finding kinds, limits output to three findings, and converts confidence lower than `0.75` to `abstained`.

```json
{
  "status": "available",
  "provider": "quran-phoneme-service",
  "confidence": 0.89,
  "summary": "Repeat the marked word slowly with the reference reciter.",
  "findings": [
    {
      "kind": "phoneme",
      "wordIndex": 2,
      "expectedArabic": "اللَّهِ",
      "guidance": "Listen to the reference once, then repeat this word slowly."
    }
  ]
}
```

The allowed `kind` values are `phoneme`, `vowel_length`, `pause`, and `tajweed`. Guidance must be short, respectful, and limited to the evidence produced by the service. For any ambiguous recording, return the following shape instead of guessing.

```json
{
  "status": "abstained",
  "provider": "quran-phoneme-service",
  "confidence": 0.54,
  "summary": null,
  "findings": []
}
```

## Recommended service architecture

A credible implementation uses a Quran-aware canonical phoneme representation, a specialised acoustic or phoneme-recognition model, target-to-prediction alignment, and a confidence/abstention layer. A pause segmenter can identify recitation boundaries but is not, by itself, a pronunciation evaluator. Any advanced tajwid rule should be added only after a qualified teacher has approved the error taxonomy, acceptance criteria, and test recordings.

The open-source research ecosystem includes Quran-specific phonemizers and phoneme-recognition models, but these need independent evaluation on the product’s target learner population. The Vercel app is intentionally only the secure client of the service: a model deployment should run where its GPU/runtime requirements and data-protection controls can be managed separately.
