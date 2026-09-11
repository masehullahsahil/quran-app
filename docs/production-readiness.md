# Learner persistence production readiness

Status reviewed on 2026-09-05 against the code merged in PR #28 (and locale work from PR #35).

## Migration status

**Not verified or applied to production/staging from this environment.** No `DATABASE_URL` or live database credentials were exposed, so no connection was attempted and this document does not claim that any deployed database is ready.

The existing additive migration is `drizzle/0000_modern_hannibal_king.sql`. It creates `memorization_attempts`, `qaida_lesson_completions`, and `qaida_progress`, their indexes/unique constraints, and cascading foreign keys to `users.id`. It does not recreate or destructively modify `users`.

Verify a deliberately selected database without displaying its URL:

```sh
DATABASE_URL='mysql://…' pnpm db:verify-learner-persistence
```

The verifier fails non-zero for missing tables/columns, incompatible critical indexes or uniqueness, missing cascading user foreign keys, and an incompatible user id type. Apply **only the checked-in migration** with:

```sh
DATABASE_URL='mysql://…' pnpm db:migrate
DATABASE_URL='mysql://…' pnpm db:verify-learner-persistence
```

Do not use `db:push` for this rollout: that command also generates schema changes and is not the narrowly scoped deployment operation required here. Take the normal database backup and test the command against staging before production.

## Durable learner flow

Authentication establishes the account and protected tRPC context. Every learner read/write takes `ctx.user.id`; the API never accepts a browser-supplied user id. On sign-in or reconnect, the browser submits its validated Qaida cache, local attempt history, and pending attempts. The server:

1. unions Qaida lesson completion rows;
2. retains the furthest curriculum lesson between server and client, so a stale device cannot move the current lesson backward;
3. inserts finalized memorization attempts using `(userId, idempotencyKey)` uniqueness;
4. derives mastery, review dates, the review queue, and recurring errors from attempt history rather than trusting client-supplied mastery; and
5. returns the merged snapshot, which replaces the local caches only after success.

The deterministic integration tests simulate a stale/empty session B receiving session A's completion and history, a newer local session uploading to an older server, duplicate retries, and a failed request followed by a successful reconnect. They also assert that persistence synchronization leaves the independent `miqra-locale` key unchanged.

## Retry and idempotency

A finalized reviewable attempt is saved to local history before its background account write. A failed write stays in `miqra-memorization-pending-v1`; the queue is deduplicated by attempt id and retains the newest 500 entries. It is retried on sign-in and the browser `online` event. Pending items are acknowledged only after the server returns a merged snapshot, so a network/server error neither erases local history nor partially adopts an unconfirmed response. Server uniqueness is per user, allowing the same client key for different users while preventing duplicate history for one user.

Qaida synchronization is retry-safe because completion inserts and current-lesson upserts are monotonic. The multi-step sync is not wrapped in one transaction, but every step is independently idempotent and a retry converges; a partial failure cannot delete progress.

## Language preference

Instruction language remains local-only by design in this release. `LocaleProvider` reloads `miqra-locale`, and learner snapshot synchronization touches only the Qaida and memorization keys. Account-backed locale synchronization across devices is future work and requires a separately reviewed product/schema change; no language migration is included here.

## Study and acoustic fallback

The Study path records history only for a finalized assessment with usable word review. Teacher decisions remain deterministic and choose correction versus advance before persistence. Durable attempts then drive mastery/review state, and a fresh signed-in session receives the same attempt history and derived queue.

The Quran-aware acoustic evaluator is optional. When `QURAN_EVALUATOR_URL` is absent it is not called. Timeouts, non-success responses, malformed/unavailable responses, and explicit/low-confidence abstention produce no acoustic correction and do not block transcription-based textual recall guidance. Deterministic tests mock all of these cases; they do not call OpenAI or the evaluator service. If transcription itself is unavailable, Study safely holds position and offers textual retry guidance rather than inventing an assessment.

