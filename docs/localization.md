# Localization

The app is built to teach in five languages. This document is the contract for how that works: what a language pack may contain, what it may never contain, how a half-written pack behaves, and how to add a key or a language.

## Supported languages

| Code | Language | Direction | Coverage | Native review |
|---|---|---|---|---|
| `en` | English | LTR | reference — everything originates here | n/a |
| `ps` | پښتو (Pashto) | RTL | interface + teacher instructions | **not yet reviewed** |
| `fa-AF` | دری (Dari) | RTL | interface + teacher instructions | **not yet reviewed** |
| `ur` | اردو (Urdu) | RTL | interface + teacher instructions | **not yet reviewed** |
| `ar` | العربية (Arabic) | RTL | interface + teacher instructions | **not yet reviewed** |

`shared/languages.ts` is the single source of truth for this table. The registry, the picker, the document direction and the tests all read it from there, so they cannot disagree about what exists.

> The four non-English packs were written with care but have **not been read by a native speaker**. `nativeReviewed: false` records that per language, and the picker labels an interface-only pack as such. Treat these as drafts pending review, in the same way the Qaida curriculum is pending a qualified teacher.

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

Arabic embedded in an LTR interface is handled by `[lang="ar"] { direction: rtl }` plus the explicit `dir="rtl"` already on every Quranic element.

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

No pack carries a `qaida` map yet — the course is English in every language today.

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
- **The coach model replies in English.** `createCoachSummary` prompts for English text, shown in Teacher notes. The primary instruction is always a locale key, so the teaching itself is translated even when the note beside it is not.
- **Long-form teaching text is English in every non-English pack**: the Qaida lessons, the letter articulation notes, the coaching plans and the boundary notes.
