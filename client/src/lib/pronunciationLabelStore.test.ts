/**
 * What the labeling store keeps, and what it refuses.
 *
 * The interesting cases are the records that did not come from the form: a file
 * a colleague exported, a hand-edited document, a value left by an older build.
 * An adjudication with no rationale, or a review with no qualified reviewer, is
 * not made trustworthy by having been written to disk — so the parser applies
 * the same conditions the model does, and drops what fails them.
 *
 * It also asserts the thing that is easiest to get wrong by accident: no audio
 * is ever stored.
 */
import { describe, expect, it } from "vitest";
import {
  LABEL_REVIEWER_KEY,
  LABEL_SESSION_KEY,
  adjudicationForSample,
  mergeSessions,
  parseAdjudication,
  parseObservation,
  parseReview,
  parseSession,
  readReviewerIdentity,
  readSession,
  reviewsForSample,
  serializeSession,
  writeReviewerIdentity,
  writeSession,
  type LabelingSession,
} from "./pronunciationLabelStore";
import {
  FIXTURE_ADJUDICATION,
  FIXTURE_REVIEW_AGREEING_A,
  FIXTURE_REVIEW_DISAGREEING_A,
  FIXTURE_REVIEW_UNCERTAIN,
} from "@shared/pronunciationDatasetFixtures";

function fakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

const session: LabelingSession = {
  reviews: [FIXTURE_REVIEW_AGREEING_A, FIXTURE_REVIEW_UNCERTAIN],
  adjudications: [FIXTURE_ADJUDICATION],
};

describe("a labeling session round-trips", () => {
  it("writes and reads reviews and adjudications unchanged", () => {
    const storage = fakeStorage();
    writeSession(session, storage);
    const read = readSession(storage);

    expect(read.reviews).toHaveLength(2);
    expect(read.reviews[0].reviewId).toBe(FIXTURE_REVIEW_AGREEING_A.reviewId);
    expect(read.reviews[0].reviewer.qualification).toBe(FIXTURE_REVIEW_AGREEING_A.reviewer.qualification);
    expect(read.adjudications[0].rationale).toBe(FIXTURE_ADJUDICATION.rationale);
  });

  it("preserves an uncertain review as uncertain", () => {
    const read = parseSession(serializeSession(session));
    const uncertain = read.reviews.find((review) => review.reviewId === FIXTURE_REVIEW_UNCERTAIN.reviewId);

    expect(uncertain?.uncertain).toBe(true);
    expect(uncertain?.overallLabel).toBe("uncertain-cannot-classify");
  });

  it("reads an absent or corrupt store as an empty session", () => {
    expect(parseSession(null)).toEqual({ reviews: [], adjudications: [] });
    expect(parseSession("not json")).toEqual({ reviews: [], adjudications: [] });
    expect(parseSession('{"reviews":"nope"}')).toEqual({ reviews: [], adjudications: [] });
    expect(readSession(undefined)).toEqual({ reviews: [], adjudications: [] });
  });

  it("finds the reviews and adjudication for one sample", () => {
    expect(reviewsForSample(session, FIXTURE_REVIEW_AGREEING_A.sampleId).map((review) => review.reviewId)).toEqual([
      FIXTURE_REVIEW_AGREEING_A.reviewId,
    ]);
    expect(adjudicationForSample(session, FIXTURE_ADJUDICATION.sampleId)?.rationale).toBe(FIXTURE_ADJUDICATION.rationale);
    expect(adjudicationForSample(session, "sample-that-does-not-exist")).toBeNull();
  });
});

describe("independent reviews stay independent", () => {
  it("merges an imported file beside the reviews already held", () => {
    const mine: LabelingSession = { reviews: [FIXTURE_REVIEW_DISAGREEING_A], adjudications: [] };
    const theirs: LabelingSession = { reviews: [FIXTURE_REVIEW_AGREEING_A], adjudications: [] };
    const merged = mergeSessions(mine, theirs);

    expect(merged.reviews.map((review) => review.reviewId)).toEqual([
      FIXTURE_REVIEW_DISAGREEING_A.reviewId,
      FIXTURE_REVIEW_AGREEING_A.reviewId,
    ]);
  });

  it("does not duplicate a review that is already held", () => {
    const merged = mergeSessions(session, session);
    expect(merged.reviews).toHaveLength(2);
    expect(merged.adjudications).toHaveLength(1);
  });

  it("never rewrites an existing review when a newer one arrives for the same sample", () => {
    const second = { ...FIXTURE_REVIEW_AGREEING_A, reviewId: "review-second", overallLabel: "correct-recitation" as const };
    const merged = mergeSessions({ reviews: [FIXTURE_REVIEW_AGREEING_A], adjudications: [] }, { reviews: [second], adjudications: [] });

    expect(merged.reviews).toHaveLength(2);
    expect(merged.reviews[0].overallLabel).toBe("word-omission");
    expect(merged.reviews[1].overallLabel).toBe("correct-recitation");
  });
});

