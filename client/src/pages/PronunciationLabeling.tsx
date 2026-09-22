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

// ---------------------------------------------------------------------------
// Benchmark readiness: the simple teacher-labeling workflow for the controlled
// acoustic shadow benchmark.
// ---------------------------------------------------------------------------
// The full prototype below explores a 21-label taxonomy against synthetic
// fixtures. The controlled benchmark needs something smaller and harder: one
// independent judgement per consented recording — the sample ID, the surah and
// ayah, the teacher's own label (correct / known pronunciation issue /
// insufficient evidence), an optional issue scope (word or phoneme), reviewer
// notes, and an explicit consent/retention confirmation.
//
// This workflow is a labeling tool only. It evaluates nothing: it does not
// judge pronunciation, it does not measure model accuracy, and it shows no
// model output. A shadow-evaluator abstention is not evidence that a recitation
// was correct or incorrect — successful shadow responses that abstained safely
// are not accuracy evidence. Accuracy can only be measured later, against
// adjudicated teacher labels, under the protocol in
// docs/quran-acoustic-benchmark-protocol.md.
//
// No audio is collected here. A reviewer opens a consented recording from their
// own machine to listen alongside; it plays locally, is never uploaded, never
// stored, and never attached to the labels recorded.

/** localStorage key for recorded benchmark reviews. Labels only, never audio. */
export const BENCHMARK_SESSION_KEY = "miqra-benchmark-labels";

export type BenchmarkTeacherLabel = "correct" | "issue" | "insufficient";

export type BenchmarkIssueScope = "word" | "phoneme";

export const BENCHMARK_TEACHER_LABELS: readonly BenchmarkTeacherLabel[] = ["correct", "issue", "insufficient"];

export const BENCHMARK_LABEL_TITLES: Record<BenchmarkTeacherLabel, string> = {
  correct: "Correct — no pronunciation issue heard",
  issue: "Known pronunciation issue — heard and located below",
  insufficient: "Insufficient evidence — could not reach a judgement",
};

export const BENCHMARK_LABEL_SUMMARIES: Record<BenchmarkTeacherLabel, string> = {
  correct:
    "The teacher heard no pronunciation issue in the recitation. This is the teacher's own judgement, not a claim that the recitation is perfect.",
  issue:
    "The teacher heard a specific pronunciation issue and can say roughly where. Optionally name the scope: a word (by word index) or a phoneme (described in words).",
  insufficient:
    "Audio quality, scope, or reviewer confidence was insufficient to judge. A first-class outcome: it is never scored as correct and never as an error.",
};

export type BenchmarkReview = {
  reviewId: string;
  sampleId: string;
  surah: number;
  ayah: number;
  label: BenchmarkTeacherLabel;
  /** Optional. Present only when the teacher chose to locate the issue. */
  scope: BenchmarkIssueScope | null;
  /** Free-text scope detail, e.g. a word index or the phonemes involved. */
  scopeDetail: string;
  notes: string;
  /** Always true: a review is only recorded after the teacher confirms it. */
  consentConfirmed: boolean;
  reviewer: TeacherReviewer;
  reviewedAt: string;
};

export type BenchmarkDraft = {
  sampleId: string;
  surah: string;
  ayah: string;
  label: BenchmarkTeacherLabel | "";
  scope: BenchmarkIssueScope | "";
  scopeDetail: string;
  notes: string;
  consentConfirmed: boolean;
};

export function emptyBenchmarkDraft(): BenchmarkDraft {
  return {
    sampleId: "",
    surah: "",
    ayah: "",
    label: "",
    scope: "",
    scopeDetail: "",
    notes: "",
    consentConfirmed: false,
  };
}

function isPositiveIntegerText(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number(value.trim()) >= 1;
}

export function validateBenchmarkDraft(draft: BenchmarkDraft, reviewer: TeacherReviewer): string[] {
  const errors: string[] = [];
  if (!draft.sampleId.trim()) errors.push("Sample ID is required — the label must name the recording it belongs to.");
  if (!isPositiveIntegerText(draft.surah) || !isPositiveIntegerText(draft.ayah))
    errors.push("Surah and ayah are required as positive numbers.");
  if (!draft.label) errors.push("Choose the teacher label: correct, a known pronunciation issue, or insufficient evidence.");
  if (!draft.consentConfirmed)
    errors.push("Consent/retention confirmation is required — a benchmark review without it is refused.");
  if (!reviewer.reviewerId.trim() || !reviewer.qualification.trim())
    errors.push("A reviewer ID and qualification are required — a review without a qualification is refused.");
  return errors;
}