## Commands and environment

`pnpm verify:production-readiness` runs the recitation benchmark, focused learner/cross-session/locale/teacher/acoustic tests, and TypeScript checking without external services. It prints `database verification not run` by default. Set `VERIFY_DATABASE=1` together with `DATABASE_URL` to include the live schema check.

GitHub Actions runs the deterministic production gate on pull requests and pushes to `main`: frozen-lockfile install, production dependency audit, tests, type-checking, build, and production-readiness verification. The audit is intentionally scoped to production dependencies (`pnpm audit --prod --audit-level=moderate`) so development-only tooling advisories do not create misleading production failures.

Required for the durable signed-in production flow:

- `DATABASE_URL` — MySQL database with the verified migration.
- `JWT_SECRET`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, and `VITE_APP_ID` — existing sign-in configuration.

Optional integrations:

- `OPENAI_API_KEY` (and optional `OPENAI_BASE_URL`, `OPENAI_TRANSCRIPTION_TIMEOUT_MS`, and `OPENAI_CHAT_TIMEOUT_MS`) — live transcription/coach wording; deterministic tests do not need it. The timeout variables are bounded in code between 1s and 30s.
- `RECITATION_RATE_LIMIT_REDIS_REST_URL` and `RECITATION_RATE_LIMIT_REDIS_REST_TOKEN` — strongly recommended for production distributed rate limiting of the expensive `recitation.evaluate` path. These settings are compatible with a Redis/Upstash-style REST command endpoint. Without them, the app falls back to per-instance memory counters; that still protects one warm function instance but does **not** provide a distributed limit across Vercel instances or cold starts.
- `QURAN_EVALUATOR_URL`, optional `QURAN_EVALUATOR_API_KEY`, and `QURAN_EVALUATOR_TIMEOUT_MS` — specialist acoustic service.
- `VITE_ANALYTICS_ENDPOINT` and `VITE_ANALYTICS_WEBSITE_ID` — optional analytics script. If either value is absent or blank, the production HTML emits no analytics script and the browser makes no analytics request.

## Recitation spend and abuse controls

`recitation.evaluate` remains public so the current Vercel path does not depend on the unfinished Manus auth replacement. It is nevertheless guarded before storage, transcription, the optional Quran-aware evaluator, and the coach LLM call. The server validates the request shape, supported audio MIME type, base64 encoding, and the shared recording byte ceiling before invoking any expensive provider. OpenAI transcription and coach calls use bounded request timeouts; the optional Quran-aware evaluator already has its own bounded timeout.

The limiter keys by authenticated `user.id` when authentication succeeds and by client IP for anonymous traffic. In Vercel, the app trusts `x-forwarded-for` only when the deployment exposes `VERCEL`; outside Vercel it uses the direct socket address so a caller cannot bypass the anonymous counter by sending a fake forwarded-for header. Rate-limit logs include only structured metadata such as identity type, window, retry delay, and store type; they must not include audio, base64 recording payloads, transcripts, cookies, tokens, API keys, or learner-private content.

The built-in limits are intentionally conservative for the costly path:

- anonymous: 4 reviews per minute and 20 reviews per hour per IP;
- authenticated: 8 reviews per minute and 60 reviews per hour per user.

Production must configure `RECITATION_RATE_LIMIT_REDIS_REST_URL` and `RECITATION_RATE_LIMIT_REDIS_REST_TOKEN` for distributed enforcement across serverless instances. If those variables are absent, the repository-controlled fallback is in-memory and must be treated as development/limited-instance protection only. If the configured external limiter is unavailable, `recitation.evaluate` fails closed with `TOO_MANY_REQUESTS` instead of calling transcription or LLM providers.

Application rate limiting is not a substitute for provider-level spend controls. Before wider testing, the deployment owner should configure OpenAI project budgets and alerts, review model-level usage limits, and monitor transcription/chat-completion spend. This repository cannot verify those dashboard settings without production credentials, so they are required operator checks rather than code-verified guarantees.

