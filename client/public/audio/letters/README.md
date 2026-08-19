# Arabic letter recordings

Drop the reciter's `.mp3` files straight into this directory. The Learn · Starter
controls build their paths from the filename convention below, so a file is
picked up by its name alone — with one switch to flip first, see the next
section.

Until a file exists the app says the recording is unavailable. It never
substitutes speech synthesis: several of these letters (ح ع ص ض ط ظ ق غ) have no
English phoneme, so a synthetic English voice does not approximate them, it says
a different sound.

## Placeholder audio is currently switched on

This directory is empty, and while it is, the app is serving **temporary
stand-in recordings from islamcan.com** for the bare letters. They are borrowed
audio, not ours, and they are marked as temporary everywhere the learner sees
them. The harakat controls stay disabled — the placeholder set has no vowelled
forms, and playing the bare letter for them would teach the wrong sound.

Dropping the reciter's files in here is not enough on its own; the active source
is chosen in `client/src/lib/letterAudioSources.ts`, one line:

```ts
export const ACTIVE_LETTER_AUDIO_SOURCE: LetterAudioSource = ISLAMCAN_PLACEHOLDER;
//                                                           ^ HAFIZ_RECORDINGS
```

Change that to `HAFIZ_RECORDINGS` and the app reads this directory again, all
112 files, harakat controls included. Nothing else moves.

## Naming

```
{slug}.mp3            the letter on its own      alif.mp3
{slug}-fatha.mp3      the letter with fatha  َ    alif-fatha.mp3
{slug}-kasra.mp3      the letter with kasra  ِ    alif-kasra.mp3
{slug}-damma.mp3      the letter with damma  ُ    alif-damma.mp3
```

All lowercase, no spaces. 28 letters × 4 = **112 files**.

## Slugs

The slug is not derived from the display name, because the display names
collide — ت and ط are both written "Taa", ح and ه are both written "Haa".
Each letter has an explicit slug instead:

| ا alif | ب ba | ت ta | ث tha | ج jeem | ح hha | خ kha |
| د dal | ذ dhal | ر ra | ز zay | س seen | ش sheen | ص sad |
| ض dad | ط tta | ظ zza | ع ayn | غ ghayn | ف fa | ق qaf |
| ك kaf | ل lam | م meem | ن noon | ه ha | و waw | ي ya |

**Watch the confusable pairs.** Getting one of these wrong means a learner hears
the wrong letter, which is worse than hearing nothing:

| Plain | Emphatic / other |
| ----- | ---------------- |
| ت `ta` | ط `tta` |
| س `seen` | ص `sad` |
| د `dal` | ض `dad` |
| ز `zay` | ظ `zza`, ذ `dhal` |
| ه `ha` (soft) | ح `hha` (deep) |

The authoritative list lives in `client/src/lib/arabicLetters.ts`; the full
per-file recording checklist for the reciter is in
`docs/letter-recordings.md`.
