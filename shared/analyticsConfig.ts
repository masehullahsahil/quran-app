export type AnalyticsEnv = {
  [key: string]: string | undefined;
  VITE_ANALYTICS_ENDPOINT?: string;
  VITE_ANALYTICS_WEBSITE_ID?: string;
};

export type AnalyticsConfig = {
  endpoint: string;
  websiteId: string;
};

function normalizeEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeEndpoint(value: string | undefined) {
  const endpoint = normalizeEnvValue(value);
  return endpoint ? endpoint.replace(/\/+$/, "") : null;
}

export function getAnalyticsConfig(env: AnalyticsEnv): AnalyticsConfig | null {
  const endpoint = normalizeEndpoint(env.VITE_ANALYTICS_ENDPOINT);
  const websiteId = normalizeEnvValue(env.VITE_ANALYTICS_WEBSITE_ID);

  if (!endpoint || !websiteId) {
    return null;
  }

  return { endpoint, websiteId };
}

