/**
 * Persistence for the learner's saved place.
 *
 * One saved place only: the surah and ayah the learner asked to return to.
 * Same approach as the rest of the learner's local state: a JSON value in
 * localStorage, read defensively, written on change. A value written by an
 * older build, or a surah/ayah that is no longer a positive number, degrades
 * to "no saved place" rather than throwing on load.
 */
export const SAVED_PLACE_KEY = "miqra-saved-place";

export type SavedPlace = {
  /** Surah number (1–114). */
  surah: number;
  /** Ayah number within the surah. */
  ayah: number;
  /** When the place was saved, as an ISO string. */
  savedAt: string;
};

/** Just enough of the Storage interface to be faked in a test. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Parses a stored place, returning null for anything that is not one:
 * missing, malformed JSON, the wrong shape, or a surah/ayah that is not a
 * positive integer.
 */
export function parseSavedPlace(raw: string | null): SavedPlace | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as { surah?: unknown; ayah?: unknown; savedAt?: unknown };
    const surah = record.surah;
    const ayah = record.ayah;
    const savedAt = record.savedAt;
    if (typeof surah !== "number" || !Number.isInteger(surah) || surah <= 0) return null;
    if (typeof ayah !== "number" || !Number.isInteger(ayah) || ayah <= 0) return null;
    if (typeof savedAt !== "string" || savedAt.length === 0) return null;
    return { surah, ayah, savedAt };
  } catch {
    return null;
  }
}

export function serializeSavedPlace(place: SavedPlace): string {
  return JSON.stringify(place);
}

export function loadSavedPlace(storage: StorageLike | undefined = safeStorage()): SavedPlace | null {
  if (!storage) return null;
  try {
    return parseSavedPlace(storage.getItem(SAVED_PLACE_KEY));
  } catch {
    return null;
  }
}

export function saveSavedPlace(place: SavedPlace, storage: StorageLike | undefined = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SAVED_PLACE_KEY, serializeSavedPlace(place));
  } catch {
    // A full or blocked store must not break the lesson the learner is in.
  }
}

export function clearSavedPlace(storage: StorageLike | undefined = safeStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(SAVED_PLACE_KEY);
  } catch {
    // A blocked store must not break the lesson the learner is in.
  }
}

function safeStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
