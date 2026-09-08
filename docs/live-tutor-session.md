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

`tutor.start` creates a server-owned session. `tutor.turn` accepts the exact
session snapshot returned by the preceding turn and rejects stale or changed
snapshots with `refresh-session`. The v1 store is an intentionally bounded,
in-memory map. A process restart or serverless cold start loses live sessions;
the client must re-establish the current lesson. This store is not a competing
progress database.

## Inputs and actions

The engine consumes the structured learner intents exported by
`shared/tutorConversation.ts` (`start`, `again`, `repeat-word`, `hear-word`,
`hear-ayah`, `hint`, `from-beginning`, `continue`, `pause`, `resume`, and
`stop`), future timing events, or a bounded recitation result. It does not parse
open-ended Pashto, Dari, Urdu, Arabic, or English speech. A conversation layer
must resolve language into one of these intents first.

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

The tutor consumes a small transcript-free subset of `recitation.evaluate`:

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
active target. Callers must pass the result returned by the existing recitation
evaluator directly; arbitrary client-derived progression is not a Quran
correctness signal. A learner `continue` intent cannot change the Quran
position and cannot bypass an active correction.

No tutor state or action claims tajwid, makhraj, madd, ghunnah, harakah, or
pronunciation correctness. Diagnostics from `traceLiveTutorTurn()` contain only
phase, action, intent, evidence category, surah, ayah, and target index. They do
not contain audio or transcripts.

## Remaining voice work

Continuous conversation still needs a multilingual intent resolver, trusted
wiring from each evaluator response into `tutor.turn`, VAD/stream event
production, conversation wording, playback orchestration, reconnect handling,
and durable or shared live-session storage for multi-instance deployment.
