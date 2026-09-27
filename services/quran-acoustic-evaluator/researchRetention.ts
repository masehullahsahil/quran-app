import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeCorrelationId } from "./shadow";

/**
 * Consent-gated research retention of decoded shadow phonemes.
 *
 * This is a narrow exception to the shadow pipeline's redaction rule: it only
 * activates when BOTH the operator env gate is set AND the request carries a
 * valid, explicit research consent. Otherwise nothing here runs and the
 * evaluator's default redacted behavior is unchanged.
 *
 * Records hold decoded model tokens and raw greedy CTC posteriors only. They
 * NEVER hold audio, transcripts, Quran text, learner identity, or credentials,
 * and they are never written to logs or returned from /v1/evaluate.
 */

export const RESEARCH_ENV_GATE = "QURAN_RESEARCH_PHONEME_RETENTION";
export const RESEARCH_DIR_ENV = "QURAN_RESEARCH_PHONEME_DIR";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_RETENTION_DAYS = 30;
export const MAX_RETENTION_DAYS = 90;
const MAX_PURPOSE_LENGTH = 500;
const MAX_LEVELS = 16;
const MAX_TOKENS_PER_LEVEL = 4096;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[0-9:.]+(Z|[+-]\d{2}:\d{2})?)?$/;

export type ResearchConsent = {
  granted: boolean;
  purpose: string;
  retainUntil: string;
};

export type ResearchLevel = {
  /** Model output level name (e.g. "phonemes"), so levels can be told apart. */
  level: string;
  tokens: string[];
  /** Raw greedy CTC posteriors, parallel to tokens. Not correctness scores. */
  tokenPosteriors: number[];
  meanPosterior: number;
};

export type ResearchRecord = {
  correlationId: string;
  timestamp: string;
  provider: string;
  modelId: string;
  levels: ResearchLevel[];
  purpose: string;
  retainUntil: string;
};

export type ResearchRetention = {
  correlationId: string;
  purpose: string;
  retainUntil: string;
};

export function researchEnvGateEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return env[RESEARCH_ENV_GATE] === "1";
}

/**
 * Resolve whether retention is active for one request. Returns null (the
 * redacted default) unless the env gate is on, the correlation ID is safe,
 * and consent is valid: granted === true, a non-empty purpose, and a
 * retainUntil that is either omitted/unparseable (defaulting to 30 days) or a
 * future ISO date no more than 90 days out. An explicit retainUntil in the
 * past or beyond the 90-day cap invalidates consent rather than being clamped.
 */
