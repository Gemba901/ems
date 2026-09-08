"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DwmsTabHeader from "../components/DwmsTabHeader";
import DwmsSearchFilterBar from "../components/DwmsSearchFilterBar";
import TaskDateSeparator, { getDateSeparatorMeta } from "../components/TaskDateSeparator";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService,
  type DwmsAssignedTaskHistoryItem,
} from "@/services/dwms.service";
import { Clock, ExternalLink, Paperclip, PlusCircle } from "lucide-react";
import {
  formatOrganizationDate,
  isTodayInOrganizationTimeZone,
} from "../utils/organizationDate";

const frequencyBasedTaskFrequencies = new Set([
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
]);

const isFrequencyBasedTask = (task: DwmsAssignedTaskHistoryItem) =>
  frequencyBasedTaskFrequencies.has(String(task.frequency ?? ""));

function groupFrequencyBasedTasks(tasksToGroup: DwmsAssignedTaskHistoryItem[]) {
  const grouped = new Map<string, DwmsAssignedTaskHistoryItem>();

  tasksToGroup.forEach((task) => {
    const key = isFrequencyBasedTask(task) ? task.taskId : task.instanceId;
    if (!grouped.has(key)) {
      grouped.set(key, task);
    }
  });

  return Array.from(grouped.values());
}

function getAssignedTaskDateValue(
  task: DwmsAssignedTaskHistoryItem,
  activeTab: "all" | "overdue" | "completed" | "pending" | "not_acknowledged",
) {
  if (activeTab === "completed") {
    return task.completedAt ?? task.dueAt ?? task.dueDate ?? task.scheduledFor;
  }
  return task.dueAt ?? task.dueDate ?? task.scheduledFor ?? task.completedAt;
}

function getAssignedTaskTimeValue(
  task: DwmsAssignedTaskHistoryItem,
  activeTab: "all" | "overdue" | "completed" | "pending" | "not_acknowledged",
) {
  const value = getAssignedTaskDateValue(task, activeTab);
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}
export default function AssignedTasksHistoryPage() {
  return (
    <ProtectedRoute>
      <AssignedTasksHistoryContent />
    </ProtectedRoute>
  );
}

