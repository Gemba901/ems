"use client";

import React, { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsAssignedTaskHistoryItem,
} from "@/services/dwms.service";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Paperclip,
  UserRound,
  XCircle,
} from "lucide-react";
import DwmsSearchFilterBar from "../components/DwmsSearchFilterBar";
import DwmsTabHeader from "../components/DwmsTabHeader";

type ApprovalTab = "pending" | "approved";
type PriorityFilter = "ALL" | "MEDIUM" | "HIGH" | "CRITICAL";

export default function ApprovalTasksPage() {
  return (
    <ProtectedRoute>
      <ApprovalTasksContent />
    </ProtectedRoute>
  );
}

function ApprovalTasksContent() {
  const [pendingTasks, setPendingTasks] = useState<
    DwmsAssignedTaskHistoryItem[]
  >([]);
  const [approvedTasks, setApprovedTasks] = useState<
    DwmsAssignedTaskHistoryItem[]
  >([]);
  const [activeTab, setActiveTab] = useState<ApprovalTab>("pending");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");

  async function loadTasks() {
    setLoading(true);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const [pendingResponse, approvedResponse] = await Promise.all([
        DwmsService.getApprovalTasks(token, "pending"),
        DwmsService.getApprovalTasks(token, "approved"),
      ]);
      setPendingTasks(pendingResponse.tasks ?? []);
      setApprovedTasks(approvedResponse.tasks ?? []);
    } catch (fetchError: unknown) {
      setError(
        getDwmsErrorMessage(fetchError, "Failed to load approval tasks"),
      );
      setPendingTasks([]);
      setApprovedTasks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  async function handleApprove(taskId: string) {
    setSavingId(taskId);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.approveTask(token, taskId);
      const approvedTask = pendingTasks.find((task) => task.id === taskId);
      setPendingTasks((current) =>
        current.filter((task) => task.id !== taskId),
      );
      if (approvedTask) {
        setApprovedTasks((current) => [
          { ...approvedTask, status: "DONE" },
          ...current,
        ]);
      }
    } catch (approveError: unknown) {
      setError(getDwmsErrorMessage(approveError, "Failed to approve task"));
    } finally {
      setSavingId(null);
    }
  }

  async function handleReject(taskId: string) {
    setSavingId(taskId);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      await DwmsService.rejectTask(token, taskId);
      setPendingTasks((current) =>
        current.filter((task) => task.id !== taskId),
      );
    } catch (rejectError: unknown) {
      setError(getDwmsErrorMessage(rejectError, "Failed to disapprove task"));
    } finally {
      setSavingId(null);
    }
  }

  const filteredTasks = useMemo(() => {
    const tasks = activeTab === "pending" ? pendingTasks : approvedTasks;
    const q = searchTerm.trim().toLowerCase();
    return tasks.filter((task) => {
      const priority =
        task.priority === "LOW" ? "MEDIUM" : (task.priority ?? "MEDIUM");
      if (priorityFilter !== "ALL" && priority !== priorityFilter) return false;
      if (!q) return true;

      const ownerName = task.ownerName || task.owner?.name || "";
      const assignerName = task.assignedBy?.name || "";
      return [
        task.title,
        task.description,
        ownerName,
        assignerName,
        task.completionNote,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(q),
      );
    });
  }, [activeTab, approvedTasks, pendingTasks, priorityFilter, searchTerm]);

  const formatDate = (value?: string | null) => {
    if (!value) return "No due date";
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
      new Date(value),
    );
  };

  const getPriorityBadgeColor = (priority?: string | null) => {
    switch (priority) {
      case "CRITICAL":
        return "bg-rose-500/10 text-rose-500 border border-rose-500/20";
      case "HIGH":
        return "bg-amber-500/10 text-amber-500 border border-amber-500/20";
      case "MEDIUM":
        return "bg-blue-500/10 text-blue-500 border border-blue-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20";
    }
  };

  return (
    <div className="mx-auto max-w-none px-4 pt-8 sm:px-6 lg:px-8 space-y-6 pb-8">
      <DwmsTabHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          {
            key: "pending",
            label: "Required to Approve",
            dotColor: "bg-cyan-500",
            count: pendingTasks.length,
          },
          {
            key: "approved",
            label: "Approved",
            dotColor: "bg-emerald-500",
            count: approvedTasks.length,
          },
        ]}
      />

      <div className="space-y-6">
        <DwmsSearchFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search title, employee, assigner..."
          filters={[
            {
              key: "priority",
              value: priorityFilter,
              onChange: (value) => setPriorityFilter(value as PriorityFilter),
              ariaLabel: "Priority filter",
              options: [
                { value: "ALL", label: "All Priorities" },
                { value: "CRITICAL", label: "Critical" },
                { value: "HIGH", label: "High" },
                { value: "MEDIUM", label: "Medium" },
              ],
            },
          ]}
        />

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-dashed border-border-app bg-white py-24 text-center text-sm text-muted-app">
            Loading approval tasks...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-app bg-white py-24 text-center text-sm text-muted-app">
            {(activeTab === "pending"
              ? pendingTasks.length
              : approvedTasks.length) === 0
              ? activeTab === "pending"
                ? "No tasks are waiting for your approval."
                : "No approved tasks yet."
              : "No approval tasks match your search or priority filter."}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((task) => {
              const ownerName =
                task.ownerName || task.owner?.name || "Unknown employee";
              const priority =
                task.priority === "LOW"
                  ? "MEDIUM"
                  : (task.priority ?? "MEDIUM");

              return (
                <article
                  key={task.id}
                  className="rounded-2xl border border-border-app bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${getPriorityBadgeColor(priority)}`}
                        >
                          {priority}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            activeTab === "pending"
                              ? "bg-cyan-500/10 text-cyan-600 border border-cyan-500/20"
                              : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          }`}
                        >
                          {activeTab === "pending"
                            ? "Approval Pending"
                            : "Approved"}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-semibold text-text-app">
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="mt-1 text-sm text-muted-app font-light leading-relaxed">
                            {task.description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-muted-app">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-app px-3 py-1 font-medium text-text-app">
                          <UserRound className="h-3.5 w-3.5" />
                          Submitted by: {ownerName}
                        </span>
                        {task.assignedBy?.name && (
                          <span className="rounded-full bg-bg-app px-3 py-1 font-medium text-text-app">
                            Assigned by: {task.assignedBy.name}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-app px-3 py-1 font-medium text-text-app">
                          <Clock className="h-3.5 w-3.5" />
                          Due: {formatDate(task.dueDate)}
                        </span>
                      </div>

                      {task.completionNote && (
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs">
                          <span className="font-semibold text-emerald-700">
                            Completion note
                          </span>
                          <p className="mt-1 text-emerald-800">
                            &quot;{task.completionNote}&quot;
                          </p>
                        </div>
                      )}

                      {task.completionAttachmentUrl && (
                        <a
                          href={task.completionAttachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          <span>
                            {task.completionAttachmentName ||
                              "View completion file"}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>

                    {activeTab === "pending" && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleReject(task.id)}
                          disabled={savingId === task.id}
                          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 text-[11px] font-bold text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {savingId === task.id
                            ? "Disapproving..."
                            : "Disapprove"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleApprove(task.id)}
                          disabled={savingId === task.id}
                          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-3 text-[11px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {savingId === task.id ? "Approving..." : "Approve"}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
