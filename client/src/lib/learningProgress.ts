export type QaidaStepId = "vowels" | "joining" | "first-ayah";

export function progressPercent(completedCount: number, totalCount: number) {
  if (totalCount <= 0) return 0;
  return Math.round((completedCount / totalCount) * 100);
}

export function markIndexComplete(current: number[], index: number) {
  return current.includes(index) ? current : [...current, index].sort((left, right) => left - right);
}

export function toggleCompletion<T extends string>(current: T[], item: T) {
  return current.includes(item) ? current.filter((value) => value !== item) : [...current, item];
}
