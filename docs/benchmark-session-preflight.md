# Benchmark session preflight

Run before the owner's 16 takes, against a **single-instance staff app**, never
the deployed learner app. The evaluator must run the rebuilt PR #99 image with
`QURAN_RESEARCH_PHONEME_RETENTION=1`. The staff app needs
`QURAN_VALIDATION_STAFF_API=1`, its evaluator URL/API key, and a working
`OPENAI_API_KEY`/transcription model. Start it using the existing staff launcher
or `pnpm dev` with those settings. Use an isolated staff setup without optional
audio archival configured; the existing recitation route otherwise archives
the beep just as it archives other attempts.

In the preflight shell, set the same evaluator URL/key as the app. Node 20+
supports the native HTTP calls and optional `--env-file` loading.

```sh
export QURAN_APP_URL=http://127.0.0.1:3000
export QURAN_EVALUATOR_URL=https://YOUR-EVALUATOR
read -rsp 'Evaluator API key: ' QURAN_EVALUATOR_API_KEY
printf '\n'
export QURAN_EVALUATOR_API_KEY
export QURAN_EXPECTED_SHADOW_MODEL_ID=obadx/muaalem-model-v3_2
node scripts/preflight-benchmark-session.mjs
# Optional: load existing private settings and create a NEW JSON file.
node --env-file=.env scripts/preflight-benchmark-session.mjs --export-file preflight-export.json
```

PowerShell (the password prompt supplies the evaluator API key):

```powershell
$env:QURAN_APP_URL = 'http://127.0.0.1:3000'
$env:QURAN_EVALUATOR_URL = 'https://YOUR-EVALUATOR'
$preflightCredential = Get-Credential -UserName 'evaluator' -Message 'Enter the evaluator API key as the password'
$env:QURAN_EVALUATOR_API_KEY = $preflightCredential.GetNetworkCredential().Password
$env:QURAN_EXPECTED_SHADOW_MODEL_ID = 'obadx/muaalem-model-v3_2'
node scripts/preflight-benchmark-session.mjs
```

Checks run in order: (1) staff app reachability/gate, (2) bearer-sent evaluator
health and exact expected shadow model, (3) disposable consent/attempt/retention/
export round trip, (4) script config presence and protected read bearer acceptance.
Health is public: it alone cannot verify an API key. A read 401/403 means auth
rejected; a 404 means no readable record or research gate off, not a bad key.

The fixture is a two-second mono 16kHz PCM WAV: one second of a 440Hz beep,
surrounded by silence. **No Quran audio, speech or synthesized recitation** is
used. The existing app recitation endpoint sends exactly one audio-bearing
`/v1/evaluate` request with server-held run consent. It receives a non-Quran
expected-text marker; required coordinates are API placeholders, not a
recitation claim. Direct evaluator submission would not create an app attempt
or prove consent forwarding, so the script never inserts synthetic ledger rows.

`GO` exits 0 only after a retained record with matching consent/correlation/model
and per-token data matches the export's `researchPhonemes`. `NO-GO` exits 1 and
names the failed step and fix. Shadow unavailability on the fixture yields
`INCONCLUSIVE` (exit 2), **neither pass nor fail**; do not treat it as permission
to start the benchmark. A 404 after an available analysis cannot distinguish
disabled retention, missing posteriors, failed storage, or missing forwarded
consent; the script reports those possible causes without inventing a diagnosis.

The script creates one disposable run and at most one research record, with
purpose `preflight smoke test — disposable` and a ~24h expiry. The record expires
automatically; **no deletion is implemented**. The process-local run remains
active until the staff server restarts. Activate a separate real benchmark run
after GO. Stdout contains only a human-readable report, never audio, phonemes,
transcripts, keys or raw JSON. Optional export files are never overwritten and
must be removed by their owner under the retention policy for exported copies.
