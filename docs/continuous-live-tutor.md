# Continuous Live Tutor v1

The live path preserves the Quran authority chain:

```text
audio chunk -> server transcription -> deterministic Quran alignment
            -> stable live event -> existing Tutor correction state
```

The browser sends audio, MIME type, capture timestamps, attempt scope, and
ordering identifiers. It cannot send expected Quran text, a current word
index, a missed word, correction evidence, target recognition, or advancement.
Canonical ayah text and the active correction target are loaded on the server.

## Protocol

`recitation.startLive` binds a server-generated stream id to the current
server-owned Tutor session. `recitation.ingestLiveAudio` accepts:

- Tutor session id and expected revision
- stream, turn, and chunk ids
- one monotonically increasing sequence
- `ayah` or `word` attempt scope
- `interim` or `final` recognition stability
- whether VAD/capture has closed the utterance
- audio plus capture start/end timestamps

An open utterance is transcribed and sent only to the incremental tracker. A
completed utterance uses the same trusted full evaluator as
`recitation.evaluateWithTutor`. Focused-word turns therefore retain #53's
textual recognition rule, and only the existing full-ayah evaluator can update
`lastCompletedAyah`. The server also derives the required scope from trusted
Tutor state: an active `say-word` correction accepts only a word turn, its
`recite-ayah` stage accepts only an ayah turn, and a normal session accepts only
an ayah turn.

## Stable omission rule

The tracker aligns every server transcript with the canonical ayah using the
existing Arabic normalizer and dynamic-programming word aligner. It may expose
tentative position, but it emits `word-omitted` only when all of these are true:

1. The absent target is not Word 1, where microphone clipping cannot be
   distinguished safely from omission.
2. Every canonical word before the target is accounted for.
3. An exact later canonical word is aligned after the absent target.
4. Either the recognition is finalized, or the same target and later word
   persist through two consecutive ordered interim observations.

One interim transcript can reach only `possible-skip`; it is structurally
incapable of creating a correction. Partial text such as `الع...`, unrelated
Arabic, non-Arabic output, repetition without later progress, and silence do
not satisfy the rule. A token aligned as a different word is also not relabeled
as an omission. The tracker implements omission only in v1; speculative
substitution classification is deliberately deferred.

Live position is not ayah completion. It has no `lastCompletedAyah` field and
never advances the Tutor. A confirmed omission creates the same
`CorrectionSessionSnapshot` used by the existing correction loop, keeps the
Tutor on the current ayah, and returns `interrupt-learner`. The stream then
rejects more open-ayah chunks until the correction flow supplies a completed
focused-word turn.

## Ordering and retries

The process-local coordinator accepts exactly the next sequence and reserves
one in-flight input per stream. It rejects sequence gaps, older arrivals, stale
Tutor revisions, and stream/session mismatches before transcription.

Chunk ids deduplicate incremental retries. Turn ids deduplicate completed
utterances. A SHA-256 digest also catches a network retry sent under a new id;
the digest is never logged or returned. Processed identifiers are bounded.
Duplicate full-ayah success therefore cannot advance twice, and duplicate
omission evidence cannot create a second correction.

Like the v1 Tutor session itself, this coordinator is process-local. Losing a
serverless instance returns `lost-stream` and applies no recitation result or
progress. Durable multi-instance recovery remains future work.

## Automatic channel policy

Structured `nextChannel` values tell a future microphone controller what to do:

- `keep-listening` during normal or uncertain incremental recognition
- `interrupt-learner` when an omission is first confirmed
- `play-target-word` for trusted Qari playback
- `listen-for-target-word` for focused correction
- `listen-for-full-ayah` after target recognition
- `listen-next-ayah` only after trusted full-ayah advancement
- `wait` while a teaching/playback action owns the turn
- `do-not-listen` while paused, stopped, completed, stale, or lost

Timing events remain audio-activity observations only. They cannot create Quran
progress or a correction. The response includes capture, recognition,
confirmation, and Tutor-action timestamps for future latency measurement, but
no raw transcript or audio is logged.

## Current limitations

This PR supplies the shared/server contract and deterministic orchestration;
browser VAD, rolling audio capture, automatic playback, and UI mounting are
separate work. Each open chunk currently uses a normal Whisper transcription
request, not a persistent streaming ASR connection. That establishes the
authority and stability baseline but still needs real-provider latency and
revision testing before claiming genuinely low-latency production streaming.
