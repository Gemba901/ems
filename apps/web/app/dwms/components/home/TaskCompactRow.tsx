import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DwmsTaskItem, DwmsTaskStatus } from "@/services/dwms.service";
import {
  formatOrganizationDateKey,
  getOrganizationTodayKey,
} from "../../utils/organizationDate";
import {
  formatTaskStatus,
  getSelectableStatuses,
  getStatusLockReason,
  isTaskOverdue,
} from "./TaskMiniCard";

type Props = {
  task: DwmsTaskItem;
  onOpen: (task: DwmsTaskItem) => void;
  onStatusChange: (instanceId: string, nextStatus: DwmsTaskStatus) => void;
  onAcknowledgement: (taskId: string) => void;
  saving: boolean;
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "bg-danger",
  HIGH: "bg-warning",
  MEDIUM: "bg-muted",
  LOW: "bg-muted",
};

function dueLabel(task: DwmsTaskItem) {
  // Same scheduled-day key TaskMiniCard uses, so both views agree on "today".
  const key = (task.scheduledFor ?? task.dueAt).slice(0, 10);
  if (key === getOrganizationTodayKey(task.organizationTimeZone)) return "Today";
  return formatOrganizationDateKey(key, { day: "numeric", month: "short" }) ?? "";
}

/** One-line task row for the dashboard; the full card lives in DWMS. */
export default function TaskCompactRow({ task, onOpen, onStatusChange, onAcknowledgement, saving }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const overdue = isTaskOverdue(task);
  const requiresAcknowledgement = task.taskCategory === "ASSIGNED_TASK";
  const isAcknowledged =
    !requiresAcknowledgement || Boolean(task.acknowledgedAt);
  const options = getSelectableStatuses(task);
  const lockReason = task.prerequisiteBlocked
    ? task.prerequisiteActivityNames?.length
      ? `Locked until ${task.prerequisiteActivityNames.join(", ")} is done`
      : "Locked until prerequisite activity is done"
    : getStatusLockReason(task);
  const frequency = task.frequency.charAt(0) + task.frequency.slice(1).toLowerCase();

  useEffect(() => {
    if (!menuOpen) return;
    function close(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <li
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen(task);
        }
        if (event.key === "Escape") setMenuOpen(false);
      }}
      tabIndex={0}
      aria-label={`Open task: ${task.title}`}
      className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted focus:outline-none focus-visible:bg-muted"
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority ?? "MEDIUM"] ?? PRIORITY_DOT.MEDIUM}`}
        title={`${task.priority ?? "MEDIUM"} priority`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {frequency}
          {" · "}
          {overdue ? <span className="font-medium text-danger">Overdue</span> : `Due ${dueLabel(task)}`}
          {requiresAcknowledgement && !task.acknowledgedAt && (
            <span className="text-danger"> · Not acknowledged</span>
          )}
        </p>
      </div>

      <div className="relative shrink-0" ref={menuRef}>
        {isAcknowledged ? (
          <>
            <Button
              variant="ghost"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (options.length) setMenuOpen((open) => !open);
              }}
              disabled={saving || options.length === 0}
              title={lockReason ?? undefined}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {formatTaskStatus(task.status)}
              {options.length > 0 && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            </Button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
                {options.map((status) => (
                  <Button
                    variant="ghost"
                    key={status}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuOpen(false);
                      onStatusChange(task.instanceId, status);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-sm transition hover:bg-muted ${
                      task.status === status ? "font-medium text-foreground" : "text-muted-foreground"
                    }`}
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
              onAcknowledgement(task.taskId);
            }}
            disabled={saving}
            className="inline-flex h-7 items-center rounded-md border border-border bg-card px-2 text-xs font-medium text-primary transition hover:bg-accent disabled:opacity-60"
          >
            {saving ? "Saving…" : "Acknowledge"}
          </Button>
        )}
      </div>
    </li>
  );
}
