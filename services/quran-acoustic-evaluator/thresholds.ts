/**
 * Conservative prototype policy. These values must be recalibrated on
 * held-out, teacher-labelled Quran recitation before production use.
 */
export const PHONEME_THRESHOLDS = Object.freeze({
  minimumAlignmentQuality: 0.82,
  minimumSignalQuality: 0.8,
  minimumSegmentConfidence: 0.78,
  minimumClassifierConfidence: 0.86,
  minimumTargetVsConfusionMargin: 0.18,
  minimumEvidenceQuality: 0.8,
  minimumFindingConfidence: 0.8,
  minimumSegmentDurationMs: 45,
  maximumSegmentDurationMs: 450,
  maximumFindings: 3,
});
