/**
 * @vitest-environment happy-dom
 *
 * The lesson as a learner sits through it.
 *
 * `tutorConversation.test.ts` checks the shape as data. What is checked here is
 * the screen: that one sentence dominates it, that the Quran is on it in its
 * own direction in every interface language, that the controls are the two or
 * three the moment calls for, that a word which has come through stops being
 * presented as an error, and that nothing anywhere reaches for a synthesised
 * voice or claims a pronunciation was right.
 */
// The default import is what the test transform needs: it compiles JSX to
// `React.createElement` (tsconfig sets `jsx: "preserve"`).
import React, { act } from "react";
// React only flushes updates inside `act` when it knows it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveTutorPanel } from "./LiveTutorPanel";
import { LocaleProvider, useLocale } from "@/contexts/LocaleContext";
import type { TutorSessionView, TutorState } from "@shared/tutorConversation";
import { SUPPORTED_LANGUAGE_CODES, directionFor } from "@shared/languages";
import { loadLocale, type LocaleCode } from "@locales/index";
import en from "@locales/en";
import ps from "@locales/ps";
import faAF from "@locales/fa-AF";
import ur from "@locales/ur";
import ar from "@locales/ar";

/** Al-Fatiha 1:2, and the word a learner left out of it. */
const AYAH = { arabic: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ", label: "Al-Fatiha 1:2" };
const TARGET = { arabic: "رَبِّ", wordIndex: 3, totalWords: 4 };

let container: HTMLDivElement;
let root: Root;
const onIntent = vi.fn();

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

function Harness({ session, locale }: { session: TutorSessionView; locale: LocaleCode }) {
  const { setLocale } = useLocale();
  React.useEffect(() => {
    setLocale(locale);
  }, [locale, setLocale]);
  return <LiveTutorPanel session={session} ayah={AYAH} onIntent={onIntent} />;
}

async function show(session: TutorSessionView, locale: LocaleCode = "en") {
  await act(async () => {
    root.render(
      <LocaleProvider>
        <Harness session={session} locale={locale} />
      </LocaleProvider>,
    );
  });
  await settle();
}

const session = (state: TutorState, patch: Partial<TutorSessionView> = {}): TutorSessionView => ({
  state,
  canHearWord: true,
  canHearAyah: true,
  ...patch,
});

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dir = "ltr";
  document.documentElement.lang = "en";
  onIntent.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const text = () => container.textContent ?? "";
const message = () => container.querySelector(".tutor-message");
const controls = () => Array.from(container.querySelectorAll<HTMLButtonElement>(".tutor-control"));
const target = () => container.querySelector(".tutor-target");

/* ------------------------------------------------------ A, B: the states */

describe("the teacher is ready", () => {
  it("says so, and offers one thing to do", async () => {
    await show(session("ready"));

    expect(message()?.textContent).toBe(en.strings["tutor.ready"]);
    expect(controls()).toHaveLength(1);
    expect(controls()[0].textContent).toContain(en.strings["tutor.doStart"]);
    expect(controls()[0].className).toContain("is-primary");
  });

  it("puts the ayah on screen before anything else", async () => {
    await show(session("ready"));
    const ayah = container.querySelector(".tutor-ayah p")!;
    expect(ayah.textContent).toBe(AYAH.arabic);
    expect(ayah.getAttribute("lang")).toBe("ar");
    expect(ayah.getAttribute("dir")).toBe("rtl");
  });
});

describe("the teacher is listening", () => {
  it("says it is listening, and gets out of the way", async () => {
    await show(session("listening"));

    expect(message()?.textContent).toBe(en.strings["tutor.listening"]);
    expect(container.querySelector(".tutor-presence")?.textContent).toContain(en.strings["tutor.presenceListening"]);
    // Only the ways out — nothing that interrupts a learner mid-recitation.
    expect(controls().map((control) => control.textContent?.trim())).toEqual([
      expect.stringContaining(en.strings["tutor.doPause"]!),
      expect.stringContaining(en.strings["tutor.doFromBeginning"]!),
    ]);
  });

  it("says whose turn it is, in words", async () => {
    await show(session("listening"));
    expect(container.querySelector(".tutor-presence small")?.textContent).toBe(en.strings["tutor.turnLearner"]);

    await show(session("correction", { target: TARGET }));
    expect(container.querySelector(".tutor-presence small")?.textContent).toBe(en.strings["tutor.turnTeacher"]);
  });

  it("offers nothing to press while it checks", async () => {
    await show(session("checking"));
    expect(controls()).toHaveLength(0);
    expect(message()?.textContent).toBe(en.strings["tutor.checking"]);
  });
});

/* ------------------------------------------------- C: a word to go back to */

describe("one word needs another attempt", () => {
  it("says it in one short sentence and shows the word", async () => {
    await show(session("correction", { target: TARGET }));

    expect(message()?.textContent).toBe(en.strings["tutor.wordMissed"]);
    expect(target()?.querySelector("p")?.textContent).toBe("رَبِّ");
    expect(target()?.className).toContain("is-attention");
    expect(text()).toContain("Word 3 of 4");
  });

  it("offers hearing it, trying again, and the ayah — in that order", async () => {
    await show(session("correction", { target: TARGET }));

    const labels = controls().map((control) => control.textContent ?? "");
    expect(labels[0]).toContain(en.strings["tutor.doHearWord"]);
    expect(labels[1]).toContain(en.strings["tutor.doAgain"]);
    expect(labels[2]).toContain(en.strings["tutor.doHearAyah"]);

    await act(async () => {
      controls()[0].click();
    });
    expect(onIntent).toHaveBeenCalledWith("hear-word");
  });
});

/* ------------------------------------------- D, E: the resolved-word rule */

describe("a word that came through stops being the problem", () => {
  it("says it heard the word, and asks for the whole ayah", async () => {
    await show(session("word-recognised", { target: TARGET }));
    expect(message()?.textContent).toBe(en.strings["tutor.wordRecognised"]);

    await show(session("recite-ayah", { target: TARGET }));
    expect(message()?.textContent).toBe(en.strings["tutor.reciteFullAyah"]);
    // The whole ayah is the dominant next action, not one option among several.
    expect(controls()[0].className).toContain("is-primary");
    expect(controls()[0].textContent).toContain(en.strings["tutor.doAgain"]);
  });

  it("does not go on presenting the word as an unresolved error", async () => {
    await show(session("word-recognised", { target: TARGET }));

    // The reported production bug: "Needs attention" and "your review is ready"
    // standing beside "Good — I heard the marked word this time".
    expect(target()?.className).toContain("is-resolved");
    expect(target()?.className).not.toContain("is-attention");
    expect(text()).not.toContain(en.strings["lesson.eyebrow"]);
    expect(text()).not.toContain(en.strings["recorder.reviewReady"]);
    expect(text()).not.toContain(en.strings["tutor.wordMissed"]);

    // The word is still on screen — as context, with a tick, not as a fault.
    expect(target()?.querySelector("p")?.textContent).toBe("رَبِّ");
    expect(target()?.querySelector("svg")).toBeTruthy();
  });

  it("shows one teaching state at a time", async () => {
    for (const state of ["correction", "word-recognised", "recite-ayah", "uncertain"] as const) {
      await show(session(state, { target: TARGET }));
      // One sentence. Not a result panel, a status line and an instruction.
      expect(container.querySelectorAll(".tutor-message"), state).toHaveLength(1);
      expect(container.querySelectorAll(".tutor-target"), state).toHaveLength(1);
    }
  });
});

/* ------------------------------------------------------------ F: unsure */

describe("an attempt the teacher could not judge", () => {
  it("says so without accusing the learner of anything", async () => {
    await show(session("uncertain", { target: TARGET }));

    expect(message()?.textContent).toBe(en.strings["tutor.uncertain"]);
    for (const claim of ["wrong", "incorrect", "mistake", "missed"]) {
      expect(text().toLowerCase(), claim).not.toContain(claim);
    }
    // The word is neither marked as the fault nor ticked as a success: the
    // teacher could not tell, so neither would be true.
    expect(target()?.className).toContain("is-neutral");
    expect(target()?.querySelector("svg")).toBeNull();
  });
});

/* --------------------------------------------------------------- G: hint */

describe("help, when a learner is stuck", () => {
  it("offers a hint as a quiet third option", async () => {
    await show(session("correction", { target: TARGET, hintAvailable: true }));
    const labels = controls().map((control) => control.textContent ?? "");
    expect(labels[labels.length - 1]).toContain(en.strings["tutor.doHint"]);
    expect(controls()[controls().length - 1].className).not.toContain("is-primary");
  });

  it("gives the hint against the word itself", async () => {
    await show(session("hint", { target: TARGET, hintShown: true }));
    expect(message()?.textContent).toBe(en.strings["tutor.hintGiven"]!.replace("{word}", "رَبِّ"));
  });

  it("never interrupts a recitation with an offer of help", async () => {
    await show(session("listening", { hintAvailable: true }));
    expect(text()).not.toContain(en.strings["tutor.doHint"]);
  });
});

/* ------------------------------------------------------- H: pause/resume */

describe("stepping away and coming back", () => {
  it("is calm about a pause, and offers the way back first", async () => {
    await show(session("paused"));

    expect(message()?.textContent).toBe(en.strings["tutor.paused"]);
    expect(controls()[0].textContent).toContain(en.strings["tutor.doResume"]);
    expect(controls()[0].className).toContain("is-primary");
    expect(controls()[1].textContent).toContain(en.strings["tutor.doStop"]);

    await act(async () => {
      controls()[0].click();
    });
    expect(onIntent).toHaveBeenCalledWith("resume");
  });

  it("finishes without a report", async () => {
    await show(session("complete"));
    expect(message()?.textContent).toBe(en.strings["tutor.finished"]);
    expect(container.querySelector(".tutor-details")).toBeNull();
    expect(text()).not.toMatch(/\d+%/);
  });
});

/* ------------------------------------------------- I: context-sensitivity */

describe("the controls follow the moment", () => {
  it("never shows the whole vocabulary at once", async () => {
    for (const state of ["ready", "listening", "checking", "correction", "recite-ayah", "paused", "complete"] as const) {
      await show(session(state, { target: TARGET, hintAvailable: true }));
      expect(controls().length, state).toBeLessThanOrEqual(3);
    }
  });

  it("drops the word control when there is no trustworthy recording of it", async () => {
    await show(session("correction", { target: TARGET, canHearWord: false }));
    expect(text()).not.toContain(en.strings["tutor.doHearWord"]);
    expect(controls()[0].textContent).toContain(en.strings["tutor.doAgain"]);
  });
});

/* -------------------------------------------- P: the audio boundary holds */

describe("nothing is synthesised, and nothing is claimed", () => {
  it("asks its caller for audio rather than making any", async () => {
    await show(session("correction", { target: TARGET }));
    await act(async () => {
      controls()[0].click();
      controls()[2].click();
    });
    // The panel raises intents. Which file plays is the page's business, and
    // the page uses the trusted Quran paths.
    expect(onIntent.mock.calls.map(([intent]) => intent)).toEqual(["hear-word", "hear-ayah"]);
  });

  it("offers no synthesised alternative anywhere", async () => {
    for (const state of ["correction", "uncertain", "recite-ayah"] as const) {
      await show(session(state, { target: TARGET, hintAvailable: true }));
      for (const label of controls().map((control) => control.textContent?.toLowerCase() ?? "")) {
        for (const fake of ["speech", "synth", "tts", "robot", "computer voice"]) {
          expect(label, `${state}/${fake}`).not.toContain(fake);
        }
      }
    }
  });

  it("claims nothing about pronunciation in any state", async () => {
    for (const state of ["correction", "word-recognised", "recite-ayah", "complete"] as const) {
      await show(session(state, { target: TARGET }));
      for (const claim of ["pronunciation", "makhraj", "tajwid", "tajweed", "perfect"]) {
        expect(text().toLowerCase(), `${state}/${claim}`).not.toContain(claim);
      }
    }
  });
});

/* ---------------------------------------- J–O: five languages, and RTL */

describe("every language the app teaches in", () => {
  const packs = { en, ps, "fa-AF": faAF, ur, ar } as const;

  it.each(SUPPORTED_LANGUAGE_CODES.map((code) => [code]))("teaches in %s", async (code) => {
    await show(session("correction", { target: TARGET }), code);
    const pack = packs[code as keyof typeof packs];

    expect(message()?.textContent, code).toBe(pack.strings["tutor.wordMissed"]);
    expect(controls().length, code).toBe(3);
    expect(controls()[0].textContent, code).toContain(pack.strings["tutor.doHearWord"]);
    expect(container.querySelector(".live-tutor")?.getAttribute("aria-label"), code).toBe(pack.strings["tutor.label"]);
    expect(document.documentElement.dir, code).toBe(directionFor(code));
  });

  it.each(["ps", "fa-AF", "ur", "ar"].map((code) => [code]))("does not fall back to English in %s", async (code) => {
    await show(session("recite-ayah", { target: TARGET }), code as LocaleCode);
    const pack = packs[code as keyof typeof packs];

    expect(text(), code).toContain(pack.strings["tutor.reciteFullAyah"]);
    expect(text(), code).not.toContain(en.strings["tutor.reciteFullAyah"]);
    expect(text(), code).not.toContain(en.strings["tutor.doAgain"]);
  });

  it("keeps the Quran in its own direction and order in every language", async () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      await show(session("correction", { target: TARGET }), code);
      const ayah = container.querySelector(".tutor-ayah p")!;
      expect(ayah.getAttribute("dir"), code).toBe("rtl");
      expect(ayah.getAttribute("lang"), code).toBe("ar");
      // Byte-for-byte: no normalisation, no stripped harakat, no reordering.
      expect(Array.from(ayah.textContent!), code).toEqual(Array.from(AYAH.arabic));
      expect(target()?.querySelector("p")?.getAttribute("dir"), code).toBe("rtl");
      expect(target()?.querySelector("p")?.textContent, code).toBe("رَبِّ");
    }
  });

  it("lays the panel out right-to-left, and returns to left-to-right", async () => {
    for (const code of ["ps", "fa-AF", "ur", "ar"] as const) {
      await show(session("ready"), code);
      expect(document.documentElement.dir, code).toBe("rtl");
      expect(document.documentElement.lang, code).toBe(code);
    }
    await show(session("ready"), "en");
    expect(document.documentElement.dir).toBe("ltr");
    // The Quran keeps its own direction whichever way the interface runs.
    expect(container.querySelector(".tutor-ayah p")?.getAttribute("dir")).toBe("rtl");
  });
});

