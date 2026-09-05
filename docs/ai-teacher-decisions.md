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

### Tier 2 — the active correction

Immediately below NOW, visually attached to it, never collapsed. It carries the
target word in large Arabic, one sentence saying what was observed, the slow
reference playback, and the retry line. It appears only for `repeat-word` — an
action the engine reached on confirmed evidence.

When the tone is `unsure` the panel does not appear at all, and the NOW block
uses a neutral palette rather than the amber one: an attempt the app could not
hear must never look like a confirmed mistake.

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
| Focus word | In NOW, and again in the correction table | Once, in the correction panel |
| Correction table (up to four rows with status pills) | Primary surface | Teacher notes |
| "Every expected word was recognised" | Primary surface | Teacher notes |
| Retry button inside the failure alert | Competed with the NOW button | Removed; the message stays |
| Decorative wash behind the ayah | Rendered on phones | Hidden on phones |

### Mobile order

On a phone the tiers stack as: location → instruction → focus word → listen and
record → one action → correction → the ayah itself → navigation. The learner
never scrolls past diagnostics to reach a correction, and the decorative artwork
is not rendered at all.

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