function AssignedTasksHistoryContent() {
  const router = useRouter();
  const [byMeTasks, setByMeTasks] = useState<DwmsAssignedTaskHistoryItem[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [historySubTab, setHistorySubTab] = useState<
    "all" | "overdue" | "completed" | "pending" | "not_acknowledged"
  >("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("ALL");

  async function loadLists() {
    setLoadingLists(true);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const byme = await DwmsService.getAssignedTasksByMe(token);
      setByMeTasks(byme?.tasks ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingLists(false);
    }
  }

  useEffect(() => {
    void loadLists();
  }, []);

  const formatTaskDueDate = (
    dueDateStr: string | null,
    timeZone?: string | null,
  ) => {
    if (!dueDateStr) return "No due date";
    const dueDate = new Date(dueDateStr);
    if (isTodayInOrganizationTimeZone(dueDate, timeZone)) {
      return "Due by Today";
    }
    return (
      formatOrganizationDate(dueDate, timeZone, {
        day: "numeric",
        month: "long",
      }) ?? "No due date"
    );
  };

  const formatAcknowledgedAt = (
    value?: string | null,
    timeZone?: string | null,
  ) => {
    if (!value) return null;

    const acknowledgedAt = new Date(value);
    if (Number.isNaN(acknowledgedAt.getTime())) return null;

    return formatOrganizationDate(acknowledgedAt, timeZone, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPriorityBadgeColor = (p: string) => {
    switch (p) {
      case "CRITICAL":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
      case "HIGH":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      case "MEDIUM":
        return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20";
    }
  };

  const getStatusBadgeColor = (s: string) => {
    switch (s) {
      case "DONE":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      case "APPROVAL_PENDING":
        return "bg-cyan-500/10 text-cyan-500 border border-cyan-500/20";
      case "IN_PROGRESS":
        return "bg-sky-500/10 text-sky-400 border border-sky-500/20";
      case "PENDING":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      case "OVERDUE":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20";
    }
  };

  const assignedToOptions = useMemo(() => {
    const map = new Map<string, string>();
    byMeTasks.forEach((task) => {
      if (task.owner?.id) {
        map.set(task.owner.id, task.ownerName || task.owner.name || "Unknown");
      } else if (task.ownerName) {
        map.set(task.ownerName, task.ownerName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [byMeTasks]);

  const openTaskDetails = (task: DwmsAssignedTaskHistoryItem) => {
    router.push(`/dwms/tasks/${task.instanceId ?? task.id}`);
  };

  const renderByMeTaskCard = (task: DwmsAssignedTaskHistoryItem) => {
    const initials = task.ownerName
      ? task.ownerName
          .split(" ")
          .map((n: string) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "U";
    const priority =
      task.priority === "LOW" ? "MEDIUM" : (task.priority ?? "MEDIUM");
    const acknowledgedAtLabel = !isFrequencyBasedTask(task)
      ? formatAcknowledgedAt(task.acknowledgedAt, task.organizationTimeZone)
      : null;
    const showWasOverdue = !!task.wasOverdue && task.status !== "OVERDUE";

    return (
      <div
        key={task.id}
        role="button"
        tabIndex={0}
        onClick={() => openTaskDetails(task)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openTaskDetails(task);
          }
        }}
        className="rounded-2xl border border-border-app bg-white p-5 shadow-sm space-y-4 hover:border-accent-app/30 transition duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${getPriorityBadgeColor(priority)}`}
              >
                {priority}
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${getStatusBadgeColor(task.status)}`}
              >
                {task.status.replace(/_/g, " ")}
              </span>
              {showWasOverdue && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                  WAS OVERDUE
                </span>
              )}
            </div>
            <h4 className="text-base font-semibold text-text-app">
              {task.title}
            </h4>
            {task.description && (
              <p className="text-sm text-muted-app font-light leading-relaxed">
                {task.description}
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-border-app pt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-app">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-[9px] font-bold text-blue-700 border border-blue-200">
              {initials}
            </span>
            <span>
              Assigned to:{" "}
              <strong className="text-text-app font-semibold">
                {task.ownerName || "Unknown"}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock
              className="h-3.5 w-3.5 text-zinc-400 shrink-0"
              strokeWidth={1.5}
            />
            <span>
              {formatTaskDueDate(
                task.dueDate ?? null,
                task.organizationTimeZone,
              )}
            </span>
          </div>
        </div>

        {acknowledgedAtLabel && (
          <div className="border-t border-border-app pt-2.5 text-[11px] text-muted-app">
            <span>Acknowledged: </span>
            <span className="text-text-app">{acknowledgedAtLabel}</span>
          </div>
        )}

        {(task.status === "DONE" || task.status === "APPROVAL_PENDING") &&
          task.completionNote && (
            <div className="border-t border-border-app pt-3 text-xs">
              <span className="text-muted-app">Completion note:</span>
              <p className="mt-1 text-emerald-400 font-light italic bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-xl">
                &quot;{task.completionNote}&quot;
              </p>
            </div>
          )}

        {(task.status === "DONE" || task.status === "APPROVAL_PENDING") &&
          task.completionAttachmentUrl && (
            <div className="border-t border-border-app pt-3 text-xs">
              <a
                href={task.completionAttachmentUrl}
                onClick={(event) => event.stopPropagation()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span>
                  {task.completionAttachmentName || "View completion file"}
                </span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
      </div>
    );
  };

  const overdueTasks = useMemo(
    () => byMeTasks.filter((t) => t.status === "OVERDUE"),
    [byMeTasks],
  );
  const completedTasks = useMemo(
    () => byMeTasks.filter((t) => t.status === "DONE"),
    [byMeTasks],
  );
  const notAcknowledgedTasks = useMemo(
    () =>
      groupFrequencyBasedTasks(
        byMeTasks.filter(
          (t) =>
            !t.acknowledgedAt && t.status !== "DONE" && t.status !== "OVERDUE",
        ),
      ),
    [byMeTasks],
  );
  const pendingTasks = useMemo(
    () =>
      byMeTasks.filter(
        (t) =>
          !!t.acknowledgedAt && t.status !== "DONE" && t.status !== "OVERDUE",
      ),
    [byMeTasks],
  );

  const filteredTasks = useMemo(() => {
    let result = [...byMeTasks];

    switch (historySubTab) {
      case "overdue":
        result = overdueTasks;
        break;
      case "completed":
        result = completedTasks;
        break;
      case "not_acknowledged":
        result = notAcknowledgedTasks;
        break;
      case "pending":
        result = pendingTasks;
        break;
      case "all":
      default:
        break;
    }

    if (assignedToFilter !== "ALL") {
      result = result.filter(
        (task) => (task.owner?.id ?? task.ownerName) === assignedToFilter,
      );
    }

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      result = result.filter((task) => {
        const assigneeName = task.ownerName || "";
        const assignerName = task.assignedBy?.name || "";
        return [
          task.title,
          task.description,
          task.status,
          assigneeName,
          assignerName,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(q),
        );
      });
    }

    result.sort((a, b) => {
      const direction = historySubTab === "completed" ? -1 : 1;
      const dateDiff =
        (getAssignedTaskTimeValue(a, historySubTab) -
          getAssignedTaskTimeValue(b, historySubTab)) *
        direction;
      if (dateDiff !== 0) return dateDiff;
      return a.title.localeCompare(b.title);
    });

    return result;
  }, [
    assignedToFilter,
    byMeTasks,
    completedTasks,
    historySubTab,
    overdueTasks,
    notAcknowledgedTasks,
    pendingTasks,
    searchTerm,
  ]);

  return (
    <div className="mx-auto max-w-none px-4 pt-8 sm:px-6 lg:px-8 space-y-6 pb-8">
      <DwmsTabHeader
        activeTab={historySubTab}
        onTabChange={setHistorySubTab}
        tabs={[
          {
            key: "all",
            label: "All",
            dotColor: "bg-slate-400",
            count: byMeTasks.length,
          },
          {
            key: "overdue",
            label: "Overdue",
            dotColor: "bg-rose-500",
            count: overdueTasks.length,
          },
          {
            key: "completed",
            label: "Completed",
            dotColor: "bg-emerald-500",
            count: completedTasks.length,
          },
          {
            key: "pending",
            label: "Pending",
            dotColor: "bg-sky-500",
            count: pendingTasks.length,
          },
          {
            key: "not_acknowledged",
            label: "Not Acknowledged",
            dotColor: "bg-amber-500",
            count: notAcknowledgedTasks.length,
          },
        ]}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full lg:max-w-4xl">
          <DwmsSearchFilterBar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Search assigned tasks..."
            filters={[
              {
                key: "assignedTo",
                value: assignedToFilter,
                onChange: setAssignedToFilter,
                ariaLabel: "Assigned to filter",
                options: [
                  { value: "ALL", label: "ALL" },
                  ...assignedToOptions.map((option) => ({
                    value: option.id,
                    label: option.name,
                  })),
                ],
              },
            ]}
          />
        </div>

        <button
          onClick={() => router.push("/dwms/actions/new")}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-transparent bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white px-4 transition cursor-pointer select-none shadow-sm self-start lg:self-auto"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Assign a Task</span>
        </button>
      </div>

      {/* Lists Content */}
      <div className="w-full space-y-6">
        {loadingLists ? (
          <div className="rounded-2xl border border-dashed border-border-app bg-white py-24 text-center text-sm text-muted-app">
            Loading tasks list...
          </div>
        ) : byMeTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-app bg-white py-24 text-center text-sm text-muted-app">
            You have not assigned any tasks yet.
          </div>
        ) : (
          <div className="space-y-6">
            {filteredTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-app bg-white py-20 text-center text-sm text-muted-app">
                {searchTerm || assignedToFilter !== "ALL"
                  ? "No tasks match your search or assigned-to filter."
                  : historySubTab === "all"
                    ? "No tasks found."
                    : historySubTab === "overdue"
                      ? "No overdue tasks."
                      : historySubTab === "completed"
                        ? "No completed tasks."
                        : historySubTab === "pending"
                          ? "No pending tasks."
                          : "No unacknowledged tasks."}
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  let previousDateKey: string | null = null;
                  return filteredTasks.map((task) => {
                    const dateMeta = getDateSeparatorMeta(
                      getAssignedTaskDateValue(task, historySubTab),
                      task.organizationTimeZone,
                    );
                    const showSeparator = !!dateMeta && dateMeta.key !== previousDateKey;
                    if (dateMeta) previousDateKey = dateMeta.key;

                    return (
                      <React.Fragment key={task.instanceId ?? task.id}>
                        {dateMeta && showSeparator && <TaskDateSeparator label={dateMeta.label} />}
                        {renderByMeTaskCard(task)}
                      </React.Fragment>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

