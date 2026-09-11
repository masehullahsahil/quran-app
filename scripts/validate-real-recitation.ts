import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { transcribeAudio, type TranscriptionResponse } from "../server/_core/voiceTranscription";
import { evaluateQuranAwareAudio } from "../server/quranEvaluator";
import {
  captureBuildInfo,
  createAttemptId,
  createRunId,
  renderMarkdownReport,
  ValidationLedger,
  type DeviceMetadata,
} from "../server/validation/validationRun";
import { recordSampleAttempt } from "../server/validation/attemptRecorder";
import {
  assessRecitationTranscript,
  hasArabicScript,
  normaliseArabicToken,
  tokenizeArabic,
} from "../server/recitation";
import { createVerseFollowingPosition, followRecitation } from "../shared/verseFollowing";
import { decideTeacherAction, traceTeacherDecision } from "../shared/teacherDecision";
import type { QuranAwareReview } from "../shared/quranEvaluation";

export type RealRecitationSample = {
  id: string;
  kind: "correct_ayah" | "skipped_word" | "corrected_after_skip" | "wrong_recitation";
  description: string;
  expectedSurah: number;
  expectedAyah: number;
  expectedArabic: string;
  totalAyahs: number;
  audio: AudioSource;
  omittedWordIndex?: number;
  omittedWord?: string;
};

export type AudioSource =
  | { type: "url"; url: string; mimeType: string }
  | { type: "concat-url"; urls: string[]; mimeType: string };

/**
 * Injectable pipeline dependencies. The default wiring calls the real
 * implementations (network audio fetch, live transcription, acoustic
 * evaluation). Tests inject fakes so the flow runs with no live services
 * and no network. Production behavior with the defaults is unchanged.
 */
export type SamplePipelineDeps = {
  loadAudio: (source: AudioSource) => Promise<Buffer>;
  transcribe: (args: { audio: Buffer; mimeType: string }) => Promise<TranscriptionResponse | { code: string; error: string }>;
  evaluateAcoustic: (args: {
    audioBase64: string;
    mimeType: string;
    expectedArabic: string;
    surah: number;
    ayah: number;
    learningLevel: "qaida";
  }) => Promise<QuranAwareReview>;
};

export const defaultPipelineDeps: SamplePipelineDeps = {
  loadAudio,
  transcribe: ({ audio, mimeType }) => transcribeAudio({ audio, mimeType, language: "ar" }),
  evaluateAcoustic: (args) => evaluateQuranAwareAudio(args),
};

type Timings = Record<string, number>;

