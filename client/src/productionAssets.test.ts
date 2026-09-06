import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const clientRoot = path.resolve(import.meta.dirname, "..");

describe("production asset references", () => {
  it("does not ship volatile Manus storage URLs from the client shell", () => {
    const checkedFiles = [
      path.join(clientRoot, "index.html"),
      path.join(clientRoot, "src", "index.css"),
      path.join(clientRoot, "src", "pages", "Home.tsx"),
    ];

    for (const file of checkedFiles) {
      expect(fs.readFileSync(file, "utf-8")).not.toContain("/manus-storage/");
    }
  });

  it("keeps restored public visual assets checked in", () => {
    const assets = [
      "quran-reading-arch-texture.svg",
      "quran-audio-study-abstract.svg",
      "quran-study-lantern-illustration.svg",
    ];

    for (const asset of assets) {
      expect(fs.existsSync(path.join(clientRoot, "public", "assets", asset))).toBe(true);
    }
  });
});

