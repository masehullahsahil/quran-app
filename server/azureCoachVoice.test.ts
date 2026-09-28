/**
 * Azure coaching voice: the factory never throws and never leaks the key;
 * the vendor call is exact (SSML, headers, fail-closed); the disk cache
 * synthesizes once and serves forever.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AZURE_COACH_VOICES,
  buildCoachSsml,
  coachAudioCacheKey,
  createAzureCoachSynthesizer,
  createCachedCoachSynthesizer,
  listAzureVoices,
} from "./azureCoachVoice";
import type { SupportedLanguageCode } from "@shared/languages";

const ENV = { AZURE_SPEECH_KEY: "test-key", AZURE_SPEECH_REGION: "westus" };

type FetchCall = { url: string; init: RequestInit };
function mockFetch(handler: (call: FetchCall) => Promise<Response> | Response) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function okAudio(bytes: number[]) {
  return {
    ok: true,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  } as unknown as Response;
}

describe("createAzureCoachSynthesizer", () => {
  it("returns null when the key or region is missing — 501 behavior preserved", () => {
    expect(createAzureCoachSynthesizer({})).toBeNull();
    expect(createAzureCoachSynthesizer({ AZURE_SPEECH_KEY: "k" })).toBeNull();
    expect(createAzureCoachSynthesizer({ AZURE_SPEECH_REGION: "r" })).toBeNull();
    expect(createAzureCoachSynthesizer({ AZURE_SPEECH_KEY: "", AZURE_SPEECH_REGION: "r" })).toBeNull();
  });

  it("POSTs SSML to the regional TTS endpoint with the key header", async () => {
    const { fetchImpl, calls } = mockFetch(() => okAudio([1, 2, 3]));
    const synth = createAzureCoachSynthesizer(ENV, fetchImpl)!;
    const audio = await synth("Good. Carry on.", "en");
    expect(audio).toBeInstanceOf(Buffer);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe("https://westus.tts.speech.microsoft.com/cognitiveservices/v1");
    const headers = call.init.headers as Record<string, string>;
    expect(headers["Ocp-Apim-Subscription-Key"]).toBe("test-key");
    expect(headers["Content-Type"]).toBe("application/ssml+xml");
    expect(headers["X-Microsoft-OutputFormat"]).toBe("audio-16khz-32kbitrate-mono-mp3");
    const body = String(call.init.body);
    expect(body).toContain('<voice name="en-US-AvaNeural">');
    expect(body).toContain("Good. Carry on.");
  });

  it("uses the mapped voice per language, including the Dari fallback voice", async () => {
    const { fetchImpl, calls } = mockFetch(() => okAudio([9]));
    const synth = createAzureCoachSynthesizer(ENV, fetchImpl)!;
    const cases: Array<[SupportedLanguageCode, string]> = [
      ["en", "en-US-AvaNeural"],
      ["ur", "ur-PK-GulNeural"],
      ["ps", "ps-AF-LatifaNeural"],
      ["fa-AF", "fa-IR-DilaraNeural"],
      ["ar", "ar-SA-ZariyahNeural"],
    ];
    for (const [language, voice] of cases) {
      await synth("Test.", language);
    }
    expect(calls.map((c) => String(c.init.body))).toEqual(
      cases.map(([, voice]) => expect.stringContaining(`<voice name="${voice}">`)),
    );
  });

  it("returns null on HTTP error, network throw, or empty audio — never throws", async () => {
    const synthErr = createAzureCoachSynthesizer(
      ENV,
      mockFetch(() => ({ ok: false }) as unknown as Response).fetchImpl,
    )!;
    await expect(synthErr("Hello.", "en")).resolves.toBeNull();

    const synthThrow = createAzureCoachSynthesizer(
      ENV,
      mockFetch(() => {
        throw new Error("network down");
      }).fetchImpl,
    )!;
    await expect(synthThrow("Hello.", "en")).resolves.toBeNull();

    const synthEmpty = createAzureCoachSynthesizer(
      ENV,
      mockFetch(() => okAudio([])).fetchImpl,
    )!;
    await expect(synthEmpty("Hello.", "en")).resolves.toBeNull();
  });

  it("rejects empty and over-long text before any vendor call", async () => {
    const { fetchImpl, calls } = mockFetch(() => okAudio([1]));
    const synth = createAzureCoachSynthesizer(ENV, fetchImpl)!;
    await expect(synth("   ", "en")).resolves.toBeNull();
    await expect(synth("x".repeat(501), "en")).resolves.toBeNull();
    await expect(synth("x".repeat(500), "en")).resolves.not.toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe("buildCoachSsml", () => {
  it("escapes XML and keeps default prosody — no slowed speech", () => {
    const ssml = buildCoachSsml("en-US-AvaNeural", 'Say "a < b" & carry on.');
    expect(ssml).toContain("a &lt; b");
    expect(ssml).toContain("&amp;");
    expect(ssml).toContain("&quot;");
    expect(ssml).not.toContain("<prosody");
    expect(ssml).not.toContain("rate=");
  });
});

describe("coachAudioCacheKey", () => {
  it("is deterministic and separates voice from text", () => {
    const a = coachAudioCacheKey("en-US-AvaNeural", "Hello.");
    expect(a).toBe(coachAudioCacheKey("en-US-AvaNeural", "Hello."));
    expect(a).not.toBe(coachAudioCacheKey("ur-PK-GulNeural", "Hello."));
    expect(a).not.toBe(coachAudioCacheKey("en-US-AvaNeural", "Hello!"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("createCachedCoachSynthesizer", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "coach-audio-"));
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns undefined when there is no inner synthesizer — 501 preserved", () => {
    expect(createCachedCoachSynthesizer(undefined, dir)).toBeUndefined();
  });

  it("synthesizes on miss, writes through, and serves from cache on hit", async () => {
    const inner = vi.fn(async () => Buffer.from([7, 7, 7]));
    const cached = createCachedCoachSynthesizer(inner, dir)!;

    const first = await cached("Good. Carry on.", "en");
    expect(first).toEqual(Buffer.from([7, 7, 7]));
    expect(inner).toHaveBeenCalledTimes(1);

    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(`${coachAudioCacheKey(AZURE_COACH_VOICES.en, "Good. Carry on.")}.mp3`);
    expect(await readFile(join(dir, files[0]))).toEqual(Buffer.from([7, 7, 7]));

    const second = await cached("Good. Carry on.", "en");
    expect(second).toEqual(Buffer.from([7, 7, 7]));
    expect(inner).toHaveBeenCalledTimes(1); // no second vendor call
  });

  it("keeps a separate file per language — a voice is never reused across languages", async () => {
    const inner = vi.fn(async (_text: string, language: SupportedLanguageCode) =>
      Buffer.from([language.length]),
    );
    const cached = createCachedCoachSynthesizer(inner, dir)!;
    await cached("Hello.", "en");
    await cached("Hello.", "ur");
    expect(inner).toHaveBeenCalledTimes(2);
    expect(await readdir(dir)).toHaveLength(2);
  });

  it("serves the bytes even when the cache write fails", async () => {
    const inner = vi.fn(async () => Buffer.from([5]));
    // A file standing where the cache directory should be: mkdir fails,
    // so write-through fails — the lesson still gets its audio.
    const blocker = join(dir, "blocker");
    await writeFile(blocker, "x");
    const cached = createCachedCoachSynthesizer(inner, join(blocker, "sub"))!;
    const audio = await cached("Hello.", "en");
    expect(audio).toEqual(Buffer.from([5]));
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("returns null when the inner synthesizer fails — no empty cache entry", async () => {
    const inner = vi.fn(async () => null);
    const cached = createCachedCoachSynthesizer(inner, dir)!;
    await expect(cached("Hello.", "en")).resolves.toBeNull();
    expect(await readdir(dir)).toHaveLength(0);
  });
});

describe("listAzureVoices", () => {
  it("returns the region's voice short names", async () => {
    const { fetchImpl, calls } = mockFetch(
      () =>
        ({
          ok: true,
          json: async () => [
            { ShortName: "en-US-AvaNeural" },
            { ShortName: "ps-AF-LatifaNeural" },
            { SomethingElse: 1 },
          ],
        }) as unknown as Response,
    );
    const voices = await listAzureVoices("k", "westus", fetchImpl);
    expect(voices).toEqual(["en-US-AvaNeural", "ps-AF-LatifaNeural"]);
    expect(calls[0].url).toContain("/cognitiveservices/voices/list");
  });

  it("returns null on failure — never throws", async () => {
    const bad = mockFetch(() => ({ ok: false }) as unknown as Response).fetchImpl;
    await expect(listAzureVoices("k", "r", bad)).resolves.toBeNull();
    const throwing = mockFetch(() => {
      throw new Error("down");
    }).fetchImpl;
    await expect(listAzureVoices("k", "r", throwing)).resolves.toBeNull();
  });
});
