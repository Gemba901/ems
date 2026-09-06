"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import TaskMiniCard from "./components/home/TaskMiniCard";
import TaskDateSeparator, { getDateSeparatorMeta } from "./components/TaskDateSeparator";
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
  AlertTriangle,
  Minus,
  PlusCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

type HomeTaskView = "TODAY" | "WEEK" | "MONTH";

function getTaskWindow(view: HomeTaskView, start: string) {
  const days = view === "TODAY" ? 1 : view === "WEEK" ? 7 : 30;
  const end = addDaysToDateKey(start, days) ?? start;
  return { start, end, days };
}

function getPreviousTaskWindow(view: HomeTaskView, currentStart: string) {
  const current = getTaskWindow(view, currentStart);
  const daysAgo = view === "TODAY" ? 7 : current.days;
  const start = addDaysToDateKey(current.start, -daysAgo) ?? current.start;
  const end = addDaysToDateKey(start, current.days) ?? start;
  return { start, end };
}

function isTaskScheduledInWindow(task: TaskItem, start: string, end: string) {
  const scheduledDateKey = task.scheduledFor?.slice(0, 10);
  if (!scheduledDateKey) return false;
  return scheduledDateKey >= start && scheduledDateKey < end;
}

function isHomeVisibleTask(task: TaskItem) {
  return (
    !task.isOverdue &&
    task.status !== "OVERDUE" &&
    task.status !== "DONE"
  );
}

