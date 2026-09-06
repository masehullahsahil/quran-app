/**
 * The teacher labeling prototype.
 *
 * A working sketch of the review surface described in
 * docs/pronunciation-dataset-spec.md: expected ayah, alignment timings, an
 * observation attached to an exact word or letter, a classification, notes,
 * uncertainty, an independent submission, and an adjudication view for
 * disagreements.
 *
 * What it deliberately is not: a recording platform. It collects no audio,
 * uploads nothing, and stores no learner voice. The samples listed are synthetic
 * fixtures with no audio behind them; a reviewer who has an authorised recording
 * on their own machine can open it locally to play alongside, and that file
 * never leaves the browser tab.
 *
 * Nothing here evaluates pronunciation or displays a model's opinion as a fact.
 * Where a machine prediction exists on a fixture it is shown in its own panel,
 * marked as a prediction, and it is never pre-filled into the reviewer's form —
 * a labeling tool that suggests the model's answer produces labels that agree
 * with the model.
 */
// See CurriculumAudit.tsx: the default React import is what lets this page be
// rendered in a test under the classic JSX transform.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Download, Upload } from "lucide-react";
import {
  LABEL_DEFINITIONS,
  OBSERVATION_CONFIDENCE,
  PRONUNCIATION_LABELS,
  RECORDING_QUALITY,
  SEVERITY_DEFINITIONS,
  SEVERITY_LEVELS,
  SEVERITY_STATUS,
  TAXONOMY_COMPLETENESS_NOTE,
  TAXONOMY_STATUS,
  adjudicate,
  addReview,
  disagreements,
  groundTruthFor,
  mayDriveLearnerFacingCorrection,
  workflowState,
  LabelingError,
  type LabeledSample,
  type LabelObservation,
  type ObservationConfidence,
  type PronunciationLabel,
  type RecordingQuality,
  type SeverityLevel,
  type TeacherReviewer,
} from "@shared/pronunciationDataset";
import { FIXTURE_NOTICE, FIXTURE_SAMPLES } from "@shared/pronunciationDatasetFixtures";
import {
  adjudicationForSample,
  mergeSessions,
  parseSession,
  readReviewerIdentity,
  readSession,
  reviewsForSample,
  serializeSession,
  writeReviewerIdentity,
  writeSession,
  type LabelingSession,
} from "@/lib/pronunciationLabelStore";

const WORKFLOW_LABELS: Record<string, string> = {
  pending: "Pending review",
  "independently-reviewed": "Independently reviewed",
  disagreement: "Disagreement",
  "adjudication-required": "Adjudication required",
  adjudicated: "Adjudicated",
};

type DraftObservation = {
  label: PronunciationLabel;
  severity: SeverityLevel;
  confidence: ObservationConfidence;
  wordIndex: number | null;
  letterIndex: number | null;
  startMs: string;
  endMs: string;
  note: string;
};

function emptyObservation(): DraftObservation {
  return {
    label: "word-omission",
    severity: "meaningful",
    confidence: "confident",
    wordIndex: null,
    letterIndex: null,
    startMs: "",
    endMs: "",
    note: "",
  };
}

/** Splits the expected ayah into words for word-level selection. */
function expectedWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Splits one word into letters, so a letter-scope label can name an index. */
function lettersOf(word: string): string[] {
  return Array.from(word);
}

