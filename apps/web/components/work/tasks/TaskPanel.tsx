"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useTask, useUpdateTask } from "@/hooks/work/useWork";
import {
  SPRINT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type ProjectMember,
  type Sprint,
  type UpdateTaskPayload,
  type WorkTask,
  type WorkTaskStatus,
} from "@/services/work.service";
import { useToast } from "@/contexts/toast.context";
import { TaskComments } from "@/components/work/tasks/TaskComments";
import { ErrorNote, Field, Loading, errorMessage, inputClass, primaryButton, secondaryButton } from "@/components/work/ui";

function TaskEditor({
  task,
  members,
  sprints,
  canManage,
}: {
  task: WorkTask;
  members: ProjectMember[];
  sprints: Sprint[];
  canManage: boolean;
}) {
  const update = useUpdateTask();
  const { toast } = useToast();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id ?? "");
  const [status, setStatus] = useState<WorkTaskStatus>(task.status);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [sprintId, setSprintId] = useState(task.sprint?.id ?? "");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The current assignee may have left the project; keep them selectable so saving other fields works.
  const assigneeOptions =
    task.assignee && !members.some((m) => m.employee.id === task.assignee!.id)
      ? [...members, { employee: task.assignee, role: "MEMBER" as const, joinedAt: "" }]
      : members;
  // Completed sprints can't receive tasks; the task's own completed sprint is shown but not offered.
  const sprintOptions = sprints.filter((s) => s.status !== "COMPLETED");
  const inCompletedSprint = task.sprint?.status === "COMPLETED";

  const changes: UpdateTaskPayload = {};
  if (title.trim() !== task.title) changes.title = title.trim();
  if ((description.trim() || null) !== task.description) changes.description = description.trim() || null;
  if ((assigneeId || null) !== (task.assignee?.id ?? null)) changes.assigneeId = assigneeId || null;
  if (status !== task.status) changes.status = status;
  if ((dueDate || null) !== task.dueDate) changes.dueDate = dueDate || null;
  if (canManage && (sprintId || null) !== (task.sprint?.id ?? null)) changes.sprintId = sprintId || null;
  const dirty = Object.keys(changes).length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Enter a task title.");
      return;
    }
    setTitleError(null);
    setError(null);
    try {
      await update.mutateAsync({ taskId: task.id, data: changes });
      toast("Task saved", "success");
    } catch (err) {
      setError(errorMessage(err, "Your changes were not saved."));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor="panel-title" error={titleError}>
        <input
          id="panel-title"
          className={inputClass}
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={!!titleError}
          aria-describedby={titleError ? "panel-title-error" : undefined}
        />
      </Field>
      <Field label="Description" htmlFor="panel-description">
        <textarea
          id="panel-description"
          className={inputClass}
          rows={4}
          maxLength={10000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" htmlFor="panel-status">
          <select id="panel-status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as WorkTaskStatus)}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assignee" htmlFor="panel-assignee">
          <select id="panel-assignee" className={inputClass} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {assigneeOptions.map((m) => (
              <option key={m.employee.id} value={m.employee.id}>
                {m.employee.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date" htmlFor="panel-due">
          <input id="panel-due" type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field
          label="Sprint"
          htmlFor="panel-sprint"
          hint={
            !canManage
              ? "Only project managers can change the sprint."
              : inCompletedSprint
                ? "This sprint is completed. Reopening the task moves it to Unscheduled."
                : undefined
          }
        >
          <select
            id="panel-sprint"
            className={inputClass}
            value={sprintId}
            disabled={!canManage}
            onChange={(e) => setSprintId(e.target.value)}
            aria-describedby={!canManage || inCompletedSprint ? "panel-sprint-hint" : undefined}
          >
            <option value="">Unscheduled</option>
            {inCompletedSprint && task.sprint && (
              <option value={task.sprint.id} disabled>
                {task.sprint.name} ({SPRINT_STATUS_LABELS.COMPLETED})
              </option>
            )}
            {sprintOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.status === "ACTIVE" ? " (Active)" : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end">
        <button type="submit" className={primaryButton} disabled={!dirty || update.isPending}>
          {update.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Save changes
        </button>
      </div>
    </form>
  );
}

/** Task details: a side panel on desktop, a full-screen view with Back on small screens. */
export function TaskPanel({
  taskId,
  onClose,
  members,
  sprints,
  canManage,
}: {
  taskId: string | null;
  onClose: () => void;
  members: ProjectMember[];
  sprints: Sprint[];
  canManage: boolean;
}) {
  const task = useTask(taskId);

  return (
    <Dialog.Root open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 hidden bg-slate-900/30 md:block" />
        <Dialog.Popup className="fixed inset-0 z-50 flex flex-col bg-white focus:outline-none md:inset-y-0 md:left-auto md:right-0 md:w-[min(560px,100vw)] md:border-l md:border-slate-200 md:shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <Dialog.Close
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:hidden"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </Dialog.Close>
            <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900">
              {task.data?.title ?? "Task"}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close task"
              className="hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:inline-flex"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-5">
            {task.isLoading ? (
              <Loading label="Loading task…" />
            ) : task.isError || !task.data ? (
              <div className="space-y-3">
                <ErrorNote>{errorMessage(task.error, "This task could not be loaded.")}</ErrorNote>
                <button type="button" className={secondaryButton} onClick={onClose}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <TaskEditor
                  key={`${task.data.id}:${task.data.updatedAt}`}
                  task={task.data}
                  members={members}
                  sprints={sprints}
                  canManage={canManage}
                />
                <hr className="border-slate-100" />
                <TaskComments taskId={task.data.id} />
              </>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
