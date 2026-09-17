import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  DwmsTaskItem as TaskItem,
  DwmsTaskStatus as TaskStatus,
} from "@/services/dwms.service";
import { formatOrganizationDateKey } from "../../utils/organizationDate";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const statusStyles: Record<TaskStatus, string> = {
  PENDING: "border-slate-200 bg-slate-50 text-slate-600",
  IN_PROGRESS: "border-blue-200 bg-blue-50 text-blue-700",
  LESS_THAN_50: "border-amber-200 bg-amber-50 text-amber-700",
  PARTLY_DONE: "border-violet-200 bg-violet-50 text-violet-700",
  DONE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  APPROVAL_PENDING: "border-cyan-200 bg-cyan-50 text-cyan-700",
  NOT_APPLICABLE: "border-slate-200 bg-slate-50 text-slate-400",
  OVERDUE: "border-rose-200 bg-rose-50 text-rose-700",
};

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
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Task calendar
          </p>
          <h3 className="mt-0.5 text-base font-bold text-slate-900">
            {monthLabel}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToday}
            className="h-8 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={onPreviousMonth}
            aria-label="Show previous month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            aria-label="Show next month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70">
            {weekDays.map((day) => (
              <div
                key={day}
                className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400"
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
                  className={`min-h-28 cursor-pointer border-b border-r border-slate-100 p-1.5 transition-colors ${index % 7 === 6 ? "border-r-0" : ""} ${isOutsideMonth ? "bg-slate-50/70 hover:bg-slate-100" : "bg-white hover:bg-slate-50"} ${isSelected ? "ring-2 ring-inset ring-[#52618a]" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDate(dateKey)}
                    aria-label={`Explore tasks for ${dateKey}`}
                    className={`mb-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-semibold transition hover:bg-slate-100 ${isOutsideMonth ? "text-slate-300" : "text-slate-600"} ${isToday ? "bg-[#52618a] text-white hover:bg-[#445174]" : ""}`}
                  >
                    {Number(dateKey.slice(8, 10))}
                  </button>
                  <div className="space-y-1">
                    {dayTasks.slice(0, 3).map((task) => (
                      <button
                        key={task.instanceId}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenTask(task);
                        }}
                        title={`${task.title} — ${getStatusLabel(task.status)}`}
                        className={`block w-full truncate rounded-md border px-1.5 py-1 text-left text-[10px] font-semibold transition hover:brightness-95 ${statusStyles[task.status]}`}
                      >
                        {task.title}
                      </button>
                    ))}
                    {dayTasks.length > 3 && (
                      <button
                        type="button"
                        onClick={() => onSelectDate(dateKey)}
                        className="block w-full px-1 text-left text-[10px] font-semibold text-slate-500 hover:text-slate-800"
                      >
                        +{dayTasks.length - 3} more
                      </button>
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
