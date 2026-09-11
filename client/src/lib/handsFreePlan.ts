/**
 * What the app does, by itself, in answer to one tutor turn.
 *
 * The hands-free lesson replaces a row of buttons with a sequence: the teacher
 * says a sentence, a trusted recording plays, the teacher says another
 * sentence, and the microphone re-opens in the scope the lesson asked for. This
 * file turns *the server's own action* into that sequence and nothing else.
 *
 * **It decides nothing about the recitation.** It reads `action.kind` and
 * `action.reason` — both produced by the tutor engine — and the session's phase.
 * It never reads a transcript, never compares words, never forms a view about
 * whether the learner was right. If the engine says `play-target-word`, the
 * word plays; if it says nothing of the kind, no word plays. A plan is an
 * answer to authority, not an opinion about audio.
 *
 * ## The Quran boundary, structurally
 *
 * A plan step is one of three things: a coaching sentence named by a locale
 * key, a trusted word recording, or a trusted ayah recording. Quranic Arabic
 * can only ever reach the learner through the second and third, which are files
 * recorded by a reciter. A coaching step carries a *key*, never text, and the
 * keys are drawn from a closed list that excludes every sentence containing a
 * Quran word (`tutor.hintGiven` is "Start from {word}." and is therefore
 * display-only). There is no path through this file by which a speech
 * synthesiser is handed Quranic Arabic, because there is no step type that
 * could carry it.
 *
 * That is why the correction reads as three steps rather than one sentence:
 *
 *     coach   "You missed one word. Listen."      spoken
 *     qari     رَبِّ                                trusted recording
 *     coach   "Now you say it."                    spoken
 *
 * and never as one synthesised sentence with the word inside it.
 */
import type { LiveTutorSession, TutorAction } from "@shared/liveTutor";
import type { LiveListeningDirective } from "@shared/liveRecitation";
import type { StringKey } from "@locales/index";

/** Which recording the microphone should collect when it re-opens. */
export type HandsFreeScope = "word" | "ayah";

/**
 * A sentence the teacher says.
 *
 * `speak` is false where the sentence contains Quran text. Those are shown and
 * not spoken — the alternative would be a general-purpose voice reading
 * scripture, which this repository does not do under any circumstances.
 */
export type CoachStep = { kind: "coach"; messageKey: StringKey; speak: boolean };
/** The trusted recording of the word the engine is holding. Never synthesised. */
export type WordStep = { kind: "qari-word" };
/** The selected reciter's ayah. Never synthesised. */
export type AyahStep = { kind: "qari-ayah" };

export type HandsFreeStep = CoachStep | WordStep | AyahStep;

export type HandsFreePlan = {
  /**
   * A stable identity for this plan.
   *
   * Built from the session revision, so the same turn cannot be performed
   * twice — a re-render, a retry, or a duplicate handoff all produce the same
   * key and the orchestrator skips it.
   */
  key: string;
  steps: HandsFreeStep[];
  /**
   * The scope to re-open the microphone in once the steps are done, or null
   * when the lesson is not waiting on the learner (paused, stopped, finished,
   * or lost).
   */
  resume: HandsFreeScope | null;
  /**
   * Whether the lesson is over as far as automatic progression goes.
   *
   * True for a stopped, completed or lost session. The learner is not
   * abandoned — the UI offers a way back — but nothing happens on its own.
   */
  terminal: boolean;
};

/**
 * The sentences that may be spoken aloud, and the ones that must not be.
 *
 * Both lists live in `@shared/coachSpeech` now: the future neural endpoint
 * resolves keys server-side and needs the same allowlist the client speaks
 * from. Re-exported here so existing imports keep working.
 */
export { SPEAKABLE_COACH_KEYS, DISPLAY_ONLY_COACH_KEYS, isSpeakableCoachKey } from "@shared/coachSpeech";
import { DISPLAY_ONLY_COACH_KEYS as DISPLAY_ONLY_KEYS } from "@shared/coachSpeech";

function coach(messageKey: StringKey): CoachStep {
  return { kind: "coach", messageKey, speak: !DISPLAY_ONLY_KEYS.includes(messageKey) };
}

export type HandsFreePlanInput = {
  session: LiveTutorSession;
  action: TutorAction;
  /** Whether #51 found a trusted recording of the word the engine is holding. */
  canPlayWord: boolean;
  /** Whether the selected reciter's ayah can be played. */
  canPlayAyah: boolean;
  /**
   * Whether the lesson and the screen are on the same ayah.
   *
   * The same guard the panel has (#50): while the tutor has moved and the page
   * has not yet followed, a word step would play the previous ayah's word over
   * this one. In that gap the plan says nothing and only resumes listening.
   */
  onScreen: boolean;
};

