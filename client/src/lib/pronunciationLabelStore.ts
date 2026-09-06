/**
 * Where a reviewer's pronunciation labels live while the prototype is open.
 *
 * Local storage and a JSON export, for the same reasons as the curriculum audit:
 * a labeling session is a document a named person produces, and it must be
 * portable enough to hand to whoever assembles the dataset. There is no server
 * call here and no database table — the collection system this would eventually
 * feed does not exist yet, and building half of it before consent, retention and
 * deletion exist would be the wrong order.
 *
 * **No audio passes through this module.** The prototype plays a file the
 * reviewer opens from their own disk; the file is never read into a record,
 * never uploaded and never persisted. What is stored is labels and reviewer
 * identity, nothing else.
 */
import {
  LABEL_DEFINITIONS,
  OBSERVATION_CONFIDENCE,
  PRONUNCIATION_LABELS,
  RECORDING_QUALITY,
  SEVERITY_LEVELS,
  type Adjudication,
  type LabelObservation,
  type PronunciationLabel,
  type TeacherReview,
  type TeacherReviewer,
} from "@shared/pronunciationDataset";

export const LABEL_SESSION_KEY = "miqra-pronunciation-labels";
export const LABEL_REVIEWER_KEY = "miqra-pronunciation-reviewer";

/** Just enough of the Storage interface to be faked in a test. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * One reviewer's work in progress: their independent reviews, and any
 * adjudications they recorded. Kept in one document so it exports as one file.
 */
export type LabelingSession = {
  reviews: TeacherReview[];
  adjudications: Adjudication[];
};

export const EMPTY_SESSION: LabelingSession = { reviews: [], adjudications: [] };

const isNonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isMember = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

function parseReviewer(value: unknown): TeacherReviewer | null {
  if (!value || typeof value !== "object") return null;
  const reviewer = value as Partial<TeacherReviewer>;
  if (!isNonEmpty(reviewer.reviewerId) || !isNonEmpty(reviewer.qualification)) return null;
  return {
    reviewerId: reviewer.reviewerId,
    qualification: reviewer.qualification,
    ...(isNonEmpty(reviewer.riwayah) ? { riwayah: reviewer.riwayah } : {}),
  };
}

/**
 * Validates one observation.
 *
 * The scope check is the substantive one: a label read back from a file has to
 * sit somewhere its definition allows, or the location means something different
 * from what the reviewer chose.
 */
export function parseObservation(value: unknown): LabelObservation | null {
  if (!value || typeof value !== "object") return null;
  const observation = value as Partial<LabelObservation>;
  if (!isNonEmpty(observation.id)) return null;
  if (!isMember(PRONUNCIATION_LABELS, observation.label)) return null;
  if (!isMember(SEVERITY_LEVELS, observation.severity)) return null;
  if (!isMember(OBSERVATION_CONFIDENCE, observation.confidence)) return null;
  const location = observation.location;
  if (!location || typeof location !== "object") return null;
  if (!LABEL_DEFINITIONS[observation.label].scopes.includes(location.scope)) return null;
  return observation as LabelObservation;
}

export function parseReview(value: unknown): TeacherReview | null {
  if (!value || typeof value !== "object") return null;
  const review = value as Partial<TeacherReview>;
  const reviewer = parseReviewer(review.reviewer);
  if (!reviewer) return null;
  if (!isNonEmpty(review.reviewId) || !isNonEmpty(review.sampleId) || !isNonEmpty(review.reviewedAt)) return null;
  if (!isMember(PRONUNCIATION_LABELS, review.overallLabel)) return null;
  if (!isMember(RECORDING_QUALITY, review.quality)) return null;
  const observations = Array.isArray(review.observations)
    ? review.observations.map(parseObservation).filter((entry): entry is LabelObservation => entry !== null)
    : [];
  return {
    reviewId: review.reviewId,
    sampleId: review.sampleId,
    reviewer,
    reviewedAt: review.reviewedAt,
    overallLabel: review.overallLabel,
    observations,
    quality: review.quality,
    uncertain: review.uncertain === true,
    ...(review.correction ? { correction: review.correction } : {}),
    ...(isNonEmpty(review.notes) ? { notes: review.notes } : {}),
  };
}

