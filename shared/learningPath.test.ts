import { describe, expect, it } from "vitest";
import {
  LEARNING_COACH_PLANS,
  LEARNING_LEVELS,
  getLearningCoachPlan,
  isLearningLevel,
  uiLevelToLearningLevel,
} from "./learningPath";

describe("learning coach plans", () => {
  it("defines a complete plan for every supported learning level", () => {
    expect(LEARNING_LEVELS).toEqual(["beginner", "intermediate", "advanced"]);

    for (const level of LEARNING_LEVELS) {
      const plan = getLearningCoachPlan(level);
      expect(plan.level).toBe(level);
      expect(plan.lessonGoal).not.toHaveLength(0);
      expect(plan.practiceLoop.length).toBeGreaterThanOrEqual(3);
      expect(plan.boundary).toMatch(/qualified teacher|tajwid|makhraj/i);
    }
  });

  it("maps the existing interface paths to the explicit learner levels", () => {
    expect(uiLevelToLearningLevel("starter")).toBe("beginner");
    expect(uiLevelToLearningLevel("reading")).toBe("intermediate");
    expect(uiLevelToLearningLevel("advanced")).toBe("advanced");
  });

  it("accepts only known level identifiers", () => {
    expect(isLearningLevel("beginner")).toBe(true);
    expect(isLearningLevel("intermediate")).toBe(true);
    expect(isLearningLevel("advanced")).toBe(true);
    expect(isLearningLevel("teacher")).toBe(false);
    expect(isLearningLevel(undefined)).toBe(false);
  });

  it("keeps AI claims inside the word-recall coaching boundary", () => {
    for (const plan of Object.values(LEARNING_COACH_PLANS)) {
      expect(`${plan.liveCue} ${plan.afterRecordingCue} ${plan.boundary}`).not.toMatch(/certif(y|ies)|diagnos(e|es) tajwid|replace a teacher/i);
    }
  });
});