describe("records that would weaken the ground truth are dropped", () => {
  it("drops an adjudication with no rationale", () => {
    expect(parseAdjudication({ ...FIXTURE_ADJUDICATION, rationale: "   " })).toBeNull();
    const raw = JSON.stringify({ reviews: [], adjudications: [{ ...FIXTURE_ADJUDICATION, rationale: "" }] });
    expect(parseSession(raw).adjudications).toEqual([]);
  });

  it("drops an adjudication that names no reviews or no qualified adjudicator", () => {
    expect(parseAdjudication({ ...FIXTURE_ADJUDICATION, consideredReviewIds: [] })).toBeNull();
    expect(
      parseAdjudication({ ...FIXTURE_ADJUDICATION, adjudicator: { reviewerId: "reviewer-9", qualification: "" } }),
    ).toBeNull();
  });

  it("drops a review with no reviewer qualification, no date or an unknown label", () => {
    expect(parseReview({ ...FIXTURE_REVIEW_AGREEING_A, reviewer: { reviewerId: "r", qualification: "" } })).toBeNull();
    expect(parseReview({ ...FIXTURE_REVIEW_AGREEING_A, reviewedAt: "" })).toBeNull();
    expect(parseReview({ ...FIXTURE_REVIEW_AGREEING_A, overallLabel: "sounds-a-bit-off" })).toBeNull();
    expect(parseReview({ ...FIXTURE_REVIEW_AGREEING_A, quality: "fine-ish" })).toBeNull();
    expect(parseReview(null)).toBeNull();
  });

  it("drops an observation attached at a scope its label does not allow", () => {
    expect(
      parseObservation({
        id: "obs-x",
        label: "letter-substitution",
        location: { scope: "ayah", surah: 1, ayah: 1 },
        severity: "minor",
        confidence: "probable",
      }),
    ).toBeNull();

    expect(
      parseObservation({
        id: "obs-ok",
        label: "letter-substitution",
        location: { scope: "letter", surah: 1, ayah: 1, wordIndex: 1, letterIndex: 1 },
        severity: "minor",
        confidence: "probable",
      }),
    ).not.toBeNull();
  });

  it("keeps the valid records when one entry in a file is bad", () => {
    const raw = JSON.stringify({
      reviews: [{ ...FIXTURE_REVIEW_AGREEING_A, reviewedAt: "" }, FIXTURE_REVIEW_UNCERTAIN],
      adjudications: [],
    });
    expect(parseSession(raw).reviews.map((review) => review.reviewId)).toEqual([FIXTURE_REVIEW_UNCERTAIN.reviewId]);
  });
});

describe("no audio and no learner identity is stored", () => {
  it("keeps nothing but labels and reviewer identity in the session document", () => {
    const written = serializeSession(session);

    expect(written).not.toContain("data:audio");
    expect(written).not.toContain("base64");
    expect(written).not.toContain("blob:");
    expect(written).not.toContain("audioRef");
    expect(written).not.toContain("storageKey");
  });

  it("stores the reviewer under their own key, apart from the labels", () => {
    const storage = fakeStorage();
    writeReviewerIdentity({ reviewerId: "reviewer-004", qualification: "Qari", riwayah: "Hafs" }, storage);

    expect(storage.values.has(LABEL_REVIEWER_KEY)).toBe(true);
    expect(storage.values.has(LABEL_SESSION_KEY)).toBe(false);
    expect(readReviewerIdentity(storage)).toEqual({
      reviewerId: "reviewer-004",
      qualification: "Qari",
      riwayah: "Hafs",
    });
  });

  it("reads a missing reviewer as unnamed rather than guessing", () => {
    expect(readReviewerIdentity(fakeStorage())).toEqual({ reviewerId: "", qualification: "" });
    expect(readReviewerIdentity(undefined)).toEqual({ reviewerId: "", qualification: "" });
  });

  it("survives a storage that refuses to write", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(() => writeSession(session, throwing)).not.toThrow();
    expect(() => writeReviewerIdentity({ reviewerId: "r", qualification: "q" }, throwing)).not.toThrow();
  });
});
