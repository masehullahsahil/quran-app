# Localization

The app is built to teach in five languages. This document is the contract for how that works: what a language pack may contain, what it may never contain, how a half-written pack behaves, and how to add a key or a language.

## Supported languages

| Code | Language | Direction | Status | Native review |
|---|---|---|---|---|
| `en` | English | LTR | reference — everything originates here | n/a |
| `ps` | پښتو (Pashto) | RTL | ai-drafted, complete | **pending** |
| `fa-AF` | دری (Dari) | RTL | ai-drafted, complete | **pending** |
| `ur` | اردو (Urdu) | RTL | ai-drafted, complete | **pending** |
| `ar` | العربية (Arabic) | RTL | ai-drafted, complete | **pending** |

### Coverage today

Measured by `shared/localizationCoverage.ts` and printed by the coverage tests:

| Language | Overall | Critical UI | Supporting UI | Lesson text | Exercise text | Articulation |
|---|---|---|---|---|---|---|
| English | 100% | 100% | 100% | 100% | 100% | 100% |
| Pashto | 100% | 100% | 100% | 100% | 100% | 100% |
| Dari | 100% | 100% | 100% | 100% | 100% | 100% |
| Urdu | 100% | 100% | 100% | 100% | 100% | 100% |
| Arabic | 100% | 100% | 100% | 100% | 100% | 100% |

**What is translated:** everything a learner reads. Every teacher instruction and control; the correction panel; the recorder's states; the reader, playback, memorise and side-panel chrome; the Study notes, memorization and review labels, and the verse-following explanations; all 28 letter articulation notes and their practice cues; the coaching plans; and the whole Qaida course — all 12 levels, every lesson's title, objective, teaching text and boundary note, and every exercise prompt and note.

**What is deliberately not translated:** the Arabic of the Quran and the curriculum's Arabic examples (content, never pack text); the unit symbol `MB`; and the established Arabic terminology a qaida teaches — *sukoon*, *shaddah*, *tanween*, *qalqalah*, *ghunnah*, *tajwid*, *makhraj* — which each pack keeps in Arabic script and explains in its own words where the lesson introduces it. A test enumerates every Latin-script term left in each pack and fails on anything outside that list, so retained terms are reported rather than counted as coverage.

**What is still English outside the packs:** `ErrorBoundary` (renders above the provider), the template screens that are not part of the learner's app, and the review response's `note` / `nextStep` sentences composed in `server/routers.ts`. See Known gaps.

The floor under every surface is now 100%: a key added to the reference pack without a translation in all four packs fails the coverage test, which also prints the breakdown, what remains, and the retained-term list on every run.

`shared/languages.ts` is the single source of truth for this table. The registry, the picker, the document direction and the tests all read it from there, so they cannot disagree about what exists.

> The four non-English packs were **drafted by a language model and read by the team**. They have **not been read by a speaker of any of these languages**. Two fields record this and neither may be changed without an actual review: `nativeReviewed: false`, and `translationStatus: "ai-drafted"`. The picker labels each of these packs as an AI draft that no speaker of the language has read — `languageNoteKey` in `shared/languages.ts` chooses that note, so a pack that is complete but unreviewed cannot present itself as finished. Treat these as drafts, in the same way the Qaida curriculum is pending a qualified teacher — and note that nothing translated here is a religious ruling.

### Translation-status policy

`TranslationStatus` in `shared/languages.ts` records provenance, not quality:

| Status | Meaning |
|---|---|
| `reference` | The language everything is written in first. |
| `ai-drafted` | Drafted by a language model, read by the team. **Where every non-English pack is today.** |
| `internally-checked` | Reviewed against the glossary by someone who works on the app. |
| `native-reviewed` | Read and corrected by a speaker of the language. Only this permits `nativeReviewed: true`. |

A test asserts every non-English pack is `ai-drafted` with `nativeReviewed: false`, so the claim cannot drift ahead of the work.

### Glossary

Recurring learning terms are fixed once in [docs/localization-glossary.md](./localization-glossary.md), across all five languages. The policy is to keep the Arabic term where learners already use it — *madd*, *sukoon*, *shaddah*, *tajweed*, *makhraj* — explain it in the learner's own words on first use, and never transliterate into Latin script inside a non-Latin pack. Ordinary interface words (Listen, Repeat, Review) are translated, not borrowed. A term used in a pack but missing from that table is how five files start disagreeing.

