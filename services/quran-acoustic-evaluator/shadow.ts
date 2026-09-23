import type { PcmAudio } from "./types";

export type ShadowAnalysisStatus =
  | "not_configured"
  | "available"
  | "abstained"
  | "unavailable";

export type ShadowAnalysis = {
  status: ShadowAnalysisStatus;
  provider: string | null;
  modelId: string | null;
  decodedLevelCount: number;
  phonemeTokenCount: number;
  averagePosterior: number | null;
  /** Round-trip time of the shadow worker call, when one was made. */
  latencyMs?: number | null;
};

export type ShadowAnalysisInput = {
  audio: PcmAudio;
  evidenceOrigin: "learner_microphone";
  /** Opaque app request ID, forwarded so worker logs can be joined. */
  correlationId?: string | null;
};

export interface AcousticShadowEvaluator {
  analyze(input: ShadowAnalysisInput): Promise<ShadowAnalysis>;
}

const EMPTY_SHADOW_ANALYSIS: ShadowAnalysis = {
  status: "not_configured",
  provider: null,
  modelId: null,
  decodedLevelCount: 0,
  phonemeTokenCount: 0,
  averagePosterior: null,
};

/** Request correlation header shared with the app server. */
export const CORRELATION_HEADER = "x-correlation-id";

const SAFE_CORRELATION_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Accepts only the app's opaque, URL-safe request ID. Anything else (absent,
 * oversized, or containing control characters) is dropped rather than logged.
 */
export function safeCorrelationId(value: unknown): string | null {
  return typeof value === "string" && SAFE_CORRELATION_ID.test(value)
    ? value
    : null;
}

const MAX_LEVELS = 16;
const MAX_TOKENS_PER_LEVEL = 4096;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximumLength ? trimmed : null;
}

function boundedConfidence(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : null;
}

/**
 * Parse only aggregate diagnostics from a shadow response. Decoded Quran
 * phonemes and learner-derived tokens are deliberately discarded at this
 * trust boundary and must never enter application logs or learner feedback.
 */
export function parseShadowAnalysis(value: unknown): ShadowAnalysis {
  if (!isRecord(value))
    return { ...EMPTY_SHADOW_ANALYSIS, status: "unavailable" };
  if (value.status !== "available" && value.status !== "abstained")
    return { ...EMPTY_SHADOW_ANALYSIS, status: "unavailable" };

  const provider = boundedString(value.provider, 80);
  const modelId = boundedString(value.modelId, 160);
  if (value.status === "abstained") {
    return {
      status: "abstained",
      provider,
      modelId,
      decodedLevelCount: 0,
      phonemeTokenCount: 0,
      averagePosterior: null,
    };
  }

  if (!provider || !modelId || !isRecord(value.levels))
    return { ...EMPTY_SHADOW_ANALYSIS, status: "unavailable" };

  const levelEntries = Object.entries(value.levels);
  if (!levelEntries.length || levelEntries.length > MAX_LEVELS)
    return { ...EMPTY_SHADOW_ANALYSIS, status: "unavailable" };

  let phonemeTokenCount = 0;
  const posteriors: number[] = [];
  for (const [level, result] of levelEntries) {
    if (!boundedString(level, 80) || !isRecord(result))
      return { ...EMPTY_SHADOW_ANALYSIS, status: "unavailable" };
    if (
      !Array.isArray(result.tokens) ||
      result.tokens.length > MAX_TOKENS_PER_LEVEL
    )
      return { ...EMPTY_SHADOW_ANALYSIS, status: "unavailable" };
    if (
      result.tokens.some(
        token => typeof token !== "string" || token.length > 32
      )
    )
      return { ...EMPTY_SHADOW_ANALYSIS, status: "unavailable" };
    const posterior = boundedConfidence(result.meanPosterior);
    if (posterior === null)
      return { ...EMPTY_SHADOW_ANALYSIS, status: "unavailable" };
    posteriors.push(posterior);
    if (level === "phonemes") phonemeTokenCount = result.tokens.length;
  }

  return {
    status: "available",
    provider,
    modelId,
    decodedLevelCount: levelEntries.length,
    phonemeTokenCount,
    averagePosterior:
      posteriors.reduce((total, posterior) => total + posterior, 0) /
      posteriors.length,
  };
}

export class AbstainingAcousticShadowEvaluator
  implements AcousticShadowEvaluator
{
  async analyze(): Promise<ShadowAnalysis> {
    return EMPTY_SHADOW_ANALYSIS;
  }
}

/** Full-utterance adapter for a separately deployed research model worker. */
export class HttpAcousticShadowEvaluator implements AcousticShadowEvaluator {
  constructor(
    private readonly url: string,
    private readonly apiKey?: string,
    private readonly timeoutMs = 15_000
  ) {}

  async analyze({
    audio,
    evidenceOrigin,
    correlationId,
  }: ShadowAnalysisInput): Promise<ShadowAnalysis> {
    const started = Date.now();
    const timed = (analysis: ShadowAnalysis): ShadowAnalysis => ({
      ...analysis,
      latencyMs: Date.now() - started,
    });
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
          ...(correlationId ? { [CORRELATION_HEADER]: correlationId } : {}),
        },
        signal: AbortSignal.timeout(
          Math.min(Math.max(this.timeoutMs, 1_000), 30_000)
        ),
        body: JSON.stringify({
          pcmBase64: Buffer.from(
            audio.samples.buffer,
            audio.samples.byteOffset,
            audio.samples.byteLength
          ).toString("base64"),
          sampleRate: audio.sampleRate,
          evidenceOrigin,
        }),
      });
      if (!response.ok)
        return timed({ ...EMPTY_SHADOW_ANALYSIS, status: "unavailable" });
      return timed(parseShadowAnalysis(await response.json()));
    } catch {
      return timed({ ...EMPTY_SHADOW_ANALYSIS, status: "unavailable" });
    }
  }
}
