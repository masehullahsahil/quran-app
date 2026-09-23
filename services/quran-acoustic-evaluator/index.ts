import express from "express";
import { isAuthorizedBearer } from "./auth";
import { evaluate, type EvaluateInput } from "./evaluator";
import {
  AbstainingPhonemeEvaluator,
  AlignedPhonemeEvaluator,
  HttpPhonemeClassifier,
} from "./phoneme";
import {
  AbstainingAcousticShadowEvaluator,
  CORRELATION_HEADER,
  HttpAcousticShadowEvaluator,
  safeCorrelationId,
} from "./shadow";
import { deriveShadowHealthUrl, probeShadowWorker } from "./serviceHealth";
import { acousticEvaluationLogLine } from "./evaluationLog";

const phonemes = process.env.QURAN_PHONEME_CLASSIFIER_URL
  ? new AlignedPhonemeEvaluator(
      new HttpPhonemeClassifier(
        process.env.QURAN_PHONEME_CLASSIFIER_URL,
        process.env.QURAN_PHONEME_CLASSIFIER_API_KEY
      )
    )
  : new AbstainingPhonemeEvaluator();

const shadow = process.env.QURAN_ACOUSTIC_SHADOW_URL
  ? new HttpAcousticShadowEvaluator(
      process.env.QURAN_ACOUSTIC_SHADOW_URL,
      process.env.QURAN_ACOUSTIC_SHADOW_API_KEY,
      Number.parseInt(
        process.env.QURAN_ACOUSTIC_SHADOW_TIMEOUT_MS ?? "15000",
        10
      ) || 15_000
    )
  : new AbstainingAcousticShadowEvaluator();

const app = express();
app.use(express.json({ limit: "20mb" }));
app.get("/health", async (_req, res) => {
  const health = await probeShadowWorker(
    process.env.QURAN_ACOUSTIC_SHADOW_HEALTH_URL ??
      deriveShadowHealthUrl(process.env.QURAN_ACOUSTIC_SHADOW_URL),
    process.env.QURAN_ACOUSTIC_SHADOW_API_KEY
  );
  res.status(health.status === "ready" ? 200 : 503).json({
    status: health.status,
    shadowReady: health.status === "ready",
    shadowModelId: health.modelId,
  });
});
app.use((req, res, next) => {
  if (
    !isAuthorizedBearer(
      req.header("authorization"),
      process.env.QURAN_EVALUATOR_API_KEY
    )
  )
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
  const result = await evaluate(input as EvaluateInput, phonemes, shadow, {
    correlationId,
  });
  console.info(
    JSON.stringify(
      acousticEvaluationLogLine(result, {
        correlationId,
        requestDurationMs: Date.now() - started,
      })
    )
  );
  res.json(result);
});
const port = Number(process.env.PORT || 4317);
app.listen(port, () =>
  console.info(`[quran-acoustic] listening on http://localhost:${port}`)
);
