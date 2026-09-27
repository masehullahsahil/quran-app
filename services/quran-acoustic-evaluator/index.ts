import { createApp } from "./app";
import {
  AbstainingPhonemeEvaluator,
  AlignedPhonemeEvaluator,
  HttpPhonemeClassifier,
} from "./phoneme";
import {
  AbstainingAcousticShadowEvaluator,
  HttpAcousticShadowEvaluator,
} from "./shadow";
import { deriveShadowHealthUrl, probeShadowWorker } from "./serviceHealth";
import {
  ResearchPhonemeStore,
  researchEnvGateEnabled,
} from "./researchRetention";

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

const researchStore = ResearchPhonemeStore.fromEnv();

const app = createApp({
  phonemes,
  shadow,
  apiKey: process.env.QURAN_EVALUATOR_API_KEY,
  probeHealth: () =>
    probeShadowWorker(
      process.env.QURAN_ACOUSTIC_SHADOW_HEALTH_URL ??
        deriveShadowHealthUrl(process.env.QURAN_ACOUSTIC_SHADOW_URL),
      process.env.QURAN_ACOUSTIC_SHADOW_API_KEY
    ),
  research: { envEnabled: researchEnvGateEnabled(), store: researchStore },
});

const port = Number(process.env.PORT || 4317);
// Expired research records are purged on every startup, whether or not the
// env gate is currently on, so turning the gate off never extends retention.
researchStore
  .purgeExpired()
  .catch(() => 0)
  .then(purged => {
    if (purged)
      console.info(
        JSON.stringify({ event: "quran_research_purge", purged })
      );
    app.listen(port, () =>
      console.info(`[quran-acoustic] listening on http://localhost:${port}`)
    );
  });
