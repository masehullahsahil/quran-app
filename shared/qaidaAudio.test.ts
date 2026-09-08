/**
 * The Qaida's reference audio, as data.
 *
 * Two things these exist to hold. The inventory must stay tied to the
 * curriculum, so a lesson can never quietly need a recording nobody knows
 * about. And approval must stay a person's judgement: no file, no status
 * string, and no code path may put a voice in front of a learner as a model of
 * Quranic Arabic unless a named, qualified reviewer said it is one.
 */
import { describe, expect, it } from "vitest";
import { QAIDA_LESSONS, QAIDA_LEVELS } from "./qaidaCurriculum";
import { instructionalTargets, qaidaAudioTargets, quranTargets } from "./qaidaAudioTargets";
import {
  buildQaidaAudioManifest,
  approvedAudioPath,
  isPlayableReference,
  letterTargetId,
  PLACEHOLDER_LETTER_AUDIO,
  QAIDA_RECORDINGS,
  type QaidaRecordingEntry,
} from "./qaidaAudioManifest";
import { qaidaAudioCoverage, formatQaidaAudioCoverage } from "./qaidaAudioCoverage";
import { validateQaidaAudio } from "./qaidaAudioValidation";
import { ARABIC_LETTERS, HARAKAT } from "./arabicLetters";

const provenance = {
  speaker: "Qari A",
  qualification: "ijazah in the recitation of Hafs",
  source: "studio session, 2026",
  recordedOn: "2026-02-01",
};
const review = {
  reviewer: "Ustadha B",
  qualification: "licensed Qaida teacher",
  reviewedOn: "2026-02-03",
  verdict: "Correct, at a teaching pace.",
};

const approved = (targetId: string, audioPath = `/audio/qaida/${targetId.replace(/:/g, "-")}.mp3`): QaidaRecordingEntry => ({
  targetId,
  audioPath,
  status: "approved",
  provenance,
  review,
});

/* ------------------------------------------------- A and B: the inventory */

