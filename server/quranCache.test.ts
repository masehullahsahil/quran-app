import { afterEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "./quranCache";

afterEach(() => {
  vi.useRealTimers();
});

describe("TtlCache", () => {
  it("serves a cached value instead of running the loader again", async () => {
    const cache = new TtlCache();
    const loader = vi.fn(async () => "al-fatiha");

    expect(await cache.fetch("verses:1", 1000, loader)).toBe("al-fatiha");
    expect(await cache.fetch("verses:1", 1000, loader)).toBe("al-fatiha");

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("reloads once the entry has expired", async () => {
    vi.useFakeTimers();
    const cache = new TtlCache();
    const loader = vi.fn(async () => Date.now());

    await cache.fetch("verses:1", 1000, loader);
    vi.advanceTimersByTime(1001);
    await cache.fetch("verses:1", 1000, loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  // Al-Baqarah is six upstream requests; concurrent readers must share one chain.
  it("collapses concurrent misses into a single load", async () => {
    const cache = new TtlCache();
    let resolveLoad: (value: string) => void = () => {};
    const loader = vi.fn(() => new Promise<string>((resolve) => { resolveLoad = resolve; }));

    const all = Promise.all([
      cache.fetch("verses:2", 1000, loader),
      cache.fetch("verses:2", 1000, loader),
      cache.fetch("verses:2", 1000, loader),
    ]);
    resolveLoad("al-baqarah");

    expect(await all).toEqual(["al-baqarah", "al-baqarah", "al-baqarah"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed load", async () => {
    const cache = new TtlCache();
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("upstream down"))
      .mockResolvedValueOnce("recovered");

    await expect(cache.fetch("verses:3", 1000, loader)).rejects.toThrow("upstream down");
    await expect(cache.fetch("verses:3", 1000, loader)).resolves.toBe("recovered");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used entry past the size limit", async () => {
    const cache = new TtlCache(2);

    await cache.fetch("a", 1000, async () => 1);
    await cache.fetch("b", 1000, async () => 2);
    await cache.fetch("a", 1000, async () => 99); // refreshes "a", so "b" is oldest
    await cache.fetch("c", 1000, async () => 3);

    expect(cache.size).toBe(2);

    // "a" survived because it was read most recently...
    const reloadA = vi.fn(async () => 11);
    expect(await cache.fetch("a", 1000, reloadA)).toBe(1);
    expect(reloadA).not.toHaveBeenCalled();

    // ...and "b" was the one dropped.
    const reloadB = vi.fn(async () => 22);
    expect(await cache.fetch("b", 1000, reloadB)).toBe(22);
    expect(reloadB).toHaveBeenCalledTimes(1);
  });
});
