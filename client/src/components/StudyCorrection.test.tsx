/**
 * @vitest-environment happy-dom
 *
 * The correction card, rendered the way a learner meets it.
 *
 * `studyView.test.ts` already checks the layout contract as data. What is
 * checked here is the screen: that the exact Arabic word is on it, that its
 * position is named, that the observation is worded no more strongly than the
 * evidence behind it, that the microphone is right there, and — the two that
 * matter most — that a state the app was *not* sure about never puts a Quranic
 * word on screen as though it were wrong, and that a correction disappears the
 * moment a later attempt no longer reports it.
 *
 * The panels are built by running the real decision engine over evidence
 * fixtures, so a change in the engine that reshapes these states shows up here
 * rather than being papered over by a hand-written prop.
 */
// The default import is what the test transform needs: it compiles JSX to
// `React.createElement` (tsconfig sets `jsx: "preserve"`).
import React, { act } from "react";
// React only flushes updates inside `act` when it knows it is under test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StudyCorrection } from "./StudyCorrection";
import { LocaleProvider, useLocale } from "@/contexts/LocaleContext";
import { describeStudyTiers, type StudyTiers } from "@/lib/studyView";
import { resolveTeacherAction } from "@/lib/teacherAction";
import type { AttemptEvidence, TeacherEvidence } from "@shared/teacherDecision";
import type { VerseFollowingResult } from "@shared/verseFollowing";
import { SUPPORTED_LANGUAGE_CODES, directionFor } from "@shared/languages";
import { loadLocale, type LocaleCode } from "@locales/index";
import en from "@locales/en";
import ps from "@locales/ps";
import ar from "@locales/ar";

/* ---------------------------------------------------------------- fixtures */

function follow(patch: Partial<VerseFollowingResult> = {}): VerseFollowingResult {
  return {
    currentSurah: 1,
    currentAyah: 2,
    expectedWordIndex: 1,
    lastCompletedAyah: null,
    state: "following",
    attemptsOnCurrentAyah: 1,
    evidence: "partial",
    shouldAdvance: false,
    nextAyah: 3,
    correctionFocus: null,
    reason: "partial_progress",
    ...patch,
  };
}

function attempt(patch: Partial<AttemptEvidence> = {}): AttemptEvidence {
  return { reviewable: true, corrections: [], verseFollowing: follow(), ...patch };
}

function evidence(patch: Partial<TeacherEvidence> = {}): TeacherEvidence {
  return {
    recording: { isRecording: false, isReviewing: false, failed: false },
    attempt: null,
    acoustic: null,
    memory: { reviewDue: false, recurringWordIndexes: [] },
    livePosition: { currentSurah: 1, currentAyah: 2, expectedWordIndex: 1 },
    hasNextAyah: true,
    ...patch,
  };
}

/** The word the fixtures send the learner back to. Real Quranic Arabic. */
const FOCUS_WORD = "رَبِّ";

const SCENARIOS = {
  /** A. The word was not heard at all. */
  missingWord: evidence({
    attempt: attempt({
      corrections: [{ expected: FOCUS_WORD, heard: null, status: "missing", wordIndex: 3 }],
      verseFollowing: follow({ state: "correcting" }),
    }),
  }),
  /** B. Something else came through in its place. */
  differentWord: evidence({
    attempt: attempt({
      corrections: [{ expected: FOCUS_WORD, heard: "رَبَّ", status: "review", wordIndex: 3 }],
      verseFollowing: follow({ state: "correcting" }),
    }),
  }),
  /** The confidence-gated listener flagged how a word sounded. */
  soundObservation: evidence({
    attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong" }) }),
    acoustic: {
      status: "available",
      provider: "test",
      confidence: 0.92,
      summary: "s",
      findings: [{ kind: "phoneme", wordIndex: 4, expectedArabic: "الْعَالَمِينَ", guidance: "g" }],
      canDriveLearnerCorrection: true,
    },
  }),
  /** C. Words came through, but not enough of this ayah to judge any of them. */
  uncertain: evidence({
    attempt: attempt({ verseFollowing: follow({ state: "uncertain", reason: "noisy_transcript", evidence: "weak" }) }),
  }),
  /** C2. Nothing usable came back at all. */
  noTranscript: evidence({
    attempt: attempt({ reviewable: false, verseFollowing: follow({ state: "uncertain", reason: "no_transcript", evidence: "none" }) }),
  }),
  /** D. The whole ayah needs another recitation. */
  repeatAyah: evidence({ attempt: attempt({ verseFollowing: follow({ state: "correcting" }) }) }),
  /** E. Accepted — move on. */
  accepted: evidence({
    attempt: attempt({ verseFollowing: follow({ shouldAdvance: true, currentAyah: 3, evidence: "strong" }) }),
  }),
} satisfies Record<string, TeacherEvidence>;

