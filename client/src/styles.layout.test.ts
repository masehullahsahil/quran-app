/**
 * Static guards on the stylesheet.
 *
 * There is no DOM renderer in this project, so these are the practical checks:
 * they catch the mistakes that actually cause horizontal overflow and unreadable
 * mobile layouts, by reading the stylesheet as text. They are not a substitute
 * for looking at the page, and they say nothing about how it looks.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "client/src/index.css"), "utf8");

/**
 * The phone block — the narrowest max-width media query, which is where
 * overflow bugs are introduced. Found by breakpoint rather than by position so
 * adding a breakpoint above it does not silently point these checks elsewhere.
 */
function mobileBlock(): string {
  const breakpoints = Array.from(css.matchAll(/@media \(max-width:\s*(\d+)px\)/g));
  expect(breakpoints.length, "the stylesheet has narrow-screen media queries").toBeGreaterThan(0);

  const narrowest = breakpoints.reduce((lowest, match) => (Number(match[1]) < Number(lowest[1]) ? match : lowest));
  return css.slice(narrowest.index ?? 0);
}

describe("no known horizontal-overflow patterns", () => {
  it("never sizes anything to the full viewport width", () => {
    // 100vw includes the scrollbar, so it is wider than the page it sits in.
    expect(css).not.toMatch(/width:\s*100vw/);
    expect(css).not.toMatch(/min-width:\s*100vw/);
  });

  it("declares no fixed pixel width wider than a small phone in the mobile block", () => {
    const offenders = Array.from(mobileBlock().matchAll(/(?:^|[;{\s])(?:min-)?width:\s*(\d{3,})px/g))
      .map((match) => Number(match[1]))
      .filter((value) => value > 320);

    expect(offenders).toEqual([]);
  });

  it("keeps the Arabic word rows wrapping rather than running off the line", () => {
    expect(css).toMatch(/\.live-word-row\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.course-choices\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.now-word\s*\{[^}]*\}/);
    expect(mobileBlock()).toMatch(/\.now-word\s*\{[^}]*word-break:\s*break-word/);
  });

  it("scrolls the twelve-level rail inside itself on narrow screens", () => {
    const rail = mobileBlock().match(/\.course-levels\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rail).toMatch(/overflow-x:\s*auto/);
    expect(rail).toMatch(/flex-wrap:\s*nowrap/);
  });
});

describe("narrow-screen controls", () => {
  it("gives the primary Study and Learn actions the full width", () => {
    const block = mobileBlock();

    expect(block).toMatch(/\.course-primary[^{]*\{[^}]*width:\s*100%/);
    expect(block).toMatch(/\.audio-coach button\s*\{[^}]*width:\s*100%/);
    // The Study record/listen pair stacks rather than squeezing into two columns.
    expect(block).toMatch(/\.teacher-now \.loop-actions\s*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it("keeps touch targets tall enough to hit", () => {
    const block = mobileBlock();
    const targets = [/\.now-action\s*\{[^}]*min-height:\s*(\d+)px/, /\.course-choice\s*\{[^}]*min-height:\s*(\d+)px/, /\.course-lesson-list button\s*\{[^}]*min-height:\s*(\d+)px/];

    for (const pattern of targets) {
      const height = Number(block.match(pattern)?.[1] ?? 0);
      expect(height, String(pattern)).toBeGreaterThanOrEqual(36);
    }
  });

  it("keeps the status pills from wrapping mid-word", () => {
    expect(css).toMatch(/\.now-place\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.now-due\s*\{[^}]*border-radius:\s*999px/);
  });
});

describe("Starter Arabic glyph spacing", () => {
  it("leaves vertical room for letter marks in every Starter letter control", () => {
    for (const selector of ["\\.alphabet-grid span", "\\.letter-focus > span", "\\.harakat-play span"]) {
      const lineHeight = Number(css.match(new RegExp(`${selector}\\s*\\{[^}]*line-height:\\s*([\\d.]+)`))?.[1] ?? 0);
      expect(lineHeight, selector).toBeGreaterThanOrEqual(1.5);
    }
  });
});

describe("the instruction stays the largest thing in Study", () => {
  it("sizes the instruction and the correction word responsively", () => {
    expect(css).toMatch(/\.now-instruction\s*\{[^}]*font-size:\s*clamp\(/);
    expect(css).toMatch(/\.now-word\s*\{[^}]*font-size:\s*clamp\(/);
  });

  it("keeps the secondary notes visually quieter than the instruction", () => {
    const instruction = Number(css.match(/\.now-instruction\s*\{[^}]*clamp\((\d+)px/)?.[1] ?? 0);
    const notesSummary = Number(css.match(/\.teacher-notes > summary span\s*\{[^}]*font-size:\s*(\d+)px/)?.[1] ?? 99);

    expect(instruction).toBeGreaterThan(notesSummary);
  });
});

describe("the phone puts teaching before content", () => {
  it("orders the instruction block above the ayah card", () => {
    const block = mobileBlock();
    const orderOf = (selector: string) => {
      const match = block.match(new RegExp(`${selector}\\s*\\{[^}]*order:\\s*(\\d+)`));
      return match ? Number(match[1]) : NaN;
    };

    expect(block).toMatch(/\.study-layout\s*\{[^}]*flex-direction:\s*column/);
    expect(orderOf("\\.teacher-loop")).toBeLessThan(orderOf("\\.study-card"));
    expect(orderOf("\\.study-index")).toBeLessThan(orderOf("\\.teacher-loop"));
    expect(orderOf("\\.study-pagination")).toBeGreaterThan(orderOf("\\.study-card"));
  });

  it("drops the decorative wash rather than scrolling past it", () => {
    expect(mobileBlock()).toMatch(/\.study-visual\s*\{[^}]*display:\s*none/);
  });

  it("keeps the correction word large and unbroken on a narrow screen", () => {
    const block = mobileBlock();
    expect(block).toMatch(/\.correction-target\s*\{[^}]*font-size:\s*clamp\(/);
    expect(block).toMatch(/\.correction-target\s*\{[^}]*word-break:\s*break-word/);
    expect(block).toMatch(/\.correction-listen\s*\{[^}]*width:\s*100%/);
  });
});

describe("an unconfirmed result is not styled as an error", () => {
  it("gives the unsure tone its own neutral palette", () => {
    const unsure = css.match(/\.teacher-now\.is-unsure\s*\{([^}]*)\}/)?.[1] ?? "";
    const attention = css.match(/\.teacher-now\.is-attention\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(unsure).toBeTruthy();
    expect(attention).toBeTruthy();
    expect(unsure).not.toBe(attention);
    // The amber left rule is what reads as "you made a mistake".
    expect(unsure).not.toContain("#b38748");
  });

  it("carries the neutral palette into the correction panel", () => {
    expect(css).toMatch(/\.active-correction\.is-unsure\s*\{[^}]*border-left-color:/);
  });
});

describe("collapsible sections stay usable", () => {
  it("gives every disclosure summary a focus ring and a pointer", () => {
    for (const selector of ["\\.teacher-notes", "\\.letter-reference"]) {
      expect(css, selector).toMatch(new RegExp(`${selector} > summary\\s*\\{[^}]*cursor:\\s*pointer`));
      expect(css, selector).toMatch(new RegExp(`${selector} > summary:focus-visible`));
    }
  });
});
