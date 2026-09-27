/**
 * Unit tests for the recording MIME type normaliser.
 *
 * The regression under test is a real-device transcription failure: the
 * client labelled the bytes with an exact string match on the blob type, so
 * a parameterised recorder type (`audio/mp4;codecs=mp4a.40.2`) fell through
 * to `audio/webm` and the server handed Whisper the wrong filename
 * extension for the container.
 */
import { describe, expect, it } from "vitest";
import { normalizeRecordingMimeType } from "./recordingMimeType";

describe("normalizeRecordingMimeType", () => {
  it("passes the server's accepted labels through unchanged", () => {
    for (const mime of ["audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4"] as const) {
      expect(normalizeRecordingMimeType(mime)).toBe(mime);
    }
  });

  it("strips codec parameters before matching", () => {
    expect(normalizeRecordingMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeRecordingMimeType("audio/mp4;codecs=mp4a.40.2")).toBe("audio/mp4");
    expect(normalizeRecordingMimeType("audio/ogg;codecs=opus")).toBe("audio/ogg");
  });

  it("folds container aliases onto their accepted label", () => {
    expect(normalizeRecordingMimeType("audio/x-m4a")).toBe("audio/mp4");
    expect(normalizeRecordingMimeType("audio/aac")).toBe("audio/mp4");
    expect(normalizeRecordingMimeType("audio/wave")).toBe("audio/wav");
    expect(normalizeRecordingMimeType("audio/x-wav")).toBe("audio/wav");
    expect(normalizeRecordingMimeType("audio/mp3")).toBe("audio/mpeg");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeRecordingMimeType("Audio/MP4")).toBe("audio/mp4");
    expect(normalizeRecordingMimeType("  audio/webm  ")).toBe("audio/webm");
  });

  it("falls back to audio/webm for empty or unknown types", () => {
    expect(normalizeRecordingMimeType("")).toBe("audio/webm");
    expect(normalizeRecordingMimeType(null)).toBe("audio/webm");
    expect(normalizeRecordingMimeType(undefined)).toBe("audio/webm");
    expect(normalizeRecordingMimeType("video/mp4")).toBe("audio/webm");
  });
});
