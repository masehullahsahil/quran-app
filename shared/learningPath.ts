export const LEARNING_LEVELS = ["qaida", "tajweed"] as const;

export type LearningLevel = (typeof LEARNING_LEVELS)[number];

export type LearningCoachPlan = {
  level: LearningLevel;
  title: string;
  focus: string;
  lessonGoal: string;
  liveCue: string;
  afterRecordingCue: string;
  practiceLoop: readonly string[];
  boundary: string;
};

/**
 * The app can adapt pacing and word-recall coaching to a learner's stage, but
 * no plan grants it authority to certify tajwid, makhraj, vowel length,
 * melodic style, or religious correctness from generic speech transcription.
 * Those remain matters for a qualified teacher and an appropriate specialist
 * evaluation system. The Tajweed level names what a learner is working on; it
 * does not claim the app can assess it.
 */
export const LEARNING_COACH_PLANS: Record<LearningLevel, LearningCoachPlan> = {
  qaida: {
    level: "qaida",
    title: "Qaida",
    focus: "Letters, articulation points, short vowels, and joining forms",
    lessonGoal: "Build letter recognition and a deliberate listen–repeat habit, then join letters into words.",
    liveCue: "Use the live guide only to keep your place. Pause after each word and listen again when unsure.",
    afterRecordingCue: "Treat the word review as a practice prompt, then replay the qualified reciter before repeating.",
    practiceLoop: ["Listen", "Identify", "Join", "Repeat", "Review"],
    boundary: "Single-letter articulation and makhraj must be confirmed by a qualified teacher.",
  },
  tajweed: {
    level: "tajweed",
    title: "Tajweed",
    focus: "Recitation rules — elongation, nasalization, and stopping — with teacher-guided refinement",
    lessonGoal: "Recite with deliberate repetition and identify where to return for focused supervised practice.",
    liveCue: "Use the live guide to keep your place while reciting; stop and replay the reciter whenever the order becomes uncertain.",
    afterRecordingCue: "Use the review to locate a missed or uncertain word, then practise that return with a qualified teacher for tajwid correction.",
    practiceLoop: ["Recall", "Record", "Locate return", "Repeat with a teacher"],
    boundary: "Only a qualified teacher should confirm tajwid, makhraj, madd, waqf, melody, or religious correctness.",
  },
};

export function getLearningCoachPlan(level: LearningLevel): LearningCoachPlan {
  return LEARNING_COACH_PLANS[level];
}

export function isLearningLevel(value: unknown): value is LearningLevel {
  return typeof value === "string" && (LEARNING_LEVELS as readonly string[]).includes(value);
}
