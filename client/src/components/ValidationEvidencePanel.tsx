import React, { useEffect, useState } from "react";
import { Download, FlaskConical } from "lucide-react";
import {
  clearValidationEvidence,
  getActiveValidationRunId,
  type AttemptLifecycleSummary,
  type ClientValidationLog,
} from "@/lib/validationCapture";

type ValidationWindow = Window & { __quranValidationLog?: ClientValidationLog };

export function downloadValidationJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function responseJson(response: Response) {
  if (!response.ok) throw new Error(`Request returned ${response.status}.`);
  return response.json() as Promise<unknown>;
}

export default function ValidationEvidencePanel() {
  const runId = getActiveValidationRunId();
  const [summary, setSummary] = useState<AttemptLifecycleSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    const update = () => {
      const log = (window as ValidationWindow).__quranValidationLog;
      setSummary(log?.attemptLifecycleSummary() ?? null);
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [runId]);

  if (!runId) return null;
  const activeRunId = runId;
  const finalAttempts =
    summary?.attempts.filter(attempt => attempt.path === "final") ?? [];

  function downloadClient() {
    const log = (window as ValidationWindow).__quranValidationLog;
    if (!log) {
      setError("Client evidence is not ready yet.");
      return;
    }
    downloadValidationJson(
      `quran-validation-client-${activeRunId}.json`,
      log.toJSON()
    );
  }

  async function downloadServer(deactivate: boolean) {
    setError(null);
    try {
      const path = `/api/validation/runs/${encodeURIComponent(activeRunId)}${deactivate ? "/deactivate" : "/ledger"}`;
      const body = await responseJson(
        await fetch(path, { method: deactivate ? "POST" : "GET" })
      );
      downloadValidationJson(
        `quran-validation-server-${activeRunId}${deactivate ? "-final" : ""}.json`,
        body
      );
      if (deactivate) {
        // Run finalized: the bundle is exported, so the persisted client
        // evidence for this run is cleared. A new run starts clean.
        clearValidationEvidence(activeRunId);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Server evidence could not be downloaded."
      );
    }
  }

  async function finishAndDownloadBundle() {
    setError(null);
    const log = (window as ValidationWindow).__quranValidationLog;
    if (!log) {
      setError("Client evidence is not ready yet.");
      return;
    }
    try {
      const server = await responseJson(
        await fetch(
          `/api/validation/runs/${encodeURIComponent(activeRunId)}/deactivate`,
          { method: "POST" }
        )
      );
      downloadValidationJson(`quran-validation-bundle-${activeRunId}.json`, {
        schemaVersion: 1,
        runId: activeRunId,
        exportedAt: new Date().toISOString(),
        client: log.toJSON(),
        server,
      });
      // Run finalized and its bundle exported: clear this run's persisted
      // client evidence so the next run starts clean. The log stays mounted,
      // so its persistence must stop too: any instrumentation that fires
      // after Finish (e.g. a playback-ended event) would otherwise write the
      // whole in-memory log back under the same key, and a reload would
      // resurrect a finalized run.
      clearValidationEvidence(activeRunId);
      log.stopPersisting();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The final evidence bundle could not be downloaded."
      );
    }
  }

  return (
    <aside
      className="fixed bottom-4 right-4 z-50 w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-indigo-300 bg-white p-4 shadow-2xl"
      aria-label="Validation evidence"
    >
      <div className="mb-2 flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-indigo-700" aria-hidden="true" />
        <strong>Validation evidence</strong>
      </div>
      <p className="mb-3 break-all text-xs text-slate-600">{activeRunId}</p>
      <div className="mb-3 max-h-36 space-y-2 overflow-auto text-xs">
        {finalAttempts.length === 0 ? (
          <p>No finalized attempts yet.</p>
        ) : (
          finalAttempts.map(attempt => (
            <div key={attempt.attemptId} className="rounded-md bg-slate-50 p-2">
              <div>
                <strong>{attempt.attemptId}</strong> · {attempt.outcome}
              </div>
              <div>Server attempt: {attempt.serverAttemptId ?? "not returned"}</div>
              <div>Correlation: {attempt.correlationId ?? "not returned"}</div>
              <div>
                Muaalem status:{" "}
                {attempt.acousticStatus ??
                  (attempt.acousticEligible ? "not returned" : "not eligible")}
              </div>
            </div>
          ))
        )}
      </div>
      {error && (
        <p role="alert" className="mb-2 text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={downloadClient}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium"
        >
          <Download className="h-3 w-3" />
          Client log
        </button>
        <button
          type="button"
          onClick={() => void downloadServer(false)}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium"
        >
          <Download className="h-3 w-3" />
          Server ledger
        </button>
        <button
          type="button"
          onClick={() => void finishAndDownloadBundle()}
          className="rounded-md bg-indigo-700 px-2 py-1 text-xs font-semibold text-white"
        >
          Finish & download bundle
        </button>
      </div>
    </aside>
  );
}
