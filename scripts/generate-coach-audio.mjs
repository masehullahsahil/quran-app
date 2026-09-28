#!/usr/bin/env node
/**
 * Pre-generate the coaching voice's entire spoken corpus with Azure AI
 * Speech, once, into server/coach-audio/.
 *
 * The teacher's voice is synthesize-once/cache-forever: every unique
 * (voice, sentence) pair is generated exactly once and served from disk
 * after that, so the long-term cost of the voice is ~$0 (the free-service
 * goal). This script fills the cache up front so no learner's lesson ever
 * waits on a first synthesis — and, more importantly, it verifies the
 * voice mapping against the region's real voice catalog before anything
 * teaches.
 *
 * What it does:
 *   1. Enumerates every SPEAKABLE_COACH_KEYS key × all 5 languages, with
 *      bounded param variants (see below) — the closed corpus.
 *   2. With --dry-run: resolves every sentence, prints the count, total
 *      characters, and estimated one-time cost. Needs NO Azure key.
 *   3. Without --dry-run: lists the region's voices and FAILS LOUDLY if
 *      any mapped voice is missing (catalogs change; remembered docs
 *      don't — especially the fa-AF → fa-IR-DilaraNeural assumption).
 *      Then synthesizes each missing file through the same code path the
 *      server uses, writing <sha256>.mp3 files the runtime cache reads.
 *
 * Param variants (kept finite):
 *   - feedback.coachPerfectSpoken / feedback.coachGoodSpoken take
 *     {nextStep}: one variant per SPEAKABLE_COACH_PARAM_KEYS key.
 *   - feedback.nextStepRepeatFromWord takes {word: n}: n = 1..30. Word
 *     positions beyond 30 synthesize on first request at runtime and join
 *     the cache — the cache is the backstop, this script is the warm-up.
 *
 * NEVER synthesizes Quran text: sentences come only from the locale packs
 * via resolveCoachTextRef, for allowlisted keys. There is no text input.
 *
 * Usage:
 *   node scripts/generate-coach-audio.mjs --dry-run
 *   AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=... node scripts/generate-coach-audio.mjs
 */
import { register } from "tsx/esm/api";
register();

import { existsSync } from "node:fs";
import { join } from "node:path";

const [{ resolveCoachTextRef }, coachSpeech, azure] = await Promise.all([
  import("../server/coachLocale.ts"),
  import("../shared/coachSpeech.ts"),
  import("../server/azureCoachVoice.ts"),
]);

const { SPEAKABLE_COACH_KEYS, SPEAKABLE_COACH_PARAM_KEYS } = coachSpeech;
const {
  AZURE_COACH_VOICES,
  coachAudioCacheKey,
  createAzureCoachSynthesizer,
  createCachedCoachSynthesizer,
  listAzureVoices,
} = azure;

const LANGUAGES = ["en", "ps", "fa-AF", "ur", "ar"];
const KEYS_WITH_NEXT_STEP = new Set(["feedback.coachPerfectSpoken", "feedback.coachGoodSpoken"]);
const MAX_PREGEN_WORD_INDEX = 30;
// Azure neural TTS pay-as-you-go is ~$15 per 1M characters (free tier covers
// 500K neural chars/month). Verify against the current pricing page before
// budgeting — this is an estimate, printed for visibility.
const USD_PER_MILLION_CHARS = 15;

const CACHE_DIR = join(process.cwd(), "server", "coach-audio");

function fail(message) {
  console.error(`\nFATAL: ${message}`);
  process.exit(1);
}

