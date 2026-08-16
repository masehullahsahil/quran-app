/**
 * Guards the hand-off document against drift.
 *
 * docs/letter-recordings.md is what the reciter records from. If it ever lists a
 * filename the app does not ask for — or misses one it does — recordings come
 * back that silently never play. This test is the reason the doc is generated
 * rather than hand-maintained.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allLetterAudioPaths } from "./arabicLetters";

const doc = fs.readFileSync(
  path.resolve(import.meta.dirname, "../../../docs/letter-recordings.md"),
  "utf-8",
);

const expectedFilenames = allLetterAudioPaths().map((audioPath) => audioPath.split("/").pop() as string);

describe("docs/letter-recordings.md", () => {
  it("lists every recording the app can request", () => {
    const missing = expectedFilenames.filter((filename) => !doc.includes(`\`${filename}\``));
    expect(missing).toEqual([]);
  });

  it("lists no recording the app never requests", () => {
    const listed = [...doc.matchAll(/`([a-z-]+\.mp3)`/g)].map((match) => match[1]);
    const unique = [...new Set(listed)];
    const unexpected = unique.filter((filename) => !expectedFilenames.includes(filename));
    expect(unexpected).toEqual([]);
    expect(unique).toHaveLength(112);
  });

  it("tells the reciter where the files go", () => {
    expect(doc).toContain("client/public/audio/letters/");
  });
});
