# Bake-off corpus

Drop real recitation recordings here to compare ASR candidates.

## How to add a recording

1. Copy the audio file into `audio/` (WAV or MP3 preferred; WebM/OGG also
   accepted — the Hugging Face path decodes via librosa, the production path
   sends the original container to the Whisper API).
2. Add one entry to `manifest.json` (see `manifest.example.json` for the full
   field documentation).
3. Run `pnpm benchmark:asr-bakeoff`.

## Manifest fields

- `id` — unique sample id, e.g. `fatiha-003-correct-take2`.
- `surah` / `ayah` — 1-based.
- `canonicalArabic` — the expected verse text, exactly as the app stores it
  (Uthmani spelling). The harness normalizes both sides with the production
  alignment normalization before comparing.
- `expectedResult` — what the learner did:
  - `correct` — full, correct recitation of the verse.
  - `omission` — skipped a word; set `intendedError` to the 1-based word index.
  - `substitution` — said a wrong word; set `intendedError`.
  - `repetition` — repeated a word/phrase; set `intendedError`.
  - `hesitation` — pauses / restarts without changing words.
  - `other` — anything else; describe in `notes`.
- `intendedError` — `{ "wordIndex": 2, "kind": "omitted" }`.
  Required for `omission` / `substitution` / `repetition`; forbidden on
  `correct`.
- `speaker` / `device` / `notes` — free text provenance (no PII beyond what
  the operator chooses to record).
- `audio` — bare filename inside `audio/`. Path traversal is rejected.

## Privacy

`audio/` is git-ignored. Private recordings are never committed. Only commit
audio that is intentionally public.

## What to record

The bake-off is most valuable on the app's real failure modes, not on clean
studio audio:

- correct recitations at slow, normal, and fast pace;
- correct recitations with pauses and restarts;
- deliberate single-word omissions (this is the tutor's core job);
- deliberate substitutions;
- deliberate repetitions of a word or phrase;
- verses with dagger alif / special orthography (e.g. 1:4 مَـٰلِكِ);
- repeated phrases across verses (the alignment's hard case).

Do NOT fabricate "real audio" fixtures (e.g. synthesized recitations passed
off as learner recordings). An empty corpus is better than a fake one — the
harness reports "no samples" honestly.
