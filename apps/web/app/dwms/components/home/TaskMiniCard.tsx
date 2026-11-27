import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import type {
  DwmsTaskItem as TaskItem,
  DwmsTaskStatus as TaskStatus,
} from "@/services/dwms.service";
import {
  Clock,
  CheckCircle,
  ChevronDown,
} from "lucide-react";
import {
  formatOrganizationDate,
  formatOrganizationDateKey,
  getOrganizationTodayKey,
  startOfOrganizationDay,
} from "../../utils/organizationDate";

type Props = {
  task: TaskItem;
  onClick: (task: TaskItem) => void;
  onStatusChange: (instanceId: string, nextStatus: TaskStatus) => void;
  onAcknowledgement: (taskId: string) => void;
  saving: boolean;
};

function toUtcDateOnly(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function getTaskTimeZone(task: TaskItem) {
  return task.organizationTimeZone;
}

function getCompletionWindowStart(task: TaskItem): Date | null {
  const scheduledFor = new Date(task.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime())) return null;

  const date = toUtcDateOnly(scheduledFor);
  const timeZone = getTaskTimeZone(task);
  switch (task.frequency) {
    case "DAILY":
      return startOfOrganizationDay(date, timeZone);
    case "WEEKLY": {
      const start = new Date(date);
      const mondayOffset = (start.getUTCDay() + 6) % 7;
      start.setUTCDate(start.getUTCDate() - mondayOffset);
      return startOfOrganizationDay(start, timeZone);
    }
    case "MONTHLY":
      return startOfOrganizationDay(
        new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
        timeZone,
      );
    case "QUARTERLY": {
      const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
      return startOfOrganizationDay(
        new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1)),
        timeZone,
      );
    }
    case "YEARLY":
      return startOfOrganizationDay(
        new Date(Date.UTC(date.getUTCFullYear(), 0, 1)),
        timeZone,
      );
    default:
      return null;
  }
}

function getCompletionWindowLabel(frequency: TaskItem["frequency"]) {
  switch (frequency) {
    case "DAILY":
      return "day";
    case "WEEKLY":
      return "week";
    case "MONTHLY":
      return "month";
    case "QUARTERLY":
      return "quarter";
    case "YEARLY":
      return "year";
    default:
      return "schedule window";
  }
}

function formatWindowDate(value: Date, timeZone: string) {
  return (
    formatOrganizationDate(value, timeZone, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) ?? ""
  );
}

export function getStatusLockReason(task: TaskItem) {
  if (task.frequency === "PLANNED") return null;

  const windowStart = getCompletionWindowStart(task);
  const dueAt = new Date(task.dueAt);
  if (!windowStart || Number.isNaN(dueAt.getTime())) return null;

  const now = new Date();
  if (now >= windowStart && now <= dueAt) return null;

  const timeZone = getTaskTimeZone(task);
  const windowLabel = getCompletionWindowLabel(task.frequency);
  if (now < windowStart) {
    return `Status can be changed in its scheduled ${windowLabel}, from ${formatWindowDate(windowStart, timeZone)}.`;
  }

  return `Status can no longer be changed after the due date, ${formatWindowDate(dueAt, timeZone)}.`;
}
export function isTaskOverdue(task: TaskItem) {
  return task.isOverdue || task.status === "OVERDUE";
}

/** Statuses the assignee may move a task to, or [] when its status is locked. */
export function getSelectableStatuses(task: TaskItem): TaskStatus[] {
  const isOverdue = isTaskOverdue(task);
  const isStatusLockedBySchedule = !!getStatusLockReason(task) && !isOverdue;
  if (
    task.prerequisiteBlocked ||
    isStatusLockedBySchedule ||
    task.status === "DONE" ||
    task.status === "NOT_APPLICABLE" ||
    task.status === "APPROVAL_PENDING"
  ) {
    return [];
  }
  const statusOrder: Record<TaskStatus, number> = {
    PENDING: 0,
    OVERDUE: 0,
    IN_PROGRESS: 1,
    PARTLY_DONE: 3,
    DONE: 4,
    APPROVAL_PENDING: 4,
    LESS_THAN_50: 2,
    NOT_APPLICABLE: 4,
  };
  if (isOverdue) {
    return ["DONE"];
  }
  const allOptions: TaskStatus[] = [
    "PENDING",
    "IN_PROGRESS",
    "PARTLY_DONE",
    "DONE",
  ];
  const currentOrder = statusOrder[task.status] ?? 0;
  return allOptions.filter((status) => statusOrder[status] >= currentOrder);
}

