/**
 * @vitest-environment happy-dom
 *
 * The language control, driven the way a learner drives it.
 *
 * These are not locale-coverage tests — locales/coverage.test.ts already checks
 * that the strings exist. What is checked here is the thing a learner
 * experiences: that the control is findable, that all five languages are in it,
 * that choosing one changes the words on screen and the direction of the page,
 * that the choice survives a reload, and that English comes back to left-to-right.
 */
// The default import is what the test transform needs: it compiles JSX to
// `React.createElement` (tsconfig sets `jsx: "preserve"`).
import React, { act } from "react";
// React only flushes updates inside `act` when it knows it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LanguagePicker } from "./LanguagePicker";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { SUPPORTED_LANGUAGE_CODES, SUPPORTED_LANGUAGES } from "@shared/languages";
import { loadLocale } from "@locales/index";
import en from "@locales/en";

let container: HTMLDivElement;
let root: Root;

/**
 * Each pack but English is a dynamic import. In the browser that import
 * resolves while the app keeps rendering English — the app's documented
 * per-key fallback. Under the test runner the module graph resolves on its own
 * schedule, so the packs are loaded once up front and the switch under test is
 * then the state change, not the download.
 */
beforeAll(async () => {
  for (const code of SUPPORTED_LANGUAGE_CODES) await loadLocale(code);
});

/** Renders the picker inside the app's real locale provider. */
async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <LanguagePicker />
      </LocaleProvider>,
    );
  });
  await settle();
}

/**
 * Waits for a language pack to arrive.
 *
 * Every pack but English is a dynamic import, which is what keeps four
 * languages out of the first load. A microtask is not enough to resolve one, so
 * a timer turn is what the tests wait on.
 */
async function settle() {
  // Two turns: one for the import to resolve, one for the state it sets to
  // render. A single microtask flush is not enough for a dynamic import.
  for (let turn = 0; turn < 2; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

const trigger = () => container.querySelector<HTMLButtonElement>(".language-trigger")!;
const options = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'));

async function openMenu() {
  await act(async () => {
    trigger().click();
  });
}

async function choose(code: string) {
  await openMenu();
  const option = options().find((entry) => entry.getAttribute("lang") === code);
  if (!option) throw new Error(`No option for ${code}`);
  await act(async () => {
    option.click();
  });
  await settle();
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dir = "ltr";
  document.documentElement.lang = "en";
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the control is findable", () => {
  it("shows the word 'Language' and the current language, not just an icon", async () => {
    await mount();

    expect(trigger().textContent).toContain(en.strings["language.short"]);
    expect(trigger().textContent).toContain("English");
    expect(trigger().getAttribute("aria-label")).toBe(en.strings["language.label"]);
    expect(trigger().querySelector("svg")).toBeTruthy();
  });

  it("opens a menu listing exactly the five languages the app carries", async () => {
    await mount();
    await openMenu();

    const listed = options().map((option) => option.getAttribute("lang"));
    expect(listed).toHaveLength(5);
    expect(listed.sort()).toEqual([...SUPPORTED_LANGUAGE_CODES].sort());

    // Each option carries its own name and its English name, so a learner can
    // find their language whichever script they read.
    const text = container.querySelector(".language-sheet")!.textContent ?? "";
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      expect(text, code).toContain(SUPPORTED_LANGUAGES[code].name);
      expect(text, code).toContain(SUPPORTED_LANGUAGES[code].englishName);
    }
  });

  it("says the Quran itself does not change with the language", async () => {
    await mount();
    await openMenu();
    expect(container.querySelector(".language-sheet-foot")?.textContent).toBe(en.strings["language.hint"]);
  });

  it("marks the current language as selected", async () => {
    await mount();
    await openMenu();

    const selected = options().filter((option) => option.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute("lang")).toBe("en");
  });

  it("closes on Escape without changing the language", async () => {
    await mount();
    await openMenu();
    expect(container.querySelector(".language-sheet")).toBeTruthy();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(container.querySelector(".language-sheet")).toBeNull();
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("choosing a language changes the app", () => {
  it.each([
    ["ps", "پښتو"],
    ["fa-AF", "دری"],
    ["ur", "اردو"],
    ["ar", "العربية"],
  ])("switches to %s and shows its own name in the trigger", async (code, nativeName) => {
    await mount();
    await choose(code);

    expect(trigger().textContent).toContain(nativeName);
    // The label itself is now in that language, not in English.
    expect(trigger().textContent).not.toContain(en.strings["language.short"]);
  });

  it("puts the page into right-to-left for all four RTL languages", async () => {
    await mount();
    for (const code of ["ps", "fa-AF", "ur", "ar"] as const) {
      await choose(code);
      expect(document.documentElement.dir, code).toBe("rtl");
      expect(document.documentElement.lang, code).toBe(code);
    }
  });

  it("returns to left-to-right when English is chosen again", async () => {
    await mount();
    await choose("ar");
    expect(document.documentElement.dir).toBe("rtl");

    await choose("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");
    expect(trigger().textContent).toContain(en.strings["language.short"]);
  });
});

describe("the choice is remembered", () => {
  it("writes the selection to the app's existing locale storage key", async () => {
    await mount();
    await choose("ur");

    expect(window.localStorage.getItem("miqra-locale")).toBe("ur");
    // One key, not a second competing store.
    expect(Object.keys(window.localStorage).filter((key) => key.includes("locale"))).toEqual(["miqra-locale"]);
  });

  it("comes back in the chosen language after a reload", async () => {
    await mount();
    await choose("ps");
    act(() => root.unmount());
    container.remove();

    // A fresh mount is what a page refresh does.
    await mount();
    expect(trigger().textContent).toContain("پښتو");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("ignores a stored language the app does not carry", async () => {
    window.localStorage.setItem("miqra-locale", "de");
    await mount();

    expect(trigger().textContent).toContain("English");
    expect(document.documentElement.dir).toBe("ltr");
  });
});