## Verified scope and remaining blockers

Verified locally: ownership at the protected-router boundary, monotonic Qaida merging, finalized-attempt validation, per-user idempotency, review derivation, stale/new session convergence, bounded retry overflow, failure preservation, locale-key isolation, and evaluator fallback behavior.

Not production-verified / launch blockers:

1. A deployment owner must run the schema verifier against staging and production; migration presence is currently unknown.
2. A staging smoke test with the real OAuth provider and two actual browsers/devices is still required. Unit/integration callers exercise the existing auth context but do not prove deployed cookie/OAuth configuration.
3. A database backup/restore drill and operational monitoring for failed syncs have not been demonstrated here.
4. Attempt-history reads currently return complete account history. This preserves the auditable source of truth, but pagination/retention must be designed before history volume becomes large; silently truncating history would change mastery.
5. Locale follows a device, not an account; cross-device locale sync remains future work.
6. Distributed `recitation.evaluate` rate limiting requires the production Redis/REST rate-limit store variables above; automated tests verify the abstraction and fallback behavior, not an externally provisioned store.
7. OpenAI project budgets, usage alerts, and any hard provider spending caps must be configured and verified in the OpenAI dashboard by the deployment owner.

## Production operations: health, config, logging, correlation, smoke tests

Added after PR #62. This section covers the operational surface for the
deployed app. It changes no Quran-learning behavior: no alignment, scoring,
tajweed, curriculum, or live-recitation logic was touched.

### Health endpoint

`GET /api/health` (registered in `server/_core/app.ts`, routed to the
serverless function via `vercel.json`).

Response shape (all fields safe to expose):

```json
{
  "status": "healthy",
  "service": "quran-reading-experience",
  "build": { "commit": "<VERCEL_GIT_COMMIT_SHA or unknown>", "vercelEnv": "<VERCEL_ENV or unknown>" },
  "environment": "<NODE_ENV or unknown>",
  "timestamp": "2026-09-11T00:00:00.000Z",
  "uptimeSeconds": 123,
  "config": { "valid": true, "errors": 0, "warnings": 1 },
  "checks": [
    { "name": "database", "status": "up", "critical": true, "latencyMs": 42 },
    { "name": "authentication", "status": "configured", "critical": true },
    { "name": "quranContentApi", "status": "up", "critical": false, "latencyMs": 310 },
    { "name": "acousticEvaluator", "status": "not_configured", "critical": false },
    { "name": "transcription", "status": "configured", "critical": false }
  ]
}
```

Service states: `up` / `down` for probed services (database `SELECT 1`,
HTTP reachability of the Quran content API and the acoustic evaluator),
`configured` / `not_configured` for presence checks that are never probed
(auth variables, OpenAI key — no spend is ever triggered by the health
endpoint).

### Health states

- `healthy` — every critical check passes. Optional services may be down or
  unconfigured without changing this.
- `degraded` — a critical check is down/not configured, or required
  configuration is missing. The app still responds; HTTP status stays 200
  and the state is carried in the body.
- `unavailable` — the health handler itself failed (HTTP 503 with a
  correlation ID). Reserved for "we could not even answer".

Critical vs optional: the database and authentication configuration are
critical (the signed-in learner-persistence flow needs them). The Quran
content API, acoustic evaluator, and transcription are optional — a
temporary failure there surfaces per-service but never makes the whole site
look offline. The existing tRPC `system.health` query is unchanged and
remains a trivial liveness probe.

The endpoint never exposes secrets, tokens, passwords, connection strings,
raw environment-variable values, or user information.

### Configuration validation

`server/_core/config.ts` exports `validateConfig(env)`, a pure,
deterministic function (fully unit-tested, no live services):

- required: `DATABASE_URL`, `JWT_SECRET`, `OAUTH_SERVER_URL`,
  `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID`;
- optional: `OPENAI_API_KEY` (+ base URL/timeouts), `QURAN_API_BASE_URL`,
  analytics pair, forge variables — safe to omit;
