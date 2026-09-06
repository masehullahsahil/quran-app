# The Qaida teacher audit

The Qaida course in this app was written by a software team. It has not been checked by a qualified Qari or Qaida teacher, and until it has, nothing in it should be presented as finished teaching material.

This document explains how that review is carried out and recorded. It describes the *mechanism*; it certifies nothing.

> **What a passing test suite means here.** `pnpm test` checks that the curriculum data is well formed: the Arabic is not malformed, no lesson shows a mark it has not taught, every Quran reference points at a surah and ayah that exist, no exercise can be passed by always tapping the first option. None of that is review by a teacher, and the audit model refuses to treat it as such. Every item starts — and stays — `AI-drafted` until a named, qualified person records otherwise.

## What is under review

| | Count |
|---|---|
| Levels | 12 |
| Lessons | 42 |
| Practice items | 116 |
| **Review items in the inventory** | **608** |

The 608 items are the whole course broken into the smallest things a teacher can accept or reject one at a time:

| Item kind | Items | What it is |
|---|---|---|
| `level` | 12 | A level's title and objective |
| `prerequisite` | 53 | A lesson's dependency on an earlier one, plus each level's placement |
| `lesson-objective` | 42 | What a lesson claims the learner will be able to do |
| `lesson-teaching` | 37 | The explanation shown before practice |
| `tajweed-explanation` | 5 | The same, for the lessons that name a rule of recitation |
| `arabic-example` | 85 | A teaching combination shown on screen |
| `quran-reference` | 35 | A quoted Quranic word, or an ayah the course opens |
| `exercise-prompt` | 116 | A practice question as the learner reads it |
| `expected-answer` | 116 | What the course counts as the correct answer |
| `mastery-rule` | 42 | The counting rule that completes a lesson |
| `boundary-note` | 9 | A statement of what the app does not judge |
| `articulation-note` | 56 | The written articulation note and practice cue for each of the 28 letters |

The inventory is **derived** from `shared/qaidaCurriculum.ts` and the English pack in `locales/en`, never maintained alongside them. A lesson added to the curriculum appears in the audit the moment it exists, as `pending-review`; a test asserts that the set of lessons under review and the set of lessons in the course are the same set.

## Review categories

Every comment is filed under one of eight categories, so the audit can be read as "what is wrong with the tajweed terminology" as well as "what is wrong with level 7":

| Category | The question it asks |
|---|---|
| Quran text / reference accuracy | Does the quoted text belong to the ayah named, spelled as it should be? |
| Arabic letter & harakat accuracy | Are the letters, vowels and marks written correctly? |
| Makhraj / articulation | Is anything said or implied about where a sound is made, and is it right? |
| Tajweed terminology | Are the names of the rules used correctly? |
| Instructional sequence | Is this taught in the right place, after what it depends on? |
| Exercise correctness | Is the question answerable, and is the marked answer the right one? |
| Beginner clarity | Would a beginner understand this as written? |
| Mastery / progression criteria | Is the rule for completing a lesson a reasonable standard? |

## Review states

| State | Meaning |
|---|---|
| `pending-review` | Nobody has looked at it. Everything starts here. |
| `correction-requested` | The reviewer says it is wrong and says what should change. |
| `needs-clarification` | The reviewer cannot judge it as written and needs the intent explained. |
| `approved` | A named, qualified reviewer accepts it as it stands. |

And separately, the provenance the interface must show:

| Provenance | Meaning |
|---|---|
| `AI-drafted` | Written by the team with model assistance. **Where all 608 items stand today.** |
| `Teacher-reviewed` | A qualified reviewer has recorded a comment on it. |
| `Teacher-approved` | A qualified reviewer has approved it, in their name, with their attestation. |

An approval is refused by `recordReview` unless it carries all of: the reviewer's name, their qualification, the date, and an attestation written by them. The same conditions are re-applied when a ledger is read back from a file, so an approval cannot be introduced by editing the export.

## How to perform the audit

### 1. Open the review workspace

```bash
pnpm dev
# then open http://localhost:3000/curriculum-audit
```

Fill in your name, an identifier if you want one recorded (an email, an ijazah number), and your qualification. These are stored on your own machine and copied onto each review you record. **Your qualification must be filled in before you can approve anything.**

### 2. Work through the levels in order

The workspace opens on Level 1 and moves level by level. For each item you see the Arabic at reading size and unmirrored, the lesson objective, the teaching explanation, the practice examples, what the course counts as the correct answer, the Quran reference where there is one, and the rule that lets a learner complete the lesson.

Tick **Show only items still pending** to hide what you have already dealt with when you come back to a level.

