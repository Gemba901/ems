"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useAddCorrectiveAction, useRemoveCorrectiveAction, useUpdateCorrectiveAction } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import type { ActionDetail, CorrectiveActionView } from "@/services/five-s.service";
import { DueDate, ErrorNote, Field, PersonSelect, Surface, errorMessage, formatTimestamp, inputClass, primaryButton, secondaryButton } from "@/components/five-s/ui";
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
    <Surface>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <h2 className="text-base font-semibold text-slate-900">Corrective actions</h2>
        {total > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="tabular-nums">
              {done} of {total} done
            </span>
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(done / total) * 100}%` }} />
            </span>
          </div>
        )}
      </div>

      {total === 0 && !adding && (
        <p className="px-5 py-4 text-sm text-slate-500">
          No corrective actions yet.{canManage ? " Add the steps that will fix the finding." : ""}
        </p>
      )}

      {total > 0 && (
        <ul className="divide-y divide-slate-100">
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
        <div className="border-t border-slate-100 px-5 py-4">
          {adding ? (
            <StepForm actionId={action.id} onDone={() => setAdding(false)} />
          ) : (
            <button type="button" className={secondaryButton} onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add corrective action
            </button>
          )}
        </div>
      )}
    </Surface>
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
  const isDone = !!step.completedAt;
  const error = update.error ?? remove.error;

  function toggle() {
    update.mutate({ id: actionId, stepId: step.id, body: { done: !isDone } });
  }

  function del() {
    if (!window.confirm(`Remove step ${index + 1}: "${step.description}"?`)) return;
    remove.mutate({ id: actionId, stepId: step.id }, { onSuccess: () => toast("Corrective action removed", "success") });
  }

  return (
    <li className="flex items-start gap-3 px-5 py-4">
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={`${isDone ? "Reopen" : "Mark done"}: ${step.description}`}
        title={step.canComplete ? undefined : "Only the step owner, the action owner or the area coordinators can tick this step"}
        disabled={!step.canComplete || update.isPending}
        onClick={toggle}
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
          isDone ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white hover:border-emerald-500",
        )}
      >
        {isDone && <Check className="h-4 w-4" aria-hidden="true" />}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn("whitespace-pre-line text-sm", isDone ? "text-slate-500 line-through" : "text-slate-900")}>
          <span className="mr-1 font-medium text-slate-500">{index + 1}.</span>
          {step.description}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>Owner: {step.owner?.name ?? "Not assigned"}</span>
          {isDone ? (
            <span className="text-emerald-700">
              Done by {step.completedBy?.name ?? "—"} · {formatTimestamp(step.completedAt)}
            </span>
          ) : (
            <DueDate date={step.dueDate} overdue={step.isOverdue} />
          )}
        </div>
        {!!error && <ErrorNote>{errorMessage(error)}</ErrorNote>}
      </div>
      {canManage && (
        <div className="flex shrink-0 gap-1">
          <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={onEdit} aria-label={`Edit step ${index + 1}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
            onClick={del}
            disabled={remove.isPending}
            aria-label={`Remove step ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
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
      {(formError || add.error || update.error) && <ErrorNote>{formError ?? errorMessage(add.error ?? update.error)}</ErrorNote>}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem_10rem] lg:items-end">
        <Field label={step ? "Corrective action" : "New corrective action"} htmlFor={`step-${key}-description`}>
          <input
            id={`step-${key}-description`}
            className={inputClass}
            value={draft.description}
            maxLength={2000}
            placeholder="What will be done"
            autoFocus
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>
        <Field label="Owner" htmlFor={`step-${key}-owner`}>
          <PersonSelect
            id={`step-${key}-owner`}
            value={draft.ownerId}
            onChange={(ownerId) => setDraft({ ...draft, ownerId })}
            emptyLabel={step ? "Not assigned" : "Action owner"}
          />
        </Field>
        <Field label="Due date" htmlFor={`step-${key}-due`}>
          <input id={`step-${key}-due`} type="date" className={inputClass} value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onDone}>
          Cancel
        </button>
        <button type="button" className={primaryButton} onClick={save} disabled={pending}>
          {pending ? "Saving…" : step ? "Save" : "Add"}
        </button>
      </div>
    </div>
  );
}
