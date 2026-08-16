import { describe, expect, it, vi } from "vitest";
import en from "./en";
import ur from "./ur";
import { LOCALES, REFERENCE_LOCALE, availableLocales, isKnownLocale, loadLocale, resolvePack } from "./index";
import type { LocalePack } from "./types";
import type { TranslatableStrings } from "./index";

const asPack = (pack: unknown) => pack as LocalePack<TranslatableStrings>;

describe("the reference pack", () => {
  it("is English and defines every key", () => {
    expect(REFERENCE_LOCALE).toBe("en");
    expect(resolvePack(asPack(en)).missingKeys).toEqual([]);
  });

  it("has no empty strings", () => {
    const blank = Object.entries(en.strings).filter(([, value]) => !value.trim());
    expect(blank).toEqual([]);
  });

  it("covers all 28 letters with lesson text", () => {
    expect(Object.keys(en.lessons.letters)).toHaveLength(28);
    for (const [slug, lesson] of Object.entries(en.lessons.letters)) {
      expect(lesson.articulation.length, slug).toBeGreaterThan(10);
    }
  });

  // Instruction packs must not carry Quranic content — that is shared, and a
  // translated copy of it would be a second source of truth for scripture.
  it("holds no Arabic script", () => {
    const arabic = /[؀-ۿ]/;
    const offenders = Object.entries(en.strings).filter(([, value]) => arabic.test(value));
    expect(offenders).toEqual([]);
  });
});

describe("fallback", () => {
  it("uses English for a key the pack does not define", () => {
    const partial = asPack({
      manifest: ur.manifest,
      strings: { "mode.read": "پڑھیں" },
      lessons: { letters: {} },
    });
    const resolved = resolvePack(partial);

    expect(resolved.t("mode.read")).toBe("پڑھیں");
    expect(resolved.t("mode.learn")).toBe(en.strings["mode.learn"]);
  });

  it("treats an empty string as missing rather than rendering a blank label", () => {
    const resolved = resolvePack(asPack({
      manifest: ur.manifest,
      strings: { "mode.read": "" },
      lessons: { letters: {} },
    }));

    expect(resolved.t("mode.read")).toBe(en.strings["mode.read"]);
    expect(resolved.missingKeys).toContain("mode.read");
  });

  it("falls back per letter for lesson text", () => {
    const resolved = resolvePack(asPack({
      manifest: ur.manifest,
      strings: {},
      lessons: { letters: { ba: { articulation: "ہونٹ" } } },
    }));

    expect(resolved.letterLesson("ba")?.articulation).toBe("ہونٹ");
    expect(resolved.letterLesson("ta")?.articulation).toBe(en.lessons.letters.ta.articulation);
    expect(resolved.letterLesson("nope")).toBeNull();
  });

  it("reports an unknown key instead of rendering nothing", () => {
    const resolved = resolvePack(asPack(en));
    // @ts-expect-error deliberately outside the reference key set
    expect(resolved.t("not.a.real.key")).toBe("not.a.real.key");
  });

  it("returns the reference pack for an unknown locale code", async () => {
    const resolved = await loadLocale("zz");
    expect(resolved.manifest.code).toBe(REFERENCE_LOCALE);
  });

  it("returns the reference pack when a pack fails to load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = { ...LOCALES.ur, load: async () => { throw new Error("network"); } };
    const original = LOCALES.ur;
    LOCALES.ur = broken;

    const resolved = await loadLocale("ur");
    expect(resolved.manifest.code).toBe(REFERENCE_LOCALE);

    LOCALES.ur = original;
    warn.mockRestore();
  });
});

describe("placeholders", () => {
  it("substitutes named values", () => {
    const resolved = resolvePack(asPack(en));
    expect(resolved.t("playback.place", { number: 3, total: 7 })).toBe("Ayah 3 of 7");
  });

  it("leaves an unsupplied placeholder visible rather than printing undefined", () => {
    const resolved = resolvePack(asPack(en));
    expect(resolved.t("playback.place", { number: 3 })).toBe("Ayah 3 of {total}");
  });

  it("carries placeholders through the fallback", () => {
    const resolved = resolvePack(asPack({ manifest: ur.manifest, strings: {}, lessons: { letters: {} } }));
    expect(resolved.t("reader.juzNumbered", { number: 12 })).toBe("Juz’ 12");
  });
});

describe("the scaffolded pack", () => {
  it("is registered and loadable", async () => {
    expect(isKnownLocale("ur")).toBe(true);
    const resolved = await loadLocale("ur");
    expect(resolved.manifest.code).toBe("ur");
    expect(resolved.manifest.direction).toBe("rtl");
  });

  // It is a scaffold on purpose: no machine-translated placeholder text, so the
  // English fallback is what a learner sees until a translator fills it in.
  it("starts empty, so every string falls back to English", async () => {
    const resolved = await loadLocale("ur");
    expect(resolved.missingKeys).toHaveLength(Object.keys(en.strings).length);
    expect(resolved.t("mode.read")).toBe(en.strings["mode.read"]);
  });

  it("declares its own instruction audio directory, separate from English", () => {
    expect(ur.manifest.instructionAudioDir).not.toBe(en.manifest.instructionAudioDir);
    const resolved = resolvePack(asPack(ur));
    expect(resolved.instructionAudio("welcome.mp3")).toBe("/audio/instruction/ur/welcome.mp3");
  });
});

describe("the registry", () => {
  it("lists the reference language first", () => {
    expect(availableLocales()[0].code).toBe(REFERENCE_LOCALE);
  });

  it("gives every locale a distinct code and a name in its own language", () => {
    const manifests = availableLocales();
    expect(new Set(manifests.map((manifest) => manifest.code)).size).toBe(manifests.length);
    for (const manifest of manifests) {
      expect(manifest.name.trim().length, manifest.code).toBeGreaterThan(0);
      expect(manifest.instructionAudioDir).toMatch(/^\/audio\/instruction\//);
    }
  });

  it("keeps each manifest code in step with its registry key", () => {
    for (const [code, entry] of Object.entries(LOCALES)) {
      expect(entry.manifest.code).toBe(code);
    }
  });
});
