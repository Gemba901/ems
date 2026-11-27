"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/patterns/ErrorState";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/patterns/FormField";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/patterns/LoadingState";
import { WorkflowDialog } from "@/components/five-s/WorkflowDialog";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Info, Lightbulb, Pencil, Repeat, Users } from "lucide-react";
import { useFiveSAction, useFiveSCapabilities, useRaiseKaizen, useRaiseSga, useSubmitAction, useUpdateAction, useVerifyAction } from "@/hooks/five-s/useFiveS";
import { useOrgModules } from "@/hooks/useOrgModules";
import { useToast } from "@/contexts/toast.context";
import { countLabel } from "@/lib/five-s/scoring";
import { ACTION_EVENT_LABELS, type ActionDetail, type ActionStatus } from "@/services/five-s.service";
import {
  ActionStatusBadge,
  DueDate,
  FileUploader,
  HEADER_ACTIONS,
  KeyValue,
  PersonSelect,
  PhotoGallery,
  PracticeBadge,
  errorMessage,
  formatDate,
  formatTimestamp,
} from "@/components/five-s/ui";
import { CorrectiveActions } from "@/components/five-s/actions/CorrectiveActions";
import { cn } from "@/lib/utils";

const FLOW: ActionStatus[] = ["OPEN", "AWAITING_VERIFICATION", "VERIFIED"];

