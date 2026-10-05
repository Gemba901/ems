"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useCreateTask } from "@/hooks/work/useWork";
import { TASK_STATUS_LABELS, TASK_STATUSES, type ProjectMember, type Sprint, type WorkTaskStatus } from "@/services/work.service";
import { ErrorNote, Field, WorkDialog, errorMessage, inputClass, primaryButton, secondaryButton } from "@/components/work/ui";

/** Add a task. Only project managers can place it in a sprint; others always add to Unscheduled. Mount only while open. */
export function TaskFormDialog({
  open,
  onOpenChange,
  projectId,
  members,
  sprints,
  canManage,
  defaultSprintId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  members: ProjectMember[];
  sprints: Sprint[];
  canManage: boolean;
  defaultSprintId: string | null;
  onCreated?: (taskId: string) => void;
}) {
  const create = useCreateTask(projectId);
  const assignable = sprints.filter((s) => s.status !== "COMPLETED");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [status, setStatus] = useState<WorkTaskStatus>("TODO");
  const [dueDate, setDueDate] = useState("");
  const [sprintId, setSprintId] = useState(canManage && assignable.some((s) => s.id === defaultSprintId) ? defaultSprintId! : "");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Enter a task title.");
      return;
    }
    setTitleError(null);
    setServerError(null);
    try {
      const task = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
        status,
        dueDate: dueDate || undefined,
        sprintId: canManage && sprintId ? sprintId : undefined,
      });
      onCreated?.(task.id);
      onOpenChange(false);
    } catch (err) {
      setServerError(errorMessage(err));
    }
  }

  return (
    <WorkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add task"
      description={canManage ? undefined : "New tasks start in Unscheduled. A project manager can add them to a sprint."}
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" form="task-form" className={primaryButton} disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Add task
          </button>
        </>
      }
    >
      <form id="task-form" className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field label="Title" htmlFor="task-title" error={titleError}>
          <input
            id="task-title"
            className={inputClass}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!titleError}
            aria-describedby={titleError ? "task-title-error" : undefined}
          />
        </Field>
        <Field label="Description (optional)" htmlFor="task-description">
          <textarea
            id="task-description"
            className={inputClass}
            rows={3}
            maxLength={10000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assignee" htmlFor="task-assignee">
            <select id="task-assignee" className={inputClass} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.employee.id} value={m.employee.id}>
                  {m.employee.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" htmlFor="task-status">
            <select
              id="task-status"
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkTaskStatus)}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date (optional)" htmlFor="task-due">
            <input id="task-due" type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          {canManage && (
            <Field label="Sprint" htmlFor="task-sprint">
              <select id="task-sprint" className={inputClass} value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
                <option value="">Unscheduled</option>
                {assignable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {serverError && <ErrorNote>{serverError}</ErrorNote>}
      </form>
    </WorkDialog>
  );
}
