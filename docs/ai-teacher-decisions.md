# The AI Teacher's Decisions

After every recorded attempt the app chooses **one** thing to ask of the learner. This document is the specification for that choice: where the evidence comes from, the order the rules are applied in, when the learner is allowed to move on, and what the app refuses to say.

The rules live in `shared/teacherDecision.ts` and are covered scenario by scenario in `shared/teacherDecision.test.ts`. The wording of each action lives in `client/src/lib/teacherAction.ts`; the split is deliberate and is described under [Evidence is not instruction](#evidence-is-not-instruction).

> This is a reading aid, not a Qari. Nothing here judges tajwid, makhraj, madd length or ghunnah unless a separately deployed, confidence-gated acoustic evaluator returned such a finding — and even then it is an observation for practice, not a ruling. A qualified teacher remains the authority.

## Evidence sources

`TeacherEvidence` is a small derived object assembled by the Study page each render. It holds conclusions the other systems already reached, never copies of their internals:

| Field | Comes from | Used for |
|---|---|---|
| `recording.isRecording` / `isReviewing` / `failed` | The recorder and the mutation state | The first two precedence rules |
| `attempt.reviewable` | `recitation.evaluate` — false when transcription failed or returned no Arabic | Abstention |
| `attempt.corrections` | The DP transcript aligner (`server/recitation.ts`), unchanged | The word to return to |
| `attempt.verseFollowing` | The verse-following tracker (`shared/verseFollowing.ts`), unchanged | Completion, position, evidence level |
| `acoustic` | The Quran-aware evaluator (`shared/quranEvaluation.ts`) | A sound observation, only when confident |
| `memory.reviewDue` | `deriveAyahMemory` from the existing spaced-review layer | Scheduling context |
| `memory.recurringWordIndexes` | `buildReviewQueue` → `focusWordIndexes`, from repeated-error history | Prioritising a known weak word |
| `livePosition` | The live recitation session, which moves while reciting | Where to carry on from, and which surah the learner is in |
| `hasNextAyah` | The loaded surah | Whether advancing is even possible |

No new state was introduced. No mastery model was added. The decision reads what already exists.

### The observation on a focus word

Every focus carries a `TeacherObservation` saying what was seen, so the interface
can explain the correction without re-deriving it from the alignment:

| Observation | Means | Shown as |
|---|---|---|
| `not-heard` | The word did not appear in the transcript | "This word was not heard." |
| `came-through-differently` | Something else was transcribed in its place | "Something else came through in its place." |
| `sound-observation` | The words were right; a confidence-gated listener flagged one | "The words were right. Listen closely to how this one is said." |

## Precedence

One decision, in this order. The first rule that matches wins, and every rule is a statement about *evidence*, not a preference about wording.

| # | Reason code | Action | Advance? |
|---|---|---|---|
| 1 | `recording_in_progress` | Listening… | no |
| 2 | `attempt_under_review` | Checking… | no |
| 3 | `recording_unreviewable` | Record again | no |
| 4 | `evidence_uncertain` | That was not clear enough to check | no |
| 5 | `text_recurring_word` | Repeat this word again | no |
| 6 | `acoustic_high_confidence` | Listen closely to this word, then repeat it | no |
| 7 | `ayah_complete` / `surah_complete` | Move to the next ayah / surah finished | **yes** / no |
| 8 | `text_missing_word` | Repeat word *n* | no |
| 9 | `tracker_repeat_ayah` | Repeat this ayah | no |
| 10 | `tracker_partial_progress` | Continue from word *n* | no |
| 11 | `review_due` | Review this ayah today | no |
| 12 | `default_listen` | Listen, then recite | no |

Two orderings deserve their reasoning, because they differ from the obvious arrangement:

- **A recurring error (5) outranks completion (7).** The tracker may be willing to advance on an attempt that just met its threshold. If the word that was missed is one the learner has missed before, that is stronger evidence about this learner than one passing attempt is, so the ayah is held and the word drilled. A first-time miss (8) does *not* outrank completion — a single slip on an otherwise complete ayah is normal progress.
- **A high-confidence acoustic finding (6) outranks completion (7), but a textual correction outranks the acoustic one.** If the words were all recited and the only remaining issue is how one of them sounded, that is worth one more repetition. But if a word is missing from the transcript, the learner has a reading problem, and reading comes before refinement — so 5 and 8 sit either side of 6 rather than below it.

## Advancement rules

`canAdvance` is true in exactly one case: reason `ayah_complete`. That means all of the following held:

- a **finalized, reviewed** attempt exists (the live stream never advances the learner by itself — it only moves the word position within an ayah);
- the attempt was reviewable;
- the verse-following tracker's own completion rules — unchanged by this work — said `shouldAdvance`;
- no blocking correction remained: no recurring word was missed, and no actionable acoustic finding was reported;
- there is a next ayah to go to.

Everything else returns `canAdvance: false` and `targetAyah: null`, and the UI shows no advance button. A parameterised test asserts this for all eleven non-advancing states.

The learner can still navigate manually with the pagination controls — the app guides, it does not lock doors. `canAdvance` is the app's *recommendation*, and it is the only thing that produces a "Go to ayah n" button.

## Confidence and abstention

The policy is: when the evidence is thin, say so and ask again. Never manufacture a correction to fill the silence.

| Situation | What the teacher does |
|---|---|
| Transcription failed, or returned no Arabic | `recording_unreviewable` → record again. No score, no correction, no advancement |
| Tracker reports `no_transcript`, `too_little_evidence` or `noisy_transcript`, or evidence level `none` | `evidence_uncertain` → "that was not clear enough to check". The position is held exactly where it was |
| Acoustic evaluator `abstained`, `unavailable` or `not_configured` | No sound claim of any kind is made |
| Acoustic finding below `ACOUSTIC_MIN_CONFIDENCE` (0.75) | Ignored entirely — not an instruction, not even a note |
| Acoustic finding with no word position | Ignored as an instruction; it names nothing to return to |
| Transcript clean, evaluator quiet | The attempt stands on its textual evidence. No pronunciation problem is invented |
| Words could not be established, but the evaluator was confident | The finding is **not** acted on. A claim about how a word sounded needs the word itself to be established first. It survives as a note only |

The confidence threshold is enforced twice: the server refuses to mark a review `available` below it, and `actionableAcousticFindings` re-checks it in the engine. If a future service or a relaxed server let a weaker observation through, the teacher would still ignore it.

## Textual and acoustic evidence together

| Textual | Acoustic | Decision |
|---|---|---|
| Clean, ayah complete | High-confidence finding on word *n* | Repeat word *n* for its sound; do not advance |
| Word missing | High-confidence finding elsewhere | Fix the missing word first; the finding becomes a note |
| Word missing | High-confidence finding on the *same* word | Fix the word; wording follows the textual evidence |
| Several findings | — | The lowest-positioned finding becomes the instruction; the rest are notes |
| Uncertain | Any | Abstain; act on neither |

Only one correction is ever the instruction. Everything else the attempt showed goes to **Teacher notes** under "What this attempt showed", which is explicitly labelled as observations rather than a judgement.

## Repeated-error behaviour

`memory.recurringWordIndexes` comes from `buildReviewQueue`, which already tracks a word missed three times in the last five attempts on an ayah. When one of those words is missed again:

- it becomes the focus, whatever the tracker concluded;
- advancement is withheld;
- the instruction wording changes ("This word again — word 4") so the learner knows it is a pattern, not a fresh slip;
- the teaching sequence is show → listen → repeat the word → recite the ayah.

When the recurring word is recited correctly, it does not block anything; it stays visible in Teacher notes as history.

## Teaching sequences

Actions carry a fixed sequence of steps rather than free-form advice, so practice is consistent:

| Action | Sequence |
|---|---|
| Repeat a word (textual, recurring or acoustic) | show-word → listen → repeat-word → recite-ayah |
| Repeat the ayah | listen → recite-ayah |
| Unclear evidence | listen → record-again |
| Unreviewable recording | record-again |
| Continue | recite-ayah |
| Listen first / review due | listen → recite-ayah |
| Next ayah / surah complete | — |

## Evidence is not instruction

The split is enforced by module boundaries:

- `shared/teacherDecision.ts` returns **what was observed** (`focus`, `secondaryNotes`, `evidenceLevel`) and **what to do** (`action`, `sequence`, `canAdvance`) as structured values. It contains no learner-facing prose at all.
- `client/src/lib/teacherAction.ts` maps the action to one locale key from a fixed table, plus at most one button. It computes nothing that could change which action was chosen; a test asserts its output mirrors the decision's `action`, `reason`, `canAdvance` and `targetAyah` exactly.

## The learner-facing hierarchy

The Study screen has three tiers, decided in `client/src/lib/studyView.ts` and
asserted in `studyView.test.ts`. Nothing about the layout is decided in JSX.

### Tier 1 — NOW

Where the learner is (`Al-Fatiha · Ayah 2 of 7 · Word 3`), one instruction as the
section heading, the listen and record controls, and **at most one** contextual
button. The word position appears only when the instruction is about a word.
Nothing technical: no evidence level, no reason code, no tracker state, no score.

### Tier 2 — how that attempt went

Immediately below NOW, visually attached to it, never collapsed. One card,
rendered by `client/src/components/StudyCorrection.tsx`, in one of four states.
The states are mutually exclusive by construction — `describeStudyTiers` returns
either a `correction` or an `outcome`, never both — and each has its own accent,
so they cannot be mistaken for one another.

| State | When | What is on screen |
|---|---|---|
| **the exact word** | `repeat-word` with a focus word | The Arabic word, larger than anything else in the card; `Word 3`; one sentence saying what was observed; numbered steps ending at the recorder; the slow ayah playback; what happens once it comes through |
| **the whole ayah** | `repeat-ayah` | "Recite the whole ayah again" and, explicitly, that no single word was singled out. No word is shown |
| **uncertain** | `unclear`, `recording-problem` | "I couldn't confidently review that attempt", that nothing has been marked wrong, and listen + record again. No word is shown |
| **accepted** | `next-ayah`, `surah-complete` | That the attempt was accepted, and the decision's own "Go to ayah *n*" button |

Three rules hold across all four:

- **No word is invented.** The Arabic comes from `decision.focus.expectedArabic`
  and nothing else. A state with no focus renders no word, so an attempt the app
  could not judge can never put a Quranic word on screen as though it were wrong.
- **The wording never outruns the evidence.** The observation sentence is chosen
  from `TeacherObservation` — `not-heard`, `came-through-differently`,
  `sound-observation` — and the sound wording says it is an observation about how
  a word sounded, not that it was pronounced wrongly.
- **The microphone is in the card.** `Record again` is the terminal step of the
  sequence and calls the page's one recorder. There is no second recorder, and
  the "Try again" button is dropped in card states rather than sitting beside it
  meaning nearly the same thing.

The steps are the decision's own `sequence` with `show-word` removed — the card
*is* the word. Nothing is added or reordered.

#### The exact-word state is a lesson, not a marker

When the page can build one, the exact-word card is replaced by
`client/src/components/FocusedWordLesson.tsx`, driven by
`client/src/lib/correctionSession.ts`. Showing the word and "try again" tells a
learner where the mistake is and leaves them to work out what to do about it; a
teacher points at the place, says it, listens to the learner say it back, and
only then asks for the whole ayah. The lesson is that, in four steps:

| Stage | Reached when | Primary action |
|---|---|---|
| `hear` | nothing recorded since the word came up, or a whole-ayah attempt still misses it | Say *{word}* |
| `say-word` | a focused attempt did not match the target | Say *{word}* |
| `recite-ayah` | a focused attempt matched the target | Recite the full ayah |
| `continue` | the service's session says so | Continue |

**No progress is invented.** The stage is a pure function of two facts: which of
the two record buttons the learner pressed (`lastAttemptScope`) and what the
newest review's own corrections list says about the target word. There is no
counter and no timer — replaying the same two facts always yields the same
stage, which is what `correctionSession.test.ts` asserts.

**Recognition has three values, and `unknown` is the common one.** An attempt
that produced no word-by-word result says nothing about the word and is never
reported as either success or failure.

**"Heard" is not "pronounced correctly".** When the target is matched the app
says *"Good — I heard the marked word this time."* It does not say the
pronunciation was right, and it never mentions makhraj or tajwid: matching a
word in a transcript is not an assessment of how it was said. Tests assert those
words never appear.

**The Quran text is rendered, not processed.** The context line shows the ayah's
own words in the ayah's own order with harakat intact; the target is marked with
a background. Nothing is normalised, transliterated or reordered, in any
interface direction.

**`retainedTarget` keeps the lesson on screen for the length of one attempt.**
The decision names no focus while a recording is in flight — the previous review
is cleared when the microphone opens — and names none once the word has gone
through. Without holding the word, the lesson would vanish under a learner who
had just pressed "Say", and would never get to say it heard them. It is a copy
of what the decision last named; it never creates a correction, and the page
drops it as soon as a reviewed whole-ayah attempt names no word.

**A correction belongs to one ayah, and cannot outlive it.** `retainedTarget`
carries the surah and ayah it was made about, and three checks stand between a
stale target and the screen — all at render time, because effects run after the
commit and the frame in between is a real frame a learner sees:

1. a review is evidence for the ayah it was an attempt at, and for no other. The
   page pairs each review with that ayah and drops it everywhere — instruction,
   cards, word rows, score — the moment the learner is somewhere else;
2. a review naming a word position the ayah on screen does not have is dropped
   whole, however it got there;
3. the lesson refuses any target — the decision's, the page's retained copy, or
   the service's session — that is not the word standing at that position in the
   ayah on screen, and renders nothing rather than something wrong.

Failing closed is the point. Advancing from Al-Fatiha 1:2 to 1:3 once carried
`رَبِّ` across and rendered "Word 3 of 2": a word that ayah does not contain, at
a position it does not have. The comparison behind check 3 folds harakat and the
alif variants — the reviewer's `expectedArabic` and the ayah text legitimately
differ that way — and compares only; nothing rendered is ever rewritten.

**The service's own session wins.** `deriveCorrectionLesson` takes an optional
`session` in the shape the recitation service will supply once it holds the
correction session itself (`CorrectionSessionSnapshot`). When present its
`stage` and `recognition` are used as given and the derivation above is not
consulted at all.

#### An attempt the engine declined to judge produces no findings

`unclear` and `recording-problem` set `abstained` on the view. Everything
derived from that attempt is then suppressed: the aligner's per-word rows, the
observations list, and the score. The aligner produces one row per expected word
whether or not any of them means anything, so a recording of a different ayah
used to show four "came through differently" rows beneath a card that had just
said the attempt could not be reviewed — four specific findings nobody had made.
The card says instead, in one line, that the recording did not match enough of
the ayah for individual words to be reviewed.

The same rule covers the score. A percentage under an unreviewed attempt reads
as a mark for the recitation. It is not shown at all.

**Hearing the word.** Where the source serves a recording of the word itself,
the lesson's prominent control is *Hear {word}* and the full ayah sits beneath
it; where it does not, the card replays the ayah slowly and says in as many
words that no separate word recording exists. Either way no Quranic Arabic is
ever synthesised, by browser speech synthesis or anything else — see
[docs/quran-word-audio.md](./quran-word-audio.md) for the source, what it is
verified to be, and what it is not.

Whichever card is showing takes the teaching steps and the contextual button
with it: NOW keeps the instruction, the place and the microphone, so the learner
is never offered the same tap twice a few centimetres apart.

### Tier 3 — Teacher notes

Collapsed by default: the observations list, the score, the full correction
table, memorization history and schedule, the tracker's own place and reason,
acoustic findings, the coaching plan, and the stage strip.

**Blocking messages never live here.** A failed recording, an unreviewable
review and unavailable audio stay visible outside the collapsed section.

### What moved, and why

| Element | Was | Now |
|---|---|---|
| "Listen. Repeat. Review." banner + badge | Above the instruction | Removed; the instruction is the heading |
| Ayah numeral rail | "Ayah / 02 / of 07" | Numeral only; the location line carries the words |
| Focus word | In NOW, and again in the correction table | Once, in the result card |
| Result of an attempt with no focus word | Generic instruction only | Its own card: whole-ayah, uncertain, or accepted |
| Record again after a correction | Only in NOW, above the correction | The last step of the correction card itself |
| The exact-word state | Word, observation, and a retry | A four-step lesson: hear it, say it, put it back in the ayah, carry on |
| Per-word rows under an unreviewed attempt | One row per expected word, in Teacher notes | Suppressed; one line says the recording did not match the ayah |
| Score under an unreviewed attempt | Shown as a percentage | Not shown |
| Surah position | "This reading — 29%", which reads as a mark | "Place in this surah — Ayah 2 of 7", with a line saying it is not a score |
| Correction table (up to four rows with status pills) | Primary surface | Teacher notes |
| "Every expected word was recognised" | Primary surface | Teacher notes |
| Retry button inside the failure alert | Competed with the NOW button | Removed; the message stays |
| Decorative wash behind the ayah | Rendered on phones | Hidden on phones |

### Mobile order

On a phone the tiers stack as: location → instruction → listen and record →
the result card (focus word, what was observed, the steps, and the recorder) →
the ayah itself → navigation. Inside the card each step takes its own row and
the recorder is a full-width target, so the learner never scrolls past
diagnostics to reach a correction and never hunts for the microphone. The
decorative artwork is not rendered at all.

## The language-model boundary

The coach model (`createCoachSummary` in `server/routers.ts`) **may**: phrase encouragement, restate the deterministic next step in friendlier words, and produce a short line safe to read aloud.

It **may not**, and structurally cannot:

- decide whether a Quran word was pronounced correctly — it never sees audio;
- infer tajwid from transcript text — its prompt forbids it and its output is not consulted for any decision;
- override advancement — `canAdvance` is computed before the model is called and is not an input to it;
- turn low-confidence evidence into a correction — it is given the deterministic corrections only.

Its three fields (`encouragement`, `nextStep`, `spokenGuidance`) are rendered **inside Teacher notes**. The primary instruction is always one of the `now.*` locale keys, and a test asserts that no service-written text can appear as the instruction, the button label or the focus word.

## Worked examples

**A clean ayah.** Tracker says `shouldAdvance`, evaluator abstained, no recurring words → `ayah_complete`, "Ayah complete — move to ayah 3", one button, `canAdvance: true`.

**One word dropped.** Corrections `[missing word 4]`, tracker `correcting` → `text_missing_word`, "Repeat word 4" with the Arabic shown large, sequence show → listen → repeat → recite, `canAdvance: false`.

**The same word dropped for the fourth time.** Same as above but word 4 is in `recurringWordIndexes`, and the tracker was ready to advance → `text_recurring_word`, "This word again — word 4", still no advance.

**A clean recitation with a confident sound observation.** Text complete, evaluator `available` at 0.92 on word 3 → `acoustic_high_confidence`, "Listen closely to word 3, then repeat it", no advance. The evaluator's own sentence appears in Teacher notes.

**A noisy room.** Tracker `uncertain`/`noisy_transcript`, evaluator confident about word 5 → `evidence_uncertain`, "That was not clear enough to check", listen → record again. The sound observation is *not* acted on.

**Nothing recorded yet, review due.** → `review_due`, "Review this ayah today", the mic is the next step.

## Limitations

- **The live stream never advances an ayah on its own.** Only a finalized reviewed attempt can, which means a learner reciting continuously moves within an ayah live but crosses the boundary on the recorded attempt.
- **`recurringWordIndexes` is per ayah**, from the existing review queue; there is no cross-ayah "this letter is hard for you" model.
- **One acoustic finding at a time.** Where several are reported, the lowest word position wins; there is no notion of which is pedagogically most valuable beyond that.
- **No adaptive pacing.** The engine chooses the next action, not the difficulty of the next ayah.
- **The evaluator is optional and usually absent.** With no `QURAN_EVALUATOR_URL` configured, every decision is textual, and the app says nothing about sound at all.
