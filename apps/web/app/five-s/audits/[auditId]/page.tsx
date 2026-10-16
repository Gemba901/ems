"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ClipboardList, Lock, Pencil, Trash2 } from "lucide-react";
import {
  useDeleteAudit,
  useFiveSAudit,
  useFiveSCapabilities,
  useSaveAuditResponses,
  useSubmitAudit,
  useUpdateAudit,
} from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { CHECKSHEET_LABEL, PRACTICE_AIMS, PRACTICE_LABELS, PRACTICE_ORDER } from "@/lib/five-s/template";
import { COUNTING_RULES, SELECTION_RULES, previewScore } from "@/lib/five-s/scoring";
import { FiveSApiError, type AuditCheckpoint, type AuditDetail, type AuditResponsePayload } from "@/services/five-s.service";
import { ResultSummary } from "@/components/five-s/audits/ResultSummary";
import { CheckpointEditor, CheckpointResult } from "@/components/five-s/audits/CheckpointCard";
import {
  AuditStatusBadge,
  ErrorNote,
  Field,
  FileUploader,
  FiveSDialog,
  KeyValue,
  Loading,
  PersonSelect,
  PhotoGallery,
  Surface,
  dangerButton,
  errorMessage,
  formatDate,
  formatTimestamp,
  inputClass,
  linkButton,
  primaryButton,
  secondaryButton,
} from "@/components/five-s/ui";
import { cn } from "@/lib/utils";

export default function AuditPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const { data: audit, isLoading, error } = useFiveSAudit(auditId);

  if (isLoading) return <Loading label="Loading audit…" />;
  if (error || !audit) return <ErrorNote>{errorMessage(error, "Audit not found")}</ErrorNote>;

  return (
    <div className="space-y-6">
      <Link href="/five-s/audits" className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 5S audits
      </Link>
      {audit.status === "DRAFT" ? <DraftAudit key={audit.id} audit={audit} /> : <SubmittedAudit audit={audit} />}
    </div>
  );
}

