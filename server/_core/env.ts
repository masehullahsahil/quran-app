export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Direct OpenAI access, used by _core/llm.ts and _core/voiceTranscription.ts.
  // Only the key has to be set; the base URL is overridable so the same code
  // can point at an OpenAI-compatible gateway or a local test double.
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  // Quran.com content API. Public and key-free; the base URL is overridable so
  // the reader can be pointed at a mirror or a local fixture server when
  // api.quran.com is unreachable (restricted networks, offline development).
  quranApiBaseUrl: process.env.QURAN_API_BASE_URL ?? "https://api.quran.com/api/v4",
  // Optional Quran-aware acoustic evaluator. This is a separately deployed
  // service because specialised speech models exceed the app host's resources.
  // Keep its credentials server-only: neither value may use a VITE_ prefix.
  quranEvaluatorUrl: process.env.QURAN_EVALUATOR_URL ?? "",
  quranEvaluatorApiKey: process.env.QURAN_EVALUATOR_API_KEY ?? "",
  quranEvaluatorTimeoutMs: Number.parseInt(process.env.QURAN_EVALUATOR_TIMEOUT_MS ?? "8000", 10) || 8000,
};
