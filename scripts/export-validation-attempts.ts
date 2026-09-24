/**
 * Offline per-attempt Muaalem shadow export for one finished validation run.
 *
 * "Finish & download bundle" deactivates the run, after which the live
 * `/api/validation/runs/:runId/attempts` endpoint returns 404. This script
 * builds the same rows from the saved file instead: the client evidence
 * bundle, the `-final` server file, or a raw `/ledger` export.
 *
 *   pnpm export:validation-attempts quran-validation-bundle-run_….json > attempts.json
 *
 * Output is JSON on stdout: numbers, enums, IDs and timestamps only.
 */
import { readFile } from "node:fs/promises";
import { buildAttemptExport, ledgerFromSavedFile } from "../server/validation/attemptExport";

const file = process.argv[2];
if (!file) {
  console.error("usage: export-validation-attempts <bundle-or-ledger.json>");
  process.exit(2);
}
const exported = buildAttemptExport(ledgerFromSavedFile(JSON.parse(await readFile(file, "utf8"))));
if (!exported) {
  console.error("No validation ledger with a well-formed run ID found in that file.");
  process.exit(1);
}
process.stdout.write(`${JSON.stringify(exported, null, 2)}\n`);