export default function PronunciationLabeling() {
  const samples = FIXTURE_SAMPLES;
  const [session, setSession] = useState<LabelingSession>({ reviews: [], adjudications: [] });
  const [reviewer, setReviewer] = useState<TeacherReviewer>({ reviewerId: "", qualification: "" });
  const [sampleIndex, setSampleIndex] = useState(0);
  const [draft, setDraft] = useState<DraftObservation>(emptyObservation());
  const [pending, setPending] = useState<LabelObservation[]>([]);
  const [overallLabel, setOverallLabel] = useState<PronunciationLabel>("correct-recitation");
  const [quality, setQuality] = useState<RecordingQuality>("clean");
  const [uncertain, setUncertain] = useState(false);
  const [heardText, setHeardText] = useState("");
  const [notes, setNotes] = useState("");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSession(readSession());
    setReviewer(readReviewerIdentity());
  }, []);

  const fixture = samples[sampleIndex];

  /** The fixture's own reviews, plus anything this reviewer has recorded. */
  const labeled: LabeledSample = useMemo(() => {
    const recorded = reviewsForSample(session, fixture.sample.sampleId);
    const adjudication = adjudicationForSample(session, fixture.sample.sampleId) ?? fixture.adjudication;
    return { ...fixture, reviews: [...fixture.reviews, ...recorded], adjudication };
  }, [fixture, session]);

  const words = useMemo(() => expectedWords(fixture.sample.expectedText), [fixture.sample.expectedText]);
  const state = workflowState(labeled);
  const truth = groundTruthFor(labeled);
  const conflicts = disagreements(labeled.reviews);
  const timings = labeled.machine.alignment?.wordTimings ?? [];

  function persist(next: LabelingSession) {
    setSession(next);
    writeSession(next);
  }

  function updateReviewer(next: TeacherReviewer) {
    setReviewer(next);
    writeReviewerIdentity(next);
  }

  function addObservation() {
    const definition = LABEL_DEFINITIONS[draft.label];
    const timeRange =
      draft.startMs !== "" && draft.endMs !== ""
        ? { startMs: Number(draft.startMs), endMs: Number(draft.endMs) }
        : undefined;

    let location: LabelObservation["location"];
    if (draft.wordIndex !== null && draft.letterIndex !== null && definition.scopes.includes("letter")) {
      location = {
        scope: "letter",
        surah: fixture.sample.surah,
        ayah: fixture.sample.ayah,
        wordIndex: draft.wordIndex,
        letterIndex: draft.letterIndex,
        grapheme: lettersOf(words[draft.wordIndex - 1] ?? "")[draft.letterIndex - 1],
        ...(timeRange ? { timeRange } : {}),
      };
    } else if (draft.wordIndex !== null && definition.scopes.includes("word")) {
      location = {
        scope: "word",
        surah: fixture.sample.surah,
        ayah: fixture.sample.ayah,
        wordIndex: draft.wordIndex,
        ...(timeRange ? { timeRange } : {}),
      };
    } else if (timeRange && definition.scopes.includes("time-range")) {
      location = { scope: "time-range", timeRange };
    } else if (definition.scopes.includes("recording")) {
      location = { scope: "recording", ...(timeRange ? { timeRange } : {}) };
    } else {
      setError(`${definition.title} needs a word${definition.scopes.includes("letter") ? " or letter" : ""} selected.`);
      return;
    }

    setPending((current) => [
      ...current,
      {
        id: `obs-${Date.now()}-${current.length + 1}`,
        label: draft.label,
        location,
        severity: draft.severity,
        confidence: draft.confidence,
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      },
    ]);
    setDraft({ ...emptyObservation(), wordIndex: draft.wordIndex });
    setError(null);
  }

  function submitReview() {
    try {
      const next = addReview(labeled, {
        reviewId: `review-${reviewer.reviewerId || "anonymous"}-${Date.now()}`,
        sampleId: fixture.sample.sampleId,
        reviewer,
        reviewedAt: new Date().toISOString(),
        overallLabel,
        observations: pending,
        quality,
        uncertain,
        ...(heardText.trim() ? { correction: { heardText: heardText.trim() } } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      const recorded = next.reviews[next.reviews.length - 1];
      persist({ ...session, reviews: [...session.reviews, recorded] });
      setPending([]);
      setHeardText("");
      setNotes("");
      setUncertain(false);
      setError(null);
    } catch (cause) {
      setError(cause instanceof LabelingError ? cause.message : "This review could not be recorded.");
    }
  }

  function submitAdjudication() {
    try {
      const next = adjudicate(labeled, {
        sampleId: fixture.sample.sampleId,
        adjudicator: reviewer,
        adjudicatedAt: new Date().toISOString(),
        consideredReviewIds: labeled.reviews.map((review) => review.reviewId),
        overallLabel,
        observations: pending,
        rationale,
      });
      persist({ ...session, adjudications: [...session.adjudications, next.adjudication!] });
      setPending([]);
      setRationale("");
      setError(null);
    } catch (cause) {
      setError(cause instanceof LabelingError ? cause.message : "This adjudication could not be recorded.");
    }
  }

  function exportSession() {
    const blob = new Blob([serializeSession(session)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pronunciation-labels-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importSession(file: File) {
    persist(mergeSessions(session, parseSession(await file.text())));
  }

  return (
    <main className="label-page">
      <header className="label-header">
        <div>
          <p className="label-eyebrow">Pronunciation dataset · teacher labeling prototype</p>
          <h1>Label a recitation sample</h1>
          <p className="label-statement">
            <AlertCircle size={15} aria-hidden="true" /> {FIXTURE_NOTICE}
          </p>
          <p className="label-note">
            Label taxonomy status: <strong>{TAXONOMY_STATUS}</strong>. {TAXONOMY_COMPLETENESS_NOTE}
          </p>
          <p className="label-note">
            Severity taxonomy status: <strong>{SEVERITY_STATUS}</strong>. It may not drive learner-facing correction
            behaviour: {String(mayDriveLearnerFacingCorrection([]))}.
          </p>
        </div>
        <div className="label-actions">
          <button type="button" onClick={exportSession}>
            <Download size={15} aria-hidden="true" /> Export labels
          </button>
          <button type="button" onClick={() => importInput.current?.click()}>
            <Upload size={15} aria-hidden="true" /> Import labels
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importSession(file);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <section className="label-reviewer" aria-label="Reviewer">
        <h2>Reviewer</h2>
        <p>Recorded on every review you submit. A review without a qualification is refused.</p>
        <div className="label-reviewer-fields">
          <label>
            <span>Reviewer ID</span>
            <input
              value={reviewer.reviewerId}
              placeholder="e.g. reviewer-004 — never a learner's name"
              onChange={(event) => updateReviewer({ ...reviewer, reviewerId: event.target.value })}
            />
          </label>
          <label>
            <span>Qualification</span>
            <input
              value={reviewer.qualification}
              placeholder="Required"
              onChange={(event) => updateReviewer({ ...reviewer, qualification: event.target.value })}
            />
          </label>
          <label>
            <span>Riwayah</span>
            <input
              value={reviewer.riwayah ?? ""}
              placeholder="The reading you review against"
              onChange={(event) => updateReviewer({ ...reviewer, riwayah: event.target.value })}
            />
          </label>
        </div>
      </section>

      <nav className="label-sample-rail" aria-label="Samples">
        {samples.map((entry, index) => (
          <button
            key={entry.sample.sampleId}
            type="button"
            className={index === sampleIndex ? "is-current" : ""}
            onClick={() => {
              setSampleIndex(index);
              setPending([]);
              setError(null);
            }}
          >
            <b>{entry.sample.surah}:{entry.sample.ayah}</b>
            <span>{entry.sample.sampleId}</span>
            <small>{WORKFLOW_LABELS[workflowState(entry)]}</small>
          </button>
        ))}
      </nav>

      <section className="label-sample" aria-label="Sample under review">
        <div className="label-sample-head">
          <div>
            <p className="label-eyebrow">
              Surah {fixture.sample.surah}, ayah {fixture.sample.ayah} · {fixture.sample.sampleId}
            </p>
            <p className="label-expected" lang="ar" dir="rtl">
              {fixture.sample.expectedText}
            </p>
            <p className="label-note">
              Expected text from the app's Quran data. Labeling never edits it — a correction records what was
              <em> recited</em>, not a different scripture text.
            </p>
          </div>
          <dl className="label-meta">
            <div>
              <dt>Workflow</dt>
              <dd>{WORKFLOW_LABELS[state]}</dd>
            </div>
            <div>
              <dt>Ground truth</dt>
              <dd>{truth.source === "none" ? "none yet" : `${truth.source}: ${truth.overallLabel}`}</dd>
            </div>
            <div>
              <dt>Speaker</dt>
              <dd>{fixture.sample.speakerAnonymizedId}</dd>
            </div>
            <div>
              <dt>Device</dt>
              <dd>
                {fixture.sample.device.deviceClass} · {fixture.sample.device.sampleRateHz} Hz ·{" "}
                {fixture.sample.device.codec}
              </dd>
            </div>
            <div>
              <dt>Consent</dt>
              <dd>{fixture.sample.consent.permittedUses.join(", ")}</dd>
            </div>
          </dl>
        </div>

        <div className="label-audio">
          <p>
            No audio is bundled with this prototype. To listen, open an authorised recording from your own machine — it
            is played locally and never uploaded, stored or attached to the labels you record.
          </p>
          <button type="button" onClick={() => audioInput.current?.click()}>
            Open a local recording
          </button>
          <input
            ref={audioInput}
            type="file"
            accept="audio/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              setLocalAudioUrl(file ? URL.createObjectURL(file) : null);
            }}
          />
          {localAudioUrl && <audio controls src={localAudioUrl} />}
        </div>

        {timings.length > 0 && (
          <div className="label-timeline" aria-label="Alignment timings">
            <h3>Alignment (machine) — timings only, not a judgement</h3>
            <ol>
              {timings.map((timing) => (
                <li key={timing.wordIndex}>
                  <span lang="ar" dir="rtl">
                    {words[timing.wordIndex - 1]}
                  </span>
                  <small>
                    word {timing.wordIndex} · {timing.startMs}–{timing.endMs} ms
                    {typeof timing.confidence === "number" ? ` · aligner confidence ${timing.confidence}` : ""}
                  </small>
                </li>
              ))}
            </ol>
          </div>
        )}

        {labeled.machine.prediction && (
          <div className="label-prediction">
            <h3>Machine prediction — not ground truth, never pre-filled</h3>
            <p>
              {labeled.machine.prediction.provider} {labeled.machine.prediction.modelVersion}:{" "}
              {labeled.machine.prediction.abstained
                ? "abstained"
                : labeled.machine.prediction.observations.map((observation) => observation.label).join(", ")}
            </p>
          </div>
        )}

        <div className="label-words" aria-label="Expected words">
          {words.map((word, index) => {
            const wordIndex = index + 1;
            const selected = draft.wordIndex === wordIndex;
            return (
              <div key={`${word}-${wordIndex}`} className={selected ? "label-word is-selected" : "label-word"}>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, wordIndex: selected ? null : wordIndex, letterIndex: null })}
                >
                  <span lang="ar" dir="rtl">
                    {word}
                  </span>
                  <small>word {wordIndex}</small>
                </button>
                {selected && (
                  <div className="label-letters">
                    {lettersOf(word).map((letter, letterPosition) => {
                      const letterIndex = letterPosition + 1;
                      return (
                        <button
                          key={`${letter}-${letterIndex}`}
                          type="button"
                          className={draft.letterIndex === letterIndex ? "is-selected" : ""}
                          onClick={() =>
                            setDraft({ ...draft, letterIndex: draft.letterIndex === letterIndex ? null : letterIndex })
                          }
                        >
                          <span lang="ar" dir="rtl">
                            {letter}
                          </span>
                          <small>{letterIndex}</small>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <form
          className="label-observation-form"
          onSubmit={(event) => {
            event.preventDefault();
            addObservation();
          }}
        >
          <h3>Add an observation</h3>
          <p className="label-note">
            More than one observation may sit on the same word or segment — record each thing you heard rather than
            choosing between them.
          </p>
          <div className="label-form-row">
            <label>
              <span>Label</span>
              <select
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value as PronunciationLabel })}
              >
                {PRONUNCIATION_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {LABEL_DEFINITIONS[label].title}
                    {LABEL_DEFINITIONS[label].requiresQualifiedTeacher ? " (qualified teacher)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Severity (proposed taxonomy)</span>
              <select
                value={draft.severity}
                onChange={(event) => setDraft({ ...draft, severity: event.target.value as SeverityLevel })}
              >
                {SEVERITY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Your confidence</span>
              <select
                value={draft.confidence}
                onChange={(event) => setDraft({ ...draft, confidence: event.target.value as ObservationConfidence })}
              >
                {OBSERVATION_CONFIDENCE.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Start (ms)</span>
              <input
                inputMode="numeric"
                value={draft.startMs}
                onChange={(event) => setDraft({ ...draft, startMs: event.target.value })}
              />
            </label>
            <label>
              <span>End (ms)</span>
              <input
                inputMode="numeric"
                value={draft.endMs}
                onChange={(event) => setDraft({ ...draft, endMs: event.target.value })}
              />
            </label>
          </div>
          <p className="label-definition">{LABEL_DEFINITIONS[draft.label].summary}</p>
          {LABEL_DEFINITIONS[draft.label].openQuestion && (
            <p className="label-open-question">
              Open question for a Qari: {LABEL_DEFINITIONS[draft.label].openQuestion}
            </p>
          )}
          <label className="label-field">
            <span>Note</span>
            <textarea rows={2} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
          </label>
          <div className="label-form-actions">
            <button type="submit">Add observation</button>
            <span className="label-selection">
              {draft.wordIndex ? `word ${draft.wordIndex}` : "no word selected"}
              {draft.letterIndex ? ` · letter ${draft.letterIndex}` : ""}
            </span>
          </div>
        </form>

        {pending.length > 0 && (
          <ul className="label-pending" aria-label="Observations in this review">
            {pending.map((observation) => (
              <li key={observation.id}>
                <strong>{LABEL_DEFINITIONS[observation.label].title}</strong> · {observation.location.scope}
                {"wordIndex" in observation.location ? ` ${observation.location.wordIndex}` : ""}
                {"letterIndex" in observation.location ? `/${observation.location.letterIndex}` : ""} ·{" "}
                {observation.severity} · {observation.confidence}
                {observation.note ? ` · ${observation.note}` : ""}
                <button type="button" onClick={() => setPending(pending.filter((entry) => entry.id !== observation.id))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="label-submit-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitReview();
          }}
        >
          <h3>Submit your independent review</h3>
          <p className="label-note">
            Submitted on its own. Other reviewers' labels are not shown before you submit, and yours are never merged
            into theirs.
          </p>
          <div className="label-form-row">
            <label>
              <span>Overall label</span>
              <select
                value={overallLabel}
                onChange={(event) => setOverallLabel(event.target.value as PronunciationLabel)}
              >
                {PRONUNCIATION_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {LABEL_DEFINITIONS[label].title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Recording quality</span>
              <select value={quality} onChange={(event) => setQuality(event.target.value as RecordingQuality)}>
                {RECORDING_QUALITY.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            <label className="label-checkbox">
              <input type="checkbox" checked={uncertain} onChange={(event) => setUncertain(event.target.checked)} />
              <span>I could not reach a judgement (stays uncertain)</span>
            </label>
          </div>
          <label className="label-field">
            <span>What you heard, where it differs from the expected text</span>
            <textarea rows={2} value={heardText} onChange={(event) => setHeardText(event.target.value)} />
          </label>
          <label className="label-field">
            <span>Notes</span>
            <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {error && <p className="label-error">{error}</p>}
          <button type="submit">
            <Check size={15} aria-hidden="true" /> Submit independent review
          </button>
        </form>

        <section className="label-reviews" aria-label="Reviews recorded">
          <h3>Reviews recorded ({labeled.reviews.length})</h3>
          {labeled.reviews.length === 0 && <p className="label-note">None yet.</p>}
          {labeled.reviews.map((review) => (
            <article key={review.reviewId}>
              <p>
                <strong>{review.reviewer.reviewerId}</strong> — {review.reviewer.qualification}
                {review.reviewer.riwayah ? ` · ${review.reviewer.riwayah}` : ""} · {review.reviewedAt.slice(0, 10)}
              </p>
              <p>
                {LABEL_DEFINITIONS[review.overallLabel].title} · {review.quality}
                {review.uncertain ? " · marked uncertain" : ""}
              </p>
              {review.observations.map((observation) => (
                <p key={observation.id} className="label-note">
                  {LABEL_DEFINITIONS[observation.label].title} at {observation.location.scope}
                  {"wordIndex" in observation.location ? ` ${observation.location.wordIndex}` : ""} ·{" "}
                  {observation.severity}
                </p>
              ))}
            </article>
          ))}
        </section>

        {conflicts.length > 0 && (
          <section className="label-adjudication" aria-label="Adjudication">
            <h3>Disagreement — adjudication required</h3>
            <p className="label-note">
              Reviews are kept exactly as written. An adjudicator records a final label with a rationale; nothing is
              averaged, voted on, or resolved by seniority.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Where</th>
                  {labeled.reviews.map((review) => (
                    <th key={review.reviewId}>{review.reviewer.reviewerId}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conflicts.map((conflict) => (
                  <tr key={`${conflict.kind}-${conflict.where}`}>
                    <td>{conflict.where}</td>
                    {labeled.reviews.map((review) => (
                      <td key={review.reviewId}>{conflict.positions[review.reviewer.reviewerId] ?? "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitAdjudication();
              }}
            >
              <label className="label-field">
                <span>Rationale — required, in your own words</span>
                <textarea rows={3} value={rationale} onChange={(event) => setRationale(event.target.value)} />
              </label>
              <p className="label-note">
                The adjudicated label is the overall label selected above, with the observations you added. Uncertain
                remains a valid outcome.
              </p>
              <button type="submit">Record adjudication</button>
            </form>
          </section>
        )}

        <section className="label-severity" aria-label="Severity taxonomy">
          <h3>Severity taxonomy — proposed, not approved</h3>
          <dl>
            {SEVERITY_LEVELS.map((level) => (
              <div key={level}>
                <dt>{level}</dt>
                <dd>{SEVERITY_DEFINITIONS[level]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </section>
    </main>
  );
}