/* ------------------------------------------------------- accessibility */

describe("accessibility", () => {
  it("names the panel and announces the teacher's sentence", async () => {
    await show(session("correction", { target: TARGET }));
    expect(container.querySelector(".live-tutor")?.getAttribute("aria-label")).toBe(en.strings["tutor.label"]);
    expect(message()?.getAttribute("aria-live")).toBe("polite");
  });

  it("moves focus to the sentence when the teacher speaks", async () => {
    await show(session("listening"));
    await show(session("correction", { target: TARGET }));
    expect(document.activeElement).toBe(message());
  });

  it("gives every control a readable label, not an icon alone", async () => {
    await show(session("correction", { target: TARGET, hintAvailable: true }));
    for (const control of controls()) {
      expect((control.textContent ?? "").trim().length, control.className).toBeGreaterThan(0);
    }
  });

  it("says the state in words rather than only in colour or motion", async () => {
    for (const [state, key] of [
      ["listening", "tutor.presenceListening"],
      ["checking", "tutor.presenceThinking"],
      ["ready", "tutor.presenceWaiting"],
    ] as const) {
      await show(session(state));
      expect(container.querySelector(".tutor-presence")?.textContent, state).toContain(en.strings[key]);
    }
  });
});

/* -------------------------------------------------- voice, honestly */

