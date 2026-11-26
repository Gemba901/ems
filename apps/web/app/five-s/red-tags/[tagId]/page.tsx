"use client";

import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { WorkflowDialog } from "@/components/five-s/WorkflowDialog";
import { FormField } from "@/components/patterns/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Info, Pencil } from "lucide-react";
import { useDecideRedTag, useFiveSCapabilities, useFiveSRedTag, useResolveRedTag, useUpdateRedTag } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { RED_TAG_DECISIONS, RED_TAG_DECISION_LABELS, RED_TAG_REASON_LABELS, type RedTagDecision, type RedTagView } from "@/services/five-s.service";
import { RedTagForm } from "@/components/five-s/red-tags/RedTagForm";
import {
  HEADER_ACTIONS,
  KeyValue,
  PhotoGallery,
  RedTagStatusBadge,
  errorMessage,
  formatDate,
  formatTimestamp,
  today,
} from "@/components/five-s/ui";
import { cn } from "@/lib/utils";

export default function RedTagDetailPage() {
  const { tagId } = useParams<{ tagId: string }>();
  const { data: tag, isLoading, error, refetch } = useFiveSRedTag(tagId);
  const { data: caps } = useFiveSCapabilities();
  const [dialog, setDialog] = useState<"edit" | "decide" | "resolve" | null>(null);

  if (isLoading) return <LoadingState label="Loading red tag…" />;
  if (error || !tag) return <ErrorState title="Unable to load red tag" description={errorMessage(error, "Red tag not found")} onRetry={() => void refetch()} />;
  const todayStr = caps?.today ?? today();

  const steps = [
    { label: "Tagged", done: true, detail: `${formatDate(tag.raisedOn)} by ${tag.raisedBy?.name ?? "—"}` },
    { label: "Decision", done: !!tag.decision, detail: tag.decision ? `${tag.decisionLabel} · ${formatTimestamp(tag.decidedAt)}` : "Awaiting review" },
    { label: "Disposition", done: tag.status === "RESOLVED", detail: tag.resolvedOn ? formatDate(tag.resolvedOn) : "Not yet carried out" },
  ];

  return (
    <div className="space-y-section">
      <Link href="/five-s/red-tags" className={buttonVariants({ variant: "ghost" })}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Red-tag register
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{tag.itemName}</h1>
            <RedTagStatusBadge status={tag.status} />
            {tag.reviewOverdue && <Badge variant="danger">Review overdue</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {tag.reference} ·{" "}
            <Link href={`/five-s/areas/${tag.area.id}`} className="text-primary hover:underline">
              {tag.area.name}
            </Link>
          </p>
        </div>
        <div className={HEADER_ACTIONS}>
          {tag.permissions.canEdit && (
            <Button type="button" variant="outline" onClick={() => setDialog("edit")}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
            </Button>
          )}
          {tag.permissions.canDecide && (
            <Button type="button" variant={tag.status === "PENDING" ? "default" : "outline"} onClick={() => setDialog("decide")}>
              {tag.decision ? "Change decision" : "Record decision"}
            </Button>
          )}
          {tag.permissions.canResolve && (
            <Button type="button" onClick={() => setDialog("resolve")}>
              Record disposition
            </Button>
          )}
        </div>
      </header>

      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.label} className={cn("rounded-lg border p-3", s.done ? "border-success/30 bg-success-subtle" : "border-border bg-card")}>
            <p className={cn("text-xs font-semibold uppercase tracking-wide", s.done ? "text-success" : "text-muted-foreground")}>
              {i + 1}. {s.label}
            </p>
            <p className="mt-0.5 text-sm text-foreground">{s.detail}</p>
          </li>
        ))}
      </ol>
      {tag.isPending && (
        <p className="text-xs text-muted-foreground">This tag stays pending until both the decision and the disposition are recorded.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="block p-5">
          <h2 className="mb-3 text-base font-semibold text-foreground">Item</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <KeyValue label="Location">{tag.location}</KeyValue>
            <KeyValue label="Quantity">{tag.quantity || "—"}</KeyValue>
            <KeyValue label="Reason">{RED_TAG_REASON_LABELS[tag.reason]}</KeyValue>
            <KeyValue label="Tag owner">{tag.owner?.name ?? "—"}</KeyValue>
            <KeyValue label="Review by">{tag.reviewDueDate ? formatDate(tag.reviewDueDate) : "Not set"}</KeyValue>
            <KeyValue label="Raised by">{tag.raisedBy?.name ?? "—"}</KeyValue>
            {tag.reasonDetails && (
              <div className="sm:col-span-2">
                <KeyValue label="Reason details">
                  <span className="whitespace-pre-line">{tag.reasonDetails}</span>
                </KeyValue>
              </div>
            )}
          </dl>
          <div className="mt-4">
            <PhotoGallery urls={tag.photoUrls} emptyText="No photos." />
          </div>
        </Card>

        <Card className="block p-5">
          <h2 className="mb-3 text-base font-semibold text-foreground">Decision and disposition</h2>
          {!tag.decision ? (
            <p className="text-sm text-muted-foreground">No decision yet.</p>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              <KeyValue label="Decision">{tag.decisionLabel}</KeyValue>
              <KeyValue label="Decided by">
                {tag.decidedBy?.name ?? "—"} · {formatTimestamp(tag.decidedAt)}
              </KeyValue>
              <KeyValue label="Company approval reference">{tag.approvalReference || "—"}</KeyValue>
              {tag.decisionNotes && (
                <div className="sm:col-span-2">
                  <KeyValue label="Decision notes">
                    <span className="whitespace-pre-line">{tag.decisionNotes}</span>
                  </KeyValue>
                </div>
              )}
              {tag.status === "RESOLVED" && (
                <>
                  <KeyValue label="Disposition recorded by">{tag.resolvedBy?.name ?? "—"}</KeyValue>
                  <KeyValue label="Carried out on">{formatDate(tag.resolvedOn)}</KeyValue>
                  <div className="sm:col-span-2">
                    <KeyValue label="What was done">
                      <span className="whitespace-pre-line">{tag.resolutionDetails}</span>
                    </KeyValue>
                  </div>
                </>
              )}
            </dl>
          )}
          <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Disposing of or writing off company assets follows the company approval process; record its reference here. This register never deletes asset records.
          </p>
        </Card>
      </div>

      {dialog === "edit" && <EditDialog tag={tag} maxDate={todayStr} onClose={() => setDialog(null)} />}
      {dialog === "decide" && <DecideDialog tag={tag} onClose={() => setDialog(null)} />}
      {dialog === "resolve" && <ResolveDialog tag={tag} maxDate={todayStr} onClose={() => setDialog(null)} />}
    </div>
  );
}

