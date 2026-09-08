# Qaida reference audio

**For a qualified teacher or Qari:** the recording protocol is §4 and the list of
what to record is §3. Everything else is how the app handles it.

The Qaida teaches Quranic Arabic. The only voice a learner may be played as a
model of how a letter sounds is a qualified teacher's, and only once another
qualified person has listened to it and said it is correct. Nothing here is
synthesised, and nothing plays on the strength of a file existing.

---

## 1. Where this stands

None of it is recorded. That is the honest position, and the app behaves
accordingly: every Listen control says the recording has not been added yet.

```
Qaida reference audio coverage

                                   targets  recorded  reviewed  approved  missing
--------------------------------------------------------------------------------
ALL                                  182         0         0         0      182
  instructional (record for us)      162         0         0         0      162
  Quran words (Quran audio only)      20         0         0         0       20

By level
  1. Arabic letters                   39         0         0         0       39
  2. Letter forms and joining          8         0         0         0        8
  3. Short vowels                     89         0         0         0       89
  4. Tanween                           6         0         0         0        6
  5. Long vowels                       5         0         0         0        5
  6. Sukoon                            5         0         0         0        5
  7. Shaddah                           6         0         0         0        6
  8. The definite article              5         0         0         0        5
  9. Hamzah and written forms          6         0         0         0        6
  10. Introductory tajweed patterns     5         0         0         0        5
  11. Mushaf symbols                   4         0         0         0        4
  12. Guided Quran reading             4         0         0         0        4

By category
  hamzah                               4         0         0         0        4
  joined-form                          8         0         0         0        8
  letter                              39         0         0         0       39
  letter-harakat                      84         0         0         0       84
  long-vowel                           4         0         0         0        4
  mushaf-symbol                        4         0         0         0        4
  quran-word                          20         0         0         0       20
  shaddah                              3         0         0         0        3
  short-vowel                          4         0         0         0        4
  sukoon                               3         0         0         0        3
  tajweed-pattern                      4         0         0         0        4
  tanween                              5         0         0         0        5
```

Regenerate with `npx tsx scripts/qaida-audio-report.ts`. The report is
deterministic, so it can be diffed between deliveries.

**"Approved" means a named, qualified reviewer approved it.** A delivered file
counts as `recorded` and nothing more. `shared/qaidaAudioCoverage.ts` will not
count an entry as approved unless it would actually be played, so a status of
`approved` with the reviewer field left blank does not inflate the number.

## 2. What the app does today

| | |
|---|---|
| A letter with an approved recording | plays it — Listen control, loading state, playing state, replay |
| A letter without one | the control is disabled and the interface says the recording has not been added yet |
| A Qaida lesson step with no recording | *"No reference recording is available for this form yet."* |
| Anything at all | never a synthesised voice, in any language |

`shared/qaidaAudioManifest.ts` is the only playback authority. The client asks
it (`APPROVED_RECORDINGS` in `client/src/lib/letterAudioSources.ts`) and gets a
path or null; null is what produces the honest state. Recordings begin playing
as ledger entries reach `approved`, with no code change.

### The synthesised clips that are still here

`client/public/audio/letters` holds 112 machine-generated clips, made once by
`scripts/generate-letter-audio.mjs` with OpenAI's text-to-speech. **They are not
served to learners.** They are kept because development and some tests need a
file to exist, and they are written down in `PLACEHOLDER_LETTER_AUDIO` rather
than left implicit. A ledger entry pointing into that directory is a validation
error (`synthesised-path`), so they cannot become reference audio by accident.

This is the one remaining placeholder path, and it is a dead end by design.

## 3. What needs recording

182 unique targets, derived from the curriculum by `shared/qaidaAudioTargets.ts`
— never hand-listed, so a lesson added tomorrow appears in the list. Targets are
deduplicated by their exact Arabic: one recording of `بَ` serves every lesson
that shows it.

**162 are for a teacher to record.** In rough order of usefulness:

| What | How many | Notes |
|---|---|---|
| The 28 letters, alone | 28 | say the letter's **sound**, not its alphabet name |
| Each letter with fatha, kasra, damma | 84 | `بَ` = *ba*, `بِ` = *bi*, `بُ` = *bu* |
| Teaching syllables and combinations | ~50 | joined forms, tanween, madd, sukoon, shaddah, ال, hamzah seats, tajweed patterns, mushaf symbols |

Print the exact list, with the Arabic and the lessons that use each one:

```
npx tsx -e 'import {instructionalTargets} from "./shared/qaidaAudioTargets"; \
  for (const t of instructionalTargets()) console.log([t.id, t.arabic, t.category, t.gloss].join("\t"))'
```