describe("speaking to the teacher", () => {
  it("says plainly that it is not listening yet", async () => {
    await show(session("ready"));
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".tutor-voice-open")!.click();
    });

    expect(container.querySelector(".tutor-voice")?.textContent).toContain(en.strings["tutor.voiceNotListening"]);
    // The phrases it will understand, listed rather than implied.
    expect(container.querySelectorAll(".tutor-voice li").length).toBeGreaterThan(4);
  });

  it("is closed by default, and out of the way", async () => {
    await show(session("listening"));
    expect(container.querySelector(".tutor-voice")).toBeNull();
    expect(container.querySelector(".tutor-voice-open")?.getAttribute("aria-expanded")).toBe("false");
  });
});

/* ------------------------------------------ Q: progressive disclosure */

describe("the learner is not shown everything at once", () => {
  it("shows no transcript, score or stage strip by default", async () => {
    await show(session("correction", { target: TARGET }));
    expect(text()).not.toMatch(/\d+%/);
    expect(container.querySelector(".tutor-details")).toBeNull();
    // The screen is the ayah, one sentence, the word, and the controls.
    expect(container.querySelectorAll(".tutor-message")).toHaveLength(1);
  });

  it("keeps what the teacher noticed collapsed when there is any", async () => {
    await act(async () => {
      root.render(
        <LocaleProvider>
          <LiveTutorPanel session={session("correction", { target: TARGET })} ayah={AYAH} onIntent={onIntent} details={<p>detail</p>} />
        </LocaleProvider>,
      );
    });
    await settle();

    const details = container.querySelector<HTMLDetailsElement>(".tutor-details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe(en.strings["tutor.detailsSummary"]);
  });
});
