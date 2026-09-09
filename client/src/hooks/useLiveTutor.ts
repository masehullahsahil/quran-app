/**
 * The one place the app talks to the tutor engine.
 *
 * Everything the Live Tutor knows lives on the server. `tutor.start` opens a
 * session; every later call names it by id and expected revision only. Since
 * #57 the browser holds a *reference* to the lesson, not a copy of it: the
 * public turn API accepts a learner intent or a timing event and nothing else,
 * and the recitation handoff runs entirely on the server through
 * `recitation.evaluateWithTutor`.
 *
 * **There is no second state machine here, and no evidence path.** This hook
 * stores the last session the server returned and sends intents. It never
 * advances a phase, chooses an action, or forms an opinion about a recitation.
 * It cannot: there is no client-side type in this file that could carry a
 * verse-following result, a correction snapshot, a recognition, or an ayah
 * completion to the tutor.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import type {
  LearnerIntent,
  LiveTutorSession,
  TutorAction,
  TutorTimingEvent,
} from "@shared/liveTutor";
import type { SupportedLanguageCode } from "@shared/languages";

type RouterOutputs = inferRouterOutputs<AppRouter>;

/**
 * The server's own answer shape, taken from the router rather than restated.
 *
 * Typing it this way is deliberate: if the trusted contract changes again, this
 * file stops compiling instead of quietly sending the previous generation's
 * payload.
 */
export type TutorHandoff = RouterOutputs["tutor"]["turn"];
export type TutorHandoffStatus = TutorHandoff["status"];

/** What the server needs to find the lesson: an id and the revision we saw. */
export type TutorSessionReference = { sessionId: string; revision: number };

export type UseLiveTutorInput = {
  surah: number;
  ayah: number;
  totalAyahs: number;
  learnerLanguage: SupportedLanguageCode;
  /** False while the Quran content is still loading, or Study is not open. */
  enabled: boolean;
};

export type LiveTutorController = {
  /** The last trusted session and action, or null when there is no lesson. */
  turn: { session: LiveTutorSession; action: TutorAction } | null;
  /** How the server answered last: `idle` before the first answer. */
  status: "idle" | TutorHandoffStatus;
  /** True once a trusted session exists and its action is usable. */
  active: boolean;
  /**
   * The reference to send with a trusted recording. Null when there is no
   * session, which is exactly when Study must use its ordinary path instead.
   */
  reference: TutorSessionReference | null;
  sendIntent: (intent: LearnerIntent) => void;
  sendTiming: (timing: TutorTimingEvent) => void;
  /**
   * Take the tutor half of a `recitation.evaluateWithTutor` answer.
   *
   * The recording is evaluated and applied to the lesson in one server call, so
   * the result arrives here already decided. This stores it; it does not read
   * it, compare it, or derive anything from it.
   */
  applyHandoff: (handoff: TutorHandoff) => void;
};