function AuditHeader({ audit, onEdit }: { audit: AuditDetail; onEdit?: () => void }) {
  return (
    <Surface className={cn("p-5", audit.status === "DRAFT" && "border-2 border-dashed border-amber-300 bg-amber-50/40")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{audit.reference}</h1>
            <AuditStatusBadge status={audit.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            <Link href={`/five-s/areas/${audit.area.id}`} className="font-medium text-blue-700 hover:underline">
              {audit.area.name}
            </Link>{" "}
            · {CHECKSHEET_LABEL}
          </p>
        </div>
        {onEdit && (
          <button type="button" className={secondaryButton} onClick={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden="true" /> Edit details
          </button>
        )}
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <KeyValue label="Audit date">{formatDate(audit.auditDate)}</KeyValue>
        <KeyValue label="Auditor">{audit.auditor?.name ?? "—"}</KeyValue>
        <KeyValue label="Auditee">{audit.auditee?.name ?? audit.auditeeName ?? <span className="text-slate-400">Not recorded</span>}</KeyValue>
        <div className="sm:col-span-3">
          <KeyValue label="Agreed audit boundary">
            <span className="whitespace-pre-line">{audit.auditBoundary || <span className="text-slate-400">Not recorded</span>}</span>
          </KeyValue>
        </div>
      </dl>
    </Surface>
  );
}

function CountingInstructions({ defaultOpen }: { defaultOpen: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-blue-200 bg-blue-50/60 p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-blue-900">
        <ClipboardList className="h-4 w-4" aria-hidden="true" /> Counting instructions
        <span className="ml-auto text-xs font-normal text-blue-800 group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs font-normal text-blue-800 group-open:inline">Hide</span>
      </summary>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-blue-950">
        {COUNTING_RULES.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <ul className="mt-3 space-y-1 border-t border-blue-200 pt-3 text-xs text-blue-900">
        {SELECTION_RULES.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>
    </details>
  );
}

// ── Draft ─────────────────────────────────────────────────────────────────────

function DraftAudit({ audit }: { audit: AuditDetail }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: caps } = useFiveSCapabilities();
  const save = useSaveAuditResponses();
  const submit = useSubmitAudit();
  const remove = useDeleteAudit();
  const update = useUpdateAudit();
  const canEdit = audit.permissions.canEdit;

  const [counts, setCounts] = useState(() => new Map<number, number | null>(audit.checkpoints.map((c) => [c.no, c.locationCount])));
  const [missing, setMissing] = useState<Set<number>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [remarks, setRemarks] = useState(audit.remarks ?? "");
  const [photos, setPhotos] = useState(audit.photoUrls);

  // Saves run one after another so an earlier tap can never overwrite a later one.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  function persist(responses: AuditResponsePayload[]) {
    queue.current = queue.current
      .then(() => save.mutateAsync({ id: audit.id, responses }))
      .then(() => setSaveError(null))
      .catch((e) => setSaveError(errorMessage(e, "Your last change was not saved. Check your connection and try again.")));
  }

  const preview = previewScore(audit.checkpoints, counts);

  function setCount(no: number, value: number | null) {
    setCounts((m) => new Map(m).set(no, value));
    if (value != null && missing.has(no)) {
      const next = new Set(missing);
      next.delete(no);
      setMissing(next);
    }
    persist([{ checkpointNo: no, locationCount: value }]);
  }

  function jumpToFirstMissing(list: number[]) {
    setMissing(new Set(list));
    document.getElementById(`checkpoint-${list[0]}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openReview() {
    if (preview.unanswered.length > 0) {
      jumpToFirstMissing(preview.unanswered);
      toast(`${preview.unanswered.length} checkpoint(s) still need a selection`, "error");
      return;
    }
    setReviewing(true);
  }

  async function doSubmit() {
    try {
      await queue.current;
      await submit.mutateAsync(audit.id);
      setReviewing(false);
      toast(`${audit.reference} submitted and locked`, "success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      if (e instanceof FiveSApiError && e.code === "FIVE_S_CHECKPOINTS_UNANSWERED" && Array.isArray(e.details.missing)) {
        setReviewing(false);
        jumpToFirstMissing(e.details.missing as number[]);
      }
      toast(errorMessage(e), "error");
    }
  }

  const byPractice = (p: string) => audit.checkpoints.filter((c) => c.practice === p);

  return (
    <>
      <AuditHeader audit={audit} onEdit={canEdit ? () => setEditing(true) : undefined} />

      {!canEdit && <ErrorNote>Only the auditor can change this draft. You can view it, but it does not count towards results until it is submitted.</ErrorNote>}
      {!audit.area.isActive && <ErrorNote>This area is inactive. Reactivate it before submitting.</ErrorNote>}

      {/* Sticky progress and live score */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-40 flex-1">
            <p className="text-xs font-medium text-slate-600">
              {preview.answered} of {preview.total} answered
            </p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(preview.answered / preview.total) * 100}%` }} />
            </div>
          </div>
          <dl className="flex gap-3 text-center text-xs">
            {PRACTICE_ORDER.map((p) => (
              <div key={p}>
                <dt className="text-slate-500">{PRACTICE_LABELS[p].split(" ")[0]}</dt>
                <dd className="font-semibold tabular-nums">{preview.points[p]}</dd>
              </div>
            ))}
            <div>
              <dt className="text-slate-500">Total</dt>
              <dd className="font-bold tabular-nums">{preview.totalPoints}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Level</dt>
              <dd className="font-bold tabular-nums">{preview.result ? preview.result.level.toFixed(1) : "—"}</dd>
            </div>
          </dl>
          <p className="w-full text-xs text-slate-500 sm:w-auto" aria-live="polite">
            {save.isPending ? "Saving…" : saveError ? <span className="font-medium text-red-700">{saveError}</span> : "Draft saved"}
          </p>
        </div>
      </div>

      <CountingInstructions defaultOpen={preview.answered === 0} />

      <ul className="space-y-8">
        {PRACTICE_ORDER.map((p, i) => (
          <li key={p}>
            <section aria-labelledby={`practice-${p}`}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div>
                  <h2 id={`practice-${p}`} className="text-lg font-semibold text-slate-900">
                    {i + 1}S · {PRACTICE_LABELS[p]}
                  </h2>
                  <p className="text-xs text-slate-500">{PRACTICE_AIMS[p]}</p>
                </div>
                <span className="text-sm tabular-nums text-slate-600">
                  {preview.points[p]} <span className="text-slate-400">/ 20</span>
                </span>
              </div>
              <ol className="space-y-3">
                {byPractice(p).map((c: AuditCheckpoint) => (
                  <CheckpointEditor
                    key={c.no}
                    checkpoint={c}
                    count={counts.get(c.no) ?? null}
                    missing={missing.has(c.no)}
                    disabled={!canEdit}
                    onCount={(v) => setCount(c.no, v)}
                    onSave={(patch) => persist([{ checkpointNo: c.no, ...patch }])}
                  />
                ))}
              </ol>
            </section>
          </li>
        ))}
      </ul>

      <Surface className="space-y-4 p-5">
        <h2 className="text-base font-semibold text-slate-900">Overall remarks and photos (optional)</h2>
        <Field label="Remarks" htmlFor="audit-remarks" hint="What you discussed with the auditee, good practice seen, priorities agreed.">
          <textarea
            id="audit-remarks"
            rows={3}
            className={inputClass}
            value={remarks}
            maxLength={4000}
            disabled={!canEdit}
            onChange={(e) => setRemarks(e.target.value)}
            onBlur={() =>
              remarks !== (audit.remarks ?? "") &&
              update.mutate({ id: audit.id, body: { remarks: remarks || null } }, { onError: (e) => toast(errorMessage(e), "error") })
            }
          />
        </Field>
        <FileUploader
          urls={photos}
          folder="five-s/audits"
          disabled={!canEdit}
          label="Add audit photo"
          onChange={(urls) => {
            setPhotos(urls);
            update.mutate({ id: audit.id, body: { photoUrls: urls } }, { onError: (e) => toast(errorMessage(e), "error") });
          }}
        />
      </Surface>

      <Surface className="space-y-4 p-5">
        <h2 className="text-base font-semibold text-slate-900">Review subtotals</h2>
        <ResultSummary points={preview.points} totalPoints={preview.totalPoints} result={preview.result} targetLevel={audit.currentTargetLevel} unanswered={preview.unanswered.length} />
        {canEdit && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button type="button" className={dangerButton} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete draft
            </button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/five-s/audits" className={secondaryButton}>
                Save and finish later
              </Link>
              <button type="button" className={primaryButton} onClick={openReview} disabled={!audit.permissions.canSubmit}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Review and submit
              </button>
            </div>
          </div>
        )}
      </Surface>

      <FiveSDialog
        open={reviewing}
        onOpenChange={setReviewing}
        title={`Submit ${audit.reference}?`}
        description="Submitting locks every checkpoint, remark and photo. The result then counts on the overview."
        size="lg"
        footer={
          <>
            <button type="button" className={secondaryButton} onClick={() => setReviewing(false)}>
              Keep editing
            </button>
            <button type="button" className={primaryButton} onClick={() => void doSubmit()} disabled={submit.isPending}>
              <Lock className="h-4 w-4" aria-hidden="true" /> {submit.isPending ? "Submitting…" : "Submit and lock"}
            </button>
          </>
        }
      >
        <ResultSummary points={preview.points} totalPoints={preview.totalPoints} result={preview.result} targetLevel={audit.currentTargetLevel} compact />
        <p className="mt-4 text-sm text-slate-600">
          {(() => {
            const n = audit.checkpoints.filter((c) => (counts.get(c.no) ?? 0) > 0).length;
            return n === 0
              ? "No problem locations were recorded, so no improvement actions will be raised."
              : `${n} improvement action(s) will be raised, one for each checkpoint with problem locations, assigned to the area owner with the due date not set. Due dates are planned on each action.`;
          })()}
        </p>
      </FiveSDialog>

      <FiveSDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this draft?"
        description="The draft and its answers are removed. Submitted audits can never be deleted."
        footer={
          <>
            <button type="button" className={secondaryButton} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={dangerButton}
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(audit.id, {
                  onSuccess: () => {
                    toast("Draft deleted", "success");
                    router.push("/five-s/audits");
                  },
                  onError: (e) => toast(errorMessage(e), "error"),
                })
              }
            >
              {remove.isPending ? "Deleting…" : "Delete draft"}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{audit.reference} · {preview.answered} of 20 answered.</p>
      </FiveSDialog>

      {editing && <EditDetailsDialog audit={audit} onClose={() => setEditing(false)} maxDate={caps?.today} />}
    </>
  );
}

function EditDetailsDialog({ audit, onClose, maxDate }: { audit: AuditDetail; onClose: () => void; maxDate?: string }) {
  const { toast } = useToast();
  const update = useUpdateAudit();
  const [auditDate, setAuditDate] = useState(audit.auditDate);
  const [auditorId, setAuditorId] = useState(audit.auditor?.id ?? null);
  const [auditeeId, setAuditeeId] = useState(audit.auditee?.id ?? null);
  const [auditeeName, setAuditeeName] = useState(audit.auditeeName ?? "");
  const [boundary, setBoundary] = useState(audit.auditBoundary ?? "");

  return (
    <FiveSDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Audit details"
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={primaryButton}
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                {
                  id: audit.id,
                  body: {
                    auditDate,
                    ...(auditorId && auditorId !== audit.auditor?.id ? { auditorId } : {}),
                    auditeeId,
                    auditeeName: auditeeId ? null : auditeeName.trim() || null,
                    auditBoundary: boundary.trim() || null,
                  },
                },
                {
                  onSuccess: () => {
                    toast("Audit details saved", "success");
                    onClose();
                  },
                },
              )
            }
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {update.error && <ErrorNote>{errorMessage(update.error)}</ErrorNote>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Audit date" htmlFor="edit-audit-date">
            <input id="edit-audit-date" type="date" className={inputClass} value={auditDate} max={maxDate} onChange={(e) => setAuditDate(e.target.value)} />
          </Field>
          <Field label="Auditor" htmlFor="edit-auditor" hint="Only the area HOD or a 5S administrator can change it.">
            <PersonSelect id="edit-auditor" value={auditorId} onChange={setAuditorId} allowEmpty={false} />
          </Field>
          <Field label="Auditee" htmlFor="edit-auditee">
            <PersonSelect id="edit-auditee" value={auditeeId} onChange={setAuditeeId} emptyLabel="Not in the list / not recorded" />
          </Field>
          {!auditeeId && (
            <Field label="Auditee name" htmlFor="edit-auditee-name">
              <input id="edit-auditee-name" className={inputClass} value={auditeeName} maxLength={120} onChange={(e) => setAuditeeName(e.target.value)} />
            </Field>
          )}
        </div>
        <Field label="Agreed audit boundary" htmlFor="edit-boundary">
          <textarea id="edit-boundary" rows={3} className={inputClass} value={boundary} maxLength={4000} onChange={(e) => setBoundary(e.target.value)} />
        </Field>
      </div>
    </FiveSDialog>
  );
}

