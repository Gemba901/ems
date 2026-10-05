"use client";

import { useState } from "react";
import { CalendarDays, MessageSquare, UserRound } from "lucide-react";
import { formatDateOnly, isOverdue } from "@/lib/work/format";
import { TASK_STATUS_LABELS, TASK_STATUSES, type WorkTask, type WorkTaskStatus } from "@/services/work.service";
import { EmptyState, TaskStatusBadge } from "@/components/work/ui";

function TaskCard({ task, today, onOpen, showStatus }: { task: WorkTask; today: string; onOpen: (id: string) => void; showStatus?: boolean }) {
  const overdue = isOverdue(task, today);
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <span className="block text-sm font-medium text-slate-900">{task.title}</span>
      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {showStatus && <TaskStatusBadge status={task.status} />}
        <span className="inline-flex items-center gap-1">
          <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
          {task.assignee?.name ?? "Unassigned"}
        </span>
        <span className={`inline-flex items-center gap-1 ${overdue ? "font-semibold text-red-700" : ""}`}>
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {task.dueDate ? `${overdue ? "Overdue: " : ""}${formatDateOnly(task.dueDate)}` : "No due date"}
        </span>
        {task.commentCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            {task.commentCount}
            <span className="sr-only">{task.commentCount === 1 ? "comment" : "comments"}</span>
          </span>
        )}
      </span>
    </button>
  );
}

/** Columns on desktop; a status-filtered list on small screens. Status changes happen in the task panel. */
export function TaskBoard({ tasks, today, onOpen }: { tasks: WorkTask[]; today: string; onOpen: (id: string) => void }) {
  const [mobileFilter, setMobileFilter] = useState<WorkTaskStatus | "ALL">("ALL");
  const byStatus = (status: WorkTaskStatus) => tasks.filter((t) => t.status === status);
  const mobileTasks = mobileFilter === "ALL" ? tasks : byStatus(mobileFilter);

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white">
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
            <section key={status} aria-labelledby={`column-${status}`} className="rounded-xl bg-slate-100/70 p-3">
              <h3 id={`column-${status}`} className="mb-3 flex items-center justify-between px-1 text-sm font-semibold text-slate-700">
                {TASK_STATUS_LABELS[status]}
                <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-600">{column.length}</span>
              </h3>
              <ul className="space-y-2">
                {column.map((task) => (
                  <li key={task.id}>
                    <TaskCard task={task} today={today} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
              {column.length === 0 && <p className="px-1 py-4 text-center text-xs text-slate-500">No tasks</p>}
            </section>
          );
        })}
      </div>

      <div className="space-y-3 md:hidden">
        <div className="flex items-center gap-2">
          <label htmlFor="mobile-status-filter" className="text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="mobile-status-filter"
            className="min-h-10 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm"
            value={mobileFilter}
            onChange={(e) => setMobileFilter(e.target.value as WorkTaskStatus | "ALL")}
          >
            <option value="ALL">All statuses ({tasks.length})</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]} ({byStatus(s).length})
              </option>
            ))}
          </select>
        </div>
        <ul className="space-y-2">
          {mobileTasks.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} today={today} onOpen={onOpen} showStatus />
            </li>
          ))}
        </ul>
        {mobileTasks.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No tasks with this status.</p>}
      </div>
    </>
  );
}
