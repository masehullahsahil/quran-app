# Arabic letter recordings

Drop the reciter's `.mp3` files straight into this directory, over the generated
clips of the same name. The Learn · Starter controls build their paths from the
filename convention below, so a file is picked up by its name alone — with one
switch to flip, see the next section.

Arabic is never read by an English voice here. Several of these letters
(ح ع ص ض ط ظ ق غ) have no English phoneme, so an English voice does not
approximate them, it says a different sound. When a file is missing the app says
so and plays nothing.

## The clips here are synthesised for now

Until a hafiz records the set, these files are generated once by an Arabic
text-to-speech voice:

```bash
OPENAI_API_KEY=sk-... node scripts/generate-letter-audio.mjs
```

`generated.json` in this directory records the model, the voice and the exact
Arabic text behind each clip — that is how you tell a synthesised clip from a
recorded one after both have lived here. The app discloses the synthesised voice
to the learner and does not credit a reciter for it.

Replacing them is a copy plus one line. The active source is chosen in
`client/src/lib/letterAudioSources.ts`:

```ts
export const ACTIVE_LETTER_AUDIO_SOURCE: LetterAudioSource = OPENAI_TTS;
//                                                           ^ HAFIZ_RECORDINGS
```

Both sources read this directory under the same filenames, so the recordings
replace the generated clips by sitting on top of them. Changing that line only
changes how the audio is described. Remove each replaced entry from
`generated.json` — or delete the file once every clip is a recording.

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
