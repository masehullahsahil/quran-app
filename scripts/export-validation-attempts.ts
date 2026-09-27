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
 * Output is JSON on stdout. With the staff gate and evaluator credentials,
 * joins research-only retained phonemes over HTTP; misses omit the key.
 */
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { buildAttemptExport, ledgerFromSavedFile } from "../server/validation/attemptExport";
import { joinResearchPhonemes } from "../server/validation/researchPhonemes";

// Keep stdout exclusively JSON, including when a local .env file is loaded.
config({ quiet: true, path: process.env.DOTENV_CONFIG_PATH });

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
process.stdout.write(`${JSON.stringify(await joinResearchPhonemes(exported), null, 2)}\n`);
