/**
 * The keys every language pack must carry in its own words.
 *
 * A learner meets these on every screen and in every attempt: the teacher's
 * instructions, the controls under them, the words for a correction, and the
 * navigation between modes. Long-form teaching text — the Qaida lessons, the
 * coaching plans, the boundary notes — may fall back to English while a pack is
 * being written, and the picker says so.
 *
 * A parity test asserts that every pack defines all of these, so a pack cannot
 * quietly regress to English on the sentences that matter most.
 */
import type { StringKey } from "./en";

export const CRITICAL_STRING_KEYS = [
  // The teacher's own voice: one of these is the largest text on the screen.
  "now.label",
  "now.place",
  "now.placeWord",
  "now.listening",
  "now.reviewing",
  "now.recordAgain",
  "now.unclear",
  "now.repeatWord",
  "now.repeatWordAgain",
  "now.repeatWordSound",
  "now.repeatAyah",
  "now.continueFromWord",
  "now.nextAyah",
  "now.surahComplete",
  "now.reviewToday",
  "now.listenFirst",
  "now.repeat",
  "now.tryAgain",
  "now.goToAyah",
  "now.stepsLabel",

  // The correction panel.
  "correction.label",
  "correction.notHeard",
  "correction.different",
  "correction.sound",
  "correction.unsure",
  "correction.listen",
  "correction.retry",
  "correction.wordAt",

  // The teaching sequence steps.
  "step.showWord",
  "step.listen",
  "step.repeatWord",
  "step.reciteAyah",
  "step.recordAgain",

  // Study controls and the recorder's states.
  "study.hearReciter",
  "study.reciterPlaying",
  "study.record",
  "study.stopRecording",
  "study.reviewing",
  "study.listenSlowly",
  "study.previous",
  "study.next",
  "study.ayah",
  "recorder.intro",
  "recorder.listening",
  "recorder.reviewing",
  "recorder.reviewReady",
  "recorder.retryNow",

  // Where the learner is, and how they move around.
  "mode.read",
  "mode.learn",
  "mode.study",
  "mode.memorise",
  "dock.read",
  "dock.practise",
  "dock.recall",
  "notes.summary",
  "language.label",

  // How an ayah is standing, in a word.
  "mastery.new",
  "mastery.learning",
  "mastery.needs_review",
  "mastery.strong",
  "mastery.mastered",

  // The Qaida course controls, which sit beside untranslated lesson text.
  "course.continue",
  "course.tryAgain",
  "course.readAloud",
  "course.completedBadge",
  "course.locked",
] as const satisfies readonly StringKey[];

export type CriticalStringKey = (typeof CRITICAL_STRING_KEYS)[number];
