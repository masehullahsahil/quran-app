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

/**
 * The same plan, as locale keys.
 *
 * The plan above is one structure, and the server still echoes its English text
 * in the review response. What a learner *reads* is rendered from these keys, so
 * the coaching panel speaks the interface language while the plan itself — which
 * level, which loop, which boundary — stays declared once, here. A key added
 * here without a translation shows up in the locale coverage report rather than
 * silently rendering English.
 */
export const LEARNING_PLAN_TEXT_KEYS: Record<
  LearningLevel,
  { title: string; focus: string; lessonGoal: string; boundary: string; practiceLoop: readonly string[] }
> = {
  qaida: {
    title: "plan.qaida.title",
    focus: "plan.qaida.focus",
    lessonGoal: "plan.qaida.lessonGoal",
    boundary: "plan.qaida.boundary",
    practiceLoop: ["plan.qaida.loopListen", "plan.qaida.loopIdentify", "plan.qaida.loopJoin", "plan.qaida.loopRepeat", "plan.qaida.loopReview"],
  },
  tajweed: {
    title: "plan.tajweed.title",
    focus: "plan.tajweed.focus",
    lessonGoal: "plan.tajweed.lessonGoal",
    boundary: "plan.tajweed.boundary",
    practiceLoop: ["plan.tajweed.loopRecall", "plan.tajweed.loopRecord", "plan.tajweed.loopLocate", "plan.tajweed.loopTeacher"],
  },
};

export function learningPlanTextKeys(level: LearningLevel) {
  return LEARNING_PLAN_TEXT_KEYS[level];
}

export function getLearningCoachPlan(level: LearningLevel): LearningCoachPlan {
  return LEARNING_COACH_PLANS[level];
}

export function isLearningLevel(value: unknown): value is LearningLevel {
  return typeof value === "string" && (LEARNING_LEVELS as readonly string[]).includes(value);
}
