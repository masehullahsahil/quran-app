/**
 * The teacher's curriculum review workspace.
 *
 * A qualified Qari or Qaida teacher walks the twelve levels in order and leaves
 * a record on anything that needs one. Everything on this screen is rendered
 * from the audit inventory, which is derived from the curriculum itself — so
 * what the teacher reviews is exactly what a learner sees, and a lesson cannot
 * be shown here in a form the course does not actually teach.
 *
 * Three things this page will not do:
 *
 *  - it never edits the curriculum. A correction is recorded as the teacher's
 *    words, for a developer to apply and for the teacher to check afterwards;
 *  - it never approves anything on the teacher's behalf. Approval needs their
 *    name, their qualification and their own attestation, entered here;
 *  - it never presents a passing test suite, `pnpm verify:qaida`, or the fact
 *    that a lesson was drafted carefully as review. Until a teacher records
 *    something, every item on this page reads "AI-drafted".
 *
 * The interface language is English: this is a reviewer's tool, not part of the
 * learner's app, and it is deliberately outside the locale packs so that adding
 * it cannot dilute the learner-facing translation coverage.
 */
// The default import is what lets this page be rendered in a test: the app's
// build uses the automatic JSX runtime, but the test transform falls back to
// the classic one (tsconfig sets `jsx: "preserve"`), where JSX compiles to
// `React.createElement` and needs React in scope. Unused at runtime otherwise.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Download, FileText, Upload } from "lucide-react";
import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABELS,
  CORRECTION_IMPACTS,
  PROVENANCE_LABELS,
  REVIEW_SEVERITIES,
  REVIEW_STATUS_LABELS,
  ReviewRecordError,
  approvalStatement,
  auditProgress,
  itemsForLevel,
  latestRecord,
  provenanceOf,
  recordReview,
  statusOf,
  type AuditCategory,
  type AuditItem,
  type AuditLedger,
  type CorrectionImpact,
  type Reviewer,
  type ReviewSeverity,
  type ReviewStatus,
} from "@shared/curriculumAudit";
import { CURRICULUM_AUDIT_INVENTORY } from "@shared/curriculumAuditInventory";
import { findingsForItem } from "@shared/curriculumAuditFindings";
import { QAIDA_LEVELS, getQaidaLesson, lessonOrder } from "@shared/qaidaCurriculum";
import {
  appendRecord,
  mergeLedgers,
  parseLedger,
  readLedger,
  readReviewer,
  serializeLedger,
  writeLedger,
  writeReviewer,
} from "@/lib/curriculumAuditStore";

const LEVELS = [...QAIDA_LEVELS].sort((left, right) => left.order - right.order);

type DraftState = {
  status: ReviewStatus;
  category: AuditCategory;
  severity: ReviewSeverity;
  impact: CorrectionImpact;
  comment: string;
  proposedCorrection: string;
  attestation: string;
};

function emptyDraft(item: AuditItem): DraftState {
  return {
    status: "correction-requested",
    category: item.categories[0] ?? "beginner-clarity",
    severity: "major",
    impact: "wording-only",
    comment: "",
    proposedCorrection: "",
    attestation: "",
  };
}

/** The Arabic under review, shown at reading size and never mirrored. */
function ArabicPanel({ item }: { item: AuditItem }) {
  if (!item.arabic) return null;
  return (
    <div className="audit-arabic-panel">
      <p className="audit-arabic" lang="ar" dir="rtl">
        {item.arabic}
      </p>
      <div className="audit-arabic-meta">
        {item.arabicSource && (
          <span className={item.arabicSource === "quran" ? "audit-tag is-quran" : "audit-tag"}>
            {item.arabicSource === "quran" ? "Quran" : "Teaching example"}
          </span>
        )}
        {item.quranReference && <span className="audit-tag is-reference">{item.quranReference}</span>}
        {item.gloss && <span className="audit-gloss">{item.gloss}</span>}
      </div>
    </div>
  );
}

