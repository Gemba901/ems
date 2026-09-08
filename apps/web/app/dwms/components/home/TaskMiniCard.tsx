import { useEffect, useRef, useState } from "react";
import type {
  DwmsTaskItem as TaskItem,
  DwmsTaskStatus as TaskStatus,
} from "@/services/dwms.service";
import {
  ArrowUp,
  Minus,
  Repeat,
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

function getStatusLockReason(task: TaskItem) {
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
export default function TaskMiniCard({
  task,
  onClick,
  onStatusChange,
  onAcknowledgement,
  saving,
}: Props) {
  const isCompleted = task.status === "DONE";
  const isOverdue = task.isOverdue || task.status === "OVERDUE";
  const wasOverdue = !!task.wasOverdue && !isOverdue;
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

  const getSelectableStatuses = (): TaskStatus[] => {
    if (
      isPrerequisiteBlocked ||
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
  };

  const handleAckSelect = () => {
    onAcknowledgement(task.taskId);
  };

  const formatStatus = (status: TaskStatus) => {
    return status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // Priority element matching mockup with extra light stroke, color-free SVG icons
  const renderPriority = () => {
    const p = task.priority === "LOW" ? "MEDIUM" : task.priority || "MEDIUM";
    if (p === "CRITICAL") {
      return (
        <span className="flex items-center gap-1.25 text-[13px] font-normal text-rose-500">
          <ArrowUp
            className="h-3.5 w-3.5 text-rose-500 shrink-0"
            strokeWidth={1.5}
          />
          <span>Critical</span>
        </span>
      );
    }
    if (p === "HIGH") {
      return (
        <span className="flex items-center gap-1.25 text-[13px] font-normal text-slate-500">
          <ArrowUp
            className="h-3.5 w-3.5 text-amber-500 shrink-0"
            strokeWidth={1.5}
          />
          <span>High</span>
        </span>
      );
    }
    if (p === "MEDIUM") {
      return (
        <span className="flex items-center gap-1.25 text-[13px] font-normal text-slate-500">
          <Minus
            className="h-3.5 w-3.5 text-slate-400 shrink-0"
            strokeWidth={1.5}
          />
          <span>Medium</span>
        </span>
      );
    }
    return null;
  };

  // Frequency element matching mockup with extra light stroke, color-free SVG icon
  const renderFrequency = () => {
    const label = task.frequency
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
    return (
      <div className="flex items-center gap-1.5 text-slate-500 font-normal text-[13px]">
        <Repeat
          className="h-3.5 w-3.5 text-slate-500 shrink-0"
          strokeWidth={1.5}
        />
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
      "bg-blue-50 text-blue-700 border-blue-200",
      "bg-slate-50 text-slate-700 border-slate-200",
    ];
    const borderBgClass = bgColors[charCodeSum % bgColors.length];

    return (
      <div className="flex items-center gap-1.5">
        <span
          className={`flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold border ${borderBgClass}`}
        >
          {initials}
        </span>
        <span className="text-slate-700 font-normal text-[13px]">
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
          className="h-3.5 w-3.5 text-slate-500 shrink-0"
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
      className={`group flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:bg-slate-50/50 cursor-pointer ${
        isCompleted ? "opacity-85" : ""
      }`}
    >
      {/* Top row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-40 flex flex-col justify-center">
          {/* Title */}
          <h4
            className={`text-sm font-medium leading-snug text-text-app line-clamp-2 group-hover:text-accent-app transition duration-150 ${
              isCompleted ? "line-through opacity-50" : ""
            }`}
          >
            {task.title}
          </h4>

          {/* Acknowledged status */}
          {task.acknowledgedAt ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-app mt-1">
              <CheckCircle
                className="h-3.5 w-3.5 text-emerald-500 shrink-0"
                strokeWidth={1.5}
              />
              <span className="text-emerald-600 font-normal text-xs">
                Acknowledged
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-rose-500/80 mt-1">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
              <span className="font-normal text-xs">Not Acknowledged</span>
            </div>
          )}
          {isPrerequisiteBlocked && task.acknowledgedAt && (
            <p className="mt-1 text-xs font-medium text-slate-500">
              {prerequisiteLabel}
            </p>
          )}
          {!isPrerequisiteBlocked &&
            isStatusLockedBySchedule &&
            task.acknowledgedAt && (
              <p className="mt-1 text-xs font-medium text-slate-500">
                {statusLockReason}
              </p>
            )}
        </div>

        {/* Status Dropdown Pill */}
        <div className="relative shrink-0" ref={statusMenuRef}>
          {task.acknowledgedAt ? (
            <>
              <button
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
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{formatStatus(task.status)}</span>
                {!isPrerequisiteBlocked &&
                  !isStatusLockedBySchedule &&
                  task.status !== "DONE" &&
                  task.status !== "NOT_APPLICABLE" &&
                  task.status !== "APPROVAL_PENDING" && (
                    <ChevronDown
                      className="h-3.5 w-3.5 text-slate-400 shrink-0"
                      strokeWidth={1.5}
                    />
                  )}
              </button>
              {isStatusOpen &&
                !isPrerequisiteBlocked &&
                !isStatusLockedBySchedule && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                    {getSelectableStatuses().map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStatusSelect(status);
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm transition hover:bg-blue-50 ${task.status === status ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-700"}`}
                      >
                        {formatStatus(status)}
                      </button>
                    ))}
                  </div>
                )}
            </>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleAckSelect();
              }}
              disabled={saving}
              className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
            >
              {saving ? "Acknowledging…" : "Acknowledge"}
            </button>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4">
        {/* Left indicators */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          {renderPriority()}
          {isOverdue && (
            <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700">
              Overdue
            </span>
          )}
          {wasOverdue && (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Was Overdue
            </span>
          )}
          {renderFrequency()}
          {renderAssignedBy()}
        </div>

        {/* Right indicator (Due Date) */}
        {renderDueDate()}
      </div>
    </article>
  );
}
