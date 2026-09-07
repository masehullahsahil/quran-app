import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { transcribeAudio, type TranscriptionResponse } from "../server/_core/voiceTranscription";
import {
  assessRecitationTranscript,
  hasArabicScript,
  normaliseArabicToken,
  tokenizeArabic,
} from "../server/recitation";
import { createVerseFollowingPosition, followRecitation } from "../shared/verseFollowing";

type RealRecitationSample = {
  id: string;
  kind: "correct_ayah" | "skipped_word" | "wrong_recitation";
  description: string;
  expectedSurah: number;
  expectedAyah: number;
  expectedArabic: string;
  totalAyahs: number;
  audio: AudioSource;
  omittedWordIndex?: number;
  omittedWord?: string;
};

type AudioSource =
  | { type: "url"; url: string; mimeType: string }
  | { type: "concat-url"; urls: string[]; mimeType: string };

type Timings = Record<string, number>;

type SampleReport = {
  id: string;
  kind: RealRecitationSample["kind"];
  description: string;
  expectedAyah: string;
  audio: {
    source: string;
    mimeType: string;
    bytes: number;
    base64Length: number;
  };
  transcriptReturned: string;
  transcriptLanguage: string | null;
  normalizedTranscript: string;
  matchedWords: number;
  totalExpectedWords: number;
  omissions: Array<{ wordIndex: number; expected: string }>;
  substitutionsOrReviews: Array<{ wordIndex: number; expected: string; heard: string | null }>;
  extraWords: string[];
  verseFollowingState: ReturnType<typeof followRecitation>;
  latenciesMs: Timings;
  evaluationAbstained: boolean;
  abstentionReason: string | null;
};

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.resolve(projectRoot, "tmp", "real-recitation-validation");

const fatiha = [
  "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
  "الرَّحْمَٰنِ الرَّحِيمِ",
  "مَالِكِ يَوْمِ الدِّينِ",
  "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
  "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ",
  "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ",
];

const samples: RealRecitationSample[] = [
  {
    id: "alafasy-001001-correct",
    kind: "correct_ayah",
    description: "Mishari Rashid al-Afasy, al-Fatiha 1:1 complete ayah from the same CDN family the app uses.",
    expectedSurah: 1,
    expectedAyah: 1,
    expectedArabic: fatiha[0],
    totalAyahs: fatiha.length,
    audio: { type: "url", url: "https://audio.qurancdn.com/Alafasy/mp3/001001.mp3", mimeType: "audio/mpeg" },
  },
  {
    id: "quran-wbw-001002-skip-rabb",
    kind: "skipped_word",
    description: "Real Quran.com word-by-word audio for al-Fatiha 1:2, concatenated with word 3 omitted.",
    expectedSurah: 1,
    expectedAyah: 2,
    expectedArabic: fatiha[1],
    totalAyahs: fatiha.length,
    omittedWordIndex: 3,
    omittedWord: "رَبِّ",
    audio: {
      type: "concat-url",
      mimeType: "audio/mpeg",
      urls: [
        "https://audio.qurancdn.com/wbw/001_002_001.mp3",
        "https://audio.qurancdn.com/wbw/001_002_002.mp3",
        "https://audio.qurancdn.com/wbw/001_002_004.mp3",
      ],
    },
  },
  {
    id: "alafasy-001001-expected-001002-wrong",
    kind: "wrong_recitation",
    description: "Mishari Rashid al-Afasy al-Fatiha 1:1 evaluated against expected al-Fatiha 1:2.",
    expectedSurah: 1,
    expectedAyah: 2,
    expectedArabic: fatiha[1],
    totalAyahs: fatiha.length,
    audio: { type: "url", url: "https://audio.qurancdn.com/Alafasy/mp3/001001.mp3", mimeType: "audio/mpeg" },
  },
];

function elapsedSince(start: number): number {
  return Math.round((performance.now() - start) * 10) / 10;
}

function normalizeTranscript(text: string): string {
  return tokenizeArabic(text).map(normaliseArabicToken).join(" ");
}

function describeAudioSource(source: AudioSource): string {
  return source.type === "url" ? source.url : `${source.urls.length} real word-audio files concatenated`;
}

