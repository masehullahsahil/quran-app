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
  /**
   * Begin the hands-free lesson: the `start` intent, awaited.
   *
   * Resolves once the server has answered *and* the answer has been stored,
   * so a caller that needs the lesson to have actually moved before doing
   * something else can order the two — the await is the barrier that keeps
   * the live stream from binding to the revision this intent replaces. The tutor
   * sessions live in the API instance's memory, so when that instance is
   * recycled between Study opening and Start being pressed, the `start`
   * intent lands somewhere the lesson never existed and comes back `lost`.
   * In that case the session is re-opened at the same position and the
   * intent is retried once, still within the one press. Only the final
   * outcome is stored: a `lost` the retry repairs never reaches the screen,
   * so the tutor panel does not flicker away and back mid-press. Resolves
   * null when the lesson could not begin at all.
   */
  startLesson: () => Promise<TutorHandoff | null>;
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

  /**
   * Send one event and return whatever the server answered, without storing
   * anything.
   *
   * `send` below is the storing variant. `startLesson` needs the raw answer
   * so a `lost` it is about to repair never touches the screen.
   */
  const sendRaw = useCallback(
    async (event: PublicTutorEvent): Promise<TutorHandoff | null> => {
      const session = sessionRef.current;
      if (!session || !advance?.mutateAsync) return null;
      const answer = await advance
        .mutateAsync({
          // Reference only. The lesson itself is the server's, and this is all
          // it will accept.
          session: { sessionId: session.sessionId, revision: session.revision },
          event,
        })
        // A failed turn is not a failed lesson: the caller decides what a
        // null answer means, and the last known state stands untouched.
        .catch(() => null);
      return answer;
    },
    [advance],
  );

  /**
   * Send one event and store whatever the server answers.
   *
   * Returns the promise rather than swallowing it, so a caller that needs to
   * wait can. `sendIntent` and `sendTiming` still ignore it, which is right for
   * every caller that only needs the lesson to move eventually.
   */
  const send = useCallback(
    (event: PublicTutorEvent): Promise<TutorHandoff | null> =>
      sendRaw(event).then((handoff) => {
        if (!handoff) return null;
        // Stored before the promise resolves, so anything awaiting this is
        // guaranteed to see the new revision rather than racing it.
        remember(handoff);
        return handoff;
      }),
    [sendRaw, remember],
  );

  const inputRef = useRef(input);
  inputRef.current = input;

  /**
   * Open a fresh session at the position the hook was given, replacing
   * whatever it held.
   *
   * The repair path for a server that no longer has the lesson. The key is
   * claimed *before* the first await: the open effect watches the same
   * guards, and a render landing between the guards being touched and the
   * new session being stored would otherwise open a second session behind
   * this call. The old turn stays on screen until the new one lands, so the
   * panel never flickers through an empty state mid-press.
   *
   * Resolves null when there is no lesson to open (Study not on screen) or
   * the server could not be reached; the claim is released then, so the open
   * effect may try again on a later render the way it already does when the
   * first open fails.
   */
  const reopenSession = useCallback(async (): Promise<LiveTutorSession | null> => {
    const current = inputRef.current;
    if (!current.enabled || !start?.mutateAsync) return null;
    const key = `${current.surah}:${current.ayah}:${current.learnerLanguage}`;
    lostFor.current = null;
    openedFor.current = key;
    sessionRef.current = null;
    try {
      const next = await start.mutateAsync({
        mode: "guided-recitation",
        surah: current.surah,
        ayah: current.ayah,
        totalAyahs: current.totalAyahs,
        learnerLanguage: current.learnerLanguage,
      });
      if (!next) {
        openedFor.current = null;
        return null;
      }
      sessionRef.current = next.session;
      setState({ turn: { session: next.session, action: next.action }, status: "updated" });
      return next.session;
    } catch {
      openedFor.current = null;
      return null;
    }
  }, [start]);

  /**
   * Begin the hands-free lesson, repairing a recycled server on the way.
   *
   * A `lost` (or missing) answer to the `start` intent is retried once
   * against a freshly re-opened session at the same position; anything else
   * is stored and returned as it arrived. Only the final outcome is
   * remembered, so a repaired `lost` never unmounts the tutor panel.
   */
  const startLesson = useCallback(async (): Promise<TutorHandoff | null> => {
    const event: PublicTutorEvent = { type: "intent", intent: "start" };
    const first = await sendRaw(event);
    if (first && first.status !== "lost") {
      remember(first);
      return first;
    }
    const session = await reopenSession();
    if (!session) {
      // Nothing to repair with. The loss is stored now, and the lesson ends
      // the way it always has when the tutor is unreachable.
      if (first) remember(first);
      return first;
    }
    const second = await sendRaw(event);
    if (second) remember(second);
    else if (first) remember(first);
    return second ?? first;
  }, [sendRaw, reopenSession, remember]);

  const session = state.turn?.session ?? null;
  return {
    turn: state.turn,
    status: state.status,
    active: state.turn !== null,
    reference: session ? { sessionId: session.sessionId, revision: session.revision } : null,
    sendIntent: useCallback((intent: LearnerIntent) => { void send({ type: "intent", intent }); }, [send]),
    startLesson,
    sendTiming: useCallback((timing: TutorTimingEvent) => { void send({ type: "timing", timing }); }, [send]),
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
