"use client";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useState } from "react";
import { CalendarDays, MessageSquare, UserRound } from "lucide-react";
import { formatDateOnly, isOverdue } from "@/lib/work/format";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type WorkTask,
  type WorkTaskStatus,
} from "@/services/work.service";
import { EmptyState, TaskStatusBadge } from "@/components/work/ui";

function TaskCard({
  task,
  today,
  onOpen,
  showStatus,
}: {
  task: WorkTask;
  today: string;
  onOpen: (id: string) => void;
  showStatus?: boolean;
}) {
  const overdue = isOverdue(task, today);
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={() => onOpen(task.id)}
      className="block h-auto w-full whitespace-normal rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
    >
      <span className="block text-sm font-medium text-foreground">
        {task.title}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {showStatus && <TaskStatusBadge status={task.status} />}
        <span
          className={
            task.priority === "URGENT" || task.priority === "HIGH"
              ? "font-semibold text-warning"
              : ""
          }
        >
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
        <span className="inline-flex items-center gap-1">
          <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
          {task.assignee?.name ?? "Unassigned"}
        </span>
        <span
          className={`inline-flex items-center gap-1 ${overdue ? "font-semibold text-danger" : ""}`}
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {task.dueDate
            ? `${overdue ? "Overdue: " : ""}${formatDateOnly(task.dueDate)}`
            : "No due date"}
        </span>
        {task.commentCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            {task.commentCount}
            <span className="sr-only">
              {task.commentCount === 1 ? "comment" : "comments"}
            </span>
          </span>
        )}
      </span>
    </Button>
  );
}

/** Columns on desktop; a status-filtered list on small screens. Status changes happen in the task panel. */
export function TaskBoard({
  tasks,
  today,
  onOpen,
}: {
  tasks: WorkTask[];
  today: string;
  onOpen: (id: string) => void;
}) {
  const [mobileFilter, setMobileFilter] = useState<WorkTaskStatus | "ALL">(
    "ALL",
  );
  const byStatus = (status: WorkTaskStatus) =>
    tasks.filter((t) => t.status === status);
  const mobileTasks = mobileFilter === "ALL" ? tasks : byStatus(mobileFilter);

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card">
        <EmptyState title="No tasks here yet" />
      </div>
    );
  }

  return (
    <>
      <div className="hidden gap-4 md:grid md:grid-cols-3">
        {TASK_STATUSES.map((status) => {
          const column = byStatus(status);
          return (
            <section
              key={status}
              aria-labelledby={`column-${status}`}
              className="rounded-xl bg-muted/70 p-3"
            >
              <h3
                id={`column-${status}`}
                className="mb-3 flex items-center justify-between px-1 text-sm font-semibold text-foreground"
              >
                {TASK_STATUS_LABELS[status]}
                <span className="rounded-full bg-card px-2 text-xs font-medium text-muted-foreground">
                  {column.length}
                </span>
              </h3>
              <ul className="space-y-2">
                {column.map((task) => (
                  <li key={task.id}>
                    <TaskCard task={task} today={today} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
              {column.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                  No tasks
                </p>
              )}
            </section>
          );
        })}
      </div>

      <div className="space-y-3 md:hidden">
        <div className="flex items-center gap-2">
          <label
            htmlFor="mobile-status-filter"
            className="text-sm font-medium text-foreground"
          >
            Status
          </label>
          <NativeSelect
            id="mobile-status-filter"
            className="min-h-10 flex-1 rounded-lg border border-border bg-card px-2 text-sm"
            value={mobileFilter}
            onChange={(e) =>
              setMobileFilter(e.target.value as WorkTaskStatus | "ALL")
            }
          >
            <option value="ALL">All statuses ({tasks.length})</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]} ({byStatus(s).length})
              </option>
            ))}
          </NativeSelect>
        </div>
        <ul className="space-y-2">
          {mobileTasks.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} today={today} onOpen={onOpen} showStatus />
            </li>
          ))}
        </ul>
        {mobileTasks.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No tasks with this status.
          </p>
        )}
      </div>
    </>
  );
}
