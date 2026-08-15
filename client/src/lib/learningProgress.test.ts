import { describe, expect, it } from "vitest";
import { markIndexComplete, progressPercent, toggleCompletion } from "./learningProgress";

describe("learning progress helpers", () => {
  it("calculates a rounded completion percentage", () => {
    expect(progressPercent(1, 28)).toBe(4);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(0, 0)).toBe(0);
  });

  it("keeps completed letter indices unique and ordered", () => {
    expect(markIndexComplete([3, 7], 1)).toEqual([1, 3, 7]);
    expect(markIndexComplete([1, 3, 7], 3)).toEqual([1, 3, 7]);
  });

  it("toggles a learning step without changing unrelated progress", () => {
    expect(toggleCompletion(["vowels", "joining"], "joining")).toEqual(["vowels"]);
    expect(toggleCompletion(["vowels"], "first-ayah")).toEqual(["vowels", "first-ayah"]);
  });
});
