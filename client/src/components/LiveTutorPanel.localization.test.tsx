/**
 * @vitest-environment happy-dom
 *
 * The same Tutor outcome in five languages.
 *
 * Every sentence the teacher shows comes from a locale key, so switching the
 * learner's language must switch the sentence — never leave English behind,
 * never leak a key name, and never touch the Quran on screen. These render
 * the panel once per state per language and compare against each pack's own
 * resolved strings.
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
import { describeTutorView, type TutorSessionView, type TutorState } from "@shared/tutorConversation";
import { SUPPORTED_LANGUAGE_CODES } from "@shared/languages";
import { loadLocale, resolvePack, type LocaleCode } from "@locales/index";
import en from "@locales/en";
import ps from "@locales/ps";
import faAF from "@locales/fa-AF";
import ur from "@locales/ur";
import ar from "@locales/ar";

/** Al-Fatiha 1:2, and the word a learner left out of it. */
const AYAH = { arabic: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ", label: "Al-Fatiha 1:2" };
const TARGET = { arabic: "رَبِّ", wordIndex: 3, totalWords: 4 };

const PACKS: Record<LocaleCode, { strings: Record<string, string> }> = {
  en: en as never,
  ps: ps as never,
  "fa-AF": faAF as never,
  ur: ur as never,
  ar: ar as never,
};

/** Every teacher sentence the panel can show, via the states that produce them. */
const STATES: TutorState[] = [
  "ready",
  "listening",
  "checking",
  "correction",
  "word-recognised",
  "recite-ayah",
  "uncertain",
  "paused",
  "complete",
  "stopped",
];

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

async function show(session: TutorSessionView, locale: LocaleCode) {
  await act(async () => {
    root.render(
      <LocaleProvider>
        <Harness session={session} locale={locale} />
      </LocaleProvider>,
    );
  });
  await settle();
}

const session = (state: TutorState): TutorSessionView => ({
  state,
  canHearWord: true,
  canHearAyah: true,
  target: state === "correction" ? TARGET : undefined,
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

const messageText = () => container.querySelector(".tutor-message")?.textContent ?? "";
const expectedMessage = (locale: LocaleCode, state: TutorState): string => {
  const view = session(state);
  const described = describeTutorView(view);
  return resolvePack(PACKS[locale] as never).t(described.messageKey, described.messageParams);
};

describe("the same Tutor outcome in every language", () => {
  for (const state of STATES) {
    it(`"${state}" renders the learner's language, not English and not a key`, async () => {
      for (const locale of SUPPORTED_LANGUAGE_CODES) {
        await show(session(state), locale);
        const rendered = messageText();
        const expected = expectedMessage(locale, state);
        const { messageKey } = describeTutorView(session(state));

        expect(rendered, `${state} in ${locale}`).toBe(expected);
        // A key name on screen means the lookup failed — never acceptable.
        expect(rendered, `${state} in ${locale}`).not.toBe(messageKey);
        expect(rendered.trim(), `${state} in ${locale}`).not.toBe("");
      }
    });
  }

  it("a translated pack never shows the English sentence", async () => {
    // Where a pack defines the key in its own words, the panel must show
    // those words — the English fallback is only for keys the pack lacks.
    for (const state of STATES) {
      const { messageKey } = describeTutorView(session(state));
      const english = resolvePack(PACKS.en as never).t(messageKey);
      for (const locale of SUPPORTED_LANGUAGE_CODES) {
        if (locale === "en") continue;
        const packString = (PACKS[locale].strings as Record<string, string>)[messageKey];
        if (packString === undefined) continue; // honest fallback, covered elsewhere
        await show(session(state), locale);
        expect(messageText(), `${state} in ${locale}`).not.toBe(english);
      }
    }
  });

  it("switching language re-renders the teacher's sentence", async () => {
    await show(session("correction"), "en");
    const english = messageText();
    expect(english).toContain("missed");

    await show(session("correction"), "ur");
    const urdu = messageText();
    expect(urdu).not.toBe(english);
    expect(urdu).toBe(expectedMessage("ur", "correction"));
  });

  it("the Quran on screen is identical in every interface language", async () => {
    // The target line also carries a localized "word 3 of 4" caption, so the
    // assertion is the load-bearing one: the Arabic word itself is byte-for-
    // byte the same in every interface language.
    for (const locale of SUPPORTED_LANGUAGE_CODES) {
      await show(session("correction"), locale);
      const targetText = container.querySelector(".tutor-target")?.textContent ?? "";
      expect(targetText, `Quran word in ${locale}`).toContain("رَبِّ");
    }
  });

  it("controls speak the learner's language too", async () => {
    for (const locale of SUPPORTED_LANGUAGE_CODES) {
      await show(session("correction"), locale);
      const described = describeTutorView(session("correction"));
      const t = resolvePack(PACKS[locale] as never).t;
      const labels = Array.from(container.querySelectorAll(".tutor-control")).map(
        (button) => button.textContent?.trim() ?? "",
      );
      for (let index = 0; index < described.controls.length; index += 1) {
        const control = described.controls[index];
        expect(labels[index], `control ${control.intent} in ${locale}`).toBe(t(control.labelKey).trim());
      }
    }
  });
});
