/**
 * Generates the 112 Starter letter clips with OpenAI's text-to-speech API and
 * writes them into client/public/audio/letters/.
 *
 *   OPENAI_API_KEY=sk-... node scripts/generate-letter-audio.mjs
 *
 * This is a one-off, not part of `pnpm build`. The clips are committed as
 * static files and served like any other asset — nothing calls the API at
 * playback time, so the cost is 112 requests once, not one per learner.
 *
 * What is sent is the Arabic text, never a transliteration: "أَلِف", not
 * "Alif". A voice handed the English spelling reads it as English and produces
 * a sound that is not the letter — the whole reason the app stopped using
 * browser speech synthesis. The text for each clip comes from letterTable.mjs,
 * which mirrors letterSpeechText() in the app; a test pins the two together.
 *
 * Options
 *   --force            regenerate clips that already exist (default: skip them)
 *   --only=<slug,...>  restrict to some letters, e.g. --only=alif,ba
 *   --voice=<name>     override VOICE below
 *   --dry-run          print what would be generated, call nothing
 *
 * Re-running is cheap and safe: existing files are skipped unless --force, so
 * an interrupted run resumes where it stopped.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, everyRecording, speechText } from "./letterTable.mjs";

// ─── Configuration ─────────────────────────────────────────────────────────

/** Voice used for every clip. Keep one voice: 112 clips from two voices is a
 *  jarring alphabet. `onyx` and `alloy` both read Arabic acceptably. */
const VOICE = process.env.OPENAI_TTS_VOICE ?? "onyx";

/** gpt-4o-mini-tts is the cheapest model that accepts `instructions`. */
const MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";

/**
 * Steering for the voice. It is not read aloud.
 *
 * The single-syllable instruction matters: handed a bare vowelled glyph such as
 * "بَ", a model may read it as the letter's *name* ("bāʾ") instead of the
 * syllable *ba*, which is the wrong answer for the Fatha control.
 */
const INSTRUCTIONS =
  process.env.OPENAI_TTS_INSTRUCTIONS ??
  [
    "You are a patient Arabic teacher speaking to an absolute beginner.",
    "Read the given Arabic exactly as written, in Modern Standard Arabic, and say nothing else.",
    "When the text is a single vowelled letter, say that one syllable only — do not say the letter's name.",
    "Speak slowly and clearly, with a neutral, unhurried tone.",
  ].join(" ");

/**
 * Per-clip text overrides, keyed by filename without the extension.
 *
 * Listen to the output before handing it to a learner. If a clip says the wrong
 * thing — most likely a vowelled form read as the letter's name — put the text
 * that works here and re-run with --force. This is the tuning knob; the letter
 * table stays canonical.
 *
 *   "ba-fatha": "بَـ",
 */
const SPEECH_TEXT_OVERRIDES = {};

const API_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const OUT_DIR = path.join(ROOT, "client/public/audio/letters");
const MANIFEST = path.join(OUT_DIR, "generated.json");
const RETRIES = 3;

// ─── Arguments ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const force = has("--force");
const dryRun = has("--dry-run");
const voice = valueOf("voice") ?? VOICE;
const only = valueOf("only")?.split(",").map((slug) => slug.trim()).filter(Boolean);

