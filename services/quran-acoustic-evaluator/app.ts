import express from "express";
import { isAuthorizedBearer } from "./auth";
import { evaluate, type EvaluateInput } from "./evaluator";
import type { PhonemeEvaluator } from "./phoneme";
import {
  CORRELATION_HEADER,
  safeCorrelationId,
  type AcousticShadowEvaluator,
} from "./shadow";
import type { ShadowWorkerHealth } from "./serviceHealth";
import { acousticEvaluationLogLine } from "./evaluationLog";
import type { ResearchPhonemeStore } from "./researchRetention";

export type AppDependencies = {
  phonemes: PhonemeEvaluator;
  shadow: AcousticShadowEvaluator;
  apiKey: string | undefined;
  probeHealth: () => Promise<ShadowWorkerHealth>;
  research: {
    /** QURAN_RESEARCH_PHONEME_RETENTION=1 */
    envEnabled: boolean;
    store: ResearchPhonemeStore;
  };
  log?: (line: string) => void;
};

export function createApp(deps: AppDependencies) {
  const log = deps.log ?? ((line: string) => console.info(line));
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  app.get("/health", async (_req, res) => {
    const health = await deps.probeHealth();
    res.status(health.status === "ready" ? 200 : 503).json({
      status: health.status,
      shadowReady: health.status === "ready",
      shadowModelId: health.modelId,
    });
  });
  app.use((req, res, next) => {
    if (!isAuthorizedBearer(req.header("authorization"), deps.apiKey))
      return res.status(401).json({ error: "unauthorized" });
    next();
  });
  app.post("/v1/evaluate", async (req, res) => {
    const started = Date.now();
    const correlationId = safeCorrelationId(req.header(CORRELATION_HEADER));
    const input = req.body as Partial<EvaluateInput>;
    if (
      typeof input.audioBase64 !== "string" ||
      typeof input.mimeType !== "string" ||
      typeof input.expectedArabic !== "string" ||
      !Number.isInteger(input.surah) ||
      !Number.isInteger(input.ayah)
    )
      return res.status(400).json({ error: "invalid_request" });
    const result = await evaluate(
      input as EvaluateInput,
      deps.phonemes,
      deps.shadow,
      {
        correlationId,
        research: deps.research.envEnabled ? deps.research : null,
      }
    );
    log(
      JSON.stringify(
        acousticEvaluationLogLine(result, {
          correlationId,
          requestDurationMs: Date.now() - started,
        })
      )
    );
    res.json(result);
  });
  // Research read-back for the app-server export. Behind the bearer auth
  // above AND the env gate; indistinguishable from an unknown route when off.
  app.get("/v1/research/phonemes/:correlationId", async (req, res) => {
    if (!deps.research.envEnabled)
      return res.status(404).json({ error: "not_found" });
    const correlationId = safeCorrelationId(req.params.correlationId);
    if (!correlationId)
      return res.status(400).json({ error: "invalid_correlation_id" });
    const record = await deps.research.store.read(correlationId);
    if (!record) return res.status(404).json({ error: "not_found" });
    res.setHeader("cache-control", "no-store");
    res.json(record);
  });
  return app;
}
