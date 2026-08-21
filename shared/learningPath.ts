export const LEARNING_LEVELS = ["beginner", "intermediate", "advanced"] as const;

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
 * evaluation system.
 */
export const LEARNING_COACH_PLANS: Record<LearningLevel, LearningCoachPlan> = {
  beginner: {
    level: "beginner",
    title: "Foundations",
    focus: "Arabic letters, short vowels, and careful listening",
    lessonGoal: "Build recognition and a deliberate listen–repeat habit before attempting longer passages.",
    liveCue: "Use the live guide only to keep your place. Pause after each word and listen again when unsure.",
    afterRecordingCue: "Treat the word review as a practice prompt, then replay the qualified reciter before repeating.",
    practiceLoop: ["Listen", "Identify", "Repeat", "Review"],
    boundary: "Single-letter articulation and makhraj must be confirmed by a qualified teacher.",
  },
  intermediate: {
    level: "intermediate",
    title: "Reading fluency",
    focus: "Joining forms, familiar words, and steady ayah-level reading",
    lessonGoal: "Read connected words in order while keeping a calm, consistent pace.",
    liveCue: "Follow the live guide as a place-keeping aid; it does not verify how each sound was formed.",
    afterRecordingCue: "Return to the first word marked for review, listen slowly, then repeat the ayah as one connected passage.",
    practiceLoop: ["Listen slowly", "Read in order", "Record", "Target one return"],
    boundary: "Speech-to-text can support word recall, not tajwid or pronunciation assessment.",
  },
  advanced: {
    level: "advanced",
    title: "Recitation and hifz",
    focus: "Recall, deliberate repetition, and teacher-guided refinement",
    lessonGoal: "Strengthen dependable recall and identify where to return for focused supervised practice.",
    liveCue: "Use the live guide to keep your place while recalling; stop and replay the reciter whenever the order becomes uncertain.",
    afterRecordingCue: "Use the review to locate a missed or uncertain word, then practise that return with a qualified teacher for tajwid correction.",
    practiceLoop: ["Recall", "Record", "Locate return", "Repeat with a teacher"],
    boundary: "Only a qualified teacher should confirm tajwid, makhraj, madd, waqf, melody, or religious correctness.",
  },
};

export function getLearningCoachPlan(level: LearningLevel): LearningCoachPlan {
  return LEARNING_COACH_PLANS[level];
}

/** Maps the existing learner-interface labels to the explicit teaching levels. */
export function uiLevelToLearningLevel(level: "starter" | "reading" | "advanced"): LearningLevel {
  if (level === "starter") return "beginner";
  if (level === "reading") return "intermediate";
  return "advanced";
}

export function isLearningLevel(value: unknown): value is LearningLevel {
  return typeof value === "string" && (LEARNING_LEVELS as readonly string[]).includes(value);
}
