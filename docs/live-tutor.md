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

## Wiring it to the tutor engine

The panel is complete and tested against its props; it is not yet mounted in
`Home.tsx`, because the state it renders is Codex's to produce. To connect it:

1. produce a `TutorSessionView` from the session state — `state`, `target`,
   `canHearWord`, `canHearAyah`, `hintAvailable`, `hintShown`;
2. render `<LiveTutorPanel session={…} ayah={…} onIntent={…} />`;
3. map the eleven `TutorIntent`s onto the existing handlers — `again` and
   `repeat-word` to the recorder, `hear-word`/`hear-ayah` to the Quran audio
   already wired in Study, `pause`/`resume`/`stop` to the session;
4. pass anything worth keeping as `details`, which renders collapsed.

`CorrectionStage` and `TargetRecognition` in `shared/wordCorrection.ts` map onto
`TutorState` directly: `hear`/`say-word` → `correction`, a `recognised`
recognition → `word-recognised` then `recite-ayah`, `continue` → `complete`.

## Limitations

- **Not yet mounted.** Study still renders the focused-word lesson from #49–#53.
  This PR is independently mergeable and changes nothing about that flow beyond
  the two contradictory-state fixes above.
- **The hint is a shape, not a curriculum.** `tutor.hintGiven` says "Start from
  *{word}*", which is the only hint the current data supports. A real hint
  ladder is a content question for a teacher.
- **No voice channel.** By design, and said out loud.
- **The teacher's words are AI-drafted** in all five languages
  (`translationStatus: "ai-drafted"`, `nativeReviewed: false`). They are the most
  learner-facing copy in the app and would benefit most from native review.