async function fetchBytes(url: string): Promise<Buffer> {
  const filename = path.join(cacheDir, encodeURIComponent(url).replace(/%/g, "_"));
  try {
    return await readFile(filename);
  } catch {
    const response = await fetch(url, { headers: { accept: "audio/*" } });
    if (!response.ok) throw new Error(`Audio fetch failed for ${url}: ${response.status} ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.byteLength) throw new Error(`Audio fetch returned no bytes for ${url}`);
    await writeFile(filename, buffer);
    return buffer;
  }
}

async function loadAudio(source: AudioSource): Promise<Buffer> {
  await mkdir(cacheDir, { recursive: true });
  if (source.type === "url") return fetchBytes(source.url);

  const parts = await Promise.all(source.urls.map(fetchBytes));
  return Buffer.concat(parts);
}

async function runSample(sample: RealRecitationSample): Promise<SampleReport> {
  const latenciesMs: Timings = {};

  const audioStart = performance.now();
  const audio = await loadAudio(sample.audio);
  latenciesMs.audioLoad = elapsedSince(audioStart);

  const encodeStart = performance.now();
  const audioBase64 = audio.toString("base64");
  latenciesMs.base64Encode = elapsedSince(encodeStart);

  const transcriptionStart = performance.now();
  const transcription = await transcribeAudio({
    audio,
    mimeType: sample.audio.mimeType,
    language: "ar",
  });
  latenciesMs.transcription = elapsedSince(transcriptionStart);

  let transcript = "";
  let transcriptLanguage: string | null = null;
  let evaluationAbstained = false;
  let abstentionReason: string | null = null;

  if ("error" in transcription) {
    evaluationAbstained = true;
    abstentionReason = `${transcription.code}: ${transcription.error}`;
  } else {
    const response = transcription as TranscriptionResponse;
    transcript = response.text;
    transcriptLanguage = response.language;
    if (!hasArabicScript(transcript)) {
      evaluationAbstained = true;
      abstentionReason = "no_arabic_returned";
    }
  }

  const normalizedTranscript = normalizeTranscript(transcript);

  const alignmentStart = performance.now();
  const assessment = assessRecitationTranscript(sample.expectedArabic, transcript);
  latenciesMs.alignment = elapsedSince(alignmentStart);

  const decisionStart = performance.now();
  const position = createVerseFollowingPosition(sample.expectedSurah, sample.expectedAyah);
  const verseFollowingState = followRecitation({
    position,
    totalAyahs: sample.totalAyahs,
    alignment: evaluationAbstained ? null : assessment,
    previousAyahAlignment: sample.expectedAyah > 1
      ? assessRecitationTranscript(fatiha[sample.expectedAyah - 2], transcript)
      : null,
    nextAyahAlignment: sample.expectedAyah < sample.totalAyahs
      ? assessRecitationTranscript(fatiha[sample.expectedAyah], transcript)
      : null,
    transcriptUsable: !evaluationAbstained && Boolean(normalizedTranscript),
  });
  latenciesMs.decision = elapsedSince(decisionStart);
  latenciesMs.totalCorrection = Math.round(
    (latenciesMs.audioLoad + latenciesMs.base64Encode + latenciesMs.transcription + latenciesMs.alignment + latenciesMs.decision) * 10,
  ) / 10;

  return {
    id: sample.id,
    kind: sample.kind,
    description: sample.description,
    expectedAyah: `${sample.expectedSurah}:${sample.expectedAyah}`,
    audio: {
      source: describeAudioSource(sample.audio),
      mimeType: sample.audio.mimeType,
      bytes: audio.byteLength,
      base64Length: audioBase64.length,
    },
    transcriptReturned: transcript,
    transcriptLanguage,
    normalizedTranscript,
    matchedWords: evaluationAbstained ? 0 : assessment.matchedCount,
    totalExpectedWords: assessment.totalWords,
    omissions: evaluationAbstained
      ? []
      : assessment.expectedWords
        .filter((word) => word.status === "missing" && word.wordIndex !== null)
        .map((word) => ({ wordIndex: word.wordIndex as number, expected: word.expected })),
    substitutionsOrReviews: evaluationAbstained
      ? []
      : assessment.expectedWords
        .filter((word) => word.status === "review" && word.wordIndex !== null)
        .map((word) => ({ wordIndex: word.wordIndex as number, expected: word.expected, heard: word.heard })),
    extraWords: evaluationAbstained ? [] : assessment.extraWords.map((word) => word.heard ?? "").filter(Boolean),
    verseFollowingState,
    latenciesMs,
    evaluationAbstained,
    abstentionReason,
  };
}

function printHumanReport(reports: SampleReport[]): void {
  console.log("Real Quran recitation validation");
  console.log(`Samples: ${reports.length}`);
  console.log("p50/p95 latency: not reported; sample size is too small for a distribution.");
  console.log("");

  for (const report of reports) {
    console.log(`Sample: ${report.id}`);
    console.log(`  kind: ${report.kind}`);
    console.log(`  expected ayah: ${report.expectedAyah}`);
    console.log(`  audio: ${report.audio.mimeType}, ${report.audio.bytes} bytes, base64 ${report.audio.base64Length} chars`);
    console.log(`  transcript returned: ${report.transcriptReturned || "(empty)"}`);
    console.log(`  normalized transcript: ${report.normalizedTranscript || "(empty)"}`);
    console.log(`  matched words: ${report.matchedWords}/${report.totalExpectedWords}`);
    console.log(`  omissions: ${report.omissions.length ? report.omissions.map((word) => `${word.wordIndex}:${word.expected}`).join(", ") : "none"}`);
    console.log(`  substitutions/reviews: ${report.substitutionsOrReviews.length ? report.substitutionsOrReviews.map((word) => `${word.wordIndex}:${word.expected}->${word.heard ?? "(missing)"}`).join(", ") : "none"}`);
    console.log(`  verse following: ${report.verseFollowingState.state}, reason=${report.verseFollowingState.reason}, expectedWord=${report.verseFollowingState.expectedWordIndex}, advance=${report.verseFollowingState.shouldAdvance}`);
    console.log(`  abstained: ${report.evaluationAbstained ? `yes (${report.abstentionReason})` : "no"}`);
    console.log(`  latency ms: transcription=${report.latenciesMs.transcription}, alignment=${report.latenciesMs.alignment}, decision=${report.latenciesMs.decision}, total=${report.latenciesMs.totalCorrection}`);
    console.log("");
  }
}

const json = process.argv.includes("--json");

try {
  const reports: SampleReport[] = [];
  for (const sample of samples) reports.push(await runSample(sample));

  if (json) console.log(JSON.stringify({ reports, note: "p50/p95 omitted because there are fewer than 20 real samples." }, null, 2));
  else printHumanReport(reports);

  const correct = reports.find((report) => report.kind === "correct_ayah");
  if (correct && !correct.evaluationAbstained && correct.matchedWords === 0) {
    process.exitCode = 1;
    console.error("Correct real recitation produced zero matched words.");
  }
} catch (error) {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
}
