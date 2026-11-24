/**
 * @vitest-environment happy-dom
 *
 * Which listen control a lesson item gets.
 *
 * A quoted Quran word uses the control the page supplies (the reciter's
 * word-by-word file); a teaching syllable with no approved recording shows no
 * control at all; and nothing ever falls back to a synthesised voice.
 */
import React, { act } from "react";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { QaidaCourse } from "./QaidaCourse";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { emptyQaidaProgress, openLesson, type QaidaProgress } from "@/lib/qaidaProgress";
import type { QaidaArabicText } from "@shared/qaidaExercises";
import { loadLocale } from "@locales/index";

let container: HTMLDivElement;
let root: Root;
const supplied: string[] = [];

function FakeQuranWordAudio({ subject }: { subject: QaidaArabicText }) {
  supplied.push(`${subject.arabic}@${subject.reference}`);
  return <button type="button" className="fake-quran-word-audio">{subject.arabic}</button>;
}

beforeAll(async () => {
  await loadLocale("en");
});

async function mount(progress: QaidaProgress, withControl: boolean) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <QaidaCourse
          progress={progress}
          onProgressChange={() => {}}
          onOpenQuran={() => {}}
          {...(withControl ? { QuranWordAudio: FakeQuranWordAudio } : {})}
        />
      </LocaleProvider>,
    );
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  supplied.length = 0;
});

describe("listen controls in the course", () => {
  it("hands a quoted Quran word to the page's reciter control", async () => {
    // The first item of this lesson reads قُلْ from 112:1.
    await mount(openLesson(emptyQaidaProgress(), "sukoon-quran-words"), true);
    expect(container.querySelector(".fake-quran-word-audio")?.textContent).toBe("قُلْ");
    expect(supplied).toContain("قُلْ@112:1");
  });

  it("shows no Quran-word control when the page supplies none", async () => {
    await mount(openLesson(emptyQaidaProgress(), "sukoon-quran-words"), false);
    expect(container.querySelector(".fake-quran-word-audio")).toBeNull();
    expect(container.querySelector(".course-audio")).toBeNull();
  });

  it("shows no control for a teaching item until its recording is approved", async () => {
    // The first item of the exercise page is a teaching combination; nothing is
    // recorded yet, so there is nothing to play and no synthesised fallback.
    await mount(openLesson(emptyQaidaProgress(), "harakat-exercises"), true);
    expect(container.querySelector(".course-audio")).toBeNull();
    expect(container.querySelector(".fake-quran-word-audio")).toBeNull();
  });
});
