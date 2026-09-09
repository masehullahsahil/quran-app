# The Live Tutor

The product this serves is a *lesson*, not a report.

A teacher sitting opposite a learner listens far more than they talk. When they
do talk it is one short thing — "You missed one word. Listen." — and the learner
always knows whose turn it is. The app used to end a recitation the other way
round: a score, a status line, a list of findings, several instructions
competing for the same tap. This is the replacement.

What is on screen, in order, and nothing else by default:

1. **the ayah**
2. **what the teacher just said** — one sentence
3. **the one thing to do now** — with at most two ways round it

## The pieces

| | |
|---|---|
| `shared/tutorConversation.ts` | the states, the intents, and the mapping from a state to one sentence and two or three controls |
| `client/src/components/LiveTutorPanel.tsx` | the panel that renders it |
| `locales/*/index.ts` — `tutor.*` | the teacher's words, in five languages |

**Nothing here decides anything about the recitation.** State, target word and
whether a word was heard arrive as a `TutorSessionView` from the correction
engine. `describeTutorView` is a pure function of that input, so the tutor
engine can drive the whole surface by supplying it.

## States

| State | The teacher says | Controls (first is primary) |
|---|---|---|
| `ready` | Start when you're ready. | Start |
| `listening` | I'm listening. | Pause · Start over |
| `checking` | One moment. | — |
| `correction` | You missed one word. Listen. | Hear the word · Try again · Hear the ayah |
| `word-recognised` | Good — I heard the marked word. | Try again · Hear the ayah |
| `recite-ayah` | Now recite the whole ayah. | Try again · Hear the ayah |
| `hint` | Would you like a hint? / Start from *{word}*. | Try again · Hear the word |
| `uncertain` | I couldn't hear that clearly. Try once more. | Try again · Hear the ayah |
| `paused` | Take your time. Tell me when to carry on. | Carry on · Finish |
| `complete` | Good. We'll stop here for now. | Continue · Finish |

Where a hint is available it takes the last slot rather than becoming a fourth
button, and it is offered only where a learner is stuck — never mid-recitation,
where it would read as the teacher interrupting.

## What the teacher will not say

- **Nothing about pronunciation.** Not makhraj, not tajwid, not "correct".
  *"I heard the marked word"* is a statement about hearing a word in a
  transcript, and it is the strongest claim in the vocabulary. A test asserts
  those words never appear in any state.
- **No accusation it cannot support.** The `uncertain` sentence contains no
  "wrong", "incorrect", "mistake" or "missed", and the word is not marked as the
  thing that went wrong.
- **No paragraphs.** Every sentence is ≤ 60 characters in English and at most
  two sentences; a test enforces both. The chatbot failure mode is a wall of
  text arriving while someone is trying to recite.

## One teaching state at a time

Reported from production after #53: recognising `رَبِّ` left the screen saying
*"Good — I heard the marked word this time"* while, above and below it, **"Needs
attention"** and **"Your word-recall review is ready"** were still standing.
Each was individually true. Together they told the learner nothing.

The rule: **only the current teaching state may dominate.** Once the engine
reports the target recognised:

- `targetUnresolved` goes false, and the word is shown with a tick as *context*
  rather than as an outstanding error;
- the eyebrow above it changes from "Needs attention" to "That word is through";
- the original observation — *why* the learner was sent there — stops being
  repeated, because it is history;
- **"recite the full ayah" becomes the dominant action.**

Correction-engine semantics are untouched. This is presentation.

Two small edits carried the rule into the existing Study screen:

1. `FocusedWordLesson` — the eyebrow and the observation line now follow the
   stage rather than the mere existence of a correction.
2. `Home.tsx`, **one line**: the recorder's own status (`.loop-message`, which
   is where "your word-recall review is ready" appears) is suppressed while a
   focused lesson is running, because the lesson is already saying what happened
   in the teacher's voice. It renders exactly as before when no lesson is
   running, which a test pins.

## Presence

Listening, checking, speaking, waiting — and whose turn it is. Each is a word on
screen as well as a tone and, for two of them, a slow fade or rotation. Nothing
is carried by motion or colour alone, and the global reduced-motion rule stops
both animations. Nothing pretends a human being is connected: presence says what
*the app* is doing.

## Speaking to the teacher

`Talk to your teacher` opens a small panel that says, in the learner's language:

> Not yet — the teacher does not listen for spoken instructions at the moment.
> When it does, these are what you will be able to say. Your recitation is never
> treated as an instruction.

…and lists the intents that will resolve: again, hear the word, hear the ayah,
hint, start over, continue, pause, finish. `TUTOR_VOICE_STATUS` is
`"not-listening"`. There is no always-on microphone, and none is implied.

`start` is deliberately not among them: a lesson begins by pressing, not by
speaking into a microphone that is not open.

## Audio boundaries

The panel raises an **intent**; the page decides what plays. Word and ayah
playback stay on the trusted Quran paths from #51, and Qaida reference audio
stays behind #52's approved-teacher ledger. **No Quranic Arabic is synthesised
anywhere**, and there is no speech-synthesis fallback: `hear-word` is simply not
offered when no trustworthy recording of the word exists.

## How it is wired into Study

Three pieces, in a line, and no state machine among them:

```
tutor.start / tutor.turn      useLiveTutor      liveTutorView       LiveTutorPanel
  (server owns the lesson) →  (the wire) →  (one vocabulary → another) → (markup)
```

**`client/src/hooks/useLiveTutor.ts`** is the only place the app talks to the
engine. It opens one session per lesson and then names it by `sessionId` and
`revision` — nothing else. Since #57 the public turn API takes a learner intent
or a timing event and there is no recitation variant, on the server or in this
file, so the browser has no way to tell the tutor what a recording contained.
It never advances a phase or chooses an action. When the tutor is unreachable,
`active` stays false and Study renders the surfaces it had before — which still
work.

