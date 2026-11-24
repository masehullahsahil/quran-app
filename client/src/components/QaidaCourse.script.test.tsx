/**
 * @vitest-environment happy-dom
 *
 * The Qaida renders in the Indo-Pak Quran font; Study and Read do not.
 *
 * The course's Arabic (examples, subjects, options, level titles) and the
 * letter panel (alphabet grid, letter focus, harakat strip, quick check) carry
 * the .qaida-arabic class, which index.css binds to the bundled Indo-Pak font.
 * The bridge lesson's Uthmani spellings, and every Study and Read surface, keep
 * Amiri Quran.
 */
import React, { act } from "react";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { QaidaCourse, scriptClass } from "./QaidaCourse";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { emptyQaidaProgress, openLesson } from "@/lib/qaidaProgress";
import { loadLocale } from "@locales/index";

const ROOT = resolve(import.meta.dirname, "../../..");
const css = readFileSync(resolve(ROOT, "client/src/index.css"), "utf-8");
const home = readFileSync(resolve(ROOT, "client/src/pages/Home.tsx"), "utf-8");

/** The declarations of one CSS rule, by its exact selector. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css);
  if (!match) throw new Error(`no CSS rule for ${selector}`);
  return match[1];
}

let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  await loadLocale("en");
});

async function mount(lessonId: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <QaidaCourse progress={openLesson(emptyQaidaProgress(), lessonId)} onProgressChange={() => {}} onOpenQuran={() => {}} />
      </LocaleProvider>,
    );
  });
}

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe("the course renders its Arabic with the Qaida font class", () => {
  it("maps scripts to classes", () => {
    expect(scriptClass(undefined)).toBe("qaida-arabic");
    expect(scriptClass("uthmani")).toBe("quran-uthmani");
  });

  it("puts every example, the level title and the options of a lesson in .qaida-arabic", async () => {
    await mount("harakat-fatha");
    const arabic = Array.from(container.querySelectorAll('[lang="ar"]'));
    expect(arabic.length).toBeGreaterThan(3);
    for (const el of arabic) expect(el.className, el.textContent ?? "").toContain("qaida-arabic");
    expect(container.querySelectorAll(".course-choice .qaida-arabic").length).toBeGreaterThan(0);
  });

  it("puts a drill subject in .qaida-arabic", async () => {
    await mount("forms-muqattaat");
    expect(container.querySelector(".course-subject span")?.className).toContain("qaida-arabic");
  });

  it("renders the bridge lesson's Indo-Pak words in .qaida-arabic and its Uthmani words in .quran-uthmani", async () => {
    await mount("quran-two-scripts");
    const examples = Array.from(container.querySelectorAll(".course-example span[lang=\"ar\"]"));
    expect(examples.length).toBeGreaterThanOrEqual(6);
    expect(examples.filter((el) => el.classList.contains("qaida-arabic")).length).toBe(examples.length / 2);
    expect(examples.filter((el) => el.classList.contains("quran-uthmani")).length).toBe(examples.length / 2);
    const options = Array.from(container.querySelectorAll(".course-choice span[lang=\"ar\"]"));
    expect(options.some((el) => el.classList.contains("quran-uthmani"))).toBe(true);
    expect(options.some((el) => el.classList.contains("qaida-arabic"))).toBe(true);
  });
});

describe("the font classes are wired in CSS", () => {
  it("binds .qaida-arabic to the bundled Indo-Pak font, which exists", () => {
    expect(rule(".qaida-arabic")).toMatch(/font-family:\s*"Qaida IndoPak"/);
    expect(css).toMatch(/@font-face\s*\{[^}]*font-family:\s*"Qaida IndoPak";[^}]*url\("\/fonts\/qaida\/DigitalKhattIndoPak\.woff2"\)/);
    expect(existsSync(resolve(ROOT, "client/public/fonts/qaida/DigitalKhattIndoPak.woff2"))).toBe(true);
    expect(existsSync(resolve(ROOT, "client/public/fonts/qaida/OFL.txt"))).toBe(true);
  });

  it("keeps the bridge lesson's Uthmani spellings in Amiri Quran", () => {
    expect(rule(".quran-uthmani")).toMatch(/font-family:\s*"Amiri Quran"/);
  });

  it.each([".quran-flow", ".study-arabic", ".basmala", ".chapter-arabic", ".now-word", ".lesson-word", ".memory-verse"])(
    "keeps the Study and Read surface %s in Amiri Quran",
    (selector) => {
      const declarations = rule(selector);
      expect(declarations).toMatch(/font-family:\s*"Amiri Quran"/);
      expect(declarations).not.toMatch(/Qaida/);
    },
  );

  it("loads the Qaida font face only through .qaida-arabic", () => {
    const uses = css.match(/"Qaida IndoPak"/g) ?? [];
    // Once in @font-face, once in .qaida-arabic.
    expect(uses).toHaveLength(2);
  });
});

describe("the letter panel uses the Qaida font class; Study and Read do not", () => {
  it("marks the alphabet grid, letter focus, harakat strip and quick check", () => {
    expect(home).toContain('<span className="qaida-arabic" lang="ar" dir="rtl">{item.letter}</span>');
    expect(home).toContain('<div className="letter-focus"><span className="qaida-arabic" lang="ar" dir="rtl">{activeLetter.letter}</span>');
    expect(home).toContain('<span className="qaida-arabic" lang="ar" dir="rtl">{activeLetter.letter}{harakat.mark}</span>');
    expect(home).toContain('<strong className="qaida-arabic" lang="ar" dir="rtl">{activeLetter.letter}</strong>');
  });

  it("does not put the Qaida class on the Study ayah or the Read text", () => {
    const studyCard = home.slice(home.indexOf('className="study-arabic"') - 40, home.indexOf('className="study-arabic"') + 80);
    expect(studyCard).not.toContain("qaida-arabic");
    const readFlow = home.indexOf("quran-flow");
    expect(readFlow).toBeGreaterThan(-1);
    expect(home.slice(readFlow - 40, readFlow + 120)).not.toContain("qaida-arabic");
    // Only the letter panel's four elements in Home use it.
    expect(home.match(/qaida-arabic/g)).toHaveLength(4);
  });
});
