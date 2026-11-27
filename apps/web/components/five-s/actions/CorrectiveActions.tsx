"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/patterns/ErrorState";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/patterns/FormField";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/patterns/ConfirmDialog";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAddCorrectiveAction, useRemoveCorrectiveAction, useUpdateCorrectiveAction } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import type { ActionDetail, CorrectiveActionView } from "@/services/five-s.service";
import { DueDate, PersonSelect, errorMessage, formatTimestamp } from "@/components/five-s/ui";
import { cn } from "@/lib/utils";

// The steps of an action plan. Each step has its own owner and due date and is ticked done on its
// own; the plan owner can only send the action for verification once every step is done.

type Draft = { description: string; ownerId: string | null; dueDate: string };

export function CorrectiveActions({ action }: { action: ActionDetail }) {
  const { done, total } = action.correctiveActionProgress;
  const canManage = action.permissions.canManageSteps;
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Card className="block gap-0 py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-base font-semibold text-foreground">Corrective actions</h2>
        {total > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {done} of {total} done
            </span>
            <Progress className="w-24" value={done} max={total} aria-label="Corrective steps completed" />
          </div>
        )}
      </div>

      {total === 0 && !adding && (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          No corrective actions yet.{canManage ? " Add the steps that will fix the finding." : ""}
        </p>
      )}

      {total > 0 && (
        <ul className="divide-y divide-border">
          {action.correctiveActions.map((step, i) =>
            editingId === step.id ? (
              <li key={step.id} className="px-5 py-4">
                <StepForm actionId={action.id} step={step} onDone={() => setEditingId(null)} />
              </li>
            ) : (
              <StepRow key={step.id} actionId={action.id} step={step} index={i} canManage={canManage} onEdit={() => setEditingId(step.id)} />
            ),
          )}
        </ul>
      )}

      {canManage && (
        <div className="border-t border-border px-5 py-4">
          {adding ? (
            <StepForm actionId={action.id} onDone={() => setAdding(false)} />
          ) : (
            <Button type="button" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add corrective action
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function StepRow({
  actionId,
  step,
  index,
  canManage,
  onEdit,
}: {
  actionId: string;
  step: CorrectiveActionView;
  index: number;
  canManage: boolean;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const update = useUpdateCorrectiveAction();
  const remove = useRemoveCorrectiveAction();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const isDone = !!step.completedAt;
  const error = update.error ?? remove.error;

  function toggle() {
    update.mutate({ id: actionId, stepId: step.id, body: { done: !isDone } });
  }

  async function deleteStep() {
    await remove.mutateAsync({ id: actionId, stepId: step.id });
    toast("Corrective action removed", "success");
  }

  return (
    <li className="flex items-start gap-3 px-5 py-4">
      <Checkbox
        checked={isDone}
        aria-label={`${isDone ? "Reopen" : "Mark done"}: ${step.description}`}
        title={step.canComplete ? undefined : "Only the step owner, the action owner or the area coordinators can tick this step"}
        disabled={!step.canComplete || update.isPending}
        onCheckedChange={toggle}
        className="mt-0.5 size-6"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn("whitespace-pre-line text-sm", isDone ? "text-muted-foreground line-through" : "text-foreground")}>
          <span className="mr-1 font-medium text-muted-foreground">{index + 1}.</span>
          {step.description}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Owner: {step.owner?.name ?? "Not assigned"}</span>
          {isDone ? (
            <span className="text-success">
              Done by {step.completedBy?.name ?? "—"} · {formatTimestamp(step.completedAt)}
            </span>
          ) : (
            <DueDate date={step.dueDate} overdue={step.isOverdue} />
          )}
        </div>
        {!!error && <ErrorState title="Unable to complete the action" description={errorMessage(error)} />}
      </div>
      {canManage && (
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit step ${index + 1}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="hover:text-danger"
            onClick={() => setConfirmRemove(true)}
            disabled={remove.isPending}
            aria-label={`Remove step ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
      {canManage && (
        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title={`Remove step ${index + 1}?`}
          description={step.description}
          confirmLabel="Remove step"
          destructive
          onConfirm={deleteStep}
        />
      )}
    </li>
  );
}

// Adds a new step, or edits an existing one when `step` is given.
function StepForm({ actionId, step, onDone }: { actionId: string; step?: CorrectiveActionView; onDone: () => void }) {
  const { toast } = useToast();
  const add = useAddCorrectiveAction();
  const update = useUpdateCorrectiveAction();
  const [draft, setDraft] = useState<Draft>({ description: step?.description ?? "", ownerId: step?.owner?.id ?? null, dueDate: step?.dueDate ?? "" });
  const [formError, setFormError] = useState<string | null>(null);
  const pending = add.isPending || update.isPending;
  const key = step?.id ?? "new";

  function save() {
    const description = draft.description.trim();
    if (description.length < 3) return setFormError("Describe the step in at least 3 characters.");
    setFormError(null);
    const dueDate = draft.dueDate || null;
    const onSuccess = () => {
      toast(step ? "Corrective action updated" : "Corrective action added", "success");
      onDone();
    };
    if (step) update.mutate({ id: actionId, stepId: step.id, body: { description, ownerId: draft.ownerId, dueDate } }, { onSuccess });
    // A new step sent without an owner goes to the action owner on the server.
    else add.mutate({ id: actionId, body: { description, dueDate, ...(draft.ownerId ? { ownerId: draft.ownerId } : {}) } }, { onSuccess });
  }

  return (
    <div className="space-y-3">
      {(formError || !!add.error || !!update.error) && <ErrorState title="Unable to complete the action" description={formError ?? errorMessage(add.error ?? update.error)} />}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem_10rem] lg:items-end">
        <FormField label={step ? "Corrective action" : "New corrective action"} id={`step-${key}-description`}>
          <Input
            id={`step-${key}-description`}
            value={draft.description}
            maxLength={2000}
            placeholder="What will be done"
            autoFocus
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </FormField>
        <FormField label="Owner" id={`step-${key}-owner`}>
          <PersonSelect
            id={`step-${key}-owner`}
            value={draft.ownerId}
            onChange={(ownerId) => setDraft({ ...draft, ownerId })}
            emptyLabel={step ? "Not assigned" : "Action owner"}
          />
        </FormField>
        <FormField label="Due date" id={`step-${key}-due`}>
          <Input id={`step-${key}-due`} type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
        </FormField>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : step ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
