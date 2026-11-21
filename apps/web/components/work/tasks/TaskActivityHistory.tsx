"use client";

import { useState } from "react";
import { useTaskActivity } from "@/hooks/work/useWork";
import { useAuthStore } from "@/store/auth.store";
import { formatDateTime } from "@/lib/work/format";
import { ErrorNote, errorMessage, secondaryButton } from "@/components/work/ui";

const fields: Record<string, string> = {
  title: "Title",
  description: "Description",
  status: "Status",
  priority: "Priority",
  dueDate: "Due date",
  assigneeId: "Assignee",
  sprintId: "Sprint",
};
function display(value: string | null) {
  return value === null ? "None" : value.replaceAll("_", " ");
}

export function TaskActivityHistory({ taskId }: { taskId: string }) {
  const [page, setPage] = useState(1);
  const history = useTaskActivity(taskId, page);
  const timeZone = useAuthStore((s) => s.user?.organizationTimeZone) || "UTC";
  return (
    <section aria-labelledby="task-activity-heading" className="space-y-3">
      <h3
        id="task-activity-heading"
        className="text-sm font-semibold text-slate-900"
      >
        Activity
      </h3>
      {history.isLoading ? (
        <p className="text-sm text-slate-500">Loading activity…</p>
      ) : history.isError ? (
        <ErrorNote>{errorMessage(history.error)}</ErrorNote>
      ) : (
        <>
          {!history.data?.items.length && (
            <p className="text-sm text-slate-500">
              No recorded activity yet. History is recorded from this feature’s
              introduction.
            </p>
          )}
          <ol className="space-y-3 text-sm">
            {history.data?.items.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-slate-200 p-3"
              >
                <p>
                  <strong>{entry.actorName}</strong>{" "}
                  {entry.action === "CREATED"
                    ? "created this task"
                    : "updated this task"}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(entry.createdAt, timeZone)}
                </p>
                <ul className="mt-2 space-y-1 break-words">
                  {Object.entries(entry.changes).map(([field, change]) => (
                    <li key={field}>
                      {field === "description"
                        ? "Description changed"
                        : field === "assigneeId" || field === "sprintId"
                          ? `${fields[field]} changed`
                          : `${fields[field] ?? field}: ${display(change.before)} → ${display(change.after)}`}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className={secondaryButton}
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span className="text-xs text-slate-500">Page {page}</span>
            <button
              type="button"
              className={secondaryButton}
              disabled={
                !history.data ||
                page * history.data.pageSize >= history.data.total
              }
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
