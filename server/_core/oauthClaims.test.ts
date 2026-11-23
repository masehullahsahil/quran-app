import { describe, expect, it } from "vitest";
import { validateGoogleIdTokenClaims } from "./oauth";

const CLIENT_ID = "client-123.apps.googleusercontent.com";
const NOW = 1_800_000_000_000;
const nowSeconds = NOW / 1000;

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "1234567890",
    email: "learner@example.com",
    email_verified: true,
    name: "Learner",
    iat: nowSeconds - 10,
    exp: nowSeconds + 3600,
    ...overrides,
  };
}

describe("validateGoogleIdTokenClaims", () => {
  it("accepts a valid Google ID token for this client", () => {
    expect(validateGoogleIdTokenClaims(claims(), CLIENT_ID, NOW)).toEqual({
      sub: "1234567890",
      email: "learner@example.com",
      name: "Learner",
    });
  });

  it("accepts the legacy issuer spelling", () => {
    expect(validateGoogleIdTokenClaims(claims({ iss: "accounts.google.com" }), CLIENT_ID, NOW)).not.toBeNull();
  });

  it.each([
    ["a foreign issuer", { iss: "https://evil.example" }],
    ["a token minted for another client", { aud: "someone-else" }],
    ["an expired token", { exp: nowSeconds - 3600 }],
    ["a token issued in the future", { iat: nowSeconds + 3600 }],
    ["a missing subject", { sub: "" }],
    ["a missing expiry", { exp: undefined }],
    ["a multi-audience token not authorised to this client", { aud: [CLIENT_ID, "other"], azp: "other" }],
  ])("rejects %s", (_label, overrides) => {
    expect(validateGoogleIdTokenClaims(claims(overrides), CLIENT_ID, NOW)).toBeNull();
  });

  it("drops an email Google has not verified", () => {
    expect(validateGoogleIdTokenClaims(claims({ email_verified: false }), CLIENT_ID, NOW)?.email).toBeNull();
  });

  it("rejects everything when the client ID is not configured", () => {
    expect(validateGoogleIdTokenClaims(claims(), "", NOW)).toBeNull();
  });
});
