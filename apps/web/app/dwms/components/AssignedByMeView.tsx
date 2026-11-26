"use client";

import { Button } from "@/components/ui/button";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DwmsTabHeader from "./DwmsTabHeader";
import DwmsSearchFilterBar from "./DwmsSearchFilterBar";
import TaskDateSeparator, {
  getDateSeparatorMeta,
} from "./TaskDateSeparator";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsAssignedTaskHistoryItem,
} from "@/services/dwms.service";
import { Clock, Paperclip, PlusCircle, Repeat } from "lucide-react";
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
export default function AssignedByMeView({ rightContent }: { rightContent: React.ReactNode }) {
  const router = useRouter();
  const [byMeTasks, setByMeTasks] = useState<DwmsAssignedTaskHistoryItem[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historySubTab, setHistorySubTab] = useState<
    "all" | "overdue" | "completed" | "pending" | "not_acknowledged"
  >("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("ALL");

  async function loadLists() {
    setLoadingLists(true);
    setLoadError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const byme = await DwmsService.getAssignedTasksByMe(token);
      setByMeTasks(byme?.tasks ?? []);
    } catch (error) {
      setLoadError(
        getDwmsErrorMessage(error, "Unable to load assigned tasks."),
      );
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
      return "Due today";
    }
    return (
      formatOrganizationDate(dueDate, timeZone, {
        day: "numeric",
        month: "short",
        year: "numeric",
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

  const getStatusBadgeColor = (status: string) => {
    if (status === "DONE") return "bg-success-subtle text-success";
    if (status === "OVERDUE") return "bg-danger-subtle text-danger";
    if (status === "APPROVAL_PENDING") return "bg-info-subtle text-info";
    return "bg-muted text-foreground";
  };
  const formatLabel = (value: string) =>
    value
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/^./, (letter) => letter.toUpperCase());

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
    const ownerName = task.ownerName || task.owner?.name || "Unknown assignee";
    const priority =
      task.priority === "LOW" ? "MEDIUM" : (task.priority ?? "MEDIUM");
    const acknowledgedAtLabel = formatAcknowledgedAt(
      task.acknowledgedAt,
      task.organizationTimeZone,
    );
    const completedOrSubmitted =
      task.status === "DONE" || task.status === "APPROVAL_PENDING";
    return (
      <article
        onClick={() => openTaskDetails(task)}
        className="min-w-0 cursor-pointer space-y-2 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/dwms/tasks/${task.instanceId ?? task.id}`}
              onClick={(event) => event.stopPropagation()}
              className="block break-words text-sm font-medium text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-info"
            >
              {task.title}
            </Link>
            <p
              title={
                acknowledgedAtLabel
                  ? `Acknowledged ${acknowledgedAtLabel}`
                  : undefined
              }
              className={`mt-0.5 text-xs ${task.acknowledgedAt ? "text-success" : "text-muted-foreground"}`}
            >
              {task.acknowledgedAt ? "Acknowledged" : "Not acknowledged"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-lg px-2 py-1 text-xs font-medium ${getStatusBadgeColor(task.status)}`}
          >
            {formatLabel(task.status)}
          </span>
        </div>
        {task.description && (
          <p className="line-clamp-1 break-words text-xs text-muted-foreground">
            {task.description}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="break-words text-foreground" title="Assigned to">
              {ownerName}
            </span>
            <span
              className={
                priority === "CRITICAL" ? "text-danger" : "text-muted-foreground"
              }
            >
              {formatLabel(priority)} priority
            </span>
            {task.frequency && (
              <span className="inline-flex items-center gap-1">
                <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                {task.frequency === "PLANNED"
                  ? "Once"
                  : formatLabel(task.frequency)}
              </span>
            )}
            {task.wasOverdue && task.status !== "OVERDUE" && (
              <span className="text-warning">Was overdue</span>
            )}
          </div>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {formatTaskDueDate(
              task.dueAt ?? task.dueDate ?? null,
              task.organizationTimeZone,
            )}
          </span>
        </div>
        {completedOrSubmitted && task.completionNote && (
          <p className="line-clamp-1 break-words text-xs text-muted-foreground">
            <span className="font-medium">Completion note: </span>
            {task.completionNote}
          </p>
        )}
        {completedOrSubmitted && task.completionAttachmentUrl && (
          <a
            href={task.completionAttachmentUrl}
            onClick={(event) => event.stopPropagation()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 rounded text-xs font-medium text-info hover:underline focus-visible:outline-2 focus-visible:outline-info"
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {task.completionAttachmentName || "View completion file"}
            </span>
          </a>
        )}
      </article>
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
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 pb-8 pt-6 sm:space-y-6 sm:px-6 sm:pt-8 lg:px-8">
      <DwmsTabHeader
        activeTab={historySubTab}
        onTabChange={setHistorySubTab}
        rightContent={rightContent}
        tabs={[
          {
            key: "all",
            label: "All",
            dotColor: "bg-muted-foreground",
            count: byMeTasks.length,
          },
          {
            key: "overdue",
            label: "Overdue",
            dotColor: "bg-danger",
            count: overdueTasks.length,
          },
          {
            key: "not_acknowledged",
            label: "Not Acknowledged",
            dotColor: "bg-warning",
            count: notAcknowledgedTasks.length,
          },
          {
            key: "pending",
            label: "Pending",
            dotColor: "bg-info",
            count: pendingTasks.length,
          },
          {
            key: "completed",
            label: "Completed",
            dotColor: "bg-success",
          },
        ]}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
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
                  { value: "ALL", label: "All assignees" },
                  ...assignedToOptions.map((option) => ({
                    value: option.id,
                    label: option.name,
                  })),
                ],
              },
            ]}
          />
        </div>

        <Button
          variant="ghost"
          onClick={() => router.push("/dwms/actions/new?mode=TASK")}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-transparent bg-primary hover:bg-primary/90 text-xs font-bold text-primary-foreground px-4 transition cursor-pointer select-none shadow-sm w-full shrink-0 sm:w-auto self-start lg:self-auto"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Assign a Task</span>
        </Button>
      </div>

      {/* Lists Content */}
      <div className="w-full space-y-6">
        {loadingLists ? (
          <div className="rounded-2xl border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
            Loading tasks list...
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
          >
            <p>{loadError}</p>
            <Button
              variant="ghost"
              type="button"
              onClick={() => void loadLists()}
              className="mt-2 rounded-lg border border-border px-3 py-2 font-medium text-info hover:bg-info-subtle"
            >
              Try again
            </Button>
          </div>
        ) : byMeTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
            You have not assigned any tasks yet.
          </div>
        ) : (
          <div className="space-y-6">
            {filteredTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
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
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {(() => {
                  let previousDateKey: string | null = null;
                  return filteredTasks.map((task) => {
                    const dateMeta = getDateSeparatorMeta(
                      getAssignedTaskDateValue(task, historySubTab),
                      task.organizationTimeZone,
                    );
                    const showSeparator =
                      !!dateMeta && dateMeta.key !== previousDateKey;
                    if (dateMeta) previousDateKey = dateMeta.key;

                    return (
                      <React.Fragment key={task.instanceId ?? task.id}>
                        {dateMeta && showSeparator && (
                          <TaskDateSeparator label={dateMeta.label} />
                        )}
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
