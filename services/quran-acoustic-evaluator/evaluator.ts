import type { LearningLevel } from "../../shared/learningPath";
import { alignKnownWords } from "./alignment";
import { analyzeAudio, preprocessAudio } from "./audio";
import { AbstainingPhonemeEvaluator, type PhonemeEvaluator } from "./phoneme";
import type { AcousticFinding, EvaluationResult } from "./types";

export type EvaluateInput = { audioBase64: string; mimeType: string; expectedArabic: string; surah: number; ayah: number; learningLevel: LearningLevel };
const MIN_FINDING_CONFIDENCE = 0.75;

export async function evaluate(input: EvaluateInput, phonemes: PhonemeEvaluator = new AbstainingPhonemeEvaluator()): Promise<EvaluationResult> {
  let audio; try { audio = await preprocessAudio(Buffer.from(input.audioBase64, "base64"), input.mimeType); } catch (error) { return { status:"abstained", provider:"quran-acoustic-prototype", confidence:0, summary:null, findings:[], measurements: undefined }; }
  const { quality, regions } = analyzeAudio(audio); if (quality.reason) return { status:"abstained", provider:"quran-acoustic-prototype", confidence:quality.confidence, summary:null, findings:[], measurements:{audioDurationMs:audio.durationMs,alignmentConfidence:0,words:[],uncertainRegions:regions} };
  const alignment = alignKnownWords(input.expectedArabic, regions, quality.confidence); const findings: AcousticFinding[] = [];
  // Only directly measured, unusually long internal silence is currently learner-facing.
  const durations = alignment.words.map(w=>w.endMs-w.startMs).sort((a,b)=>a-b), median=durations[Math.floor(durations.length/2)] || 0;
  for (const word of alignment.words.slice(0,-1)) { const confidence=Math.min(quality.confidence, word.confidence, Math.min(1, word.pauseAfterMs/900)); if(word.pauseAfterMs>Math.max(700,median*1.5) && confidence>=MIN_FINDING_CONFIDENCE) findings.push({kind:"pause",wordIndex:word.wordIndex,expectedArabic:word.arabic,guidance:"A long acoustic pause was measured after this word.",confidence}); }
  // Model-backed is mandatory; stubs and metadata can never produce findings.
  const observations = await phonemes.evaluate({audio,words:alignment.words});
  for (const observation of observations) if (observation.modelBacked && observation.confidence>=MIN_FINDING_CONFIDENCE) { /* reserved pending validated model and guidance contract */ }
  const confidence=Math.max(0,Math.min(1,Math.min(quality.confidence,alignment.confidence)));
  const measurements={audioDurationMs:audio.durationMs,alignmentConfidence:alignment.confidence,words:alignment.words,uncertainRegions:alignment.uncertainRegions};
  return findings.length ? {status:"available",provider:"quran-acoustic-prototype",confidence,summary:"An acoustic pause observation is available.",findings,measurements} : {status:"abstained",provider:"quran-acoustic-prototype",confidence,summary:null,findings:[],measurements};
}
