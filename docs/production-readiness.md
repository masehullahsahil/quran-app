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

Required for the durable signed-in production flow:

- `DATABASE_URL` — MySQL database with the verified migration.
- `JWT_SECRET`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, and `VITE_APP_ID` — existing sign-in configuration.

Optional integrations:

- `OPENAI_API_KEY` (and optional `OPENAI_BASE_URL`) — live transcription/coach wording; deterministic tests do not need it.
- `QURAN_EVALUATOR_URL`, optional `QURAN_EVALUATOR_API_KEY`, and `QURAN_EVALUATOR_TIMEOUT_MS` — specialist acoustic service.

## Verified scope and remaining blockers

Verified locally: ownership at the protected-router boundary, monotonic Qaida merging, finalized-attempt validation, per-user idempotency, review derivation, stale/new session convergence, bounded retry overflow, failure preservation, locale-key isolation, and evaluator fallback behavior.

Not production-verified / launch blockers:

1. A deployment owner must run the schema verifier against staging and production; migration presence is currently unknown.
2. A staging smoke test with the real OAuth provider and two actual browsers/devices is still required. Unit/integration callers exercise the existing auth context but do not prove deployed cookie/OAuth configuration.
3. A database backup/restore drill and operational monitoring for failed syncs have not been demonstrated here.
4. Attempt-history reads currently return complete account history. This preserves the auditable source of truth, but pagination/retention must be designed before history volume becomes large; silently truncating history would change mastery.
5. Locale follows a device, not an account; cross-device locale sync remains future work.
