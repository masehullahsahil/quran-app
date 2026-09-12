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
- `liveObservation.ts` — active validation-run registry plus the guarded
  observation of live-router responses (`recitation.startLive`,
  `recitation.ingestLiveAudio`): run activation/deactivation/export,
  run-ID/correlation-ID extraction from the request context, and the
  structural checkpoint/correction/playback-directive recording used by the
  `observedLiveProcedure` middleware in `server/routers.ts`.
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

## Production wiring (connected)

Live-router observation is wired in `server/routers.ts` via the
`observedLiveProcedure` middleware, which wraps `recitation.startLive` and
`recitation.ingestLiveAudio`. The observation points, implemented in
`server/validation/liveObservation.ts`:

- `recitation.startLive` response — records `position.checkpoint` with the
  initial server-held position from the returned stream snapshot
  (`source: "server"`, `evidenceSource: "none"`, `audioDerived: false`).
- `recitation.ingestLiveAudio` response — records `position.checkpoint` from
  the response's stream snapshot tracker (`evidenceSource: "learner-audio"`,
  `audioDerived: true` only when this response actually transcribed audio);
  records `correction.decided` when the response carries a confirmed
  `word-omitted` event on an **applied** input (exact surah/ayah/word index,
  evidence kind, and heard-through index — word indexes only, no Quran text,
  no transcripts); attaches the tutor action's playback directive
  (`play-target-word` / `play-current-ayah` / `trusted-word-audio` /
  `trusted-ayah-audio`) to both event types as ECHO-01 evidence.
- Correlates every record through the validation run ID (`runId`) and the
  request correlation ID (`correlationId` = `ctx.requestId`, falling back to
  the `x-request-id` header).

Guarding and safety:

- A request is observed only when it carries a well-formed
  `x-validation-run-id` header naming a run activated via
  `activateValidationRun()`. With no active run the middleware is a plain
  pass-through: no recording, no response changes, no new middleware in the
  HTTP stack.
- Only actually-committed inputs can record Quran-state mutations
  (`quranStateMutation: "advance"` on an applied turn-complete whose verse
  following advanced). Duplicate/stale/rejected/out-of-order replays return
  the same snapshot without committing, so they never fabricate a mutation
  and never double-record a correction decision.
- Observation never throws into the router: `observeLiveRouterResult` is
  best-effort and the middleware returns the untouched tRPC result envelope.

Run lifecycle (staff/ops): activate a run with `activateValidationRun(runId)`
before a real-device session; the validation client sends the run ID back on
every live-tutor request via the `x-validation-run-id` header. After the
session, `deactivateValidationRun(runId)` returns the run and
`entry.ledger.toJSON()` (or `exportValidationRun(runId)`) exports the ledger
for offline joining with the client log on `runId` / `correlationId`.

Client propagation (Wave 0): `client/src/lib/validationCapture.ts` now
exposes `buildValidationHeaders()`, `getActiveValidationRunId()`, and
`getValidationRunId()`. `client/src/main.tsx` merges
`buildValidationHeaders()` into every tRPC request's headers, so
`recitation.startLive` and `recitation.ingestLiveAudio` (which share the same
`httpBatchLink`) both carry `x-validation-run-id` when — and only when — a
staff validation run is active (`?validation=1` or
`quran.validationMode=1` plus a well-formed `?validationRunId=run_…` or
`quran.validationRunId`). Ordinary production traffic sends no validation
header. The header carries only the run ID (no Quran text, no audio, no
transcripts, no PII); request correlation stays server-owned via
`x-request-id`/`ctx.requestId`.

Serverless concern (Vercel): the active-run registry in
`server/validation/liveObservation.ts` is process-local (`Map`). On Vercel
serverless, requests may land on different instances: a run activated on
instance A is invisible to instance B, so `activeValidationRunFromCtx`
returns null there and those requests record nothing — silent, partial loss
of server-side evidence (the client log still has the run ID, but the server
ledger is empty or split). This DOES block reliable Wave 0 testing on the
current Vercel deployment. Smallest safe Wave 0 solution (no redesign):
run the readiness rehearsal against a single-instance Node server (staff
laptop `pnpm dev`, or a single-instance preview) — activate, exercise, and
export on that same process. Do not invent a distributed store for Wave 0;
revisit only if later waves require multi-instance Vercel validation.

Human/deployment decision required: choose the Wave 0 server target —
single-instance Node (recommended, no code change) vs. Vercel serverless
(requires a shared run-registry/export design, not built).

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
