/**
 * @vitest-environment happy-dom
 *
 * The Qaida course, in the learner's language and with its audio wired.
 *
 * Two things are checked here that a coverage test cannot: that a lesson's
 * title, teaching text and exercise prompt on screen actually change when the
 * language changes, and that a lesson step which has a reference recording
 * offers a control that asks for that exact file.
 */
// The default import is what the test transform needs: it compiles JSX to
// `React.createElement` (tsconfig sets `jsx: "preserve"`).
import React, { act } from "react";
// React only flushes updates inside `act` when it knows it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { QaidaCourse } from "./QaidaCourse";
import { LocaleProvider, useLocale } from "@/contexts/LocaleContext";
import { emptyQaidaProgress, type QaidaProgress } from "@/lib/qaidaProgress";
import { QAIDA_LESSONS } from "@shared/qaidaCurriculum";
import { localizedExercise, localizedLesson } from "@shared/qaidaText";
import { SUPPORTED_LANGUAGE_CODES } from "@shared/languages";
import { loadLocale } from "@locales/index";
import en from "@locales/en";
import ps from "@locales/ps";
import ar from "@locales/ar";

const played: string[] = [];

class FakeAudio {
  src = "";
  currentTime = 0;
  playbackRate = 1;
  volume = 1;
  error: { code: number } | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play() {
    played.push(this.src);
    return Promise.resolve();
  }
  pause() {}
  load() {}
  removeAttribute() {}
}

let container: HTMLDivElement;
let root: Root;
let progress: QaidaProgress;

beforeAll(async () => {
  for (const code of SUPPORTED_LANGUAGE_CODES) await loadLocale(code);
});

async function settle() {
  for (let turn = 0; turn < 2; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

function Harness({ locale }: { locale: string }) {
  return (
    <LocaleProvider>
      <Switcher locale={locale} />
    </LocaleProvider>
  );
}

/** Sets the language the way the picker does, then renders the course. */
function Switcher({ locale }: { locale: string }) {
  const { setLocale } = useLocale();
  React.useEffect(() => {
    setLocale(locale);
  }, [locale, setLocale]);
  return <QaidaCourse progress={progress} onProgressChange={(next) => { progress = next; }} onOpenQuran={() => {}} />;
}

async function mount(locale = "en") {
  progress = emptyQaidaProgress();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Harness locale={locale} />);
  });
  await settle();
}

beforeEach(() => {
  played.length = 0;
  window.localStorage.clear();
  (globalThis as { Audio?: unknown }).Audio = FakeAudio;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const text = () => container.textContent ?? "";
const firstLesson = QAIDA_LESSONS[0];

describe("the course speaks the learner's language", () => {
  it("shows the first lesson's title, teaching text and controls in English", async () => {
    await mount("en");

    // English is the language the curriculum is written in, so it carries no
    // `qaida` map: the lesson's own fields are what a learner reads.
    const lesson = localizedLesson(firstLesson, undefined);
    expect(text()).toContain(lesson.title);
    expect(text()).toContain(lesson.teaching);
    expect(text()).toContain(lesson.objective);
    expect(text()).toContain(en.strings["course.playAudio"]);
  });

  it.each([
    ["ps", ps],
    ["ar", ar],
  ])("shows the same lesson translated in %s", async (code, pack) => {
    await mount(code);

    const lesson = localizedLesson(firstLesson, pack.qaida);
    const english = localizedLesson(firstLesson, undefined);

    expect(text(), `${code} title`).toContain(lesson.title);
    expect(text(), `${code} teaching`).toContain(lesson.teaching);
    expect(lesson.title).not.toBe(english.title);
    expect(text()).not.toContain(english.teaching);
  });

  it("translates the exercise prompt a learner answers", async () => {
    await mount("ps");
    const exercise = firstLesson.practice[0];
    const localized = localizedExercise(exercise, ps.qaida);

    expect(localized.prompt).not.toBe(exercise.prompt);
    expect(text()).toContain(localized.prompt);
  });

  it("never translates the Arabic the lesson teaches", async () => {
    await mount("ar");
    // The letters shown are the curriculum's own glyphs, in every language.
    for (const example of firstLesson.examples) expect(text(), example.arabic).toContain(example.arabic);
    for (const node of Array.from(container.querySelectorAll('[lang="ar"]'))) {
      expect(node.getAttribute("dir")).toBe("rtl");
    }
  });
});

describe("a lesson step with a recording offers a control that plays it", () => {
  it("plays the reference recording for the exercise on screen", async () => {
    await mount("en");
    const exercise = firstLesson.practice[0];
    // The first lesson's first item carries the letter's own recording.
    expect(exercise.audio?.letterSlug).toBeTruthy();

    const button = container.querySelector<HTMLButtonElement>(".course-audio");
    expect(button, "the lesson shows an audio control").toBeTruthy();
    expect(button!.textContent).toContain(en.strings["course.playAudio"]);

    await act(async () => {
      button!.click();
    });
    await settle();

    expect(played).toEqual([`/audio/letters/${exercise.audio!.letterSlug}.mp3`]);
  });

  it("names that control in the learner's language", async () => {
    await mount("ar");
    expect(container.querySelector(".course-audio")!.textContent).toContain(ar.strings["course.playAudio"]);
  });

  it("shows the lesson's Listen → Repeat → Check stages", async () => {
    await mount("en");
    const stages = Array.from(container.querySelectorAll(".course-stages span")).map((node) => node.textContent);
    // The first lesson declares learn → listen → recognize → check → complete,
    // and the strip names each of those steps for the learner.
    expect(firstLesson.stages).toContain("listen");
    expect(stages.join(" ")).toContain(en.strings["course.stageListen"]);
    expect(stages.join(" ")).toContain(en.strings["course.stageCheck"]);
  });
});
