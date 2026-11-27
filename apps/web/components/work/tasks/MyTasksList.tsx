"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/patterns/LoadingState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { EmptyState } from "@/components/patterns/EmptyState";
import { TASK_PRIORITY_LABELS } from "@/services/work.service";
import { useState } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { useMyTasks, useUpdateTask } from "@/hooks/work/useWork";
import { useAuthStore } from "@/store/auth.store";
import { formatDateOnly, isOverdue, sortMyTasks, todayIn } from "@/lib/work/format";
import { useToast } from "@/contexts/toast.context";
import { TaskStatusSelect, errorMessage } from "@/components/work/ui";

export function MyTasksList() {
  const [showCompleted, setShowCompleted] = useState(false);
  const tasks = useMyTasks(showCompleted);
  const update = useUpdateTask();
  const { toast } = useToast();
  const timeZone = useAuthStore((s) => s.user?.organizationTimeZone) || "UTC";
  const today = todayIn(timeZone);

  const items = tasks.data ? sortMyTasks(tasks.data.items, today) : [];

  return (
    <Card className="block py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <ListChecks className="h-5 w-5 text-info" aria-hidden="true" /> My tasks
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={showCompleted} onCheckedChange={setShowCompleted} />
          Show completed
        </label>
      </div>

      {tasks.isLoading ? (
        <LoadingState label="Loading your tasks…" />
      ) : tasks.isError ? (
        <ErrorState title="Unable to load your tasks" description={errorMessage(tasks.error, "Please try again.")} onRetry={() => void tasks.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={showCompleted ? "No tasks assigned to you" : "Nothing left to do"}
          description="Tasks assigned to you in any project appear here."
        />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((task) => {
            const overdue = isOverdue(task, today);
            return (
              <li key={task.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link
                    href={`/work/projects/${task.project.id}?task=${task.id}`}
                    className={`block truncate text-sm font-medium hover:text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info ${
                      task.status === "DONE" ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {task.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="truncate">{task.project.name}</span>
                    <span>{TASK_PRIORITY_LABELS[task.priority]}</span>
                    <span aria-hidden="true">·</span>
                    {task.dueDate ? (
                      <span className={overdue ? "font-semibold text-danger" : undefined}>
                        {overdue ? "Overdue: " : "Due "}
                        {formatDateOnly(task.dueDate)}
                      </span>
                    ) : (
                      <span>No due date</span>
                    )}
                  </p>
                </div>
                <TaskStatusSelect
                  id={`my-task-status-${task.id}`}
                  label={`Status of ${task.title}`}
                  hideLabel
                  value={task.status}
                  disabled={update.isPending && update.variables?.taskId === task.id}
                  onChange={(status) =>
                    update.mutate(
                      { taskId: task.id, data: { status, expectedVersion: task.version } },
                      { onError: (e) => { toast(errorMessage(e, "Status was not changed."), "error"); tasks.refetch(); } },
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
