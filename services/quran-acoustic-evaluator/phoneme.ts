import { QURAN_PRONUNCIATION_CONFUSIONS } from "../../shared/quranAcoustic";
import { PHONEME_THRESHOLDS } from "./thresholds";
import type { PcmAudio, WordTiming } from "./types";

export type ConfusionPairId =
  (typeof QURAN_PRONUNCIATION_CONFUSIONS)[number]["id"];
export type AcousticTarget = {
  wordIndex: number;
  word: string;
  graphemeIndex: number;
  target: string;
  candidates: string[];
  confusionPairId: ConfusionPairId;
};
export type PhonemeFeatures = {
  durationMs: number;
  rms: number;
  zeroCrossingRate: number;
  spectralCentroid: number;
  bandEnergy: readonly number[];
};
export type ClassifierScores = {
  scores: Record<string, number>;
  modelId: string;
  segmentConfidence: number;
};
export type PhonemeObservation = {
  wordIndex: number;
  target: string;
  candidate: string;
  confusionPairId: ConfusionPairId;
  confidence: number;
  evidenceQuality: number;
  alignmentConfidence: number;
  signalQuality: number;
  segmentConfidence: number;
  classifierConfidence: number;
  margin: number;
  segmentDurationMs: number;
  modelBacked: boolean;
  modelId: string;
};
export interface AcousticPhonemeClassifier {
  classify(input: {
    samples: Float32Array;
    sampleRate: number;
    target: AcousticTarget;
    features: PhonemeFeatures;
  }): Promise<ClassifierScores | null>;
}
export interface PhonemeEvaluator {
  evaluate(input: {
    audio: PcmAudio;
    words: WordTiming[];
    signalQuality: number;
  }): Promise<PhonemeObservation[]>;
}

const MARK = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/;
const LETTER = /[\u0621-\u063A\u0641-\u064A\u066E-\u06D3]/;
const HAMZA_FORMS = new Set(["أ", "إ", "ؤ", "ئ", "ء", "ٱ"]);
const canonical = (value: string) => (HAMZA_FORMS.has(value) ? "أ" : value);

/** Acoustic targets retain Quran display text while independently canonicalising hamza. */
function acousticGraphemes(word: string) {
  const graphemes: string[] = [];
  for (const character of Array.from(word.normalize("NFC"))) {
    if (MARK.test(character)) {
      if (character === "ّ" && graphemes.length)
        graphemes.push(graphemes.at(-1)!); // shaddah is a repeated consonant
      continue;
    }
    if (LETTER.test(character)) graphemes.push(canonical(character));
  }
  return graphemes;
}

export function extractAcousticTargets(
  word: string,
  wordIndex: number
): AcousticTarget[] {
  const graphemes = acousticGraphemes(word);
  return graphemes.flatMap((target, graphemeIndex) => {
    const taxonomy = QURAN_PRONUNCIATION_CONFUSIONS.find(pair =>
      pair.graphemes.some(item => canonical(item) === target)
    );
    return taxonomy
      ? [
          {
            wordIndex,
            word,
            graphemeIndex,
            target,
            candidates: taxonomy.graphemes
              .map(canonical)
              .filter(item => item !== target),
            confusionPairId: taxonomy.id,
          },
        ]
      : [];
  });
}

export function extractPhonemeFeatures(
  samples: Float32Array,
  sampleRate: number
): PhonemeFeatures {
  let square = 0,
    crossings = 0;
  for (let i = 0; i < samples.length; i++) {
    square += samples[i] ** 2;
    if (i && samples[i] >= 0 !== samples[i - 1] >= 0) crossings++;
  }
  // A compact deterministic spectral representation. A deployable worker can use
  // these diagnostics alongside XLS-R embeddings; this is never itself a label.
  const bins = 64,
    spectrum = Array.from({ length: bins }, (_, k) => {
      let real = 0,
        imaginary = 0;
      const stride = Math.max(1, Math.floor(samples.length / 512));
      for (let n = 0; n < samples.length; n += stride) {
        const angle = (2 * Math.PI * k * n) / samples.length;
        real += samples[n] * Math.cos(angle);
        imaginary -= samples[n] * Math.sin(angle);
      }
      return real * real + imaginary * imaginary;
    });
  const total = spectrum.reduce((sum, value) => sum + value, 0) || 1;
  return {
    durationMs: (samples.length / sampleRate) * 1000,
    rms: Math.sqrt(square / Math.max(1, samples.length)),
    zeroCrossingRate: crossings / Math.max(1, samples.length - 1),
    spectralCentroid:
      spectrum.reduce(
        (sum, value, index) =>
          sum + ((index * sampleRate) / (bins * 2)) * value,
        0
      ) / total,
    bandEnergy: [0, 1, 2, 3].map(
      band =>
        spectrum
          .slice(band * 16, (band + 1) * 16)
          .reduce((sum, value) => sum + value, 0) / total
    ),
  };
}

