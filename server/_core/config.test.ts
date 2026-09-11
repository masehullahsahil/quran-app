/**
 * Tests for deterministic environment configuration validation.
 * Pure function of the input env record — no process.env dependence.
 */
import { describe, expect, it } from "vitest";
import { summarizeConfigReport, validateConfig } from "./config";

const FULL_ENV = {
  DATABASE_URL: "mysql://example/db",
  JWT_SECRET: "secret",
  OAUTH_SERVER_URL: "https://auth.example",
  VITE_OAUTH_PORTAL_URL: "https://portal.example",
  VITE_APP_ID: "app-id",
  OPENAI_API_KEY: "key",
  QURAN_EVALUATOR_URL: "https://evaluator.example",
  RECITATION_RATE_LIMIT_REDIS_REST_URL: "https://redis.example",
  RECITATION_RATE_LIMIT_REDIS_REST_TOKEN: "token",
  VITE_ANALYTICS_ENDPOINT: "https://analytics.example",
  VITE_ANALYTICS_WEBSITE_ID: "site",
};

describe("validateConfig", () => {
  it("passes a fully configured environment", () => {
    const report = validateConfig({ ...FULL_ENV });
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
    expect(report.features.persistence).toBe("enabled");
    expect(report.features.authentication).toBe("enabled");
    expect(report.features.transcription).toBe("enabled");
    expect(report.features.acousticEvaluation).toBe("enabled");
    expect(report.features.distributedRateLimit).toBe("enabled");
    expect(report.features.analytics).toBe("enabled");
  });

  it("reports each missing required variable as an error", () => {
    const report = validateConfig({});
    expect(report.valid).toBe(false);
    const missing = report.errors.map((finding) => finding.variable).sort();
    expect(missing).toEqual(
      ["DATABASE_URL", "JWT_SECRET", "OAUTH_SERVER_URL", "VITE_APP_ID", "VITE_OAUTH_PORTAL_URL"].sort()
    );
    for (const finding of report.errors) {
      expect(finding.severity).toBe("error");
    }
  });

  it("treats blank required variables as missing", () => {
    const report = validateConfig({ ...FULL_ENV, DATABASE_URL: "   " });
    expect(report.valid).toBe(false);
    expect(report.errors.map((f) => f.variable)).toContain("DATABASE_URL");
  });

  it("never includes secret values in findings or summaries", () => {
    const secret = "super-secret-value-9f8e7d6c5b";
    const report = validateConfig({ DATABASE_URL: secret });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(secret);
    // DATABASE_URL is set (to the secret), so it must not appear as missing;
    // the other required variables do, and the secret value appears nowhere.
    expect(report.errors.map((f) => f.variable)).not.toContain("DATABASE_URL");
    expect(summarizeConfigReport(report)).not.toContain(secret);
    expect(summarizeConfigReport(report)).toContain("JWT_SECRET");
  });

  it("warns on out-of-range numeric knobs without failing validation", () => {
    const report = validateConfig({ ...FULL_ENV, OPENAI_TRANSCRIPTION_TIMEOUT_MS: "not-a-number" });
    expect(report.valid).toBe(true);
    expect(report.warnings.map((f) => f.variable)).toContain("OPENAI_TRANSCRIPTION_TIMEOUT_MS");
  });

  it("warns when only half of a feature pair is configured", () => {
    const redis = validateConfig({
      ...FULL_ENV,
      RECITATION_RATE_LIMIT_REDIS_REST_TOKEN: "",
    });
    expect(redis.warnings.length).toBeGreaterThan(0);
    expect(redis.features.distributedRateLimit).toBe("misconfigured");

    const evaluator = validateConfig({
      ...FULL_ENV,
      QURAN_EVALUATOR_URL: "",
      QURAN_EVALUATOR_API_KEY: "key",
    });
    expect(evaluator.features.acousticEvaluation).toBe("disabled");
    expect(evaluator.warnings.map((f) => f.variable)).toContain("QURAN_EVALUATOR_URL");
  });

  it("marks optional features disabled when unset, without errors", () => {
    const { OPENAI_API_KEY: _drop, ...minimal } = FULL_ENV;
    const report = validateConfig(minimal);
    expect(report.valid).toBe(true);
    expect(report.features.transcription).toBe("disabled");
  });

  it("is deterministic for the same input", () => {
    const a = validateConfig({ ...FULL_ENV });
    const b = validateConfig({ ...FULL_ENV });
    expect({ ...a, checkedAt: "x" }).toEqual({ ...b, checkedAt: "x" });
  });
});