function tiersFor(input: TeacherEvidence): StudyTiers {
  return describeStudyTiers({
    action: resolveTeacherAction(input),
    hasFeedback: input.attempt !== null,
    wordReviewAvailable: input.attempt?.reviewable ?? false,
    hasAcousticReview: input.acoustic !== null,
    audioUnavailable: false,
    reviewFailed: input.recording.failed,
  });
}

/* ------------------------------------------------------------------ render */

let container: HTMLDivElement;
let root: Root;
const onListen = vi.fn();
const onRecord = vi.fn();
const onCta = vi.fn();

/**
 * Every pack but English is a dynamic import. Under the test runner the module
 * graph resolves on its own schedule, so the packs are warmed once up front and
 * the switch under test is the state change, not the download.
 */
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

/** Sets the language the way the picker does, then renders the card. */
function Harness({ tiers, locale }: { tiers: StudyTiers; locale: LocaleCode }) {
  const { setLocale } = useLocale();
  React.useEffect(() => {
    setLocale(locale);
  }, [locale, setLocale]);
  return (
    <StudyCorrection
      correction={tiers.correction}
      outcome={tiers.outcome}
      onListen={onListen}
      onRecord={onRecord}
      onCta={onCta}
      isRecording={false}
      isReviewing={false}
      audioUnavailable={false}
    />
  );
}

async function render(tiers: StudyTiers, locale: LocaleCode = "en") {
  await act(async () => {
    root.render(
      <LocaleProvider>
        <Harness tiers={tiers} locale={locale} />
      </LocaleProvider>,
    );
  });
  await settle();
}