/**
 * The scope the microphone re-opens in, from the engine's phase.
 *
 * The same rule `attemptScopeFor` uses for the manual path, and for the same
 * reason (#53): a recording of one word run through the whole-ayah reviewer
 * answers a question the learner was not asked. A guess about what the learner
 * "probably meant" is never consulted.
 *
 * Since #61 this is the *fallback*. The engine now states the capture policy
 * outright — see `scopeForDirective` — and a statement outranks a derivation.
 */
export function handsFreeScopeFor(session: LiveTutorSession): HandsFreeScope {
  return session.phase === "correcting-word" ? "word" : "ayah";
}

/**
 * The scope the server named, or null where it named something that is not
 * listening at all.
 *
 * `nextChannel` arrived with Codex's continuous contract and exists precisely
 * so the browser does not have to infer capture policy from a phase. Where it
 * names a listening directive, that is the answer. Where it names playback, an
 * interruption, or a wait, the plan's own steps decide what happens next and
 * this returns null.
 *
 * It is not merely conformance: `hold-uncertain` while a correction is open is
 * a word turn, and the phase there is `waiting`, which the fallback reads as an
 * ayah. The server knows better because it is holding the correction.
 */
export function scopeForDirective(directive: LiveListeningDirective): HandsFreeScope | null {
  switch (directive) {
    case "listen-for-target-word":
      return "word";
    case "listen-for-full-ayah":
    case "listen-next-ayah":
    case "keep-listening":
      return "ayah";
    // Playback owns the turn, the learner is being interrupted, the lesson is
    // waiting, or it is over. None of these is a scope.
    case "play-target-word":
    case "interrupt-learner":
    case "wait":
    case "do-not-listen":
      return null;
  }
}

/** Whether the server has said not to listen at all. */
export function directiveEndsListening(directive: LiveListeningDirective): boolean {
  return directive === "do-not-listen";
}

/**
 * The plan for one trusted turn.
 *
 * The switch is over `action.kind`, which is the engine's vocabulary. Every
 * branch is a translation of one of its statements into audio and a scope; none
 * of them adds a conclusion the engine did not reach.
 */
export function handsFreePlanFor(input: HandsFreePlanInput): HandsFreePlan {
  const { session, action } = input;
  const key = `${session.sessionId}#${session.revision}`;
  // The server's own statement first, the phase only where it made none.
  const scope = scopeForDirective(action.nextChannel) ?? handsFreeScopeFor(session);
  const steps: HandsFreeStep[] = [];

  const terminalPlan = (extra: HandsFreeStep[] = []): HandsFreePlan => ({
    key, steps: extra, resume: null, terminal: true,
  });

  switch (action.kind) {
    // The lesson is over, one way or another. Nothing resumes on its own.
    case "end-session":
      return terminalPlan();
    case "complete-session":
      return terminalPlan([coach("tutor.finished")]);
    case "pause-session":
      return { key, steps: [coach("tutor.paused")], resume: null, terminal: false };
    // The server does not have this lesson any more. Saying anything about a
    // correction here would be inventing one (#20 in the brief): the session is
    // gone, so the plan is empty and the UI asks to reconnect.
    case "refresh-session":
      return terminalPlan();

    // The correction, in full. This is the sequence the whole feature is for.
    case "play-target-word": {
      if (!input.onScreen) return { key, steps: [], resume: scope, terminal: false };
      steps.push(coach("tutor.wordMissed"));
      if (input.canPlayWord) {
        steps.push({ kind: "qari-word" });
      } else if (input.canPlayAyah) {
        // No trusted recording of the word. The ayah, honestly — never a
        // synthesised stand-in for Quranic Arabic.
        steps.push({ kind: "qari-ayah" });
      }
      steps.push(coach("handsfree.nowYouSayIt"));
      // The directive here is `play-target-word`, which names playback rather
      // than a scope. What follows the recording is the word, every time — the
      // engine's own next turn says `listen-for-target-word`.
      return { key, steps, resume: "word", terminal: false };
    }

    // "Say the word" without a fresh recording of it — the engine has already
    // played it, or the learner missed on the word itself.
    case "ask-target-word":
      if (!input.onScreen) return { key, steps: [], resume: scope, terminal: false };
      return { key, steps: [coach("handsfree.nowYouSayIt")], resume: scope, terminal: false };

    // The other half of a correction. When the engine is *announcing* that it
    // heard the word, the teacher says so first and then asks — two sentences,
    // the way a teacher speaks, rather than one that does both.
    case "ask-full-ayah": {
      if (action.reason === "target-recognised") steps.push(coach("tutor.wordRecognised"));
      steps.push(coach("tutor.reciteFullAyah"));
      return { key, steps, resume: scope, terminal: false };
    }

    // The ayah went through and the lesson has moved. One short sentence, then
    // listening continues on the new ayah.
    case "continue-recitation":
      return {
        key,
        steps: action.reason === "ayah-completed" ? [coach("handsfree.goodContinue")] : [],
        resume: scope,
        terminal: false,
      };

    case "play-current-ayah":
      return { key, steps: input.canPlayAyah ? [{ kind: "qari-ayah" }] : [], resume: scope, terminal: false };

    // The teacher could not tell. No claim about the recitation is made, and
    // the learner is asked again rather than corrected. While the learner
    // still owes the full ayah after a correction, the uncertainty alone
    // would leave them guessing what to do next — so the pending instruction
    // is restated. Explanatory speech only, never Quran audio.
    case "hold-uncertain": {
      steps.push(coach("tutor.uncertain"));
      if (session.activeCorrection?.stage === "recite-ayah") steps.push(coach("tutor.reciteFullAyah"));
      return { key, steps, resume: scope, terminal: false };
    }

    case "offer-hint":
      return { key, steps: [coach("tutor.offerHint")], resume: scope, terminal: false };

    // A hint names a Quran word, so it is shown and not spoken. The trusted
    // recording is what the learner hears, when the engine asked for one.
    case "show-hint": {
      const wantsWordAudio = action.hint?.kind === "trusted-word-audio" && input.canPlayWord && input.onScreen;
      const wantsAyahAudio = action.hint?.kind === "trusted-ayah-audio" && input.canPlayAyah;
      steps.push(coach("tutor.hintGiven"));
      if (wantsWordAudio) steps.push({ kind: "qari-word" });
      else if (wantsAyahAudio) steps.push({ kind: "qari-ayah" });
      return { key, steps, resume: scope, terminal: false };
    }

    // The engine is repeating itself at the learner's request. What it repeats
    // is its own last action, so the plan is built from that and never from a
    // memory of what this file did last time.
    case "repeat-current-instruction": {
      const repeat = action.repeatAction;
      if (!repeat || repeat === "repeat-current-instruction") {
        return { key, steps: [], resume: scope, terminal: false };
      }
      const inner = handsFreePlanFor({ ...input, action: { ...action, kind: repeat, repeatAction: null } });
      return { ...inner, key };
    }

    case "resume-session": {
      steps.push(coach("handsfree.carryOn"));
      // A resume in the middle of a correction restates what is pending: the
      // bare "carrying on" alone left learners thinking the correction was
      // finished. Explanatory speech only, never Quran audio.
      if (session.activeCorrection?.stage === "recite-ayah") steps.push(coach("tutor.reciteFullAyah"));
      else if (session.activeCorrection) steps.push(coach("handsfree.nowYouSayIt"));
      return { key, steps, resume: scope, terminal: false };
    }

    // Ordinary listening. The teacher is quiet; that is the point.
    case "listen":
    case "wait":
      return { key, steps: [], resume: scope, terminal: false };
  }
}

