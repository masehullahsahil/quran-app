# Durable learner persistence

Authenticated learner records use the existing `users.id` established by Manus OAuth. Every query takes that id from the authenticated tRPC context; no learner id is accepted from a browser. Anonymous learners continue to use local storage.

## Merge rules

On sign-in, the client sends its validated local snapshot to `learner.syncProgress`. The server unions Qaida completion rows (the unique user/lesson constraint makes retries harmless), and keeps whichever current lesson is furthest through the published curriculum. Thus an older device cannot re-lock work or move a learner backwards. Attempt ids are client-generated durable idempotency keys. The unique `(userId, idempotencyKey)` constraint deduplicates retries and cross-device imports. The response is the complete merged server snapshot and replaces the local cache.

Attempt history is the auditable source of truth. Mastery, spaced-review dates, and recurring-word errors are recalculated with `shared/memorization.ts`; clients never upload those derived values.

## Failure behavior

Completed local actions are written to the cache first. Failed attempt writes remain in a bounded local pending queue and are retried on sign-in, browser `online`, and later progress changes. Recitation feedback never waits for this retry. After a successful sync the server snapshot refreshes the local cache.
