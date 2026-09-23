import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/contexts/LocaleContext";
import {
  default as ValidationLauncher,
  classifyMicrophonePreflight,
  validationReadiness,
  type LauncherHealth,
  type LauncherPreflight,
} from "./ValidationLauncher";

const readyHealth: LauncherHealth = {
  status: "degraded",
  config: { valid: true, errors: 0, warnings: 0 },
  checks: [
    { name: "database", status: "down", critical: true },
    { name: "transcription", status: "configured", critical: false },
    { name: "acousticEvaluator", status: "up", critical: false },
  ],
};

const readyPreflight: LauncherPreflight = {
  staffApi: true,
  serverMode: "single-instance",
  transcription: { status: "ready", model: "gpt-transcribe" },
  evaluator: {
    status: "ready",
    shadowReady: true,
    modelId: "obadx/muaalem-model-v3_2",
  },
};

describe("validation launcher readiness", () => {
  it("presents the guarded staff workflow before any run can start", () => {
    const markup = renderToStaticMarkup(
      createElement(LocaleProvider, null, createElement(ValidationLauncher))
    );
    expect(markup).toContain("Quran recitation validation launcher");
    expect(markup).toContain("Single-instance local server only");
    expect(markup).toContain("Test microphone");
    expect(markup).toContain("Create validation run");
    expect(markup).toContain("disabled");
  });

  it("requires real encoded audio and voice energy", () => {
    expect(classifyMicrophonePreflight(0, 0)).toMatchObject({
      passed: false,
      reason: "no-audio-data",
    });
    expect(classifyMicrophonePreflight(4_000, 0.001)).toMatchObject({
      passed: false,
      reason: "signal-too-quiet",
    });
    expect(classifyMicrophonePreflight(4_000, 0.03)).toMatchObject({
      passed: true,
      reason: "ok",
    });
  });

  it("blocks a run until transcription, Muaalem, config, and microphone pass", () => {
    expect(validationReadiness(null, null, null).ready).toBe(false);
    expect(
      validationReadiness(
        readyHealth,
        readyPreflight,
        classifyMicrophonePreflight(4_000, 0.03)
      )
    ).toEqual({
      ready: true,
      blockers: [],
    });
  });

  it("reports each missing recitation dependency but does not block on the database", () => {
    const health: LauncherHealth = {
      ...readyHealth,
      config: { valid: false, errors: 1, warnings: 0 },
    };
    const preflight: LauncherPreflight = {
      ...readyPreflight,
      transcription: { status: "unauthorized", model: "gpt-transcribe" },
      evaluator: { status: "not_ready", shadowReady: false, modelId: null },
    };
    const result = validationReadiness(
      health,
      preflight,
      classifyMicrophonePreflight(4_000, 0.03)
    );
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual([
      "Local server configuration is invalid.",
      "Transcription preflight: unauthorized.",
      "Muaalem preflight: not_ready.",
    ]);
    expect(result.blockers.join(" ")).not.toContain("Database");
  });
});
