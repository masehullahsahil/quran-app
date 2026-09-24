import {
  EMPTY_QURAN_AWARE_REVIEW,
  type QuranAwareReview,
  type QuranEvaluationFinding,
  type QuranEvaluationFindingKind,
} from "@shared/quranEvaluation";
import type { LearningLevel } from "@shared/learningPath";
import type { SupportedLanguageCode } from "@shared/languages";
import { ENV } from "./_core/env";
import { isSafeRequestId } from "./_core/requestId";

const MINIMUM_CONFIDENCE = 0.75;
const MAX_FINDINGS = 3;
const MAX_SUMMARY_LENGTH = 280;
const MAX_GUIDANCE_LENGTH = 220;
const MAX_ARABIC_LENGTH = 120;
const ALLOWED_KINDS = new Set<QuranEvaluationFindingKind>(["phoneme", "vowel_length", "pause", "tajweed"]);

type QuranEvaluatorRequest = {
  audioBase64: string;
  mimeType: string;
  expectedArabic: string;
  surah: number;
  ayah: number;
  learningLevel: LearningLevel;
  /**
   * The learner's interface language. The service writes the summary and
   * finding guidance the learner reads, so it needs the language to write
   * them in — without it the prose defaults to the model's own language.
   */
  uiLanguage: SupportedLanguageCode;
};

/** Header carrying the app request's correlation ID to the evaluator. */
export const EVALUATOR_CORRELATION_HEADER = "x-correlation-id";

export type ShadowDiagnosticStatus =
  | "not_run"
  | "not_configured"
  | "available"
  | "abstained"
  | "unavailable";

/**
 * Aggregate, server-only diagnostics for one evaluator call. Counts, enums,
 * bounded identifiers and timings only: never audio, transcripts, Quran text,
 * decoded phoneme tokens, credentials, or learner identity. These never feed
 * the learner-facing review, correction focus, or advancement.
 */
export type QuranEvaluatorDiagnostics = {
  evaluatorCalled: boolean;
  evaluatorStatus: QuranAwareReview["status"];
  evaluatorHttpStatus: number | null;
  evaluatorLatencyMs: number | null;
  primaryCorrectionsEnabled: boolean;
  shadowStatus: ShadowDiagnosticStatus;
  shadowProvider: string | null;
  shadowModelId: string | null;
  shadowDecodedLevels: number;
  shadowPhonemeTokens: number;
  shadowAveragePosterior: number | null;
  shadowLatencyMs: number | null;
  /** The ayah sent to the evaluator (numbers only), or null when not called. */
  evaluatedSurah: number | null;
  evaluatedAyah: number | null;
  /** The service's `measurements.alignmentConfidence` (0..1), when reported. */
  alignmentConfidence: number | null;
  /** Findings the app accepted after its own confidence gate (a count). */
  findingsCount: number;
  /**
   * Why the evaluator declined to diagnose. Mirrors the RunPod
   * `quran_acoustic_evaluation` log: an abstained review is
   * `insufficient_reliable_evidence`; every other status is null.
   */
  abstentionReason: EvaluatorAbstentionReason | null;
};

export type EvaluatorAbstentionReason = "insufficient_reliable_evidence";