// ── Submitted ─────────────────────────────────────────────────────────────────

function SubmittedAudit({ audit }: { audit: AuditDetail }) {
  const result = audit.result;
  const actions = audit.checkpoints.filter((c) => c.action);
  return (
    <>
      <AuditHeader audit={audit} />
      <p className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
        Submitted {formatTimestamp(audit.submittedAt)} by {audit.submittedBy?.name ?? "—"}. This audit is locked. Closing its actions does not change this score.
      </p>

      {result && (
        <Surface className="space-y-3 p-5">
          <h2 className="text-base font-semibold text-slate-900">Result</h2>
          <ResultSummary points={result.points} totalPoints={result.totalPoints} result={{ deductionSteps: result.deductionSteps, level: result.level }} targetLevel={result.targetLevel} />
          <p className="text-xs text-slate-500">Method: {audit.method}. The target shown is the area&apos;s target when the audit was submitted.</p>
        </Surface>
      )}

      <Surface>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Follow-up actions</h2>
          {actions.length > 0 && (
            <Link href={`/five-s/actions?auditId=${audit.id}`} className={linkButton}>
              Open in actions
            </Link>
          )}
        </div>
        <p className="px-5 py-3 text-sm text-slate-600">
          {actions.length === 0
            ? "No problem locations were recorded, so no actions were raised."
            : `${actions.length} action(s) were raised, one for each checkpoint with problem locations. They are listed under their checkpoints below.`}
        </p>
      </Surface>

      <ul className="space-y-6">
        {PRACTICE_ORDER.map((p, i) => (
          <li key={p}>
            <section aria-labelledby={`practice-${p}`}>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 id={`practice-${p}`} className="text-lg font-semibold text-slate-900">
                  {i + 1}S · {PRACTICE_LABELS[p]}
                </h2>
                <span className="text-sm tabular-nums text-slate-600">{result?.points[p] ?? "—"} / 20</span>
              </div>
              <ol className="space-y-2">
                {audit.checkpoints
                  .filter((c) => c.practice === p)
                  .map((c) => (
                    <CheckpointResult key={c.no} checkpoint={c} />
                  ))}
              </ol>
            </section>
          </li>
        ))}
      </ul>

      {(audit.remarks || audit.photoUrls.length > 0) && (
        <Surface className="space-y-3 p-5">
          <h2 className="text-base font-semibold text-slate-900">Overall remarks and photos</h2>
          {audit.remarks && <p className="whitespace-pre-line text-sm text-slate-700">{audit.remarks}</p>}
          <PhotoGallery urls={audit.photoUrls} />
        </Surface>
      )}
    </>
  );
}