export default function ActionDetailPage() {
  const { actionId } = useParams<{ actionId: string }>();
  const { data: action, isLoading, error, refetch } = useFiveSAction(actionId);
  const { data: caps } = useFiveSCapabilities();
  const [dialog, setDialog] = useState<"edit" | "submit" | "verify" | "rework" | "kaizen" | "sga" | null>(null);
  const { hasModule } = useOrgModules();

  if (isLoading) return <LoadingState label="Loading action…" />;
  if (error || !action) return <ErrorState title="Unable to load improvement action" description={errorMessage(error, "Action not found")} onRetry={() => void refetch()} />;

  const isOwner = !!caps && action.owner?.id === caps.employeeId;
  const stepIndex = FLOW.indexOf(action.status);
  const lastRework = [...action.history].reverse().find((h) => h.type === "RETURNED_FOR_REWORK");

  return (
    <div className="space-y-section">
      <Link href="/five-s/actions" className={buttonVariants({ variant: "ghost" })}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Improvement actions
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{action.reference}</h1>
            <PracticeBadge practice={action.practice} />
            <ActionStatusBadge status={action.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href={`/five-s/areas/${action.area.id}`} className="text-primary hover:underline">
              {action.area.name}
            </Link>
            {action.audit ? (
              <>
                {" "}
                · from{" "}
                <Link href={`/five-s/audits/${action.audit.id}`} className="text-primary hover:underline">
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
          {action.permissions.canRaiseKaizen && hasModule("KAIZEN") && (
            <Button type="button" variant="outline" onClick={() => setDialog("kaizen")}>
              <Lightbulb className="h-4 w-4" aria-hidden="true" /> Raise Kaizen
            </Button>
          )}
          {(action.permissions.canPlan || action.permissions.canEditText) && (
            <Button type="button" variant="outline" onClick={() => setDialog("edit")}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
            </Button>
          )}
          {action.permissions.canSubmit && (
            <Button
              type="button"
              onClick={() => setDialog("submit")}
              disabled={!action.permissions.allStepsDone}
              title={action.permissions.allStepsDone ? undefined : "Tick every corrective action done first"}
            >
              Mark complete
            </Button>
          )}
          {action.permissions.canVerify && (
            <>
              <Button type="button" variant="destructive" onClick={() => setDialog("rework")}>
                Return for rework
              </Button>
              <Button type="button" onClick={() => setDialog("verify")}>
                Verify
              </Button>
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
              i < stepIndex ? "bg-success-subtle text-success" : i === stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {["Open", "Awaiting verification", "Verified"][i]}
          </li>
        ))}
      </ol>

      {action.status === "OPEN" && lastRework && (
        <ErrorState title="Returned for rework" description={`Returned by ${lastRework.actor?.name ?? "the verifier"} on ${formatTimestamp(lastRework.createdAt)}${lastRework.note ? `: ${lastRework.note}` : ""}`} />
      )}
      {action.repeatFinding && (
        <RepeatFindingNote action={action} canRaise={action.permissions.canRaiseSga && hasModule("SGA")} onRaise={() => setDialog("sga")} />
      )}
      {action.permissions.canSubmit && !action.permissions.allStepsDone && (
        <p className="rounded-lg bg-warning-subtle px-4 py-2 text-sm text-warning">
          {action.correctiveActionProgress.total === 0
            ? "Add at least one corrective action. You can mark the action complete once every corrective action is done."
            : `${action.correctiveActionProgress.total - action.correctiveActionProgress.done} of ${action.correctiveActionProgress.total} corrective actions still to do. You can mark the action complete once they are all done.`}
        </p>
      )}
      {action.status === "AWAITING_VERIFICATION" && isOwner && (
        <p className="rounded-lg bg-info-subtle px-4 py-2 text-sm text-info">Waiting for someone else to verify. You cannot verify an action you own.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-section">
          <Card className="block space-y-4 p-5">
            {action.checkpointText && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Checkpoint {action.checkpointNo} · {action.practiceLabel}
                </p>
                <p className="mt-1 text-foreground">{action.checkpointText}</p>
                {action.locationCount != null && <p className="mt-1 text-xs text-muted-foreground">{countLabel(action.locationCount)} problem location(s) recorded</p>}
              </div>
            )}
            <KeyValue label="Finding">
              <span className="whitespace-pre-line">{action.finding}</span>
            </KeyValue>
          </Card>

          <CorrectiveActions action={action} />

          {action.completionDescription && (
            <Card className="block space-y-3 p-5">
              <h2 className="text-base font-semibold text-foreground">Completion</h2>
              <p className="whitespace-pre-line text-sm text-foreground">{action.completionDescription}</p>
              <PhotoGallery urls={action.completionEvidenceUrls} emptyText="No evidence attached." />
              <p className="text-xs text-muted-foreground">Submitted {formatTimestamp(action.submittedAt)}</p>
              {action.status === "VERIFIED" && (
                <p className="text-sm text-success">
                  Verified by {action.verifiedBy?.name ?? "—"} on {formatTimestamp(action.verifiedAt)}
                  {action.verificationRemarks ? `: ${action.verificationRemarks}` : ""}
                </p>
              )}
            </Card>
          )}

          <Card className="block gap-0 py-0">
            <h2 className="border-b border-border px-5 py-3 text-base font-semibold text-foreground">History</h2>
            <ol className="space-y-4 px-5 py-4">
              {action.history.map((h) => (
                <li key={h.id} className="relative border-l-2 border-border pl-4">
                  <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">{ACTION_EVENT_LABELS[h.type]}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.actor?.name ?? "System"} · {formatTimestamp(h.createdAt)}
                  </p>
                  {(h.fromValue || h.toValue) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {h.fromValue ?? "—"} → {h.toValue ?? "—"}
                    </p>
                  )}
                  {h.note && <p className="mt-0.5 whitespace-pre-line text-sm text-foreground">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-section">
          <Card className="block p-5">
            <dl className="space-y-3">
              <KeyValue label="Action owner">{action.owner?.name ?? "Not assigned"}</KeyValue>
              <KeyValue label="Due date">
                <DueDate date={action.dueDate} overdue={action.isOverdue} />
              </KeyValue>
              <KeyValue label="Raised by">
                {action.createdBy?.name ?? "—"} · {formatTimestamp(action.createdAt)}
              </KeyValue>
              {action.kaizen && (
                <KeyValue label="Kaizen">
                  <Link href={`/kaizen/${action.kaizen.id}`} className="font-medium text-success hover:underline">
                    {action.kaizen.title || "Kaizen raised from this finding"}
                  </Link>
                </KeyValue>
              )}
              {action.sga && (
                <KeyValue label="SGA">
                  <Link href={`/sga/${action.sga.id}`} className="font-medium text-primary hover:underline">
                    {action.sga.title || "SGA raised for this repeat finding"}
                  </Link>
                </KeyValue>
              )}
            </dl>
          </Card>
          <p className="flex items-start gap-1.5 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Closing this action does not change the audit score. The improvement shows in the next submitted audit of the area.
          </p>
        </aside>
      </div>

      {dialog === "edit" && <EditDialog action={action} onClose={() => setDialog(null)} />}
      {dialog === "submit" && <SubmitDialog action={action} onClose={() => setDialog(null)} />}
      {(dialog === "verify" || dialog === "rework") && <VerifyDialog action={action} outcome={dialog === "verify" ? "VERIFIED" : "REWORK"} onClose={() => setDialog(null)} />}
      {dialog === "kaizen" && <RaiseKaizenDialog action={action} onClose={() => setDialog(null)} />}
      {dialog === "sga" && <RaiseSgaDialog action={action} onClose={() => setDialog(null)} />}
    </div>
  );
}

// Join 7: a finding that needs a real improvement (not just a clean-up) becomes a Kaizen. The
// Kaizen starts as a draft prefilled from the finding; this action carries on with its own steps.
function RaiseKaizenDialog({ action, onClose }: { action: ActionDetail; onClose: () => void }) {
  const { toast } = useToast();
  const raise = useRaiseKaizen();
  const [ownerId, setOwnerId] = useState(action.owner?.id ?? null);

  function save() {
    raise.mutate(
      { id: action.id, body: ownerId ? { kaizenOwnerId: ownerId } : {} },
      {
        onSuccess: () => {
          toast("Kaizen raised", "success");
          onClose();
        },
      },
    );
  }

  return (
    <WorkflowDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Raise a Kaizen from ${action.reference}`}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={raise.isPending || !ownerId}>
            {raise.isPending ? "Raising…" : "Raise Kaizen"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!!raise.error && <ErrorState title="Unable to complete the action" description={errorMessage(raise.error)} />}
        <p className="text-sm text-muted-foreground">
          A draft Kaizen is created with this finding as its current condition. The owner completes it in the Kaizen module. This action stays open
          until its own corrective actions are done and verified.
        </p>
        <FormField label="Kaizen owner" id="kaizen-owner">
          <PersonSelect id="kaizen-owner" value={ownerId} onChange={setOwnerId} />
        </FormField>
      </div>
    </WorkflowDialog>
  );
}

// Join 8: the checkpoint failed in each of the area's last few audits, so clean-ups aren't holding.
// Suggests a Small Group Activity to find and fix the cause; it is never raised on its own.
function RepeatFindingNote({ action, canRaise, onRaise }: { action: ActionDetail; canRaise: boolean; onRaise: () => void }) {
  const repeat = action.repeatFinding!;
  const sga = action.sga ?? repeat.openSga;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning-subtle p-4 text-sm text-warning sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2">
        <Repeat className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Repeat finding: checkpoint {action.checkpointNo} failed in each of the last {repeat.audits.length} audits (
          {repeat.audits.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ", "}
              <Link href={`/five-s/audits/${a.id}`} className="font-medium underline">
                {a.reference}
              </Link>
            </span>
          ))}
          ).{" "}
          {sga ? (
            <>
              An SGA is working on it:{" "}
              <Link href={`/sga/${sga.id}`} className="font-medium underline">
                {sga.title || "open SGA"}
              </Link>
              .
            </>
          ) : canRaise ? (
            "A Small Group Activity can find and fix the cause."
          ) : (
            "An area coordinator can raise a Small Group Activity to fix the cause."
          )}
        </span>
      </p>
      {!sga && canRaise && (
        <Button type="button" variant="outline" onClick={onRaise}>
          <Users className="h-4 w-4" aria-hidden="true" /> Raise SGA
        </Button>
      )}
    </div>
  );
}

function RaiseSgaDialog({ action, onClose }: { action: ActionDetail; onClose: () => void }) {
  const { toast } = useToast();
  const raise = useRaiseSga();
  const [ownerId, setOwnerId] = useState<string | null>(null);

  function save() {
    raise.mutate(
      { id: action.id, body: ownerId ? { ownerId } : {} },
      {
        onSuccess: () => {
          toast("SGA raised", "success");
          onClose();
        },
      },
    );
  }

  return (
    <WorkflowDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Raise an SGA for ${action.area.name}, checkpoint ${action.checkpointNo}`}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={raise.isPending}>
            {raise.isPending ? "Raising…" : "Raise SGA"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!!raise.error && <ErrorState title="Unable to complete the action" description={errorMessage(raise.error)} />}
        <p className="text-sm text-muted-foreground">
          A draft SGA is created with the repeat finding as its problem. The owner completes it and picks the team in the SGA module. This action
          carries on with its own corrective actions.
        </p>
        <FormField label="SGA owner" id="sga-owner" description="Leave empty for the area owner.">
          <PersonSelect id="sga-owner" value={ownerId} onChange={setOwnerId} />
        </FormField>
      </div>
    </WorkflowDialog>
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
    <WorkflowDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit ${action.reference}`}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!!update.error && <ErrorState title="Unable to complete the action" description={errorMessage(update.error)} />}
        <FormField label="Finding" id="edit-finding">
          <Textarea id="edit-finding" rows={3} value={finding} disabled={!canEditText} maxLength={2000} onChange={(e) => setFinding(e.target.value)} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Action owner" id="edit-owner" description={canPlan ? undefined : "Set by the area owner, HOD or a verifier."}>
            <PersonSelect id="edit-owner" value={ownerId} onChange={setOwnerId} disabled={!canPlan} />
          </FormField>
          <FormField label="Due date" id="edit-due" description="Leave empty for Due date not set (never overdue).">
            <Input id="edit-due" type="date" value={dueDate} disabled={!canPlan} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Note for the history (optional)" id="edit-note">
          <Input id="edit-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </div>
    </WorkflowDialog>
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
    <WorkflowDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Mark the action complete"
      description="Someone other than you will verify it before it closes."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={submit.isPending}>
            {submit.isPending ? "Sending…" : "Send for verification"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {(formError || !!submit.error) && <ErrorState title="Unable to complete the action" description={formError ?? errorMessage(submit.error)} />}
        <FormField label="Completion description (required)" id="complete-desc">
          <Textarea id="complete-desc" rows={4} value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        <div className="space-y-1 text-sm font-medium text-foreground">
          Evidence photos (optional)
          <FileUploader urls={evidence} onChange={setEvidence} folder="five-s/actions" label="Add evidence photo" />
        </div>
      </div>
    </WorkflowDialog>
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
    <WorkflowDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={rework ? "Return for rework" : "Verify the action"}
      description={rework ? "The action goes back to Open with your reason." : "Check the work on site before verifying. Verifying closes the action."}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant={rework ? "destructive" : "default"} onClick={save} disabled={verify.isPending}>
            {verify.isPending ? "Saving…" : rework ? "Return for rework" : "Verify and close"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {(formError || !!verify.error) && <ErrorState title="Unable to complete the action" description={formError ?? errorMessage(verify.error)} />}
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Completion by {action.owner?.name ?? "owner"}</p>
          <p className="mt-1 whitespace-pre-line text-foreground">{action.completionDescription}</p>
          <div className="mt-2">
            <PhotoGallery urls={action.completionEvidenceUrls} />
          </div>
        </div>
        <FormField label={rework ? "Reason (required)" : "Remarks (optional)"} id="verify-remarks">
          <Textarea id="verify-remarks" rows={3} value={remarks} maxLength={2000} onChange={(e) => setRemarks(e.target.value)} />
        </FormField>
      </div>
    </WorkflowDialog>
  );
}