export type SampleReport = {
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
  transcriptionSucceeded: boolean;
  normalizedTranscript: string;
  normalizedExpected: string;
  matchedWords: number;
  totalExpectedWords: number;
  omissions: Array<{ wordIndex: number; expected: string }>;
  substitutionsOrReviews: Array<{ wordIndex: number; expected: string; heard: string | null }>;
  extraWords: string[];
  verseFollowingState: ReturnType<typeof followRecitation>;
  teacherDecision: ReturnType<typeof traceTeacherDecision> & {
    focusArabic: string | null;
    reason: ReturnType<typeof traceTeacherDecision>["reason"];
  };
  acoustic: {
    status: QuranAwareReview["status"];
    provider: string | null;
    confidence: number | null;
    canDriveLearnerCorrection: boolean;
    findings: Array<{ kind: string; wordIndex: number | null; expectedArabic: string | null }>;
  };
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

export const samples: RealRecitationSample[] = [
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
    id: "quran-wbw-001002-correct-after-skip",
    kind: "corrected_after_skip",
    description: "Real Quran.com word-by-word audio for al-Fatiha 1:2 with all words present, used after the skipped-word case.",
    expectedSurah: 1,
    expectedAyah: 2,
    expectedArabic: fatiha[1],
    totalAyahs: fatiha.length,
    audio: {
      type: "concat-url",
      mimeType: "audio/mpeg",
      urls: [
        "https://audio.qurancdn.com/wbw/001_002_001.mp3",
        "https://audio.qurancdn.com/wbw/001_002_002.mp3",
        "https://audio.qurancdn.com/wbw/001_002_003.mp3",
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

export async function runSample(sample: RealRecitationSample, deps: SamplePipelineDeps = defaultPipelineDeps): Promise<SampleReport> {
  const latenciesMs: Timings = {};
  const totalStart = performance.now();

  const audioStart = performance.now();
  const audio = await deps.loadAudio(sample.audio);
  latenciesMs.audioLoad = elapsedSince(audioStart);

  const encodeStart = performance.now();
  const audioBase64 = audio.toString("base64");
  latenciesMs.base64Encode = elapsedSince(encodeStart);

  const acousticStart = performance.now();
  const acousticPromise = deps.evaluateAcoustic({
    audioBase64,
    mimeType: sample.audio.mimeType,
    expectedArabic: sample.expectedArabic,
    surah: sample.expectedSurah,
    ayah: sample.expectedAyah,
    learningLevel: "qaida",
  }).then((review) => {
    latenciesMs.acoustic = elapsedSince(acousticStart);
    return review;
  });

  const transcriptionStart = performance.now();
  const transcription = await deps.transcribe({
    audio,
    mimeType: sample.audio.mimeType,
  });
  latenciesMs.transcription = elapsedSince(transcriptionStart);
  const quranAwareReview = await acousticPromise;

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
  const normalizedExpected = normalizeTranscript(sample.expectedArabic);

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
  const teacherDecision = decideTeacherAction({
    recording: { isRecording: false, isReviewing: false, failed: false },
    attempt: {
      reviewable: !evaluationAbstained,
      corrections: evaluationAbstained ? [] : assessment.corrections,
      verseFollowing: verseFollowingState,
    },
    acoustic: quranAwareReview,
    memory: { reviewDue: false, recurringWordIndexes: [] },
    livePosition: {
      currentSurah: position.currentSurah,
      currentAyah: position.currentAyah,
      expectedWordIndex: position.expectedWordIndex,
    },
    hasNextAyah: sample.expectedAyah < sample.totalAyahs,
  });
  latenciesMs.totalCorrection = elapsedSince(totalStart);

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
    transcriptionSucceeded: !("error" in transcription),
    normalizedTranscript,
    normalizedExpected,
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
    teacherDecision: {
      ...traceTeacherDecision(teacherDecision),
      focusArabic: teacherDecision.focus?.expectedArabic ?? null,
    },
    acoustic: {
      status: quranAwareReview.status,
      provider: quranAwareReview.provider,
      confidence: quranAwareReview.confidence,
      canDriveLearnerCorrection: quranAwareReview.canDriveLearnerCorrection === true,
      findings: quranAwareReview.findings.map((finding) => ({
        kind: finding.kind,
        wordIndex: finding.wordIndex,
        expectedArabic: finding.expectedArabic,
      })),
    },
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
    console.log(`  transcription success: ${report.transcriptionSucceeded ? "yes" : "no"}`);
    console.log(`  transcript returned: ${report.transcriptReturned || "(empty)"}`);
    console.log(`  normalized transcript: ${report.normalizedTranscript || "(empty)"}`);
    console.log(`  normalized expected: ${report.normalizedExpected}`);
    console.log(`  matched words: ${report.matchedWords}/${report.totalExpectedWords}`);
    console.log(`  omissions: ${report.omissions.length ? report.omissions.map((word) => `${word.wordIndex}:${word.expected}`).join(", ") : "none"}`);
    console.log(`  substitutions/reviews: ${report.substitutionsOrReviews.length ? report.substitutionsOrReviews.map((word) => `${word.wordIndex}:${word.expected}->${word.heard ?? "(missing)"}`).join(", ") : "none"}`);
    console.log(`  verse following: ${report.verseFollowingState.state}, reason=${report.verseFollowingState.reason}, expectedWord=${report.verseFollowingState.expectedWordIndex}, advance=${report.verseFollowingState.shouldAdvance}`);
    console.log(`  teacher decision: action=${report.teacherDecision.kind}, reason=${report.teacherDecision.reason}, evidence=${report.teacherDecision.evidenceLevel}, focusWord=${report.teacherDecision.focusWordIndex ?? "none"}, focusArabic=${report.teacherDecision.focusArabic ?? "none"}`);
    console.log(`  acoustic: status=${report.acoustic.status}, confidence=${report.acoustic.confidence ?? "none"}, primary=${report.acoustic.canDriveLearnerCorrection ? "enabled" : "disabled"}, findings=${report.acoustic.findings.length ? report.acoustic.findings.map((finding) => `${finding.kind}:${finding.wordIndex ?? "general"}:${finding.expectedArabic ?? "none"}`).join(", ") : "none"}`);
    console.log(`  abstained: ${report.evaluationAbstained ? `yes (${report.abstentionReason})` : "no"}`);
    console.log(`  latency ms: transcription=${report.latenciesMs.transcription}, acoustic=${report.latenciesMs.acoustic}, alignment=${report.latenciesMs.alignment}, decision=${report.latenciesMs.decision}, total=${report.latenciesMs.totalCorrection}`);
    console.log("");
  }
}

type CliOptions = {
  json: boolean;
  runId: string;
  correlationId: string | null;
  deviceMetadata: DeviceMetadata;
  ledgerOut: string;
  reportOut: string;
};

export function parseCliArgs(argv: string[]): CliOptions {
  const valueOf = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
  };
  const deviceMetadata: DeviceMetadata = {};
  const deviceJson = valueOf("--device-json");
  if (deviceJson) {
    try {
      Object.assign(deviceMetadata, JSON.parse(deviceJson) as Record<string, unknown>);
    } catch {
      console.error("--device-json is not valid JSON; ignoring.");
    }
  }
  for (const [flag, key] of [
    ["--device-name", "deviceName"],
    ["--browser", "browser"],
    ["--network", "network"],
    ["--env-note", "envNote"],
  ] as const) {
    const value = valueOf(flag);
    if (value) deviceMetadata[key] = value;
  }
  const runId = valueOf("--run-id") ?? createRunId();
  const defaultOut = (name: string) => path.join(cacheDir, `${name}-${runId}.json`);
  return {
    json: argv.includes("--json"),
    runId,
    correlationId: valueOf("--correlation-id"),
    deviceMetadata,
    ledgerOut: valueOf("--ledger-out") ?? defaultOut("validation-ledger"),
    reportOut: valueOf("--report-out") ?? path.join(cacheDir, `validation-report-${runId}.md`),
  };
}

export function toSampleAttemptSummary(
  sample: RealRecitationSample,
  report: SampleReport,
): Parameters<typeof recordSampleAttempt>[1] {
  return {
    sampleId: sample.id,
    sampleKind: sample.kind,
    expectedSurah: sample.expectedSurah,
    expectedAyah: sample.expectedAyah,
    teacherDecisionKind: report.teacherDecision.kind,
    teacherDecisionReason: report.teacherDecision.reason,
    teacherDecisionEvidenceLevel: report.teacherDecision.evidenceLevel,
    teacherDecisionFocusWordIndex: report.teacherDecision.focusWordIndex,
    verseFollowingState: report.verseFollowingState.state,
    verseFollowingReason: report.verseFollowingState.reason,
    verseFollowingExpectedWordIndex: report.verseFollowingState.expectedWordIndex,
    verseFollowingShouldAdvance: report.verseFollowingState.shouldAdvance,
    matchedWords: report.matchedWords,
    totalExpectedWords: report.totalExpectedWords,
    evaluationAbstained: report.evaluationAbstained,
    abstentionReason: report.abstentionReason,
    latenciesMs: report.latenciesMs,
  };
}

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2));
  const ledger = new ValidationLedger({
    runId: cli.runId,
    build: captureBuildInfo(),
    deviceMetadata: cli.deviceMetadata,
  });

  try {
    ledger.record("session.start", { sampleCount: samples.length }, { correlationId: cli.correlationId });
    if (Object.keys(cli.deviceMetadata).length > 0) {
      ledger.record("device.metadata", cli.deviceMetadata, { correlationId: cli.correlationId });
    }

    const reports: SampleReport[] = [];
    for (const sample of samples) {
      const attemptId = createAttemptId();
      const report = await runSample(sample);
      reports.push(report);
      recordSampleAttempt(ledger, toSampleAttemptSummary(sample, report), {
        attemptId,
        correlationId: cli.correlationId,
      });
    }

    if (cli.json)
      console.log(JSON.stringify({ reports, note: "p50/p95 omitted because there are fewer than 20 real samples." }, null, 2));
    else printHumanReport(reports);

    const correct = reports.find((report) => report.kind === "correct_ayah");
    if (correct && !correct.evaluationAbstained && correct.matchedWords === 0) {
      process.exitCode = 1;
      console.error("Correct real recitation produced zero matched words.");
    }

    await mkdir(path.dirname(cli.ledgerOut), { recursive: true });
    await writeFile(cli.ledgerOut, JSON.stringify(ledger.toJSON(), null, 2), "utf8");
    await writeFile(cli.reportOut, renderMarkdownReport(ledger), "utf8");
    console.log(`Validation ledger: ${cli.ledgerOut}`);
    console.log(`Validation report: ${cli.reportOut}`);
    const verdict = ledger.computeVerdict();
    console.log(`Validation verdict: ${verdict.status.toUpperCase()} (blockers=${verdict.blockerCount}, serious=${verdict.seriousCount})`);
    if (verdict.status === "fail") process.exitCode = 1;
  } catch (error) {
    process.exitCode = 1;
    console.error(error instanceof Error ? error.message : String(error));
  }
}

const invokedAsScript =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  await main();
}
