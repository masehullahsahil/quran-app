/**
 * @vitest-environment happy-dom
 *
 * The lesson as a learner meets it.
 *
 * `correctionSession.test.ts` checks the state as data. What is checked here is
 * the screen: that the exact word is on it, that the ayah beneath it is the
 * Quran's own text in the Quran's own order with only the target marked, that
 * the current step is exposed to a screen reader and not only to the eye, that
 * recording and checking are said in words as well as shown in colour, and —
 * the one that matters most — that "I heard the word" never turns into a claim
 * about how the word was pronounced.
 */
// The default import is what the test transform needs: it compiles JSX to
// `React.createElement` (tsconfig sets `jsx: "preserve"`).
import React, { act } from "react";
// React only flushes updates inside `act` when it knows it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusedWordLesson } from "./FocusedWordLesson";
import { LocaleProvider, useLocale } from "@/contexts/LocaleContext";
import { deriveCorrectionLesson, type CorrectionLesson, type CorrectionLessonInput } from "@/lib/correctionSession";
import { resolveTeacherAction } from "@/lib/teacherAction";
import type { AttemptEvidence, TeacherEvidence, TextCorrection } from "@shared/teacherDecision";
import type { VerseFollowingResult } from "@shared/verseFollowing";
import { SUPPORTED_LANGUAGE_CODES, directionFor } from "@shared/languages";
import { loadLocale, type LocaleCode } from "@locales/index";
import en from "@locales/en";
import ps from "@locales/ps";
import ar from "@locales/ar";

/* ---------------------------------------------------------------- fixtures */

/** Al-Fatiha 1:2, and the word a learner omitted from it. */
const AYAH_WORDS = ["ٱلْحَمْدُ", "لِلَّهِ", "رَبِّ", "ٱلْعَـٰلَمِينَ"];
const TARGET = "رَبِّ";
const MISSING: TextCorrection = { expected: TARGET, heard: null, status: "missing", wordIndex: 3 };

function follow(patch: Partial<VerseFollowingResult> = {}): VerseFollowingResult {
  return {
    currentSurah: 1, currentAyah: 2, expectedWordIndex: 1, lastCompletedAyah: null, state: "correcting",
    attemptsOnCurrentAyah: 1, evidence: "partial", shouldAdvance: false, nextAyah: 3, correctionFocus: null,
    reason: "mistake_to_correct", ...patch,
  };
}

function attempt(patch: Partial<AttemptEvidence> = {}): AttemptEvidence {
  return { reviewable: true, corrections: [MISSING], verseFollowing: follow(), ...patch };
}

function evidence(patch: Partial<TeacherEvidence> = {}): TeacherEvidence {
  return {
    recording: { isRecording: false, isReviewing: false, failed: false },
    attempt: attempt(),
    acoustic: null,
    memory: { reviewDue: false, recurringWordIndexes: [] },
    livePosition: { currentSurah: 1, currentAyah: 2, expectedWordIndex: 1 },
    hasNextAyah: true,
    ...patch,
  };
}

/** Runs the real decision engine, then the real derivation. */
function lessonFor(patch: Partial<CorrectionLessonInput> = {}): CorrectionLesson {
  const lesson = deriveCorrectionLesson({
    action: resolveTeacherAction(evidence()),
    surah: 1,
    ayah: 2,
    observationKey: "correction.notHeard",
    ayahWords: AYAH_WORDS,
    corrections: [MISSING],
    wordReviewAvailable: true,
    lastAttemptScope: null,
    isRecording: false,
    isChecking: false,
    ...patch,
  });
  if (!lesson) throw new Error("expected a lesson");
  return lesson;
}

/* ------------------------------------------------------------------ render */

let container: HTMLDivElement;
let root: Root;
const onListen = vi.fn();
const onRecordWord = vi.fn();
const onRecordAyah = vi.fn();
const onStop = vi.fn();
const onContinue = vi.fn();

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

function Harness({ lesson, locale }: { lesson: CorrectionLesson; locale: LocaleCode }) {
  const { setLocale } = useLocale();
  React.useEffect(() => {
    setLocale(locale);
  }, [locale, setLocale]);
  return (
    <FocusedWordLesson
      lesson={lesson}
      onListen={onListen}
      onRecordWord={onRecordWord}
      onRecordAyah={onRecordAyah}
      onStop={onStop}
      onContinue={onContinue}
      audioUnavailable={false}
    />
  );
}

