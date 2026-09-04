# The Qaida Curriculum

Learn mode runs a twelve-level Qaida course that takes a beginner from recognising an isolated Arabic letter to reading short ayat and carrying them into recorded practice in Study mode.

The curriculum is **data**. Levels, lessons, prerequisites and practice items are declared in `shared/qaidaCurriculum.ts`; exercise shapes and the small builders live in `shared/qaidaExercises.ts`; `client/src/components/QaidaCourse.tsx` renders whatever those say. Adding or reordering a lesson is a data change, not a UI change.

> **Instructional boundary.** Every exercise here is a *reading* exercise: recognising a letter, a vowel mark, a joined form or a mushaf symbol on the page, or reading it aloud for your own ear. None of them judges makhraj, tajwid accuracy, pronunciation, madd duration or ghunnah duration. Lessons that name a tajwid rule carry a `boundary` note saying so. The app can only make an acoustic observation where the separate, confidence-gated [Quran-aware evaluator](./quran-aware-evaluator.md) returns one.

## Levels

| # | Level | What the learner can read afterwards |
|---|---|---|
| 1 | Arabic letters | All 28 letters by shape and name, including the look-alike pairs |
| 2 | Letter forms and joining | A letter in all four positions; the six letters that never join forward |
| 3 | Short vowels | Fatha, kasra and damma, alone and across two-letter combinations |
| 4 | Tanween | Fathatayn, kasratayn, dammatayn |
| 5 | Sukoon | A vowelled letter joined into a sakin one |
| 6 | Shaddah | A doubled consonant, with each of the three vowels |
| 7 | Long vowels | Alif, waw and ya madd, told apart from their short partners |
| 8 | Hamzah and orthographic forms | Hamzah on its seats, hamzat al-wasl, alif maqsura, ta marbuta, the small alif |
| 9 | The definite article | ال before sun letters and moon letters |
| 10 | Introductory tajweed patterns | Qalqalah letters, noon and meem sakinah cases, ghunnah — on the page |
| 11 | Mushaf symbols | Stop marks and the small signs printed in the text |
| 12 | Guided Quran reading | Quranic words, then whole ayat, opened from the app's Quran data |

Level 1 keeps the existing Alif-Ba experience: the alphabet explorer with its reference recordings sits below the course panel and stays available at any point.

## Lesson shape

Each lesson declares `id`, `level`, `title`, `objective`, `teaching`, `examples`, `stages`, `practice`, `prerequisites`, `mastery`, `next`, and optionally `boundary`. `stages` are drawn from `learn → listen → recognize → repeat → read → check → complete`; a lesson lists only the ones it uses.

`next` is filled in from course order when the module is built, so a lesson always carries the one that follows and the two cannot drift apart.

## Progression

- Lessons have one stable order; a level's lessons are contiguous within it.
- A lesson unlocks when all its prerequisites are complete. **A completed lesson never re-locks** — review is always available, and a wrong answer never takes progress away.
- `nextIncompleteLesson()` names where to go next; `levelProgress()` and `curriculumProgressPercent()` report how far along the learner is.
- Progress is `{ completedLessons, currentLessonId }` in `localStorage` under `miqra-qaida-progress`, read defensively: unparseable values, and lesson ids the curriculum no longer defines, degrade to "not completed" instead of throwing on load.

## Mastery

Deterministic counting, nothing more. A lesson is complete when the learner has answered `mastery.correctRequired` practice items correctly and attempted `mastery.itemsRequired` of them — both default to the lesson's item count. `evaluateLessonAttempt()` returns what is still outstanding.

There is no confidence score and no acoustic input. When pronunciation evaluation arrives it can be added as a further requirement on `QaidaMastery`, and no lesson definition has to change.

## Exercise types

`identify-letter`, `choose-vowelled-form`, `match-audio`, `choose-connected-form`, `distinguish-similar`, `build-combination`, `identify-symbol` are answered by choosing an option; `read-word` and `read-quran` are completed by reading aloud and confirming. Audio comes from the app's existing letter recordings by slug — nothing is generated at runtime, and a form the active source has no file for simply has no play control.

## Quran text

Two rules, both enforced by tests:

- Every piece of Arabic is marked `source: "teaching"` or `source: "quran"`. A teaching combination (بَتَ, بت) is built to practise a shape and is never presented as Quran.
- Anything marked `quran` carries a `surah:ayah` reference, and is a short, well-known word or phrase.

Whole ayat are never copied into the curriculum. Level 12 practises them with `read-quran` items that carry only a reference; the Learn view opens that ayah in Study mode, where the text and the reciter's audio come from the app's Quran data layer.

## Known limitations

- **Instruction text is English-only.** Lesson titles, teaching text and exercise prompts are inline English in the curriculum module, following `shared/learningPath.ts`. Interface chrome around them is localised as usual, so a non-English pack currently gets translated chrome and English lessons.
- **Recognition, not production.** A learner can pass every exercise by reading correctly on the page. Whether the sound was produced correctly is outside what these exercises can see.
- **Audio coverage follows the active source.** While the placeholder recording set is active there are no vowelled-form recordings, so `match-audio` items in Levels 3+ show the unavailable note rather than a play control.
- **One session at a time.** Mastery is counted within a sitting; leaving a lesson part-way and coming back restarts its practice (completed lessons are unaffected).
- **The three retired checkboxes.** The previous free-form Qaida path (short vowels / joining / first ayah, stored under `miqra-reading-complete`) is superseded by the curriculum; that key is no longer read.