export function buildBenchmarkReview(
  draft: BenchmarkDraft,
  reviewer: TeacherReviewer,
): { review: BenchmarkReview | null; errors: string[] } {
  const errors = validateBenchmarkDraft(draft, reviewer);
  if (errors.length > 0) return { review: null, errors };
  return {
    review: {
      reviewId: `benchmark-${draft.sampleId.trim()}-${reviewer.reviewerId.trim() || "anonymous"}-${Date.now()}`,
      sampleId: draft.sampleId.trim(),
      surah: Number(draft.surah.trim()),
      ayah: Number(draft.ayah.trim()),
      label: draft.label as BenchmarkTeacherLabel,
      scope: draft.scope === "" ? null : draft.scope,
      scopeDetail: draft.scopeDetail.trim(),
      notes: draft.notes.trim(),
      consentConfirmed: true,
      reviewer: {
        ...reviewer,
        reviewerId: reviewer.reviewerId.trim(),
        qualification: reviewer.qualification.trim(),
      },
      reviewedAt: new Date().toISOString(),
    },
    errors: [],
  };
}

function isBenchmarkTeacherLabel(value: unknown): value is BenchmarkTeacherLabel {
  return typeof value === "string" && (BENCHMARK_TEACHER_LABELS as readonly string[]).includes(value);
}

function isBenchmarkIssueScope(value: unknown): value is BenchmarkIssueScope {
  return value === "word" || value === "phoneme";
}

export function parseBenchmarkReviews(raw: string | null): BenchmarkReview[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is BenchmarkReview => {
      if (!entry || typeof entry !== "object") return false;
      const review = entry as Partial<BenchmarkReview>;
      return (
        typeof review.reviewId === "string" &&
        typeof review.sampleId === "string" &&
        typeof review.surah === "number" &&
        typeof review.ayah === "number" &&
        isBenchmarkTeacherLabel(review.label) &&
        (review.scope === null || isBenchmarkIssueScope(review.scope)) &&
        typeof review.reviewedAt === "string" &&
        review.consentConfirmed === true &&
        !!review.reviewer
      );
    });
  } catch {
    return [];
  }
}

export function serializeBenchmarkReviews(reviews: BenchmarkReview[]): string {
  return JSON.stringify(reviews, null, 2);
}

function readBenchmarkReviews(): BenchmarkReview[] {
  try {
    if (typeof window === "undefined") return [];
    return parseBenchmarkReviews(window.localStorage.getItem(BENCHMARK_SESSION_KEY));
  } catch {
    return [];
  }
}

function writeBenchmarkReviews(reviews: BenchmarkReview[]): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BENCHMARK_SESSION_KEY, serializeBenchmarkReviews(reviews));
  } catch {
    // The export button is the reviewer's durable copy; a blocked store must
    // not lose the review currently on screen.
  }
}

/**
 * The benchmark-readiness labeling workflow: a simple, self-contained panel a
 * qualified teacher uses to record one independent judgement per consented
 * recording for the controlled acoustic shadow benchmark.
 *
 * Reviewer identity is read fresh from the shared Reviewer section on every
 * submit, so editing it there never silently applies to an older copy here.
 */