async function show(lesson: CorrectionLesson, locale: LocaleCode = "en") {
  await act(async () => {
    root.render(
      <LocaleProvider>
        <Harness lesson={lesson} locale={locale} />
      </LocaleProvider>,
    );
  });
  await settle();
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dir = "ltr";
  document.documentElement.lang = "en";
  for (const spy of [onListen, onRecordWord, onRecordAyah, onStop, onContinue]) spy.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const text = () => container.textContent ?? "";
const word = () => container.querySelector(".lesson-word");
const primary = () => container.querySelector<HTMLButtonElement>(".lesson-primary");
const currentStep = () => container.querySelector('.lesson-steps li[aria-current="step"]');

/* ------------------------------------------------------------------- tests */

describe("the word is the object on screen", () => {
  it("shows the exact word the decision named, with its position", async () => {
    await show(lessonFor());

    expect(word()?.textContent).toBe(TARGET);
    expect(word()?.getAttribute("lang")).toBe("ar");
    expect(word()?.getAttribute("dir")).toBe("rtl");
    expect(text()).toContain("Word 3 of 4");
    expect(text()).toContain(en.strings["lesson.eyebrow"]);
  });

  it("says what was observed, in the decision's own wording", async () => {
    await show(lessonFor());
    expect(text()).toContain(en.strings["correction.notHeard"]);
  });

  it("keeps the word larger than the rest of the card by being its own element", async () => {
    await show(lessonFor());
    expect(word()?.tagName).toBe("P");
    expect(word()?.childElementCount).toBe(0);
  });
});

describe("the ayah underneath shows where the word belongs", () => {
  it("renders every word of the ayah, in order, exactly as given", async () => {
    await show(lessonFor());

    const spans = Array.from(container.querySelectorAll(".lesson-context p span"));
    expect(spans.map((node) => node.textContent)).toEqual(AYAH_WORDS);
    // Byte-for-byte: no normalisation, no stripped harakat, no reordering.
    spans.forEach((node, index) => {
      expect(Array.from(node.textContent!), AYAH_WORDS[index]).toEqual(Array.from(AYAH_WORDS[index]));
    });
  });

  it("marks only the target", async () => {
    await show(lessonFor());

    const marked = Array.from(container.querySelectorAll(".lesson-context .is-target"));
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toBe(TARGET);
  });

  it("keeps the ayah right-to-left whatever the interface language is", async () => {
    for (const locale of ["en", "ur"] as const) {
      await show(lessonFor(), locale);
      const line = container.querySelector(".lesson-context p");
      expect(line?.getAttribute("dir"), locale).toBe("rtl");
      expect(line?.getAttribute("lang"), locale).toBe("ar");
      // Order is the Quran's own, in either interface direction.
      expect(Array.from(line!.querySelectorAll("span")).map((node) => node.textContent), locale).toEqual(AYAH_WORDS);
    }
  });
});

describe("the four steps", () => {
  it("shows four, highlights one, and says which to a screen reader", async () => {
    await show(lessonFor());

    const steps = Array.from(container.querySelectorAll(".lesson-steps li"));
    expect(steps).toHaveLength(4);
    expect(steps.filter((node) => node.getAttribute("aria-current") === "step")).toHaveLength(1);
    expect(currentStep()?.textContent).toContain(en.strings["lesson.stageHear"]);
    expect(container.querySelector(".lesson-steps")?.getAttribute("aria-label")).toBe(en.strings["lesson.stepsLabel"]);
  });

  it("moves the highlight when the backend's answer moves the lesson on", async () => {
    await show(lessonFor({ lastAttemptScope: "word", corrections: [] }));
    expect(currentStep()?.textContent).toContain(en.strings["lesson.stageRecite"]);
    // The steps behind it are marked done, not merely unhighlighted.
    expect(container.querySelectorAll(".lesson-steps li.is-done")).toHaveLength(2);
  });
});

describe("one primary action at a time", () => {
  it("asks for the word, by name, and uses the page's recorder", async () => {
    await show(lessonFor());

    expect(primary()?.textContent).toContain(TARGET);
    await act(async () => {
      primary()!.click();
    });
    expect(onRecordWord).toHaveBeenCalledTimes(1);
    expect(onRecordAyah).not.toHaveBeenCalled();
  });

  it("becomes a stop control while recording, and says it is listening", async () => {
    await show(lessonFor({ isRecording: true }));

    expect(primary()?.textContent).toContain(en.strings["lesson.stopRecording"]);
    // Not colour alone: the state is in the button text and in a status line.
    expect(container.querySelector(".lesson-status")?.textContent).toContain(en.strings["lesson.listening"]);
    expect(container.querySelector(".lesson-status")?.getAttribute("role")).toBe("status");

    await act(async () => {
      primary()!.click();
    });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("says it is checking the word, and offers nothing to press", async () => {
    await show(lessonFor({ isChecking: true }));

    expect(primary()?.textContent).toContain(en.strings["lesson.checking"]);
    expect(primary()?.disabled).toBe(true);
    expect(container.querySelector(".lesson-status")?.textContent).toContain(en.strings["lesson.checking"]);
  });

  it("asks for the whole ayah once the word has gone through", async () => {
    await show(lessonFor({ lastAttemptScope: "word", corrections: [] }));

    expect(primary()?.textContent).toContain(en.strings["lesson.reciteAyah"]);
    await act(async () => {
      primary()!.click();
    });
    expect(onRecordAyah).toHaveBeenCalledTimes(1);
    expect(onRecordWord).not.toHaveBeenCalled();
  });
});

describe("what the app says when it hears the word", () => {
  it("says it heard the word, and claims nothing about pronunciation", async () => {
    await show(lessonFor({ lastAttemptScope: "word", corrections: [] }));

    expect(text()).toContain(en.strings["lesson.recognised"]);
    expect(text()).toContain(en.strings["lesson.reciteHeadline"]);
    for (const claim of ["pronunciation is correct", "perfect tajwid", "correct makhraj", "makhraj", "tajweed"]) {
      expect(text().toLowerCase(), claim).not.toContain(claim);
    }
  });

  it("keeps the same word, and does not shame the learner, when it did not", async () => {
    await show(lessonFor({ lastAttemptScope: "word" }));

    expect(word()?.textContent).toBe(TARGET);
    expect(text()).toContain(en.strings["lesson.notRecognisedDetail"]);
    expect(text()).not.toContain(en.strings["lesson.recognised"]);
    for (const word of ["wrong", "incorrect", "failed"]) expect(text().toLowerCase(), word).not.toContain(word);
  });
});

describe("hearing the word", () => {
  it("offers the reciter's ayah, and says that is what it is", async () => {
    await show(lessonFor());

    const listen = container.querySelector<HTMLButtonElement>(".lesson-listen");
    expect(listen?.textContent).toContain(en.strings["correction.listen"]);
    // There is no word-level recitation in the data, and nothing is synthesised
    // to fill the gap. The note says so rather than the button pretending.
    expect(text()).toContain(en.strings["lesson.referenceNote"]);

    await act(async () => {
      listen!.click();
    });
    expect(onListen).toHaveBeenCalledTimes(1);
  });

  it("never offers a synthesised reference", async () => {
    await show(lessonFor());
    const labels = Array.from(container.querySelectorAll("button")).map((node) => node.textContent?.toLowerCase() ?? "");
    for (const label of labels) {
      for (const fake of ["speech", "synth", "text to speech", "tts", "robot"]) {
        expect(label, fake).not.toContain(fake);
      }
    }
  });
});

describe("accessibility", () => {
  it("names the lesson and announces the current instruction", async () => {
    await show(lessonFor());

    expect(container.querySelector(".word-lesson")?.getAttribute("aria-label")).toBe(en.strings["lesson.label"]);
    expect(container.querySelector(".lesson-headline")?.getAttribute("aria-live")).toBe("polite");
  });

  it("moves focus to the instruction when the lesson moves on", async () => {
    await show(lessonFor());
    // The learner's eyes are on the microphone; what changed is above it.
    expect(document.activeElement).toBe(container.querySelector(".lesson-headline"));
  });

  it("gives every control a readable label rather than an icon alone", async () => {
    await show(lessonFor());
    for (const button of Array.from(container.querySelectorAll("button"))) {
      expect((button.textContent ?? "").trim().length, button.className).toBeGreaterThan(0);
    }
  });
});

describe("every language the app carries", () => {
  it.each(SUPPORTED_LANGUAGE_CODES.map((code) => [code]))("renders the lesson in %s", async (code) => {
    await show(lessonFor(), code);

    expect(container.querySelector(".word-lesson"), code).toBeTruthy();
    expect(word()?.textContent, code).toBe(TARGET);
    expect(container.querySelectorAll(".lesson-steps li"), code).toHaveLength(4);
    expect(primary(), code).toBeTruthy();
    expect(document.documentElement.dir, code).toBe(directionFor(code));
    // The Quran line keeps its own direction and its own order in every one.
    expect(
      Array.from(container.querySelectorAll(".lesson-context p span")).map((node) => node.textContent),
      code,
    ).toEqual(AYAH_WORDS);
  });

  it("shows the steps and the action in Pashto, not English", async () => {
    await show(lessonFor(), "ps");

    expect(text()).toContain(ps.strings["lesson.stageHear"]);
    expect(text()).toContain(ps.strings["lesson.eyebrow"]);
    expect(primary()?.textContent).toContain(ps.strings["lesson.sayWord"]!.replace("{word}", TARGET));
    expect(text()).not.toContain(en.strings["lesson.stepsLabel"]);
  });

  it("says it heard the word in Arabic, without a stronger claim", async () => {
    await show(lessonFor({ lastAttemptScope: "word", corrections: [] }), "ar");

    expect(text()).toContain(ar.strings["lesson.recognised"]);
    expect(text()).toContain(ar.strings["lesson.reciteHeadline"]);
    expect(document.documentElement.dir).toBe("rtl");
    expect(word()?.getAttribute("dir")).toBe("rtl");
  });
});
