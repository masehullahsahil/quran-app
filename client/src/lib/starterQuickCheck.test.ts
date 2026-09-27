import { describe, expect, it } from "vitest";
import { starterQuickCheckChoices } from "./starterQuickCheck";

describe("starterQuickCheckChoices", () => {
  it("keeps exactly one correct answer with the right label", () => {
    const options = starterQuickCheckChoices(0, "Baa", ["Taa", "Thaa"]);
    expect(options).toHaveLength(3);
    const correct = options.filter((option) => option.correct);
    expect(correct).toHaveLength(1);
    expect(correct[0].label).toBe("Baa");
    expect(options.map((option) => option.label).sort()).toEqual(["Baa", "Taa", "Thaa"].sort());
  });

  it("does not leave the correct answer first for every letter", () => {
    // The bug: the right answer was always the first button, so a child could
    // pass by tapping position alone. Across the 28 letters the correct
    // position must vary.
    const firstPositions = Array.from({ length: 28 }, (_, index) => {
      const options = starterQuickCheckChoices(index, `Letter${index}`, ["X", "Y"]);
      return options.findIndex((option) => option.correct);
    });
    expect(new Set(firstPositions).size).toBeGreaterThan(1);
  });

  it("is deterministic per letter", () => {
    const first = starterQuickCheckChoices(7, "Haa", ["Jeem", "Khaa"]);
    const second = starterQuickCheckChoices(7, "Haa", ["Jeem", "Khaa"]);
    expect(second.map((option) => option.label)).toEqual(first.map((option) => option.label));
  });
});
