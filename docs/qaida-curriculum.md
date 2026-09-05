# The Qaida Curriculum

Learn mode runs a twelve-level Qaida course that takes a beginner from recognising an isolated Arabic letter to reading short ayat and carrying them into recorded practice in Study mode. Twelve levels, 42 lessons, 116 practice items.

The curriculum is **data**. Levels, lessons, prerequisites and practice items are declared in `shared/qaidaCurriculum.ts`; exercise shapes and the small builders live in `shared/qaidaExercises.ts`; `client/src/components/QaidaCourse.tsx` renders whatever those say. Adding or reordering a lesson is a data change, not a UI change.

> **This is not a religious authority.** The lessons here were written by a software team, not by a qualified Qaida teacher. They are a reading aid. Before this is put in front of learners as finished teaching material, the content marked below needs review by a qualified Qari or Qaida teacher — see [Teacher review checklist](#teacher-review-checklist).

> **Instructional boundary.** Every exercise is a *reading* exercise: recognising a letter, a vowel mark, a joined form or a mushaf symbol on the page, or reading it aloud for your own ear. None of them judges makhraj, tajwid accuracy, pronunciation, madd duration or ghunnah duration. Lessons that name a rule of recitation carry a `boundary` note saying so, and a test enforces that. The app can only make an acoustic observation where the separate, confidence-gated [Quran-aware evaluator](./quran-aware-evaluator.md) returns one.

## Learning philosophy

1. **Reading the Quran, not learning Arabic.** No grammar, no vocabulary beyond the gloss needed to read a word. Every example either practises a shape or comes from the Quran.
2. **Nothing appears before it is taught.** A lesson may only show marks the course has already introduced. This is enforced by a test that scans every example, subject and answer option for tanween, madd, sukoon, shaddah, the definite article, hamzah seats and the small alif, and fails if one appears above its level.
3. **Recognition is a step, not the destination.** From the vowels onwards, every level asks the learner to read something aloud, not only to point at the right answer.
4. **The learner cannot pass by pattern-matching.** Lesson data is written answer-first because that reads well; `placeChoices` moves the answer to a position derived from the item id before it reaches the screen, so the correct option is spread across positions and "always tap the top one" fails.
5. **Say what the app can see.** The app reads text. Where a lesson names something only the ear can judge, it says who does judge it.

## Levels and why they are in this order

| # | Level | Lessons | Why here |
|---|---|---|---|
| 1 | Arabic letters | 12 | Shapes and names first, ending with two lessons on the letters beginners actually confuse |
| 2 | Letter forms and joining | 3 | A letter must be recognisable in a word before marks are added to it |
| 3 | Short vowels | 4 | The first sound the learner produces from the page |
| 4 | Tanween | 2 | The same three vowels doubled — a small step from level 3 |
| 5 | Long vowels | 2 | A held version of the vowel just learned, and present in nearly every Quranic word |
| 6 | Sukoon | 2 | The first genuinely new syllable shape: a letter with no vowel of its own |
| 7 | Shaddah | 2 | A shaddah is a sakin letter joined to a vowelled one, so it depends on sukoon |
| 8 | The definite article | 2 | ال is the most common thing on the page, and sun/moon behaviour is visible in the marks |
| 9 | Hamzah and written forms | 3 | Hamzat al-wasl is explained through ال, so the article comes first |
| 10 | Introductory tajweed patterns | 3 | Recognition only, once every mark can be read |
| 11 | Mushaf symbols | 2 | Stop marks and small signs, once the words around them can be read |
| 12 | Guided Quran reading | 5 | Word → phrase → one ayah → several ayat → a whole short surah, recorded |

Two orderings changed during the quality audit, both for pedagogical reasons and both asserted by tests:

- **Long vowels moved ahead of sukoon and shaddah** (was level 7, now level 5). This is the order a Qaida teaches: madd letters extend what the learner just did with harakat, while sukoon introduces a closed syllable and shaddah depends on sukoon. It also removed several places where a lesson quietly required a long vowel it had not taught.
- **The definite article moved ahead of hamzah** (was level 9, now level 8). Hamzat al-wasl is explained through ال; teaching the article first means that lesson can point at something familiar.

The separate "madd sign" lesson was **merged into Level 11**, where the other mushaf notation lives, rather than being taught twice.

## Lesson shape

Each lesson declares `id`, `level`, `title`, `objective`, `teaching`, `examples`, `stages`, `practice`, `prerequisites`, `mastery`, `next`, and optionally `boundary`. `stages` are drawn from `learn → listen → recognize → repeat → read → check → complete`; a lesson lists only the ones it uses. `next` is filled in from course order so it cannot drift.

## Progression and mastery

A lesson unlocks when all its prerequisites are complete. **A completed lesson never re-locks** — review is always available, and a wrong answer keeps the learner on the same item rather than resetting anything. Mastery is deterministic counting: `mastery.correctRequired` items answered correctly and `mastery.itemsRequired` attempted, both defaulting to the lesson's item count. No confidence score, no acoustic input. Progress lives under `miqra-qaida-progress`, parsed defensively.

## What is assessed, and what is not

**Assessed by the app, from text alone:**

- whether the learner picked the right letter, vowelled form, joined form or symbol;
- whether they worked through a lesson's practice items;
- in Study mode, which words of an ayah were recognised in the transcript, and where their place in the surah is.

**Not assessed by the app — anywhere, at any level:**

- makhraj (where in the mouth a letter is made) and articulation generally;
- whether a qalqalah, ghunnah, ikhfa, idgham or iqlab was performed;
- madd length in counts;
- pitch, pace, melody, or the beauty of a recitation;
- whether a stop was taken in a place that preserves the meaning.

These belong to a qualified teacher. Where a specialised acoustic service is configured, it may return a confidence-gated observation — that is the only path by which this app ever says anything about sound, and it abstains by default.

## Quran text

Two rules, both enforced by tests:

- Every piece of Arabic is marked `source: "teaching"` or `source: "quran"`. A teaching combination (بَتَ, نَمْ) is built to practise a shape and is labelled as such in the UI; it is never presented as Quran.
- Anything marked `quran` carries a `surah:ayah` reference and is at most two words. Whole ayat are never transcribed here: Level 12 uses reference-only items that open the ayah from the app's Quran data layer, where the text and the reciter's audio come from Quran.com.

Quoted words use a simplified vowelled spelling (الصِّرَاطَ) rather than the Uthmani spelling the mushaf and the app's reader use (ٱلصِّرَٰطَ), because a beginner meets that spelling in a Qaida. The one exception is the small alif in الرَّحْمَٰنِ, which is shown in mushaf form because the lesson is about that mark. **A qualified teacher should confirm which convention this course ought to use.**

`pnpm verify:qaida` checks every quoted word against the ayah it names, fetching the ayah through the app's own Quran client and comparing with the aligner's normalisation. It needs network access to Quran.com; the offline checks live in `shared/qaidaQuality.test.ts`.

## Teacher review checklist

Nothing in this list is verified by code. Each item needs a qualified Qari or Qaida teacher to sign off before this course is presented as finished teaching material.

| Area | What to check | Where |
|---|---|---|
| **Letter names** | The English names and transliterations used throughout — "Haa" for both ح and ه, "Taa" for both ت and ط, and the choice of Baa/Bā, Thaa/Thā | `client/src/lib/arabicLetters.ts`, Level 1 lessons |
| **Makhraj descriptions** | The `sound` hints and the articulation text shown in the letter reference; the curriculum deliberately makes no makhraj claims, so confirm nothing implies one | `client/src/lib/arabicLetters.ts`, `locales/en` letter lessons |
| **Letter grouping and order** | Whether the teaching order and the groups in Level 1 match the Qaida this app should follow (Noorani, Baghdadi, or another) | `LETTER_GROUPS` |
| **Similar-letter pairs** | Whether ه/ح and ك/ق are the right pairs to contrast, and whether any group is missing | `SIMILAR_DOTS`, `SIMILAR_SHAPES` |
| **Madd explanations** | The wording for long vowels, and the description of the wavy madd sign as "held longer than usual" without naming a count | Level 5, `symbols-madd-sign` |
| **Tajweed wording** | Every sentence in Levels 10–11: the qalqalah description, the four noon-sakinah cases, the ghunnah description, and the boundary notes | `tajweed-*` lessons |
| **Stop-symbol explanations** | The meaning given for م, لا, ج, قلى, صلى, and whether more marks should be taught | `symbols-stop-marks` |
| **Quran examples** | Every word marked `source: "quran"` — spelling, harakat, and that it belongs to the ayah named. Run `pnpm verify:qaida` first, then read them | grep `quranWord(` |
| **Teaching combinations** | That every teaching combination is a plausible Arabic syllable and could not be mistaken for a Quranic word | grep `teaching(` |
| **Orthography lesson** | The description of ى, ة and the small alif, and whether ta marbuta's stop/continue rule is stated correctly for a beginner | `hamzah-orthography` |
| **Hamzat al-wasl** | Whether the ٱ sign should be shown, and whether the explanation is right for the mushaf the app serves | `hamzah-wasl` |
| **Level 12 selection** | Whether al-Fatiha, al-Ikhlas and al-'Asr are the right first ayat, and whether the progression is paced correctly | `quran-*` lessons |
| **Boundary notes** | That every claim about what the app does and does not judge is accurate and sufficient | grep `boundary:` |

## Known limitations

- **Lesson text is English-only.** Titles, teaching text and prompts are inline English in the curriculum module, following `shared/learningPath.ts`; the chrome around them is localised. A non-English pack gets translated chrome and English lessons.
- **Recognition, not production.** A learner can pass every exercise by reading correctly on the page.
- **Audio coverage follows the active source.** With the placeholder recording set there are no vowelled-form recordings, so `match-audio` items past Level 1 show the unavailable note.
- **Mastery is per sitting.** Leaving a lesson part-way and returning restarts its practice; completed lessons are unaffected.
- **No mushaf-accurate Uthmani rendering** in curriculum examples — see the note above.
- **Ayah-count checks cover only the surahs quoted** (1, 103, 108, 112, 113, 114). Quoting another surah means adding it to that table.
