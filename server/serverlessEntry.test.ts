/**
 * Guards the two properties that make the app deployable as a serverless
 * function. Both are easy to break by adding an innocuous import, and neither
 * fails locally — `pnpm dev` would keep working while the deploy broke.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf-8");

/**
 * Comments in these files legitimately discuss listeners and the dev server, so
 * the assertions below look at code only — otherwise they fail on their own
 * explanations.
 */
const code = (file: string) => read(file)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the serverless entry", () => {
  it("exports the app rather than listening on a port", async () => {
    const source = code("api/index.ts");
    expect(source).toMatch(/export default createApp\(\)/);
    expect(source).not.toContain("listen(");
  });

  it("builds a real Express app", async () => {
    const handler = (await import("../api/index")).default;
    // An Express app is callable and carries the router methods we mount on it.
    expect(typeof handler).toBe("function");
    expect(typeof (handler as unknown as { use: unknown }).use).toBe("function");
  });

  // Importing ./vite would pull Vite — a devDependency — into the function
  // bundle, where it is dead weight at best and missing at worst.
  it("keeps the dev server out of the serverless import graph", () => {
    expect(code("server/_core/app.ts")).not.toMatch(/from "\.\/vite"/);
    expect(code("api/index.ts")).not.toMatch(/vite/i);
  });

  it("leaves the port scan and listener in the local entry only", () => {
    const local = code("server/_core/index.ts");
    expect(local).toContain("findAvailablePort");
    expect(local).toContain("server.listen");
    expect(code("server/_core/app.ts")).not.toContain("listen(");
  });
});

describe("vercel.json", () => {
  const config = JSON.parse(read("vercel.json"));

  it("serves the built client from the CDN, not through the function", () => {
    expect(config.outputDirectory).toBe("dist/public");
    expect(config.buildCommand).toBe("pnpm build:client");
  });

  it("routes every server path to the function", () => {
    const sources = config.rewrites.map((rule: { source: string }) => rule.source);
    expect(sources).toContain("/api/trpc/:path*");
    expect(sources).toContain("/api/oauth/:path*");
    expect(sources).toContain("/manus-storage/:path*");
  });

  it("falls back to the SPA without swallowing API paths", () => {
    const fallback = config.rewrites[config.rewrites.length - 1];
    expect(fallback.destination).toBe("/index.html");
    expect(fallback.source).toContain("?!api/");
  });

  // Hobby caps a function at 60s. The review path is two sequential calls —
  // Whisper then the coach summary — which land far inside that.
  it("stays within the Hobby plan's function duration limit", () => {
    expect(config.functions["api/index.ts"].maxDuration).toBeLessThanOrEqual(60);
  });
});
