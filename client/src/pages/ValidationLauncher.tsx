import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Mic,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import { collectDeviceMetadata, clearAllValidationEvidence } from "@/lib/validationCapture";
import { useLocale } from "@/contexts/LocaleContext";

type ServiceState = "up" | "down" | "configured" | "not_configured";

export type LauncherHealth = {
  status: string;
  config: { valid: boolean; errors: number; warnings: number };
  checks: Array<{
    name: string;
    status: ServiceState;
    critical: boolean;
    latencyMs?: number;
  }>;
};

export type LauncherPreflight = {
  staffApi: true;
  serverMode: "single-instance";
  transcription: { status: string; model: string };
  evaluator: { status: string; shadowReady: boolean; modelId: string | null };
};

export type MicrophonePreflight = {
  bytes: number;
  peakRms: number;
  passed: boolean;
  reason: "ok" | "no-audio-data" | "signal-too-quiet";
};

const MIN_RECORDED_BYTES = 1_000;
const MIN_PEAK_RMS = 0.015;

export function classifyMicrophonePreflight(
  bytes: number,
  peakRms: number
): MicrophonePreflight {
  if (bytes < MIN_RECORDED_BYTES)
    return { bytes, peakRms, passed: false, reason: "no-audio-data" };
  if (peakRms < MIN_PEAK_RMS)
    return { bytes, peakRms, passed: false, reason: "signal-too-quiet" };
  return { bytes, peakRms, passed: true, reason: "ok" };
}

function checkOf(health: LauncherHealth | null, name: string) {
  return health?.checks.find(check => check.name === name) ?? null;
}

export function validationReadiness(
  health: LauncherHealth | null,
  preflight: LauncherPreflight | null,
  microphone: MicrophonePreflight | null
) {
  const blockers: string[] = [];
  if (!health) blockers.push("Service health has not been checked.");
  else {
    if (!health.config.valid)
      blockers.push("Local server configuration is invalid.");
  }
  if (!preflight)
    blockers.push("Credential-aware service preflight has not completed.");
  else {
    if (preflight.transcription.status !== "ready")
      blockers.push(
        `Transcription preflight: ${preflight.transcription.status}.`
      );
    if (preflight.evaluator.status !== "ready")
      blockers.push(`Muaalem preflight: ${preflight.evaluator.status}.`);
  }
  if (!microphone?.passed)
    blockers.push("Microphone preflight has not passed.");
  return { ready: blockers.length === 0, blockers };
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Captures four seconds in memory, measuring encoded bytes and signal energy.
 * It never uploads, stores, logs, or returns the recorded audio.
 */
export async function runMicrophonePreflight(
  durationMs = 4_000
): Promise<MicrophonePreflight> {
  if (
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  ) {
    return classifyMicrophonePreflight(0, 0);
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  let audioContext: AudioContext | null = null;
  try {
    const Context =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Context) return classifyMicrophonePreflight(0, 0);
    audioContext = new Context();
    if (audioContext.state === "suspended") await audioContext.resume();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    let bytes = 0;
    let peakRms = 0;
    const recorder = new MediaRecorder(stream);
    recorder.addEventListener("dataavailable", event => {
      bytes += event.data.size;
    });
    const stopped = new Promise<void>(resolve =>
      recorder.addEventListener("stop", () => resolve(), { once: true })
    );
    recorder.start(250);

    const samples = new Float32Array(analyser.fftSize);
    const deadline = performance.now() + durationMs;
    while (performance.now() < deadline) {
      analyser.getFloatTimeDomainData(samples);
      let sumSquares = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index] ?? 0;
        sumSquares += sample * sample;
      }
      peakRms = Math.max(peakRms, Math.sqrt(sumSquares / samples.length));
      await wait(50);
    }
    recorder.stop();
    await stopped;
    return classifyMicrophonePreflight(bytes, peakRms);
  } finally {
    stream.getTracks().forEach(track => track.stop());
    if (audioContext) await audioContext.close().catch(() => undefined);
  }
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
  ) : (
    <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
  );
}

