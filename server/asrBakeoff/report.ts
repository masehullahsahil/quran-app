/**
 * Markdown report formatting for the ASR bake-off.
 *
 * The report is the human-readable artifact; bakeoff JSON is written
 * alongside it for machine consumption. Transcripts appear in the report
 * because the operator supplied the corpus — they are never sent anywhere.
 */
import type {
  AdapterAggregateMetrics,
  BakeoffReport,
  PerRecordingResult,
} from "./types";

function pct(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function ms(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value)} ms`;
}

function aggregateTable(aggregates: AdapterAggregateMetrics[]): string {
  const header =
    `| Adapter | Evaluated | Arabic out | Exact match | **False corr. (correct)** | Omission TP | Omission FP | Subst. det. | Repet. handled | Empty/garbage | Median lat. | p95 lat. | WER* | CER* |`;
  const divider =
    `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`;
  const rows = aggregates.map((a) => {
    const evalCell = `${a.evaluatedSamples}/${a.totalSamples}`;
    return (
      `| ${a.displayName} | ${evalCell} | ${pct(a.arabicOutputRate)} | ${pct(a.exactWordMatchRate)} ` +
      `| **${pct(a.falseCorrectionRateOnCorrect)}** | ${pct(a.omissionTruePositiveRate)} | ${pct(a.omissionFalsePositiveRate)} ` +
      `| ${pct(a.substitutionDetectionRate)} | ${pct(a.repetitionHandledRate)} | ${pct(a.emptyGarbageRate)} ` +
      `| ${ms(a.medianLatencyMs)} | ${ms(a.p95LatencyMs)} | ${pct(a.meanWer)} | ${pct(a.meanCer)} |`
    );
  });
  return [header, divider, ...rows].join("\n");
}

function perRecordingTable(results: PerRecordingResult[]): string {
  const header =
    `| Sample | Adapter | Arabic? | Normalized transcript | Expected (normalized) | Match | Missing idx | Extra | Review | False corr? | Omit det? | Subst det? | Latency | Error |`;
  const divider = `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`;
  const rows = results.map((r) => {
    if (r.skipped) {
      return `| ${r.sampleId} | ${r.adapterId} | skipped | — | — | — | — | — | — | — | — | — | — | ${r.skipReason ?? ""} |`;
    }
    const a = r.alignment;
    const match = a ? `${a.matched}/${a.total}` : "n/a";
    const bool = (v: boolean | null) => (v === null ? "n/a" : v ? "YES" : "no");
    const expected = r.expectedTokens.join(" ").replace(/\|/g, "\\|").slice(0, 120);
    return (
      `| ${r.sampleId} | ${r.adapterId} | ${r.producedArabic ? "yes" : "NO"} ` +
      `| ${r.normalizedTokens.join(" ").replace(/\|/g, "\\|").slice(0, 120)} | ${expected} ` +
      `| ${match} | ${(a?.missingWordIndexes ?? []).join(",") || "—"} | ${a?.extraCount ?? "n/a"} ` +
      `| ${a?.reviewCount ?? "n/a"} | ${bool(r.falseCorrectionOnCorrect)} | ${bool(r.omissionDetected)} ` +
      `| ${bool(r.substitutionDetected)} | ${ms(r.latencyMs)} | ${r.adapterError ?? "—"} ` +
      `|`
    );
  });
  return [header, divider, ...rows].join("\n");
}

export function formatBakeoffReport(report: BakeoffReport): string {
  const lines: string[] = [];
  lines.push(`# Quran ASR bake-off report`);
  lines.push(``);
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Corpus: \`${report.corpusDir}\``);
  lines.push(`- Adapters: ${report.adapters.join(", ")}`);
  lines.push(``);
  lines.push(`## Aggregate metrics`);
  lines.push(``);
  lines.push(
    `**Primary product metric: "False corr. (correct)"** — how often the ASR would cause the tutor ` +
      `to falsely correct a learner who recited correctly. Lower is better. ` +
      `*WER/CER are secondary and reported for reference only.*`,
  );
  lines.push(``);
  lines.push(aggregateTable(report.aggregates));
  lines.push(``);
  lines.push(`## Per-recording results`);
  lines.push(``);
  lines.push(perRecordingTable(report.perRecording));
  lines.push(``);
  if (report.notes.length > 0) {
    lines.push(`## Notes`);
    lines.push(``);
    for (const note of report.notes) lines.push(`- ${note}`);
    lines.push(``);
  }
  lines.push(`## Safety`);
  lines.push(``);
  lines.push(
    `This bake-off evaluates ASR/transcription quality only. Transcript mismatches are not ` +
      `pronunciation or tajweed judgements, and no model here is claimed to judge makhraj, madd, ` +
      `ghunnah, or qalqalah.`,
  );
  lines.push(``);
  return lines.join("\n");
}