/** Every (key, language, params) the teacher can ever be asked to say. */
function enumerateCorpus() {
  const items = [];
  for (const key of SPEAKABLE_COACH_KEYS) {
    for (const language of LANGUAGES) {
      if (KEYS_WITH_NEXT_STEP.has(key)) {
        for (const nextStepKey of SPEAKABLE_COACH_PARAM_KEYS) {
          if (nextStepKey === "feedback.nextStepRepeatFromWord") {
            for (let word = 1; word <= MAX_PREGEN_WORD_INDEX; word += 1) {
              items.push({
                key,
                language,
                params: { nextStep: { key: nextStepKey, params: { word } } },
              });
            }
          } else {
            items.push({ key, language, params: { nextStep: { key: nextStepKey } } });
          }
        }
      } else {
        items.push({ key, language, params: undefined });
      }
    }
  }
  return items;
}

function resolveItems(items) {
  return items.map((item) => ({
    ...item,
    text: resolveCoachTextRef(item.language, { key: item.key, params: item.params }),
  }));
}

const dryRun = process.argv.includes("--dry-run");
const items = resolveItems(enumerateCorpus());
const totalChars = items.reduce((sum, item) => sum + item.text.length, 0);
const empty = items.filter((item) => !item.text.trim());

if (empty.length > 0) {
  fail(
    `${empty.length} corpus items resolved to empty text, e.g. ${empty[0].key} (${empty[0].language}). ` +
      "Refusing to synthesize silence — check the locale packs.",
  );
}

console.log(`Corpus: ${items.length} utterances across ${LANGUAGES.length} languages`);
console.log(`Total characters: ${totalChars.toLocaleString("en-US")}`);
console.log(
  `Estimated one-time cost: $${((totalChars / 1_000_000) * USD_PER_MILLION_CHARS).toFixed(2)} ` +
    `(at $${USD_PER_MILLION_CHARS}/1M chars; free tier covers 500K neural chars/month)`,
);

if (dryRun) {
  console.log("\n--dry-run: no Azure calls made, nothing written.");
  process.exit(0);
}

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;
if (!key || !region) {
  fail("AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be set (omit --dry-run only with a key).");
}

// Fail loudly on a missing voice BEFORE synthesizing anything: a sentence
// rendered through the wrong voice is worse than on-screen text.
const available = await listAzureVoices(key, region);
if (!available) {
  fail(`could not list voices for region "${region}" — check the key and region.`);
}
const missing = Object.entries(AZURE_COACH_VOICES).filter(([, voice]) => !available.includes(voice));
if (missing.length > 0) {
  fail(
    `mapped voice(s) missing from region "${region}": ` +
      missing.map(([lang, voice]) => `${lang} → ${voice}`).join(", ") +
      ". Update AZURE_COACH_VOICES in server/azureCoachVoice.ts and re-run.",
  );
}
console.log(`Voice check passed: all ${Object.keys(AZURE_COACH_VOICES).length} mapped voices available in ${region}.`);

const synthesizer = createAzureCoachSynthesizer({ AZURE_SPEECH_KEY: key, AZURE_SPEECH_REGION: region });
if (!synthesizer) fail("synthesizer factory returned null despite a key being set — bug.");
const cached = createCachedCoachSynthesizer(synthesizer, CACHE_DIR);
if (!cached) fail("cached synthesizer factory returned null despite a key being set — bug.");

let synthesized = 0;
let skipped = 0;
let failed = 0;
let synthesizedChars = 0;
for (const item of items) {
  const voice = AZURE_COACH_VOICES[item.language];
  const file = join(CACHE_DIR, `${coachAudioCacheKey(voice, item.text)}.mp3`);
  if (existsSync(file)) {
    skipped += 1;
    continue;
  }
  const audio = await cached(item.text, item.language);
  if (audio) {
    synthesized += 1;
    synthesizedChars += item.text.length;
  } else {
    failed += 1;
    console.error(`  FAILED: ${item.key} (${item.language})`);
  }
}

console.log(`\nDone: ${synthesized} synthesized, ${skipped} already cached, ${failed} failed.`);
console.log(`Characters synthesized this run: ${synthesizedChars.toLocaleString("en-US")}`);
if (failed > 0) process.exit(1);
