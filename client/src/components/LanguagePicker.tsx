/**
 * The learner's language control.
 *
 * The app has carried five instruction languages for a while, but a learner
 * could not find them: the choice was a bare `<select>` behind a globe icon,
 * sitting in a row of four other pickers. Someone opening the app on a phone
 * had no reason to think the app spoke Pashto at all.
 *
 * So this is a *labelled* control. It always shows the word "Language" in the
 * language currently selected, and beside it the current language's own name in
 * its own script — پښتو, دری, اردو, العربية — which is what a speaker of that
 * language actually recognises. Opening it lists all five with both their own
 * name and their English name, so a learner can find their language whether or
 * not they read the script the interface is currently in.
 *
 * It reads and writes `useLocale()` — the app's one language state, which
 * already persists to localStorage and sets `<html lang>` and `<html dir>`.
 * Nothing here keeps a second copy of that choice.
 */
// See CurriculumAudit.tsx: the default React import is what lets this render in
// a test under the classic JSX transform.
import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { SUPPORTED_LANGUAGES, languageNoteKey, type SupportedLanguageCode } from "@shared/languages";
import type { StringKey } from "@locales/index";

export type LanguagePickerVariant = "header" | "dock";

/**
 * @param variant `header` sits in the reading desk's toolbar; `dock` is the
 * bottom-bar button on a phone, where the same menu opens upwards.
 */
export function LanguagePicker({ variant = "header" }: { variant?: LanguagePickerVariant }) {
  const { locale, setLocale, locales, t, direction } = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const current = locales.find((option) => option.code === locale) ?? locales[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (code: string) => {
    setLocale(code);
    setOpen(false);
  };

  return (
    <div className={`language-menu is-${variant}`} ref={containerRef} data-direction={direction}>
      <button
        type="button"
        className="language-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language.label")}
        onClick={() => setOpen((value) => !value)}
      >
        <Globe size={variant === "dock" ? 19 : 16} aria-hidden="true" />
        {/* The word "Language", in the language currently selected. An icon on
            its own is not a label — a learner has to be able to read what the
            control is for. */}
        <span className="language-trigger-text">
          <small>{t("language.short")}</small>
          <strong lang={current?.code} dir={current?.direction}>
            {current?.name}
          </strong>
        </span>
        <ChevronDown size={14} aria-hidden="true" className="language-caret" />
      </button>

      {open && (
        <div className="language-sheet" role="listbox" aria-label={t("language.label")}>
          <p className="language-sheet-title">{t("language.label")}</p>
          <ul>
            {locales.map((option) => {
              const selected = option.code === locale;
              const noteKey = languageNoteKey(option.code as SupportedLanguageCode);
              return (
                <li key={option.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={selected ? "is-selected" : ""}
                    lang={option.code}
                    onClick={() => choose(option.code)}
                  >
                    {/* Both names: a learner who cannot yet read the interface
                        finds their language by its own name, and a reviewer
                        finds it by the English one. */}
                    <span className="language-native" dir={option.direction}>
                      {option.name}
                    </span>
                    <span className="language-english">{option.englishName}</span>
                    {noteKey && <span className="language-note">{t(noteKey as StringKey)}</span>}
                    {selected && <Check size={16} aria-hidden="true" className="language-tick" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {/* The one thing a learner should know before switching: the Quran
              itself does not change. */}
          <p className="language-sheet-foot">{t("language.hint")}</p>
        </div>
      )}
    </div>
  );
}

/** Every language the picker offers, for tests and for documentation. */
export const OFFERED_LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES);

export default LanguagePicker;
