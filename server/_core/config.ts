/**
 * Deterministic production configuration validation.
 *
 * `validateConfig` is a pure function of the environment it is given, so it
 * is fully testable and behaves identically at startup, in the health
 * endpoint, and in CI. It classifies every known variable as required,
 * optional, or feature-specific, and reports missing/invalid configuration
 * WITHOUT printing any secret values — findings name the variable and the
 * problem only.
 *
 * Variable classes:
 * - required: the app cannot serve its signed-in production flows without them.
 * - optional: safe to omit; absence only disables a non-critical capability.
 * - feature-specific: required only when a particular feature is enabled
 *   (e.g. the Redis rate-limit store, the acoustic evaluator, analytics).
 */
export type ConfigSeverity = "error" | "warning";

export type ConfigFinding = {
  variable: string;
  severity: ConfigSeverity;
  /** What is wrong, in words. Never contains the variable's value. */
  message: string;
};

export type FeatureState = "enabled" | "disabled" | "misconfigured";

export type ConfigReport = {
  /** True when there are no error-severity findings. */
  valid: boolean;
  errors: ConfigFinding[];
  warnings: ConfigFinding[];
  /** Per-feature readiness derived from the variables, not from live probes. */
  features: Record<string, FeatureState>;
  checkedAt: string;
};

type Env = Record<string, string | undefined>;

const REQUIRED_VARIABLES = [
  "DATABASE_URL",
  "JWT_SECRET",
  "OAUTH_SERVER_URL",
  "VITE_OAUTH_PORTAL_URL",
  "VITE_APP_ID",
] as const;

/** Numeric knobs with their documented bounds; unparseable values warn. */
const NUMERIC_VARIABLES: Record<string, { min: number; max: number; fallback: string }> = {
  OPENAI_TRANSCRIPTION_TIMEOUT_MS: { min: 1000, max: 30000, fallback: "25000" },
  OPENAI_CHAT_TIMEOUT_MS: { min: 1000, max: 30000, fallback: "20000" },
  QURAN_EVALUATOR_TIMEOUT_MS: { min: 1000, max: 30000, fallback: "8000" },
};

const isBlank = (value: string | undefined): boolean =>
  value === undefined || value.trim() === "";

export function validateConfig(env: Env = process.env): ConfigReport {
  const errors: ConfigFinding[] = [];
  const warnings: ConfigFinding[] = [];

  for (const variable of REQUIRED_VARIABLES) {
    if (isBlank(env[variable])) {
      errors.push({
        variable,
        severity: "error",
        message: "required variable is missing or blank; the signed-in production flow cannot work without it",
      });
    }
  }

  for (const [variable, bounds] of Object.entries(NUMERIC_VARIABLES)) {
    const raw = env[variable];
    if (isBlank(raw)) continue; // unset means the documented default applies
    const parsed = Number.parseInt(raw as string, 10);
    if (!Number.isFinite(parsed) || parsed < bounds.min || parsed > bounds.max) {
      warnings.push({
        variable,
        severity: "warning",
        message: `value is not a number between ${bounds.min} and ${bounds.max}; the default (${bounds.fallback}) will be used instead`,
      });
    }
  }

  // Feature-specific: acoustic evaluator key without a URL is a misconfiguration.
  const evaluatorUrl = !isBlank(env.QURAN_EVALUATOR_URL);
  const evaluatorKey = !isBlank(env.QURAN_EVALUATOR_API_KEY);
  if (!evaluatorUrl && evaluatorKey) {
    warnings.push({
      variable: "QURAN_EVALUATOR_URL",
      severity: "warning",
      message: "QURAN_EVALUATOR_API_KEY is set but QURAN_EVALUATOR_URL is not; the acoustic evaluator stays disabled and the key is unused",
    });
  }

  // Feature-specific: the distributed rate-limit store needs both halves.
  const redisUrl = !isBlank(env.RECITATION_RATE_LIMIT_REDIS_REST_URL);
  const redisToken = !isBlank(env.RECITATION_RATE_LIMIT_REDIS_REST_TOKEN);
  if (redisUrl !== redisToken) {
    warnings.push({
      variable: "RECITATION_RATE_LIMIT_REDIS_REST_URL",
      severity: "warning",
      message: "distributed rate limiting needs both RECITATION_RATE_LIMIT_REDIS_REST_URL and RECITATION_RATE_LIMIT_REDIS_REST_TOKEN; with only one set the in-memory fallback is used",
    });
  }

  // Feature-specific: analytics needs both halves to emit anything.
  const analyticsEndpoint = !isBlank(env.VITE_ANALYTICS_ENDPOINT);
  const analyticsId = !isBlank(env.VITE_ANALYTICS_WEBSITE_ID);
  if (analyticsEndpoint !== analyticsId) {
    warnings.push({
      variable: "VITE_ANALYTICS_ENDPOINT",
      severity: "warning",
      message: "analytics needs both VITE_ANALYTICS_ENDPOINT and VITE_ANALYTICS_WEBSITE_ID; with only one set no analytics script is emitted",
    });
  }

  const features: Record<string, FeatureState> = {
    // Core production flows.
    persistence: isBlank(env.DATABASE_URL) ? "disabled" : "enabled",
    authentication: isBlank(env.JWT_SECRET) || isBlank(env.OAUTH_SERVER_URL) ? "disabled" : "enabled",
    // Optional capabilities.
    transcription: isBlank(env.OPENAI_API_KEY) ? "disabled" : "enabled",
    acousticEvaluation: evaluatorUrl ? "enabled" : "disabled",
    distributedRateLimit: redisUrl && redisToken ? "enabled" : redisUrl !== redisToken ? "misconfigured" : "disabled",
    analytics: analyticsEndpoint && analyticsId ? "enabled" : "disabled",
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    features,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Human-readable one-line summary for startup logs. Lists variable names
 * and finding counts only — never values.
 */
export function summarizeConfigReport(report: ConfigReport): string {
  const parts = [`valid=${report.valid}`, `errors=${report.errors.length}`, `warnings=${report.warnings.length}`];
  if (report.errors.length > 0) {
    parts.push(`missing=[${report.errors.map((f) => f.variable).join(",")}]`);
  }
  return `config ${parts.join(" ")}`;
}
