"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import TaskMiniCard from "./components/home/TaskMiniCard";
import TaskCalendar from "./components/home/TaskCalendar";
import TaskDateSeparator, {
  getDateSeparatorMeta,
} from "./components/TaskDateSeparator";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsTaskItem as TaskItem,
  type DwmsTaskStatus as TaskStatus,
} from "@/services/dwms.service";
import { uploadImage } from "@/services/uploads.service";
import { addDaysToDateKey } from "./utils/organizationDate";
import {
  CalendarDays,
  Minus,
  PlusCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

type HomeTaskView = "TODAY" | "WEEK" | "MONTH" | "CALENDAR";

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
  if (view === "CALENDAR") {
    const monthStart = `${start.slice(0, 7)}-01`;
    const end = addMonthsToDateKey(monthStart, 1);
    return { start: monthStart, end, days: 31 };
  }
  const days = view === "TODAY" ? 1 : view === "WEEK" ? 7 : 30;
  const end = addDaysToDateKey(start, days) ?? start;
  return { start, end, days };
}

function getPreviousTaskWindow(view: HomeTaskView, currentStart: string) {
  if (view === "CALENDAR") {
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

function isTaskIncludedInView(task: TaskItem, view: HomeTaskView) {
  if (view === "WEEK") {
    return task.isAdhoc || task.frequency === "WEEKLY";
  }
  if (view === "MONTH") {
    return task.isAdhoc || task.frequency === "MONTHLY";
  }
  return true;
}

function isHomeVisibleTask(task: TaskItem) {
  return (
    !task.isOverdue &&
    task.status !== "OVERDUE" &&
    task.status !== "DONE" &&
    task.status !== "NOT_APPLICABLE"
  );
}

function getHomeTaskDateValue(task: TaskItem) {
  return task.scheduledFor ?? task.dueAt;
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
  const [organizationDate, setOrganizationDate] = useState<string | null>(null);
  const [calendarMonthStart, setCalendarMonthStart] = useState<string | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<
    string | null
  >(null);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);
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
        const requestedDate =
          view === "CALENDAR" ? (calendarMonthStart ?? undefined) : undefined;
        const [taskResponse, alertsRes] = await Promise.all([
          DwmsService.getTodayTasks(token, requestedDate, "scheduled"),
          DwmsService.getOpenAlertCount(token),
        ]);
        if (!taskResponse?.date) {
          throw new Error("The server did not provide the organization date");
        }
        setOrganizationDate((current) => current ?? taskResponse.date!);
        if (view === "CALENDAR" && !calendarMonthStart) {
          setCalendarMonthStart(`${taskResponse.date.slice(0, 7)}-01`);
          setSelectedCalendarDate(taskResponse.date);
        }
        const { start, end } = getTaskWindow(view, taskResponse.date);
        const previousWindow = getPreviousTaskWindow(view, taskResponse.date);
        const previousTaskResponse = await DwmsService.getTodayTasks(
          token,
          previousWindow.start,
          "scheduled",
        );
        const byInstanceId = new Map<string, TaskItem>();
        const previousByInstanceId = new Map<string, TaskItem>();

        (taskResponse?.tasks ?? []).forEach((task) => {
          if (
            isTaskScheduledInWindow(task, start, end) &&
            isTaskIncludedInView(task, view)
          ) {
            byInstanceId.set(task.instanceId, task);
          }
        });

        (previousTaskResponse?.tasks ?? []).forEach((task) => {
          if (
            isTaskScheduledInWindow(
              task,
              previousWindow.start,
              previousWindow.end,
            ) && isTaskIncludedInView(task, view)
          ) {
            previousByInstanceId.set(task.instanceId, task);
          }
        });

        setTasks(Array.from(byInstanceId.values()));
        setPreviousTasks(Array.from(previousByInstanceId.values()));
        setActiveAlertsCount(Number(alertsRes?.count ?? 0));
      } catch (err: unknown) {
        setError(getDwmsErrorMessage(err, "Failed to load home page data"));
      } finally {
        setLoading(false);
      }
    },
    [calendarMonthStart, taskView],
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
          ? "vs previous 30 days"
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
    <div className="mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
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
            label: "Open alerts",
            value: activeAlertsCount,
            detail: activeAlertsCount ? "Needs attention" : "No open alerts",
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
        <div className="border-b border-border-app pb-4">
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

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div
              role="tablist"
              aria-label="Task time range"
              className="flex w-full rounded-full border border-slate-200 bg-white p-1 shadow-sm sm:w-auto"
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
                    className={`h-9 flex-1 rounded-full px-5 text-xs font-bold transition sm:flex-none ${active ? "bg-[#52618a] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    {view.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => handleTaskViewChange("CALENDAR")}
              aria-pressed={taskView === "CALENDAR"}
              className={`group flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 text-left transition sm:w-auto sm:min-w-52 ${taskView === "CALENDAR" ? "border-[#52618a] bg-[#52618a] text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-[#52618a]/50 hover:bg-slate-50"}`}
            >
              <span
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${taskView === "CALENDAR" ? "bg-white/15 text-white" : "bg-[#52618a]/10 text-[#52618a]"}`}
              >
                <CalendarDays className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold">Calendar view</span>
                <span
                  className={`mt-0.5 block text-[10px] ${taskView === "CALENDAR" ? "text-white/75" : "text-slate-500"}`}
                >
                  Explore every task by date
                </span>
              </span>
            </button>
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
          <div className="mt-2 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {(() => {
              let previousDateKey: string | null = null;
              return visibleTasks.map((task) => {
                const dateMeta = getDateSeparatorMeta(
                  getHomeTaskDateValue(task),
                  task.organizationTimeZone,
                  true,
                );
                const showSeparator =
                  !!dateMeta && dateMeta.key !== previousDateKey;
                if (dateMeta) previousDateKey = dateMeta.key;

                return (
                  <React.Fragment key={task.instanceId}>
                    {taskView !== "TODAY" && dateMeta && showSeparator && (
                      <TaskDateSeparator label={dateMeta.label} />
                    )}
                    <TaskMiniCard
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
                  </React.Fragment>
                );
              });
            })()}
          </div>
        )}
      </section>

      {completionTask && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
          onClick={() => {
            if (!savingId) setCompletionTask(null);
          }}
        >
          <form
            onSubmit={handleCompletionSubmit}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
                  Complete task
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  Attach completion file
                </h2>
                {completionTask.requiresCompletionDocument && (
                  <p className="mt-1 text-xs text-rose-600">
                    {completionTask.completionDocumentName
                      ? `Required document: ${completionTask.completionDocumentName}`
                      : "A document is required before this task can be completed."}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompletionTask(null);
                  setCompletionError(null);
                }}
                disabled={!!savingId}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close completion dialog"
              >
                <span aria-hidden="true">x</span>
              </button>
            </div>

            {completionError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                {completionError}
              </div>
            )}

            <label className="mt-5 block text-xs font-semibold text-slate-700">
              Completion note
              <textarea
                value={completionNote}
                onChange={(event) => setCompletionNote(event.target.value)}
                rows={3}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                placeholder="Add a short note for the approver..."
              />
            </label>

            <label className="mt-4 block text-xs font-semibold text-slate-700">
              {completionTask.completionDocumentName
                ? `Upload ${completionTask.completionDocumentName}`
                : "Completion file"}
              {completionTask.requiresCompletionDocument && (
                <span className="ml-0.5 text-red-500">*</span>
              )}
              <input
                type="file"
                required={completionTask.requiresCompletionDocument}
                onChange={(event) =>
                  setCompletionFile(event.target.files?.[0] ?? null)
                }
                className="mt-2 block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
            </label>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCompletionTask(null);
                  setCompletionError(null);
                }}
                disabled={!!savingId}
                className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!!savingId}
                className="inline-flex h-9 items-center justify-center rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingId ? "Uploading..." : "Mark Done"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
