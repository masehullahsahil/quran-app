import { describe, expect, it } from "vitest";
import {
  MAX_AUDIO_BASE64_LENGTH,
  MAX_AUDIO_BYTES,
  REQUEST_BODY_LIMIT_BYTES,
  base64Length,
  estimateRequestBytes,
  formatMegabytes,
  isRecordingTooLarge,
} from "./recording";

describe("recording limits", () => {
  // The whole point of the cap: a request at the limit must still fit inside
  // what the platform will accept, or it is rejected before our code runs and
  // the learner sees an opaque 413.
  it("keeps a maximum-size recording under the serverless body limit", () => {
    expect(estimateRequestBytes(MAX_AUDIO_BYTES)).toBeLessThan(REQUEST_BODY_LIMIT_BYTES);
  });

  it("leaves usable headroom rather than sitting on the limit", () => {
    const headroom = REQUEST_BODY_LIMIT_BYTES - estimateRequestBytes(MAX_AUDIO_BYTES);
    expect(headroom).toBeGreaterThan(250_000);
  });

  it("accounts for base64 expanding the payload by a third", () => {
    expect(base64Length(3)).toBe(4);
    expect(base64Length(3000)).toBe(4000);
    expect(base64Length(MAX_AUDIO_BYTES)).toBe(MAX_AUDIO_BASE64_LENGTH);
    expect(MAX_AUDIO_BASE64_LENGTH).toBeGreaterThan(MAX_AUDIO_BYTES);
  });

  it("accepts a realistic single-ayah recording", () => {
    // ~30 seconds of the Opus audio MediaRecorder produces, around 64 kbps.
    const thirtySeconds = 30 * 8 * 1024;
    expect(isRecordingTooLarge(thirtySeconds)).toBe(false);
    expect(estimateRequestBytes(thirtySeconds)).toBeLessThan(REQUEST_BODY_LIMIT_BYTES);
  });

  it("rejects only past the cap", () => {
    expect(isRecordingTooLarge(MAX_AUDIO_BYTES)).toBe(false);
    expect(isRecordingTooLarge(MAX_AUDIO_BYTES + 1)).toBe(true);
  });

  it("formats sizes for the message shown to the learner", () => {
    expect(formatMegabytes(MAX_AUDIO_BYTES)).toBe("3.0");
    expect(formatMegabytes(1.5 * 1024 * 1024)).toBe("1.5");
  });
});
