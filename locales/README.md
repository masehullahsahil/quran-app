# Instruction languages

Each directory here is one self-contained language pack: the words a learner is
taught **in**. Adding a language is adding a directory and one registry row — no
component changes.

```
locales/
  types.ts          the pack shape
  index.ts          registry, loader, fallback
  en/index.ts       reference pack — every key is defined here
  ur/index.ts       one of four complete packs (ps, fa-AF, ur, ar)
```

## What is in a pack, and what is not

A pack carries the **instruction layer** only:

| In a pack | Shared across every pack |
| --------- | ------------------------ |
| UI labels and buttons | Arabic text of the Quran |
| Lesson explanation text (how a letter is articulated) | Ayah recitation audio |
| Spoken instruction audio in that language | Arabic letter recordings |

Quranic content is never translated into a pack. The Arabic comes from the
Quran.com API and the letter recordings from `client/public/audio/letters/` —
one set, used by every language. A test asserts that no pack string contains
Arabic script, so scripture cannot drift into the instruction layer.

The one audio path a pack *does* own is `manifest.instructionAudioDir` — spoken
explanations recorded in that language, e.g. `/audio/instruction/ur/`. That is a
different thing from the shared Arabic recordings and lives in its own tree.

## Fallback

Fallback is **per key**, not per pack. A pack with three strings translated
shows those three and English for everything else, so a language is usable from
its first translated line rather than being gated on completeness. Empty strings
count as missing, so a half-filled key never renders as a blank label.

The same applies to lesson text: one letter may be translated while the other 27
fall back.

English is bundled rather than loaded on demand, because it is the fallback and
has to be present before any other language can render. Every other pack is a
dynamic `import()`, so languages cost nothing until selected.

## Adding a language

1. Create `locales/<code>/index.ts`. Copy the shape of `locales/ur/index.ts` —
   manifest, `strings`, `lessons.letters`, `qaida` — and start from an empty
   object for each; a pack is usable from its first translated line.
2. Add a row to `LOCALES` in `locales/index.ts` with the manifest and a
   `load: () => import("./<code>")`.
3. Get the key list to work from:

   ```bash
   node scripts/scaffold-locale.mjs <code> --full   # every key
   node scripts/scaffold-locale.mjs <code>          # only what is still missing
   ```

   It prints commented TypeScript with each key and its English text alongside,
   ready to paste in. It reads the English pack, so it can never list a key the
   app does not use.

4. Optionally set `preferredTranslationLanguage` to the Quran.com language name
   (`"urdu"`, `"pashto"`, …). It sorts that language's translations to the top of
   the translation picker for readers on this pack. It is a preference only —
   every translation the API offers stays selectable, and a language the API
   does not carry simply falls back to English being listed first.
5. Set `direction: "rtl"` if the language is written right to left. The provider
   applies it to `<html dir>`; Quranic Arabic sets its own direction regardless,
   so it is unaffected.

Translate as much or as little as you like — the app runs at every point in
between.

## A note on machine-drafted translations

Machine-translated filler is worse than an English fallback when nobody checks
it: it looks finished, so it is never read, and a learner is taught from text no
speaker of the language has seen. Two things keep that from happening here. The
packs are marked `translationStatus: "ai-drafted"` and `nativeReviewed: false`
in `shared/languages.ts`, and the picker prints that beside the language's name,
so a learner is told what they are reading. And the fallback stays per key, so a
pack that loses a string shows English there rather than a blank — the coverage
test reports it the same day.

Those two fields may only change when a speaker of the language has actually
read the pack. A complete pack is not a reviewed one.

## Placeholders

Strings interpolate `{name}`:

```ts
"playback.place": "Ayah {number} of {total}",
t("playback.place", { number: 3, total: 7 })   // "Ayah 3 of 7"
```

A value that is not supplied is left visible as `{total}` rather than printed as
`undefined`, so the gap shows up in review instead of shipping.
