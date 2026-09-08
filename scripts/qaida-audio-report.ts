/**
 * Prints the Qaida reference-audio coverage report.
 *
 *   npx tsx scripts/qaida-audio-report.ts
 *
 * Deterministic, so its output can be pasted into docs/qaida-audio.md or diffed
 * between deliveries of recordings.
 */
import { formatQaidaAudioCoverage, qaidaAudioCoverage } from "../shared/qaidaAudioCoverage";

console.log(formatQaidaAudioCoverage(qaidaAudioCoverage()));
