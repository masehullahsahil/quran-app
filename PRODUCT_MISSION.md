# Quran App — Product Mission

We are building an intelligent Quran learning, recitation, and memorization application.

The goal is not simply to display Quran text or play recitation audio.

The long-term goal is to create an **interactive Quran tutor** that can listen to a learner while they recite, understand where they are in the Quran, detect meaningful mistakes conservatively, and guide them through correction in real time.

The app should feel closer to practicing with a patient Quran teacher than using a conventional Quran reader.

## Core Product Goals

### 1. Live Quran Recitation

A learner should be able to:

* choose a surah/ayah or lesson
* press Start once
* begin reciting naturally
* keep the microphone active while reciting
* have the application follow their Quran position in real time
* receive immediate guidance when sufficiently strong evidence shows a mistake
* continue without constantly pressing buttons

The application should eventually support a natural hands-free learning loop.

## 2. Real-Time Position Following

The system should determine where the learner is within the expected Quran text.

It should be able to understand progression through:

* ayahs
* words within an ayah
* repetitions
* pauses
* retries
* skipped words

Position must come from trusted server-side Quran context and evidence.

The browser must never be allowed to declare that the learner completed an ayah or correctly pronounced a word.

## 3. Conservative Mistake Detection

False corrections are especially harmful in Quran learning.

The app should prefer:

**"I am not certain"**

over incorrectly accusing the learner of a mistake.

A correction should only occur when the evidence is sufficiently strong.

Examples include:

* clearly omitted Quran words
* reliable word-order mistakes
* later, pronunciation/tajweed issues only when a validated acoustic system can support the claim

Uncertain transcription must not become confident Quran criticism.

## 4. Exact Correction Flow

When the system detects a reliable mistake, the teaching experience should be simple.

For example:

1. learner recites an ayah
2. system detects that Word 3 was skipped
3. Tutor interrupts
4. exact missed word is shown
5. trusted Qari audio for that word is played when available
6. learner repeats the word
7. learner must then recite the complete ayah again
8. only a valid complete ayah allows progression

Correcting one word does NOT mean the ayah has been completed.

## 5. Quran Authority Must Remain Server-Side

This is a critical architectural principle.

Trusted server-side systems own:

* canonical Quran text
* surah/ayah position
* expected words
* word indexes
* advancement decisions
* correction targets
* teaching state

The browser may provide:

* audio
* timing information
* learner intents
* session references

The browser must not be able to submit trusted Quran correctness evidence.

## 6. No Fabricated Quran Claims

The application must never claim more than its evidence supports.

For example:

If transcription recognizes a target word, the Tutor may say:

**"I heard the marked word."**

It should NOT automatically say:

* "Your pronunciation was correct."
* "Your makhraj was correct."
* "Your tajweed was correct."

Those claims require validated acoustic evidence.

## 7. Trusted Quran Audio

Quranic Arabic must never be generated using normal text-to-speech.

For Quran words, ayahs, and teaching pronunciation references:

* use authentic trusted Qari recordings
* use approved teacher recordings for Qaida material
* if trusted audio is unavailable, say it is unavailable

Never silently substitute synthetic Quran recitation.

## 8. Hands-Free Tutor

The long-term interaction should behave like a teacher.

The Tutor should:

* listen most of the time
* speak briefly
* interrupt only when appropriate
* give one clear instruction at a time
* know whether it is the learner's turn or the Tutor's turn
* automatically reopen the microphone after playback/correction
* avoid walls of text
* avoid multiple competing instructions

The learner should not need to continually press:

* Start
* Stop
* Done
* Check
* Continue

during normal recitation.

## 9. Qaida Curriculum

The application also includes a complete structured Qaida learning curriculum.

The learner should progress from:

* Arabic letters
* letter forms
* short vowels
* tanween
* long vowels
* sukoon
* shaddah
* definite article
* hamzah forms
* introductory tajweed patterns
* Mushaf symbols
* guided Quran reading

Qaida should eventually include authentic teacher-recorded pronunciation examples.

The curriculum must remain structured and pedagogically coherent.

## 10. Memorization

The app should eventually support Quran memorization as a first-class workflow.

This includes:

* selecting memorization portions
* repeated listening
* reciting from memory
* hiding Quran text when appropriate
* tracking learned verses
* identifying weak verses
* review scheduling
* repetition history
* progress over time

Memorization logic must remain separate from temporary live-recitation state.

## 11. Five-Language Tutor

The learner interface currently supports:

* English
* Pashto
* Dari / Afghan Persian
* Urdu
* Arabic

Tutor instructions should eventually work naturally in all five.

Quranic Arabic itself must always remain unchanged regardless of interface language.

## 12. RTL and Quran Text Integrity

The application must preserve Quran text exactly.

Never:

* reorder Quran words
* strip harakat unintentionally
* normalize Quran text for display
* mirror Arabic visually
* modify canonical Quran data to make UI easier

Arabic Quran text should retain correct:

* direction
* Unicode
* diacritics
* word ordering

Normalization may be used internally for matching, but never overwrite canonical display text.

## 13. Real-World Audio Matters

Automated tests are necessary but not enough.

Eventually the system must be validated with:

* real learners
* correct recitations
* deliberate skipped words
* repetitions
* hesitations
* long waqf pauses
* background noise
* phone microphones
* different accents
* children/adults
* different recitation speeds
* real mobile networks

Synthetic transcripts cannot prove that the live tutor works well.

## 14. Safety Philosophy

The system should fail conservatively.

When evidence is weak:

* do not advance
* do not accuse
* do not invent a correction
* do not guess Quran position aggressively

When infrastructure fails:

* preserve learner progress
* avoid false teaching
* degrade to manual Study if necessary

## 15. Architecture Philosophy

Prefer:

* deterministic Quran correctness logic
* typed contracts
* server-side authority
* explicit state machines
* comprehensive tests
* conservative evidence rules
* clear auditability
* simple architecture

Avoid:

* uncontrolled agent behavior
* LLM deciding Quran correctness
* client-side authority
* duplicated Quran state
* synthetic Quran speech
* excessive infrastructure
* cleverness that weakens correctness

## Current Product Direction

The current application already has major pieces of this architecture:

* structured Qaida curriculum
* recitation evaluation
* verse following
* exact-word correction
* Live Tutor state engine
* hands-free browser flow
* continuous live recitation tracking
* trusted Quran audio paths
* multilingual Tutor UI
* retry/idempotency handling
* production readiness and health monitoring

The next stages should focus increasingly on proving that these systems work with **real Quran recitation on real devices**, while continuing to strengthen reliability, teaching quality, memorization workflows, and production infrastructure.

## North-Star Experience

The experience we are working toward is:

> A learner opens the Quran lesson, presses Start, and begins reciting.
> The Tutor listens continuously, follows the learner's location, stays quiet while the recitation is correct, interrupts only when there is strong evidence of a mistake, plays the correct trusted Quran reference, asks the learner to fix the mistake, then continues listening automatically.

The learner should feel:

**"The app is listening to my Quran and teaching me."**

not:

**"I am operating a recording and scoring tool."**

Use this mission as the product-level guide when evaluating or implementing future work.

Do not optimize a local technical component in a way that moves the application away from this experience.
