# Research phoneme retention (consent-gated)

By default the acoustic evaluator discards decoded Muaalem phoneme detail:
`/v1/evaluate` responses and the `quran_acoustic_evaluation` log line carry
only aggregate shadow diagnostics. This document describes the single, narrow
exception used for the owner's self-consented planted-error benchmark.

## When retention activates

Retention is active for a request only when **all** of the following hold.
Otherwise the request takes the unchanged, fully redacted default path.

1. The operator env gate `QURAN_RESEARCH_PHONEME_RETENTION=1` is set on the
   evaluator service (default: off).
2. The request carries an `x-correlation-id` header accepted by
   `safeCorrelationId` (`^[A-Za-z0-9_-]{8,64}$`). Records are keyed by it.
3. The request body carries valid `researchConsent`:
   - `granted === true` (strictly the boolean),
   - `purpose` is a non-empty string (≤ 500 chars after trimming),
   - `retainUntil` is either
     - a future ISO date/datetime no more than **90 days** out (used as-is), or
     - omitted / unparseable, in which case it defaults to **30 days** from
       recording.
     An explicit `retainUntil` in the past or beyond the 90-day cap
     invalidates consent (nothing is retained); it is never clamped.
4. The shadow worker returned an `available` analysis whose every level has a
   `tokenPosteriors` array parallel to `tokens`.

## What is retained

One JSON file per correlation ID in a separate directory
(`QURAN_RESEARCH_PHONEME_DIR`, default `./research` relative to the service's
working directory — `/app/research` in the GPU image), mode `0600`:

```json
{
  "correlationId": "…",
  "timestamp": "ISO-8601 recording time",
  "provider": "muaalem-shadow",
  "modelId": "obadx/muaalem-model-v3_2",
  "levels": [
    { "level": "phonemes", "tokens": ["…"], "tokenPosteriors": [0.97], "meanPosterior": 0.97 }
  ],
  "purpose": "…",
  "retainUntil": "ISO-8601"
}
```

`tokenPosteriors` are raw greedy CTC posteriors, not calibrated correctness
scores. `level` names the model output level so levels can be told apart.

**Never retained:** audio or PCM, transcripts, expected Quran text, surah/ayah,
learner identity, request headers, or credentials. Research records are never
written to logs and never returned from `/v1/evaluate`.

## Reading records

`GET /v1/research/phonemes/:correlationId` (bearer auth required, same key as
`/v1/evaluate`):

| Condition | Status |
| --- | --- |
| Missing/wrong bearer token | 401 |
| Env gate off | 404 |
| ID fails `safeCorrelationId` | 400 |
| Unknown or expired ID | 404 |
| Record found | 200, JSON record, `cache-control: no-store` |

## Expiry and deletion

- **Automatic:** every service startup purges records past `retainUntil`
  (whether or not the env gate is currently on), and an expired record is
  never served even before a purge.
- **Delete one record** (by correlation ID), inside the container:

  ```bash
  rm -f /app/research/<correlationId>.json
  # e.g. from the host: docker exec <container> rm -f /app/research/<correlationId>.json
  ```

- **Delete all records:**

  ```bash
  rm -rf /app/research
  ```

- Records live on the container's filesystem. Terminating the pod (without a
  mounted volume at `/app/research`) also deletes them.
- To stop further retention immediately, unset
  `QURAN_RESEARCH_PHONEME_RETENTION` and restart; the read endpoint then
  returns 404 for every ID.
