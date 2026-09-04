# Live recitation sessions

Study mode sends a sequence of short transcript chunks to
`recitation.ingestChunk`. The endpoint is stateless: every response contains the
small, typed session object that the browser supplies with the next request.
The existing DP transcript aligner provides word evidence and the existing
verse-following tracker makes every position decision. This layer does not
provide another aligner or tracker.

## Overlap and duplicate handling

Stable words for the current ayah are retained in `currentAyahTranscript`.
Before a chunk is appended, the orchestrator compares normalized Arabic words
and removes the **longest suffix of accepted text equal to a prefix of the new
chunk**. Thus `الحمد لله` followed by `الحمد لله رب` contributes only `رب`.
An exact repeat contributes nothing. A repeated boundary word or phrase is also
treated conservatively as recognition overlap rather than new progress.

Final requests can additionally carry a `chunkId`. The bounded
`processedChunkIds` list makes transport retries and late repeated requests
idempotent. Clients should serialize requests; Study mode does so to prevent an
older response replacing a newer position. A chunk can complete at most the
currently expected ayah because progression remains wholly controlled by
`followRecitation()`.

## Interim and final recognition

Browser speech recognition labels each result as interim or final. Study mode
shows both immediately. It sends interim text for preview assessment and prompt
correction highlighting, but the server returns the original session unchanged.
Only non-empty, novel, finalized text increments the chunk count, changes the
expected word, or completes an ayah.

The final whole-recording review remains available and independent. Quran-aware
acoustic observations also remain separate and confidence-gated; textual chunks
are only a word-recall and place-keeping aid and make no tajweed, makhraj,
pronunciation, madd, ghunnah, pitch, or rhythm claims.
