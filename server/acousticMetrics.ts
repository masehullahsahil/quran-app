export type BinaryCounts = { truePositive: number; falsePositive: number; trueNegative: number; falseNegative: number; abstained: number; total: number };
const ratio = (numerator: number, denominator: number) => denominator === 0 ? 0 : numerator / denominator;
export function calibrationMetrics(counts: BinaryCounts) {
  return {
    precision: ratio(counts.truePositive, counts.truePositive + counts.falsePositive),
    recall: ratio(counts.truePositive, counts.truePositive + counts.falseNegative),
    falsePositiveRate: ratio(counts.falsePositive, counts.falsePositive + counts.trueNegative),
    abstentionRate: ratio(counts.abstained, counts.total),
  };
}
export type LabeledOutcome = { group: string; expectedPositive: boolean; predictedPositive: boolean; abstained: boolean };
export function performanceByGroup(outcomes: readonly LabeledOutcome[]) {
  const groups = Array.from(new Set(outcomes.map(item => item.group))).sort();
  return Object.fromEntries(groups.map(group => {
    const selected = outcomes.filter(item => item.group === group);
    const counts: BinaryCounts = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0, abstained: 0, total: selected.length };
    for (const item of selected) {
      if (item.abstained) counts.abstained++;
      else if (item.expectedPositive && item.predictedPositive) counts.truePositive++;
      else if (!item.expectedPositive && item.predictedPositive) counts.falsePositive++;
      else if (!item.expectedPositive) counts.trueNegative++;
      else counts.falseNegative++;
    }
    return [group, { ...counts, ...calibrationMetrics(counts) }];
  }));
}
export const performanceByConfusionPair = performanceByGroup;
export const performanceByRule = performanceByGroup;
