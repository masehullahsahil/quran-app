export type ShadowWorkerHealth = {
  status: "not_configured" | "ready" | "unavailable";
  modelId: string | null;
};

type FetchLike = typeof fetch;

function boundedString(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximumLength ? trimmed : null;
}

export function deriveShadowHealthUrl(shadowUrl: string | undefined) {
  if (!shadowUrl) return undefined;
  try {
    return new URL("/health", shadowUrl).toString();
  } catch {
    return undefined;
  }
}

export async function probeShadowWorker(
  healthUrl: string | undefined,
  apiKey?: string,
  timeoutMs = 3_000,
  fetchImpl: FetchLike = fetch
): Promise<ShadowWorkerHealth> {
  if (!healthUrl) return { status: "not_configured", modelId: null };
  try {
    const response = await fetchImpl(healthUrl, {
      headers: {
        accept: "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(Math.min(Math.max(timeoutMs, 500), 5_000)),
    });
    if (!response.ok) return { status: "unavailable", modelId: null };
    const value = (await response.json()) as Record<string, unknown>;
    const modelId = boundedString(value.shadowModelId, 160);
    if (value.shadowReady !== true || !modelId)
      return { status: "unavailable", modelId: null };
    return { status: "ready", modelId };
  } catch {
    return { status: "unavailable", modelId: null };
  }
}
