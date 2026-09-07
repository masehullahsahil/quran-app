# Real Recitation Validation

`pnpm validate:real-recitation` exercises the learner-facing Quran recitation path with real public recitation audio:

- correct ayah: Mishari Rashid al-Afasy, al-Fatiha 1:1
- skipped word: Quran.com word-by-word audio for al-Fatiha 1:2 with word 3 omitted before concatenation
- wrong recitation: al-Fatiha 1:1 audio evaluated against expected al-Fatiha 1:2

The harness follows the same product pipeline boundaries: audio bytes are loaded, encoded to base64, sent to the OpenAI transcription helper with `language: "ar"`, normalized, aligned with `assessRecitationTranscript`, passed through `followRecitation`, and reported as a learner correction decision. It prints the returned transcript, normalized transcript, matched words, omissions, review words, verse-following state, per-stage latency, and abstention reason.

The command never prints API keys or provider request headers. If `OPENAI_API_KEY` is missing, the expected result is a safe abstention with `SERVICE_ERROR: Voice transcription service authentication is missing`; that documents an external-provider configuration limitation, not a word-alignment failure.
