/**
 * Holds the learner's instruction language.
 *
 * The reference pack (English) is bundled and resolved synchronously, so the
 * first render always has strings — there is no flash of untranslated UI and no
 * loading state to thread through the tree. Selecting another language swaps the
 * pack in once its dynamic import resolves.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  availableLocales,
  isKnownLocale,
  loadLocale,
  REFERENCE_LOCALE,
  referencePack,
  resolvePack,
  type LocaleCode,
  type LocaleManifest,
  type ResolvedLocale,
} from "@locales/index";

const STORAGE_KEY = "miqra-locale";

type LocaleContextValue = ResolvedLocale & {
  locale: LocaleCode;
  setLocale: (code: LocaleCode) => void;
  locales: LocaleManifest[];
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

function storedLocale(): LocaleCode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && isKnownLocale(stored) ? stored : REFERENCE_LOCALE;
  } catch {
    return REFERENCE_LOCALE;
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(storedLocale);
  const [resolved, setResolved] = useState<ResolvedLocale>(() => resolvePack(referencePack));

  useEffect(() => {
    let cancelled = false;
    void loadLocale(locale).then((pack) => {
      if (!cancelled) setResolved(pack);
    });
    return () => { cancelled = true; };
  }, [locale]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Private browsing: the choice simply does not persist.
    }
  }, [locale]);

  // Instruction text direction. Quranic Arabic sets `dir="rtl"` on its own
  // elements regardless, so those are unaffected by this.
  useEffect(() => {
    document.documentElement.lang = resolved.manifest.code;
    document.documentElement.dir = resolved.manifest.direction;
  }, [resolved]);

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(isKnownLocale(code) ? code : REFERENCE_LOCALE);
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({
    ...resolved,
    locale,
    setLocale,
    locales: availableLocales(),
  }), [resolved, locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}
