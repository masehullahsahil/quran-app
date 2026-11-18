import { describe, expect, it } from "vitest";
import {
  SAVED_PLACE_KEY,
  clearSavedPlace,
  loadSavedPlace,
  parseSavedPlace,
  saveSavedPlace,
  serializeSavedPlace,
  type SavedPlace,
  type StorageLike,
} from "./savedPlace";

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  return { storage, store };
}

const PLACE: SavedPlace = { surah: 1, ayah: 3, savedAt: "2026-11-18T22:00:00.000Z" };

describe("parseSavedPlace", () => {
  it("returns null when nothing is stored", () => {
    expect(parseSavedPlace(null)).toBeNull();
  });

  it("reads back what was written", () => {
    expect(parseSavedPlace(serializeSavedPlace(PLACE))).toEqual(PLACE);
  });

  it.each([["not json"], ["null"], ["[1,2,3]"], ['{"surah":"1","ayah":3,"savedAt":"x"}']])(
    "returns null for unusable stored value %s",
    (raw) => {
      expect(parseSavedPlace(raw)).toBeNull();
    },
  );

  it("returns null when the surah or ayah is not a positive integer", () => {
    expect(parseSavedPlace(JSON.stringify({ ...PLACE, surah: 0 }))).toBeNull();
    expect(parseSavedPlace(JSON.stringify({ ...PLACE, ayah: 1.5 }))).toBeNull();
    expect(parseSavedPlace(JSON.stringify({ ...PLACE, ayah: -2 }))).toBeNull();
  });

  it("returns null when the saved time is missing", () => {
    const { savedAt: _savedAt, ...withoutTime } = PLACE;
    expect(parseSavedPlace(JSON.stringify(withoutTime))).toBeNull();
  });
});

describe("load/save/clear round trip", () => {
  it("saves under the saved-place key and loads it back", () => {
    const { storage, store } = fakeStorage();

    saveSavedPlace(PLACE, storage);

    expect(store.get(SAVED_PLACE_KEY)).toBe(serializeSavedPlace(PLACE));
    expect(loadSavedPlace(storage)).toEqual(PLACE);
  });

  it("replaces the stored place when a different ayah is saved", () => {
    const { storage } = fakeStorage();

    saveSavedPlace(PLACE, storage);
    saveSavedPlace({ surah: 112, ayah: 2, savedAt: "2026-11-18T22:05:00.000Z" }, storage);

    expect(loadSavedPlace(storage)).toEqual({ surah: 112, ayah: 2, savedAt: "2026-11-18T22:05:00.000Z" });
  });

  it("clearing removes the stored place", () => {
    const { storage } = fakeStorage();

    saveSavedPlace(PLACE, storage);
    clearSavedPlace(storage);

    expect(loadSavedPlace(storage)).toBeNull();
  });

  it("returns null when there is no store at all", () => {
    expect(loadSavedPlace(undefined)).toBeNull();
  });

  it("does not throw when the store refuses a write", () => {
    const throwing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };

    expect(() => saveSavedPlace(PLACE, throwing)).not.toThrow();
    expect(() => clearSavedPlace(throwing)).not.toThrow();
  });
});
