import { describe, expect, it } from "vitest";
import { isAuthorizedBearer } from "./auth";

describe("isAuthorizedBearer", () => {
  it("allows isolated deployments without an API key", () => {
    expect(isAuthorizedBearer(undefined, undefined)).toBe(true);
  });

  it("accepts only the exact configured bearer value", () => {
    expect(isAuthorizedBearer("Bearer private-key", "private-key")).toBe(true);
    expect(isAuthorizedBearer("Bearer wrong-key", "private-key")).toBe(false);
    expect(isAuthorizedBearer("private-key", "private-key")).toBe(false);
    expect(isAuthorizedBearer(undefined, "private-key")).toBe(false);
  });
});
