/**
 * Builds the recording kit to hand a qualified teacher or Qari.
 *
 *   npx tsx scripts/qaida-recording-kit.ts [output-dir]
 *
 * Writes, into output-dir (default ./qaida-recording-kit):
 *
 *   recording-sheet.html  printable: one card per recording, the Arabic large,
 *                         how it reads, and the exact file name to save it as;
 *                         grouped by level, with the recording protocol on top
 *   recording-list.csv    the same list as a spreadsheet, for tracking
 *
 * Only instructional targets are listed. Quran words are never recorded for
 * this app (docs/qaida-audio.md §7). File names come from recordingFileName, so
 * the delivered folder can be imported with scripts/import-qaida-recordings.ts
 * without anyone typing an id. Targets that already have an approved recording
 * are left out.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { QAIDA_LEVELS } from "../shared/qaidaCurriculum";
import { instructionalTargets, recordingFileName, type QaidaAudioTarget } from "../shared/qaidaAudioTargets";
import { approvedAudioPath } from "../shared/qaidaAudioManifest";

const outDir = resolve(process.argv[2] ?? "qaida-recording-kit");
const levelOrder = new Map(QAIDA_LEVELS.map((level) => [level.id, level.order]));
const levelTitle = new Map(QAIDA_LEVELS.map((level) => [level.id, level.title]));

const targets = instructionalTargets()
  .filter((target) => approvedAudioPath(target.id) === null)
  .sort((a, b) => (levelOrder.get(a.level) ?? 99) - (levelOrder.get(b.level) ?? 99));

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
const html = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const rows = [["n", "file_name", "target_id", "arabic", "reads_as", "category", "level", "lessons"].map(csvCell).join(",")];
targets.forEach((target, index) => {
  rows.push(
    [index + 1, recordingFileName(target.id), target.id, target.arabic, target.gloss, target.category, `${levelOrder.get(target.level)}. ${levelTitle.get(target.level)}`, target.lessonIds.join(" ")]
      .map(csvCell)
      .join(","),
  );
});

const byLevel = new Map<string, QaidaAudioTarget[]>();
for (const target of targets) byLevel.set(target.level, [...(byLevel.get(target.level) ?? []), target]);

let n = 0;
const sections = [...byLevel.entries()].map(([level, list]) => {
  const cards = list
    .map((target) => {
      n += 1;
      return `<div class="card"><div class="num">${n}</div><div class="ar" lang="ar" dir="rtl">${html(target.arabic)}</div><div class="gloss">${html(target.gloss)}</div><div class="file">${html(recordingFileName(target.id))}</div><div class="tick">☐ recorded</div></div>`;
    })
    .join("\n");
  return `<section><h2>Level ${levelOrder.get(level as never)} — ${html(levelTitle.get(level as never) ?? level)} <small>(${list.length})</small></h2><div class="grid">${cards}</div></section>`;
});

const sheet = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Qaida recording sheet</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri+Quran&display=swap" rel="stylesheet">
<style>
  body { font: 14px/1.45 system-ui, sans-serif; margin: 24px; color: #1d2a26; background: #fff; }
  h1 { margin: 0 0 4px; } h2 { margin: 28px 0 10px; border-bottom: 1px solid #ccd; padding-bottom: 4px; }
  .protocol { background: #f4f7f5; border: 1px solid #d8e2dc; padding: 12px 16px; border-radius: 8px; }
  .protocol li { margin: 2px 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
  .card { border: 1px solid #ccd; border-radius: 8px; padding: 10px; break-inside: avoid; position: relative; }
  .num { position: absolute; top: 6px; left: 8px; color: #889; font-size: 12px; }
  .ar { font-family: "Amiri Quran", "Amiri", serif; font-size: 30px; text-align: center; margin: 14px 0 12px; line-height: 2.2; }
  .gloss { text-align: center; color: #456; }
  .file { font-family: ui-monospace, monospace; font-size: 12px; text-align: center; margin-top: 6px; background: #f2f2f6; border-radius: 4px; padding: 2px 4px; word-break: break-all; }
  .tick { font-size: 12px; color: #667; margin-top: 6px; }
  @media print { body { margin: 10mm; } .card { page-break-inside: avoid; } }
</style></head><body>
<h1>Qaida recording sheet</h1>
<p>${targets.length} recordings for the app's Qaida course. Save each one under the file name printed on its card. Full protocol: <code>docs/qaida-audio.md</code>, sections 4 and 5.</p>
<div class="protocol"><strong>How to record</strong><ul>
  <li>Read only the exact text on the card, once. No bismillah, no English, nothing before or after.</li>
  <li>Bare letters: say the letter's <em>sound</em>, not its name. Keep every harakah exactly as written.</li>
  <li>Rows (several syllables separated by spaces): read them in order, right to left, at a steady teaching pace.</li>
  <li>Same voice, microphone and distance for the whole set. Quiet room. Trim silence to about 100 ms each end.</li>
  <li>MP3, m4a, ogg or wav; 44.1 kHz; 128 kbps or better. Mono is fine.</li>
  <li>Another qualified teacher reviews every recording before the app plays it. Quran words are not on this sheet: they are never recorded for the app.</li>
</ul></div>
${sections.join("\n")}
</body></html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "recording-list.csv"), `${rows.join("\n")}\n`);
writeFileSync(join(outDir, "recording-sheet.html"), sheet);
console.log(`Wrote ${targets.length} recordings to ${outDir}/recording-sheet.html and recording-list.csv`);
