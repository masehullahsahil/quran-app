/**
 * Staff-only validation-run endpoints for Wave 0 readiness rehearsal.
 *
 * ADDITIVE ONLY. These endpoints exist so staff running a SINGLE-INSTANCE
 * Node server can activate a validation run before a real-device session and
 * export the server ledger afterwards. They never change Quran correctness
 * algorithms, alignment rules, advancement rules, correction semantics,
 * scoring, tajweed, or trusted-audio policy.
 *
 * Gating: the endpoints are registered ONLY when
 * `QURAN_VALIDATION_STAFF_API=1` is set in the server environment. By default
 * (including every production deployment) the routes do not exist and the
 * paths return 404. This keeps run activation off the public attack surface.
 *
 * Single-instance requirement: the active-run registry in
 * `server/validation/liveObservation.ts` is process-local. Activating a run
 * on one serverless instance does not make it visible to another, so these
 * endpoints are meaningful only on a single-instance Node server (local
 * `pnpm dev` / `pnpm start` or a staff server). They must NOT be enabled on
 * Vercel serverless deployments for plan-grade evidence.
 *
 * Safety: request/response payloads carry no audio, no transcripts, no Quran
 * text, no secrets, and no PII. Device metadata is passed through the
 * ledger's sanitizer before storage.
 */
import type { Express, Request, Response } from "express";
import {
  activateValidationRun,
  deactivateValidationRun,
  exportValidationRun,
  isStaffValidationApiEnabled,
} from "./liveObservation";
import { createRunId, isRunId, sanitizeDetails } from "./validationRun";
import { logger } from "../_core/logger";

export { isStaffValidationApiEnabled };

function asDeviceMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return sanitizeDetails(value as Record<string, unknown>);
  }
  return {};
}

function malformedRunId(res: Response, runId: string): void {
  res.status(400).json({
    error: {
      code: "BAD_REQUEST",
      message: "Malformed validation run ID.",
      runId,
    },
  });
}

/**
 * Registers the staff validation-run endpoints on the app. No-op unless the
 * staff API is explicitly enabled via `QURAN_VALIDATION_STAFF_API=1`.
 */
export function registerStaffValidationEndpoints(app: Express, env: NodeJS.ProcessEnv = process.env): void {
  if (!isStaffValidationApiEnabled(env)) return;

  // Activate (create) a validation run. The client then sends this runId back
  // on every live-tutor request via the x-validation-run-id header.
  app.post("/api/validation/runs", (req: Request, res: Response) => {
    try {
      const runId = createRunId();
      const deviceMetadata = asDeviceMetadata((req.body as { deviceMetadata?: unknown } | undefined)?.deviceMetadata);
      const entry = activateValidationRun(runId, { deviceMetadata });
      logger.info({
        subsystem: "validation",
        operation: "staff.activateRun",
        requestId: req.requestId,
        status: "ok",
        message: `staff activated validation run ${runId}`,
        details: {},
      });
      res.status(201).json({ runId: entry.runId, activatedAt: entry.activatedAt });
    } catch (error) {
      logger.error({
        subsystem: "validation",
        operation: "staff.activateRun",
        requestId: req.requestId,
        status: "error",
        errorCategory: "INTERNAL_ERROR",
        message: "failed to activate validation run",
        details: {},
      });
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Could not activate validation run." },
      });
    }
  });

  // Export the active run's ledger for offline joining with the client log
  // on runId + correlationId.
  app.get("/api/validation/runs/:runId/ledger", (req: Request, res: Response) => {
    const runId = req.params.runId;
    if (!isRunId(runId)) {
      malformedRunId(res, runId);
      return;
    }
    const exported = exportValidationRun(runId);
    if (!exported) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "No active validation run with that ID on this server instance.", runId },
      });
      return;
    }
    res.status(200).json(exported);
  });

  // Deactivate a run and return its final ledger export in one step.
  app.post("/api/validation/runs/:runId/deactivate", (req: Request, res: Response) => {
    const runId = req.params.runId;
    if (!isRunId(runId)) {
      malformedRunId(res, runId);
      return;
    }
    const entry = deactivateValidationRun(runId);
    if (!entry) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "No active validation run with that ID on this server instance.", runId },
      });
      return;
    }
    logger.info({
      subsystem: "validation",
      operation: "staff.deactivateRun",
      requestId: req.requestId,
      status: "ok",
      message: `staff deactivated validation run ${runId}`,
      details: {},
    });
    res.status(200).json({ runId: entry.runId, deactivated: true, ledger: entry.ledger.toJSON() });
  });
}
