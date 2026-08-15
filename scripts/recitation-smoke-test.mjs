const applicationUrl = process.env.RECITATION_TEST_APP_URL;
const reciterAudioUrl = "https://audio.qurancdn.com/Alafasy/mp3/001001.mp3";
const expectedArabic = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";

if (!applicationUrl) {
  throw new Error("RECITATION_TEST_APP_URL must point to the running app, for example http://localhost:3000.");
}

const audioResponse = await fetch(reciterAudioUrl);
if (!audioResponse.ok) {
  throw new Error(`Could not download the reference reciter audio: ${audioResponse.status} ${audioResponse.statusText}`);
}

const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
if (!audioBuffer.length || audioBuffer.length > 16 * 1024 * 1024) {
  throw new Error("The reference reciter audio was empty or exceeded the supported size limit.");
}

const endpoint = new URL("/api/trpc/recitation.evaluate", applicationUrl).toString();
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    json: {
      expectedArabic,
      audioBase64: audioBuffer.toString("base64"),
      mimeType: "audio/mpeg",
      surah: 1,
      ayah: 1,
    },
  }),
});

const payload = await response.json();
if (!response.ok) {
  throw new Error(`Recitation endpoint returned ${response.status}: ${JSON.stringify(payload)}`);
}

const result = payload?.result?.data?.json ?? payload?.[0]?.result?.data?.json;
if (!result || typeof result.transcript !== "string" || typeof result.spokenGuidance !== "string") {
  throw new Error(`The endpoint did not return a complete recitation review: ${JSON.stringify(payload)}`);
}

console.log(JSON.stringify({
  score: result.score,
  matchedCount: result.matchedCount,
  totalWords: result.totalWords,
  wordReviewAvailable: result.wordReviewAvailable,
  transcript: result.transcript,
  spokenGuidance: result.spokenGuidance,
  note: result.note,
}, null, 2));