export function BenchmarkLabeling() {
  const [draft, setDraft] = useState<BenchmarkDraft>(emptyBenchmarkDraft());
  const [reviews, setReviews] = useState<BenchmarkReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setReviews(readBenchmarkReviews());
  }, []);

  function submitBenchmarkReview() {
    const { review, errors } = buildBenchmarkReview(draft, readReviewerIdentity());
    if (!review) {
      setError(errors.join(" "));
      return;
    }
    const next = [...reviews, review];
    setReviews(next);
    writeBenchmarkReviews(next);
    setDraft(emptyBenchmarkDraft());
    setError(null);
    setLocalAudioUrl(null);
    if (audioInput.current) audioInput.current.value = "";
  }

  function exportBenchmarkReviews() {
    const blob = new Blob([serializeBenchmarkReviews(reviews)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `benchmark-labels-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="label-sample" aria-label="Benchmark review">
      <p className="label-eyebrow">Acoustic shadow benchmark · teacher review</p>
      <h2>Label a benchmark sample</h2>
      <p className="label-statement">
        <AlertCircle size={15} aria-hidden="true" /> A labeling tool only. It does not evaluate pronunciation and does
        not measure model accuracy. A shadow-evaluator abstention is not evidence that a recitation was correct or
        incorrect — successful shadow responses that abstained safely are not accuracy evidence.
      </p>
      <p className="label-note">
        Record one independent judgement per consented recording. Reviews stay in this browser until you export them —
        no audio is uploaded, stored, or attached to the labels you record.
      </p>

      <div className="label-audio">
        <p>
          This page bundles no samples and no audio. To listen, open a consented recording from your own machine — it
          plays locally in this tab and is never uploaded, stored or attached to the labels you record. Check that the
          consent record covers teacher review for this benchmark before you label.
        </p>
        <button type="button" onClick={() => audioInput.current?.click()}>
          Open a consented recording locally
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

      <form
        className="label-submit-form"
        onSubmit={(event) => {
          event.preventDefault();
          submitBenchmarkReview();
        }}
      >
        <h3>Record the teacher label</h3>
        <div className="label-form-row">
          <label>
            <span>Sample ID</span>
            <input
              value={draft.sampleId}
              placeholder="e.g. shadow-bench-001"
              onChange={(event) => setDraft({ ...draft, sampleId: event.target.value })}
            />
          </label>
          <label>
            <span>Surah</span>
            <input
              inputMode="numeric"
              value={draft.surah}
              placeholder="e.g. 1"
              onChange={(event) => setDraft({ ...draft, surah: event.target.value })}
            />
          </label>
          <label>
            <span>Ayah</span>
            <input
              inputMode="numeric"
              value={draft.ayah}
              placeholder="e.g. 2"
              onChange={(event) => setDraft({ ...draft, ayah: event.target.value })}
            />
          </label>
        </div>

        <div className="label-field">
          <p className="label-note">
            <strong>Teacher label</strong> — your own judgement, before you see any other review or any model output.
          </p>
          {BENCHMARK_TEACHER_LABELS.map((label) => (
            <label key={label} className="label-checkbox">
              <input
                type="radio"
                name="benchmark-teacher-label"
                checked={draft.label === label}
                onChange={() => setDraft({ ...draft, label })}
              />
              <span>
                <strong>{BENCHMARK_LABEL_TITLES[label]}</strong>
                <br />
                {BENCHMARK_LABEL_SUMMARIES[label]}
              </span>
            </label>
          ))}
        </div>

        {draft.label === "issue" && (
          <div className="label-form-row">
            <label>
              <span>Issue scope (optional)</span>
              <select
                value={draft.scope}
                onChange={(event) => setDraft({ ...draft, scope: event.target.value as BenchmarkIssueScope | "" })}
              >
                <option value="">Not locating the issue</option>
                <option value="word">Word</option>
                <option value="phoneme">Phoneme</option>
              </select>
            </label>
            <label>
              <span>
                {draft.scope === "word"
                  ? "Word index (optional)"
                  : draft.scope === "phoneme"
                    ? "Phoneme detail (optional)"
                    : "Scope detail (optional)"}
              </span>
              <input
                value={draft.scopeDetail}
                placeholder={
                  draft.scope === "word"
                    ? "e.g. word 3"
                    : draft.scope === "phoneme"
                      ? "e.g. the intended and observed sound"
                      : ""
                }
                onChange={(event) => setDraft({ ...draft, scopeDetail: event.target.value })}
              />
            </label>
          </div>
        )}

        <label className="label-field">
          <span>Reviewer notes</span>
          <textarea rows={2} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>

        <label className="label-checkbox">
          <input
            type="checkbox"
            checked={draft.consentConfirmed}
            onChange={(event) => setDraft({ ...draft, consentConfirmed: event.target.checked })}
          />
          <span>
            Consent and retention confirmed. I have checked that this recording's consent covers teacher review for this
            benchmark and that the retention window is still open. Required — without it the review is refused.
          </span>
        </label>

        {error && <p className="label-error">{error}</p>}
        <div className="label-form-actions">
          <button type="submit">
            <Check size={15} aria-hidden="true" /> Record benchmark label
          </button>
        </div>
      </form>

      <section className="label-reviews" aria-label="Benchmark labels recorded">
        <h3>Benchmark labels recorded ({reviews.length})</h3>
        {reviews.length === 0 && <p className="label-note">None yet.</p>}
        {reviews.map((review) => (
          <article key={review.reviewId}>
            <p>
              <strong>{review.sampleId}</strong> — Surah {review.surah}, ayah {review.ayah}
            </p>
            <p>
              {BENCHMARK_LABEL_TITLES[review.label]}
              {review.scope ? ` · scope: ${review.scope}${review.scopeDetail ? ` (${review.scopeDetail})` : ""}` : ""}
            </p>
            {review.notes && <p className="label-note">{review.notes}</p>}
            <p className="label-note">
              {review.reviewer.reviewerId} — {review.reviewer.qualification} · {review.reviewedAt.slice(0, 10)} ·
              consent confirmed
            </p>
          </article>
        ))}
        {reviews.length > 0 && (
          <button type="button" onClick={exportBenchmarkReviews}>
            <Download size={15} aria-hidden="true" /> Export benchmark labels
          </button>
        )}
      </section>
    </section>
  );
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
  const [mode, setMode] = useState<"benchmark" | "prototype">("prototype");
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
          <p className="label-eyebrow">
            Pronunciation dataset · {mode === "benchmark" ? "benchmark review" : "teacher labeling prototype"}
          </p>
          <h1>{mode === "benchmark" ? "Benchmark review" : "Label a recitation sample"}</h1>
          {mode === "prototype" && (
            <>
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
            </>
          )}
          {mode === "benchmark" && (
            <p className="label-note">
              The simple workflow for the controlled acoustic shadow benchmark: one independent judgement per consented
              recording. It labels; it never evaluates. See <code>docs/quran-acoustic-benchmark-protocol.md</code> for
              the protocol.
            </p>
          )}
        </div>
        <div className="label-actions">
          <button type="button" aria-pressed={mode === "benchmark"} onClick={() => setMode("benchmark")}>
            Benchmark review
          </button>
          <button type="button" aria-pressed={mode === "prototype"} onClick={() => setMode("prototype")}>
            Full prototype
          </button>
          {mode === "prototype" && (
            <>
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
            </>
          )}
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

      {mode === "benchmark" ? (
        <BenchmarkLabeling />
      ) : (
        <>
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
        </>
      )}
    </main>
  );
}
