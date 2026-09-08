/**
 * Checks the Qaida recordings that have been delivered.
 *
 *   npx tsx scripts/validate-qaida-audio.ts
 *
 * What it checks is mechanical: the files are there, they are audio, they are
 * not empty, every ledger entry names a real curriculum target, no two entries
 * claim one file, no file is unclaimed, and anything marked approved carries a
 * named speaker and a named reviewer.
 *
 * What it does NOT check — and must never be extended to check — is whether the
 * recitation in a file is correct. That is a qualified teacher's judgement.
 */
import fs from "node:fs";
import path from "node:path";
import { validateQaidaAudio, type QaidaAudioFile } from "../shared/qaidaAudioValidation";
import { QAIDA_RECORDINGS } from "../shared/qaidaAudioManifest";

/** Where delivered Qaida recordings live, separate from the synthesised set. */
const AUDIO_ROOT = path.resolve(import.meta.dirname, "../client/public/audio/qaida");
const PUBLIC_PREFIX = "/audio/qaida";

function listFiles(directory: string, prefix: string): QaidaAudioFile[] {
  if (!fs.existsSync(directory)) return [];
  const found: QaidaAudioFile[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(full, `${prefix}/${entry.name}`));
    else found.push({ path: `${prefix}/${entry.name}`, bytes: fs.statSync(full).size });
  }
  return found;
}

const files = listFiles(AUDIO_ROOT, PUBLIC_PREFIX);
const result = validateQaidaAudio({ recordings: QAIDA_RECORDINGS, files });

console.log(`Qaida audio validation — ${QAIDA_RECORDINGS.length} ledger entries, ${result.checkedFiles} files under ${PUBLIC_PREFIX}`);
if (result.missingTargetIds.length) {
  console.log(`${result.missingTargetIds.length} instructional targets still have no approved recording.`);
}
for (const issue of result.issues) console.error(`  ${issue.code}: ${issue.subject} — ${issue.detail}`);

if (!result.ok) {
  console.error(`\n${result.issues.length} issue(s).`);
  process.exit(1);
}
console.log("No issues. Approval remains a qualified teacher's judgement, not this script's.");
