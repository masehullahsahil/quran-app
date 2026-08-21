import {
  EMPTY_QURAN_AWARE_REVIEW,
  type QuranAwareReview,
  type QuranEvaluationFinding,
  type QuranEvaluationFindingKind,
} from "@shared/quranEvaluation";
import type { LearningLevel } from "@shared/learningPath";
import { ENV } from "./_core/env";

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

function parseResponse(value: unknown): QuranAwareReview {
  if (!isRecord(value)) return { ...EMPTY_QURAN_AWARE_REVIEW, status: "unavailable" };

  const provider = boundedString(value.provider, 80);
  const confidence = boundedConfidence(value.confidence);
  const status = value.status === "available" || value.status === "abstained" ? value.status : "abstained";
  const summary = boundedString(value.summary, MAX_SUMMARY_LENGTH);

  // A specialised evaluator must decline to diagnose when its own confidence is
  // below the product threshold. This prevents a response-shaped payload from
  // being presented as a correction merely because a service returned JSON.
  if (status === "abstained" || confidence === null || confidence < MINIMUM_CONFIDENCE) {
    return { status: "abstained", provider, confidence, summary: null, findings: [] };
  }

  const rawFindings = Array.isArray(value.findings) ? value.findings : [];
  const findings = rawFindings.map(parseFinding).filter((finding): finding is QuranEvaluationFinding => Boolean(finding)).slice(0, MAX_FINDINGS);

  // A high confidence score alone is not a learner-facing observation. Require
  // a bounded summary or a structured finding before rendering this review.
  if (!summary && findings.length === 0) {
    return { status: "abstained", provider, confidence, summary: null, findings: [] };
  }

  return { status: "available", provider, confidence, summary, findings };
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
export async function evaluateQuranAwareAudio(input: QuranEvaluatorRequest): Promise<QuranAwareReview> {
  if (!isQuranEvaluatorConfigured()) return EMPTY_QURAN_AWARE_REVIEW;

  try {
    const url = new URL("v1/evaluate", `${ENV.quranEvaluatorUrl.replace(/\/+$/, "")}/`);
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    if (ENV.quranEvaluatorApiKey) headers.authorization = `Bearer ${ENV.quranEvaluatorApiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(Math.min(Math.max(ENV.quranEvaluatorTimeoutMs, 1000), 20_000)),
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      console.warn(`[quran-evaluator] Service returned ${response.status}; using word-alignment fallback`);
      return { ...EMPTY_QURAN_AWARE_REVIEW, status: "unavailable" };
    }

    return parseResponse(await response.json());
  } catch (error) {
    console.warn("[quran-evaluator] Service unavailable; using word-alignment fallback", error instanceof Error ? error.name : "unknown error");
    return { ...EMPTY_QURAN_AWARE_REVIEW, status: "unavailable" };
  }
}