function EditDialog({ tag, maxDate, onClose }: { tag: RedTagView; maxDate: string; onClose: () => void }) {
  const { toast } = useToast();
  const update = useUpdateRedTag();
  const { data: caps } = useFiveSCapabilities();
  // The backend only lets coordinators change the owner; the raiser can edit everything else.
  const canSetOwner = !!caps && (caps.isModuleAdmin || caps.isVerifier || tag.raisedBy?.id !== caps.employeeId);
  return (
    <WorkflowDialog open onOpenChange={(o) => !o && onClose()} title={`Edit ${tag.reference}`} size="lg">
      <RedTagForm
        mode="edit"
        maxDate={maxDate}
        canSetOwner={canSetOwner}
        initial={{
          areaId: tag.area.id,
          itemName: tag.itemName,
          location: tag.location,
          quantity: tag.quantity,
          reason: tag.reason,
          reasonDetails: tag.reasonDetails,
          ownerId: tag.owner?.id ?? null,
          raisedOn: tag.raisedOn,
          reviewDueDate: tag.reviewDueDate,
          photoUrls: tag.photoUrls,
        }}
        submitLabel="Save changes"
        busy={update.isPending}
        error={update.error ? errorMessage(update.error) : null}
        onCancel={onClose}
        onSubmit={(values) => {
          // Area and raised-on date are fixed once a tag exists.
          const rest: Partial<typeof values> = { ...values };
          delete rest.areaId;
          delete rest.raisedOn;
          delete rest.ownerId;
          const ownerId = values.ownerId;
          return update.mutate(
            { id: tag.id, body: { ...rest, ...(canSetOwner && ownerId !== (tag.owner?.id ?? null) ? { ownerId } : {}) } },
            {
              onSuccess: () => {
                toast("Red tag updated", "success");
                onClose();
              },
            },
          );
        }}
      />
    </WorkflowDialog>
  );
}

