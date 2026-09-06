import { describe, expect, it } from "vitest";
import { getAnalyticsConfig } from "./analyticsConfig";

describe("getAnalyticsConfig", () => {
  it("disables analytics when either production env var is absent", () => {
    expect(getAnalyticsConfig({})).toBeNull();
    expect(getAnalyticsConfig({ VITE_ANALYTICS_ENDPOINT: "https://analytics.example.com" })).toBeNull();
    expect(getAnalyticsConfig({ VITE_ANALYTICS_WEBSITE_ID: "site-id" })).toBeNull();
  });

  it("disables analytics for blank env values", () => {
    expect(
      getAnalyticsConfig({
        VITE_ANALYTICS_ENDPOINT: "  ",
        VITE_ANALYTICS_WEBSITE_ID: "site-id",
      }),
    ).toBeNull();
  });

  it("normalizes the configured endpoint before script injection", () => {
    expect(
      getAnalyticsConfig({
        VITE_ANALYTICS_ENDPOINT: " https://analytics.example.com/ ",
        VITE_ANALYTICS_WEBSITE_ID: " site-id ",
      }),
    ).toEqual({
      endpoint: "https://analytics.example.com",
      websiteId: "site-id",
    });
  });
});

