"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import TaskHeader, { TaskSubTabType } from "./TaskHeader";
import TaskMiniCard from "./TaskMiniCard";
import TaskDateSeparator, { getDateSeparatorMeta } from "../TaskDateSeparator";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsTaskItem as TaskItem,
  type DwmsTaskStatus as TaskStatus,
} from "@/services/dwms.service";
import { uploadImage } from "@/services/uploads.service";

const COMPLETED_PAGE_SIZE = 20;

const frequencyBasedTaskFrequencies = new Set([
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
]);

function isFrequencyBasedTask(task: TaskItem) {
  return frequencyBasedTaskFrequencies.has(String(task.frequency ?? ""));
}


function getDashboardTaskDateValue(task: TaskItem, activeTab: TaskSubTabType) {
  if (activeTab === "COMPLETED") {
    return task.completedAt ?? task.dueAt ?? task.scheduledFor;
  }
  if (activeTab === "OVERDUE") {
    return task.dueAt ?? task.scheduledFor;
  }
  return task.scheduledFor ?? task.dueAt ?? task.completedAt;
}
function groupFrequencyBasedTasks(tasksToGroup: TaskItem[]) {
  const grouped = new Map<string, TaskItem>();

  tasksToGroup.forEach((task) => {
    const key = isFrequencyBasedTask(task) ? task.taskId : task.instanceId;
    if (!grouped.has(key)) {
      grouped.set(key, task);
    }
  });

  return Array.from(grouped.values());
}


