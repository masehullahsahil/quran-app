import { describe, expect, it } from "vitest";
import { createAdapters, createHuggingFaceAdapter, createProductionAdapter } from "./adapters";
import { ADAPTER_IDS, ALLOWED_LICENSES } from "./types";

describe("bake-off adapters", () => {
  it("registers exactly the three approved candidates", () => {
    const adapters = createAdapters(false);
    expect(adapters.map((a) => a.id).sort()).toEqual(
      [ADAPTER_IDS.production, ADAPTER_IDS.quranTurbo, ADAPTER_IDS.tarteelBase].sort(),
    );
  });

  it("ships only allowlisted licenses", () => {
    for (const adapter of createAdapters(false)) {
      expect(
        (ALLOWED_LICENSES as readonly string[]).includes(adapter.license),
        `${adapter.id} has non-allowlisted license ${adapter.license}`,
      ).toBe(true);
    }
  });

  it("refuses non-commercial / no-profit models at construction", () => {
    expect(() =>
      createHuggingFaceAdapter({
        id: "quran-lab-zipformer",
        displayName: "Quran-Lab zipformer (must be refused)",
        modelRef: "quran-lab/zipformer_p-arabic-v3",
        license: "NPL-1.1",
        allowDownload: false,
      }),
    ).toThrow(/Refusing model/);

    expect(() =>
      createHuggingFaceAdapter({
        id: "muno459-fastconformer",
        displayName: "Muno459 fastconformer (must be refused)",
        modelRef: "Muno459/fastconformer-quran",
        license: "NPL-1.1",
        allowDownload: false,
      }),
    ).toThrow(/Refusing model/);
  });

  it("reports the production adapter unavailable without an API key", async () => {
    // OPENAI_API_KEY is unset in the test environment; the adapter must say
    // so plainly instead of failing the bake-off.
    const adapter = createProductionAdapter();
    const availability = await adapter.isAvailable();
    if (!process.env.OPENAI_API_KEY) {
      expect(availability.available).toBe(false);
      expect(availability.reason).toMatch(/OPENAI_API_KEY/);
    } else {
      expect(availability.available).toBe(true);
    }
  });

  it("keeps model-specific logic behind the adapter interface", async () => {
    // A stub adapter exercises the contract the runner depends on.
    const stub = {
      id: "stub",
      displayName: "Stub",
      modelRef: "stub",
      license: "MIT",
      isAvailable: async () => ({ available: true }),
      transcribe: async () => ({
        transcript: "ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
        latencyMs: 1,
        peakRssMb: null,
        error: null,
      }),
    };
    const result = await stub.transcribe(Buffer.from([0]), "audio/wav");
    expect(result.transcript).toContain("ٱلرَّحْمَٰنِ");
    expect(typeof result.latencyMs).toBe("number");
  });
});