async function show(input: TeacherEvidence, locale: LocaleCode = "en") {
  await render(tiersFor(input), locale);
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dir = "ltr";
  document.documentElement.lang = "en";
  onListen.mockClear();
  onRecord.mockClear();
  onCta.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const text = () => container.textContent ?? "";
const card = () => container.querySelector(".study-fix");
const word = () => container.querySelector(".fix-word");

/* ------------------------------------------------------------------- tests */

describe("an exact word to repeat", () => {
  it("puts that exact word on screen, in Arabic, with its position", async () => {
    await show(SCENARIOS.missingWord);

    expect(word()?.textContent).toBe(FOCUS_WORD);
    expect(word()?.getAttribute("lang")).toBe("ar");
    expect(text()).toContain(en.strings["correction.wordAt"].replace("{number}", "3"));
    expect(text()).toContain(en.strings["correction.eyebrow"]);
  });

  it("makes the word the largest thing in the card", async () => {
    await show(SCENARIOS.missingWord);
    // The stylesheet sets the size; what is asserted here is the structure the
    // stylesheet targets — the word is its own element, not part of a sentence.
    expect(word()?.tagName).toBe("P");
    expect(word()?.childElementCount).toBe(0);
    expect(container.querySelector(".fix-headline")).toBeNull();
  });

  it("says the word was not heard, without saying it was wrong", async () => {
    await show(SCENARIOS.missingWord);

    expect(text()).toContain(en.strings["correction.notHeard"]);
    for (const claim of ["wrong", "incorrect", "mistake"]) expect(text().toLowerCase(), claim).not.toContain(claim);
  });

  it("uses different wording when the word came through differently", async () => {
    await show(SCENARIOS.differentWord);

    expect(text()).toContain(en.strings["correction.different"]);
    expect(text()).not.toContain(en.strings["correction.notHeard"]);
  });

  it("keeps a sound observation an observation", async () => {
    await show(SCENARIOS.soundObservation);

    expect(text()).toContain(en.strings["correction.sound"]);
    // The evaluator reported how a word sounded. That is not a verdict, and the
    // card must not turn it into one.
    for (const claim of ["wrong", "incorrect", "mispronounc"]) expect(text().toLowerCase(), claim).not.toContain(claim);
  });

  it("shows the path back to the microphone, ending at the recorder", async () => {
    await show(SCENARIOS.missingWord);

    const steps = Array.from(container.querySelectorAll(".fix-steps > li")).map((node) => node.textContent ?? "");
    expect(steps[0]).toContain(en.strings["step.listen"]);
    expect(steps[1]).toContain(en.strings["step.repeatWord"]);
    expect(steps[2]).toContain(en.strings["step.reciteAyah"]);
    expect(steps[steps.length - 1]).toContain(en.strings["correction.recordAgain"]);
    expect(steps.join(" ")).not.toContain(en.strings["step.showWord"]);
  });

  it("puts Record again in the card as a real, working control", async () => {
    await show(SCENARIOS.missingWord);

    const record = container.querySelector<HTMLButtonElement>(".fix-record");
    expect(record?.textContent).toContain(en.strings["correction.recordAgain"]);

    await act(async () => {
      record!.click();
    });
    // The page's one recorder, not a second implementation inside this card.
    expect(onRecord).toHaveBeenCalledTimes(1);
  });

  it("offers the ayah to listen to, and says why it is the ayah", async () => {
    await show(SCENARIOS.missingWord);

    const listen = container.querySelector<HTMLButtonElement>(".fix-listen");
    expect(listen?.textContent).toContain(en.strings["correction.listen"]);
    // No word-level recitation exists in the data, and none is synthesised.
    expect(text()).toContain(en.strings["correction.referenceNote"]);

    await act(async () => {
      listen!.click();
    });
    expect(onListen).toHaveBeenCalledTimes(1);
  });

  it("tells the learner what happens once the word comes through", async () => {
    await show(SCENARIOS.missingWord);
    expect(text()).toContain(en.strings["correction.after"]);
  });
});

describe("states that name no word never show one", () => {
  it("asks for the whole ayah again without blaming a word", async () => {
    await show(SCENARIOS.repeatAyah);

    expect(word()).toBeNull();
    expect(text()).toContain(en.strings["outcome.ayahHeadline"]);
    expect(text()).not.toContain(FOCUS_WORD);
    expect(card()?.className).toContain("is-whole-ayah");
  });

  it("says the recording did not match the ayah, and shows no correction word", async () => {
    await show(SCENARIOS.uncertain);

    expect(word()).toBeNull();
    // Words *were* transcribed; they just did not fit this ayah. Saying that is
    // more use than "nothing has been marked wrong", and it is what stops the
    // learner reading four aligner rows as four specific mistakes.
    expect(text()).toContain(en.strings["outcome.unrelatedHeadline"]);
    expect(text()).toContain(en.strings["outcome.unrelatedDetail"]);
    expect(card()?.className).toContain("is-uncertain");
    // Nothing about an unreviewable attempt may read as a confirmed mistake.
    // The card says the opposite in as many words, and never asserts one.
    expect(text()).toContain(en.strings["outcome.unrelatedDetail"]);
    expect(text()).not.toContain(en.strings["correction.eyebrow"]);
    for (const claim of ["was wrong", "is wrong", "incorrect", "mistake"]) {
      expect(text().toLowerCase(), claim).not.toContain(claim);
    }
  });

  it("offers no second retry button beside the recorder", async () => {
    await show(SCENARIOS.uncertain);
    // "Try again" next to "Record again" is two names for one thing.
    expect(container.querySelector(".fix-cta")).toBeNull();
    expect(text()).not.toContain(en.strings["now.tryAgain"]);
  });

  it("keeps the softer wording when nothing came back at all", async () => {
    await show(SCENARIOS.noTranscript);

    // No transcript is a different thing from a transcript that did not fit,
    // and telling the learner their recording "did not match the ayah" when the
    // app never heard anything would be a claim about a recitation it has not read.
    expect(text()).toContain(en.strings["outcome.problemHeadline"]);
    expect(word()).toBeNull();
  });

  it("keeps the uncertain card visually distinct from a correction", async () => {
    await show(SCENARIOS.uncertain);
    const uncertain = card()!.className;
    await show(SCENARIOS.missingWord);

    expect(card()!.className).not.toBe(uncertain);
    expect(card()!.className).toContain("is-word");
  });

  it("offers listening and recording again from the uncertain state", async () => {
    await show(SCENARIOS.uncertain);

    expect(container.querySelector(".fix-listen")).toBeTruthy();
    expect(container.querySelector(".fix-record")).toBeTruthy();
  });
});

describe("an accepted attempt", () => {
  it("says so plainly and offers the decision's own next step", async () => {
    await show(SCENARIOS.accepted);

    expect(text()).toContain(en.strings["outcome.acceptedHeadline"]);
    expect(card()?.className).toContain("is-accepted");
    // Nothing to fix, so nothing to record again for.
    expect(container.querySelector(".fix-record")).toBeNull();

    const cta = container.querySelector<HTMLButtonElement>(".fix-cta");
    expect(cta?.textContent).toContain(en.strings["now.goToAyah"].replace("{number}", "3"));
    await act(async () => {
      cta!.click();
    });
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it("clears the previous correction rather than leaving it on screen", async () => {
    await show(SCENARIOS.missingWord);
    expect(word()?.textContent).toBe(FOCUS_WORD);

    // The same learner, one good recording later.
    await show(SCENARIOS.accepted);
    expect(word()).toBeNull();
    expect(text()).not.toContain(FOCUS_WORD);
    expect(text()).not.toContain(en.strings["correction.eyebrow"]);
    expect(text()).toContain(en.strings["outcome.acceptedHeadline"]);
  });
});

describe("the Quran text itself", () => {
  it("renders the focus word unchanged, right-to-left, and never mirrored", async () => {
    await show(SCENARIOS.missingWord);

    const node = word()!;
    // Byte-for-byte the word the decision named — no normalisation, no
    // stripping of harakat, no reordering.
    expect(node.textContent).toBe(FOCUS_WORD);
    expect(Array.from(node.textContent!)).toEqual(Array.from(FOCUS_WORD));
    expect(node.getAttribute("dir")).toBe("rtl");
    expect(node.getAttribute("lang")).toBe("ar");
  });

  it("keeps the same glyphs in an interface language that is itself Arabic", async () => {
    await show(SCENARIOS.missingWord, "ar");
    expect(word()?.textContent).toBe(FOCUS_WORD);
    expect(word()?.getAttribute("dir")).toBe("rtl");
  });
});

describe("every language the app carries", () => {
  it.each(SUPPORTED_LANGUAGE_CODES.map((code) => [code]))("renders the correction card in %s", async (code) => {
    await show(SCENARIOS.missingWord, code);

    // The card is there, the word is untouched, and the wording is that pack's.
    expect(card(), code).toBeTruthy();
    expect(word()?.textContent, code).toBe(FOCUS_WORD);
    expect(container.querySelector(".fix-record"), code).toBeTruthy();
    expect(document.documentElement.dir, code).toBe(directionFor(code));
  });

  it("shows the correction in Pashto rather than falling back to English", async () => {
    await show(SCENARIOS.missingWord, "ps");

    expect(text()).toContain(ps.strings["correction.eyebrow"]);
    expect(text()).toContain(ps.strings["correction.notHeard"]);
    expect(text()).toContain(ps.strings["correction.recordAgain"]);
    expect(text()).not.toContain(en.strings["correction.notHeard"]);
  });

  it("shows the uncertain state in Arabic rather than falling back to English", async () => {
    await show(SCENARIOS.uncertain, "ar");

    expect(text()).toContain(ar.strings["outcome.unrelatedHeadline"]);
    expect(text()).not.toContain(en.strings["outcome.unrelatedHeadline"]);
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("lays the card out right-to-left in every RTL language", async () => {
    for (const code of ["ps", "fa-AF", "ur", "ar"] as const) {
      await show(SCENARIOS.missingWord, code);
      expect(document.documentElement.dir, code).toBe("rtl");
      expect(document.documentElement.lang, code).toBe(code);
      // The card follows the page; the Quranic word keeps its own direction
      // regardless, which is what stops it being mirrored by a layout flip.
      expect(word()?.getAttribute("dir"), code).toBe("rtl");
    }

    await show(SCENARIOS.missingWord, "en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(word()?.getAttribute("dir")).toBe("rtl");
  });
});

describe("nothing to say", () => {
  it("renders no card at all before the first attempt", async () => {
    await show(evidence());
    expect(card()).toBeNull();
  });
});
