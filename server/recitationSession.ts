import { assessRecitationTranscript, normaliseArabicToken, tokenizeArabic, type RecitationAssessment } from "./recitation";
import {
  createVerseFollowingPosition,
  followRecitation,
  toVerseFollowingPosition,
  type VerseCorrectionFocus,
  type VerseFollowingPosition,
  type VerseFollowingResult,
} from "@shared/verseFollowing";

export type RecitationChunkStability = "interim" | "final";
export type RecitationChunkGuidance = "continue" | "correct" | "uncertain" | "ayah_advanced" | "surah_completed";

/** Lightweight client-carried state; the service itself remains stateless. */
export type RecitationSessionState = {
  sessionId: string;
  surah: number;
  currentAyah: number;
  expectedWordIndex: number;
  lastCompletedAyah: number | null;
  trackerState: VerseFollowingPosition["state"];
  attemptsOnCurrentAyah: number;
  chunkCount: number;
  lastAcceptedTranscriptSegment: string;
  recentCorrectionFocus: VerseCorrectionFocus | null;
  /** Stable words collected for the current ayah, used to join short chunks. */
  currentAyahTranscript: string;
  /** Bounded id list makes retried or late HTTP responses idempotent. */
  processedChunkIds: string[];
};

export type IngestRecitationChunkInput = {
  session: RecitationSessionState;
  expectedAyahArabic: string;
  transcriptChunk: string;
  stability: RecitationChunkStability;
  totalAyahs: number;
  previousAyahArabic?: string;
  nextAyahArabic?: string;
  chunkId?: string;
};

export type IngestRecitationChunkResult = {
  session: RecitationSessionState;
  assessment: RecitationAssessment;
  verseFollowing: VerseFollowingResult;
  guidance: RecitationChunkGuidance;
  accepted: boolean;
  duplicate: boolean;
  novelTranscript: string;
};

export function createRecitationSession(sessionId: string, surah: number, ayah: number): RecitationSessionState {
  const position = createVerseFollowingPosition(surah, ayah);
  return {
    sessionId,
    surah,
    currentAyah: ayah,
    expectedWordIndex: 1,
    lastCompletedAyah: null,
    trackerState: position.state,
    attemptsOnCurrentAyah: 0,
    chunkCount: 0,
    lastAcceptedTranscriptSegment: "",
    recentCorrectionFocus: null,
    currentAyahTranscript: "",
    processedChunkIds: [],
  };
}

export function resetRecitationSession(session: RecitationSessionState): RecitationSessionState {
  return createRecitationSession(session.sessionId, session.surah, session.currentAyah);
}

function normalisedWords(text: string): string[] {
  return tokenizeArabic(text).map(normaliseArabicToken).filter(Boolean);
}

/**
 * Remove the longest suffix of the accepted text that equals a prefix of the
 * incoming chunk. Browser recognition commonly grows "a b" into "a b c";
 * comparing normalized words turns that into the novel word "c". An exact
 * duplicate therefore contributes no words. Repetitions at a chunk boundary
 * are conservatively treated as recognition overlap, not fresh progress.
 */
export function deduplicateTranscriptOverlap(accepted: string, incoming: string): string {
  const acceptedWords = normalisedWords(accepted);
  const incomingOriginal = tokenizeArabic(incoming);
  const incomingWords = incomingOriginal.map(normaliseArabicToken);
  const maximum = Math.min(acceptedWords.length, incomingWords.length);
  let overlap = 0;
  for (let size = maximum; size > 0; size -= 1) {
    const suffix = acceptedWords.slice(-size);
    const prefix = incomingWords.slice(0, size);
    if (suffix.every((word, index) => word === prefix[index])) {
      overlap = size;
      break;
    }
  }
  return incomingOriginal.slice(overlap).join(" ");
}

function positionFromSession(session: RecitationSessionState): VerseFollowingPosition {
  return {
    currentSurah: session.surah,
    currentAyah: session.currentAyah,
    expectedWordIndex: session.expectedWordIndex,
    lastCompletedAyah: session.lastCompletedAyah,
    state: session.trackerState,
    attemptsOnCurrentAyah: session.attemptsOnCurrentAyah,
  };
}

function guidanceFor(result: VerseFollowingResult): RecitationChunkGuidance {
  if (result.reason === "surah_completed") return "surah_completed";
  if (result.reason === "ayah_completed") return "ayah_advanced";
  if (result.state === "correcting") return "correct";
  if (result.state === "uncertain") return "uncertain";
  return "continue";
}

export function ingestRecitationChunk(input: IngestRecitationChunkInput): IngestRecitationChunkResult {
  const { session } = input;
  const idDuplicate = Boolean(input.chunkId && session.processedChunkIds.includes(input.chunkId));
  const overlapBasis = session.currentAyahTranscript || session.lastAcceptedTranscriptSegment;
  const novelTranscript = idDuplicate ? "" : deduplicateTranscriptOverlap(overlapBasis, input.transcriptChunk);
  const candidateTranscript = [session.currentAyahTranscript, novelTranscript].filter(Boolean).join(" ").trim();
  const assessment = assessRecitationTranscript(input.expectedAyahArabic, candidateTranscript);
  const verseFollowing = followRecitation({
    position: positionFromSession(session),
    totalAyahs: input.totalAyahs,
    alignment: assessment,
    previousAyahAlignment: input.previousAyahArabic
      ? assessRecitationTranscript(input.previousAyahArabic, candidateTranscript)
      : null,
    nextAyahAlignment: input.nextAyahArabic
      ? assessRecitationTranscript(input.nextAyahArabic, candidateTranscript)
      : null,
    transcriptUsable: Boolean(candidateTranscript),
  });
  const textDuplicate = Boolean(input.transcriptChunk.trim()) && !novelTranscript;
  const duplicate = idDuplicate || textDuplicate;

  // Interim recognition is preview-only. Duplicate/empty finals are idempotent:
  // return useful guidance but never increment attempts or alter durable place.
  if (input.stability === "interim" || duplicate || !input.transcriptChunk.trim()) {
    return {
      session,
      assessment,
      verseFollowing,
      guidance: guidanceFor(verseFollowing),
      accepted: false,
      duplicate,
      novelTranscript,
    };
  }

  const nextPosition = toVerseFollowingPosition(verseFollowing);
  const advancedOrCompleted = verseFollowing.reason === "ayah_completed" || verseFollowing.reason === "surah_completed";
  const nextSession: RecitationSessionState = {
    ...session,
    currentAyah: nextPosition.currentAyah,
    expectedWordIndex: nextPosition.expectedWordIndex,
    lastCompletedAyah: nextPosition.lastCompletedAyah,
    trackerState: nextPosition.state,
    attemptsOnCurrentAyah: nextPosition.attemptsOnCurrentAyah,
    chunkCount: session.chunkCount + 1,
    lastAcceptedTranscriptSegment: input.transcriptChunk.trim(),
    recentCorrectionFocus: verseFollowing.correctionFocus,
    currentAyahTranscript: advancedOrCompleted ? "" : candidateTranscript,
    processedChunkIds: input.chunkId ? [...session.processedChunkIds.slice(-31), input.chunkId] : session.processedChunkIds,
  };

  return {
    session: nextSession,
    assessment,
    verseFollowing,
    guidance: guidanceFor(verseFollowing),
    accepted: true,
    duplicate: false,
    novelTranscript,
  };
}
