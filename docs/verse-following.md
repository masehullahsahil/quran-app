# Verse-Following (Memorisation Position Tracking)

While a learner recites an ayah from memory, the app keeps a Quran position: which surah, which ayah, and which word is expected next. The rules live in `shared/verseFollowing.ts`, the server applies them in `recitation.evaluate`, and the Study view renders the answer.

> **Instructional boundary.** This is transcript-based word recall only. The position is derived from which expected words the transcript accounted for. It says nothing about tajwid, makhraj, pronunciation, madd, ghunnah, pitch, or rhythm. Those remain the concern of a qualified teacher and of the separate, confidence-gated [Quran-aware acoustic evaluator](./quran-aware-evaluator.md).

## One aligner, reused

The tracker does **not** align words. It consumes the result of the existing dynamic-programming aligner in `server/recitation.ts` — matched, review, missing and extra words, their 1-based Quran `wordIndex`, and the matched count — as its only evidence. The server aligns the same transcript against the previous and next ayah too, when the client supplies them, so the tracker can tell a repeated previous ayah or an early next ayah apart from a real attempt at the expected one.

## State model

`VerseFollowingPosition` carries between attempts:

| Field | Meaning |
|---|---|
| `currentSurah`, `currentAyah` | The ayah the learner is expected to recite. |
| `expectedWordIndex` | 1-based index of the word they should continue from. |
| `lastCompletedAyah` | Highest ayah confidently completed in this surah, or `null`. |
| `state` | `following`, `correcting`, `uncertain`, or `completed`. |
| `attemptsOnCurrentAyah` | Attempts spent here without advancing. |

`followRecitation()` returns that position updated, plus the decision that produced it: `evidence` (`none` / `weak` / `partial` / `strong`), `shouldAdvance`, `nextAyah`, `correctionFocus`, and a `reason` enum.

`evidence` is a bounded enum on purpose. The aligner reports word matches; turning them into a probability would be fake precision.

## Advancement and retry rules

Applied in order, with the first that matches winning:

1. **No usable transcript** (transcription failed, or nothing was heard) → hold everything, `uncertain` / `none`.
2. **Too few heard words** to act on → hold, `uncertain`.
3. **A neighbouring ayah explains the audio better** — the previous ayah was repeated, or the next one was started early → hold on the expected ayah, `correcting`. Checked before the "nothing matched" case, because a learner reciting the wrong ayah matches nothing of the expected one.
4. **Nothing of the expected ayah matched** and no neighbour explains it → hold, `uncertain`.
5. **More unexpected words than the ayah has** → treat as noise, hold, `uncertain`.
6. **Sufficient evidence** → advance exactly one ayah (or report `completed` on the last ayah of the surah). Sufficient means *all* of: at least 75% of the evaluated window matched, no run of more than one unaccounted-for word, the last or second-to-last word of the ayah matched, and at least two matched words (one for a single-word ayah).
7. **Otherwise** → stay on the ayah, move `expectedWordIndex` to the first word not yet accounted for. A gap the learner recited *past* is `correcting` with a `correctionFocus`; a gap at the point they stopped is `following`.

Advancement is always by one ayah, never more, whatever the transcript contains beyond the current ayah.

### Resuming mid-ayah

When every match sits at or after `expectedWordIndex`, the attempt is read as a continuation and only that part of the ayah is judged. That keeps a learner who stops halfway and then recites the rest from being scored against words they already completed.

## Wire-up

`recitation.evaluate` accepts four optional inputs — `totalAyahs`, `previousAyahArabic`, `nextAyahArabic`, and `position` — and returns `verseFollowing` on every response, including the unavailable-review path, where it reports `no_transcript` and holds the position. A client that sends none of them still gets a word review and a tracker result for that ayah alone.

The Study view stores the returned position, shows the current ayah, the word to continue from, the word to return to, and a single action: continue with the next ayah, or recite this one again. Choosing any ayah restarts it from its first word.

## Known limitations

- **Restarts can read as substitutions.** The aligner minimises edits, so "word1 word2 word1 word2 word3…" is sometimes cheaper to align as substitutions on later words than as extra words. The tracker then reports less progress than the learner made. That is the safe direction — it asks for a word again rather than skipping ahead — and it is not a defect in the aligner, which is behaving optimally for its cost model.
- **Repeated words inside an ayah** (`عليهم` twice in al-Fatiha 7) are matched at the earliest position that ties on cost, so a learner who resumes at the *second* occurrence may be credited at the first.
- **No cumulative coverage.** Evidence is per attempt. Words completed in an earlier attempt count only through `expectedWordIndex`, not as a stored per-word map.
- **Surah bounds come from the client.** Without `totalAyahs` the server assumes one further ayah exists rather than declaring a surah complete from a guess.
- **Ayah numbering only.** The tracker follows a surah's ayahs in order; it does not model page, juz, or cross-surah sequences.