/**
 * Whether a plan asks the app to make any sound at all.
 *
 * Used to keep the microphone open across a turn that says nothing: an
 * `ayah-strong` continuation mid-surah should not close and re-open the
 * microphone for no reason.
 */
export function planIsSilent(plan: HandsFreePlan): boolean {
  return plan.steps.length === 0;
}

/**
 * The pacing of the hands-free lesson.
 *
 * In one place for the same reason the VAD thresholds are: a hands-free lesson
 * is made of timings, and a timing invented at its call site is a timing nobody
 * can find again.
 */
export const HANDS_FREE_TIMING = {
  /**
   * How long an unspoken coaching sentence stays before the sequence moves on.
   *
   * Only used where the platform had no voice for the learner's language, so
   * the sentence is read rather than heard. Long enough for a short sentence in
   * a second language at arm's length.
   */
  coachDisplayMs: 1400,
  /**
   * The beat between the teacher finishing and the microphone re-opening.
   *
   * Without it the learner is cut off by their own turn starting on the last
   * syllable of "Now you say it."
   */
  resumeDelayMs: 350,
  /** How long a trusted recording may take to start before it is given up on. */
  playbackTimeoutMs: 8_000,
  /**
   * How often rolling audio is cut and sent while the learner is still
   * reciting.
   *
   * This is what makes mid-ayah detection possible at all: the server's
   * omission rule needs ordered audio *during* the recitation, not a finished
   * recording. Shorter means the teacher can interrupt sooner; it also means
   * more transcription requests for the same ayah, and each open chunk is a
   * whole transcription in v1 rather than a streaming connection. 1.4 seconds
   * is roughly a short phrase, which is the smallest unit the alignment can say
   * anything stable about.
   */
  interimChunkMs: 1_400,
  /**
   * How long to wait for the recorder's last `dataavailable` after `stop()`.
   *
   * `MediaRecorder.stop()` delivers one final blob with everything captured
   * since the last slice, and only then fires `onstop`. Assembling before that
   * arrives drops the tail of the turn — the final consonant of an ayah, or
   * most of a one-word answer. So a submitted turn waits, and this is the cap
   * in case a recorder never reports.
   */
  recorderFlushMs: 1_500,
} as const;
