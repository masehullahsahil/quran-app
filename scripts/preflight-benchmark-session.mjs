/**
 * Disposable evidence-path smoke test, not benchmark scoring or Quran audio.
 * Native Node.js only. See docs/benchmark-session-preflight.md for commands.
 * One app attempt makes one server-to-server /v1/evaluate call. Calling the
 * evaluator directly would bypass consent forwarding and create no app row.
 * No deletion: the research record expires automatically after ~24 hours.
 */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const PURPOSE = "preflight smoke test — disposable";
const DEFAULT_MODEL = "obadx/muaalem-model-v3_2";
const DAY_MS = 86_400_000;
/** Blanket timeout for probe requests. The step-3c app attempt goes through
 * the app's transcription path, which allows one bounded retry of up to 30s
 * per request (server/_core/voiceTranscription.ts) plus up to 20s for the
 * app->evaluator call (server/quranEvaluator.ts). Aborting that request at
 * the blanket 45s would report a false NO-GO while the server keeps
 * processing, so it gets a route-specific timeout covering the bounded
 * retry window.
 */
const EVALUATE_TIMEOUT_MS = 90_000;

/** NON-QURAN, NON-SPEECH fixture: 2s PCM WAV, with one 1s 440Hz beep.
 * Silence before/after keeps the evaluator's energy-based noise estimate low;
 * continuous tone or all-silence would be rejected before the shadow worker.
 * No speech, voice, Quran text, recitation model, or audio synthesis service.
 */
export function nonSpeechBeep() {
  const rate = 16_000;
  const frames = rate * 2;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(frames * 2, 40);
  for (let i = rate / 2; i < rate * 1.5; i++) {
    const envelope = Math.min(1, (i - rate / 2) / 160, (rate * 1.5 - i) / 160);
    wav.writeInt16LE(
      Math.round(
        0.2 * 32767 * envelope * Math.sin((2 * Math.PI * 440 * i) / rate)
      ),
      44 + i * 2
    );
  }
  return wav;
}

function baseUrl(value) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use an HTTP(S) base URL without credentials, query or fragment."
    );
  return url.href.replace(/\/+$/, "");
}

function consentMatches(value, consent) {
  return (
    value?.granted === true &&
    value.purpose === consent.purpose &&
    Date.parse(value.retainUntil) === Date.parse(consent.retainUntil)
  );
}

function researchProjection(value, id, consent, model) {
  if (
    !value ||
    value.correlationId !== id ||
    value.modelId !== model ||
    typeof value.provider !== "string" ||
    !value.provider.trim() ||
    !Number.isFinite(Date.parse(value.timestamp)) ||
    value.purpose !== consent.purpose ||
    Date.parse(value.retainUntil) !== Date.parse(consent.retainUntil) ||
    !Array.isArray(value.levels) ||
    value.levels.length === 0
  )
    return null;
  const posterior = x =>
    typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
  const levels = [];
  for (const level of value.levels) {
    if (
      !level ||
      !Array.isArray(level.tokens) ||
      !level.tokens.every(x => typeof x === "string") ||
      !Array.isArray(level.tokenPosteriors) ||
      level.tokenPosteriors.length !== level.tokens.length ||
      !level.tokenPosteriors.every(posterior) ||
      !posterior(level.meanPosterior)
    )
      return null;
    // The service also includes an additive level name; app PR #100 exports
    // these contract fields only. Compare the actual stored/exported values.
    levels.push({
      tokens: level.tokens,
      tokenPosteriors: level.tokenPosteriors,
      meanPosterior: level.meanPosterior,
    });
  }
  return {
    correlationId: id,
    timestamp: value.timestamp,
    provider: value.provider,
    modelId: value.modelId,
    levels,
    purpose: value.purpose,
    retainUntil: value.retainUntil,
  };
}

class CheckFailure extends Error {
  constructor(step, message, fix) {
    super(message);
    this.step = step;
    this.fix = fix;
  }
}