function DecideDialog({ tag, onClose }: { tag: RedTagView; onClose: () => void }) {
  const { toast } = useToast();
  const decide = useDecideRedTag();
  const [decision, setDecision] = useState<RedTagDecision | "">(tag.decision ?? "");
  const [notes, setNotes] = useState(tag.decisionNotes ?? "");
  const [approval, setApproval] = useState(tag.approvalReference ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  function save() {
    if (!decision) return setFormError("Choose a decision.");
    if (decision === "DISPOSE" && !approval.trim()) return setFormError("Disposal needs the company approval reference.");
    setFormError(null);
    decide.mutate(
      { id: tag.id, body: { decision, decisionNotes: notes.trim() || null, approvalReference: approval.trim() || null } },
      {
        onSuccess: () => {
          toast("Decision recorded. The tag stays pending until the disposition is recorded.", "success");
          onClose();
        },
      },
    );
  }

  return (
    <WorkflowDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Record the decision"
      description="What should happen to this item?"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={decide.isPending}>
            {decide.isPending ? "Saving…" : "Save decision"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {(formError || !!decide.error) && <ErrorState description={formError ?? errorMessage(decide.error)} />}
        <FormField label="Decision" id="tag-decision" required>
          <NativeSelect id="tag-decision" className="w-full" value={decision} onChange={(e) => setDecision(e.target.value as RedTagDecision)}>
            <option value="">Choose…</option>
            {RED_TAG_DECISIONS.map((d) => (
              <option key={d} value={d}>
                {RED_TAG_DECISION_LABELS[d]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          label="Company approval reference"
          required={decision === "DISPOSE"}
          id="tag-approval"
          description="For example the asset write-off or disposal form number."
        >
          <Input id="tag-approval" value={approval} maxLength={120} onChange={(e) => setApproval(e.target.value)} />
        </FormField>
        <FormField label="Notes" id="tag-notes">
          <Textarea id="tag-notes" rows={3} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
      </div>
    </WorkflowDialog>
  );
}

function ResolveDialog({ tag, maxDate, onClose }: { tag: RedTagView; maxDate: string; onClose: () => void }) {
  const { toast } = useToast();
  const resolve = useResolveRedTag();
  const [details, setDetails] = useState("");
  const [resolvedOn, setResolvedOn] = useState(maxDate);
  const [formError, setFormError] = useState<string | null>(null);

  function save() {
    if (!details.trim()) return setFormError("Describe what was done with the item.");
    if (!resolvedOn) return setFormError("Enter the date the disposition was carried out.");
    if (resolvedOn > maxDate) return setFormError("The date cannot be in the future.");
    if (resolvedOn < tag.raisedOn) return setFormError("The date cannot be before the tag was raised.");
    setFormError(null);
    resolve.mutate(
      { id: tag.id, body: { resolutionDetails: details.trim(), resolvedOn } },
      {
        onSuccess: () => {
          toast("Disposition recorded. Red tag resolved.", "success");
          onClose();
        },
      },
    );
  }

  return (
    <WorkflowDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Record the disposition"
      description={`Decision: ${tag.decisionLabel}. Record what was actually done.`}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={resolve.isPending}>
            {resolve.isPending ? "Saving…" : "Resolve tag"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {(formError || !!resolve.error) && <ErrorState description={formError ?? errorMessage(resolve.error)} />}
        <FormField label="What was done" id="tag-resolution" required description="e.g. Moved to central stores bay 4; sent for repair on job card 1123.">
          <Textarea id="tag-resolution" rows={3} value={details} maxLength={2000} onChange={(e) => setDetails(e.target.value)} />
        </FormField>
        <FormField label="Carried out on" id="tag-resolved-on" required>
          <Input id="tag-resolved-on" type="date" value={resolvedOn} min={tag.raisedOn} max={maxDate} onChange={(e) => setResolvedOn(e.target.value)} />
        </FormField>
      </div>
    </WorkflowDialog>
  );
}
