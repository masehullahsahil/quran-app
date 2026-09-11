/**
 * Deterministic smoke test for the DEPLOYED application.
 *
 * Usage:
 *   SMOKE_BASE_URL=https://<your-app>.vercel.app pnpm smoke:deployed
 *
 * Verifies critical surfaces without altering any user data:
 *   - homepage/app shell loads (the Study/Learn experience lives at "/")
 *   - SPA fallback route loads (proves deployment routing works)
 *   - /api/health responds with a valid health report + correlation header
 *   - the read-only tRPC system.health query responds (proves /api/trpc routing)
 *   - a static Quran/curriculum asset resolves (proves CDN/static serving)
 *   - expected HTTP response codes throughout
 *
 * The script performs GET requests and one read-only public tRPC query only.
 * It NEVER submits learning progress, modifies user records, sends messages,
 * alters memorization history or curriculum state, or touches the database.
 *
 * Auth-dependent routes (OAuth callbacks, protected tRPC procedures) are
 * intentionally NOT tested: exercising them would require real credentials,
 * and this harness must not weaken authentication. See the report output.
 */
import process from "node:process";

const BASE_URL = (process.env.SMOKE_BASE_URL ?? "").replace(/\/+$/, "");
if (!BASE_URL) {
  console.error("SMOKE_BASE_URL is required, e.g. SMOKE_BASE_URL=https://<your-app>.vercel.app pnpm smoke:deployed");
  process.exit(2);
}
if (!/^https?:\/\//.test(BASE_URL)) {
  console.error(`SMOKE_BASE_URL must be an http(s) URL, got: ${BASE_URL}`);
  process.exit(2);
}

const TIMEOUT_MS = 20_000;
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

async function check(name, fn) {
  try {
    await fn();
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 1. Homepage / app shell (the Study/Learn experience lives at "/").
await check("homepage loads with app shell", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const html = await res.text();
  assert(html.includes('<div id="root"></div>'), "app shell root element missing");
  record("homepage loads with app shell", true, `HTTP ${res.status}`);
});

// 2. SPA fallback route (deployment routing, not a 404 or function error).
await check("client route resolves via SPA fallback", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/curriculum-audit`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const html = await res.text();
  assert(html.includes('<div id="root"></div>'), "SPA fallback did not serve the app shell");
  record("client route resolves via SPA fallback", true, `HTTP ${res.status}`);
});

// 3. Health endpoint: valid report, correlation header, no leak markers.
await check("health endpoint responds", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/api/health`);
  assert(res.status === 200 || res.status === 503, `expected 200 or 503, got ${res.status}`);
  const requestId = res.headers.get("x-request-id");
  assert(requestId && requestId.length >= 8, "missing x-request-id response header");
  const body = await res.json();
  assert(["healthy", "degraded", "unavailable"].includes(body.status), `unexpected status: ${body.status}`);
  assert(Array.isArray(body.checks), "health report missing checks array");
  const serialized = JSON.stringify(body);
  for (const marker of ["DATABASE_URL", "JWT_SECRET", "API_KEY", "stack"]) {
    assert(!serialized.includes(marker), `health response leaks marker: ${marker}`);
  }
  record("health endpoint responds", true, `status=${body.status} requestId=${requestId}`);
});

// 4. Read-only tRPC query (proves /api/trpc routing + function liveness).
await check("public tRPC system.health query responds", async () => {
  const input = encodeURIComponent(JSON.stringify({ json: { timestamp: Date.now() } }));
  const res = await fetchWithTimeout(`${BASE_URL}/api/trpc/system.health?input=${input}`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const body = await res.json();
  assert(body?.result?.data?.json?.ok === true, "system.health did not return ok:true");
  record("public tRPC system.health query responds", true, "ok:true");
});

// 5. Static Quran/curriculum asset resolves (CDN/static serving works).
await check("static curriculum asset resolves", async () => {
  const res = await fetchWithTimeout(`${BASE_URL}/audio/letters/alif.mp3`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  assert(/audio|octet-stream/.test(contentType), `unexpected content-type: ${contentType}`);
  record("static curriculum asset resolves", true, `HTTP ${res.status} ${contentType}`);
});

// 6. Unknown API path does not leak internals (safe error shape).
// Vercel returns its platform 404 for /api/* paths matching no rewrite.
// The local production server instead serves the SPA fallback here, so this
// check only applies to real deployments.
if (/localhost|127\.0\.0\.1/.test(BASE_URL)) {
  console.log("SKIP  unknown API path returns safe error — Vercel routing behavior; not applicable locally");
} else {
  await check("unknown API path returns safe error", async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/does-not-exist`);
    assert(res.status === 404, `expected 404, got ${res.status}`);
    record("unknown API path returns safe error", true, `HTTP ${res.status}`);
  });
}

const failed = results.filter((r) => !r.ok);
console.log(`\nSmoke test: ${results.length - failed.length}/${results.length} checks passed.`);
console.log("Not covered by this harness (by design): OAuth sign-in callbacks, protected/authenticated");
console.log("tRPC procedures, and any write path — those require real credentials and are excluded");
console.log("so the smoke test can never alter user data or weaken authentication.");
if (failed.length > 0) process.exit(1);
console.log("Deployed smoke test passed.");
