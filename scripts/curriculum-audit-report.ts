/**
 * Prints the curriculum review report a teacher can work from on paper.
 *
 * The web workspace at /curriculum-audit is the fast way to review; this is the
 * same inventory as one Markdown document, for a reviewer who would rather read
 * offline, annotate a printout, or check a colleague's exported ledger.
 *
 *   pnpm audit:qaida                          # the whole inventory
 *   pnpm audit:qaida --level harakat          # one level
 *   pnpm audit:qaida --ledger audit.json      # with the reviews recorded so far
 *   pnpm audit:qaida --pending                # only what is still unreviewed
 *   pnpm audit:qaida --out review.md          # write instead of printing
 *
 * It reports. It never approves: a report generated from an empty ledger says,
 * in as many words, that no part of this curriculum has been approved by a
 * qualified teacher.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  AUDIT_CATEGORY_LABELS,
  PROVENANCE_LABELS,
  REVIEW_STATUS_LABELS,
  approvalStatement,
  auditProgress,
  itemsForLevel,
  latestRecord,
  provenanceOf,
  statusOf,
  type AuditItem,
  type AuditLedger,
} from "../shared/curriculumAudit";
import { CURRICULUM_AUDIT_INVENTORY } from "../shared/curriculumAuditInventory";
import { AUDIT_FINDINGS, findingsForItem } from "../shared/curriculumAuditFindings";
import { QAIDA_LESSONS, QAIDA_LEVELS, getQaidaLesson, lessonOrder } from "../shared/qaidaCurriculum";

type Options = { levelId?: string; ledgerPath?: string; pendingOnly: boolean; outPath?: string };

function parseArgs(argv: string[]): Options {
  const options: Options = { pendingOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--level") options.levelId = argv[++index];
    else if (arg === "--ledger") options.ledgerPath = argv[++index];
    else if (arg === "--out") options.outPath = argv[++index];
    else if (arg === "--pending") options.pendingOnly = true;
  }
  return options;
}

function loadLedger(path: string | undefined): AuditLedger {
  if (!path) return { records: [] };
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const records = Array.isArray(parsed) ? parsed : (parsed as { records?: unknown })?.records;
    return { records: Array.isArray(records) ? (records as AuditLedger["records"]) : [] };
  } catch (error) {
    console.error(`Could not read the ledger at ${path}: ${String(error)}`);
    return { records: [] };
  }
}

function renderItem(item: AuditItem, ledger: AuditLedger): string[] {
  const lines: string[] = [];
  const status = statusOf(item.id, ledger);
  const provenance = provenanceOf(item.id, ledger);

  lines.push(`#### ${item.label}`);
  lines.push("");
  lines.push(`- id: \`${item.id}\` · kind: ${item.kind}`);
  lines.push(`- status: **${REVIEW_STATUS_LABELS[status]}** · provenance: **${PROVENANCE_LABELS[provenance]}**`);
  lines.push(`- categories: ${item.categories.map((category) => AUDIT_CATEGORY_LABELS[category]).join("; ")}`);
  lines.push(`- source: \`${item.sourcePath}\``);
  if (item.arabic) {
    lines.push("");
    lines.push(`> ${item.arabic}`);
    const meta = [
      item.arabicSource === "quran" ? "Quran" : item.arabicSource ? "Teaching example" : null,
      item.quranReference ? `reference ${item.quranReference}` : null,
      item.gloss ? `gloss: ${item.gloss}` : null,
    ].filter(Boolean);
    if (meta.length) lines.push(`> — ${meta.join(" · ")}`);
  }
  if (item.content) {
    lines.push("");
    lines.push(item.content);
  }
  if (item.expectedAnswer) {
    lines.push("");
    lines.push(`**Counted correct:** ${item.expectedAnswer}`);
  }

  const findings = findingsForItem(item.id);
  for (const finding of findings) {
    lines.push("");
    lines.push(`> **Question raised for you (${finding.severity}):** ${finding.observation}`);
    lines.push(`> ${finding.question}`);
    lines.push("> _Raised automatically while building this inventory — not a teacher's opinion._");
  }

  const record = latestRecord(item.id, ledger);
  if (record) {
    lines.push("");
    lines.push(
      `**Recorded review** — ${REVIEW_STATUS_LABELS[record.status]}, ${AUDIT_CATEGORY_LABELS[record.category]}, ${record.severity}, ${record.impact === "curriculum-logic" ? "affects curriculum logic" : "wording only"}`,
    );
    if (record.comment) lines.push(`> ${record.comment}`);
    if (record.proposedCorrection) lines.push(`> Proposed: ${record.proposedCorrection}`);
    lines.push(
      `> — ${record.reviewer.name}${record.reviewer.qualification ? `, ${record.reviewer.qualification}` : ""}, ${record.reviewedAt.slice(0, 10)}`,
    );
  } else {
    lines.push("");
    lines.push("_No review recorded. Status, comment, proposed correction, severity, impact: _______________________");
  }
  lines.push("");
  return lines;
}

function render(options: Options): string {
  const ledger = loadLedger(options.ledgerPath);
  const all = CURRICULUM_AUDIT_INVENTORY;
  const levels = options.levelId ? QAIDA_LEVELS.filter((level) => level.id === options.levelId) : QAIDA_LEVELS;
  const progress = auditProgress(all, ledger);
  const exerciseCount = QAIDA_LESSONS.reduce((total, lesson) => total + lesson.practice.length, 0);

  const lines: string[] = [
    "# Qaida curriculum — teacher review report",
    "",
    `Generated ${new Date().toISOString().slice(0, 10)} from \`shared/qaidaCurriculum.ts\` and \`locales/en\`.`,
    "",
    `> ${approvalStatement(all, ledger)}`,
    "",
    "This report is an inventory, not an endorsement. Automated tests in this repository check that the curriculum data is well formed — that the Arabic is not malformed, that no lesson shows a mark it has not taught, that every Quran reference points at a real ayah. None of that is review by a qualified teacher, and nothing in this document should be read as such.",
    "",
    "## What is in the audit",
    "",
    `| Levels | Lessons | Practice items | Review items |`,
    `|---|---|---|---|`,
    `| ${QAIDA_LEVELS.length} | ${QAIDA_LESSONS.length} | ${exerciseCount} | ${progress.total} |`,
    "",
    "| Status | Items |",
    "|---|---|",
    ...Object.entries(progress.byStatus).map(([status, count]) => `| ${REVIEW_STATUS_LABELS[status as keyof typeof REVIEW_STATUS_LABELS]} | ${count} |`),
    "",
    "| Provenance | Items |",
    "|---|---|",
    ...Object.entries(progress.byProvenance).map(([provenance, count]) => `| ${PROVENANCE_LABELS[provenance as keyof typeof PROVENANCE_LABELS]} | ${count} |`),
    "",
    `## Questions raised for the teacher (${AUDIT_FINDINGS.length})`,
    "",
    "These were noticed while building the inventory. Each is a question, not a correction: the curriculum has been left exactly as it was.",
    "",
  ];

  for (const finding of AUDIT_FINDINGS) {
    lines.push(`### ${finding.id} (${finding.severity})`);
    lines.push("");
    lines.push(finding.observation);
    lines.push("");
    lines.push(`**To decide:** ${finding.question}`);
    lines.push("");
    if (finding.itemIds.length) lines.push(`Items: ${finding.itemIds.slice(0, 8).map((id) => `\`${id}\``).join(", ")}${finding.itemIds.length > 8 ? ` … and ${finding.itemIds.length - 8} more` : ""}`);
    if (finding.sourcePath) lines.push(`Source: \`${finding.sourcePath}\``);
    lines.push("");
  }

  for (const level of [...levels].sort((left, right) => left.order - right.order)) {
    const items = itemsForLevel(all, level.id).filter(
      (item) => !options.pendingOnly || statusOf(item.id, ledger) === "pending-review",
    );
    if (!items.length) continue;

    lines.push(`## Level ${level.order} — ${level.title} (${level.arabicTitle})`);
    lines.push("");
    lines.push(level.objective);
    lines.push("");

    const levelScope = items.filter((item) => !item.lessonId);
    if (levelScope.length) {
      lines.push("### Level scope");
      lines.push("");
      for (const item of levelScope) lines.push(...renderItem(item, ledger));
    }

    const lessonIds = [...new Set(items.map((item) => item.lessonId).filter((id): id is string => Boolean(id)))];
    for (const lessonId of lessonIds) {
      const lesson = getQaidaLesson(lessonId);
      lines.push(`### Lesson ${lessonOrder(lessonId)} — ${lesson?.title ?? lessonId} (\`${lessonId}\`)`);
      lines.push("");
      if (lesson) lines.push(`Stages: ${lesson.stages.join(" → ")} · ${lesson.practice.length} practice items`);
      lines.push("");
      for (const item of items.filter((entry) => entry.lessonId === lessonId)) lines.push(...renderItem(item, ledger));
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "Record your decisions in the review workspace at `/curriculum-audit`, or return this document annotated. Approval is recorded per item, in your name, with your qualification and your own attestation — it is never inferred from silence, from a passing test suite, or from this report having been generated.",
  );
  lines.push("");
  return lines.join("\n");
}

const options = parseArgs(process.argv.slice(2));
const report = render(options);
if (options.outPath) {
  writeFileSync(options.outPath, report, "utf8");
  console.log(`Wrote ${options.outPath}`);
} else {
  console.log(report);
}
