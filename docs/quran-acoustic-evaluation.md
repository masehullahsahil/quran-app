# Quran-specific acoustic evaluation foundation

The optional `QURAN_EVALUATOR_URL` service is the only acoustic-correction boundary. The application does not claim that transcription or textual alignment evaluates makhraj or tajweed.

The deterministic fixture suite covers correct pronunciation, unclear/noisy audio, phoneme confusion, vowel-length issues, pause/stop issues, and tajweed-rule observations. Fixtures contain expectations and no audio. The shared confusion taxonomy is metadata for future labeling and analysis, not implemented detection.

`pnpm benchmark:acoustic` validates fixture structure offline. It reports every fixture as **not evaluated** unless an evaluator URL and an authorized manifest containing matching recordings are configured. Contract matches are not an acoustic-accuracy claim.

Calibration helpers calculate precision, recall, false-positive rate, abstention rate, and grouped performance for confusion pairs or tajweed rules. Product decisions should prioritize precision because an incorrect correction can undermine learning and trust. Meaningful accuracy remains impossible without representative, consented, qualified-teacher-reviewed Quran audio, held-out speakers, adjudicated labels, and evaluator predictions.
