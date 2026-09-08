# Word-level Quran reference audio

The focused correction lesson can put an exact word in front of a learner —
`رَبِّ`, word 3 of Al-Fatiha 1:2. Until now the only thing it could offer them to
listen to was the whole ayah, slowly. This document records what was
investigated, what was implemented, and what is still unverified.

## The source

**Quran.com API v4** (`api.quran.com/api/v4`), the same service the app already
uses for ayah text, translations, reciters and ayah recitations. No new provider
was introduced, and nothing was scraped.

### What was investigated

The app's existing integration (`server/quranApi.ts`) requests:

| Endpoint | For |
|---|---|
| `/chapters`, `/juzs`, `/resources/recitations`, `/resources/translations` | the index |
| `/verses/by_chapter/{surah}` with `fields=text_uthmani` and `translations=` | ayah text |
| `/quran/recitations/{id}?chapter_number={surah}` | one recording per ayah |

None of those asks for anything below the ayah, so the app had no word-level
data of any kind. Two documented v4 capabilities could supply it:

1. **Word objects.** `/verses/by_chapter/{surah}?words=true&word_fields=text_uthmani,audio_url`
   returns a `words` array on each verse. Each entry carries a `position`, a
   `char_type_name`, its text, and an `audio_url` — one small recording per word,
   relative to the same CDN the ayah recordings come from.
2. **Audio segments.** The recitation endpoints can return per-word timings
   against an ayah recording, which would let the app play a slice of the
   reciter's own file.

**Word objects were chosen.** A separate file per word is unambiguous: one URL,
one word, and the word's own text alongside it, so the client can *verify* the
recording it is about to play is the word it means to play. Segments would mean
trusting a tuple layout to decide where a word starts and ends, and getting that
wrong plays part of a neighbouring word — a worse failure than playing the ayah.
Segments remain a reasonable future option if the timings are verified first;
nothing here forecloses them.

### What is served, and by whom

Quran.com's word-by-word audio is **one recitation set**. The endpoint takes no
reciter parameter and the response names no reciter, so:

- it is generally **not** the reciter the learner selected for the ayah;
- the app does not claim it is. `WordAudioSource.matchesSelectedReciter` is
  `false` and `reciterName` is `null`, and the lesson shows *"A word-by-word
  reference recitation — a different reciter from the ayah above."* rather than
  inventing an attribution;
- **Reciter consistency is therefore not achieved** for the word audio, and the
  interface says so instead of pretending. The full-ayah control beside it plays
  the learner's selected reciter as it always did. If the source ever exposes
  per-reciter word audio, `matchesSelectedReciter` is the one field to flip and
  the note disappears on its own.

It is a recording of a reciter. **No Quranic Arabic is synthesised anywhere in
this app** — no OpenAI TTS, no browser speech synthesis, no generic Arabic TTS,
no generated or cloned voice. Where a word recording is missing, the learner is
told and offered the ayah; nothing is filled in.

## The shape

`shared/quran.ts`:

```ts
type WordAudio = { position: number; arabic: string; url: string };
type WordAudioSource = {
  provider: "quran.com";
  kind: "word-file";          // separate files, not timed segments
  reciterName: string | null;
  matchesSelectedReciter: boolean;
};
```

`Ayah.wordAudio` holds the recordings for that ayah; `SurahContent.wordAudioSource`
says what they are, or is null when none were served.

Two things the server does to the payload before it becomes that:

- **the verse-end marker is dropped.** Quran.com serves the ayah-number glyph as
  a word. Counting it would make every ayah one word longer than it is, and
  Study addresses words by position;
- **positions are canonical, and a missing recording never shifts them.** The
  count runs over every word of the ayah, recorded or not, so word 3 is the
  third word whether or not words 1 and 2 were recorded. Only the *recording* is
  omitted when a word has no `audio_url`. Compressing the numbering around a gap
  would make "hear word 3" play word 4, against a correction that named a
  canonical position — the app would say one word and speak another.

### Which host

`word.audio_url` is a relative asset — `wbw/001_001_001.mp3` — and it resolves
against **`https://audio.qurancdn.com/`**, not against the `verses.quran.com`
host the *ayah* recordings use. These are two asset stores, and reusing the ayah
base for word audio builds URLs that look right and 404. Word audio therefore
has its own resolver (`absoluteWordAudioUrl`); the ayah path is unchanged.
Absolute URLs pass through untouched on both.

