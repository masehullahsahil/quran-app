/**
 * The one place the app talks to the tutor engine.
 *
 * Everything the Live Tutor knows lives on the server: `tutor.start` opens a
 * session, `tutor.turn` applies one event to it, and the exact session snapshot
 * has to be handed back each time or the server rejects the turn as stale. This
 * hook holds that conversation and nothing else, so the panel above it and the
 * page around it never touch the wire.
 *
 * **There is no second state machine here.** This hook stores the last turn the
 * server returned and sends events; it never advances a phase, chooses an
 * action, or decides anything about a recitation. If the server says the
 * session is stale, that is the state — the hook does not paper over it.
 *
 * It is also the seam. When the trusted recitation→tutor handoff lands, the
 * evidence stops being posted from here and starts arriving with the review;
 * `sendRecitation` is the single call site that changes, and neither the
 * adapter nor the panel moves.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import type {
  LearnerIntent,
  LiveTutorSession,
  LiveTutorTurn,
  TutorRecitationEvidence,
} from "@shared/liveTutor";
import type { SupportedLanguageCode } from "@shared/languages";

export type UseLiveTutorInput = {
  surah: number;
  ayah: number;
  totalAyahs: number;
  learnerLanguage: SupportedLanguageCode;
  /** False while the Quran content is still loading, or Study is not open. */
  enabled: boolean;
};

export type LiveTutorController = {
  /** The last turn the server returned, or null before the first one. */
  turn: LiveTutorTurn | null;
  /** True once a session exists and its turn is usable. */
  active: boolean;
  sendIntent: (intent: LearnerIntent) => void;
  sendRecitation: (evidence: TutorRecitationEvidence) => void;
};

export function useLiveTutor(input: UseLiveTutorInput): LiveTutorController {
  const start = trpc.tutor?.start?.useMutation?.();
  const advance = trpc.tutor?.turn?.useMutation?.();
  const [turn, setTurn] = useState<LiveTutorTurn | null>(null);
  /**
   * The session as the server last described it.
   *
   * Kept in a ref as well as in state because a turn has to carry the snapshot
   * the previous turn returned; reading it from state would send whatever React
   * had rendered, which is not necessarily the newest one.
   */
  const sessionRef = useRef<LiveTutorSession | null>(null);
  const openedFor = useRef<string | null>(null);

  const remember = useCallback((next: LiveTutorTurn) => {
    sessionRef.current = next.session;
    setTurn(next);
  }, []);

  // One session per ayah. Moving to another ayah is another lesson, and the
  // engine is told so by being opened again rather than by being nudged.
  useEffect(() => {
    const key = `${input.surah}:${input.ayah}:${input.learnerLanguage}`;
    if (!input.enabled || !start) {
      if (!input.enabled) {
        openedFor.current = null;
        sessionRef.current = null;
        setTurn(null);
      }
      return;
    }
    if (openedFor.current === key) return;
    openedFor.current = key;
    sessionRef.current = null;
    setTurn(null);

    // Wrapped: a client that does not return a promise here must not take the
    // page down with it. Study without a tutor is a working screen.
    void Promise.resolve(
      start.mutateAsync({
        mode: "guided-recitation",
        surah: input.surah,
        ayah: input.ayah,
        totalAyahs: input.totalAyahs,
        learnerLanguage: input.learnerLanguage,
      }),
    )
      .then((next) => { if (next) remember(next); })
      // A tutor that cannot be reached is not an error a learner should read;
      // Study falls back to the surfaces it had before, which still work.
      .catch(() => {
        openedFor.current = null;
      });
  }, [input.enabled, input.surah, input.ayah, input.totalAyahs, input.learnerLanguage, start, remember]);

  const send = useCallback(
    (event: Parameters<typeof applyEvent>[1]) => applyEvent(sessionRef.current, event, advance, remember),
    [advance, remember],
  );

  return {
    turn,
    active: turn !== null,
    sendIntent: useCallback((intent: LearnerIntent) => send({ type: "intent", intent }), [send]),
    sendRecitation: useCallback((evidence: TutorRecitationEvidence) => send({ type: "recitation", evidence }), [send]),
  };
}

/**
 * Just enough of the mutation to post a turn.
 *
 * Narrow on purpose: the hook needs one method, and typing it this way keeps
 * the seam small when the trusted handoff changes what calls it.
 */
type Advance = { mutateAsync: (input: never) => Promise<LiveTutorTurn> } | undefined | null;

/** Posts one event against the exact snapshot the server last returned. */
function applyEvent(
  session: LiveTutorSession | null,
  event: { type: "intent"; intent: LearnerIntent } | { type: "recitation"; evidence: TutorRecitationEvidence },
  advance: Advance,
  remember: (turn: LiveTutorTurn) => void,
) {
  if (!session || !advance?.mutateAsync) return;
  void Promise.resolve(advance.mutateAsync({ session, event } as never))
    .then((next) => { if (next) remember(next); })
    // A failed turn leaves the last known state standing rather than inventing
    // a new one. The server remains the authority even when it is unreachable.
    .catch(() => {});
}
