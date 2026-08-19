/**
 * Reads the letter table out of client/src/lib/arabicLetters.ts for the build
 * scripts.
 *
 * The table is TypeScript and the scripts are plain node, so this parses the
 * literal rather than importing it. Fields are matched individually and by
 * name: the previous approach — one regex pinning the whole entry in field
 * order — silently matched nothing the first time a field was added, and a
 * generator that finds zero letters is a confusing way to learn that.
 */
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..");

export const HARAKAT = [
  { id: "fatha", label: "Fatha", mark: "َ", hint: "short a" },
  { id: "kasra", label: "Kasra", mark: "ِ", hint: "short i" },
  { id: "damma", label: "Damma", mark: "ُ", hint: "short u" },
];

const FIELDS = ["letter", "name", "slug", "transliteration", "sound", "arabicName"];

export function readLetters() {
  const source = fs.readFileSync(path.join(ROOT, "client/src/lib/arabicLetters.ts"), "utf-8");
  const body = source.match(/ARABIC_LETTERS: ArabicLetter\[\] = \[([\s\S]*?)\n\];/)?.[1];
  if (!body) throw new Error("Could not find ARABIC_LETTERS in arabicLetters.ts — has the table changed shape?");

  const letters = [...body.matchAll(/\{([^}]*)\}/g)].map(([, entry]) => {
    const fields = Object.fromEntries(FIELDS.map((field) => {
      const value = entry.match(new RegExp(`\\b${field}: "([^"]*)"`))?.[1];
      if (value === undefined) throw new Error(`Letter entry is missing "${field}": {${entry}}`);
      return [field, value];
    }));
    return fields;
  });

  if (letters.length !== 28) {
    throw new Error(`Expected 28 letters in arabicLetters.ts, found ${letters.length}`);
  }
  return letters;
}

/**
 * Every recording, in the order the reciter's list and the generator both use.
 * `harakat` is null for the letter on its own.
 */
export function everyRecording() {
  const recordings = [];
  for (const letter of readLetters()) {
    recordings.push({ letter, harakat: null, slug: letter.slug, file: `${letter.slug}.mp3` });
    for (const harakat of HARAKAT) {
      recordings.push({ letter, harakat, slug: letter.slug, file: `${letter.slug}-${harakat.id}.mp3` });
    }
  }
  return recordings;
}

/**
 * The Arabic text a speech engine is given for one recording. Mirrors
 * letterSpeechText() in client/src/lib/arabicLetters.ts — a test pins the two
 * together so a change on one side cannot silently regenerate different audio.
 */
export function speechText(letter, harakat) {
  return harakat ? `${letter.letter}${harakat.mark}` : letter.arabicName;
}