### 3. Record a decision

For each item that needs one, press **Record a review** and give:

- **Status** — correction requested, needs clarification, or approved;
- **Category** — one of the eight above;
- **Severity** — blocking, major, minor, or a note;
- **Correction affects** — *wording only*, or *curriculum logic*. This matters to whoever applies it: a wording change is a text edit, while a logic change moves lessons, changes an answer or alters what unlocks what, and the curriculum's own tests have to be re-run against it;
- **What you observed**, and optionally **the correction you propose**. Your proposed correction is recorded as your words. It is never applied automatically, and a developer applying it should return the changed text to you before it ships.

Approving an item asks for one more thing: your own attestation, in the first person. Nothing else in this repository can produce that sentence.

You do not have to finish in one sitting. Reviews are saved as you go.

### 4. Hand the audit back

**Export review file** writes a JSON document of every review you have recorded — item id, status, category, severity, impact, your comment, your proposed correction, your name and the date. That file is the audit. Keep a copy; it is the record that this review happened and what it said.

**Import review file** merges a file back in, so a second reviewer can work separately and the two ledgers can be combined without either overwriting the other.

### 5. Or review on paper

```bash
pnpm audit:qaida --out review.md            # the whole inventory
pnpm audit:qaida --level tajweed-patterns   # one level
pnpm audit:qaida --pending                  # only what is still unreviewed
pnpm audit:qaida --ledger audit.json        # with reviews recorded so far
```

The report is the same inventory as a Markdown document, with a blank line under each item for a status, a comment and a proposed correction. **Print this level** in the workspace does the same for one level in the browser.

## Questions already raised for you

Fourteen questions were recorded while the inventory was built — things that looked as though they might be wrong. **None of them has been acted on.** The curriculum is exactly as it was; each question is attached to the items it concerns and appears beside them in the workspace and in the report, marked as raised by tooling rather than by a reviewer.

They cover, among others: the letter names used for ت and ط (both "Taa") and for ح and ه (both "Haa"); whether opening al-Fatiha 1:1 as the learner's first ayah suits the numbering this app should follow; the placement of fathatayn before a final alif; whether the course should use simplified qaida spelling or the mushaf's Uthmani spelling; whether the 28 written articulation notes should exist at all; the five stop marks taught and their stated meanings; and whether "every practice item correct" is the right standard for completing a lesson.

Treat them as a starting queue, not as findings. Disagreeing with one is a perfectly good outcome, and recording that disagreement is useful — it is why the question is filed against an item you can comment on.

## What a correction does *not* do

Recording a correction changes nothing in the course. That is deliberate: an audit that edited the curriculum as it went would leave nobody able to say which lesson a teacher actually read. The sequence is:

1. the teacher records the correction in their own words;
2. a developer applies it to `shared/qaidaCurriculum.ts` or `locales/en`, runs `pnpm test` and `pnpm verify:qaida`, and — for anything marked *curriculum logic* — checks the ordering and prerequisite tests specifically;
3. the changed text goes back to the teacher, who reviews the item again;
4. only then can the item be approved.

## Where things live

| | |
|---|---|
| The audit model — states, categories, provenance, validation | `shared/curriculumAudit.ts` |
| The inventory as it stands for this course | `shared/curriculumAuditInventory.ts` |
| Questions raised for the teacher | `shared/curriculumAuditFindings.ts` |
| The review workspace | `client/src/pages/CurriculumAudit.tsx`, route `/curriculum-audit` |
| Where a reviewer's records are kept, and the export/import | `client/src/lib/curriculumAuditStore.ts` |
| The printed report | `scripts/curriculum-audit-report.ts` (`pnpm audit:qaida`) |
| The audit's own tests | `shared/curriculumAudit.test.ts`, `client/src/lib/curriculumAuditStore.test.ts` |

Two deliberate scope decisions:

- **The review records are not in the database.** The audit is a document a named person signs and should be able to keep, attach to an email and hand back — not a row only this app can read. It is stored locally and exported as JSON, and reviewer identity never sits in the same store as curriculum content.
- **The workspace is in English and outside the locale packs.** It is a reviewer's tool rather than part of the learner's app; keeping it out of `locales/` means adding it cannot dilute the learner-facing translation coverage the packs are measured on.

## The sentence that matters

> No part of this curriculum has been approved by a qualified teacher. 608 items are drafted and awaiting review.

That line is computed from the ledger — by `approvalStatement` in `shared/curriculumAudit.ts` — and printed at the top of the workspace and of every report. It changes only when a qualified teacher records approvals, item by item, in their own name.
