# Memorization error memory and review scheduling

This layer records only finalized, usable **text transcript** assessments. Browser interim speech chunks, duplicate chunks, unavailable transcriptions, and audio are never written. The Study recorder writes one local record after the server returns its accepted final assessment; its stable recording/session ID prevents retry duplication.

History currently uses a repository-backed, versioned browser `localStorage` record because authentication is optional and the existing learning progress is local. The repository interface isolates this temporary choice so an account-linked database implementation can replace it without changing mastery or scheduling logic.

## Deterministic rules

- An unseen ayah is `new`; its first attempt is `learning`, or `needs_review` when uncertain/below 70.
- One successful completion remains `learning`; two consecutive successes become `strong`.
- Five total successes, including three consecutive successes, become `mastered`.
- A single significant failure does not demote `strong`/`mastered`; two consecutive significant failures move it to `needs_review`.
- Successful intervals are 1, 3, 7, 14, then 30 days. Learning/failure is due immediately. Values live in `DEFAULT_MEMORIZATION_CONFIG` and are configurable.
- Recurrence means the same one-based expected word was omitted or marked textual substitution/review at least 3 times in the last 5 attempts.
- Queue scoring favors recurring word errors, then due/overdue work, low mastery, and recent failure. Surah then ayah is the deterministic tie-break. These heuristics are intentionally simple, not a claim of scientific optimality.

Correctly matched words are not stored separately. `review` means transcript substitution/mismatch, never a pronunciation diagnosis. The deterministic history may be supplied to a coach as read-only context, but an LLM must never change mastery, intervals, or history.
