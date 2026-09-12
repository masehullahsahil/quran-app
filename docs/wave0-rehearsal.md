# Wave 0 — Readiness Rehearsal Runbook

Goal: prove the validation instrumentation works end-to-end on a
**single-instance Node server** before any plan-grade real-device evidence is
collected. This rehearsal exercises run activation → live recitation with the
validation header → ledger export → client/server evidence join → ECHO-01.

## Non-negotiable constraints

- **Single-instance Node server only.** The active-run registry
  (`server/validation/liveObservation.ts`) is process-local. Activating a run,
  serving the live-tutor requests, and exporting the ledger must all happen in
  the **same process**. Do NOT use the Vercel serverless deployment for
  plan-grade evidence, and do NOT set `QURAN_VALIDATION_STAFF_API=1` on any
  production deployment.
- **Stop-the-line blocker:** if trusted Qari playback ever causes a
  Quran-state mutation (advance, correction-satisfied, or position change
  attributed to playback rather than the learner), stop the rehearsal and
  treat it as a blocker. Do not continue as though it passed.
- **No tajweed/makhraj/pronunciation claims** without validated acoustic
  evidence. This rehearsal makes no such claims.
- **No raw-audio persistence** without explicit consent allowed by the
  validation plan.

## Prerequisites (staff)

- A staff machine that can run the server and a browser with a microphone.
- The server built from `main` (or the rehearsal branch) with all tests green.
- A reciter who can read the rehearsal passages clearly (Al-Fatiha is the
  default; see below).
- Still outstanding for later waves (not blocking this wiring rehearsal):
  qualified Quran-reviewer script approval, approved full passage set, test
  accounts, device/browser/network inventory, staff dry-runs.

## Procedure

### 1. Start the single-instance server with the staff API enabled

```bash
cd quran-app
QURAN_VALIDATION_STAFF_API=1 pnpm dev
# or for a production-mode single instance:
# pnpm build && QURAN_VALIDATION_STAFF_API=1 pnpm start
```

Without the flag, `POST /api/validation/runs` returns 404 — the endpoints do
not exist. Verify with:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/validation/runs
# expect 201
```

(Use the actual port your server listens on.)

### 2. Activate a validation run

```bash
curl -s -X POST http://localhost:3000/api/validation/runs \
  -H 'content-type: application/json' \
  -d '{"deviceMetadata":{"device":"staff-laptop","browser":"chrome","network":"office-wifi"}}' \
  | tee /tmp/validation-run.json
```

Record the `runId` (looks like `run_<24 hex chars>`). Device metadata is
sanitized before storage: secrets, tokens, audio, transcripts, and PII are
redacted or rejected by the ledger.

### 3. Open the app in validation mode with the run ID

Open the client served by the same server instance at:

```
http://localhost:3000/?validation=1&validationRunId=<runId>
```

Validation mode is also honored via `localStorage` (`quran.validationMode=1`
and `quran.validationRunId=<runId>`), but the URL form is preferred for a
rehearsal because it is explicit and visible. When active, every
`recitation.startLive` / `recitation.ingestLiveAudio` request carries
`x-validation-run-id`. Ordinary production traffic sends no such header.

### 4. Run the rehearsal recitation session

Use **Al-Fatiha (1:1–7)** unless the reviewer has approved otherwise.

- **Pass A — clean read:** recite Al-Fatiha once, naturally, with normal
  pauses. Expect: Tutor stays quiet, server `position.checkpoint` events show
  stable server-held position, no false advancement, no wrong correction.
- **Pass B — deliberate omission:** recite Al-Fatiha 1:2 skipping word 3
  (recite it in your head; the exact skipped word is confirmed by the
  reviewer-approved script). Expect: Tutor interrupts, identifies the exact
  missed word, plays trusted Qari audio for that word, and requires the full
  ayah to be repeated. Correcting one word must NOT complete the ayah.
- **ECHO-01 check:** during each Tutor/Qari playback, keep reciting or make
  sound near the mic. Playback must never be treated as learner evidence and
  must never cause a Quran-state mutation.

The client records its own validation log (playback intervals, mic reopens);
the server records `position.checkpoint`, `correction.decided` (word indexes
only, never Quran text or transcripts), playback directives, `runId`, and
`correlationId`.

### 5. Export the server ledger

```bash
RUN_ID=<runId>
curl -s http://localhost:3000/api/validation/runs/$RUN_ID/ledger \
  | tee /tmp/validation-ledger.json | head -c 600
```

When the session is done, deactivate (this also returns the final ledger):

```bash
curl -s -X POST http://localhost:3000/api/validation/runs/$RUN_ID/deactivate \
  -o /tmp/validation-ledger-final.json
```

After deactivation the run is removed from the registry; further exports for
that run ID return 404.

### 6. Join client/server evidence

Join the client validation log and the server ledger export on
**`runId` + `correlationId`**. Confirm:

- Every live-tutor request in the session carries the same `runId`.
- Server `position.checkpoint` events line up with the client's session
  timeline via `correlationId`.
- `correction.decided` (Pass B) names the exact intended word index and no other.
- No `quranStateMutation` appears on any event whose `audioDerived` evidence
  came from playback.

### 7. Run ECHO-01

ECHO-01 is the `computeEchoLeak()` analysis, included in every ledger export
under the `echo` key (and in the markdown report from
`renderMarkdownReport`):

- `intervals`: playback intervals observed.
- `offendingEventCount`: learner-evidence events derived from audio during
  playback — must be 0.
- `mutationsDuringPlaybackCount`: Quran-state mutations during playback —
  must be 0. Any non-zero value is the stop-the-line blocker.
- `playbackLeakFalseEvidenceRate`: offending events per playback interval.

## Completion report

Report exactly:

1. Current roadmap wave (Wave 0)
2. Roadmap item completed
3. Real-device environment used
4. Device/browser used
5. Evidence captured (ledger export + client log paths)
6. Client/server join result
7. ECHO-01 result
8. Any stop-the-line blocker
9. Human prerequisites still outstanding
10. Exact next item from Real-device Validation Plan v0.2
