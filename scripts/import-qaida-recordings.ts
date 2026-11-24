/**
 * Matches a folder of delivered recordings to curriculum targets and prints the
 * ledger entries to add to QAIDA_RECORDINGS in shared/qaidaAudioManifest.ts.
 *
 *   npx tsx scripts/import-qaida-recordings.ts \
 *     --speaker "Name" --qualification "…" --source "…" --date 2026-12-01 \
 *     [--dir client/public/audio/qaida]
 *
 * File names are the ones on the recording sheet (scripts/qaida-recording-kit.ts),
 * e.g. letter-ba-fatha.mp3, so no id is typed by hand. Every entry is printed
 * with status "recorded": approval is a person's decision, made after a second
 * qualified teacher has listened, and is never set by a script. Review fields
 * are left for the reviewer to fill in.
 *
 * It does not judge whether anything is recited correctly, and must not be
 * extended to. Run scripts/validate-qaida-audio.ts after pasting the entries.
 */
import { readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { qaidaAudioTargets, targetIdFromRecordingFileName } from "../shared/qaidaAudioTargets";
import { QAIDA_AUDIO_EXTENSIONS } from "../shared/qaidaAudioValidation";
import { QAIDA_RECORDINGS } from "../shared/qaidaAudioManifest";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const PUBLIC_ROOT = resolve("client/public");
const dir = resolve(flag("dir") ?? "client/public/audio/qaida");
const provenance = {
  speaker: flag("speaker") ?? "",
  qualification: flag("qualification") ?? "",
  source: flag("source") ?? "",
  recordedOn: flag("date") ?? "",
};

function walk(path: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(path);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = join(path, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const targets = new Map(qaidaAudioTargets().map((target) => [target.id, target]));
const alreadyInLedger = new Set(QAIDA_RECORDINGS.map((entry) => entry.targetId));
const files = walk(dir).filter((file) => (QAIDA_AUDIO_EXTENSIONS as readonly string[]).includes(extname(file).toLowerCase()));

const entries: string[] = [];
const problems: string[] = [];
for (const file of files.sort()) {
  const name = file.split(/[\\/]/).pop()!;
  const targetId = targetIdFromRecordingFileName(name);
  const target = targetId ? targets.get(targetId) : undefined;
  if (!targetId || !target) {
    problems.push(`${name}: not a file name from the recording sheet`);
    continue;
  }
  if (target.kind !== "instructional") {
    problems.push(`${name}: ${targetId} is a Quran word, which is never recorded for this app`);
    continue;
  }
  if (alreadyInLedger.has(targetId)) {
    problems.push(`${name}: ${targetId} already has a ledger entry; skipped`);
    continue;
  }
  const fromPublic = relative(PUBLIC_ROOT, file);
  if (fromPublic.startsWith("..")) {
    problems.push(`${name}: must be inside client/public/audio/qaida so the app can serve it`);
    continue;
  }
  const audioPath = `/${fromPublic.split(/[\\/]/).join("/")}`;
  entries.push(`  {
    targetId: ${JSON.stringify(targetId)},
    audioPath: ${JSON.stringify(audioPath)},
    status: "recorded",
    provenance: ${JSON.stringify(provenance)},
    notes: ${JSON.stringify(`${target.arabic} — ${target.gloss}`)},
  },`);
}

if (!provenance.speaker || !provenance.qualification || !provenance.source || !provenance.recordedOn) {
  problems.unshift("provenance is incomplete: pass --speaker, --qualification, --source and --date (it is required before anything can be approved)");
}

console.log(`// ${entries.length} recording(s) from ${relative(process.cwd(), dir) || "."} — paste into QAIDA_RECORDINGS`);
console.log(entries.join("\n"));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
}
const remaining = [...targets.values()].filter((target) => target.kind === "instructional" && !alreadyInLedger.has(target.id)).length - entries.length;
console.error(`\n${remaining} instructional target(s) still have no recording.`);