const unknown = args.filter((arg) => !/^--(force|dry-run)$/.test(arg) && !/^--(voice|only)=/.test(arg));
if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(", ")}`);
  console.error("Usage: node scripts/generate-letter-audio.mjs [--force] [--dry-run] [--only=alif,ba] [--voice=onyx]");
  process.exit(2);
}

// ─── Work list ─────────────────────────────────────────────────────────────

const all = everyRecording();
const selected = only ? all.filter((item) => only.includes(item.slug)) : all;

if (only) {
  const known = new Set(all.map((item) => item.slug));
  const bad = only.filter((slug) => !known.has(slug));
  if (bad.length) {
    console.error(`Unknown letter slug(s): ${bad.join(", ")}`);
    process.exit(2);
  }
}

const jobs = selected.map((item) => {
  const key = item.file.replace(/\.mp3$/, "");
  return {
    ...item,
    key,
    text: SPEECH_TEXT_OVERRIDES[key] ?? speechText(item.letter, item.harakat),
    outPath: path.join(OUT_DIR, item.file),
  };
});

// Zero-byte counts as absent, not as done: an interrupted write leaves a file
// that exists, plays nothing, and would otherwise be skipped forever.
const isPresent = (file) => fs.existsSync(file) && fs.statSync(file).size > 0;
const present = jobs.filter((job) => isPresent(job.outPath));
const pending = force ? jobs : jobs.filter((job) => !present.includes(job));

console.log(`Model ${MODEL}, voice ${voice}`);
console.log(
  `${jobs.length} clip(s) selected, ${present.length} already present, ${pending.length} to generate` +
    `${force && present.length ? " (--force: existing clips are overwritten)" : ""}.\n`,
);

if (dryRun) {
  for (const job of jobs) console.log(`${job.file.padEnd(18)} ${job.text}`);
  process.exit(0);
}

if (!pending.length) {
  console.log("Nothing to do. Pass --force to regenerate.");
  process.exit(0);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is not set.\n");
  console.error("  OPENAI_API_KEY=sk-... node scripts/generate-letter-audio.mjs\n");
  console.error("Set OPENAI_BASE_URL too if you are pointing at a gateway or a test double.");
  process.exit(1);
}

// ─── Generate ──────────────────────────────────────────────────────────────

/** One clip. Retries on 429 and 5xx, which are the failures worth retrying. */
async function synthesise(job) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${API_BASE_URL}/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        voice,
        input: job.text,
        instructions: INSTRUCTIONS,
        response_format: "mp3",
      }),
    });

    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer());
      // A 200 carrying nothing would otherwise be written as a 0-byte mp3 that
      // fails silently in the browser months later.
      if (!bytes.length) throw new Error("API returned an empty body");
      return bytes;
    }

    const retriable = response.status === 429 || response.status >= 500;
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    if (!retriable || attempt > RETRIES) {
      throw new Error(`HTTP ${response.status} ${detail}`);
    }
    const waitMs = 2 ** attempt * 500;
    console.log(`  ${job.file}: HTTP ${response.status}, retrying in ${waitMs}ms (${attempt}/${RETRIES})`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf-8")) : {};
manifest.model = MODEL;
manifest.voice = voice;
manifest.instructions = INSTRUCTIONS;
manifest.generatedAt = new Date().toISOString();
manifest.clips ??= {};

const failures = [];
for (const [index, job] of pending.entries()) {
  const position = `${String(index + 1).padStart(3)}/${pending.length}`;
  try {
    const bytes = await synthesise(job);
    fs.writeFileSync(job.outPath, bytes);
    manifest.clips[job.file] = { text: job.text, bytes: bytes.length, voice, model: MODEL };
    console.log(`${position}  ok    ${job.file.padEnd(18)} ${job.text.padEnd(8)} ${(bytes.length / 1024).toFixed(1)} KB`);
  } catch (error) {
    failures.push({ job, error });
    console.log(`${position}  FAIL  ${job.file.padEnd(18)} ${String(error.message ?? error)}`);
  }
  // Written every clip, so an interrupted run still records what it produced.
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(`\n${pending.length - failures.length}/${pending.length} generated into ${path.relative(ROOT, OUT_DIR)}/`);
console.log(`Provenance written to ${path.relative(ROOT, MANIFEST)}.`);

if (failures.length) {
  console.log(`\n${failures.length} failed. Re-run to retry just those — existing clips are skipped:\n`);
  console.log(`  node scripts/generate-letter-audio.mjs --only=${[...new Set(failures.map((f) => f.job.slug))].join(",")}`);
  process.exit(1);
}

console.log("\nListen before shipping — a vowelled form read as the letter's name is the");
console.log("likely mistake. Fix the text in SPEECH_TEXT_OVERRIDES and re-run with --force.");
