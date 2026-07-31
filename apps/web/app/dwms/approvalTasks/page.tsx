"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsAlertItem,
  type DwmsAssignedTaskHistoryItem,
} from "@/services/dwms.service";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Paperclip,
  UserRound,
  XCircle,
} from "lucide-react";
import DwmsSearchFilterBar from "../components/DwmsSearchFilterBar";
import DwmsTabHeader from "../components/DwmsTabHeader";

type ApprovalTab = "pending" | "approved" | "rejected";
type PriorityFilter = "ALL" | "MEDIUM" | "HIGH" | "CRITICAL";
type ApprovalItemKind = "task" | "alert";
type ApprovalAction = "approve" | "reject";

type ApprovalDecision = {
  kind: ApprovalItemKind;
  action: ApprovalAction;
  id: string;
  title: string;
};

export default function ApprovalTasksPage() {
  return (
    <ProtectedRoute>
      <ApprovalTasksContent />
    </ProtectedRoute>
  );
}

function ApprovalTasksContent() {
  const router = useRouter();
  const [pendingTasks, setPendingTasks] = useState<DwmsAssignedTaskHistoryItem[]>([]);
  const [approvedTasks, setApprovedTasks] = useState<DwmsAssignedTaskHistoryItem[]>([]);
  const [rejectedTasks, setRejectedTasks] = useState<DwmsAssignedTaskHistoryItem[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState<DwmsAlertItem[]>([]);
  const [approvedAlerts, setApprovedAlerts] = useState<DwmsAlertItem[]>([]);
  const [rejectedAlerts, setRejectedAlerts] = useState<DwmsAlertItem[]>([]);
  const [activeTab, setActiveTab] = useState<ApprovalTab>("pending");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [approvalModal, setApprovalModal] = useState<ApprovalDecision | null>(null);
  const [approvalComment, setApprovalComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);

  async function loadApprovals() {
    setLoading(true);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? "";
      const [
        pendingTaskResponse,
        approvedTaskResponse,
        rejectedTaskResponse,
        pendingAlertResponse,
        approvedAlertResponse,
        rejectedAlertResponse,
      ] = await Promise.all([
        DwmsService.getApprovalTasks(token, "pending"),
        DwmsService.getApprovalTasks(token, "approved"),
        DwmsService.getApprovalTasks(token, "rejected"),
        DwmsService.getApprovalAlerts(token, "pending"),
        DwmsService.getApprovalAlerts(token, "approved"),
        DwmsService.getApprovalAlerts(token, "rejected"),
      ]);

      setPendingTasks(pendingTaskResponse.tasks ?? []);
      setApprovedTasks(approvedTaskResponse.tasks ?? []);
      setRejectedTasks(rejectedTaskResponse.tasks ?? []);
      setPendingAlerts(pendingAlertResponse.alerts ?? []);
      setApprovedAlerts(approvedAlertResponse.alerts ?? []);
      setRejectedAlerts(rejectedAlertResponse.alerts ?? []);
    } catch (fetchError: unknown) {
      setError(getDwmsErrorMessage(fetchError, "Failed to load approvals"));
      setPendingTasks([]);
      setApprovedTasks([]);
      setRejectedTasks([]);
      setPendingAlerts([]);
      setApprovedAlerts([]);
      setRejectedAlerts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadApprovals();
  }, []);

  function openApprovalModal(decision: ApprovalDecision) {
    setApprovalModal(decision);
    setApprovalComment("");
    setCommentError(null);
  }

  function closeApprovalModal() {
    if (savingId) return;
    setApprovalModal(null);
    setApprovalComment("");
    setCommentError(null);
  }

  async function handleApprovalSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!approvalModal) return;

    const note = approvalComment.trim();
    if (!note) {
      setCommentError("Comment is required.");
      return;
    }

    const itemKey = `${approvalModal.kind}:${approvalModal.id}`;
    setSavingId(itemKey);
    setError(null);
    setCommentError(null);

    try {
      const token = useAuthStore.getState().accessToken ?? "";
      if (approvalModal.kind === "task" && approvalModal.action === "approve") {
        await DwmsService.approveTask(token, approvalModal.id, { comment: note });
      } else if (approvalModal.kind === "task" && approvalModal.action === "reject") {
        await DwmsService.rejectTask(token, approvalModal.id, { comment: note });
      } else if (approvalModal.kind === "alert" && approvalModal.action === "approve") {
        await DwmsService.approveAlertClosure(token, approvalModal.id, { comment: note });
      } else {
        await DwmsService.rejectAlertClosure(token, approvalModal.id, { comment: note });
      }

      setApprovalModal(null);
      setApprovalComment("");
      await loadApprovals();
    } catch (approvalError: unknown) {
      setError(getDwmsErrorMessage(approvalError, "Failed to submit approval decision"));
    } finally {
      setSavingId(null);
    }
  }

  const currentTasks = activeTab === "pending" ? pendingTasks : activeTab === "approved" ? approvedTasks : rejectedTasks;
  const currentAlerts = activeTab === "pending" ? pendingAlerts : activeTab === "approved" ? approvedAlerts : rejectedAlerts;

  const filteredTasks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return currentTasks.filter((task) => {
      const priority = task.priority === "LOW" ? "MEDIUM" : (task.priority ?? "MEDIUM");
      if (priorityFilter !== "ALL" && priority !== priorityFilter) return false;
      if (!q) return true;

      const ownerName = task.ownerName || task.owner?.name || "";
      const assignerName = task.assignedBy?.name || "";
      return [task.title, task.description, ownerName, assignerName, task.completionNote].some((value) =>
        String(value ?? "").toLowerCase().includes(q),
      );
    });
  }, [currentTasks, priorityFilter, searchTerm]);

  const filteredAlerts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return currentAlerts.filter((alert) => {
      const severity = alert.severity === "LOW" ? "MEDIUM" : (alert.severity ?? "MEDIUM");
      if (priorityFilter !== "ALL" && severity !== priorityFilter) return false;
      if (!q) return true;

      return [
        alert.title,
        alert.description,
        alert.closureNote,
        alert.closureRequestedBy?.name,
        alert.againstUser?.name,
        alert.taskInstance?.task?.title,
      ].some((value) => String(value ?? "").toLowerCase().includes(q));
    });
  }, [currentAlerts, priorityFilter, searchTerm]);

  const formatDate = (value?: string | null) => {
    if (!value) return "Not available";
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
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

  const tabStatusLabel = activeTab === "pending" ? "Approval Pending" : activeTab === "approved" ? "Approved" : "Rejected";
  const tabTone = activeTab === "pending"
    ? "bg-cyan-500/10 text-cyan-600 border border-cyan-500/20"
    : activeTab === "approved"
      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
      : "bg-rose-500/10 text-rose-600 border border-rose-500/20";
  const emptyCount = currentTasks.length + currentAlerts.length;

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
            count: pendingTasks.length + pendingAlerts.length,
          },
          {
            key: "approved",
            label: "Approved",
            dotColor: "bg-emerald-500",
            count: approvedTasks.length + approvedAlerts.length,
          },
          {
            key: "rejected",
            label: "Rejected",
            dotColor: "bg-rose-500",
            count: rejectedTasks.length + rejectedAlerts.length,
          },
        ]}
      />
      <div className="space-y-6">
        <DwmsSearchFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search title, employee, assigner, alert..."
          filters={[
            {
              key: "priority",
              value: priorityFilter,
              onChange: (value) => setPriorityFilter(value as PriorityFilter),
              ariaLabel: "Priority or severity filter",
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
            Loading approvals...
          </div>
        ) : filteredTasks.length === 0 && filteredAlerts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-app bg-white py-24 text-center text-sm text-muted-app">
            {emptyCount === 0
              ? activeTab === "pending"
                ? "No tasks or alerts are waiting for your approval."
                : activeTab === "approved"
                  ? "No approved items yet."
                  : "No rejected items yet."
              : "No approval items match your search or priority filter."}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAlerts.map((alert) => {
              const severity = alert.severity === "LOW" ? "MEDIUM" : (alert.severity ?? "MEDIUM");
              const saving = savingId === `alert:${alert.id}`;
              const requestedBy = alert.closureRequestedBy?.name || alert.againstUser?.name || alert.taskInstance?.owner?.name || "Responsible person";

              return (
                <article
                  key={`alert:${alert.id}`}
                  onClick={() => router.push(`/dwms/alerts/${alert.id}`)}
                  className="cursor-pointer rounded-2xl border border-border-app bg-white p-5 shadow-sm transition hover:border-cyan-200 hover:shadow-md"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${getPriorityBadgeColor(String(severity))}`}>
                          {String(severity)}
                        </span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${tabTone}`}>
                          Alert Closure {tabStatusLabel}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-semibold text-text-app">{alert.title}</h3>
                        <p className="mt-1 text-sm text-muted-app font-light leading-relaxed">{alert.description}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-muted-app">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-app px-3 py-1 font-medium text-text-app">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Requested by: {requestedBy}
                        </span>
                        {alert.raisedBy?.name && (
                          <span className="rounded-full bg-bg-app px-3 py-1 font-medium text-text-app">
                            Raised by: {alert.raisedBy.name}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-app px-3 py-1 font-medium text-text-app">
                          <Clock className="h-3.5 w-3.5" />
                          Requested: {formatDate(alert.closureRequestedAt ?? alert.updatedAt ?? alert.createdAt)}
                        </span>
                      </div>
                    </div>

                    {activeTab === "pending" && (
                      <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openApprovalModal({ kind: "alert", action: "reject", id: alert.id, title: alert.title })}
                          disabled={saving}
                          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 text-[11px] font-bold text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {saving ? "Rejecting..." : "Reject"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openApprovalModal({ kind: "alert", action: "approve", id: alert.id, title: alert.title })}
                          disabled={saving}
                          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-3 text-[11px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {saving ? "Approving..." : "Approve"}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}

            {filteredTasks.map((task) => {
              const ownerName = task.ownerName || task.owner?.name || "Unknown employee";
              const priority = task.priority === "LOW" ? "MEDIUM" : (task.priority ?? "MEDIUM");
              const saving = savingId === `task:${task.id}`;

              return (
                <article
                  key={`task:${task.id}`}
                  onClick={() => router.push(`/dwms/tasks/${task.instanceId ?? task.id}`)}
                  className="cursor-pointer rounded-2xl border border-border-app bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${getPriorityBadgeColor(priority)}`}>
                          {priority}
                        </span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${tabTone}`}>
                          Task {tabStatusLabel}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-semibold text-text-app">{task.title}</h3>
                        {task.description && (
                          <p className="mt-1 text-sm text-muted-app font-light leading-relaxed">{task.description}</p>
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
                      {task.completionAttachmentUrl && (
                        <a
                          href={task.completionAttachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          <span>{task.completionAttachmentName || "View completion file"}</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>

                    {activeTab === "pending" && (
                      <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openApprovalModal({ kind: "task", action: "reject", id: task.id, title: task.title })}
                          disabled={saving}
                          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 text-[11px] font-bold text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {saving ? "Rejecting..." : "Reject"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openApprovalModal({ kind: "task", action: "approve", id: task.id, title: task.title })}
                          disabled={saving}
                          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-3 text-[11px] font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {saving ? "Approving..." : "Approve"}
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

      {approvalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-border-app bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-app">
                  {approvalModal.kind === "task" ? "Task Approval" : "Alert Approval"}
                </p>
                <h2 className="mt-1 text-lg font-bold text-text-app">
                  {approvalModal.action === "approve" ? "Approve" : "Reject"} {approvalModal.kind}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-app">{approvalModal.title}</p>
              </div>
              <button
                type="button"
                onClick={closeApprovalModal}
                disabled={!!savingId}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-app text-muted-app transition hover:bg-bg-app disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Close approval note modal"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleApprovalSubmit} className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-text-app">
                {approvalModal.action === "approve" ? "Approval note" : "Rejection note"}
                <textarea
                  required
                  rows={4}
                  value={approvalComment}
                  onChange={(event) => {
                    setApprovalComment(event.target.value);
                    if (commentError) setCommentError(null);
                  }}
                  placeholder={approvalModal.action === "approve" ? "Add final acceptance note..." : "Add rejection reason..."}
                  className="mt-2 w-full resize-none rounded-xl border border-border-app bg-bg-app px-3 py-2 text-sm font-normal text-text-app outline-none transition focus:ring-2 focus:ring-accent-app/20"
                />
              </label>
              {commentError && <p className="text-xs font-semibold text-rose-600">{commentError}</p>}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeApprovalModal}
                  disabled={!!savingId}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-border-app bg-white px-4 text-xs font-bold text-muted-app transition hover:bg-bg-app disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!!savingId || !approvalComment.trim()}
                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${approvalModal.action === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
                >
                  {approvalModal.action === "approve" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {savingId ? "Submitting..." : approvalModal.action === "approve" ? "Approve" : "Reject"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}




