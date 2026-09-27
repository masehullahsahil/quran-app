/** Staff research only. Never imported by learner review or scoring code. */
import type { ValidationAttemptExport } from "./attemptExport";

export type ResearchConsent = Readonly<{
  granted: true;
  purpose: string;
  retainUntil: string;
}>;

/** Explicit opt-in; accepts ISO dates or ISO timestamps, never date-parser prose. */
export function parsePhonemeRetention(
  value: unknown,
  now = Date.now()
): ResearchConsent {
  const v = value as Record<string, unknown> | null;
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    typeof v.purpose !== "string" ||
    !v.purpose.trim() ||
    typeof v.retainUntil !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      v.retainUntil
    )
  ) {
    throw new Error(
      "Invalid phonemeRetention: purpose and an ISO retainUntil are required."
    );
  }
  const date = v.retainUntil.slice(0, 10);
  const calendar = new Date(`${date}T00:00:00Z`);
  const expiry = Date.parse(v.retainUntil);
  if (
    !Number.isFinite(expiry) ||
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== date ||
    expiry <= now ||
    expiry > now + 90 * 24 * 60 * 60 * 1000
  ) {
    throw new Error(
      "Invalid phonemeRetention: retainUntil must be in the next 90 days."
    );
  }
  return Object.freeze({
    granted: true,
    purpose: v.purpose.trim(),
    retainUntil: v.retainUntil,
  });
}

export type ResearchPhonemes = {
  correlationId: string;
  timestamp: string;
  provider: string;
  modelId: string;
  levels: Array<{
    tokens: string[];
    tokenPosteriors: number[];
    meanPosterior: number;
  }>;
  purpose: string;
  retainUntil: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Copy the read contract only, so unexpected service fields cannot enter exports. */
function parseRead(
  value: unknown,
  correlationId: string
): ResearchPhonemes | null {
  const v = record(value);
  if (
    !v ||
    v.correlationId !== correlationId ||
    ![v.timestamp, v.provider, v.modelId, v.purpose, v.retainUntil].every(
      x => typeof x === "string"
    ) ||
    !Number.isFinite(Date.parse(v.timestamp as string)) ||
    !Number.isFinite(Date.parse(v.retainUntil as string)) ||
    Date.parse(v.retainUntil as string) <= Date.now() ||
    !Array.isArray(v.levels)
  )
    return null;
  const levels: ResearchPhonemes["levels"] = [];
  for (const raw of v.levels) {
    const level = record(raw);
    if (
      !level ||
      !Array.isArray(level.tokens) ||
      !level.tokens.every(x => typeof x === "string") ||
      !Array.isArray(level.tokenPosteriors) ||
      !level.tokenPosteriors.every(
        x => typeof x === "number" && Number.isFinite(x)
      ) ||
      typeof level.meanPosterior !== "number" ||
      !Number.isFinite(level.meanPosterior)
    )
      return null;
    levels.push({
      tokens: [...level.tokens],
      tokenPosteriors: [...level.tokenPosteriors],
      meanPosterior: level.meanPosterior,
    });
  }
  return {
    correlationId,
    timestamp: v.timestamp as string,
    provider: v.provider as string,
    modelId: v.modelId as string,
    levels,
    purpose: v.purpose as string,
    retainUntil: v.retainUntil as string,
  };
}

/**
 * Runtime HTTP join shared by staff HTTP and offline exports. Gate off, missing
 * configuration, 404, expired data, or service failures leave rows unchanged.
 * The researchPhonemes key is absent when retained data is unavailable.
 */
export async function joinResearchPhonemes(
  exported: ValidationAttemptExport,
  env: NodeJS.ProcessEnv = process.env,
  deps: { fetch: typeof fetch } = { fetch }
): Promise<ValidationAttemptExport> {
  const base = env.QURAN_EVALUATOR_URL?.trim().replace(/\/+$/, "");
  const key = env.QURAN_EVALUATOR_API_KEY?.trim();
  if (env.QURAN_VALIDATION_STAFF_API !== "1" || !base || !key) return exported;
  const retained = new Map<string, ResearchPhonemes | null>();
  const attempts = [];
  for (const row of exported.attempts) {
    const id = row.correlationId;
    if (id && !retained.has(id)) {
      let data: ResearchPhonemes | null = null;
      try {
        const response = await deps.fetch(
          `${base}/v1/research/phonemes/${encodeURIComponent(id)}`,
          {
            method: "GET",
            headers: {
              authorization: `Bearer ${key}`,
              accept: "application/json",
            },
            signal: AbortSignal.timeout(5_000),
          }
        );
        if (response.ok) data = parseRead(await response.json(), id);
      } catch {
        // Export remains usable before the service PR is deployed or during outages.
      }
      retained.set(id, data);
    }
    const data = id ? retained.get(id) : null;
    attempts.push(data ? { ...row, researchPhonemes: data } : row);
  }
  return { ...exported, attempts };
}