/** Injectable HTTP/output for smoke tests; no runtime app/service imports. */
export async function runPreflight({
  env = process.env,
  fetchImpl = fetch,
  print = console.log,
  exportFile,
  writeFileImpl = writeFile,
} = {}) {
  const results = [];
  const report = (status, step, message, fix) => {
    results.push({ status, step, message, ...(fix ? { fix } : {}) });
    print(`${status} ${step}: ${message}${fix ? `\n  Fix: ${fix}` : ""}`);
  };
  const fail = (step, message, fix) => {
    throw new CheckFailure(step, message, fix);
  };
  async function request(base, path, init, step, fix, timeoutMs = 45_000) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json", ...init?.headers },
      });
      const body = await response.json().catch(() => null);
      return { status: response.status, body, headers: response.headers };
    } catch {
      fail(
        step,
        "Request failed or timed out; no automatic retry was sent.",
        fix
      );
    }
  }
  const attempt = async task => {
    try {
      return await task();
    } catch (error) {
      if (error instanceof CheckFailure)
        report("FAIL", error.step, error.message, error.fix);
      else
        report(
          "FAIL",
          "internal",
          "Unexpected preflight error (details withheld).",
          "Check the script/runtime; do not start recording."
        );
      return null;
    }
  };

  print(
    "Benchmark session preflight — NON-QURAN beep; no pronunciation scoring."
  );
  let appBase;
  const app = await attempt(async () => {
    try {
      appBase = baseUrl(env.QURAN_APP_URL?.trim() || "http://127.0.0.1:3000");
    } catch {
      fail(
        "1 app/staff API",
        "Invalid QURAN_APP_URL.",
        "Set the single-instance staff app's HTTP(S) base URL."
      );
    }
    const res = await request(
      appBase,
      "/api/validation/preflight",
      {},
      "1 app/staff API",
      "Start the staff app, verify QURAN_APP_URL, and set QURAN_VALIDATION_STAFF_API=1 on that app server."
    );
    if (
      res.status !== 200 ||
      res.body?.staffApi !== true ||
      res.body?.serverMode !== "single-instance"
    )
      fail(
        "1 app/staff API",
        `HTTP ${res.status}: staff validation preflight is absent or invalid.`,
        "Enable QURAN_VALIDATION_STAFF_API=1 on a single-instance app server and restart; do not use the deployed learner app."
      );
    report(
      "PASS",
      "1 app/staff API",
      "Reachable; staff API enabled on a single-instance server."
    );
    return res.body;
  });

  let evaluatorBase;
  let configIssue;
  const key = env.QURAN_EVALUATOR_API_KEY?.trim();
  const model = env.QURAN_EXPECTED_SHADOW_MODEL_ID?.trim() || DEFAULT_MODEL;
  if (!env.QURAN_EVALUATOR_URL?.trim() || !key)
    configIssue =
      "QURAN_EVALUATOR_URL and QURAN_EVALUATOR_API_KEY must both be set.";
  else {
    try {
      evaluatorBase = baseUrl(env.QURAN_EVALUATOR_URL.trim());
    } catch {
      configIssue =
        "QURAN_EVALUATOR_URL must be an HTTP(S) base URL without embedded credentials.";
    }
  }
  const auth = { authorization: `Bearer ${key}` };
  const health =
    evaluatorBase &&
    (await attempt(async () => {
      const res = await request(
        evaluatorBase,
        "/health",
        { headers: auth },
        "2 evaluator health",
        "Check the evaluator URL, network, and running GPU container."
      );
      if (res.status === 401 || res.status === 403)
        fail(
          "2 evaluator health",
          `HTTP ${res.status}: bearer auth rejected.`,
          "Correct QURAN_EVALUATOR_API_KEY to match the evaluator."
        );
      if (
        res.status !== 200 ||
        res.body?.status !== "ready" ||
        res.body?.shadowReady !== true
      )
        fail(
          "2 evaluator health",
          `HTTP ${res.status}: shadow worker not ready.`,
          "Start/warm the shadow worker and check its model configuration and health."
        );
      if (res.body.shadowModelId !== model)
        fail(
          "2 evaluator model",
          "Shadow model ID does not match the expected model.",
          "Deploy the expected model or explicitly set QURAN_EXPECTED_SHADOW_MODEL_ID to the intended benchmark model."
        );
      report(
        "PASS",
        "2 evaluator health/model",
        "Reachable; shadow ready and expected model ID confirmed. Health alone does not prove bearer auth."
      );
      return res.body;
    }));
  if (!evaluatorBase)
    report(
      "SKIP",
      "2 evaluator health/model",
      "Evaluator configuration is missing/invalid; see step 4."
    );

  const correlationId = `preflight_${randomUUID().replace(/-/g, "")}`;
  let runId;
  let readBack;
  if (app && health && !configIssue) {
    await attempt(async () => {
      if (
        app.evaluator?.status !== "ready" ||
        app.evaluator?.shadowReady !== true ||
        app.evaluator?.modelId !== model
      )
        fail(
          "3a app evaluator configuration",
          "The app's own evaluator preflight is not ready for the expected model.",
          "Set the same QURAN_EVALUATOR_URL/API_KEY on the app server, check its connectivity, and restart it."
        );
      if (app.transcription?.status !== "ready")
        fail(
          "3a app transcription",
          "The existing app recitation route's transcription dependency is not ready.",
          "Configure a valid OPENAI_API_KEY/transcription model on the staff app and restart it."
        );
      const consent = {
        granted: true,
        purpose: PURPOSE,
        retainUntil: new Date(Date.now() + DAY_MS).toISOString(),
      };
      const activation = await request(
        appBase,
        "/api/validation/runs",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            phonemeRetention: {
              purpose: consent.purpose,
              retainUntil: consent.retainUntil,
            },
          }),
        },
        "3b run activation",
        "Check the staff gate and that app PR #100 is running."
      );
      if (
        activation.status !== 201 ||
        !/^run_[0-9a-f]{24}$/.test(activation.body?.runId)
      )
        fail(
          "3b run activation",
          `HTTP ${activation.status}: could not activate a disposable run.`,
          "Check the staff API, request schema, and app PR #100 deployment."
        );
      runId = activation.body.runId;
      print(
        `Disposable run: ${runId}; correlation ID: ${correlationId}; expires: ${consent.retainUntil}`
      );
      if (!consentMatches(activation.body.researchConsent, consent))
        fail(
          "3b run consent",
          "Explicit phoneme retention consent was not recorded in activation.",
          "Deploy app PR #100; confirm activation accepts phonemeRetention and records granted=true with the requested purpose/expiry."
        );
      report(
        "PASS",
        "3b run consent",
        "Explicit ~24h preflight consent recorded."
      );

      // No client researchConsent field: only the run ID is sent. The real app
      // must forward the recorded consent to /v1/evaluate itself. Coordinates
      // are required by the existing API; expectedArabic is a non-Quran marker.
      const evaluated = await request(
        appBase,
        "/api/trpc/recitation.evaluate",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-validation-run-id": runId,
            "x-request-id": correlationId,
          },
          body: JSON.stringify({
            json: {
              audioBase64: nonSpeechBeep().toString("base64"),
              mimeType: "audio/wav",
              expectedArabic: "NON_QURAN_PREFLIGHT_BEEP",
              surah: 1,
              ayah: 1,
              learningLevel: "qaida",
              uiLanguage: "en",
              attemptScope: "ayah",
            },
          }),
        },
        "3c app attempt/evaluator forwarding",
        "Check the app recitation endpoint, rate limit, transcription dependency, and evaluator timeout. Do not retry this attempt automatically.",
        EVALUATE_TIMEOUT_MS
      );
      const data = evaluated.body?.result?.data?.json;
      if (evaluated.status !== 200 || !data || evaluated.body?.error)
        fail(
          "3c app attempt/evaluator forwarding",
          `HTTP ${evaluated.status}: app attempt failed.`,
          "Check app logs using the printed correlation ID; fix its recitation/transcription/evaluator dependencies."
        );
      // The app intentionally returns HTTP 200 with reviewMessageCode
      // "transcription_failed" when the transcription request itself failed
      // (quota, rate limit, endpoint permissions). The non-speech beep
      // fixture should yield "no_arabic_returned"; accept it but reject a
      // real transcription failure, otherwise a broken transcription
      // dependency reports GO.
      if (data.reviewMessageCode === "transcription_failed")
        fail(
          "3c transcription dependency",
          "App attempt returned transcription_failed despite HTTP 200.",
          "Check the app server's OPENAI_API_KEY, transcription quota/rate limit and model permissions; a healthy pipeline returns no_arabic_returned for the non-speech beep."
        );
      if (
        data.validationCorrelationId !== correlationId ||
        !/^att_[0-9a-f]{24}$/.test(data.validationAttemptId)
      )
        fail(
          "3c attempt correlation",
          "The app did not observe the attempt under the requested correlation ID.",
          "Use the same single app instance for activation and evaluation; check x-validation-run-id and x-request-id propagation."
        );
      report(
        "PASS",
        "3c app attempt",
        "One non-speech beep submitted through the app; real attempt/correlation acknowledged."
      );

      const exported = await request(
        appBase,
        `/api/validation/runs/${runId}/attempts`,
        {},
        "3d attempt export",
        "Check app PR #100 and keep all requests on the same single-instance staff server."
      );
      if (
        exported.status !== 200 ||
        exported.body?.schema !== "quran.validation.attempts.v1" ||
        exported.body.runId !== runId ||
        exported.body.attemptCount !== 1 ||
        exported.body.attempts?.length !== 1
      )
        fail(
          "3d attempt export",
          `HTTP ${exported.status}: export does not contain exactly one disposable attempt.`,
          "Check the staff export route and single-instance run registry; no synthetic ledger rows are inserted by this script."
        );
      const row = exported.body.attempts[0];
      if (
        row.correlationId !== correlationId ||
        row.attemptId !== data.validationAttemptId ||
        row.runId !== runId
      )
        fail(
          "3d export correlation",
          "Exported attempt IDs do not match the acknowledged app attempt.",
          "Fix run/attempt/correlation propagation before recording."
        );
      if (exportFile) {
        try {
          await writeFileImpl(
            exportFile,
            `${JSON.stringify(exported.body, null, 2)}\n`,
            { flag: "wx", mode: 0o600 }
          );
        } catch {
          fail(
            "3d export file",
            "Could not create the requested JSON export file (existing files are not overwritten).",
            "Choose a new --export-file path in an existing writable directory."
          );
        }
        print(
          "JSON export saved to the requested file; phoneme contents are never printed."
        );
      }
      if (row.evaluatorHttpStatus !== 200)
        fail(
          "3e app-to-evaluator HTTP",
          `App evaluator HTTP status: ${row.evaluatorHttpStatus ?? "not called/no response"}.`,
          row.evaluatorHttpStatus === 401 || row.evaluatorHttpStatus === 403
            ? "Correct the app server's QURAN_EVALUATOR_API_KEY and restart it."
            : "Check the app server's evaluator URL, connectivity, timeout and deployment."
        );

      readBack = await request(
        evaluatorBase,
        `/v1/research/phonemes/${correlationId}`,
        { headers: auth },
        "3f retention read-back",
        "Check evaluator reachability, bearer key, research gate, and record store."
      );
      if (readBack.status === 401 || readBack.status === 403)
        fail(
          "3f retention auth",
          `HTTP ${readBack.status}: research read bearer rejected (not a missing-record 404).`,
          "Correct this script's QURAN_EVALUATOR_API_KEY to match the evaluator."
        );
      if (readBack.status !== 200 && readBack.status !== 404)
        fail(
          "3f retention read-back",
          `HTTP ${readBack.status}: unexpected research read response.`,
          "Check evaluator PR #99 deployment and research-store health."
        );
      if (
        ["unavailable", "abstained", "not_run"].includes(row.muaalemStatus) &&
        readBack.status === 404 &&
        !row.researchPhonemes
      ) {
        report(
          "INCONCLUSIVE",
          "3f retention round trip",
          row.muaalemStatus === "not_run"
            ? "pipeline reachable, retention path not exercised (fixture rejected before shadow analysis)"
            : "pipeline reachable, retention path not exercised (shadow unavailable on fixture)"
        );
        return;
      }
      if (row.muaalemStatus !== "available" || row.muaalemModelId !== model)
        fail(
          "3f shadow result",
          "The attempt did not run an available shadow analysis with the expected model.",
          "Check the shadow worker configuration/image; health readiness alone is insufficient."
        );
      if (readBack.status === 404)
        fail(
          "3f retention read-back",
          "HTTP 404: evaluator retained no readable record; bearer was not rejected.",
          "Enable QURAN_RESEARCH_PHONEME_RETENTION=1 on the evaluator, deploy the rebuilt PR #99 worker with tokenPosteriors, check the store, and verify app consent forwarding. A 404 cannot distinguish these causes."
        );
      const retained = researchProjection(
        readBack.body,
        correlationId,
        consent,
        model
      );
      if (!retained)
        fail(
          "3f retained record/consent",
          "Retained record is malformed or its consent/model/correlation differs from the activated run.",
          "Check consent forwarding and the service read contract, including parallel tokens/posteriors and the requested ~24h expiry."
        );
      if (!row.researchPhonemes)
        fail(
          "3g export join",
          "Evaluator record exists, but researchPhonemes is missing from the app export.",
          "Check app PR #100, its evaluator URL/API key, and server-to-server read connectivity/timeout; use the same evaluator as this script."
        );
      const joined = researchProjection(
        row.researchPhonemes,
        correlationId,
        consent,
        model
      );
      if (!joined || !isDeepStrictEqual(joined, retained))
        fail(
          "3g export join",
          "Joined researchPhonemes does not match the evaluator read-back.",
          "Fix the export correlation join/contract before recording; the retained consent and per-token data must match."
        );
      report(
        "PASS",
        "3g retention round trip",
        "Consent forwarding, evaluator retention, and matching researchPhonemes export join proved."
      );
    });
  } else
    report(
      "SKIP",
      "3 retention round trip",
      "Blocked by app/health/config checks; no disposable attempt was sent."
    );

  // Health is public in PR #99. Prove auth at a bearer-protected read endpoint,
  // even when no run was possible. A fresh unknown ID should return 404, not 401.
  await attempt(async () => {
    if (configIssue)
      fail(
        "4 configuration",
        configIssue,
        "Set evaluator URL/API key in this shell (and the same values on the staff app); never put the key in a URL."
      );
    const probe =
      readBack ??
      (await request(
        evaluatorBase,
        `/v1/research/phonemes/${correlationId}`,
        { headers: auth },
        "4 bearer auth",
        "Check the configured evaluator URL and API key."
      ));
    if (probe.status === 401 || probe.status === 403)
      fail(
        "4 bearer auth",
        `HTTP ${probe.status}: bad/missing bearer key, not a missing record.`,
        "Correct QURAN_EVALUATOR_API_KEY to match the evaluator and restart any server using the old key."
      );
    if (probe.status !== 200 && probe.status !== 404)
      fail(
        "4 bearer auth",
        `HTTP ${probe.status}: auth acceptance could not be verified.`,
        "Check evaluator PR #99 and the protected read endpoint."
      );
    report(
      "PASS",
      "4 configuration/auth",
      `URL/key present; protected read accepted bearer (HTTP ${probe.status}${probe.status === 404 ? ", record absent or research gate off" : ""}).`
    );
  });

  const failed = results.filter(x => x.status === "FAIL");
  const inconclusive = results.some(x => x.status === "INCONCLUSIVE");
  const status = failed.length ? "NO-GO" : inconclusive ? "INCONCLUSIVE" : "GO";
  print(
    `\n${status}${failed.length ? ` — failed: ${failed.map(x => x.step).join(", ")}` : status === "GO" ? " — evidence path verified; ready for a separate benchmark run." : " — not a pass or a failure; retention must be exercised before recording."}`
  );
  if (runId)
    print(
      "Disposable run remains separate from the 16 takes. Its research record expires automatically at retainUntil; this script never deletes records."
    );
  return {
    status,
    exitCode: status === "GO" ? 0 : status === "NO-GO" ? 1 : 2,
    results,
    runId,
    correlationId,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "Usage: node scripts/preflight-benchmark-session.mjs [--export-file NEW.json]\nRequired: QURAN_EVALUATOR_URL, QURAN_EVALUATOR_API_KEY\nOptional: QURAN_APP_URL (http://127.0.0.1:3000), QURAN_EXPECTED_SHADOW_MODEL_ID (obadx/muaalem-model-v3_2)\nStaff app: QURAN_VALIDATION_STAFF_API=1; evaluator URL/key and OPENAI_API_KEY configured.\nEvaluator: rebuilt PR #99 worker; QURAN_RESEARCH_PHONEME_RETENTION=1.\nFixture: non-speech beep only. Record expires in ~24h; no deletion.\nExit: GO=0, NO-GO=1, INCONCLUSIVE=2."
    );
    return;
  }
  if (
    args.length &&
    (args.length !== 2 || args[0] !== "--export-file" || !args[1])
  ) {
    console.log("NO-GO — invalid arguments. Run with --help.");
    process.exitCode = 1;
    return;
  }
  const result = await runPreflight({ exportFile: args[1] });
  process.exitCode = result.exitCode;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch(() => {
    console.log("NO-GO — unexpected script error; do not start recording.");
    process.exitCode = 1;
  });
}