function getHomeTaskDateValue(task: TaskItem) {
  return task.scheduledFor ?? task.dueAt;
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

  const loadData = useCallback(async (view: HomeTaskView = taskView) => {
    setLoading(true);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const [taskResponse, alertsRes] = await Promise.all([
        DwmsService.getTodayTasks(token, undefined, "scheduled"),
        DwmsService.getOpenAlertCount(token),
      ]);
      if (!taskResponse?.date) {
        throw new Error("The server did not provide the organization date");
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
        if (isTaskScheduledInWindow(task, start, end) && isHomeVisibleTask(task)) {
          byInstanceId.set(task.instanceId, task);
        }
      });

      (previousTaskResponse?.tasks ?? []).forEach((task) => {
        if (
          isTaskScheduledInWindow(
            task,
            previousWindow.start,
            previousWindow.end,
          ) &&
          isHomeVisibleTask(task)
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
  }, [taskView]);

  useEffect(() => {
    void loadData(taskView);
  }, [loadData, taskView]);

  const visibleTasks = useMemo(() => {
    const timeValue = (value?: string | null) => {
      if (!value) return Number.MAX_SAFE_INTEGER;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
    };

    return [...tasks].sort((a, b) => {
      const dateDiff =
        timeValue(a.scheduledFor ?? a.dueAt) -
        timeValue(b.scheduledFor ?? b.dueAt);
      if (dateDiff !== 0) return dateDiff;
      return a.title.localeCompare(b.title);
    });
  }, [tasks]);


  const stats = useMemo(() => {
    const total = visibleTasks.length;
    const done = visibleTasks.filter((t) => t.status === "DONE").length;
    const remaining = total - done;
    const productivity = total > 0 ? Math.round((done / total) * 100) : 100;
    const previousTotal = previousTasks.length;
    const previousDone = previousTasks.filter(
      (task) => task.status === "DONE",
    ).length;
    const previousProductivity =
      previousTotal > 0 ? Math.round((previousDone / previousTotal) * 100) : null;
    const productivityChange =
      total === 0 || previousProductivity === null
        ? null
        : productivity - previousProductivity;

    return { total, done, remaining, productivity, productivityChange };
  }, [previousTasks, visibleTasks]);

  const productivityTrend = useMemo(() => {
    const change = stats.productivityChange;
    const comparisonLabel =
      taskView === "MONTH" ? "vs previous 30 days" : "vs last week";

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
      setCompletionError(getDwmsErrorMessage(saveError, "Failed to complete task"));
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

      {/* Today at a Glance Stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Tasks Done */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-40 transition hover:scale-[1.01] hover:border-accent-app/20 duration-150">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-app">
              Tasks done
            </p>
            <h3 className="text-4xl font-extrabold tracking-tight text-text-app mt-2">
              {stats.done}
              <span className="text-muted-app text-2xl font-light">
                /{stats.total}
              </span>
            </h3>
          </div>
          <div>
            <p className="text-xs text-muted-app mb-2.5 font-light">
              {stats.remaining} remaining
            </p>
            <div className="w-full bg-border-app h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-app rounded-full transition-all duration-300"
                style={{
                  width: `${stats.total > 0 ? (stats.done / stats.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Open Alerts */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-40 transition hover:scale-[1.01] hover:border-accent-app/20 duration-150">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-app">
              Open alerts
            </p>
            <h3 className="text-4xl font-extrabold tracking-tight text-text-app mt-2">
              {activeAlertsCount}
            </h3>
          </div>
          <div>
            <p className="text-xs text-rose-500 font-medium mb-2.5 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Action needed
            </p>
            <div className="w-full bg-rose-500/10 h-1 rounded-full overflow-hidden">
              <div
                className={`h-full bg-rose-500 rounded-full transition-all duration-300 ${
                  activeAlertsCount > 0 ? "w-2/3" : "w-0"
                }`}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Productivity */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-40 transition hover:scale-[1.01] hover:border-accent-app/20 duration-150">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-app">
              Productivity
            </p>
            <h3 className="text-4xl font-extrabold tracking-tight text-text-app mt-2">
              {stats.productivity}
              <span className="text-muted-app text-2xl font-light">%</span>
            </h3>
          </div>
          <div>
            <p
              className={`text-xs font-medium mb-2.5 flex items-center gap-1 ${productivityTrend.className}`}
            >
              <productivityTrend.Icon
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0"
              />
              {productivityTrend.label}
            </p>
            <div className="w-full bg-purple-500/10 h-1 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-300"
                style={{ width: `${stats.productivity}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Tasks Section */}
      <section className="mt-4">
        <div className="flex flex-col gap-3 border-b border-border-app pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <h2 className="text-lg font-bold tracking-tight text-text-app">
              {taskView === "TODAY" ? "Today's tasks" : taskView === "WEEK" ? "Week's tasks" : "Monthly tasks"}
            </h2>
            <div className="flex rounded-full border border-slate-200 bg-white p-1">
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
                    onClick={() => setTaskView(view.key as HomeTaskView)}
                    className={`h-8 rounded-full px-3 text-xs font-semibold transition ${active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    {view.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
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
              className="inline-flex w-full cursor-pointer select-none items-center justify-center gap-1.5 rounded-full border border-transparent bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 sm:w-auto"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Assign a Task</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-border-app bg-white py-16 text-center text-sm text-muted-app">
            Loading tasks...
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-app bg-white py-16 text-center text-sm text-muted-app italic">
            {taskView === "TODAY" ? "No tasks due today." : taskView === "WEEK" ? "No tasks due this week." : "No tasks due this month."}
          </div>
        ) : (
          <div className="space-y-3">
            {(() => {
              let previousDateKey: string | null = null;
              return visibleTasks.map((task) => {
                const dateMeta = getDateSeparatorMeta(
                  getHomeTaskDateValue(task),
                  task.organizationTimeZone,
                  true,
                );
                const showSeparator = !!dateMeta && dateMeta.key !== previousDateKey;
                if (dateMeta) previousDateKey = dateMeta.key;

                return (
                  <React.Fragment key={task.instanceId}>
                    {dateMeta && showSeparator && <TaskDateSeparator label={dateMeta.label} />}
                    <TaskMiniCard
                      task={task}
                      onClick={() => router.push(`/dwms/tasks/${task.instanceId}`)}
                      onStatusChange={handleStatusChange}
                      onAcknowledgement={handleAcknowledgement}
                      saving={savingId === task.instanceId || savingId === task.taskId}
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

