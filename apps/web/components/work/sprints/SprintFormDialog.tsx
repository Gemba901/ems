"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useCreateSprint, useUpdateSprint } from "@/hooks/work/useWork";
import type { Sprint } from "@/services/work.service";
import { ErrorNote, Field, WorkDialog, errorMessage, inputClass, primaryButton, secondaryButton } from "@/components/work/ui";

/** Creates a sprint, or edits a planned one (the backend locks dates once a sprint starts). Mount only while open. */
export function SprintFormDialog({
  open,
  onOpenChange,
  projectId,
  sprint,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  sprint?: Sprint;
  onSaved?: (sprint: Sprint) => void;
}) {
  const create = useCreateSprint(projectId);
  const update = useUpdateSprint();
  const [name, setName] = useState(sprint?.name ?? "");
  const [goal, setGoal] = useState(sprint?.goal ?? "");
  const [startDate, setStartDate] = useState(sprint?.startDate ?? "");
  const [endDate, setEndDate] = useState(sprint?.endDate ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Enter a sprint name.";
    if (!startDate) next.startDate = "Choose a start date.";
    if (!endDate) next.endDate = "Choose an end date.";
    if (startDate && endDate && endDate < startDate) next.endDate = "The end date cannot be before the start date.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setServerError(null);
    const data = { name: name.trim(), goal: goal.trim() || null, startDate, endDate };
    try {
      const saved = sprint
        ? await update.mutateAsync({ sprintId: sprint.id, data })
        : await create.mutateAsync({ ...data, goal: data.goal ?? undefined });
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      setServerError(errorMessage(err));
    }
  }

  return (
    <WorkDialog
      open={open}
      onOpenChange={onOpenChange}
      title={sprint ? "Edit sprint" : "New sprint"}
      description="A sprint is a short, dated block of work within this project."
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" form="sprint-form" className={primaryButton} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {sprint ? "Save changes" : "Create sprint"}
          </button>
        </>
      }
    >
      <form id="sprint-form" className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field label="Name" htmlFor="sprint-name" error={errors.name}>
          <input
            id="sprint-name"
            className={inputClass}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "sprint-name-error" : undefined}
          />
        </Field>
        <Field label="Goal (optional)" htmlFor="sprint-goal" hint={`${goal.length}/500`}>
          <textarea
            id="sprint-goal"
            className={inputClass}
            rows={2}
            maxLength={500}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            aria-describedby="sprint-goal-hint"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="sprint-start" error={errors.startDate}>
            <input
              id="sprint-start"
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-invalid={!!errors.startDate}
              aria-describedby={errors.startDate ? "sprint-start-error" : undefined}
            />
          </Field>
          <Field label="End date" htmlFor="sprint-end" error={errors.endDate}>
            <input
              id="sprint-end"
              type="date"
              className={inputClass}
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              aria-invalid={!!errors.endDate}
              aria-describedby={errors.endDate ? "sprint-end-error" : undefined}
            />
          </Field>
        </div>
        {serverError && <ErrorNote>{serverError}</ErrorNote>}
      </form>
    </WorkDialog>
  );
}
