# Arabic letter recordings

Drop the reciter's `.mp3` files straight into this directory. Nothing else has
to change — the Learn · Starter controls build their paths from the filename
convention below, so a file appears in the app as soon as it is here.

Until a file exists the app says the recording is unavailable. It never
substitutes speech synthesis: several of these letters (ح ع ص ض ط ظ ق غ) have no
English phoneme, so a synthetic English voice does not approximate them, it says
a different sound.

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