export function formatTaskStatus(status: TaskStatus) {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function TaskMiniCard({
  task,
  onClick,
  onStatusChange,
  onAcknowledgement,
  saving,
}: Props) {
  const isCompleted = task.status === "DONE";
  const isOverdue = isTaskOverdue(task);
  const wasOverdue = !!task.wasOverdue && !isOverdue;
  const requiresAcknowledgement = task.taskCategory === "ASSIGNED_TASK";
  const isAcknowledged =
    !requiresAcknowledgement || Boolean(task.acknowledgedAt);
  const isPrerequisiteBlocked = !!task.prerequisiteBlocked;
  const statusLockReason = getStatusLockReason(task);
  const isStatusLockedBySchedule = !!statusLockReason && !isOverdue;
  const prerequisiteLabel = task.prerequisiteActivityNames?.length
    ? `Locked until ${task.prerequisiteActivityNames.join(", ")} is done`
    : "Locked until prerequisite activity is done";
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(event.target as Node)
      ) {
        setIsStatusOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleStatusSelect = (nextStatus: TaskStatus) => {
    setIsStatusOpen(false);
    onStatusChange(task.instanceId, nextStatus);
  };

  const handleAckSelect = () => {
    onAcknowledgement(task.taskId);
  };

  // Keep the priority readable without decorative icons.
  const renderPriority = () => {
    const p = task.priority === "LOW" ? "MEDIUM" : task.priority || "MEDIUM";
    if (p === "CRITICAL") {
      return (
        <span className="flex items-center gap-1.25 text-[13px] font-normal text-danger">
          <span>Critical priority</span>
        </span>
      );
    }
    if (p === "HIGH") {
      return (
        <span className="flex items-center gap-1.25 text-[13px] font-normal text-muted-foreground">
          <span>High priority</span>
        </span>
      );
    }
    if (p === "MEDIUM") {
      return (
        <span className="flex items-center gap-1.25 text-[13px] font-normal text-muted-foreground">
          <span>Medium priority</span>
        </span>
      );
    }
    return null;
  };

  // Frequency is shown as plain text in the compact metadata row.
  const renderFrequency = () => {
    const label = task.frequency
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground font-normal text-[13px]">
        <span>{label}</span>
      </div>
    );
  };

  // Assigned By element matching mockup with extra light stroke, color-free borders/text on avatar bubble
  const renderAssignedBy = () => {
    if (!task.assignedBy || !task.assignedBy.name) return null;

    const assigner = task.assignedBy;
    const initials = assigner.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    // Stable hash based on assigner name to choose a light avatar background
    const charCodeSum = assigner.name
      .split("")
      .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const bgColors = [
      "bg-info-subtle text-info border-info",
      "bg-muted text-foreground border-border",
    ];
    const borderBgClass = bgColors[charCodeSum % bgColors.length];

    return (
      <div className="flex items-center gap-1.5">
        <span
          className={`flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold border ${borderBgClass}`}
        >
          {initials}
        </span>
        <span className="text-foreground font-normal text-[13px]">
          {assigner.name}
        </span>
      </div>
    );
  };

  // Due date element matching mockup with extra light stroke, color-free SVG icon
  const renderDueDate = () => {
    // The dashboard groups task instances by their scheduled organization day.
    // Use that same date for the card label; `dueAt` is an end-of-day instant and
    // can otherwise render as the following date when legacy data used UTC EOD.
    const scheduledDateKey = (task.scheduledFor ?? task.dueAt).slice(0, 10);
    const dueDate = new Date(`${scheduledDateKey}T00:00:00.000Z`);

    if (isNaN(dueDate.getTime())) {
      return null;
    }

    let dateText = "";

    if (scheduledDateKey === getOrganizationTodayKey(getTaskTimeZone(task))) {
      dateText = "Due today";
    } else {
      dateText =
        formatOrganizationDateKey(scheduledDateKey, {
          day: "numeric",
          month: "long",
        }) ?? "";
    }

    return (
      <div className="flex items-center gap-1.5 font-normal text-[13px]">
        <Clock
          className="h-3.5 w-3.5 text-muted-foreground shrink-0"
          strokeWidth={1.5}
        />
        <span>{dateText}</span>
      </div>
    );
  };

  return (
    <article
      onClick={() => onClick(task)}
      tabIndex={0}
      aria-label={`Open task: ${task.title}`}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onClick(task);
        }
        if (event.key === "Escape") setIsStatusOpen(false);
      }}
      className={`group flex min-w-0 flex-col gap-3 rounded-[18px] border border-border bg-card p-[13px] transition-colors hover:bg-muted/50 cursor-pointer ${
        isCompleted ? "opacity-85" : ""
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 flex flex-col justify-center self-center">
          {/* Title */}
          <h4
            className={`text-sm font-medium leading-snug text-foreground line-clamp-2 group-hover:text-primary transition duration-150 ${
              isCompleted ? "line-through opacity-50" : ""
            }`}
          >
            {task.title}
          </h4>

          {/* Acknowledgement only applies to directly assigned tasks. */}
          {requiresAcknowledgement &&
            (task.acknowledgedAt ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <CheckCircle
                  className="h-3.5 w-3.5 text-success shrink-0"
                  strokeWidth={1.5}
                />
                <span className="text-success font-normal text-xs">
                  Acknowledged
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-danger/80 mt-1">
                <span className="h-1.5 w-1.5 rounded-full bg-danger shrink-0" />
                <span className="font-normal text-xs">Not Acknowledged</span>
              </div>
            ))}
          {isPrerequisiteBlocked && isAcknowledged && (
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {prerequisiteLabel}
            </p>
          )}
          {!isPrerequisiteBlocked &&
            isStatusLockedBySchedule &&
            isAcknowledged && (
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {statusLockReason}
              </p>
            )}
        </div>

        {/* Status Dropdown Pill */}
        <div className="relative shrink-0" ref={statusMenuRef}>
          {isAcknowledged ? (
            <>
              <Button
                variant="ghost"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isPrerequisiteBlocked && !isStatusLockedBySchedule) {
                    setIsStatusOpen((current) => !current);
                  }
                }}
                disabled={
                  saving ||
                  isPrerequisiteBlocked ||
                  isStatusLockedBySchedule ||
                  task.status === "DONE" ||
                  task.status === "NOT_APPLICABLE" ||
                  task.status === "APPROVAL_PENDING"
                }
                title={
                  isPrerequisiteBlocked
                    ? prerequisiteLabel
                    : (statusLockReason ?? undefined)
                }
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground transition hover:border-info hover:bg-info-subtle disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[34px]"
              >
                <span>{formatTaskStatus(task.status)}</span>
                {!isPrerequisiteBlocked &&
                  !isStatusLockedBySchedule &&
                  task.status !== "DONE" &&
                  task.status !== "NOT_APPLICABLE" &&
                  task.status !== "APPROVAL_PENDING" && (
                    <ChevronDown
                      className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                      strokeWidth={1.5}
                    />
                  )}
              </Button>
              {isStatusOpen &&
                !isPrerequisiteBlocked &&
                !isStatusLockedBySchedule && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                    {getSelectableStatuses(task).map((status) => (
                      <Button
                        variant="ghost"
                        key={status}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStatusSelect(status);
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm transition hover:bg-info-subtle ${task.status === status ? "bg-info-subtle font-semibold text-info" : "text-foreground"}`}
                      >
                        {formatTaskStatus(status)}
                      </Button>
                    ))}
                  </div>
                )}
            </>
          ) : (
            <Button
              variant="ghost"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleAckSelect();
              }}
              disabled={saving}
              className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-3 text-xs font-medium text-info hover:bg-info-subtle disabled:opacity-60 sm:min-h-8 sm:rounded-lg"
            >
              {saving ? "Acknowledging…" : "Acknowledge"}
            </Button>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {/* Left indicators */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 [&>span]:text-xs [&>div]:text-xs">
          {renderPriority()}
          {isOverdue && (
            <span className="inline-flex items-center rounded-full border border-danger bg-danger-subtle px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-danger">
              Overdue
            </span>
          )}
          {wasOverdue && (
            <span className="inline-flex items-center rounded-full border border-warning bg-warning-subtle px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning">
              Was Overdue
            </span>
          )}
          {renderFrequency()}
          {renderAssignedBy()}
        </div>

        {/* Right indicator (Due Date) */}
        <div className="ml-auto shrink-0 text-muted-foreground [&>div]:text-xs">
          {renderDueDate()}
        </div>
      </div>
    </article>
  );
}
