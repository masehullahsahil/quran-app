/**
 * Prints a translator-ready key list for a locale pack, taken from the English
 * reference pack so it can never list a key the app does not use.
 *
 *   node scripts/scaffold-locale.mjs ur          # keys the pack is missing
 *   node scripts/scaffold-locale.mjs ur --full   # every key, translated or not
 *
 * Output is commented TypeScript, ready to paste into locales/<code>/index.ts.
 * It is printed rather than written, so an existing pack is never overwritten.
 */
import fs from "node:fs";
import path from "node:path";

const [, , code, flag] = process.argv;
if (!code) {
  console.error("Usage: node scripts/scaffold-locale.mjs <locale-code> [--full]");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const readPack = (file) => fs.readFileSync(path.join(root, file), "utf-8");

// The packs are TypeScript modules, so read the string literals directly rather
// than compiling them just to list keys.
function parseStrings(source) {
  const entries = [];
  let section = "";
  for (const line of source.split("\n")) {
    const heading = line.match(/^\s*\/\/\s*--\s*(.+?)\s*-+\s*$/);
    if (heading) {
      section = heading[1];
      continue;
    }
    const entry = line.match(/^\s*"([\w.]+)":\s*"(.*)",?\s*$/);
    if (entry) entries.push({ key: entry[1], value: entry[2], section });
  }
  return entries;
}

const reference = parseStrings(readPack("locales/en/index.ts"));
if (!reference.length) {
  console.error("No strings found in locales/en/index.ts — has the format changed?");
  process.exit(1);
}

const targetFile = `locales/${code}/index.ts`;
const translated = new Set();
if (fs.existsSync(path.join(root, targetFile))) {
  for (const entry of parseStrings(readPack(targetFile))) {
    if (entry.value.trim()) translated.add(entry.key);
  }
}

const wanted = flag === "--full" ? reference : reference.filter((entry) => !translated.has(entry.key));
if (!wanted.length) {
  console.log(`locales/${code} covers all ${reference.length} keys. Nothing to add.`);
  process.exit(0);
}

const width = Math.max(...wanted.map((entry) => entry.key.length)) + 3;
let lastSection = null;
const lines = [];
for (const entry of wanted) {
  if (entry.section !== lastSection) {
    if (lines.length) lines.push("");
    lines.push(`  // -- ${entry.section} ${"-".repeat(Math.max(2, 66 - entry.section.length))}`);
    lastSection = entry.section;
  }
  lines.push(`  // ${`"${entry.key}":`.padEnd(width)} "", // EN: ${entry.value}`);
}

console.log(`// ${wanted.length} of ${reference.length} keys ${flag === "--full" ? "in the English pack" : `still untranslated in ${code}`}.`);
console.log(`// Paste into ${targetFile}, uncomment a line, replace the English with the ${code} text.`);
console.log(lines.join("\n"));