function bounded(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** Known-word, aligned-region inference. It does not transcribe the recording. */
export class AlignedPhonemeEvaluator implements PhonemeEvaluator {
  constructor(private readonly classifier: AcousticPhonemeClassifier) {}
  async evaluate({
    audio,
    words,
    signalQuality,
  }: {
    audio: PcmAudio;
    words: WordTiming[];
    signalQuality: number;
  }) {
    const observations: PhonemeObservation[] = [];
    if (signalQuality < PHONEME_THRESHOLDS.minimumSignalQuality)
      return observations;
    for (const word of words) {
      if (word.confidence < PHONEME_THRESHOLDS.minimumAlignmentQuality)
        continue;
      const targets = extractAcousticTargets(word.arabic, word.wordIndex);
      const letters = acousticGraphemes(word.arabic);
      if (!targets.length || !letters.length) continue;
      const wordDuration = word.endMs - word.startMs;
      for (const target of targets) {
        const startMs =
          word.startMs + (wordDuration * target.graphemeIndex) / letters.length;
        const endMs =
          word.startMs +
          (wordDuration * (target.graphemeIndex + 1)) / letters.length;
        const durationMs = endMs - startMs;
        if (
          durationMs < PHONEME_THRESHOLDS.minimumSegmentDurationMs ||
          durationMs > PHONEME_THRESHOLDS.maximumSegmentDurationMs
        )
          continue;
        const samples = audio.samples.slice(
          Math.floor((startMs * audio.sampleRate) / 1000),
          Math.ceil((endMs * audio.sampleRate) / 1000)
        );
        const features = extractPhonemeFeatures(samples, audio.sampleRate);
        if (features.rms < 0.015) continue;
        const result = await this.classifier
          .classify({ samples, sampleRate: audio.sampleRate, target, features })
          .catch(() => null);
        if (
          !result ||
          !result.modelId ||
          result.segmentConfidence < PHONEME_THRESHOLDS.minimumSegmentConfidence
        )
          continue;
        const candidate = target.candidates
          .map(value => [value, bounded(result.scores[value] ?? 0)] as const)
          .sort((a, b) => b[1] - a[1])[0];
        if (!candidate) continue;
        const targetScore = bounded(result.scores[target.target] ?? 0),
          classifierConfidence = candidate[1],
          margin = classifierConfidence - targetScore;
        const evidenceQuality = Math.min(
          signalQuality,
          word.confidence,
          bounded(result.segmentConfidence)
        );
        const confidence = bounded(
          Math.min(
            evidenceQuality,
            classifierConfidence,
            margin / PHONEME_THRESHOLDS.minimumTargetVsConfusionMargin
          )
        );
        observations.push({
          wordIndex: word.wordIndex,
          target: target.target,
          candidate: candidate[0],
          confusionPairId: target.confusionPairId,
          confidence,
          evidenceQuality,
          alignmentConfidence: word.confidence,
          signalQuality,
          segmentConfidence: bounded(result.segmentConfidence),
          classifierConfidence,
          margin,
          segmentDurationMs: durationMs,
          modelBacked: true,
          modelId: result.modelId,
        });
      }
    }
    return observations;
  }
}

/** Safe default until a separately deployed, calibrated classifier is configured. */
export class AbstainingPhonemeEvaluator implements PhonemeEvaluator {
  async evaluate(): Promise<PhonemeObservation[]> {
    return [];
  }
}

/** Adapter for a separately deployed XLS-R/phoneme-classifier worker. */
export class HttpPhonemeClassifier implements AcousticPhonemeClassifier {
  constructor(
    private readonly url: string,
    private readonly apiKey?: string
  ) {}
  async classify(input: {
    samples: Float32Array;
    sampleRate: number;
    target: AcousticTarget;
    features: PhonemeFeatures;
  }): Promise<ClassifierScores | null> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        pcmBase64: Buffer.from(
          input.samples.buffer,
          input.samples.byteOffset,
          input.samples.byteLength
        ).toString("base64"),
        sampleRate: input.sampleRate,
        target: input.target,
        features: input.features,
      }),
    });
    if (!response.ok) return null;
    const value = (await response.json()) as Partial<ClassifierScores>;
    return value.scores &&
      typeof value.modelId === "string" &&
      typeof value.segmentConfidence === "number"
      ? (value as ClassifierScores)
      : null;
  }
}
