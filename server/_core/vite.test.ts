/**
 * @vitest-environment node
 *
 * The dev server actually serving the app's entry module.
 *
 * This guards one specific, silent failure. `client/index.html` asks the
 * browser for `/src/main.tsx`. If Vite's middleware does not recognise that
 * path — because it is rooted somewhere other than `client/` — the request
 * falls through to the HTML catch-all below it, which answers **every**
 * unmatched path with `index.html` and `Content-Type: text/html`.
 *
 * Nothing errors. The server starts, the API answers, the port is right. The
 * browser then refuses the entry module:
 *
 *     Failed to load module script: Expected a JavaScript-or-Wasm module
 *     script but the server responded with a MIME type of "text/html".
 *
 * and the page is blank with no server-side trace of why. The catch-all is
 * doing exactly what it was written to do; the fault is upstream, and the only
 * honest way to detect it is to ask the running dev server for the entry module
 * and look at what comes back.
 *
 * So this boots the real `setupVite` against the real `vite.config.ts` and
 * requests the real path the browser requests. It is slower than a unit test
 * and it is the only thing that would have caught this.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupVite } from "./vite";

let origin = "";
let close: (() => Promise<void>) | null = null;

/**
 * One dev server for the whole file, on a real port, wired exactly as
 * `pnpm dev` wires it: Vite's middleware first, then the HTML catch-all.
 * Every assertion here is a read, so they can share it — and booting Vite is
 * most of what this file costs.
 */
beforeAll(async () => {
  const app = express();
  const server = http.createServer(app);
  await setupVite(app, server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  origin = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
  await close?.();
  close = null;
});

describe("the local dev server", () => {
  it("serves the entry module as JavaScript, not as the HTML fallback", async () => {
    const response = await fetch(`${origin}/src/main.tsx`);
    const contentType = response.headers.get("content-type") ?? "";

    // The exact failure: the browser asked for a module and got a page.
    expect(contentType).not.toMatch(/text\/html/);
    expect(contentType).toMatch(/javascript/);
    expect(response.status).toBe(200);

    // And it is the transformed module, not something that merely has the
    // right header on it.
    const body = await response.text();
    expect(body).not.toMatch(/^\s*<!doctype html/i);
    expect(body).toContain("import");
  });

  it("still answers an unknown path with the HTML shell", async () => {
    const response = await fetch(`${origin}/some/deep/route`);

    // The catch-all is correct and stays: a single-page app needs it. What
    // must not happen is a real module falling into it.
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(await response.text()).toMatch(/<div id="root">/);
  });

  it("resolves the aliases the entry module imports through", async () => {
    const body = await (await fetch(`${origin}/src/main.tsx`)).text();

    // `main.tsx` opens with `@/lib/trpc` and `@shared/const`. Vite rewrites
    // those to real paths only if the aliases survived; without them the module
    // either fails to resolve or arrives untransformed. Both aliases point
    // outside `client/src`, so the rewritten specifiers are recognisable.
    expect(body).not.toContain('from "@/lib/trpc"');
    expect(body).toMatch(/\/(client\/src|src)\/lib\/trpc/);
    expect(body).toMatch(/\/shared\/const/);
  });

  it("serves the public directory the client actually uses", async () => {
    // `publicDir` is `client/public`. Rooted anywhere else, this is a 404 or —
    // worse, and the bug this file exists for — the HTML shell with a 200.
    const response = await fetch(`${origin}/brand/quran-learning-logo-refined.png`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/image\/png/);
  }, 30_000);

  it("runs the plugins the served modules depend on", async () => {
    const body = await (await fetch(`${origin}/src/main.tsx`)).text();

    // `main.tsx` renders `<QueryClientProvider>`. If the React plugin were
    // missing — the same lost configuration, one symptom further on — the JSX
    // would arrive at the browser untransformed and unparseable.
    expect(body).not.toContain("<QueryClientProvider");
    expect(body).toMatch(/jsxDEV|_jsx\(/);
  });
});
