# Coaching voice

How the teacher's spoken sentences work, and how a natural neural voice
plugs in later.

## The rule

**Never synthesize Quran recitation.** Synthetic speech is only for the
teacher's explanatory sentences ("You missed one word.", "Listen.", "Now
repeat the full ayah."). Any Quran word or ayah uses trusted Qari audio
only — the reciter's recordings, never a synthesiser.

It is enforced structurally, not by convention. There is **no text or
string-typed parameter anywhere in the speech path**:

1. A speech request is a locale *key* plus the learner's language
   (`CoachSpeechRequest` in `shared/coachSpeech.ts`): `{ messageKey,
   params?, language, muted? }`. The key must be on `SPEAKABLE_COACH_KEYS`
   (same module); anything else is refused with `{spoken: false, reason:
   "not-speakable"}`. Quran text has no key on that list, so there is no
   code path from a plan, a transcript, or a review to a spoken Quran word.
   A caller that smuggles a `text` property finds it ignored — the provider
   reads the key and nothing else.
2. Interpolation params are numbers or *key references*, never strings:
   `{nextStep}` is always `{ key: "plan.qaida.afterRecordingCue" }` or
   another key on `SPEAKABLE_COACH_PARAM_KEYS`, resolved in the learner's
   language by whoever speaks the sentence. Both the browser provider and
   the neural endpoint refuse a param naming any other key — and the schema
   has no string-typed slot at all, so a Quran word passed as a param value
   fails validation before any sentence is resolved. Resolved text exists
   only inside the provider/endpoint, immediately before synthesis, and it
   can only ever be the locale packs' own coaching sentences.
3. Review guidance travels the same way: the server returns
   `spokenGuidanceKey` (a key reference with key-ref params), and the
   client resolves it with its own locale pack — the voice and the screen
   can never disagree.
3. The neural endpoint (`POST /api/coach-speech`,
   `server/coachSpeechEndpoint.ts`) accepts only `{ messageKey, language,
   params }`, rejects any body carrying `text`, rejects non-allowlisted
   keys and unsupported languages with 400, and resolves the sentence
   itself with the server's locale packs. The synthesiser behind it can
   only ever receive a project-authored coaching sentence. With no vendor
   configured it answers 501 and the client falls back — it never accepts
   text, configured or not.
4. Adding a new speakable sentence still means adding its key to
   `SPEAKABLE_COACH_KEYS` — there is no other door. `tutor.hintGiven`,
   which interpolates a Quran word, is on `DISPLAY_ONLY_COACH_KEYS` and is
   shown, never spoken.

## What ships today

`BrowserCoachSpeechProvider` (`client/src/lib/coachSpeechProvider.ts`):

- Uses the platform's `speechSynthesis`.
- Receives the key, resolves the sentence through the lesson's own
  `translate` in the learner's language, and speaks that.
- Picks a voice by strict language-subtag matching: an English voice is
  never chosen for Pashto, a Persian voice never for Urdu. A language with
  no voice resolves to `{spoken: false, reason: "no-voice"}` and the
  sentence is shown on screen — falling back to *displaying* is always
  correct; falling back to a wrong voice is not.
- Within the matching voices, prefers ones whose names advertise natural or
  neural synthesis, and applies per-language prosody (a touch slower than
  conversation for instruction, never dragging).
- Normalises punctuation that synthesisers read awkwardly ("..." becomes a
  pause, not "dot dot dot").
- `cancel()` settles any pending `speak()` as not-spoken, so a cancelled
  voice never leaves a promise hanging — the orchestrator's own backstop
  stays the authority on when the microphone re-opens.

### Browser voice availability, by language

Browser speech voices are **device- and platform-dependent**: they depend
on the OS, the browser, and which voice packs the learner has installed.
Coverage varies by language — verify on the devices the learners actually
use rather than relying on remembered platform docs. A language with no
voice is not an error — the sentence stays on screen in the learner's
language, and the lesson never depends on the voice.
`detectCoachSpeechCapabilities()` reports per-language availability for
settings UI and diagnostics, so a learner sees plainly what their device
can speak rather than discovering it mid-lesson.

## The provider seam

`CoachSpeechProvider` (`client/src/lib/coachSpeechProvider.ts`) is the
interface the lesson speaks through:

```ts
interface CoachSpeechProvider {
  readonly id: string;
  canSpeak(language): boolean | Promise<boolean>;
  speak(request: CoachSpeechRequest, events?): Promise<CoachSpeechOutcome>;
  cancel(): void;
}
```

`createCoachSpeechProvider()` chains them: **neural first when configured,
browser next, on-screen text when neither can speak the language.**
Availability always beats order — a provider that reports it cannot speak
the language is skipped, never substituted with a nearby language. A
provider that claimed availability but fails at speak time yields to the
next one; a refusal (`not-speakable`, `muted`) is a policy decision and
stops the chain.

`ServerNeuralCoachSpeechProvider` is the extension point. It carries no
vendor, no URL and no key. It POSTs `{messageKey, language, params}` to a
**same-origin** endpoint (default `/api/coach-speech`) that holds the
vendor credential server-side and returns audio bytes, which are played
through an audio element. Until that endpoint is configured it reports
itself unavailable and the browser fallback carries the lesson. If the
endpoint errors, the composite falls through to the browser voice — the
lesson continues on screen.

## Plugging in a neural provider

Any vendor works; the client does not care which. Whoever it is:

- Verify each language's voice coverage **at integration time** — do not
  rely on remembered vendor docs. List only the languages the vendor
  voices actually cover in the client's `languages` config.
- The voice's language must match the learner's selected language.
  **Never serve Pashto text through an English or Persian voice** — a
  missing Pashto voice means on-screen text, not a substitute.
- Warm, unhurried teacher cadence: a conversational neural voice, not a
  narration/documentary one. The sentences are short explanatory
  coaching lines; keep them that way.
- Any neural voice must be reviewed by a speaker of the language before
  it teaches — the same bar as the locale packs.
- The endpoint must return audio only for the sentence it resolved — no
  added intro/outro — and should be rate-limited: it is a per-sentence
  API cost on the deployer's account.

### Integration steps

1. Choose a vendor and implement the `CoachSpeechSynthesizer` behind
   `POST /api/coach-speech` (see `server/coachSpeechEndpoint.ts`): it
   receives the already-resolved coaching sentence and the language, calls
   the vendor with the server-side credential, returns `audio/mpeg`.
   The endpoint already validates the key allowlist, the language, and
   rejects any `text` field — keep those checks. Keep the vendor
   credential in server environment, never in the client bundle, never in
   the repository.
2. Set the client config: `createCoachSpeechProvider({ neural: {
   enabled: true, endpoint: "/api/coach-speech",
   languages: [...] } })` — list only the languages the vendor voices
   actually cover.
3. Have a speaker of each covered language review the voice before it
   teaches.

## What still requires a decision

- **Which vendor** (or whether to ship without neural TTS — the browser
  fallback plus on-screen text is a complete lesson already).
- **Pashto coverage**: verify each vendor's Pashto voice coverage at
  selection time — do not rely on remembered vendor docs. Pashto coaching
  may stay on-screen text until a reviewed voice exists.
- **Voice review**: any neural voice must be reviewed by a speaker of the
  language before it teaches — the same bar as the locale packs.
- **Cost/latency budget**: neural audio is fetched per sentence; short
  coaching sentences keep this small, but it is a per-lesson API cost.
- **Translations**: the Pashto, Dari, Urdu, and Arabic locale packs were
  written for this change and have **not** been reviewed by native
  speakers yet. That review is required before these strings teach.
