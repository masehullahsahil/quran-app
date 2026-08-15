const forgeUrl = process.env.BUILT_IN_FORGE_API_URL?.replace(/\/$/, "");
const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;
const audioUrl = "https://audio.qurancdn.com/Alafasy/mp3/001001.mp3";
const model = process.env.AUDIO_TEST_MODEL ?? "gemini-3-flash-preview";

if (!forgeUrl || !forgeKey) throw new Error("Built-in AI credentials are not available in this environment.");

const response = await fetch(`${forgeUrl}/v1/chat/completions`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${forgeKey}`,
  },
  body: JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content: "You transcribe Quran recitation. Return only Arabic words audibly recited. Do not translate, explain, or assess tajwid.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe this short Quran recitation in Arabic only." },
          { type: "file_url", file_url: { url: audioUrl, mime_type: "audio/mpeg" } },
        ],
      },
    ],
    max_tokens: 120,
  }),
});

const payload = await response.json();
if (!response.ok) throw new Error(`Audio-aware AI request failed: ${response.status} ${JSON.stringify(payload)}`);

const content = payload?.choices?.[0]?.message?.content;
if (typeof content !== "string" || !content.trim()) throw new Error(`No audio transcription returned: ${JSON.stringify(payload)}`);

console.log(JSON.stringify({ content }, null, 2));
