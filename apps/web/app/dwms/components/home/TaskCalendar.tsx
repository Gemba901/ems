import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  DwmsTaskItem as TaskItem,
  DwmsTaskStatus as TaskStatus,
} from "@/services/dwms.service";
import { formatOrganizationDateKey } from "../../utils/organizationDate";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildCalendarDays(monthStart: string) {
  const monthDate = new Date(`${monthStart}T00:00:00.000Z`);
  const firstCell = addDays(monthStart, -monthDate.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => addDays(firstCell, index));
}

function getStatusLabel(status: TaskStatus) {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function TaskCalendar({
  tasks,
  monthStart,
  todayKey,
  selectedDate,
  onSelectDate,
  onOpenTask,
  onPreviousMonth,
  onNextMonth,
  onToday,
  compact = false,
}: {
  tasks: TaskItem[];
  monthStart: string;
  todayKey: string;
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
  onOpenTask: (task: TaskItem) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  compact?: boolean;
}) {
  const calendarDays = buildCalendarDays(monthStart);
  const monthKey = monthStart.slice(0, 7);
  const tasksByDate = new Map<string, TaskItem[]>();

  tasks.forEach((task) => {
    const dateKey = task.scheduledFor?.slice(0, 10);
    if (!dateKey) return;
    const dateTasks = tasksByDate.get(dateKey) ?? [];
    dateTasks.push(task);
    tasksByDate.set(dateKey, dateTasks);
  });

  const monthLabel =
    formatOrganizationDateKey(monthStart, {
      month: "long",
      year: "numeric",
    }) ?? monthStart;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{monthLabel}</h3>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 sm:flex">
          <Button
            variant="ghost"
            type="button"
            onClick={onToday}
            className="min-h-11 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:bg-muted sm:min-h-8 sm:rounded-full"
          >
            Today
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={onPreviousMonth}
            aria-label="Show previous month"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted sm:h-8 sm:w-8 sm:rounded-full"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={onNextMonth}
            aria-label="Show next month"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted sm:h-8 sm:w-8 sm:rounded-full"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className={compact ? "" : "sm:hidden"}>
        <div className="grid grid-cols-7 border-b border-border bg-muted/70">
          {weekDays.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-[10px] font-bold uppercase text-muted-foreground"
            >
              {day.slice(0, 1)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 p-1">
          {calendarDays.map((dateKey) => {
            const dayTasks = tasksByDate.get(dateKey) ?? [];
            const isOutsideMonth = dateKey.slice(0, 7) !== monthKey;
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDate;
            return (
              <Button
                variant="ghost"
                key={dateKey}
                type="button"
                onClick={() => onSelectDate(dateKey)}
                aria-label={
                  compact
                    ? dateKey
                    : `${dateKey}, ${dayTasks.length} ${dayTasks.length === 1 ? "task" : "tasks"}`
                }
                aria-pressed={isSelected}
                className={`relative flex min-h-12 flex-col items-center justify-center rounded-xl text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isOutsideMonth ? "text-muted-foreground" : "text-foreground"
                } ${isSelected ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"}`}
              >
                <span
                  className={
                    isToday && !isSelected ? "text-info" : undefined
                  }
                >
                  {Number(dateKey.slice(8, 10))}
                </span>
                {dayTasks.length > 0 && (
                  <span
                    className={`mt-0.5 h-1.5 w-1.5 rounded-full ${isSelected ? "bg-card" : "bg-info"}`}
                  />
                )}
              </Button>
            );
          })}
        </div>
        <p className="border-t border-border px-4 py-2 text-center text-[11px] text-muted-foreground">
          {compact
            ? "Select a date to filter instances."
            : "Select a date to view its agenda below."}
        </p>
      </div>

      <div className={compact ? "hidden" : "hidden sm:block"}>
        <div className="min-w-0">
          <div className="grid grid-cols-7 border-b border-border bg-muted/70">
            {weekDays.map((day) => (
              <div
                key={day}
                className="px-2 py-3 text-center text-xs font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((dateKey, index) => {
              const dayTasks = tasksByDate.get(dateKey) ?? [];
              const isOutsideMonth = dateKey.slice(0, 7) !== monthKey;
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedDate;

              return (
                <div
                  key={dateKey}
                  onClick={() => onSelectDate(dateKey)}
                  className={`min-h-24 min-w-0 cursor-pointer border-b border-r border-border p-2 transition-colors ${index % 7 === 6 ? "border-r-0" : ""} ${isSelected ? "bg-info-subtle" : isOutsideMonth ? "bg-muted/70 hover:bg-muted" : "bg-card hover:bg-muted"}`}
                >
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => onSelectDate(dateKey)}
                    aria-label={`Explore tasks for ${dateKey}`}
                    className={`mb-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-semibold transition hover:bg-muted text-muted-foreground ${isToday ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
                  >
                    {Number(dateKey.slice(8, 10))}
                  </Button>
                  <div className="space-y-1">
                    {dayTasks.slice(0, 3).map((task) => (
                      <Button
                        variant="ghost"
                        key={task.instanceId}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenTask(task);
                        }}
                        title={`${task.title} — ${getStatusLabel(task.status)}`}
                        className={`flex h-auto w-full min-w-0 items-start justify-start gap-1.5 whitespace-normal rounded px-0.5 py-1 text-left text-xs leading-4 transition hover:bg-muted ${task.status === "OVERDUE" || task.isOverdue ? "text-danger" : "text-muted-foreground"}`}
                      >
                        <span
                          aria-hidden="true"
                          className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current"
                        />
                        <span className="line-clamp-3 min-w-0 break-words">
                          {task.title}
                        </span>
                      </Button>
                    ))}
                    {dayTasks.length > 3 && (
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => onSelectDate(dateKey)}
                        className="block w-full px-1 text-left text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        +{dayTasks.length - 3} more
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
