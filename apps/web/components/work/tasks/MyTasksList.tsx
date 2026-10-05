"use client";

import { useState } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { useMyTasks, useUpdateTask } from "@/hooks/work/useWork";
import { useAuthStore } from "@/store/auth.store";
import { formatDateOnly, isOverdue, sortMyTasks, todayIn } from "@/lib/work/format";
import { useToast } from "@/contexts/toast.context";
import { EmptyState, ErrorNote, Loading, Surface, TaskStatusSelect, errorMessage, secondaryButton } from "@/components/work/ui";

export function MyTasksList() {
  const [showCompleted, setShowCompleted] = useState(false);
  const tasks = useMyTasks(showCompleted);
  const update = useUpdateTask();
  const { toast } = useToast();
  const timeZone = useAuthStore((s) => s.user?.organizationTimeZone) || "UTC";
  const today = todayIn(timeZone);

  const items = tasks.data ? sortMyTasks(tasks.data.items, today) : [];

  return (
    <Surface>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <ListChecks className="h-5 w-5 text-blue-600" aria-hidden="true" /> My tasks
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          Show completed
        </label>
      </div>

      {tasks.isLoading ? (
        <Loading label="Loading your tasks…" />
      ) : tasks.isError ? (
        <div className="space-y-3 p-5">
          <ErrorNote>We couldn&apos;t load your tasks. {errorMessage(tasks.error, "")}</ErrorNote>
          <button type="button" className={secondaryButton} onClick={() => tasks.refetch()}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={showCompleted ? "No tasks assigned to you" : "Nothing left to do"}>
          Tasks assigned to you in any project appear here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((task) => {
            const overdue = isOverdue(task, today);
            return (
              <li key={task.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link
                    href={`/work/projects/${task.project.id}?task=${task.id}`}
                    className={`block truncate text-sm font-medium hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      task.status === "DONE" ? "text-slate-500 line-through" : "text-slate-900"
                    }`}
                  >
                    {task.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span className="truncate">{task.project.name}</span>
                    <span aria-hidden="true">·</span>
                    {task.dueDate ? (
                      <span className={overdue ? "font-semibold text-red-700" : undefined}>
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
                      { taskId: task.id, data: { status } },
                      { onError: (e) => toast(errorMessage(e, "Status was not changed."), "error") },
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}