export function useLiveTutor(input: UseLiveTutorInput): LiveTutorController {
  const start = trpc.tutor?.start?.useMutation?.();
  const advance = trpc.tutor?.turn?.useMutation?.();
  const [state, setState] = useState<{
    turn: { session: LiveTutorSession; action: TutorAction } | null;
    status: "idle" | TutorHandoffStatus;
  }>({ turn: null, status: "idle" });
  /**
   * The session as the server last described it.
   *
   * Kept in a ref as well as in state because a turn has to name the revision
   * the previous answer returned; reading it from state would send whatever
   * React had rendered, which is not necessarily the newest one.
   */
  const sessionRef = useRef<LiveTutorSession | null>(null);
  const openedFor = useRef<string | null>(null);
  /**
   * A lesson the server has already told us it no longer has.
   *
   * Remembered so a lost session is not reopened on the next render, which
   * would turn one honest failure into a loop of new sessions.
   */
  const lostFor = useRef<string | null>(null);

  /**
   * Store what the server said.
   *
   * `updated`, `rejected` and `stale` all carry the trusted session, and all
   * three are stored as-is — a rejected turn is still the server's description
   * of the lesson, and a stale one is the server correcting us. `lost` carries
   * no session at all: the lesson is gone, so the tutor stops rather than
   * resuming a correction that no longer exists anywhere.
   */
  /**
   * Put the hook back to having no lesson.
   *
   * Written as a bail-out rather than a plain `setState` because this runs from
   * an effect that re-runs on every render: handing React a fresh object each
   * time would make it re-render, re-run the effect, and never stop.
   */
  const clear = useCallback(() => {
    setState((current) => (current.turn === null && current.status === "idle" ? current : { turn: null, status: "idle" }));
  }, []);

  const remember = useCallback((handoff: TutorHandoff) => {
    if (handoff.status === "lost") {
      lostFor.current = openedFor.current;
      sessionRef.current = null;
      setState({ turn: null, status: "lost" });
      return;
    }
    sessionRef.current = handoff.session;
    setState({ turn: { session: handoff.session, action: handoff.action }, status: handoff.status });
  }, []);

  // One session per lesson. Moving to another ayah by hand is another lesson
  // and opens one; being *moved* by the server is the same lesson continuing,
  // so a session already teaching this exact position is adopted, never
  // replaced. Reopening it there would throw away the advancement that just
  // happened.
  useEffect(() => {
    const key = `${input.surah}:${input.ayah}:${input.learnerLanguage}`;
    if (!input.enabled || !start) {
      if (!input.enabled) {
        openedFor.current = null;
        lostFor.current = null;
        sessionRef.current = null;
        clear();
      }
      return;
    }
    if (openedFor.current === key || lostFor.current === key) return;
    const live = sessionRef.current;
    if (live && live.surah === input.surah && live.ayah === input.ayah && live.learnerLanguage === input.learnerLanguage) {
      openedFor.current = key;
      return;
    }
    openedFor.current = key;
    sessionRef.current = null;
    clear();

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
      .then((next) => {
        if (!next) return;
        sessionRef.current = next.session;
        setState({ turn: { session: next.session, action: next.action }, status: "updated" });
      })
      // A tutor that cannot be reached is not an error a learner should read;
      // Study falls back to the surfaces it had before, which still work.
      .catch(() => {
        openedFor.current = null;
      });
  }, [input.enabled, input.surah, input.ayah, input.totalAyahs, input.learnerLanguage, start, remember, clear]);

  const send = useCallback(
    (event: PublicTutorEvent) => {
      const session = sessionRef.current;
      if (!session || !advance?.mutateAsync) return;
      void Promise.resolve(
        advance.mutateAsync({
          // Reference only. The lesson itself is the server's, and this is all
          // it will accept.
          session: { sessionId: session.sessionId, revision: session.revision },
          event,
        }),
      )
        .then((handoff) => { if (handoff) remember(handoff); })
        // A failed turn leaves the last known state standing rather than
        // inventing a new one. The server remains the authority even when it
        // is unreachable.
        .catch(() => {});
    },
    [advance, remember],
  );

  const session = state.turn?.session ?? null;
  return {
    turn: state.turn,
    status: state.status,
    active: state.turn !== null,
    reference: session ? { sessionId: session.sessionId, revision: session.revision } : null,
    sendIntent: useCallback((intent: LearnerIntent) => send({ type: "intent", intent }), [send]),
    sendTiming: useCallback((timing: TutorTimingEvent) => send({ type: "timing", timing }), [send]),
    applyHandoff: remember,
  };
}

/**
 * Everything a browser may send to `tutor.turn`.
 *
 * This union is the whole public surface since #57. There is no recitation
 * variant, here or on the server.
 */
type PublicTutorEvent =
  | { type: "intent"; intent: LearnerIntent }
  | { type: "timing"; timing: TutorTimingEvent };
