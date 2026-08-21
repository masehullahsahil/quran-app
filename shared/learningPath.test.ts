import { describe, expect, it } from "vitest";
import {
  LEARNING_COACH_PLANS,
  LEARNING_LEVELS,
  getLearningCoachPlan,
  isLearningLevel,
} from "./learningPath";

describe("learning coach plans", () => {
  it("defines a complete plan for every supported learning level", () => {
    expect(LEARNING_LEVELS).toEqual(["qaida", "tajweed"]);

    for (const level of LEARNING_LEVELS) {
      const plan = getLearningCoachPlan(level);
      expect(plan.level).toBe(level);
      expect(plan.lessonGoal).not.toHaveLength(0);
      expect(plan.practiceLoop.length).toBeGreaterThanOrEqual(3);
      expect(plan.boundary).toMatch(/qualified teacher|tajwid|makhraj/i);
    }
  });

  // Learn carries two levels: reading connected text is the Study department's
  // job, so no third "Reading" level sits between them.
  it("keeps Learn to the two levels the interface offers", () => {
    expect(LEARNING_LEVELS).toHaveLength(2);
    expect(Object.keys(LEARNING_COACH_PLANS)).toEqual([...LEARNING_LEVELS]);
  });

  it("accepts only known level identifiers", () => {
    expect(isLearningLevel("qaida")).toBe(true);
    expect(isLearningLevel("tajweed")).toBe(true);
    expect(isLearningLevel("reading")).toBe(false);
    expect(isLearningLevel("beginner")).toBe(false);
    expect(isLearningLevel("teacher")).toBe(false);
    expect(isLearningLevel(undefined)).toBe(false);
  });

  it("keeps AI claims inside the word-recall coaching boundary", () => {
    for (const plan of Object.values(LEARNING_COACH_PLANS)) {
      expect(`${plan.liveCue} ${plan.afterRecordingCue} ${plan.boundary}`).not.toMatch(/certif(y|ies)|diagnos(e|es) tajwid|replace a teacher/i);
    }
  });
});