describe("every listenable target comes from the curriculum", () => {
  it("covers all twelve levels", () => {
    const coverage = qaidaAudioCoverage();
    expect(coverage.byLevel).toHaveLength(12);
    expect(coverage.byLevel.map((level) => level.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(new Set(coverage.byLevel.map((level) => level.levelId)).size).toBe(QAIDA_LEVELS.length);
  });

  it("includes every letter, alone and carrying each short vowel", () => {
    const ids = new Set(qaidaAudioTargets().map((target) => target.id));
    for (const letter of ARABIC_LETTERS) {
      expect(ids.has(letterTargetId(letter.slug)), letter.slug).toBe(true);
      for (const harakat of HARAKAT) {
        expect(ids.has(letterTargetId(letter.slug, harakat.id)), `${letter.slug}-${harakat.id}`).toBe(true);
      }
    }
  });

  it("includes every piece of Arabic the lessons put on screen", () => {
    const byArabic = new Set(qaidaAudioTargets().map((target) => target.arabic));
    for (const lesson of QAIDA_LESSONS) {
      for (const example of lesson.examples) expect(byArabic.has(example.arabic), `${lesson.id}: ${example.arabic}`).toBe(true);
      for (const item of lesson.practice) {
        if (item.subject) expect(byArabic.has(item.subject.arabic), `${item.id}: ${item.subject.arabic}`).toBe(true);
      }
    }
  });

  it("maps every target back to real curriculum content", () => {
    const lessonIds = new Set(QAIDA_LESSONS.map((lesson) => lesson.id));
    const levelIds = new Set(QAIDA_LEVELS.map((level) => level.id));
    for (const target of qaidaAudioTargets()) {
      expect(levelIds.has(target.level), target.id).toBe(true);
      for (const lessonId of target.lessonIds) expect(lessonIds.has(lessonId), `${target.id} → ${lessonId}`).toBe(true);
      expect(target.arabic.trim().length, target.id).toBeGreaterThan(0);
    }
  });

  it("gives every target a unique id and every id a unique piece of Arabic", () => {
    const targets = qaidaAudioTargets();
    expect(new Set(targets.map((target) => target.id)).size).toBe(targets.length);
    expect(new Set(targets.map((target) => target.arabic)).size).toBe(targets.length);
  });

  it("is deterministic", () => {
    expect(qaidaAudioTargets()).toEqual(qaidaAudioTargets());
  });
});

/* ------------------------------------------------------ F: deduplication */

describe("one recording serves every lesson that shows the same target", () => {
  it("does not ask for a second recording of a glyph a letter lesson already covers", () => {
    const alif = qaidaAudioTargets().filter((target) => target.arabic === "ا");
    expect(alif).toHaveLength(1);
    expect(alif[0].id).toBe(letterTargetId("alif"));
  });

  it("lists every lesson that uses a shared target", () => {
    const shared = qaidaAudioTargets().filter((target) => target.lessonIds.length > 1);
    expect(shared.length).toBeGreaterThan(0);
    for (const target of shared) {
      expect(new Set(target.lessonIds).size, target.id).toBe(target.lessonIds.length);
    }
  });

  it("counts a shared target once in the coverage report", () => {
    const coverage = qaidaAudioCoverage();
    expect(coverage.total.targets).toBe(qaidaAudioTargets().length);
    const levelled = coverage.byLevel.reduce((sum, level) => sum + level.targets, 0);
    expect(levelled).toBe(coverage.total.targets);
  });
});

/* --------------------------------------------- J: Quran stays separate */

describe("Quran recitation is never recorded as Qaida instruction", () => {
  it("marks Quranic words as their own kind", () => {
    const quran = quranTargets();
    expect(quran.length).toBeGreaterThan(0);
    for (const target of quran) {
      expect(target.kind, target.arabic).toBe("quran");
      expect(target.category, target.arabic).toBe("quran-word");
    }
    expect(instructionalTargets().every((target) => target.kind === "instructional")).toBe(true);
  });

  it("never plays a Quranic target from the Qaida ledger, even if one is approved", () => {
    const quranTarget = quranTargets()[0];
    const manifest = buildQaidaAudioManifest([approved(quranTarget.id)]);
    const entry = manifest.find((item) => item.target.id === quranTarget.id)!;
    // The paperwork is complete and it still does not play here: Quran audio
    // comes from the Quran source, not from recordings made for this course.
    expect(entry.playable).toBe(false);
    expect(entry.audioPath).toBeNull();
  });

  it("reports such an entry as a validation issue", () => {
    const result = validateQaidaAudio({ recordings: [approved(quranTargets()[0].id)] });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("quran-target-recorded-here");
  });

  it("counts Quranic targets apart from the ones a teacher records", () => {
    const coverage = qaidaAudioCoverage();
    expect(coverage.quran.targets).toBe(quranTargets().length);
    expect(coverage.instructional.targets).toBe(instructionalTargets().length);
    expect(coverage.instructional.targets + coverage.quran.targets).toBe(coverage.total.targets);
  });
});

/* ------------------------------------- C, D, E: approval means a person */

describe("approval is a person's judgement, not a file's existence", () => {
  it("plays nothing today, because nothing has been approved", () => {
    expect(QAIDA_RECORDINGS).toEqual([]);
    const coverage = qaidaAudioCoverage();
    expect(coverage.total.approved).toBe(0);
    expect(coverage.total.missing).toBe(coverage.total.targets);
    for (const entry of buildQaidaAudioManifest()) {
      expect(entry.playable, entry.target.id).toBe(false);
      expect(entry.audioPath, entry.target.id).toBeNull();
    }
  });

  it("refuses an approved entry with no named, qualified speaker", () => {
    const missingProvenance = { ...approved(letterTargetId("ba")), provenance: undefined };
    expect(isPlayableReference(missingProvenance)).toBe(false);
    expect(validateQaidaAudio({ recordings: [missingProvenance] }).issues.map((issue) => issue.code))
      .toContain("approved-without-provenance");
  });

  it("refuses an approved entry with no named, qualified reviewer", () => {
    const missingReview = { ...approved(letterTargetId("ba")), review: undefined };
    expect(isPlayableReference(missingReview)).toBe(false);
    expect(validateQaidaAudio({ recordings: [missingReview] }).issues.map((issue) => issue.code))
      .toContain("approved-without-review");
  });

  it("does not count recorded or reviewed as approved", () => {
    for (const status of ["recorded", "reviewed"] as const) {
      const entry = { ...approved(letterTargetId("ba")), status };
      expect(isPlayableReference(entry), status).toBe(false);
      const coverage = qaidaAudioCoverage([entry]);
      expect(coverage.total.approved, status).toBe(0);
      expect(coverage.total.recorded, status).toBe(1);
      expect(coverage.total.reviewed, status).toBe(status === "reviewed" ? 1 : 0);
    }
  });

  it("plays an approved recording, and only that one", () => {
    const entry = approved(letterTargetId("ba"), "/audio/qaida/letters/ba.mp3");
    expect(approvedAudioPath(letterTargetId("ba"), [entry])).toBe("/audio/qaida/letters/ba.mp3");
    expect(approvedAudioPath(letterTargetId("ta"), [entry])).toBeNull();
    expect(qaidaAudioCoverage([entry]).total.approved).toBe(1);
  });
});

/* ------------------------------- C: nothing synthesised reaches a learner */

describe("nothing synthesised is served as reference audio", () => {
  it("records that the generated clips exist and may not be used", () => {
    expect(PLACEHOLDER_LETTER_AUDIO.kind).toBe("synthesised");
    expect(PLACEHOLDER_LETTER_AUDIO.usableAsReference).toBe(false);
    expect(PLACEHOLDER_LETTER_AUDIO.directory).toBe("/audio/letters");
  });

  it("keeps the ledger clear of them", () => {
    for (const entry of QAIDA_RECORDINGS) {
      expect(entry.audioPath.startsWith(PLACEHOLDER_LETTER_AUDIO.directory), entry.targetId).toBe(false);
    }
  });

  it("reports an entry that points at them", () => {
    const entry = approved(letterTargetId("ba"), "/audio/letters/ba.mp3");
    const result = validateQaidaAudio({ recordings: [entry] });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("synthesised-path");
  });
});

/* ------------------------------------------- G: files that fail safely */

describe("a delivered file is checked for what software can check", () => {
  const entry = approved(letterTargetId("ba"), "/audio/qaida/letters/ba.mp3");

  it("passes a real file", () => {
    const result = validateQaidaAudio({ recordings: [entry], files: [{ path: entry.audioPath, bytes: 20_000 }] });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("catches a missing file", () => {
    const result = validateQaidaAudio({ recordings: [entry], files: [{ path: "/audio/qaida/letters/ta.mp3", bytes: 20_000 }] });
    expect(result.issues.map((issue) => issue.code)).toContain("file-missing");
  });

  it("catches an empty one", () => {
    const result = validateQaidaAudio({ recordings: [entry], files: [{ path: entry.audioPath, bytes: 12 }] });
    expect(result.issues.map((issue) => issue.code)).toContain("file-empty");
  });

  it("catches a format a browser will not play", () => {
    const wrong = { ...entry, audioPath: "/audio/qaida/letters/ba.aiff" };
    expect(validateQaidaAudio({ recordings: [wrong] }).issues.map((issue) => issue.code)).toContain("unsupported-format");
  });

  it("catches two entries claiming one file", () => {
    const other = { ...approved(letterTargetId("ta")), audioPath: entry.audioPath };
    expect(validateQaidaAudio({ recordings: [entry, other] }).issues.map((issue) => issue.code)).toContain("duplicate-path");
  });

  it("catches two entries for one target", () => {
    expect(validateQaidaAudio({ recordings: [entry, { ...entry, audioPath: "/audio/qaida/letters/ba-2.mp3" }] })
      .issues.map((issue) => issue.code)).toContain("duplicate-target");
  });

  it("catches an entry for a target the curriculum does not have", () => {
    expect(validateQaidaAudio({ recordings: [approved("letter:not-a-letter")] })
      .issues.map((issue) => issue.code)).toContain("unknown-target");
  });

  it("catches a file nobody claims", () => {
    const result = validateQaidaAudio({
      recordings: [entry],
      files: [{ path: entry.audioPath, bytes: 20_000 }, { path: "/audio/qaida/letters/stray.mp3", bytes: 20_000 }],
    });
    expect(result.issues.map((issue) => issue.code)).toContain("orphan-file");
  });

  it("catches a status that claims a recording with no path", () => {
    const pathless = { ...entry, audioPath: "" };
    expect(validateQaidaAudio({ recordings: [pathless] }).issues.map((issue) => issue.code)).toContain("recorded-without-path");
  });

  it("lists every target still without an approved recording, explicitly", () => {
    const result = validateQaidaAudio({ recordings: [] });
    expect(result.missingTargetIds).toHaveLength(instructionalTargets().length);
    // Quranic targets are not on the list: nobody is being asked to record them.
    for (const target of quranTargets()) expect(result.missingTargetIds).not.toContain(target.id);
  });

  it("never claims to have judged the recitation itself", () => {
    // Every issue code is about a file or a field. If one ever describes the
    // sound, this app has started making a judgement it is not qualified to make.
    const codes = validateQaidaAudio({ recordings: [approved("letter:nope")] }).issues.map((issue) => issue.code);
    for (const code of codes) {
      for (const forbidden of ["pronunciation", "makhraj", "tajwid", "tajweed", "correct-sound"]) {
        expect(code, forbidden).not.toContain(forbidden);
      }
    }
  });
});

/* ------------------------------------------------ H: the coverage report */

describe("the coverage report", () => {
  it("adds up", () => {
    const coverage = qaidaAudioCoverage();
    expect(coverage.total.recorded + coverage.total.missing).toBe(coverage.total.targets);
    const categorised = coverage.byCategory.reduce((sum, category) => sum + category.targets, 0);
    expect(categorised).toBe(coverage.total.targets);
  });

  it("names every level, including one with nothing recorded", () => {
    const text = formatQaidaAudioCoverage(qaidaAudioCoverage());
    for (const level of QAIDA_LEVELS) expect(text, level.title).toContain(level.title);
  });

  it("is deterministic", () => {
    expect(formatQaidaAudioCoverage(qaidaAudioCoverage())).toBe(formatQaidaAudioCoverage(qaidaAudioCoverage()));
  });

  it("moves a target out of missing when its recording is approved", () => {
    const before = qaidaAudioCoverage();
    const after = qaidaAudioCoverage([approved(letterTargetId("ba"), "/audio/qaida/letters/ba.mp3")]);
    expect(after.total.approved).toBe(before.total.approved + 1);
    expect(after.total.missing).toBe(before.total.missing - 1);
  });
});
