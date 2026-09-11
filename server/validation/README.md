# Validation instrumentation

Additive-only instrumentation for the real-device validation plan. This module
**observes**; it never changes Quran correctness algorithms, alignment rules,
advancement rules, correction semantics, scoring, tajweed, or trusted-audio
policy.

## Modules

- `validationRun.ts` — run/attempt ID generation, build/version capture,
  append-only `ValidationLedger`, payload sanitization, timing analysis,
  ECHO-01 playback-leak computation, safety/blocker outcomes, verdict, JSON
  export, and markdown report rendering (with provisional pilot targets).
- `attemptRecorder.ts` — records one evaluated recitation attempt into a
  ledger from a structural pipeline summary. Shared by
  `scripts/validate-real-recitation.ts` and the integration tests.
- `index.ts` — re-exports.

## Observation points currently wired

1. **Offline harness** (`scripts/validate-real-recitation.ts`): drives the
   real server pipeline (alignment → verse following → teacher decision) and
   records `session.start`, `device.metadata`, `position.checkpoint` (from the
   server pipeline's verse-following output, `source: "harness"`),
   `correction.decided`, `attempt.completed`, plus safety outcomes. Writes the
   ledger JSON and markdown report to disk.
2. **Client validation log** (`client/src/lib/validationCapture.ts`): collects
   device/browser/network/environment metadata and records client-side events
   (`playback.started`/`playback.ended`, `mic.reopened`). Position checkpoints
   are copied verbatim from server stream snapshots (`source:
   "server-response"`) — the client never claims a Quran position of its own.
   Inert in production; opt in via `?validation=1` or the
   `quran.validationMode` localStorage flag.

## Production wiring (not yet connected — no code changed)

To record server-side checkpoints from live traffic, call
`ledger.recordPosition()` / `ledger.record(...)` at these router response
points in `server/routers.ts` (guarded by an active validation run so
production behavior is unchanged when inactive):

- `recitation.startLive` response — record the initial server-held position
  from the returned stream snapshot.
- `recitation.ingestLiveAudio` response — record `position.checkpoint` from
  `reservation.snapshot.tracker` and `correction.decided` when the response
  carries a confirmed `word-omitted` event; mark playback intervals from the
  tutor action's audio directives for ECHO-01.
- Join client and server records offline on `runId` / `x-request-id`.

The correlation key is the client-supplied run ID plus the request's
`x-request-id` (read from `ctx.req.headers`); no new middleware required.

## Safety rules

- No audio bytes, no raw transcripts (word indexes only), no tokens/secrets,
  no PII in the ledger — enforced by `sanitizeDetails()`.
- Numeric thresholds appear only in the markdown report, labeled
  `PROVISIONAL PILOT TARGET`. They are never release gates and never claims
  about current performance. `computeVerdict()` fails only on recorded
  blockers.
- Any Tutor/Qari playback that mutates Quran state (advance, satisfied
  correction, learner-attributed position change) must be recorded as a
  blocker via `recordSafetyOutcome({ severity: "blocker", ... })`.