export type QuranEvaluatorCallOptions = {
  /** The app request's correlation ID, forwarded as `x-correlation-id`. */
  correlationId?: string | null;
  /** Receives aggregate diagnostics for the validation ledger. */
  onDiagnostics?: (diagnostics: QuranEvaluatorDiagnostics) => void;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function boundedConfidence(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function boundedCount(value: unknown, maximum: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum ? value : 0;
}

function boundedLatency(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 600_000
    ? Math.round(value)
    : null;
}

const SHADOW_STATUSES = new Set<ShadowDiagnosticStatus>(["not_configured", "available", "abstained", "unavailable"]);

/**
 * Reads only the aggregate shadow fields from `measurements.shadow`. Word
 * timings (which carry Quran text) and any decoded level payloads are never
 * read, so they cannot reach the ledger even if a service returns them.
 */
export function parseShadowDiagnostics(value: unknown): Pick<
  QuranEvaluatorDiagnostics,
  | "shadowStatus"
  | "shadowProvider"
  | "shadowModelId"
  | "shadowDecodedLevels"
  | "shadowPhonemeTokens"
  | "shadowAveragePosterior"
  | "shadowLatencyMs"
> {
  const shadow = isRecord(value) && isRecord(value.measurements) ? value.measurements.shadow : null;
  if (!isRecord(shadow)) {
    return {
      shadowStatus: "not_run",
      shadowProvider: null,
      shadowModelId: null,
      shadowDecodedLevels: 0,
      shadowPhonemeTokens: 0,
      shadowAveragePosterior: null,
      shadowLatencyMs: null,
    };
  }
  const status = typeof shadow.status === "string" && SHADOW_STATUSES.has(shadow.status as ShadowDiagnosticStatus)
    ? shadow.status as ShadowDiagnosticStatus
    : "unavailable";
  return {
    shadowStatus: status,
    shadowProvider: boundedString(shadow.provider, 80),
    shadowModelId: boundedString(shadow.modelId, 160),
    shadowDecodedLevels: boundedCount(shadow.decodedLevelCount, 16),
    shadowPhonemeTokens: boundedCount(shadow.phonemeTokenCount, 4096),
    shadowAveragePosterior: boundedConfidence(shadow.averagePosterior),
    shadowLatencyMs: boundedLatency(shadow.latencyMs),
  };
}

/** Reads only the scalar `measurements.alignmentConfidence`; never word timings. */
export function parseAlignmentConfidence(value: unknown): number | null {
  return isRecord(value) && isRecord(value.measurements)
    ? boundedConfidence(value.measurements.alignmentConfidence)
    : null;
}

function parseFinding(value: unknown): QuranEvaluationFinding | null {
  if (!isRecord(value)) return null;
  const kind = value.kind;
  const guidance = boundedString(value.guidance, MAX_GUIDANCE_LENGTH);
  if (typeof kind !== "string" || !ALLOWED_KINDS.has(kind as QuranEvaluationFindingKind) || !guidance) return null;

  const wordIndex = typeof value.wordIndex === "number" && Number.isInteger(value.wordIndex) && value.wordIndex > 0
    ? value.wordIndex
    : null;
  const expectedArabic = boundedString(value.expectedArabic, MAX_ARABIC_LENGTH);

  return { kind: kind as QuranEvaluationFindingKind, wordIndex, expectedArabic, guidance };
}

function parseResponse(value: unknown, maximumWordIndex: number): QuranAwareReview {
  if (!isRecord(value)) return { ...EMPTY_QURAN_AWARE_REVIEW, status: "unavailable" };

  const provider = boundedString(value.provider, 80);
  const confidence = boundedConfidence(value.confidence);
  if (value.status !== "available" && value.status !== "abstained") {
    return { ...EMPTY_QURAN_AWARE_REVIEW, status: "unavailable" };
  }
  const status = value.status;
  const summary = boundedString(value.summary, MAX_SUMMARY_LENGTH);

  // A specialised evaluator must decline to diagnose when its own confidence is
  // below the product threshold. This prevents a response-shaped payload from
  // being presented as a correction merely because a service returned JSON.
  if (status === "abstained" || confidence === null || confidence < MINIMUM_CONFIDENCE) {
    return { status: "abstained", provider, confidence, summary: null, findings: [] };
  }

  if (!Array.isArray(value.findings)) return { ...EMPTY_QURAN_AWARE_REVIEW, status: "unavailable" };
  const parsedFindings = value.findings.map(parseFinding);
  if (parsedFindings.some(finding => !finding)) return { ...EMPTY_QURAN_AWARE_REVIEW, status: "unavailable" };
  if ((parsedFindings as QuranEvaluationFinding[]).some(finding => finding.wordIndex !== null && finding.wordIndex > maximumWordIndex)) {
    return { ...EMPTY_QURAN_AWARE_REVIEW, status: "unavailable" };
  }
  const findings = (parsedFindings as QuranEvaluationFinding[]).slice(0, MAX_FINDINGS);

  // A high confidence score alone is not a learner-facing observation. Require
  // a bounded summary or a structured finding before rendering this review.
  if (!summary && findings.length === 0) {
    return { status: "abstained", provider, confidence, summary: null, findings: [] };
  }

  return {
    status: "available",
    provider,
    confidence,
    summary,
    findings,
    canDriveLearnerCorrection: ENV.quranEvaluatorPrimaryCorrections,
  };
}

/**
 * Whether a separately deployed Quran-aware acoustic service is available.
 * The current Vercel deployment deliberately does not bundle a speech model;
 * this adapter keeps that model behind a server-only, optional integration.
 */
export function isQuranEvaluatorConfigured(): boolean {
  return Boolean(ENV.quranEvaluatorUrl);
}

/**
 * Requests a specialised evaluator using a fixed, small JSON contract:
 * POST {QURAN_EVALUATOR_URL}/v1/evaluate
 *
 * A service may return `available` only for confidence-gated observations. It
 * must return `abstained` when it cannot assess the recording. Network or
 * schema failures degrade to the app's existing transcript-based word review.
 */
export async function evaluateQuranAwareAudio(
  input: QuranEvaluatorRequest,
  options: QuranEvaluatorCallOptions = {},
): Promise<QuranAwareReview> {
  const report = (review: QuranAwareReview, call: {
    called: boolean;
    httpStatus?: number | null;
    latencyMs?: number | null;
    body?: unknown;
  }): QuranAwareReview => {
    if (options.onDiagnostics) {
      try {
        options.onDiagnostics({
          evaluatorCalled: call.called,
          evaluatorStatus: review.status,
          evaluatorHttpStatus: call.httpStatus ?? null,
          evaluatorLatencyMs: call.latencyMs ?? null,
          primaryCorrectionsEnabled: ENV.quranEvaluatorPrimaryCorrections,
          ...parseShadowDiagnostics(call.body),
          ...(call.called ? {} : { shadowStatus: "not_run" as const }),
          evaluatedSurah: call.called ? input.surah : null,
          evaluatedAyah: call.called ? input.ayah : null,
          alignmentConfidence: parseAlignmentConfidence(call.body),
          findingsCount: review.findings.length,
          abstentionReason: review.status === "abstained" ? "insufficient_reliable_evidence" : null,
        });
      } catch {
        // Diagnostics are observation only; never affect the review.
      }
    }
    return review;
  };

  if (!isQuranEvaluatorConfigured()) return report(EMPTY_QURAN_AWARE_REVIEW, { called: false });

  const started = Date.now();
  try {
    const url = new URL("v1/evaluate", `${ENV.quranEvaluatorUrl.replace(/\/+$/, "")}/`);
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    if (ENV.quranEvaluatorApiKey) headers.authorization = `Bearer ${ENV.quranEvaluatorApiKey}`;
    // Only the opaque, pattern-checked request ID crosses the boundary, so
    // the evaluator's structured log can be joined to the app's ledger.
    if (isSafeRequestId(options.correlationId)) headers[EVALUATOR_CORRELATION_HEADER] = options.correlationId;

    const response = await fetch(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(Math.min(Math.max(ENV.quranEvaluatorTimeoutMs, 1000), 20_000)),
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      console.warn(`[quran-evaluator] Service returned ${response.status}; using word-alignment fallback`);
      return report({ ...EMPTY_QURAN_AWARE_REVIEW, status: "unavailable" }, {
        called: true,
        httpStatus: response.status,
        latencyMs: Date.now() - started,
      });
    }

    const maximumWordIndex = input.expectedArabic.trim().split(/\s+/).filter(Boolean).length;
    const body: unknown = await response.json();
    return report(parseResponse(body, maximumWordIndex), {
      called: true,
      httpStatus: response.status,
      latencyMs: Date.now() - started,
      body,
    });
  } catch (error) {
    console.warn("[quran-evaluator] Service unavailable; using word-alignment fallback", error instanceof Error ? error.name : "unknown error");
    return report({ ...EMPTY_QURAN_AWARE_REVIEW, status: "unavailable" }, {
      called: true,
      latencyMs: Date.now() - started,
    });
  }
}
