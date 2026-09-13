/**
 * Corpus manifest loading + validation for the ASR bake-off.
 *
 * The manifest is the only thing a real recording needs to join the corpus:
 * drop the audio file into corpus/audio/ and add one entry. Audio files are
 * git-ignored — private recordings are never committed by accident.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { z } from "zod";
import type { CorpusManifest, ExpectedResult } from "./types";

const EXPECTED_RESULTS = [
  "correct",
  "omission",
  "substitution",
  "repetition",
  "hesitation",
  "other",
] as const satisfies readonly ExpectedResult[];

const intendedErrorSchema = z
  .object({
    wordIndex: z.number().int().positive(),
    kind: z.enum(["omitted", "substituted", "repeated"]),
  })
  .strict();

const sampleSchema = z
  .object({
    id: z.string().min(1).max(120),
    surah: z.number().int().min(1).max(114),
    ayah: z.number().int().min(1).max(286),
    canonicalArabic: z.string().min(1),
    expectedResult: z.enum(EXPECTED_RESULTS),
    intendedError: intendedErrorSchema.optional(),
    speaker: z.string().max(200).optional(),
    device: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
    audio: z.string().min(1).max(200),
  })
  .strict()
  .superRefine((sample, ctx) => {
    // An intended error only makes sense on a labelled non-correct sample.
    if (sample.intendedError && sample.expectedResult === "correct") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `sample "${sample.id}": intendedError must not be set on a "correct" sample`,
      });
    }
    if (
      (sample.expectedResult === "omission" ||
        sample.expectedResult === "substitution" ||
        sample.expectedResult === "repetition") &&
      !sample.intendedError
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `sample "${sample.id}": expectedResult "${sample.expectedResult}" should label intendedError (wordIndex + kind)`,
      });
    }
    // No path traversal: audio must be a bare filename inside corpus/audio/.
    if (sample.audio !== basename(sample.audio)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `sample "${sample.id}": audio must be a bare filename, got "${sample.audio}"`,
      });
    }
  });

const manifestSchema = z
  .object({
    version: z.literal(1),
    samples: z.array(sampleSchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    for (const sample of manifest.samples) {
      if (seen.has(sample.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate sample id "${sample.id}"`,
        });
      }
      seen.add(sample.id);
    }
  });

export type ManifestLoadResult =
  | { ok: true; manifest: CorpusManifest }
  | { ok: false; errors: string[] };

export function loadManifest(corpusDir: string): ManifestLoadResult {
  const manifestPath = join(corpusDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      errors: [`manifest not found: ${manifestPath} (see manifest.example.json)`],
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      errors: [
        `manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }
  return { ok: true, manifest: parsed.data };
}

/** Absolute path of a sample's audio file. */
export function sampleAudioPath(corpusDir: string, audio: string): string {
  return join(corpusDir, "audio", basename(audio));
}
