/**
 * How much of the Qaida a learner can actually hear.
 *
 * Deterministic: the same curriculum and the same ledger always produce the
 * same report, so it can be printed in CI, pasted into a hand-off, and diffed
 * between deliveries.
 *
 * The one editorial rule: **nothing counts as approved unless the ledger says a
 * named, qualified reviewer approved it.** A delivered file counts as recorded
 * and no more. Counting files as coverage is how a course ends up claiming a
 * teacher stands behind a machine voice.
 */
import { QAIDA_LEVELS, type QaidaLevelId } from "./qaidaCurriculum";
import {
  buildQaidaAudioManifest,
  QAIDA_RECORDINGS,
  type QaidaAudioManifestEntry,
  type QaidaRecordingEntry,
} from "./qaidaAudioManifest";
import type { QaidaAudioCategory } from "./qaidaAudioTargets";

export type QaidaCoverageCounts = {
  targets: number;
  recorded: number;
  reviewed: number;
  approved: number;
  missing: number;
};

export type QaidaLevelCoverage = QaidaCoverageCounts & {
  levelId: QaidaLevelId;
  order: number;
  title: string;
};

export type QaidaCategoryCoverage = QaidaCoverageCounts & { category: QaidaAudioCategory };

export type QaidaAudioCoverage = {
  /** Every target, instructional and Quranic alike. */
  total: QaidaCoverageCounts;
  /** The half a teacher is asked to record for this app. */
  instructional: QaidaCoverageCounts;
  /**
   * The Quranic words the curriculum quotes. Never recorded here: they are
   * served by the app's Quran audio source or they are unavailable.
   */
  quran: QaidaCoverageCounts;
  /** All twelve levels, in course order, present whether or not they have targets. */
  byLevel: QaidaLevelCoverage[];
  byCategory: QaidaCategoryCoverage[];
};

const EMPTY: QaidaCoverageCounts = { targets: 0, recorded: 0, reviewed: 0, approved: 0, missing: 0 };

/**
 * Counts one entry.
 *
 * The statuses are cumulative in the direction that matters: an approved
 * recording has also been reviewed and recorded, and reporting it only as
 * "approved" would make the recorded column shrink as reviews land.
 */
function tally(counts: QaidaCoverageCounts, entry: QaidaAudioManifestEntry): QaidaCoverageCounts {
  const status = entry.status;
  return {
    targets: counts.targets + 1,
    recorded: counts.recorded + (status === "missing" ? 0 : 1),
    reviewed: counts.reviewed + (status === "reviewed" || status === "approved" ? 1 : 0),
    // Only a recording that would actually be played counts as approved, so a
    // status of "approved" with no reviewer named cannot inflate the number.
    approved: counts.approved + (entry.playable ? 1 : 0),
    missing: counts.missing + (status === "missing" ? 1 : 0),
  };
}

export function qaidaAudioCoverage(
  recordings: readonly QaidaRecordingEntry[] = QAIDA_RECORDINGS,
): QaidaAudioCoverage {
  const manifest = buildQaidaAudioManifest(recordings);

  let total = { ...EMPTY };
  let instructional = { ...EMPTY };
  let quran = { ...EMPTY };
  const levels = new Map<QaidaLevelId, QaidaCoverageCounts>();
  const categories = new Map<QaidaAudioCategory, QaidaCoverageCounts>();

  // Every level appears, including one with nothing to hear yet: a level that
  // silently vanished from the report would look finished.
  for (const level of QAIDA_LEVELS) levels.set(level.id, { ...EMPTY });

  for (const entry of manifest) {
    total = tally(total, entry);
    if (entry.target.kind === "quran") quran = tally(quran, entry);
    else instructional = tally(instructional, entry);
    levels.set(entry.target.level, tally(levels.get(entry.target.level) ?? { ...EMPTY }, entry));
    categories.set(entry.target.category, tally(categories.get(entry.target.category) ?? { ...EMPTY }, entry));
  }

  return {
    total,
    instructional,
    quran,
    byLevel: QAIDA_LEVELS.map((level) => ({
      levelId: level.id,
      order: level.order,
      title: level.title,
      ...(levels.get(level.id) ?? EMPTY),
    })),
    byCategory: Array.from(categories.entries())
      .map(([category, counts]) => ({ category, ...counts }))
      .sort((left, right) => left.category.localeCompare(right.category)),
  };
}

/** The report as text, for a terminal or a hand-off document. */
export function formatQaidaAudioCoverage(coverage: QaidaAudioCoverage): string {
  const lines: string[] = [];
  const row = (label: string, counts: QaidaCoverageCounts) =>
    `${label.padEnd(34)} ${String(counts.targets).padStart(5)} ${String(counts.recorded).padStart(9)} ${String(counts.reviewed).padStart(9)} ${String(counts.approved).padStart(9)} ${String(counts.missing).padStart(8)}`;

  lines.push("Qaida reference audio coverage");
  lines.push("");
  lines.push(`${"".padEnd(34)} ${"targets".padStart(5)} ${"recorded".padStart(9)} ${"reviewed".padStart(9)} ${"approved".padStart(9)} ${"missing".padStart(8)}`);
  lines.push("-".repeat(80));
  lines.push(row("ALL", coverage.total));
  lines.push(row("  instructional (record for us)", coverage.instructional));
  lines.push(row("  Quran words (Quran audio only)", coverage.quran));
  lines.push("");
  lines.push("By level");
  for (const level of coverage.byLevel) lines.push(row(`  ${level.order}. ${level.title}`, level));
  lines.push("");
  lines.push("By category");
  for (const category of coverage.byCategory) lines.push(row(`  ${category.category}`, category));
  return lines.join("\n");
}