### Why `fa-AF` for Dari

Dari is the Afghan variety of Persian. BCP 47 has no primary subtag that browsers and `Intl` actually accept for it — `prs` exists in some registries but is not interoperable — so the region-tagged Persian code is the one that works: `Intl.NumberFormat("fa-AF")` resolves, `navigator.language` produces it, and it degrades to Persian rather than to nothing. Plain `fa` would claim Iranian Persian, a different register. `matchSupportedLanguage` maps `fa` and `fa-IR` to `fa-AF` so a Persian-speaking browser lands on the closest pack the app carries.

**Do not change this code without migrating stored learner preferences**, which are keyed by it in `localStorage`.

## Six kinds of language, kept apart

| Layer | What decides it | Changed by the picker? |
|---|---|---|
| Interface / navigation | The locale pack | Yes |
| Teacher instructions | The locale pack (`now.*`, `correction.*`) | Yes |
| Qaida explanations | The locale pack's `qaida` map, over the English curriculum | Yes, where translated |
| Quran translation of meaning | The reader's translation picker, seeded by `preferredTranslationLanguage` | Only the *suggestion* |
| **Quran Arabic text** | The Quran data layer (Quran.com) | **Never** |
| Recitation audio | The reciter picker | Never |

The last two are the point of the separation. A pack holds no Quranic content at all — the Arabic text, the ayah recitations and the Arabic letter recordings are shared by every language, and a test asserts no pack shape carries a Quran field. Choosing Urdu changes the buttons and may suggest an Urdu translation of meaning; it does not alter one letter of the ayah on screen.

## Fallback policy

Fallback is **per key, not per pack**. A pack that has translated forty strings shows those forty in its own language and English everywhere else. There is no "incomplete pack" state that withholds a language.

- A missing or empty string falls back to the English value.
- A key that exists in no pack renders as the key name — deliberately visible rather than blank, so the gap is obvious in development. A test asserts this cannot happen for any critical key.
- An unknown locale code, or a pack that fails to load, resolves to English with a console warning.
- `resolvePack` reports `coverage.strings` (0–1), `coverage.criticalComplete` and `coverage.missingCritical`, so coverage is measurable rather than guessed.

### Critical keys

`locales/critical.ts` lists the strings a learner meets constantly: every teacher instruction, the correction panel, the teaching steps, the study controls, the recorder states, mode navigation and the mastery words. **Every pack must translate all of them**, and a parity test fails the build if one regresses to English. Long-form teaching text is explicitly allowed to fall back.

A second test checks that the critical strings are actually written in the pack's own script — a pack cannot pass parity by copying the English through.

## Right-to-left

Four of the five languages are RTL. `LocaleProvider` sets `document.documentElement.lang` and `dir` from the resolved pack, so layout, alignment and logical flow follow the interface language.

What is mirrored: directional chrome only — the arrows on Previous/Next, the teacher's contextual action, course navigation — plus numbered strips and progress fills, which start from the reading edge.

What is **not** mirrored: Quranic Arabic, which carries its own `dir="rtl"` at the element level and reads identically in every interface language; the Latin brand marks; and transport controls, whose arrows mean *play*, not *forward*. A test asserts no direction rule ever applies a transform to `.quran-flow`, `.study-arabic`, `.memory-verse`, `.now-word` or `.correction-target`.

### Mixed-direction text

Arabic embedded in an LTR interface is handled by `[lang="ar"] { direction: rtl }` plus the explicit `dir="rtl"` already on every Quranic element. Beyond that:

- Arabic quoted inside a sentence — the focus word, a correction target, a lesson example — carries `unicode-bidi: isolate`, which scopes the bidi algorithm to that element so the punctuation around it stays where the sentence put it.
- Glosses and place lines that mix scripts use `unicode-bidi: plaintext`, so each takes direction from its own first strong character rather than from the surrounding interface.
- **Latin digits are never forced.** Ayah and word numbers inside RTL sentences are positioned by the bidi algorithm; setting a direction on them is what produces reversed numbers.
- An English fallback fragment inside an RTL pack is a left-to-right run inside a right-to-left sentence, which the algorithm handles — the fragment reads correctly, and the sentence's punctuation stays at its own end.

## Interpolation and counts

Values are substituted into **whole localized templates**, never assembled from English fragments:

