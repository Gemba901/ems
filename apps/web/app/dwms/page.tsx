"use client";

import TaskCompletionDialog from "./components/home/TaskCompletionDialog";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import TaskMiniCard from "./components/home/TaskMiniCard";
import TaskCalendar from "./components/home/TaskCalendar";
import DwmsSelectDropdown from "./components/DwmsSelectDropdown";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsTaskCategory,
  type DwmsTaskItem as TaskItem,
  type DwmsTaskStatus as TaskStatus,
} from "@/services/dwms.service";
import { uploadImage } from "@/services/uploads.service";
import { addDaysToDateKey } from "./utils/organizationDate";
import {
  CalendarDays,
  List,
  Minus,
  PlusCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

type HomeTaskView = "TODAY" | "WEEK" | "MONTH" | "CALENDAR";
type MobileTaskCategory = "ALL" | DwmsTaskCategory;

const TASK_CATEGORIES: Array<{
  key: DwmsTaskCategory;
  label: string;
}> = [
  { key: "GOOD_PRACTICE", label: "Good Practices" },
  { key: "JOB_RESPONSIBILITY", label: "Job Responsibility" },
  { key: "ASSIGNED_TASK", label: "Assigned Tasks" },
];

const statusCompletion: Record<TaskStatus, number> = {
  PENDING: 0,
  IN_PROGRESS: 20,
  DONE: 100,
  APPROVAL_PENDING: 100,
  PARTLY_DONE: 50,
  LESS_THAN_50: 10,
  NOT_APPLICABLE: 0,
  OVERDUE: 0,
};

function calculateCompletionRate(tasks: TaskItem[]) {
  const applicableTasks = tasks.filter(
    (task) => task.status !== "NOT_APPLICABLE",
  );
  if (applicableTasks.length === 0) return null;

  const completionTotal = applicableTasks.reduce(
    (sum, task) => sum + statusCompletion[task.status],
    0,
  );
  return Math.round(completionTotal / applicableTasks.length);
}

function getTaskWindow(view: HomeTaskView, start: string) {
  if (view === "CALENDAR" || view === "MONTH") {
    const monthStart = `${start.slice(0, 7)}-01`;
    const end = addMonthsToDateKey(monthStart, 1);
    return { start: monthStart, end, days: 31 };
  }
  const days = view === "TODAY" ? 1 : 7;
  const end = addDaysToDateKey(start, days) ?? start;
  return { start, end, days };
}

function getTaskPeriodStart(view: HomeTaskView, referenceDate: string) {
  if (view === "MONTH" || view === "CALENDAR") {
    return `${referenceDate.slice(0, 7)}-01`;
  }
  if (view !== "WEEK") return referenceDate;

  const date = new Date(`${referenceDate}T00:00:00.000Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function getPreviousTaskWindow(view: HomeTaskView, currentStart: string) {
  if (view === "CALENDAR" || view === "MONTH") {
    const start = addMonthsToDateKey(`${currentStart.slice(0, 7)}-01`, -1);
    return { start, end: addMonthsToDateKey(start, 1) };
  }
  const current = getTaskWindow(view, currentStart);
  const daysAgo = view === "TODAY" ? 7 : current.days;
  const start = addDaysToDateKey(current.start, -daysAgo) ?? current.start;
  const end = addDaysToDateKey(start, current.days) ?? start;
  return { start, end };
}

function addMonthsToDateKey(dateKey: string, months: number) {
  const date = new Date(`${dateKey.slice(0, 7)}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function isTaskScheduledInWindow(task: TaskItem, start: string, end: string) {
  const scheduledDateKey = task.scheduledFor?.slice(0, 10);
  if (!scheduledDateKey) return false;
  return scheduledDateKey >= start && scheduledDateKey < end;
}

function isTaskFrequencyVisibleInView(task: TaskItem, view: HomeTaskView) {
  if (view === "CALENDAR") return true;
  const expectedFrequency =
    view === "TODAY" ? "DAILY" : view === "WEEK" ? "WEEKLY" : "MONTHLY";
  if (task.frequency === expectedFrequency) return true;

  return (
    task.taskCategory === "ASSIGNED_TASK" && task.frequency === "PLANNED"
  );
}

function selectTasksForView(
  taskItems: TaskItem[],
  view: HomeTaskView,
  start: string,
  end: string,
) {
  const selected = new Map<string, TaskItem>();

  taskItems.forEach((task) => {
    if (
      !isTaskScheduledInWindow(task, start, end) ||
      !isTaskFrequencyVisibleInView(task, view)
    ) {
      return;
    }

    const key = view === "CALENDAR" ? task.instanceId : task.taskId;
    const existing = selected.get(key);
    if (
      !existing ||
      (task.scheduledFor ?? task.dueAt) <
        (existing.scheduledFor ?? existing.dueAt)
    ) {
      selected.set(key, task);
    }
  });

  return Array.from(selected.values());
}

function isHomeVisibleTask(task: TaskItem) {
  return (
    !task.isOverdue &&
    task.status !== "OVERDUE" &&
    task.status !== "DONE" &&
    task.status !== "NOT_APPLICABLE"
  );
}

function formatCalendarSelection(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function HomeTaskCardList({
  tasks,
  savingId,
  onOpenTask,
  onStatusChange,
  onAcknowledgement,
}: {
  tasks: TaskItem[];
  savingId: string | null;
  onOpenTask: (task: TaskItem) => void;
  onStatusChange: (instanceId: string, nextStatus: TaskStatus) => void;
  onAcknowledgement: (taskId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {tasks.map((task) => (
        <TaskMiniCard
          key={task.instanceId}
          task={task}
          onClick={() => onOpenTask(task)}
          onStatusChange={onStatusChange}
          onAcknowledgement={onAcknowledgement}
          saving={savingId === task.instanceId || savingId === task.taskId}
        />
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <HomeContent />
    </ProtectedRoute>
  );
}

function HomeContent() {
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [previousTasks, setPreviousTasks] = useState<TaskItem[]>([]);
  const [taskView, setTaskView] = useState<HomeTaskView>("TODAY");
  const [lastListView, setLastListView] = useState<HomeTaskView>("TODAY");
  const [mobileTaskCategory, setMobileTaskCategory] =
    useState<MobileTaskCategory>("ALL");
  const [organizationDate, setOrganizationDate] = useState<string | null>(null);
  const [calendarMonthStart, setCalendarMonthStart] = useState<string | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<
    string | null
  >(null);
  const [alertsCount, setAlertsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [completionTask, setCompletionTask] = useState<{
    instanceId: string;
    status: TaskStatus;
    requiresCompletionDocument: boolean;
    completionDocumentName?: string | null;
  } | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [completionFile, setCompletionFile] = useState<File | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (view: HomeTaskView = taskView) => {
      setLoading(true);
      setError(null);
      try {
        const token = useAuthStore.getState().accessToken ?? "";
        const requestedDate = view === "CALENDAR"
          ? (calendarMonthStart ?? undefined)
          : organizationDate
            ? getTaskPeriodStart(view, organizationDate)
            : undefined;
        const [initialTaskResponse, alertsRes] = await Promise.all([
          DwmsService.getTodayTasks(token, requestedDate, "scheduled"),
          DwmsService.getMyAlertCount(token),
        ]);
        let taskResponse = initialTaskResponse;
        if (!taskResponse?.date) {
          throw new Error("The server did not provide the organization date");
        }

        const organizationToday = organizationDate ?? taskResponse.date;
        const periodStart = view === "CALENDAR"
          ? (calendarMonthStart ?? getTaskPeriodStart(view, organizationToday))
          : getTaskPeriodStart(view, organizationToday);

        if (taskResponse.date !== periodStart) {
          taskResponse = await DwmsService.getTodayTasks(
            token,
            periodStart,
            "scheduled",
          );
        }

        setOrganizationDate((current) => current ?? organizationToday);
        if (view === "CALENDAR" && !calendarMonthStart) {
          setCalendarMonthStart(periodStart);
          setSelectedCalendarDate(organizationToday);
        }
        const { start, end } = getTaskWindow(view, periodStart);
        const previousWindow = getPreviousTaskWindow(view, periodStart);
        const previousTaskResponse = await DwmsService.getTodayTasks(
          token,
          previousWindow.start,
          "scheduled",
          undefined,
          undefined,
        );
        setTasks(
          selectTasksForView(taskResponse?.tasks ?? [], view, start, end),
        );
        setPreviousTasks(
          selectTasksForView(
            previousTaskResponse?.tasks ?? [],
            view,
            previousWindow.start,
            previousWindow.end,
          ),
        );
        setAlertsCount(Number(alertsRes?.count ?? 0));
      } catch (err: unknown) {
        setError(getDwmsErrorMessage(err, "Failed to load home page data"));
      } finally {
        setLoading(false);
      }
    },
    [calendarMonthStart, organizationDate, taskView],
  );

  useEffect(() => {
    void loadData(taskView);
  }, [loadData, taskView]);

  const visibleTasks = useMemo(() => {
    const timeValue = (value?: string | null) => {
      if (!value) return Number.MAX_SAFE_INTEGER;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
    };

    return tasks.filter(isHomeVisibleTask).sort((a, b) => {
      const dateDiff =
        timeValue(a.scheduledFor ?? a.dueAt) -
        timeValue(b.scheduledFor ?? b.dueAt);
      if (dateDiff !== 0) return dateDiff;
      return a.title.localeCompare(b.title);
    });
  }, [tasks]);

  const tasksByCategory = useMemo(() => {
    return TASK_CATEGORIES.reduce<Record<DwmsTaskCategory, TaskItem[]>>(
      (groupedTasks, category) => {
        groupedTasks[category.key] = visibleTasks.filter(
          (task) => task.taskCategory === category.key,
        );
        return groupedTasks;
      },
      {
        GOOD_PRACTICE: [],
        JOB_RESPONSIBILITY: [],
        ASSIGNED_TASK: [],
      },
    );
  }, [visibleTasks]);

  const mobileVisibleTasks = useMemo(
    () =>
      mobileTaskCategory === "ALL"
        ? visibleTasks
        : tasksByCategory[mobileTaskCategory],
    [mobileTaskCategory, tasksByCategory, visibleTasks],
  );

  const stats = useMemo(() => {
    const applicableTasks = tasks.filter(
      (task) => task.status !== "NOT_APPLICABLE",
    );
    const total = applicableTasks.length;
    const done = applicableTasks.filter((t) => t.status === "DONE").length;
    const remaining = total - done;
    const productivity = calculateCompletionRate(applicableTasks);
    const previousProductivity = calculateCompletionRate(previousTasks);
    const productivityChange =
      productivity === null || previousProductivity === null
        ? null
        : productivity - previousProductivity;

    return { total, done, remaining, productivity, productivityChange };
  }, [previousTasks, tasks]);

  const selectedCalendarTasks = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return tasks.filter(
      (task) => task.scheduledFor?.slice(0, 10) === selectedCalendarDate,
    );
  }, [selectedCalendarDate, tasks]);

  const productivityTrend = useMemo(() => {
    const change = stats.productivityChange;
    const comparisonLabel =
      taskView === "CALENDAR"
        ? "vs previous month"
        : taskView === "MONTH"
          ? "vs previous month"
          : taskView === "WEEK"
            ? "vs previous week"
            : "vs last week";

    if (change === null) {
      return {
        Icon: Minus,
        label: "No prior data",
        className: "text-muted-app",
      };
    }
    if (change > 0) {
      return {
        Icon: TrendingUp,
        label: `+${change}% ${comparisonLabel}`,
        className: "text-emerald-500",
      };
    }
    if (change < 0) {
      return {
        Icon: TrendingDown,
        label: `${change}% ${comparisonLabel}`,
        className: "text-rose-500",
      };
    }
    return {
      Icon: Minus,
      label: `No change ${comparisonLabel}`,
      className: "text-muted-app",
    };
  }, [stats.productivityChange, taskView]);

  function handleTaskViewChange(view: HomeTaskView) {
    if (view !== "CALENDAR") setLastListView(view);
    if (view === "CALENDAR") {
      const todayKey = organizationDate ?? new Date().toISOString().slice(0, 10);
      setCalendarMonthStart(`${todayKey.slice(0, 7)}-01`);
      setSelectedCalendarDate(todayKey);
    }
    setTaskView(view);
  }

  function moveCalendarMonth(months: number) {
    setCalendarMonthStart((current) =>
      addMonthsToDateKey(
        current ??
          `${(organizationDate ?? new Date().toISOString()).slice(0, 7)}-01`,
        months,
      ),
    );
    setSelectedCalendarDate(null);
  }

  function showCurrentCalendarMonth() {
    const todayKey = organizationDate ?? new Date().toISOString().slice(0, 10);
    setCalendarMonthStart(`${todayKey.slice(0, 7)}-01`);
    setSelectedCalendarDate(todayKey);
  }

  function handleCalendarDateSelect(dateKey: string) {
    const selectedMonthStart = `${dateKey.slice(0, 7)}-01`;
    if (selectedMonthStart !== calendarMonthStart) {
      setCalendarMonthStart(selectedMonthStart);
    }
    setSelectedCalendarDate(dateKey);
  }

  async function handleStatusChange(
    instanceId: string,
    nextStatus: TaskStatus,
  ) {
    if (nextStatus === "DONE") {
      const task = tasks.find((item) => item.instanceId === instanceId);
      setCompletionTask({
        instanceId,
        status: nextStatus,
        requiresCompletionDocument: !!task?.requiresCompletionDocument,
        completionDocumentName: task?.completionDocumentName ?? null,
      });
      setCompletionNote("");
      setCompletionFile(null);
      setCompletionError(null);
      setError(null);
      return;
    }

    setSavingId(instanceId);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.updateTaskStatus(token, instanceId, {
        status: nextStatus,
        completionPercent: statusCompletion[nextStatus],
      });
      await loadData();
    } catch (saveError: unknown) {
      setError(getDwmsErrorMessage(saveError, "Failed to update task status"));
    } finally {
      setSavingId(null);
    }
  }

  async function handleCompletionSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!completionTask) return;
    if (completionTask.requiresCompletionDocument && !completionFile) {
      setCompletionError("Completion document is required for this task.");
      return;
    }

    setSavingId(completionTask.instanceId);
    setCompletionError(null);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const upload = completionFile
        ? await uploadImage(completionFile, "dwms/task-completions", token)
        : null;
      await DwmsService.updateTaskStatus(token, completionTask.instanceId, {
        status: completionTask.status,
        completionPercent: statusCompletion[completionTask.status],
        completionNote: completionNote.trim() || null,
        completionAttachmentUrl: upload?.fileUrl ?? null,
        completionAttachmentName: completionFile?.name ?? null,
      });
      setCompletionTask(null);
      setCompletionNote("");
      setCompletionFile(null);
      setCompletionError(null);
      await loadData();
    } catch (saveError: unknown) {
      setCompletionError(
        getDwmsErrorMessage(saveError, "Failed to complete task"),
      );
    } finally {
      setSavingId(null);
    }
  }

  async function handleAcknowledgement(taskId: string) {
    setSavingId(taskId);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.acknowledgeTask(token, taskId);
      await loadData();
    } catch (saveError: unknown) {
      setError(getDwmsErrorMessage(saveError, "Failed to acknowledge task"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      <section
        aria-label="Work summary"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {[
          {
            label: "Completed",
            value: `${stats.done} / ${stats.total}`,
            detail: `${stats.remaining} not completed in this view`,
          },
          {
            label: "Awaiting approval",
            value: tasks.filter((task) => task.status === "APPROVAL_PENDING")
              .length,
            detail: "Submitted for review",
          },
          {
            label: "Alerts",
            value: alertsCount,
            detail: "Alerts raised against you",
          },
          {
            label: "Completion rate",
            value: stats.productivity === null ? "—" : `${stats.productivity}%`,
            detail: productivityTrend.label,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3"
          >
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className="my-1 text-2xl font-semibold tabular-nums text-slate-900">
              {loading || error ? "—" : card.value}
            </p>
            <p className="text-xs text-slate-500">
              {loading ? "Loading…" : error ? "Unavailable" : card.detail}
            </p>
          </div>
        ))}
      </section>

      {/* Tasks Section */}
      <section className="min-w-0">
        <div className="pb-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-text-app">
                My task schedule
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Choose a focused list or explore every task by date.
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <button
                type="button"
                onClick={() => router.push("/dwms/actions/new?mode=ALERT")}
                className="inline-flex w-full cursor-pointer select-none items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 sm:w-auto"
              >
                <span>Raise Alert</span>
              </button>
              <button
                type="button"
                onClick={() => router.push("/dwms/actions/new?mode=TASK")}
                className="inline-flex w-full cursor-pointer select-none items-center justify-center gap-1.5 rounded-full border border-transparent bg-[#52618a] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#445174] sm:w-auto"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Assign a Task</span>
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="Task time range"
              className="flex rounded-xl border border-slate-200 bg-white p-1"
            >
              {[
                { key: "TODAY", label: "Today" },
                { key: "WEEK", label: "Week" },
                { key: "MONTH", label: "Month" },
              ].map((view) => {
                const active = taskView === view.key;
                return (
                  <button
                    key={view.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() =>
                      handleTaskViewChange(view.key as HomeTaskView)
                    }
                    className={`min-h-10 rounded-lg px-4 text-xs font-semibold transition ${active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    {view.label}
                  </button>
                );
              })}
            </div>

            <div role="group" aria-label="Task display" className="flex rounded-xl border border-slate-200 bg-white p-1">
              <button type="button" aria-pressed={taskView !== "CALENDAR"} onClick={() => { if (taskView === "CALENDAR") handleTaskViewChange(lastListView); }} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${taskView !== "CALENDAR" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}><List className="h-4 w-4" aria-hidden="true" />List</button>
              <button type="button" aria-pressed={taskView === "CALENDAR"} onClick={() => handleTaskViewChange("CALENDAR")} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${taskView === "CALENDAR" ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}><CalendarDays className="h-4 w-4" aria-hidden="true" />Calendar</button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl mt-2 border border-dashed border-border-app bg-white py-16 text-center text-sm text-muted-app">
            Loading tasks...
          </div>
        ) : taskView === "CALENDAR" && calendarMonthStart ? (
          <div className="mt-3 space-y-4">
            <TaskCalendar
              tasks={tasks}
              monthStart={calendarMonthStart}
              todayKey={organizationDate ?? ""}
              selectedDate={selectedCalendarDate}
              onSelectDate={handleCalendarDateSelect}
              onOpenTask={(task) =>
                router.push(`/dwms/tasks/${task.instanceId}`)
              }
              onPreviousMonth={() => moveCalendarMonth(-1)}
              onNextMonth={() => moveCalendarMonth(1)}
              onToday={showCurrentCalendarMonth}
            />

            {selectedCalendarDate && (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-slate-800">
                    {formatCalendarSelection(selectedCalendarDate)}
                  </h3>
                  <span className="text-xs font-medium text-slate-500">
                    {selectedCalendarTasks.length}{" "}
                    {selectedCalendarTasks.length === 1 ? "task" : "tasks"}
                  </span>
                </div>
                {selectedCalendarTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white py-8 text-center text-sm italic text-slate-500">
                    No tasks scheduled for this date.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {selectedCalendarTasks.map((task) => (
                      <TaskMiniCard
                        key={task.instanceId}
                        task={task}
                        onClick={() =>
                          router.push(`/dwms/tasks/${task.instanceId}`)
                        }
                        onStatusChange={handleStatusChange}
                        onAcknowledgement={handleAcknowledgement}
                        saving={
                          savingId === task.instanceId || savingId === task.taskId
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-2xl mt-2 border border-dashed border-border-app bg-white py-16 text-center text-sm text-muted-app italic">
            {taskView === "TODAY"
              ? "No tasks due today."
              : taskView === "WEEK"
                ? "No assigned or weekly tasks due this week."
                : "No assigned or monthly tasks due this month."}
          </div>
        ) : (
          <>
            <div className="mt-3 lg:hidden">
              <p className="mb-1.5 block text-xs font-semibold text-slate-600">
                Filter tasks
              </p>
              <DwmsSelectDropdown
                ariaLabel="Filter tasks"
                value={mobileTaskCategory}
                onChange={(value) =>
                  setMobileTaskCategory(value as MobileTaskCategory)
                }
                placeholder="All"
                options={[
                  { value: "ALL", label: "All" },
                  ...TASK_CATEGORIES.map((category) => ({
                    value: category.key,
                    label: category.label,
                  })),
                ]}
                triggerClassName="h-11 rounded-xl border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 sm:rounded-xl"
                contentClassName="w-full max-w-full rounded-xl sm:w-full [&_button]:min-h-11"
              />

              {mobileVisibleTasks.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center text-sm italic text-slate-500">
                  No tasks in this category.
                </div>
              ) : (
                <div className="mt-3">
                  <HomeTaskCardList
                    tasks={mobileVisibleTasks}
                    savingId={savingId}
                    onOpenTask={(task) =>
                      router.push(`/dwms/tasks/${task.instanceId}`)
                    }
                    onStatusChange={handleStatusChange}
                    onAcknowledgement={handleAcknowledgement}
                  />
                </div>
              )}
            </div>

            <div className="mt-4 hidden lg:block">
              <div className="grid grid-cols-3 gap-4">
                {TASK_CATEGORIES.map((category) => (
                  <div
                    key={category.key}
                    className="flex min-w-0 items-center gap-2"
                  >
                    <h3 className="text-sm font-semibold text-slate-800">
                      {category.label}
                    </h3>
                    <span className="text-xs font-normal tabular-nums text-slate-500">
                      {tasksByCategory[category.key].length}
                    </span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 items-start gap-4 pt-4">
                {TASK_CATEGORIES.map((category) => (
                  <div key={category.key} className="min-w-0">
                    {tasksByCategory[category.key].length > 0 && (
                      <HomeTaskCardList
                        tasks={tasksByCategory[category.key]}
                        savingId={savingId}
                        onOpenTask={(task) =>
                          router.push(`/dwms/tasks/${task.instanceId}`)
                        }
                        onStatusChange={handleStatusChange}
                        onAcknowledgement={handleAcknowledgement}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {completionTask && (
        <TaskCompletionDialog
          task={completionTask}
          note={completionNote}
          file={completionFile}
          error={completionError}
          saving={!!savingId}
          onNoteChange={setCompletionNote}
          onFileChange={setCompletionFile}
          onClose={() => {
            setCompletionTask(null);
            setCompletionError(null);
          }}
          onSubmit={handleCompletionSubmit}
        />
      )}
    </div>
  );
}
