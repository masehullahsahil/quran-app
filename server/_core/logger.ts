/**
 * Lightweight structured server logging.
 *
 * Emits one JSON object per line to stdout (stderr for errors) so log
 * aggregators can parse fields without a logging platform or extra
 * dependency. Every entry carries: timestamp, severity, subsystem, and a
 * human-readable message. Request-scoped entries should also carry the
 * request/correlation ID produced by `requestIdMiddleware`, plus the
 * operation being performed and a safe status/result.
 *
 * NEVER log: audio recordings, transcripts, auth tokens, passwords, secrets,
 * connection strings, cookies, raw request bodies, or unnecessary personal
 * data. Pass only the safe metadata a field needs — if a value could be
 * sensitive, leave it out or reduce it to a presence boolean/count.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = {
  /** Severity. Defaults to "info". */
  level?: LogLevel;
  /** Area of the server emitting the log, e.g. "health", "trpc", "auth". */
  subsystem: string;
  /** What was being done, e.g. "system.health", "database.ping". */
  operation?: string;
  /** Correlation ID from `x-request-id`, so a browser error can be traced. */
  requestId?: string;
  /** Safe outcome, e.g. "ok", "degraded", "rejected", "timeout". */
  status?: string;
  /** Machine-readable error bucket, e.g. "UNAUTHORIZED", "TIMEOUT". */
  errorCategory?: string;
  /** Human-readable, safe message. No secrets, no PII, no payloads. */
  message: string;
  /** Optional extra safe metadata. Values must be non-sensitive. */
  details?: Record<string, unknown>;
};

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && (LEVELS as string[]).includes(value);
}

/**
 * Minimum level read from `LOG_LEVEL` (default "debug": emit everything and
 * let the platform filter). Unknown values fall back to "debug" rather than
 * silently dropping logs.
 */
export function minLogLevel(env: NodeJS.ProcessEnv = process.env): LogLevel {
  const raw = env.LOG_LEVEL?.toLowerCase();
  return isLogLevel(raw) ? raw : "debug";
}

function shouldEmit(level: LogLevel, env: NodeJS.ProcessEnv = process.env): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(minLogLevel(env));
}

function writeLine(level: LogLevel, line: string): void {
  // Errors go to stderr so platforms can route/alert on them separately.
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export function log(fields: LogFields, env: NodeJS.ProcessEnv = process.env): void {
  const level = fields.level ?? "info";
  if (!shouldEmit(level, env)) return;
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    subsystem: fields.subsystem,
    message: fields.message,
  };
  if (fields.operation !== undefined) entry.operation = fields.operation;
  if (fields.requestId !== undefined) entry.requestId = fields.requestId;
  if (fields.status !== undefined) entry.status = fields.status;
  if (fields.errorCategory !== undefined) entry.errorCategory = fields.errorCategory;
  if (fields.details !== undefined) entry.details = fields.details;
  writeLine(level, JSON.stringify(entry));
}

/** Convenience wrappers so call sites read naturally: logger.info({...}). */
export const logger = {
  debug: (fields: Omit<LogFields, "level">, env?: NodeJS.ProcessEnv) =>
    log({ ...fields, level: "debug" }, env),
  info: (fields: Omit<LogFields, "level">, env?: NodeJS.ProcessEnv) =>
    log({ ...fields, level: "info" }, env),
  warn: (fields: Omit<LogFields, "level">, env?: NodeJS.ProcessEnv) =>
    log({ ...fields, level: "warn" }, env),
  error: (fields: Omit<LogFields, "level">, env?: NodeJS.ProcessEnv) =>
    log({ ...fields, level: "error" }, env),
};
