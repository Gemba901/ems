"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Info, Pencil } from "lucide-react";
import { useFiveSAction, useFiveSCapabilities, useSubmitAction, useUpdateAction, useVerifyAction } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { countLabel } from "@/lib/five-s/scoring";
import { ACTION_EVENT_LABELS, type ActionDetail, type ActionStatus } from "@/services/five-s.service";
import {
  ActionStatusBadge,
  DueDate,
  ErrorNote,
  Field,
  FileUploader,
  FiveSDialog,
  HEADER_ACTIONS,
  KeyValue,
  Loading,
  PersonSelect,
  PhotoGallery,
  PracticeBadge,
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
import { CorrectiveActions } from "@/components/five-s/actions/CorrectiveActions";
import { cn } from "@/lib/utils";

const FLOW: ActionStatus[] = ["OPEN", "AWAITING_VERIFICATION", "VERIFIED"];

export default function ActionDetailPage() {
  const { actionId } = useParams<{ actionId: string }>();
  const { data: action, isLoading, error } = useFiveSAction(actionId);
  const { data: caps } = useFiveSCapabilities();
  const [dialog, setDialog] = useState<"edit" | "submit" | "verify" | "rework" | null>(null);

  if (isLoading) return <Loading label="Loading action…" />;
  if (error || !action) return <ErrorNote>{errorMessage(error, "Action not found")}</ErrorNote>;

  const isOwner = !!caps && action.owner?.id === caps.employeeId;
  const stepIndex = FLOW.indexOf(action.status);
  const lastRework = [...action.history].reverse().find((h) => h.type === "RETURNED_FOR_REWORK");

  return (
    <div className="space-y-6">
      <Link href="/five-s/actions" className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Improvement actions
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{action.reference}</h1>
            <PracticeBadge practice={action.practice} />
            <ActionStatusBadge status={action.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <Link href={`/five-s/areas/${action.area.id}`} className="text-blue-700 hover:underline">
              {action.area.name}
            </Link>
            {action.audit ? (
              <>
                {" "}
                · from{" "}
                <Link href={`/five-s/audits/${action.audit.id}`} className="text-blue-700 hover:underline">
                  {action.audit.reference}
                </Link>{" "}
                ({formatDate(action.audit.auditDate)})
              </>
            ) : (
              " · raised manually"
            )}
          </p>
        </div>
        <div className={HEADER_ACTIONS}>
          {(action.permissions.canPlan || action.permissions.canEditText) && (
            <button type="button" className={secondaryButton} onClick={() => setDialog("edit")}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
            </button>
          )}
          {action.permissions.canSubmit && (
            <button
              type="button"
              className={primaryButton}
              onClick={() => setDialog("submit")}
              disabled={!action.permissions.allStepsDone}
              title={action.permissions.allStepsDone ? undefined : "Tick every corrective action done first"}
            >
              Mark complete
            </button>
          )}
          {action.permissions.canVerify && (
            <>
              <button type="button" className={dangerButton} onClick={() => setDialog("rework")}>
                Return for rework
              </button>
              <button type="button" className={primaryButton} onClick={() => setDialog("verify")}>
                Verify
              </button>
            </>
          )}
        </div>
      </header>

      <ol className="grid grid-cols-3 gap-2" aria-label="Action progress">
        {FLOW.map((s, i) => (
          <li
            key={s}
            aria-current={i === stepIndex ? "step" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-center text-xs font-semibold",
              i < stepIndex ? "bg-emerald-50 text-emerald-700" : i === stepIndex ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500",
            )}
          >
            {["Open", "Awaiting verification", "Verified"][i]}
          </li>
        ))}
      </ol>

      {action.status === "OPEN" && lastRework && (
        <ErrorNote>
          Returned for rework by {lastRework.actor?.name ?? "the verifier"} on {formatTimestamp(lastRework.createdAt)}: {lastRework.note}
        </ErrorNote>
      )}
      {action.permissions.canSubmit && !action.permissions.allStepsDone && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {action.correctiveActionProgress.total === 0
            ? "Add at least one corrective action. You can mark the action complete once every corrective action is done."
            : `${action.correctiveActionProgress.total - action.correctiveActionProgress.done} of ${action.correctiveActionProgress.total} corrective actions still to do. You can mark the action complete once they are all done.`}
        </p>
      )}
      {action.status === "AWAITING_VERIFICATION" && isOwner && (
        <p className="rounded-lg bg-violet-50 px-4 py-2 text-sm text-violet-800">Waiting for someone else to verify. You cannot verify an action you own.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Surface className="space-y-4 p-5">
            {action.checkpointText && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Checkpoint {action.checkpointNo} · {action.practiceLabel}
                </p>
                <p className="mt-1 text-slate-800">{action.checkpointText}</p>
                {action.locationCount != null && <p className="mt-1 text-xs text-slate-600">{countLabel(action.locationCount)} problem location(s) recorded</p>}
              </div>
            )}
            <KeyValue label="Finding">
              <span className="whitespace-pre-line">{action.finding}</span>
            </KeyValue>
          </Surface>

          <CorrectiveActions action={action} />

          {action.completionDescription && (
            <Surface className="space-y-3 p-5">
              <h2 className="text-base font-semibold text-slate-900">Completion</h2>
              <p className="whitespace-pre-line text-sm text-slate-700">{action.completionDescription}</p>
              <PhotoGallery urls={action.completionEvidenceUrls} emptyText="No evidence attached." />
              <p className="text-xs text-slate-500">Submitted {formatTimestamp(action.submittedAt)}</p>
              {action.status === "VERIFIED" && (
                <p className="text-sm text-emerald-700">
                  Verified by {action.verifiedBy?.name ?? "—"} on {formatTimestamp(action.verifiedAt)}
                  {action.verificationRemarks ? `: ${action.verificationRemarks}` : ""}
                </p>
              )}
            </Surface>
          )}

          <Surface>
            <h2 className="border-b border-slate-100 px-5 py-3 text-base font-semibold text-slate-900">History</h2>
            <ol className="space-y-4 px-5 py-4">
              {action.history.map((h) => (
                <li key={h.id} className="relative border-l-2 border-slate-200 pl-4">
                  <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
                  <p className="text-sm font-medium text-slate-900">{ACTION_EVENT_LABELS[h.type]}</p>
                  <p className="text-xs text-slate-500">
                    {h.actor?.name ?? "System"} · {formatTimestamp(h.createdAt)}
                  </p>
                  {(h.fromValue || h.toValue) && (
                    <p className="mt-0.5 text-xs text-slate-600">
                      {h.fromValue ?? "—"} → {h.toValue ?? "—"}
                    </p>
                  )}
                  {h.note && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Surface>
        </div>

        <aside className="space-y-6">
          <Surface className="p-5">
            <dl className="space-y-3">
              <KeyValue label="Action owner">{action.owner?.name ?? "Not assigned"}</KeyValue>
              <KeyValue label="Due date">
                <DueDate date={action.dueDate} overdue={action.isOverdue} />
              </KeyValue>
              <KeyValue label="Raised by">
                {action.createdBy?.name ?? "—"} · {formatTimestamp(action.createdAt)}
              </KeyValue>
            </dl>
          </Surface>
          <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Closing this action does not change the audit score. The improvement shows in the next submitted audit of the area.
          </p>
        </aside>
      </div>

      {dialog === "edit" && <EditDialog action={action} onClose={() => setDialog(null)} />}
      {dialog === "submit" && <SubmitDialog action={action} onClose={() => setDialog(null)} />}
      {(dialog === "verify" || dialog === "rework") && <VerifyDialog action={action} outcome={dialog === "verify" ? "VERIFIED" : "REWORK"} onClose={() => setDialog(null)} />}
    </div>
  );
}

function EditDialog({ action, onClose }: { action: ActionDetail; onClose: () => void }) {
  const { toast } = useToast();
  const update = useUpdateAction();
  const { canPlan, canEditText } = action.permissions;
  const [finding, setFinding] = useState(action.finding);
  const [ownerId, setOwnerId] = useState(action.owner?.id ?? null);
  const [dueDate, setDueDate] = useState(action.dueDate ?? "");
  const [note, setNote] = useState("");

  function save() {
    const body = {
      ...(canEditText && finding.trim() !== action.finding ? { finding: finding.trim() } : {}),
      ...(canPlan && ownerId !== (action.owner?.id ?? null) ? { ownerId } : {}),
      ...(canPlan && dueDate !== (action.dueDate ?? "") ? { dueDate: dueDate || null } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    if (Object.keys(body).length === 0) return onClose();
    update.mutate(
      { id: action.id, body },
      {
        onSuccess: () => {
          toast("Action updated", "success");
          onClose();
        },
      },
    );
  }

  return (
    <FiveSDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit ${action.reference}`}
      size="lg"
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {!!update.error && <ErrorNote>{errorMessage(update.error)}</ErrorNote>}
        <Field label="Finding" htmlFor="edit-finding">
          <textarea id="edit-finding" rows={3} className={inputClass} value={finding} disabled={!canEditText} maxLength={2000} onChange={(e) => setFinding(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Action owner" htmlFor="edit-owner" hint={canPlan ? undefined : "Set by the area owner, HOD or a verifier."}>
            <PersonSelect id="edit-owner" value={ownerId} onChange={setOwnerId} disabled={!canPlan} />
          </Field>
          <Field label="Due date" htmlFor="edit-due" hint="Leave empty for Due date not set (never overdue).">
            <input id="edit-due" type="date" className={inputClass} value={dueDate} disabled={!canPlan} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Note for the history (optional)" htmlFor="edit-note">
          <input id="edit-note" className={inputClass} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </FiveSDialog>
  );
}

function SubmitDialog({ action, onClose }: { action: ActionDetail; onClose: () => void }) {
  const { toast } = useToast();
  const submit = useSubmitAction();
  const [description, setDescription] = useState(action.completionDescription ?? "");
  const [evidence, setEvidence] = useState<string[]>(action.completionEvidenceUrls);
  const [formError, setFormError] = useState<string | null>(null);

  function save() {
    if (!description.trim()) return setFormError("Describe what was done. A completion description is required.");
    setFormError(null);
    submit.mutate(
      { id: action.id, body: { completionDescription: description.trim(), completionEvidenceUrls: evidence } },
      {
        onSuccess: () => {
          toast("Sent for verification", "success");
          onClose();
        },
      },
    );
  }

  return (
    <FiveSDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Mark the action complete"
      description="Someone other than you will verify it before it closes."
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} onClick={save} disabled={submit.isPending}>
            {submit.isPending ? "Sending…" : "Send for verification"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {(formError || submit.error) && <ErrorNote>{formError ?? errorMessage(submit.error)}</ErrorNote>}
        <Field label="Completion description (required)" htmlFor="complete-desc">
          <textarea id="complete-desc" rows={4} className={inputClass} value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="space-y-1 text-sm font-medium text-slate-700">
          Evidence photos (optional)
          <FileUploader urls={evidence} onChange={setEvidence} folder="five-s/actions" label="Add evidence photo" />
        </div>
      </div>
    </FiveSDialog>
  );
}

function VerifyDialog({ action, outcome, onClose }: { action: ActionDetail; outcome: "VERIFIED" | "REWORK"; onClose: () => void }) {
  const { toast } = useToast();
  const verify = useVerifyAction();
  const [remarks, setRemarks] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const rework = outcome === "REWORK";

  function save() {
    if (rework && !remarks.trim()) return setFormError("Give a reason so the owner knows what to rework.");
    setFormError(null);
    verify.mutate(
      { id: action.id, body: { outcome, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) } },
      {
        onSuccess: () => {
          toast(rework ? "Returned to the owner for rework" : "Action verified and closed", "success");
          onClose();
        },
      },
    );
  }

  return (
    <FiveSDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={rework ? "Return for rework" : "Verify the action"}
      description={rework ? "The action goes back to Open with your reason." : "Check the work on site before verifying. Verifying closes the action."}
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={rework ? dangerButton : primaryButton} onClick={save} disabled={verify.isPending}>
            {verify.isPending ? "Saving…" : rework ? "Return for rework" : "Verify and close"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {(formError || verify.error) && <ErrorNote>{formError ?? errorMessage(verify.error)}</ErrorNote>}
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Completion by {action.owner?.name ?? "owner"}</p>
          <p className="mt-1 whitespace-pre-line text-slate-700">{action.completionDescription}</p>
          <div className="mt-2">
            <PhotoGallery urls={action.completionEvidenceUrls} />
          </div>
        </div>
        <Field label={rework ? "Reason (required)" : "Remarks (optional)"} htmlFor="verify-remarks">
          <textarea id="verify-remarks" rows={3} className={inputClass} value={remarks} maxLength={2000} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>
    </FiveSDialog>
  );
}
