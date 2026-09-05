# Quran acoustic dataset staging area

This directory defines a future **private, consented, teacher-reviewed** dataset layout. The repository contains no recordings. Do not commit private, identifying, or copyrighted audio.

## Layout

- `manifest.json` — local manifest (keep private when its notes could identify someone).
- `audio/<speakerAnonymizedId>/...` — recordings, stored only with documented permission.
- `manifest.example.json` — non-audio schema example.

Each manifest record contains `speakerAnonymizedId`, `surah`, `ayah`, nullable one-based `wordIndex`, `recordingPath`, optional `mimeType`, `knownErrorLabel`, `teacherReviewedLabel`, `recordingQuality`, and `consentSourceNotes`. `fixtureId` connects an authorized recording to the deterministic benchmark. Labels use the vocabulary in `docs/quran-acoustic-teacher-labeling.md`.

To evaluate authorized local recordings without committing them:

```sh
QURAN_EVALUATOR_URL=https://your-service.example \
ACOUSTIC_BENCHMARK_MANIFEST=/private/path/manifest.json \
pnpm benchmark:acoustic
```

Without both settings (and matching fixture IDs), cases are explicitly reported as **not evaluated**.
