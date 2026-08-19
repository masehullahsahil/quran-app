/**
 * HEADs every URL the active letter-audio source produces and reports which
 * resolve.
 *
 *   node scripts/check-letter-audio.mjs
 *
 * This exists because the placeholder source's URL pattern was written without
 * being able to reach islamcan.com. Run this from a network that can, and it
 * will tell you in one pass whether the pattern is right — and exactly which
 * letters need an entry in FILE_NAME_OVERRIDES if it is not.
 *
 * Exits non-zero if anything is unreachable, so it can gate a deploy.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "client/src/lib/letterAudioSources.ts"), "utf-8");
const letters = fs.readFileSync(path.join(root, "client/src/lib/arabicLetters.ts"), "utf-8");

// Read the config out of the TS module rather than compiling it.
const value = (name) => source.match(new RegExp(`const ${name} = "([^"]*)"`))?.[1];
const activeId = source.match(/ACTIVE_LETTER_AUDIO_SOURCE: LetterAudioSource = (\w+)/)?.[1];
const slugs = [...letters.matchAll(/slug: "([a-z]+)"/g)].map((m) => m[1]);

if (!slugs.length) {
  console.error("No letter slugs found — has arabicLetters.ts changed shape?");
  process.exit(1);
}

const overrides = Object.fromEntries(
  [...(source.match(/FILE_NAME_OVERRIDES[^{]*\{([\s\S]*?)\n\};/)?.[1] ?? "").matchAll(/^\s*(\w+):\s*"([^"]+)"/gm)]
    .map((m) => [m[1], m[2]]),
);

if (activeId === "HAFIZ_RECORDINGS") {
  const dir = path.join(root, "client/public/audio/letters");
  const missing = slugs.filter((slug) => !fs.existsSync(path.join(dir, `${slug}.mp3`)));
  console.log(`Active source: HAFIZ_RECORDINGS (local files in ${path.relative(root, dir)})`);
  console.log(missing.length ? `Missing ${missing.length}/${slugs.length}: ${missing.join(", ")}` : "All present.");
  process.exit(missing.length ? 1 : 0);
}

const base = value("ISLAMCAN_BASE_URL");
const ext = value("ISLAMCAN_EXTENSION");
console.log(`Active source: ${activeId}\nPattern: ${base}/{name}.${ext}\n`);

const results = await Promise.all(slugs.map(async (slug) => {
  const name = overrides[slug] ?? slug;
  const url = `${base}/${name}.${ext}`;
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow" });
    return { slug, url, ok: response.ok, status: response.status, type: response.headers.get("content-type") };
  } catch (error) {
    return { slug, url, ok: false, status: 0, type: null, error: String(error) };
  }
}));

const bad = results.filter((r) => !r.ok || !/audio|octet-stream/i.test(r.type ?? ""));
for (const r of results) {
  const mark = bad.includes(r) ? "FAIL" : "ok  ";
  console.log(`${mark} ${r.slug.padEnd(6)} ${r.status || "ERR"} ${r.type ?? ""}  ${r.url}`);
}

console.log(`\n${results.length - bad.length}/${results.length} resolved.`);
if (bad.length) {
  console.log("\nAdd the correct filenames to FILE_NAME_OVERRIDES in");
  console.log("client/src/lib/letterAudioSources.ts, e.g.:\n");
  console.log(bad.map((r) => `  ${r.slug}: "THEIR_FILENAME",`).join("\n"));
}
process.exit(bad.length ? 1 : 0);