**20 are Quranic words and are NOT to be recorded.** See §7.

## 4. Recording protocol

For a qualified teacher or Qari. Please read §5 as well — the review step is
part of the work.

**What to say**

- Read **only the exact target shown**. Nothing before it, nothing after it: no
  *bismillah* framing the clip, no "the letter baa is…", no English.
- One target per file.
- Say the **sound**, not the alphabet name, for the bare letters: `ba.mp3` is
  *b*, not the word *bāʾ*.
- Preserve the harakah exactly as written. `بِ` is *bi* and not *ba*.
- Do not add a sound the target does not have — no vowel tacked onto a sakin
  letter, no trailing breath shaped like a following letter.
- Repeat within one clip **only** where the curriculum asks for repetition. By
  default a target is said once.

**How to say it**

- A neutral teaching pace — as when introducing this to a beginner for the first
  time. Not a performance tempo, and not artificially slow.
- The same voice, the same microphone and the same distance across the whole
  set. A learner comparing two letters should be comparing the letters.

**The recording itself**

- Quiet room, no background music, no room echo you would notice.
- MP3, m4a, ogg or wav. Mono is fine. 128 kbps or better, 44.1 kHz.
- Trim the silence at both ends, leaving roughly 100 ms.
- Keep the level consistent so no letter is noticeably louder than the next.

**On pronunciation:** this document does not tell you how a letter should be
articulated. Makhraj and the rules of tajwid are yours; nothing in this
repository asserts them, and no automated check in it judges them.

## 5. Review and approval

A recording moves through four statuses, and a person moves it:

| Status | Means |
|---|---|
| `missing` | nobody has recorded it |
| `recorded` | a file was delivered and passes the mechanical checks |
| `reviewed` | a qualified teacher has listened and left a verdict |
| `approved` | that verdict was "this is correct" — **only these are played** |

`approved` requires, and is refused without:

- **provenance** — the speaker's name, their qualification, where the recording
  came from, and the date;
- **a review** — the reviewer's name, their qualification, the date, and their
  verdict in their own words.

The reviewer should not be the speaker. Nothing in the code enforces that; it is
a matter of how the work is organised.

## 6. Importing recordings

1. Put the files under `client/public/audio/qaida/…` — **not** in
   `/audio/letters`, which holds the synthesised clips.
2. Add an entry per file to `QAIDA_RECORDINGS` in
   `shared/qaidaAudioManifest.ts`:

```ts
{
  targetId: "letter:ba",
  audioPath: "/audio/qaida/letters/ba.mp3",
  status: "approved",
  provenance: { speaker: "…", qualification: "…", source: "…", recordedOn: "2026-03-01" },
  review: { reviewer: "…", qualification: "…", reviewedOn: "2026-03-04", verdict: "…" },
}
```

3. Run `npx tsx scripts/validate-qaida-audio.ts`.

The validator checks the file is there, is an audio format, is not empty; that
the `targetId` exists in the curriculum; that no two entries claim one file and
no file is unclaimed; and that anything `approved` names a speaker and a
reviewer. It reports every target still without an approved recording, by name.

**It does not judge whether the recitation is correct**, and must not be
extended to. That is the reviewer's work, and the reason the review fields
exist.

## 7. Quran words are not recorded here

20 of the targets are actual Quranic words the curriculum quotes — `قُلْ`,
`رَبِّ`, `أَحَدٌ` and so on. They are marked `kind: "quran"` and kept apart from
the instructional set:

- nobody records a replacement Quran recitation for this app;
- they are served, where they can be, by the app's own Quran audio — the
  word-by-word reference described in [quran-word-audio.md](./quran-word-audio.md);
- where no trustworthy recording exists, the target is simply unavailable.

A ledger entry claiming to supply one fails validation
(`quran-target-recorded-here`), even with complete paperwork, and
`buildQaidaAudioManifest` will not mark it playable.

## 8. Limitations

- **Nothing is recorded yet**, so the Qaida currently plays no reference audio
  at all. Before this change a learner heard the synthesised clips, described in
  the interface as synthesised. That is now silence with an explanation, which
  is the right trade for a Quran-reading course but is a real reduction in what
  the app does today. It is undone by recordings, not by code.
- **The teaching-target list is derived, and reflects the curriculum's current
  shape.** ~50 combination targets is what the lessons currently show; adding
  lessons adds targets.
- **No automated check validates pronunciation**, by design.
- **The 20 Quranic targets depend on the Quran word-audio path**, whose live
  behaviour is itself unverified — see that document's own limitations.
- **The interface strings are AI-drafted** (`translationStatus: "ai-drafted"`,
  `nativeReviewed: false`) in all five languages, like the rest of the packs.