- feature-specific: `QURAN_EVALUATOR_URL`/`QURAN_EVALUATOR_API_KEY`
  (acoustic evaluation), `RECITATION_RATE_LIMIT_REDIS_REST_URL` +
  `RECITATION_RATE_LIMIT_REDIS_REST_TOKEN` (distributed rate limiting),
  `VITE_ANALYTICS_ENDPOINT` + `VITE_ANALYTICS_WEBSITE_ID` (analytics).
  Half-configured pairs produce warnings; out-of-range numeric timeouts
  warn and fall back to defaults.

Findings name the variable and the problem only — values are never printed.
The long-running server (`server/_core/index.ts`) validates at startup,
logs a structured summary, and exits non-zero in production when required
variables are missing (development only warns, so local tooling keeps
working). On Vercel the same report feeds the health endpoint's `config`
section. `LOG_LEVEL` (`debug`/`info`/`warn`/`error`, default `debug`) is
the only logging knob.

### Correlation IDs

`server/_core/requestId.ts` assigns every request an `x-request-id`
(`req_<nanoid>`), returned as a response header on all routes. A
client-supplied ID is honored only if it matches a strict safe pattern
(prevents header/log injection); otherwise a fresh ID is generated. The ID
flows into the tRPC context, the structured logs, the tRPC error formatter
(`error.data.correlationId`), and the Express error handler, so an error
shown in the browser can be traced through server logs. Error responses
carry stable codes and safe messages — never stack traces.

### Logging behavior

`server/_core/logger.ts` is a dependency-free JSON-lines logger. Each entry
has `timestamp`, `level`, `subsystem`, `message`, and optional `operation`,
`requestId`, `status`, `errorCategory`, `details`. Errors go to stderr,
everything else to stdout. It is used by the health endpoint, config
validation, request lifecycle, and the tRPC/Express error handlers.

Never logged: audio recordings, transcripts, auth tokens, passwords,
secrets, connection strings, cookies, raw request bodies, or unnecessary
personal data. The existing `console.*` calls elsewhere were deliberately
left as-is to keep this change behavior-neutral.

### Smoke test

```sh
SMOKE_BASE_URL=https://<your-app>.vercel.app pnpm smoke:deployed
```

`scripts/smoke-deployed.mjs` runs read-only checks against the deployed
app: homepage/app shell (`/`), SPA fallback route (`/curriculum-audit`),
`/api/health` (valid report + `x-request-id` header + no leak markers),
the public tRPC `system.health` query (proves `/api/trpc` routing), a
static curriculum asset (`/audio/letters/alif.mp3`), and a safe 404 for an
unknown API path. Every check asserts its expected HTTP code; any failure
exits non-zero.

What it verifies: the deployment serves the app, client routing works, the
serverless function is alive, health reporting works, static assets
resolve, and (on Vercel only) unknown API paths return the platform 404.

What it intentionally does NOT test: OAuth sign-in callbacks,
protected/authenticated tRPC procedures, or any write path (no progress
submission, no user-record changes, no messages, no memorization-history
or curriculum changes). Those need real credentials and are excluded so
the harness can never alter user data or weaken authentication.

### Troubleshooting workflow

1. `curl -i $APP_URL/api/health` — note `status` and the `x-request-id`
   response header.
2. If `degraded`, read `checks[]`: a critical `down`/`not_configured`
   entry names the subsystem; `config.errors` counts missing required
   variables (names only — check the deployment's env settings).
3. Optional services `down` while `status` is `healthy`: expected during
   third-party outages; the app keeps serving from cache/fallbacks.
4. For a user-visible error: take the correlation ID from the error
   response (or the `x-request-id` header) and search server logs for
   `"requestId":"<id>"` to find the matching structured entries.
5. Re-run `pnpm smoke:deployed` after any deploy or config change; it is
   read-only and safe to run repeatedly.