```
"now.place": "Ayah {ayah} of {total}"      →  الآية 2 من 7
"now.repeatWord": "Repeat word {number}"   →  لفظ 4 دہرائیں
```

Each language places the number where its own grammar needs it, because it owns the whole sentence. An unsupplied placeholder is left visible rather than printed as `undefined`. A test asserts every count-bearing key carries a placeholder rather than being concatenated.

For genuine plural forms (`1 review` / `2 reviews`), add one key per form and select in the caller — the loader does not implement CLDR plural categories, and pretending otherwise would break the languages that need more than two forms.

## The Qaida course

The curriculum is **not** duplicated per language. `shared/qaidaCurriculum.ts` holds one structure: lesson order, prerequisites, exercise logic, answer correctness, and every piece of Arabic. A pack may add a `qaida` map keyed by the curriculum's own stable ids:

```ts
qaida: {
  lessons: { "letters-alif-ba-ta-tha": { title: "…", objective: "…", teaching: "…" } },
  exercises: { "identify-alif": { prompt: "…" } },
}
```

`localizedLesson` and `localizedExercise` in `shared/qaidaText.ts` fall back field by field. A lesson added to the curriculum appears in every language immediately, in English until someone translates its four strings, and no translation can change what a lesson teaches, which answer is correct, or which Arabic is shown. The Arabic examples and their glosses are deliberately not translatable: the Arabic is content, and a drifting gloss would be a second source of truth.

All four non-English packs carry a `qaida` map covering all 12 levels — every lesson field and every exercise prompt and note. The per-field fallback stays in place for a lesson added later: it appears in English until its strings are written, and never as a blank.

Repeated prompts are handled by `promptsFromPhrasebook`: Level 1 generates fifty exercises from three prompts, so a pack translates each distinct English prompt once and the helper expands it across the ids the curriculum actually has. A lesson added later that reuses a known prompt is translated the moment it appears.

## Adding a key

1. Add it to `locales/en/index.ts`. The type of `StringKey` derives from that object, so every other pack is now type-checked against it.
2. Use it via `t("your.key", { count: 3 })`. Never concatenate.
3. If a learner meets it constantly, add it to `locales/critical.ts` — and translate it in all four packs, or the parity test will fail.

## Adding a language

1. Add the entry to `SUPPORTED_LANGUAGES` in `shared/languages.ts` — code, names, direction, coverage, translation preference, audio directory, `nativeReviewed: false`.
2. Create `locales/<code>/index.ts` exporting `manifest`, `strings`, `lessons`, and optionally `qaida`. Spread the manifest from `SUPPORTED_LANGUAGES` so it cannot drift.
3. Register it in `LOCALES` in `locales/index.ts` with a dynamic import, so it is only fetched when chosen.
4. Translate at least every key in `locales/critical.ts`.
5. Run the tests: the registry, direction, parity, script and interpolation checks all run per language automatically.

## Language selection and persistence

The picker sits in the reader's header toolbar beside the reciter and translation pickers — the place where the other "how do I want this presented" choices already live, and deliberately not in the Study instruction block.

The choice persists in `localStorage` under `miqra-locale`. For a signed-in learner it is not yet synced to the account: `LocaleProvider` reads and writes through one pair of functions, so an account-backed store can replace them without touching any component. No schema change was made for this.

## Known gaps

- **`ErrorBoundary` is English-only.** It renders above `LocaleProvider`, so it has no pack to read; localizing it would mean a second, provider-free translation path for one crash screen.
- **`DashboardLayout` and `ComponentShowcase`** carry untranslated template strings. They are scaffolding from the project template and are not part of the learner's app.
- **The coach model replies in the interface language.** `recitation.evaluate` takes a `uiLanguage` and the coach prompt asks for that language. This is wording only: the teaching action, the word to return to, and whether the learner may advance are all decided deterministically before the model is called, and its text appears in Teacher notes, never as the instruction. An unknown code falls back to English.
- **The review response's composed sentences are English.** `server/routers.ts` builds the `note` and `nextStep` text of a review from the plan's English strings. The instruction a learner acts on, the coaching panel and every label around it are translated; this one secondary line is not, and localizing it means moving the composition into the client where the pack lives.
- **No pack has been read by a speaker of its language.** This is the single most important gap, and no amount of coverage percentage substitutes for it.
