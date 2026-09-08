# Live Tutor Session Engine

`shared/liveTutor.ts` is the deterministic teaching-state layer between the
existing Quran listener and a future multilingual conversation renderer:

```text
Quran listener -> Live Tutor state/action -> conversation wording
```

The engine chooses the next teaching action. It does not transcribe audio,
align words, assess pronunciation, or decide that an ayah is complete.

## Session contract

A `LiveTutorSession` is ephemeral lesson state. It records the session id and
revision, guided-recitation or memorization mode, exact surah and ayah, phase,
active #53 correction snapshot, last structured action, hint level, and learner
language. Existing memorization history remains the only durable progress
store.

Phases have these meanings:

| Phase | Meaning |
|---|---|
| `ready` | The lesson position is established and the tutor can begin listening. |
| `listening` | The learner is reciting at the current trusted position. |
| `correcting-word` | A text-level target from the correction evaluator remains active. |
| `recite-ayah` | The target word was recognized, but the complete current ayah is still required. |
| `waiting` | The engine is holding position for more or clearer evidence. |
| `paused` | Teaching is paused; the prior phase and exact Quran position are retained. |
| `completed` | Strong verse-following evidence completed the last ayah of the surah. |
| `stopped` | The learner ended the live session without creating progress. |

`tutor.start` creates a server-owned session. Public `tutor.turn` calls send
only the opaque session id, expected revision, and a structured learner intent
or timing event. The server loads the authoritative session and rejects stale
revisions with `refresh-session`.

The v1 store is an intentionally bounded, process-local map. A process restart,
serverless cold start, or request routed to another instance can lose a live
session. The server returns `lost-session` with no session or advancement and
the client must safely re-establish the lesson from the existing Study state.
It never silently recreates progress, and this store is not a competing
progress database.

## Inputs and actions

The public turn API consumes the structured learner intents exported by
`shared/tutorConversation.ts` (`start`, `again`, `repeat-word`, `hear-word`,
`hear-ayah`, `hint`, `from-beginning`, `continue`, `pause`, `resume`, and
`stop`) or future timing events. It does not accept recitation evidence and it
does not parse open-ended Pashto, Dari, Urdu, Arabic, or English speech. A
conversation layer must resolve language into one of these intents first.

Actions are structured commands such as `listen`, `play-target-word`,
`ask-target-word`, `ask-full-ayah`, `show-hint`, `hold-uncertain`, and
`end-session`. Conversation wording is deliberately outside this module.
Hints contain only canonical word indexes or trusted word/ayah audio source
kinds. The renderer must resolve Quran text and audio from existing canonical
data; the tutor never generates Quran text or synthesizes Quran audio.

Timing events are state-machine inputs, not production timers. Short silence
remains quiet. Prolonged silence may offer help in memorization mode. VAD and
interruption policy remain future work.

## Quran authority boundary

`recitation.evaluateWithTutor` is the trusted audio handoff. The browser sends
audio, MIME type, attempt scope, and a tutor session id/revision. The server
loads the tutor's Quran position and active correction, loads canonical ayah
and neighboring text, runs the same internal evaluation function used by
ordinary `recitation.evaluate`, then applies this transcript-free subset to the
tutor:

- attempt scope and current surah/ayah
- the existing `VerseFollowingResult`
- the server-owned `CorrectionSessionSnapshot` from #53
- the focused-word recognition result, when the scope is `word`

A correction snapshot can move teaching into exact-word practice. Recognizing
that word only moves the phase to `recite-ayah`; it never changes the ayah,
`lastCompletedAyah`, or advancement permission. Only strong existing
verse-following evidence with the exact one-ayah progression shape can advance
the tutor. Uncertain or inconsistent evidence holds position or asks the client
to refresh.

The route validates every result against the trusted session position and
active target. The integrated request schema rejects client-supplied Quran
text, position, correction targets, and evaluation results. Public
`tutor.turn` has no recitation event variant, so a browser cannot submit
`shouldAdvance`, target recognition, or ayah completion. A learner `continue`
intent cannot change the Quran position and cannot bypass an active correction.

Ordinary `recitation.evaluate` remains available with its existing response
contract. It and the Tutor integration call one evaluation implementation;
there is no second correctness path.

No tutor state or action claims tajwid, makhraj, madd, ghunnah, harakah, or
pronunciation correctness. Diagnostics from `traceLiveTutorTurn()` contain only
phase, action, intent, evidence category, surah, ayah, and target index. They do
not contain audio or transcripts.

## Remaining voice work

Continuous conversation still needs client Study mounting, a multilingual
intent resolver, VAD/stream event production, conversation wording, playback
orchestration, reconnect handling, and durable or shared live-session storage
for multi-instance deployment.