### Which fields are requested

The request asks for `words=true` and `word_fields=text_uthmani` — the two
things this endpoint is documented to accept — and reads `audio_url` off the
word objects when they carry it.

`audio_url` is deliberately **not** requested as a `word_fields` string. The
current field reference does not list it among the ordinary text fields the way
it lists `text_uthmani`, and the newer SDK models it as word *audio* rather than
as another field; asking a legacy endpoint for it as one risks the whole request
being rejected, which would cost every word recording rather than one field. If
the word objects arrive without audio, `wordAudio` is empty, `wordAudioSource`
is null, and the lesson falls back to the ayah exactly as if the source served
nothing. Migrating to the newer authenticated Quran Foundation API is a separate
piece of work and is not attempted here.

The request is separate from the ayah-text request and cached separately, per
surah rather than per reciter. Word audio is an extra: a failure here logs a
warning and yields an empty map, and costs the reader nothing.

## What the client will play

`client/src/lib/wordAudio.ts` hands back a URL only when all of the following
hold. Any failure returns null and the lesson falls back to the reciter's ayah.

1. **The location matches.** Surah and ayah of the target equal those of the
   recordings. This is the same rule the correction lesson gained in #50: a
   recording of 1:2's third word played over 1:3 is a different word.
2. **The index exists** in the ayah's own words — outside positions are refused,
   never clamped.
3. **The word is the word.** The recording's own text, the canonical ayah word at
   that position, and the word the correction is about must all agree.

The comparison (`client/src/lib/quranWordMatch.ts`) folds harakat and the alif
variants, because the reviewer's `expectedArabic`, the ayah's `text_uthmani` and
the word payload legitimately differ that way. **It compares only** — every word
on screen is rendered exactly as the canonical ayah gives it, harakat intact, and
the `arabic` on the returned reference is the canonical text rather than the
source's copy of it.

## In the lesson

| State | What the learner gets |
|---|---|
| a recording exists | **Hear رَبِّ** as the prominent control, with **Hear the full ayah** beneath it |
| loading | the control reads "Loading the recording…" |
| playing | a `role="status"` line, "The reciter is playing this word" |
| it fails | "That word recording could not be played." and **Hear the full ayah instead** — no URL, no error code |
| no recording for this word | the previous **Listen to the ayah slowly**, and the note saying no separate word recording exists |

Only the current target is preloaded. A surah's worth of word recordings is
never fetched ahead — that would cost a learner on a metered connection far more
than it saves them.

Strings exist in all five interface languages. The packs remain
`translationStatus: "ai-drafted"` and `nativeReviewed: false`; nothing here is
native-reviewed.

## Limitations, and what is unverified

- **Live playback was not verified.** `api.quran.com` and `verses.quran.com` are
  both blocked by this environment's egress proxy (403 on CONNECT), as is the
  API documentation site. Every test uses deterministic fixtures. The field
  names (`words`, `word_fields`, `position`, `char_type_name`, `text_uthmani`,
  `audio_url`) and the CDN base are taken from the documented shape, and **have
  not been exercised against the live service.**
- **The legacy endpoint's word-audio behaviour is unverified.** Whether
  `api.quran.com/api/v4/verses/by_chapter/{surah}?words=true` returns `audio_url`
  on its word objects in production is the single thing to check first on the
  deployed app. If it does not, nothing breaks — the lesson falls back to the
  ayah — but the feature does nothing either.
- **The CDN host follows the documentation, not a live response.**
  `https://audio.qurancdn.com/` is what the Quran Foundation documentation
  resolves relative word assets against. It has not been fetched from here.
- **No per-reciter word audio**, as above.
- **No licensing terms were retrieved**, because the documentation site is also
  blocked. The API is public and needs no key, and the app already depends on it
  for text and recitations, so this adds no new provider relationship — but the
  terms should be read before this is relied on at scale.
- **Segments are not implemented.** If word-level playback proves valuable and
  reciter consistency matters more than the current honesty note, verifying the
  segment timings and playing a slice of the selected reciter's ayah is the next
  step.

If the word request returns nothing on the deployed app, the learner is exactly
where they were before this change: the ayah, slowly, honestly labelled.