export default function ValidationLauncher() {
  const { t } = useLocale();
  const [health, setHealth] = useState<LauncherHealth | null>(null);
  const [preflight, setPreflight] = useState<LauncherPreflight | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [microphone, setMicrophone] = useState<MicrophonePreflight | null>(
    null
  );
  const [testingMic, setTestingMic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The browser name the page actually detected — every mic message names
  // this instead of hardcoding "Chrome" (run_e6872ef0aa84e7b7dc7ac447's
  // metadata said Firefox while the tester believed they were in Chrome).
  const detectedBrowser = useMemo(() => collectDeviceMetadata().browserName, []);

  const readiness = useMemo(
    () => validationReadiness(health, preflight, microphone),
    [health, preflight, microphone]
  );

  async function refreshHealth() {
    setHealthError(null);
    try {
      const [healthResponse, preflightResponse] = await Promise.all([
        fetch("/api/health", { headers: { accept: "application/json" } }),
        fetch("/api/validation/preflight", {
          headers: { accept: "application/json" },
        }),
      ]);
      if (!healthResponse.ok)
        throw new Error(`Health check returned ${healthResponse.status}`);
      if (preflightResponse.status === 404) {
        throw new Error(
          "Staff validation API is disabled. Start the local server with QURAN_VALIDATION_STAFF_API=1."
        );
      }
      if (!preflightResponse.ok)
        throw new Error(
          `Validation preflight returned ${preflightResponse.status}`
        );
      setHealth((await healthResponse.json()) as LauncherHealth);
      setPreflight((await preflightResponse.json()) as LauncherPreflight);
    } catch (cause) {
      setHealth(null);
      setPreflight(null);
      setHealthError(
        cause instanceof Error
          ? cause.message
          : "The local validation preflight did not respond. Confirm the staff API flag and server logs."
      );
    }
  }

  useEffect(() => {
    void refreshHealth();
  }, []);

  async function testMicrophone() {
    setTestingMic(true);
    setError(null);
    setMicrophone(null);
    try {
      setMicrophone(await runMicrophonePreflight());
    } catch (cause) {
      const name =
        cause instanceof DOMException ? cause.name : "microphone-error";
      setError(
        t("validation.micError", { name, browser: detectedBrowser ?? "this browser" })
      );
    } finally {
      setTestingMic(false);
    }
  }

  async function createRun() {
    if (!readiness.ready) return;
    setCreating(true);
    setError(null);
    try {
      const metadata = collectDeviceMetadata();
      const response = await fetch("/api/validation/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          deviceMetadata: {
            device: "staff-laptop",
            browser: metadata.browserName ?? "unknown",
            network: metadata.connection?.effectiveType ?? "unknown",
          },
        }),
      });
      if (response.status === 404) {
        throw new Error(
          "Staff validation API is disabled. Restart the local server with QURAN_VALIDATION_STAFF_API=1."
        );
      }
      if (!response.ok)
        throw new Error(`Run activation returned ${response.status}.`);
      const body = (await response.json()) as { runId?: unknown };
      if (
        typeof body.runId !== "string" ||
        !/^run_[0-9a-f]{24}$/.test(body.runId)
      ) {
        throw new Error("Run activation returned an invalid run ID.");
      }
      // Explicit new-run boundary: a new run starts with no carried-over
      // client evidence. Stale events from a previous run must never be
      // joined with this run's server ledger.
      clearAllValidationEvidence();
      sessionStorage.setItem(
        `quran.validationMicPreflight.${body.runId}`,
        "passed"
      );
      setRunId(body.runId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The validation run could not be created."
      );
    } finally {
      setCreating(false);
    }
  }

  const validationUrl = runId
    ? `/?validation=1&validationRunId=${encodeURIComponent(runId)}`
    : null;
  const database = checkOf(health, "database");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-700">
            Local staff tool · Wave 0
          </p>
          <h1 className="text-3xl font-bold">
            Quran recitation validation launcher
          </h1>
          <p className="text-slate-600">
            This page checks the microphone, transcription configuration, and
            Muaalem reachability before it allows a run to start. Microphone
            audio stays in memory and is immediately discarded.
          </p>
        </header>

        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex gap-3">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <strong>Single-instance local server only.</strong> Never enable
              the staff API on Vercel or Production. This launcher records
              observation evidence; it does not authorize pronunciation claims
              or learner-facing acoustic corrections.
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Server className="h-5 w-5" />
              Service checks
            </h2>
            <button
              type="button"
              onClick={() => void refreshHealth()}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
          {healthError && (
            <p role="alert" className="mb-3 text-sm text-red-700">
              {healthError}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <StatusIcon ok={preflight?.transcription.status === "ready"} />
              <span>
                Transcription: {preflight?.transcription.status ?? "checking"}{" "}
                {preflight?.transcription.model
                  ? `(${preflight.transcription.model})`
                  : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <StatusIcon ok={preflight?.evaluator.status === "ready"} />
              <span>Muaalem: {preflight?.evaluator.status ?? "checking"}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusIcon ok={health?.config.valid === true} />
              <span>
                Configuration: {health?.config.valid ? "valid" : "checking"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <StatusIcon ok={database?.status === "up"} />
              <span>
                Database: {database?.status ?? "checking"} (not a recitation
                blocker)
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
            <Mic className="h-5 w-5" />
            Microphone preflight
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            Click once, then speak normally for four seconds. No audio leaves
            this browser.
          </p>
          <button
            type="button"
            disabled={testingMic}
            onClick={() => void testMicrophone()}
            className="rounded-md bg-indigo-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {testingMic ? "Listening — speak now…" : "Test microphone"}
          </button>
          {microphone && (
            <p
              role="status"
              className={`mt-3 text-sm font-medium ${microphone.passed ? "text-emerald-700" : "text-red-700"}`}
            >
              {microphone.passed
                ? t("validation.micPassed", { browser: detectedBrowser ?? "this browser" })
                : microphone.reason === "no-audio-data"
                  ? t("validation.micNoAudio")
                  : t("validation.micTooQuiet")}
            </p>
          )}
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold">Start the evidence run</h2>
          {!readiness.ready && (
            <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {readiness.blockers.map(blocker => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}
          {!runId ? (
            <button
              type="button"
              disabled={!readiness.ready || creating}
              onClick={() => void createRun()}
              className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating run…" : "Create validation run"}
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-emerald-800">
                <strong>Run ready:</strong> <code>{runId}</code>
              </p>
              <a
                href={validationUrl ?? "/"}
                className="inline-block rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white"
              >
                Open Al-Fatihah validation session
              </a>
              <p className="text-xs text-slate-500">
                The session shows a validation evidence panel with attempt
                status and download controls.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
