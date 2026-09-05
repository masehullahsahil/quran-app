import { describe, expect, it } from "vitest";
import {
  FIRST_LESSON_ID,
  QAIDA_LESSONS,
  getQaidaLesson,
} from "@shared/qaidaCurriculum";
import { ARABIC_LETTERS, letterAudioPath } from "./arabicLetters";
import {
  QAIDA_PROGRESS_KEY,
  completeLesson,
  emptyQaidaProgress,
  openLesson,
  parseQaidaProgress,
  readQaidaProgress,
  serializeQaidaProgress,
  writeQaidaProgress,
  type QaidaProgress,
  type StorageLike,
} from "./qaidaProgress";

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
  return { storage, store };
}

describe("parseQaidaProgress", () => {
  it("starts a new learner at the first lesson", () => {
    expect(parseQaidaProgress(null)).toEqual({ completedLessons: [], currentLessonId: FIRST_LESSON_ID });
  });

  it("reads back what was written", () => {
    const progress: QaidaProgress = { completedLessons: [FIRST_LESSON_ID], currentLessonId: QAIDA_LESSONS[1].id };
    expect(parseQaidaProgress(serializeQaidaProgress(progress))).toEqual(progress);
  });

  it.each([["not json"], ["null"], ["[1,2,3]"], ['{"completedLessons":"nope"}']])(
    "falls back to a fresh start for unusable stored value %s",
    (raw) => {
      expect(parseQaidaProgress(raw).currentLessonId).toBe(FIRST_LESSON_ID);
      expect(parseQaidaProgress(raw).completedLessons).toEqual([]);
    },
  );

  it("drops lesson ids the curriculum no longer defines, and de-duplicates", () => {
    const raw = JSON.stringify({
      completedLessons: [FIRST_LESSON_ID, FIRST_LESSON_ID, "retired-lesson", 7],
      currentLessonId: "retired-lesson",
    });
    const progress = parseQaidaProgress(raw);

    expect(progress.completedLessons).toEqual([FIRST_LESSON_ID]);
    // The stored current lesson is gone, so the next incomplete one takes over.
    expect(progress.currentLessonId).toBe(QAIDA_LESSONS[1].id);
  });
});

describe("storage round trip", () => {
  it("survives a reload", () => {
    const { storage } = fakeStorage();
    const progress = completeLesson(emptyQaidaProgress(), FIRST_LESSON_ID);

    writeQaidaProgress(progress, storage);
    expect(readQaidaProgress(storage)).toEqual(progress);
    expect(storage.getItem(QAIDA_PROGRESS_KEY)).toContain(FIRST_LESSON_ID);
  });

  it("keeps working when storage is unavailable or throws", () => {
    const throwing: StorageLike = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("full"); },
    };

    expect(readQaidaProgress(throwing)).toEqual(emptyQaidaProgress());
    expect(() => writeQaidaProgress(emptyQaidaProgress(), throwing)).not.toThrow();
    expect(readQaidaProgress(undefined)).toEqual(emptyQaidaProgress());
  });
});

describe("completeLesson", () => {
  it("records the lesson and moves to the next one", () => {
    const progress = completeLesson(emptyQaidaProgress(), FIRST_LESSON_ID);

    expect(progress.completedLessons).toEqual([FIRST_LESSON_ID]);
    expect(progress.currentLessonId).toBe(QAIDA_LESSONS[1].id);
  });

  it("does not record the same lesson twice when it is reviewed", () => {
    const once = completeLesson(emptyQaidaProgress(), FIRST_LESSON_ID);
    const twice = completeLesson(once, FIRST_LESSON_ID);

    expect(twice.completedLessons).toEqual([FIRST_LESSON_ID]);
  });

  it("ignores an unknown lesson id", () => {
    const progress = emptyQaidaProgress();
    expect(completeLesson(progress, "no-such-lesson")).toBe(progress);
  });

  it("stays on the last lesson once the course is finished", () => {
    const last = QAIDA_LESSONS[QAIDA_LESSONS.length - 1];
    const everythingElse = QAIDA_LESSONS.slice(0, -1).map((lesson) => lesson.id);
    const progress = completeLesson({ completedLessons: everythingElse, currentLessonId: last.id }, last.id);

    expect(progress.currentLessonId).toBe(last.id);
    expect(progress.completedLessons).toHaveLength(QAIDA_LESSONS.length);
  });
});

describe("openLesson", () => {
  it("reopens a completed lesson for review without losing progress", () => {
    const progress = completeLesson(completeLesson(emptyQaidaProgress(), FIRST_LESSON_ID), QAIDA_LESSONS[1].id);
    const reviewing = openLesson(progress, FIRST_LESSON_ID);

    expect(reviewing.currentLessonId).toBe(FIRST_LESSON_ID);
    expect(reviewing.completedLessons).toEqual(progress.completedLessons);
  });

  it("ignores an unknown lesson id", () => {
    const progress = emptyQaidaProgress();
    expect(openLesson(progress, "no-such-lesson")).toBe(progress);
  });
});

// The curriculum names letters by the slug the recordings are filed under, so a
// rename on either side would silently leave a lesson with no audio.
describe("curriculum audio references", () => {
  it("references only letters the app actually has", () => {
    const slugs = new Set(ARABIC_LETTERS.map((letter) => letter.slug));
    const referenced = QAIDA_LESSONS.flatMap((lesson) => lesson.practice)
      .map((item) => item.audio)
      .filter((audio): audio is NonNullable<typeof audio> => Boolean(audio));

    expect(referenced.length).toBeGreaterThan(0);
    for (const audio of referenced) {
      expect(slugs, audio.letterSlug).toContain(audio.letterSlug);
      // The active source may have no file for a vowelled form; the path helper
      // is what the Learn view asks, and it must not throw for these.
      expect(() => letterAudioPath(audio.letterSlug, audio.harakat)).not.toThrow();
    }
  });

  it("shows the same glyph for a letter as the app's letter table", () => {
    const byGlyph = new Map(ARABIC_LETTERS.map((letter) => [letter.letter, letter.slug]));
    const lettersLesson = getQaidaLesson(FIRST_LESSON_ID);

    expect(lettersLesson).not.toBeNull();
    for (const example of lettersLesson!.examples) {
      expect(byGlyph.has(example.arabic), example.arabic).toBe(true);
    }
  });
});
