# Real-device retest: recitation pipeline failure classes

Companion to the Phase 0 fix (branch `bro/recitation-pipeline-diagnostics`).
Run these on a real phone — the failure only reproduces on a real device,
never in a desktop browser.

## Setup

1. Deploy the branch (or run the dev server the phone can reach).
2. Open the Study view, pick surah 1, ayah 1 (Al-Fatiha 1:1).
3. Open the server logs where you can watch them live
   (`[recitation]` lines). If you have the staff validation run active, the
   attempt ledger records the same classes.

## Test 1 — normal recitation (the original failure)

1. Press record, recite 1:1 at a calm pace, press Stop & review.
2. **Expect:** a word-recall review (score / corrections / next step), not
   "the speech service did not respond".
3. If it still fails, read the failure class — do not guess:
   - Server log `[recitation] transcription failed` with
     `code: TRANSCRIPTION_FAILED, httpStatus: 401|429|5xx` → provider-side.
     Check the OpenAI key / quota / status page.
   - `code: EMPTY_TRANSCRIPT` → the provider answered 200 with no text.
     The UI now says "could not be checked — record again" (the honest
     class), and the log carries `segments=` / `durationSec=`.
   - Server log `[recitation] transcription returned no Arabic` with
     `noSpeechProbMean` ≥ ~0.8 → the microphone captured silence, not your
     voice. Check the phone's mic permission and that no other app holds
     the mic. A low value with non-empty text means Whisper heard sound
     but not Arabic.
   - Server log `[recitation] audio payload rejected` → the upload itself
     was corrupt/empty. Note the `code` (`BAD_REQUEST`).
   - UI "The review request could not reach the server" → the request died
     between the phone and the server (network), not at the speech
     service.
   - The network response's `reviewMessage` field carries the same class
     string (`transcription:EMPTY_TRANSCRIPT`,
     `no-arabic:no-speech-prob=0.97:duration=2.0s`, …) for the report.

## Test 2 — silent capture (no-speech class)

1. Record 1:1 but stay silent (or cover the mic), then stop.
2. **Expect:** the "no usable transcript" sentence — never "the speech
   service did not respond" — and a server log line
   `[recitation] transcription returned no Arabic` with a high
   `noSpeechProbMean`. This is the diagnostic that was missing before:
   silence at the mic is now named as silence at the mic.

## Test 3 — airplane-mode upload (connection class)

1. Record 1:1, then enable airplane mode before pressing Stop & review
   (or stop the dev server mid-review).
2. **Expect:** "The review request could not reach the server. Check your
   connection and try again." — not the generic review-failed sentence and
   not the speech-service sentence.

## Test 4 — teacher voice in each language

1. In Study, set the interface language to English. Complete a review with
   coaching audio on.
2. **Expect:** the teacher speaks the guidance on the *first* attempt, not
   only on later ones. (Before the fix, iOS Safari's asynchronously-loaded
   voice list raced the first speak and lost.)
3. Switch to Urdu / Pashto / Dari. Complete a review.
4. **Expect:** the sentence stays on screen and is not read aloud in the
   wrong language. iOS Safari ships no voices for these languages, so
   silence-with-text is the correct, honest behaviour — a missing voice is
   never substituted. (A neural TTS voice remains the future extension
   point; see `docs/coaching-voice.md`.)

## What was deliberately not changed

- No alignment, matching, correction, advancement, or threshold logic was
  touched. Scores and decisions are byte-identical; only the failure
  *naming* changed.
- Quran text is never synthesized: the TTS path still takes a locale key,
  never text, and the speakable-key allowlist is unchanged.