A session is opened again when the *learner* moves to another ayah, and adopted
unchanged when the *server* moves the lesson to one; reopening it there would
throw away the advancement that had just happened.

The four answers the server can give, and what the hook does with each:

| Answer | What it means | What the hook does |
|---|---|---|
| `updated` | the turn landed | stores the trusted session and action |
| `rejected` | the turn was refused | stores the trusted session and action; the lesson is unchanged, and the server says why |
| `stale` | our revision was behind | stores the session the server returned — no local transition is invented |
| `lost` | no such session exists | drops the lesson entirely: no advancement, no completion, no resumed correction. Study falls back to its ordinary surfaces and a new lesson opens on the next move |

**`client/src/lib/liveTutorView.ts`** maps the engine's vocabulary onto the
panel's. It reads a phase and an action kind, and nothing else: no transcript,
no score, no alignment.

| Engine | Panel |
|---|---|
| `ready` | `ready` |
| `listening` | `listening` |
| `correcting-word` | `correction`, or `hint` when the action is `offer-hint` / `show-hint` |
| `recite-ayah` + reason `target-recognised` | `word-recognised` |
| `recite-ayah`, any later turn | `recite-ayah` |
| `waiting` + reason `recitation-uncertain` | `uncertain` |
| `waiting`, otherwise | `listening` |
| `paused` | `paused` |
| `completed` / `stopped` | `complete` |
| the microphone is open | `listening`, whatever the phase |
| an attempt is with the reviewer | `checking`, whatever the phase |

An unrecognised phase falls back to `listening` rather than inventing a lesson
state. The target is the engine's `activeCorrection` and is dropped when it
names another ayah or a position the ayah on screen has no room for — the same
rule the focused lesson gained in #50.

**`Home.tsx`** holds the microphone, the audio and the words, and asks the tutor
what to say. `runTutorIntent` sends the intent and does the local half: open the
recorder, play a file. Nothing there decides a lesson state; the turn that comes
back is what renders.

### Recordings, while a lesson is running

`recitation.evaluateWithTutor` (#57) takes the whole job in one call. The browser
sends audio, MIME type, learning level, interface language, attempt scope, and
the session reference. That is the entire payload, and the route's schema
rejects the rest: the expected Quran text, the surah and ayah, the neighbouring
ayahs, the position, and the correction target all come from the tutor's own
session. The answer is `{ recitation, tutor }` — the review Study already knew
how to render, and a tutor turn that was decided server-side. A response with no
`recitation` means the attempt did not land, and then nothing is shown, nothing
is written, and the Quran does not move.

Without a lesson, Study uses ordinary `recitation.evaluate` exactly as before,
client-supplied ayah context and all. There is no tutor authority to undermine
there, and that path is unchanged.

### The Quran position follows the server

One rule, and only one: when an accepted trusted answer puts the lesson at a
different surah/ayah, the screen moves to exactly that position. `continue` is a
request, not a move — it is sent to the engine and does nothing locally. No
next-ayah guess, no completion assumption, no score threshold and no reading of
the transcript may move the Quran while a lesson is running. Opening a session
at a position is not a move, so a learner who has paged ahead is not dragged
back to where the lesson started.

### The recording scope

`attemptScopeFor` reads the session phase, not the current action:

| Phase | Scope |
|---|---|
| `correcting-word` | `word` |
| `recite-ayah` | `ayah` — the target is still held, but the whole ayah is what is being asked for |
| everything else | `ayah` |

A correction is a word attempt through the whole of it — "listen to it" and "now
say it" alike — and reading only the action kind would submit a word attempt as
an ayah attempt on every turn but one, which is exactly what #53 exists to
prevent. The scope travels to `evaluateWithTutor`, and the server refuses a word
attempt made against a session with no active target.

### Ending a turn

`FINISH_TURN` ("Done") is a panel control and deliberately **not** one of the
engine's intents. The gap showed the moment the panel was first mounted: a
learner could open the microphone and had no way to close it. But closing it is
a recorder action — the engine learns what happened from the recitation evidence
that follows, not from being told the learner stopped talking. So the teaching
vocabulary stays exactly the eleven the engine knows.

### What the tutor replaces while it runs

Not deleted, and all still exactly what Study shows without a tutor:

| Surface | With a tutor running |
|---|---|
| `teacher-now` instruction block | hidden — the tutor says it, once |
| `StudyCorrection` / the focused lesson | hidden — same |
| the recorder's own status line | hidden — same |
| the live word guide | shown; it is the microphone's feedback, not a second instruction |
| Teacher notes, score, corrections table | shown, collapsed, as before |
| the developer diagnostics panel | unchanged, still behind its flag |

## Limitations

- **One session per lesson, in memory.** The engine's store is bounded and
  in-process; a cold start or a request routed to another instance loses live
  sessions. The server answers `lost`, no progress is created, and Study falls
  back until a new lesson opens. Durable or shared storage is still open work.
- **No voice-activity detection.** The learner ends a turn by pressing Done;
  timing events exist in the engine but nothing produces them yet.
- **The hint is a shape, not a curriculum.** `tutor.hintGiven` says "Start from
  *{word}*", which is the only hint the current data supports. A real hint
  ladder is a content question for a teacher.
- **No voice channel.** By design, and said out loud.
- **The teacher's words are AI-drafted** in all five languages
  (`translationStatus: "ai-drafted"`, `nativeReviewed: false`). They are the most
  learner-facing copy in the app and would benefit most from native review.
