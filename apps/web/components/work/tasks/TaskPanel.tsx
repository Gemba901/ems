"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useState } from "react";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useTask, useUpdateTask } from "@/hooks/work/useWork";
import {
  SPRINT_STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type WorkTaskPriority,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type ProjectMember,
  type Sprint,
  type UpdateTaskPayload,
  type WorkTask,
  type WorkTaskStatus,
} from "@/services/work.service";
import { useToast } from "@/contexts/toast.context";
import { TaskActivityHistory } from "@/components/work/tasks/TaskActivityHistory";
import { TaskComments } from "@/components/work/tasks/TaskComments";
import {
  ErrorNote,
  Field,
  Loading,
  SPRINT_TERM,
  errorMessage,
} from "@/components/work/ui";

function TaskEditor({
  task: initialTask,
  members,
  sprints,
  canManage,
}: {
  task: WorkTask;
  members: ProjectMember[];
  sprints: Sprint[];
  canManage: boolean;
}) {
  const [task, setTask] = useState(initialTask);
  const latest = useTask(task.id);
  const update = useUpdateTask();
  const { toast } = useToast();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id ?? "");
  const [status, setStatus] = useState<WorkTaskStatus>(task.status);
  const [priority, setPriority] = useState<WorkTaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [sprintId, setSprintId] = useState(task.sprint?.id ?? "");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The current assignee may have left the project; keep them selectable so saving other fields works.
  const assigneeOptions =
    task.assignee && !members.some((m) => m.employee.id === task.assignee!.id)
      ? [
          ...members,
          { employee: task.assignee, role: "MEMBER" as const, joinedAt: "" },
        ]
      : members;
  // Completed sprints can't receive tasks; the task's own completed sprint is shown but not offered.
  const sprintOptions = sprints.filter((s) => s.status !== "COMPLETED");
  const inCompletedSprint = task.sprint?.status === "COMPLETED";

  const changes: UpdateTaskPayload = { expectedVersion: task.version };
  if (priority !== task.priority) changes.priority = priority;
  if (title.trim() !== task.title) changes.title = title.trim();
  if ((description.trim() || null) !== task.description)
    changes.description = description.trim() || null;
  if ((assigneeId || null) !== (task.assignee?.id ?? null))
    changes.assigneeId = assigneeId || null;
  if (status !== task.status) changes.status = status;
  if ((dueDate || null) !== task.dueDate) changes.dueDate = dueDate || null;
  if (canManage && (sprintId || null) !== (task.sprint?.id ?? null))
    changes.sprintId = sprintId || null;
  const dirty = Object.keys(changes).length > 1;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Enter a task title.");
      return;
    }
    setTitleError(null);
    setError(null);
    try {
      const saved = await update.mutateAsync({
        taskId: task.id,
        data: changes,
      });
      setTask(saved);
      setSprintId(saved.sprint?.id ?? "");
      toast("Task saved", "success");
    } catch (err) {
      setError(errorMessage(err, "Your changes were not saved."));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor="panel-title" error={titleError}>
        <Input
          id="panel-title"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={!!titleError}
          aria-describedby={titleError ? "panel-title-error" : undefined}
        />
      </Field>
      <Field label="Description" htmlFor="panel-description">
        <Textarea
          id="panel-description"
          rows={4}
          maxLength={10000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" htmlFor="panel-status">
          <NativeSelect
            id="panel-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as WorkTaskStatus)}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Assignee" htmlFor="panel-assignee">
          <NativeSelect
            id="panel-assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {assigneeOptions.map((m) => (
              <option key={m.employee.id} value={m.employee.id}>
                {m.employee.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Priority" htmlFor="panel-priority">
          <NativeSelect
            id="panel-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as WorkTaskPriority)}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Due date" htmlFor="panel-due">
          <Input
            id="panel-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
        <Field
          label={SPRINT_TERM}
          htmlFor="panel-sprint"
          hint={
            !canManage
              ? "Only project managers can change the sprint."
              : inCompletedSprint
                ? "This sprint is completed. Reopening the task moves it to Unscheduled."
                : undefined
          }
        >
          <NativeSelect
            id="panel-sprint"
            value={sprintId}
            disabled={!canManage}
            onChange={(e) => setSprintId(e.target.value)}
            aria-describedby={
              !canManage || inCompletedSprint ? "panel-sprint-hint" : undefined
            }
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
          </NativeSelect>
        </Field>
      </div>
      {error && (
        <div className="space-y-2">
          <ErrorNote>{error}</ErrorNote>
          <Button
            variant="outline"
            type="button"
            onClick={async () => {
              const result = await latest.refetch();
              if (!result.data || result.isError) return;
              const fresh = result.data;
              setTask(fresh);
              setTitle(fresh.title);
              setDescription(fresh.description ?? "");
              setStatus(fresh.status);
              setPriority(fresh.priority);
              setAssigneeId(fresh.assignee?.id ?? "");
              setDueDate(fresh.dueDate ?? "");
              setSprintId(fresh.sprint?.id ?? "");
              setError(null);
            }}
          >
            Discard draft and reload latest task
          </Button>
        </div>
      )}
      <div className="flex justify-end">
        <Button
          variant="default"
          type="submit"
          disabled={!dirty || update.isPending}
        >
          {update.isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          Save changes
        </Button>
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
    <Sheet open={!!taskId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        showCloseButton={false}
        className="gap-0 data-[side=right]:w-full data-[side=right]:border-l-0 data-[side=right]:sm:max-w-none data-[side=right]:md:w-[min(560px,100vw)] data-[side=right]:md:border-l"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <SheetClose className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info md:hidden">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </SheetClose>
          <SheetTitle className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
            {task.data?.title ?? "Task"}
          </SheetTitle>
          <SheetClose
            aria-label="Close task"
            className="hidden rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info md:inline-flex"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-5">
          {task.isLoading ? (
            <Loading label="Loading task…" />
          ) : task.isError || !task.data ? (
            <div className="space-y-3">
              <ErrorNote>
                {errorMessage(task.error, "This task could not be loaded.")}
              </ErrorNote>
              <Button
                variant="outline"
                type="button"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          ) : (
            <>
              <TaskEditor
                key={task.data.id}
                task={task.data}
                members={members}
                sprints={sprints}
                canManage={canManage}
              />
              <hr className="border-border" />
              <TaskComments taskId={task.data.id} />
              <TaskActivityHistory taskId={task.data.id} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