export function parseAdjudication(value: unknown): Adjudication | null {
  if (!value || typeof value !== "object") return null;
  const adjudication = value as Partial<Adjudication>;
  const adjudicator = parseReviewer(adjudication.adjudicator);
  if (!adjudicator) return null;
  if (!isNonEmpty(adjudication.sampleId) || !isNonEmpty(adjudication.adjudicatedAt)) return null;
  // An adjudication with no rationale is a merge wearing a hat; it is dropped
  // here exactly as `adjudicate` refuses to build one.
  if (!isNonEmpty(adjudication.rationale)) return null;
  if (!isMember(PRONUNCIATION_LABELS, adjudication.overallLabel)) return null;
  if (!Array.isArray(adjudication.consideredReviewIds) || adjudication.consideredReviewIds.length === 0) return null;
  const observations = Array.isArray(adjudication.observations)
    ? adjudication.observations.map(parseObservation).filter((entry): entry is LabelObservation => entry !== null)
    : [];
  return {
    sampleId: adjudication.sampleId,
    adjudicator,
    adjudicatedAt: adjudication.adjudicatedAt,
    consideredReviewIds: adjudication.consideredReviewIds.filter(isNonEmpty),
    overallLabel: adjudication.overallLabel,
    observations,
    rationale: adjudication.rationale,
  };
}

export function parseSession(raw: string | null): LabelingSession {
  if (!raw) return { reviews: [], adjudications: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { reviews: [], adjudications: [] };
    const document = parsed as { reviews?: unknown; adjudications?: unknown };
    return {
      reviews: Array.isArray(document.reviews)
        ? document.reviews.map(parseReview).filter((entry): entry is TeacherReview => entry !== null)
        : [],
      adjudications: Array.isArray(document.adjudications)
        ? document.adjudications.map(parseAdjudication).filter((entry): entry is Adjudication => entry !== null)
        : [],
    };
  } catch {
    return { reviews: [], adjudications: [] };
  }
}

export function serializeSession(session: LabelingSession): string {
  return JSON.stringify(session, null, 2);
}

function safeStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readSession(storage: StorageLike | undefined = safeStorage()): LabelingSession {
  if (!storage) return { reviews: [], adjudications: [] };
  try {
    return parseSession(storage.getItem(LABEL_SESSION_KEY));
  } catch {
    return { reviews: [], adjudications: [] };
  }
}

export function writeSession(session: LabelingSession, storage: StorageLike | undefined = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(LABEL_SESSION_KEY, serializeSession(session));
  } catch {
    // The export button is the reviewer's durable copy; a blocked store must not
    // lose the review currently on screen.
  }
}

export function readReviewerIdentity(storage: StorageLike | undefined = safeStorage()): TeacherReviewer {
  const empty: TeacherReviewer = { reviewerId: "", qualification: "" };
  if (!storage) return empty;
  try {
    const raw = storage.getItem(LABEL_REVIEWER_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return empty;
    const reviewer = parsed as Partial<TeacherReviewer>;
    return {
      reviewerId: typeof reviewer.reviewerId === "string" ? reviewer.reviewerId : "",
      qualification: typeof reviewer.qualification === "string" ? reviewer.qualification : "",
      ...(isNonEmpty(reviewer.riwayah) ? { riwayah: reviewer.riwayah } : {}),
    };
  } catch {
    return empty;
  }
}

export function writeReviewerIdentity(reviewer: TeacherReviewer, storage: StorageLike | undefined = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(LABEL_REVIEWER_KEY, JSON.stringify(reviewer));
  } catch {
    // Convenience only.
  }
}

/** Reviews recorded for one sample, in submission order. */
export function reviewsForSample(session: LabelingSession, sampleId: string): TeacherReview[] {
  return session.reviews.filter((review) => review.sampleId === sampleId);
}

export function adjudicationForSample(session: LabelingSession, sampleId: string): Adjudication | null {
  return session.adjudications.find((entry) => entry.sampleId === sampleId) ?? null;
}

/**
 * Merges an imported session.
 *
 * Reviews are keyed by review id, so importing a colleague's file adds their
 * independent reviews beside yours rather than replacing them — which is the
 * whole point of independent review.
 */
export function mergeSessions(current: LabelingSession, incoming: LabelingSession): LabelingSession {
  const knownReviews = new Set(current.reviews.map((review) => review.reviewId));
  const knownAdjudications = new Set(current.adjudications.map((entry) => `${entry.sampleId}:${entry.adjudicatedAt}`));
  return {
    reviews: [...current.reviews, ...incoming.reviews.filter((review) => !knownReviews.has(review.reviewId))],
    adjudications: [
      ...current.adjudications,
      ...incoming.adjudications.filter((entry) => !knownAdjudications.has(`${entry.sampleId}:${entry.adjudicatedAt}`)),
    ],
  };
}
