# Real Recitation Validation

`pnpm validate:real-recitation` exercises the learner-facing Quran recitation path with real public recitation audio:

- correct ayah: Mishari Rashid al-Afasy, al-Fatiha 1:1
- skipped word: Quran.com word-by-word audio for al-Fatiha 1:2 with word 3 omitted before concatenation
- corrected after skip: the same Quran.com word-by-word audio for al-Fatiha 1:2 with all words present
- wrong recitation: al-Fatiha 1:1 audio evaluated against expected al-Fatiha 1:2

The harness follows the same product pipeline boundaries: audio bytes are loaded, encoded to base64, sent to the OpenAI transcription helper with `language: "ar"`, optionally sent to the Quran-aware acoustic evaluator, normalized, aligned with `assessRecitationTranscript`, passed through `followRecitation`, and reported through the same teacher decision function used by Study mode.

For each controlled public sample it prints:

- expected ayah and normalized expected text
- transcript returned by the transcription provider and normalized transcript
- transcription success
- matched words, omissions, review/substitution words, and extras
- verse-following state, reason, current expected word, and advancement
- teacher action, reason code, evidence level, focus word index, and focus Arabic
- acoustic status, confidence, whether acoustic primary correction is enabled, and bounded findings
- audio load, base64 encode, transcription, acoustic, alignment, decision, and total correction latency
- whether evaluation abstained and why

The command does not print API keys, provider request headers, or production learner transcripts. The transcript is printed only for these known public validation samples. If `OPENAI_API_KEY` is missing, the expected result is a safe abstention with `SERVICE_ERROR: Voice transcription service authentication is missing`; that documents an external-provider configuration limitation, not a word-alignment failure.

With fewer than 20 real samples the harness reports per-sample timing only and explicitly skips p50/p95 latency, because the sample size is too small for a meaningful distribution.
