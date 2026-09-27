# Staff research phoneme export

This is a narrow exception for the repository owner's 16 self-consented,
labeled planted-error takes. Decoded phonemes support OFFLINE benchmark scoring
only. They do not support learner-facing tajweed, makhraj, or pronunciation
claims and never reach the Tutor or its decisions.

## Staff opt-in

Use a single-instance staff server with `QURAN_VALIDATION_STAFF_API=1`, never the
deployed learner app. `POST /api/validation/runs` optionally accepts:

```json
{
  "phonemeRetention": {
    "purpose": "Owner self-consented planted-phoneme-error benchmark",
    "retainUntil": "2026-10-01T00:00:00Z"
  }
}
```

Choose a future ISO date (`YYYY-MM-DD`, interpreted as UTC midnight) or ISO
timestamp with timezone, at most 90 days from activation. Empty purposes,
invalid calendar dates, expired dates, and dates beyond the cap return 400.
The date above is illustrative; choose a valid date when activating a run.

An opted-in run records `researchConsent: { granted: true, purpose, retainUntil }`
on the active run, activation response, and ledger metadata, including the final
ledger returned at deactivation. Consent cannot be upgraded by a learner input
or by reactivating an existing run. Activation without opt-in has the existing
response and ledger shape, with no consent key.

The observation scope captures consent from the active staff run. Its evaluator
`POST /v1/evaluate` includes `researchConsent` only for that run's attempts.
Ordinary, inactive, and non-consented requests serialize the original request
body unchanged. Diagnostics and learner responses remain aggregate-only.

## Service contract

The runtime integration uses the [service contract in PR #99](https://github.com/masehullahsahil/quran-app/pull/99#contract-for-reviewing-the-app-side-pr-against):

- `POST /v1/evaluate` accepts optional
  `researchConsent: { granted: boolean, purpose: string, retainUntil: string }`.
- The evaluator independently requires `QURAN_RESEARCH_PHONEME_RETENTION=1`
  and valid consent before retaining anything.
- `GET /v1/research/phonemes/:correlationId` uses the same bearer API key,
  requires the evaluator gate, and returns retained data or 404.
- Read data includes `correlationId`, `timestamp`, `provider`, `modelId`,
  `levels: [{ tokens, tokenPosteriors, meanPosterior }]`, `purpose`, `retainUntil`.

## Exports

Both `GET /api/validation/runs/:runId/attempts` and
`pnpm export:validation-attempts <saved-bundle-or-ledger.json>` use the same HTTP
join. With the app staff gate enabled and `QURAN_EVALUATOR_URL` plus
`QURAN_EVALUATOR_API_KEY` configured, each distinct non-null correlation ID is
read server-to-server from the endpoint above. No credentials enter the export.
The offline command reads the existing local environment / `.env` configuration.
It supports raw ledgers, final deactivation files, and client evidence bundles.

A successful read adds `researchPhonemes` to the corresponding attempt row,
containing only the contract fields. Unexpected service fields are dropped;
the returned correlation ID must match the requested ID. Missing IDs, 404s,
expired or malformed records, unconfigured credentials, and service errors
leave the original row unchanged: **the researchPhonemes key is absent**.
The ordinary ledger projection never imports decoded tokens from a saved file.

The HTTP endpoint remains staff-gated and returns 404 when the gate is off.
The offline command still produces its existing aggregate export when the gate
is off, without calling the research endpoint. Research files remain subject to
the consent's retention date; service expiry does not delete exported copies.

This app PR has no compile-time dependency on the service PR. It builds and
tests against the runtime HTTP contract whether PR #99 is merged or not.
Suggested merge order: service PR first, then app PR. The updated evaluator
must be running with its research gate enabled for joins to return data.

Nothing under `services/`, Quran matching, alignment, advancement, correction
thresholds, acoustic algorithms, or `scripts/score-muaalem-benchmark.mjs` changes.
