/**
 * The Quran.com recording of a Quranic word quoted in a Qaida lesson.
 *
 * A Qaida lesson quotes short Quranic words — قُلْ, رَبِّ, الٓمٓ — with a
 * `surah:ayah` reference. Nobody records those for this app (a teacher records
 * the teaching syllables; the Quran is heard from a reciter), so the word is
 * played from the same word-by-word recitation the Study view uses, found
 * through the same rules: the ayah must match, the position must exist, and the
 * recording's own text must be the word on the page (see wordAudio.ts).
 *
 * Only single words. A two-word phrase would need two files played back to
 * back, which is a different promise; it answers null and the lesson shows no
 * listen control rather than half a phrase.
 */
import type { QaidaArabicText } from "@shared/qaidaExercises";
import type { SurahContent } from "@shared/quran";
import { findWordAudio, type WordAudioReference } from "./wordAudio";
import { sameQuranWord } from "./quranWordMatch";

/** The surah and ayah a quoted Quran word names, or null if it names none. */
export function quranWordLocation(subject: QaidaArabicText | undefined): { surah: number; ayah: number } | null {
  if (!subject || subject.source !== "quran" || !subject.reference) return null;
  const match = /^(\d{1,3}):(\d{1,3})$/.exec(subject.reference);
  if (!match) return null;
  if (subject.arabic.trim().split(/\s+/).length !== 1) return null;
  return { surah: Number(match[1]), ayah: Number(match[2]) };
}

export function qaidaQuranWordAudio(
  subject: QaidaArabicText | undefined,
  content: SurahContent | null | undefined,
): WordAudioReference | null {
  const location = quranWordLocation(subject);
  if (!location || !content || !subject) return null;
  if (content.surah.number !== location.surah) return null;

  const ayah = content.ayahs.find((entry) => entry.number === location.ayah);
  if (!ayah) return null;

  const ayahWords = ayah.arabic.split(/\s+/).filter(Boolean);
  // The first word in the ayah that is this word. A word repeated within one
  // ayah sounds the same each time, so the first occurrence is the right file.
  const position = ayahWords.findIndex((word) => sameQuranWord(word, subject.arabic)) + 1;
  if (position < 1) return null;

  return findWordAudio(
    { surah: location.surah, ayah: location.ayah, wordIndex: position, arabic: subject.arabic },
    { surah: location.surah, ayah: location.ayah, ayahWords, wordAudio: ayah.wordAudio, source: content.wordAudioSource },
  );
}
