# Instruction languages

Each directory here is one self-contained language pack: the words a learner is
taught **in**. Adding a language is adding a directory and one registry row — no
component changes.

```
locales/
  types.ts          the pack shape
  index.ts          registry, loader, fallback
  en/index.ts       reference pack — every key is defined here
  ur/index.ts       scaffold — empty, falls back to English
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

1. Create `locales/<code>/index.ts`. Copy `locales/ur/index.ts` as the starting
   point — it is already an empty pack with the right shape.
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

4. Set `direction: "rtl"` if the language is written right to left. The provider
   applies it to `<html dir>`; Quranic Arabic sets its own direction regardless,
   so it is unaffected.

Translate as much or as little as you like — the app runs at every point in
between.

## A note on placeholder translations

The Urdu pack ships empty on purpose. Machine-translated filler is worse than
the English fallback: it looks finished, so nobody checks it, and a learner is
taught from text no speaker of the language has read. An untranslated key
falls back visibly; a wrong translation does not.

## Placeholders

Strings interpolate `{name}`:

```ts
"playback.place": "Ayah {number} of {total}",
t("playback.place", { number: 3, total: 7 })   // "Ayah 3 of 7"
```

A value that is not supplied is left visible as `{total}` rather than printed as
`undefined`, so the gap shows up in review instead of shipping.