export default function TaskDashboard() {
  const router = useRouter();

  // Tasks and loading state
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [completedHistoryTasks, setCompletedHistoryTasks] = useState<TaskItem[]>([]);
  const [completedPage, setCompletedPage] = useState(1);
  const [completedPagination, setCompletedPagination] = useState({
    page: 1,
    limit: COMPLETED_PAGE_SIZE,
    total: 0,
    pages: 0,
  });
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

  // Filters & Search states
  const [activeTab, setActiveTab] = useState<TaskSubTabType>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isAssigneeMenuOpen, setIsAssigneeMenuOpen] = useState(false);
  const [frequencyFilter, setFrequencyFilter] = useState<string>("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const assigneeButtonRef = useRef<HTMLButtonElement>(null);
  const assigneePanelRef = useRef<HTMLDivElement>(null);

  // Toggle helpers to ensure only one dropdown is open at a time
  const toggleFilterMenu = () => {
    setIsFilterMenuOpen(!isFilterMenuOpen);
    setIsAssigneeMenuOpen(false);
  };

  const toggleAssigneeMenu = () => {
    setIsAssigneeMenuOpen(!isAssigneeMenuOpen);
    setIsFilterMenuOpen(false);
  };

  // Derive unique list of assigners for the assigned-by filter
  const uniqueAssignees = useMemo(() => {
    const map = new Map<string, string>();
    [...tasks, ...completedHistoryTasks].forEach((t) => {
      if (t.assignedBy) {
        map.set(t.assignedBy.id, t.assignedBy.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks, completedHistoryTasks]);

  // Status mapping for toggling checkboxes
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

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const [scheduledRes, completedRes] = await Promise.all([
        DwmsService.getTodayTasks(token, undefined, "scheduled"),
        DwmsService.getTodayTasks(
          token,
          undefined,
          "completed",
          completedPage,
          COMPLETED_PAGE_SIZE,
        ),
      ]);
      setTasks(scheduledRes?.tasks ?? []);
      setCompletedHistoryTasks(completedRes?.tasks ?? []);
      setCompletedPagination(
        completedRes?.pagination ?? {
          page: completedPage,
          limit: COMPLETED_PAGE_SIZE,
          total: completedRes?.tasks?.length ?? 0,
          pages: completedRes?.tasks?.length ? 1 : 0,
        },
      );
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load tasks";
      setError(message);
      setTasks([]);
      setCompletedHistoryTasks([]);
    } finally {
      setLoading(false);
    }
  }, [completedPage]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    function isInsideAny(
      refs: Array<React.RefObject<HTMLElement | null>>,
      event: MouseEvent,
    ) {
      const path = event.composedPath?.() ?? [];
      return refs.some((ref) => {
        const el = ref.current;
        return !!el && (el.contains(event.target as Node) || path.includes(el));
      });
    }

    function handleOutsideClick(event: MouseEvent) {
      if (!isInsideAny([filterButtonRef, filterPanelRef], event)) {
        setIsFilterMenuOpen(false);
      }
      if (!isInsideAny([assigneeButtonRef, assigneePanelRef], event)) {
        setIsAssigneeMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsideClick, true);
    return () =>
      document.removeEventListener("pointerdown", handleOutsideClick, true);
  }, []);

  // Patch task completion status
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
      await loadTasks();
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Failed to update task";
      setError(message);
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
      await loadTasks();
    } catch (saveError: unknown) {
      const message = getDwmsErrorMessage(saveError, "Failed to complete task");
      setCompletionError(message);
    } finally {
      setSavingId(null);
    }
  }

  // Task acknowledgement
  async function handleAcknowledgement(taskId: string) {
    setSavingId(taskId);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.acknowledgeTask(token, taskId);
      await loadTasks();
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Failed to acknowledge task";
      setError(message);
    } finally {
      setSavingId(null);
    }
  }

  // Derived subtab task categories
  const overdueTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status !== "DONE" &&
          t.status !== "APPROVAL_PENDING" &&
          (t.isOverdue || t.status === "OVERDUE"),
      ),
    [tasks],
  );
  const completedTasks = useMemo(
    () => completedHistoryTasks.filter((t) => t.status === "DONE"),
    [completedHistoryTasks],
  );
  const approvalPendingTasks = useMemo(
    () => tasks.filter((t) => t.status === "APPROVAL_PENDING"),
    [tasks],
  );
  const notAcknowledgedTasks = useMemo(
    () =>
      groupFrequencyBasedTasks(
        tasks.filter(
          (t) =>
            !t.acknowledgedAt &&
            t.status !== "DONE" &&
            t.status !== "OVERDUE" &&
            t.status !== "APPROVAL_PENDING",
        ),
      ),
    [tasks],
  );
  const pendingTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !!t.acknowledgedAt &&
          t.status !== "DONE" &&
          t.status !== "OVERDUE" &&
          t.status !== "APPROVAL_PENDING",
      ),
    [tasks],
  );

  // Counts for the subtabs
  const tabCounts = useMemo(() => {
    const all = tasks.length;
    const overdue = overdueTasks.length;
    const completed = completedPagination.total;
    const notAcknowledged = notAcknowledgedTasks.length;
    const pending = pendingTasks.length;
    const approvalPending = approvalPendingTasks.length;
    return { all, overdue, completed, notAcknowledged, pending, approvalPending };
  }, [
    tasks,
    overdueTasks,
    completedPagination.total,
    notAcknowledgedTasks,
    pendingTasks,
    approvalPendingTasks,
  ]);

  // Filter & Sort Logic
  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    // 1. Filter by Active Subtab
    if (activeTab === "OVERDUE") {
      result = overdueTasks;
    } else if (activeTab === "COMPLETED") {
      result = completedTasks;
    } else if (activeTab === "NOT_ACKNOWLEDGED") {
      result = notAcknowledgedTasks;
    } else if (activeTab === "PENDING") {
      result = pendingTasks;
    } else if (activeTab === "APPROVAL_PENDING") {
      result = approvalPendingTasks;
    }

    // 2. Filter by Frequency (dropdown filter option)
    if (frequencyFilter !== "ALL") {
      result = result.filter((t) => t.frequency === frequencyFilter);
    }

    // 3. Filter by who assigned the task
    if (assigneeFilter !== "ALL") {
      result = result.filter((t) => t.assignedBy?.id === assigneeFilter);
    }

    // 4. Filter by text search
    if (searchTerm.trim() !== "") {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(term) ||
          (t.description && t.description.toLowerCase().includes(term)),
      );
    }

    // 5. Date-first sorting per tab
    const timeValue = (value?: string | null) => {
      if (!value) return Number.MAX_SAFE_INTEGER;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
    };
    const scheduledTime = (task: TaskItem) =>
      timeValue(task.scheduledFor ?? task.dueAt ?? task.completedAt);
    const completedTime = (task: TaskItem) =>
      timeValue(task.completedAt ?? task.dueAt ?? task.scheduledFor);
    const dueTime = (task: TaskItem) =>
      timeValue(task.dueAt ?? task.scheduledFor ?? task.completedAt);

    result.sort((a, b) => {
      if (activeTab === "COMPLETED") {
        return completedTime(b) - completedTime(a);
      }
      if (activeTab === "OVERDUE") {
        return dueTime(b) - dueTime(a);
      }

      const dateDiff = scheduledTime(a) - scheduledTime(b);
      if (dateDiff !== 0) return dateDiff;
      return a.title.localeCompare(b.title);
    });

    return result;
  }, [
    tasks,
    activeTab,
    overdueTasks,
    completedTasks,
    notAcknowledgedTasks,
    pendingTasks,
    approvalPendingTasks,
    searchTerm,
    frequencyFilter,
    assigneeFilter,
  ]);


  return (
    <div className="relative pb-12">
      <main className="mx-auto max-w-none px-4 pb-8 sm:px-6 lg:px-8 flex flex-col gap-6 pt-0">
        {/* Sticky Header Zone */}
        <div className="flex flex-col gap-4 pt-8 pb-4">
          {/* Title Zone & Filter Pills */}
          <TaskHeader
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setActiveTab(tab);
              if (tab !== "COMPLETED") setCompletedPage(1);
            }}
            counts={tabCounts}
          />

          {/* Search & Action Filter Inputs */}
          <div className="flex flex-col sm:flex-row gap-3 items-center w-full">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.2}
                stroke="currentColor"
                className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400/80"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10.5 pr-4 py-2.5 text-sm border border-slate-200 bg-white text-slate-800 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition placeholder-slate-400/70"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-start sm:justify-end shrink-0">
              {/* Filter Toggle */}
              <div className="relative">
                <button
                  ref={filterButtonRef}
                  onClick={toggleFilterMenu}
                  className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full border px-4 text-xs font-semibold transition cursor-pointer select-none ${
                    frequencyFilter !== "ALL"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "border-slate-200 bg-white hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z"
                    />
                  </svg>
                  Filter
                </button>
                {isFilterMenuOpen && (
                  <div
                    ref={filterPanelRef}
                    className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl z-50 text-left"
                  >
                    <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider px-2.5 mb-1.5">
                      Frequency
                    </p>
                    {["ALL", "DAILY", "WEEKLY", "MONTHLY"].map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          setFrequencyFilter(f);
                          setIsFilterMenuOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          frequencyFilter === f
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {f.charAt(0) + f.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Assigned By Toggle */}
              <div className="relative">
                <button
                  ref={assigneeButtonRef}
                  onClick={toggleAssigneeMenu}
                  className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full border px-4 text-xs font-semibold transition cursor-pointer select-none ${
                    assigneeFilter !== "ALL"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "border-slate-200 bg-white hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="h-4.5 w-4.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                    />
                  </svg>
                  Assigned By
                </button>
                {isAssigneeMenuOpen && (
                  <div
                    ref={assigneePanelRef}
                    className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl z-50 text-left"
                  >
                    <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider px-2.5 mb-1.5">
                      Assigned By
                    </p>
                    <button
                      onClick={() => {
                        setAssigneeFilter("ALL");
                        setIsAssigneeMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                        assigneeFilter === "ALL"
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      All Assigners
                    </button>
                    {uniqueAssignees.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setAssigneeFilter(a.id);
                          setIsAssigneeMenuOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          assigneeFilter === a.id
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Global Loading / Error Notifications */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* Unified Tasks List */}
        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-24 text-center text-sm text-slate-500">
            Loading tasks...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center text-sm text-slate-500">
            {activeTab === "ALL" && "No tasks found."}
            {activeTab === "OVERDUE" && "No overdue tasks."}
            {activeTab === "NOT_ACKNOWLEDGED" && "No unacknowledged tasks."}
            {activeTab === "PENDING" && "No pending tasks."}
            {activeTab === "APPROVAL_PENDING" && "No approval pending tasks."}
            {activeTab === "COMPLETED" && "No completed tasks."}
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              let previousDateKey: string | null = null;
              return filteredTasks.map((t) => {
                const itemKey =
                  activeTab === "NOT_ACKNOWLEDGED" && isFrequencyBasedTask(t)
                    ? t.taskId
                    : t.instanceId;
                const dateMeta = getDateSeparatorMeta(
                  getDashboardTaskDateValue(t, activeTab),
                  t.organizationTimeZone,
                  activeTab !== "COMPLETED" && activeTab !== "OVERDUE",
                );
                const showSeparator = !!dateMeta && dateMeta.key !== previousDateKey;
                if (dateMeta) previousDateKey = dateMeta.key;

                return (
                  <React.Fragment key={itemKey}>
                    {dateMeta && showSeparator && <TaskDateSeparator label={dateMeta.label} />}
                    <TaskMiniCard
                      task={t}
                      onClick={() => router.push(`/dwms/tasks/${t.instanceId}`)}
                      onStatusChange={handleStatusChange}
                      onAcknowledgement={handleAcknowledgement}
                      saving={savingId === t.instanceId || savingId === t.taskId}
                    />
                  </React.Fragment>
                );
              });
            })()}
          </div>
        )}
        {!loading &&
          activeTab === "COMPLETED" &&
          completedPagination.pages > 1 && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <span>
                Page {completedPagination.page} of {completedPagination.pages} ·{" "}
                {completedPagination.total} completed tasks
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCompletedPage((page) => Math.max(1, page - 1))}
                  disabled={completedPagination.page <= 1}
                  className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCompletedPage((page) =>
                      Math.min(completedPagination.pages, page + 1),
                    )
                  }
                  disabled={completedPagination.page >= completedPagination.pages}
                  className="rounded-full border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
      </main>

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
                <span aria-hidden="true">×</span>
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

