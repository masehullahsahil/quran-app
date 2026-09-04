import {
  formatRecitationBenchmarkReport,
  runRecitationBenchmark,
} from "../server/recitation.benchmark";

const report = runRecitationBenchmark();
console.log(formatRecitationBenchmarkReport(report));
process.exitCode = report.failedCases === 0 ? 0 : 1;