export default function CurriculumAudit() {
  const inventory = CURRICULUM_AUDIT_INVENTORY;
  const [ledger, setLedger] = useState<AuditLedger>({ records: [] });
  const [reviewer, setReviewer] = useState<Reviewer>({ name: "" });
  const [levelIndex, setLevelIndex] = useState(0);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLedger(readLedger());
    setReviewer(readReviewer());
  }, []);

  const level = LEVELS[levelIndex];
  const progress = useMemo(() => auditProgress(inventory, ledger), [inventory, ledger]);
  const levelItems = useMemo(() => itemsForLevel(inventory, level.id), [inventory, level.id]);
  const levelProgress = useMemo(() => auditProgress(levelItems, ledger), [levelItems, ledger]);

  /** Level-scope items first, then each lesson's items in review order. */
  const groups = useMemo(() => {
    const shown = onlyPending ? levelItems.filter((item) => statusOf(item.id, ledger) === "pending-review") : levelItems;
    const byLesson = new Map<string, AuditItem[]>();
    const levelScope: AuditItem[] = [];
    for (const item of shown) {
      if (!item.lessonId) {
        levelScope.push(item);
        continue;
      }
      const existing = byLesson.get(item.lessonId);
      if (existing) existing.push(item);
      else byLesson.set(item.lessonId, [item]);
    }
    return { levelScope, lessons: Array.from(byLesson.entries()) };
  }, [levelItems, ledger, onlyPending]);

  function persist(next: AuditLedger) {
    setLedger(next);
    writeLedger(next);
  }

  function updateReviewer(next: Reviewer) {
    setReviewer(next);
    writeReviewer(next);
  }

  function saveDraft(item: AuditItem) {
    if (!draft) return;
    try {
      const record = recordReview({
        itemId: item.id,
        status: draft.status,
        category: draft.category,
        severity: draft.severity,
        impact: draft.impact,
        comment: draft.comment,
        proposedCorrection: draft.proposedCorrection || undefined,
        reviewer,
        reviewedAt: new Date().toISOString(),
        attestation: draft.attestation || undefined,
      });
      persist(appendRecord(ledger, record));
      setOpenItemId(null);
      setDraft(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ReviewRecordError ? cause.message : "This review could not be recorded.");
    }
  }

  function exportLedger() {
    const blob = new Blob([serializeLedger(ledger)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `qaida-audit-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importLedger(file: File) {
    const incoming = parseLedger(await file.text());
    persist(mergeLedgers(ledger, incoming));
  }

  return (
    <main className="audit-page">
      <header className="audit-header">
        <div>
          <p className="audit-eyebrow">Qaida curriculum · teacher audit</p>
          <h1>Review the course, level by level</h1>
          <p className="audit-statement">
            <AlertCircle size={15} aria-hidden="true" /> {approvalStatement(inventory, ledger)}
          </p>
          <p className="audit-note">
            Nothing on this screen has been approved by a qualified teacher unless you approve it here. Automated tests
            check that the data is well formed; they say nothing about whether the teaching is correct.
          </p>
        </div>
        <div className="audit-actions">
          <button type="button" onClick={exportLedger}>
            <Download size={15} aria-hidden="true" /> Export review file
          </button>
          <button type="button" onClick={() => importInput.current?.click()}>
            <Upload size={15} aria-hidden="true" /> Import review file
          </button>
          <button type="button" onClick={() => window.print()}>
            <FileText size={15} aria-hidden="true" /> Print this level
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importLedger(file);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <section className="audit-reviewer" aria-label="Reviewer">
        <h2>Reviewer</h2>
        <p>Recorded on every review you leave, and kept separate from the curriculum itself.</p>
        <div className="audit-reviewer-fields">
          <label>
            <span>Name</span>
            <input
              value={reviewer.name}
              placeholder="As you wish to be credited"
              onChange={(event) => updateReviewer({ ...reviewer, name: event.target.value })}
            />
          </label>
          <label>
            <span>Identifier (optional)</span>
            <input
              value={reviewer.identifier ?? ""}
              placeholder="Email, ijazah number, staff id"
              onChange={(event) => updateReviewer({ ...reviewer, identifier: event.target.value })}
            />
          </label>
          <label>
            <span>Qualification</span>
            <input
              value={reviewer.qualification ?? ""}
              placeholder="Required before you can approve anything"
              onChange={(event) => updateReviewer({ ...reviewer, qualification: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="audit-overview" aria-label="Audit progress">
        <div className="audit-counts">
          <span>
            <strong>{progress.total}</strong> items in the review inventory
          </span>
          <span>
            <strong>{progress.byStatus["pending-review"]}</strong> pending
          </span>
          <span>
            <strong>{progress.byStatus["correction-requested"]}</strong> corrections requested
          </span>
          <span>
            <strong>{progress.byStatus["needs-clarification"]}</strong> need clarification
          </span>
          <span>
            <strong>{progress.byProvenance["teacher-approved"]}</strong> teacher-approved
          </span>
        </div>
        <nav className="audit-level-rail" aria-label="Course levels">
          {LEVELS.map((entry, index) => {
            const entryProgress = auditProgress(itemsForLevel(inventory, entry.id), ledger);
            const done = entryProgress.total - entryProgress.byStatus["pending-review"];
            return (
              <button
                key={entry.id}
                type="button"
                className={index === levelIndex ? "is-current" : ""}
                onClick={() => setLevelIndex(index)}
              >
                <b>{entry.order}</b>
                <span>{entry.title}</span>
                <small>
                  {done}/{entryProgress.total}
                </small>
              </button>
            );
          })}
        </nav>
      </section>

      <section className="audit-level" aria-label={`Level ${level.order}`}>
        <div className="audit-level-head">
          <div>
            <p className="audit-eyebrow">
              Level {level.order} of {LEVELS.length}
            </p>
            <h2>
              {level.title} <span lang="ar" dir="rtl">{level.arabicTitle}</span>
            </h2>
            <p>{level.objective}</p>
          </div>
          <label className="audit-filter">
            <input type="checkbox" checked={onlyPending} onChange={(event) => setOnlyPending(event.target.checked)} />
            <span>Show only items still pending</span>
          </label>
        </div>
        <p className="audit-level-progress">
          {levelProgress.total - levelProgress.byStatus["pending-review"]} of {levelProgress.total} items in this level
          have a recorded review.
        </p>

        {groups.levelScope.length > 0 && (
          <article className="audit-lesson">
            <h3>Level scope</h3>
            {groups.levelScope.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                ledger={ledger}
                isOpen={openItemId === item.id}
                draft={openItemId === item.id ? draft : null}
                error={openItemId === item.id ? error : null}
                reviewer={reviewer}
                onOpen={() => {
                  setOpenItemId(item.id);
                  setDraft(emptyDraft(item));
                  setError(null);
                }}
                onCancel={() => {
                  setOpenItemId(null);
                  setDraft(null);
                }}
                onChange={setDraft}
                onSave={() => saveDraft(item)}
              />
            ))}
          </article>
        )}

        {groups.lessons.map(([lessonId, items]) => {
          const lesson = getQaidaLesson(lessonId);
          return (
            <article className="audit-lesson" key={lessonId}>
              <header className="audit-lesson-head">
                <div>
                  <p className="audit-eyebrow">
                    Lesson {lessonOrder(lessonId)} of 42 · {lessonId}
                  </p>
                  <h3>{lesson?.title ?? lessonId}</h3>
                </div>
                <div className="audit-lesson-meta">
                  <span>{lesson?.practice.length ?? 0} practice items</span>
                  <span>{lesson?.stages.join(" → ")}</span>
                </div>
              </header>
              {items.map((item: AuditItem) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  ledger={ledger}
                  isOpen={openItemId === item.id}
                  draft={openItemId === item.id ? draft : null}
                  error={openItemId === item.id ? error : null}
                  reviewer={reviewer}
                  onOpen={() => {
                    setOpenItemId(item.id);
                    setDraft(emptyDraft(item));
                    setError(null);
                  }}
                  onCancel={() => {
                    setOpenItemId(null);
                    setDraft(null);
                  }}
                  onChange={setDraft}
                  onSave={() => saveDraft(item)}
                />
              ))}
            </article>
          );
        })}

        <div className="audit-level-nav">
          <button type="button" disabled={levelIndex === 0} onClick={() => setLevelIndex((index) => index - 1)}>
            <ArrowLeft size={16} aria-hidden="true" /> Previous level
          </button>
          <button
            type="button"
            disabled={levelIndex === LEVELS.length - 1}
            onClick={() => setLevelIndex((index) => index + 1)}
          >
            Next level <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </section>
    </main>
  );
}

function ItemRow({
  item,
  ledger,
  isOpen,
  draft,
  error,
  reviewer,
  onOpen,
  onCancel,
  onChange,
  onSave,
}: {
  item: AuditItem;
  ledger: AuditLedger;
  isOpen: boolean;
  draft: DraftState | null;
  error: string | null;
  reviewer: Reviewer;
  onOpen: () => void;
  onCancel: () => void;
  onChange: (draft: DraftState) => void;
  onSave: () => void;
}) {
  const status = statusOf(item.id, ledger);
  const provenance = provenanceOf(item.id, ledger);
  const record = latestRecord(item.id, ledger);
  const findings = findingsForItem(item.id);

  return (
    <div className={`audit-item is-${status}`}>
      <div className="audit-item-head">
        <div>
          <p className="audit-item-kind">{item.kind.replace(/-/g, " ")}</p>
          <h4>{item.label}</h4>
        </div>
        <div className="audit-item-badges">
          <span className={`audit-badge is-${provenance}`}>{PROVENANCE_LABELS[provenance]}</span>
          <span className={`audit-badge is-status is-${status}`}>{REVIEW_STATUS_LABELS[status]}</span>
        </div>
      </div>

      <ArabicPanel item={item} />
      {item.content && <p className="audit-item-content">{item.content}</p>}
      {item.expectedAnswer && (
        <p className="audit-expected">
          <strong>Counted correct:</strong> {item.expectedAnswer}
        </p>
      )}
      <p className="audit-source">
        {item.sourcePath} · {item.categories.map((category) => AUDIT_CATEGORY_LABELS[category]).join(" · ")}
      </p>

      {findings.length > 0 && (
        <div className="audit-findings">
          {findings.map((finding) => (
            <div key={finding.id}>
              <p className="audit-finding-observation">{finding.observation}</p>
              <p className="audit-finding-question">
                <strong>For you to decide:</strong> {finding.question}
              </p>
              <small>Raised automatically while building this inventory — not a teacher's opinion.</small>
            </div>
          ))}
        </div>
      )}

      {record && (
        <div className="audit-record">
          <p>
            <strong>{REVIEW_STATUS_LABELS[record.status]}</strong> · {AUDIT_CATEGORY_LABELS[record.category]} ·{" "}
            {record.severity} · {record.impact === "curriculum-logic" ? "affects curriculum logic" : "wording only"}
          </p>
          {record.comment && <p>{record.comment}</p>}
          {record.proposedCorrection && (
            <p>
              <strong>Proposed:</strong> {record.proposedCorrection}
            </p>
          )}
          <small>
            {record.reviewer.name}
            {record.reviewer.qualification ? ` · ${record.reviewer.qualification}` : ""} · {record.reviewedAt.slice(0, 10)}
          </small>
        </div>
      )}

      {!isOpen && (
        <button type="button" className="audit-review-open" onClick={onOpen}>
          {record ? "Add another review" : "Record a review"}
        </button>
      )}

      {isOpen && draft && (
        <form
          className="audit-review-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className="audit-form-row">
            <label>
              <span>Status</span>
              <select
                value={draft.status}
                onChange={(event) => onChange({ ...draft, status: event.target.value as ReviewStatus })}
              >
                {(["correction-requested", "needs-clarification", "approved", "pending-review"] as ReviewStatus[]).map(
                  (status) => (
                    <option key={status} value={status}>
                      {REVIEW_STATUS_LABELS[status]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              <span>Category</span>
              <select
                value={draft.category}
                onChange={(event) => onChange({ ...draft, category: event.target.value as AuditCategory })}
              >
                {AUDIT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {AUDIT_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Severity</span>
              <select
                value={draft.severity}
                onChange={(event) => onChange({ ...draft, severity: event.target.value as ReviewSeverity })}
              >
                {REVIEW_SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Correction affects</span>
              <select
                value={draft.impact}
                onChange={(event) => onChange({ ...draft, impact: event.target.value as CorrectionImpact })}
              >
                {CORRECTION_IMPACTS.map((impact) => (
                  <option key={impact} value={impact}>
                    {impact === "curriculum-logic" ? "Curriculum logic" : "Wording only"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="audit-field">
            <span>What you observed</span>
            <textarea
              rows={3}
              value={draft.comment}
              onChange={(event) => onChange({ ...draft, comment: event.target.value })}
            />
          </label>
          <label className="audit-field">
            <span>Proposed correction (optional) — recorded as your words, never applied automatically</span>
            <textarea
              rows={3}
              value={draft.proposedCorrection}
              onChange={(event) => onChange({ ...draft, proposedCorrection: event.target.value })}
            />
          </label>

          {draft.status === "approved" && (
            <label className="audit-field audit-attestation">
              <span>
                Your attestation. Approval is recorded in your name{reviewer.name ? ` (${reviewer.name})` : ""} and
                requires your qualification to be filled in above.
              </span>
              <textarea
                rows={2}
                placeholder="e.g. I have read this item and, as a qualified teacher, I approve it as it stands."
                value={draft.attestation}
                onChange={(event) => onChange({ ...draft, attestation: event.target.value })}
              />
            </label>
          )}

          {error && <p className="audit-error">{error}</p>}

          <div className="audit-form-actions">
            <button type="submit">
              <Check size={15} aria-hidden="true" /> Record review
            </button>
            <button type="button" className="is-quiet" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
