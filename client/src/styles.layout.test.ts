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

describe("the side panel stays reachable", () => {
  it("never hides the panel with display: none", () => {
    // The panel used to vanish below 1000px with no way to open it. A
    // drawer that is off-canvas is hidden, never removed.
    expect(css).not.toMatch(/\.study-panel\s*\{[^}]*display:\s*none/);
  });

  it("turns the panel into a slide-over drawer below 1190px", () => {
    // Below 1190px the shell is rail + main only, so its hard minimum can
    // no longer push the panel off the right edge; the panel is fixed to
    // the viewport and slides in when opened.
    expect(css).toMatch(/@media \(max-width:\s*1190px\)[\s\S]*?\.sanctuary-shell\s*\{[^}]*grid-template-columns:\s*208px minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.study-panel\s*\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.study-panel\s*\{[^}]*transform:\s*translateX\(102%\)/);
    expect(css).toMatch(/\.study-panel\.is-open\s*\{[^}]*transform:\s*translateX\(0\)/);
    expect(css).toMatch(/\.study-panel\s*\{[^}]*visibility:\s*hidden/);
    expect(css).toMatch(/\.study-panel\.is-open\s*\{[^}]*visibility:\s*visible/);
  });

  it("gives the drawer a toggle, a close control and a backdrop", () => {
    expect(css).toMatch(/\.panel-toggle\s*\{[^}]*display:\s*inline-flex/);
    expect(css).toMatch(/\.panel-close\s*\{[^}]*display:\s*inline-flex/);
    expect(css).toMatch(/\.panel-backdrop\s*\{[^}]*position:\s*fixed/);
  });

  it("dresses the drawer chrome and saved place in the new tokens", () => {
    // The drawer chrome and saved-place line arrived after the look passes,
    // so they wore the old palette until this alignment. The scrim and the
    // close control's resting colour are not palette tokens and stay put.
    const savedPlace = css.match(/\.saved-place\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(savedPlace).toContain("border-bottom: 1px solid #e4dfd4");
    expect(savedPlace).toContain("color: #405047");
    expect(savedPlace).not.toContain("#e6e1d7");

    const savedButton = css.match(/\.saved-place button\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(savedButton).toContain("color: #0f4a3c");
    expect(savedButton).not.toContain("#174d42");

    // The toggle and close control only gain their colours inside the 1190px
    // block, where the drawer turns on; the base rules just hide them.
    const drawer = css.slice(css.indexOf("@media (max-width: 1190px)"));
    const toggle = drawer.match(/\.panel-toggle\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(toggle).toContain("color: #0f4a3c");
    expect(toggle).toContain("background: #ffffff");
    expect(toggle).toContain("border: 1px solid #ddd6c6");
    expect(toggle).not.toContain("#174d42");
    expect(toggle).not.toContain("#fffdf8");
    expect(toggle).not.toContain("#c3d2c6");

    const closeHover = drawer.match(/\.panel-close:hover\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(closeHover).toContain("color: #0f4a3c");
    expect(closeHover).toContain("background: #e6f0e9");
    expect(closeHover).not.toContain("#174d42");
    expect(closeHover).not.toContain("#e8f1ec");

    // Unchanged on purpose: the backdrop is a scrim, and the close control's
    // resting colour was never flagged. The close control's coloured rule
    // lives in the drawer block too — the base rule only hides it.
    expect(css).toMatch(/\.panel-backdrop\s*\{[^}]*background:\s*rgba\(23,45,38,\.45\)/);
    const closeBase = drawer.match(/\.panel-close\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(closeBase).toContain("color: #6d786f");
  });

  it("lets the desk header wrap so its pills stay reachable", () => {
    expect(css).toMatch(/\.desk-header\s*\{[^}]*flex-wrap:\s*wrap/);
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

describe("the phone puts the ayah before the tutor", () => {
  it("orders the ayah card above the tutor panel", () => {
    const block = mobileBlock();
    const orderOf = (selector: string) => {
      const match = block.match(new RegExp(`${selector}\\s*\\{[^}]*order:\\s*(\\d+)`));
      return match ? Number(match[1]) : NaN;
    };

    // The ayah no longer lives in the tutor card, so the card must come
    // first: a learner on a phone should see the verse before the tutor's
    // prompt, not the prompt and then the verse after scrolling.
    expect(block).toMatch(/\.study-layout\s*\{[^}]*flex-direction:\s*column/);
    expect(orderOf("\\.study-card")).toBeLessThan(orderOf("\\.teacher-loop"));
    expect(orderOf("\\.study-index")).toBeLessThan(orderOf("\\.study-card"));
    expect(orderOf("\\.study-pagination")).toBeGreaterThan(orderOf("\\.teacher-loop"));
  });

  it("drops the decorative wash rather than scrolling past it", () => {
    expect(mobileBlock()).toMatch(/\.study-visual\s*\{[^}]*display:\s*none/);
  });

  it("keeps the correction word large and unbroken on a narrow screen", () => {
    const block = mobileBlock();
    expect(block).toMatch(/\.fix-word\s*\{[^}]*font-size:\s*clamp\(/);
    expect(block).toMatch(/\.fix-word\s*\{[^}]*word-break:\s*break-word/);
    expect(block).toMatch(/\.fix-listen, \.fix-cta\s*\{[^}]*width:\s*100%/);
  });

  it("gives the record-again control a full-width tap target on a phone", () => {
    const block = mobileBlock();
    // The learner must never have to hunt for the microphone after a
    // correction, least of all on the screen with the least room.
    expect(block).toMatch(/\.fix-record\s*\{[^}]*width:\s*100%/);
    const height = block.match(/\.fix-record\s*\{[^}]*min-height:\s*(\d+)px/);
    expect(Number(height?.[1])).toBeGreaterThanOrEqual(44);
  });
});

describe("the tutor card matches the ayah area", () => {
  it("carries no fill, border, or shadow on the tutor card or its panel", () => {
    // The tutor card used to be a big white square under the ayah card.
    // The ayah card (.study-card) has no fill, border, or shadow — it reads
    // as the warm cream page itself — so the tutor card must not either.
    // The inner .live-tutor panel is the same box, so it goes too, including
    // the state tints that would bring a fill back mid-session. Every state
    // is also a word on screen, so no signal is lost with the colour.
    const loop = css.match(/\.teacher-loop\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(loop).toContain("background: transparent");
    expect(loop).not.toMatch(/border/);
    expect(loop).not.toMatch(/box-shadow/);

    const panel = css.match(/\.live-tutor\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(panel).toContain("background: transparent");
    expect(panel).not.toMatch(/border/);

    const recognised =
      css.match(/\.live-tutor\.is-word-recognised, \.live-tutor\.is-complete\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(recognised).not.toMatch(/background/);
    const paused = css.match(/\.live-tutor\.is-paused\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(paused).not.toMatch(/background/);

    // The reference itself: the ayah card stays fill-less, border-less,
    // and shadow-less, so "the same as the ayah area" stays true.
    const study = css.match(/\.study-card\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(study).not.toMatch(/background/);
    expect(study).not.toMatch(/border/);
    expect(study).not.toMatch(/box-shadow/);
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
    expect(css).toMatch(/\.study-fix\.is-unsure, \.study-fix\.is-uncertain\s*\{[^}]*border-left-color:/);
  });

  it("gives each result state its own accent, so they cannot be confused", () => {
    const accent = (selector: string) => css.match(new RegExp(`${selector}\\s*\\{[^}]*border-left-color:\\s*([^;]+);`))?.[1]?.trim();
    const word = css.match(/\.study-fix\s*\{[^}]*border-left:\s*3px solid ([^;]+);/)?.[1]?.trim();
    const uncertain = accent("\\.study-fix\\.is-unsure, \\.study-fix\\.is-uncertain");
    const wholeAyah = accent("\\.study-fix\\.is-whole-ayah");
    const accepted = accent("\\.study-fix\\.is-accepted");

    for (const value of [word, uncertain, wholeAyah, accepted]) expect(value).toBeTruthy();
    expect(new Set([word, uncertain, wholeAyah, accepted]).size).toBe(4);
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