export function resolveResearchRetention(
  consent: unknown,
  context: {
    envEnabled: boolean;
    correlationId: string | null | undefined;
    now?: Date;
  }
): ResearchRetention | null {
  if (!context.envEnabled) return null;
  const correlationId = safeCorrelationId(context.correlationId);
  if (!correlationId) return null;
  if (!consent || typeof consent !== "object" || Array.isArray(consent))
    return null;
  const { granted, purpose, retainUntil } = consent as Record<string, unknown>;
  if (granted !== true) return null;
  if (typeof purpose !== "string") return null;
  const trimmedPurpose = purpose.trim();
  if (!trimmedPurpose || trimmedPurpose.length > MAX_PURPOSE_LENGTH)
    return null;

  const now = (context.now ?? new Date()).getTime();
  const cap = now + MAX_RETENTION_DAYS * DAY_MS;
  let until = now + DEFAULT_RETENTION_DAYS * DAY_MS;
  const parsed =
    typeof retainUntil === "string" && ISO_DATE.test(retainUntil.trim())
      ? Date.parse(retainUntil.trim())
      : Number.NaN;
  if (Number.isFinite(parsed)) {
    if (parsed <= now || parsed > cap) return null;
    until = parsed;
  }
  return {
    correlationId,
    purpose: trimmedPurpose,
    retainUntil: new Date(until).toISOString(),
  };
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPosterior(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

/**
 * Extract per-level decoded tokens and their parallel posteriors from a shadow
 * worker response. Returns null when the payload is not a well-formed
 * available analysis; research capture is then skipped entirely.
 */
export function parseResearchLevels(
  value: unknown
): { provider: string; modelId: string; levels: ResearchLevel[] } | null {
  if (!isRecord(value) || value.status !== "available") return null;
  const provider =
    typeof value.provider === "string" ? value.provider.trim() : "";
  const modelId = typeof value.modelId === "string" ? value.modelId.trim() : "";
  if (!provider || provider.length > 80 || !modelId || modelId.length > 160)
    return null;
  if (!isRecord(value.levels)) return null;
  const entries = Object.entries(value.levels);
  if (!entries.length || entries.length > MAX_LEVELS) return null;
  const levels: ResearchLevel[] = [];
  for (const [level, result] of entries) {
    if (!level || level.length > 80 || !isRecord(result)) return null;
    const { tokens, tokenPosteriors, meanPosterior } = result;
    if (
      !Array.isArray(tokens) ||
      tokens.length > MAX_TOKENS_PER_LEVEL ||
      tokens.some(token => typeof token !== "string" || token.length > 32)
    )
      return null;
    if (
      !Array.isArray(tokenPosteriors) ||
      tokenPosteriors.length !== tokens.length ||
      !tokenPosteriors.every(isPosterior)
    )
      return null;
    if (!isPosterior(meanPosterior)) return null;
    levels.push({
      level,
      tokens: tokens as string[],
      tokenPosteriors: tokenPosteriors as number[],
      meanPosterior,
    });
  }
  return { provider, modelId, levels };
}

function isResearchRecord(value: unknown): value is ResearchRecord {
  return (
    isRecord(value) &&
    typeof value.correlationId === "string" &&
    typeof value.timestamp === "string" &&
    typeof value.provider === "string" &&
    typeof value.modelId === "string" &&
    Array.isArray(value.levels) &&
    typeof value.purpose === "string" &&
    typeof value.retainUntil === "string"
  );
}

function isExpired(record: ResearchRecord, now: Date) {
  const until = Date.parse(record.retainUntil);
  return !Number.isFinite(until) || until <= now.getTime();
}

/**
 * Separate on-disk store: one JSON file per correlation ID under its own
 * directory, never mixed with logs. File names are the validated correlation
 * ID only, so no path traversal is possible.
 */
export class ResearchPhonemeStore {
  constructor(readonly directory: string) {}

  static fromEnv(env: Record<string, string | undefined> = process.env) {
    return new ResearchPhonemeStore(
      path.resolve(env[RESEARCH_DIR_ENV] || path.join(process.cwd(), "research"))
    );
  }

  private fileFor(correlationId: unknown) {
    const id = safeCorrelationId(correlationId);
    if (!id) throw new Error("invalid_correlation_id");
    return path.join(this.directory, `${id}.json`);
  }

  async write(record: ResearchRecord): Promise<void> {
    const file = this.fileFor(record.correlationId);
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(
      this.directory,
      `.${record.correlationId}.${randomUUID()}.tmp`
    );
    await fs.writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await fs.rename(temporary, file);
  }

  /** Returns the record, or null when absent, malformed, or expired. */
  async read(
    correlationId: unknown,
    now: Date = new Date()
  ): Promise<ResearchRecord | null> {
    const file = this.fileFor(correlationId);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return null;
    }
    if (!isResearchRecord(parsed)) return null;
    if (isExpired(parsed, now)) {
      await fs.rm(file, { force: true });
      return null;
    }
    return parsed;
  }

  /** Manual deletion by correlation ID. Returns whether a record existed. */
  async delete(correlationId: unknown): Promise<boolean> {
    const file = this.fileFor(correlationId);
    try {
      await fs.unlink(file);
      return true;
    } catch {
      return false;
    }
  }

  /** Manual deletion of every research record. Returns the count removed. */
  async deleteAll(): Promise<number> {
    const names = await this.listFiles();
    await Promise.all(
      names.map(name => fs.rm(path.join(this.directory, name), { force: true }))
    );
    return names.filter(name => name.endsWith(".json")).length;
  }

  /** Remove every record past its retainUntil (and any unreadable file). */
  async purgeExpired(now: Date = new Date()): Promise<number> {
    let purged = 0;
    for (const name of await this.listFiles()) {
      const file = path.join(this.directory, name);
      let expired = true;
      if (name.endsWith(".json")) {
        try {
          const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"));
          expired = !isResearchRecord(parsed) || isExpired(parsed, now);
        } catch {
          expired = true;
        }
      }
      if (expired) {
        await fs.rm(file, { force: true });
        if (name.endsWith(".json")) purged += 1;
      }
    }
    return purged;
  }

  private async listFiles(): Promise<string[]> {
    try {
      return (await fs.readdir(this.directory)).filter(
        name => name.endsWith(".json") || name.endsWith(".tmp")
      );
    } catch {
      return [];
    }
  }
}
