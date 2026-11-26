"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LoadingState } from "@/components/patterns/LoadingState";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

type ApprovalTab = "pending" | "approved" | "rejected";
type PriorityFilter = "ALL" | "MEDIUM" | "HIGH" | "CRITICAL";
type ApprovalAction = "approve" | "reject";

type ApprovalDecision = {
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
  const organizationTimeZone = useAuthStore(
    (state) => state.user?.organizationTimeZone,
  );
  const [pendingTasks, setPendingTasks] = useState<DwmsAssignedTaskHistoryItem[]>([]);
  const [approvedTasks, setApprovedTasks] = useState<DwmsAssignedTaskHistoryItem[]>([]);
  const [rejectedTasks, setRejectedTasks] = useState<DwmsAssignedTaskHistoryItem[]>([]);
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
      ] = await Promise.all([
        DwmsService.getApprovalTasks(token, "pending"),
        DwmsService.getApprovalTasks(token, "approved"),
        DwmsService.getApprovalTasks(token, "rejected"),
      ]);

      setPendingTasks(pendingTaskResponse.tasks ?? []);
      setApprovedTasks(approvedTaskResponse.tasks ?? []);
      setRejectedTasks(rejectedTaskResponse.tasks ?? []);
    } catch (fetchError: unknown) {
      setError(getDwmsErrorMessage(fetchError, "Failed to load approvals"));
      setPendingTasks([]);
      setApprovedTasks([]);
      setRejectedTasks([]);
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

    const itemKey = `task:${approvalModal.id}`;
    setSavingId(itemKey);
    setError(null);
    setCommentError(null);

    try {
      const token = useAuthStore.getState().accessToken ?? "";
      if (approvalModal.action === "approve") {
        await DwmsService.approveTask(token, approvalModal.id, { comment: note });
      } else {
        await DwmsService.rejectTask(token, approvalModal.id, { comment: note });
      }

      setApprovalModal(null);
      setApprovalComment("");
      await loadApprovals();
    } catch (approvalError: unknown) {
      setCommentError(getDwmsErrorMessage(approvalError, "Failed to submit approval decision"));
    } finally {
      setSavingId(null);
    }
  }

  const currentTasks = activeTab === "pending" ? pendingTasks : activeTab === "approved" ? approvedTasks : rejectedTasks;

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


  const formatDate = (value?: string | null) => {
    if (!value) return "Not available";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: organizationTimeZone || "UTC",
      dateStyle: "medium",
    }).format(new Date(value));
  };

  const getPriorityBadgeColor = (priority?: string | null) => {
    switch (priority) {
      case "CRITICAL":
        return "bg-danger/10 text-danger border border-danger/20";
      case "HIGH":
        return "bg-warning/10 text-warning border border-warning/20";
      case "MEDIUM":
        return "bg-info/10 text-info border border-info/20";
      default:
        return "bg-muted-foreground/10 text-muted-foreground border border-border/20";
    }
  };

  const tabStatusLabel = activeTab === "pending" ? "Approval Pending" : activeTab === "approved" ? "Approved" : "Rejected";
  const tabTone = activeTab === "pending"
    ? "bg-info/10 text-info border border-info/20"
    : activeTab === "approved"
      ? "bg-success/10 text-success border border-success/20"
      : "bg-danger/10 text-danger border border-danger/20";
  const emptyCount = currentTasks.length;

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 pb-8 pt-6 sm:space-y-6 sm:px-6 sm:pt-8 lg:px-8">
      <DwmsTabHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          {
            key: "pending",
            label: "Required to Approve",
            dotColor: "bg-info",
            count: pendingTasks.length,
          },
          {
            key: "approved",
            label: "Approved",
            dotColor: "bg-success",
            count: approvedTasks.length,
          },
          {
            key: "rejected",
            label: "Rejected",
            dotColor: "bg-danger",
            count: rejectedTasks.length,
          },
        ]}
      />
      <div className="space-y-6">
        <DwmsSearchFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search title, employee, or assigner..."
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
          <div className="rounded-xl border border-danger bg-danger-subtle px-4 py-3 text-xs text-danger">
            {error}
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading approvals…" />
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card py-24 text-center text-sm text-muted-foreground">
            {emptyCount === 0
              ? activeTab === "pending"
                ? "No tasks are waiting for your approval."
                : activeTab === "approved"
                  ? "No approved items yet."
                  : "No rejected items yet."
              : "No approval items match your search or priority filter."}
          </div>
        ) : (
          <div className="space-y-4">

            {filteredTasks.map((task) => {
              const ownerName = task.ownerName || task.owner?.name || "Unknown employee";
              const priority = task.priority === "LOW" ? "MEDIUM" : (task.priority ?? "MEDIUM");
              const saving = savingId === `task:${task.id}`;

              return (
                <article
                  key={`task:${task.id}`}
                  onClick={() => router.push(`/dwms/tasks/${task.instanceId ?? task.id}`)}
                  className="cursor-pointer rounded-2xl border border-border bg-card p-4 transition hover:border-border hover:shadow-md"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
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
                        <h3 className="text-base font-semibold text-foreground">{task.title}</h3>
                        {task.description && (
                          <p className="mt-1 text-sm text-muted-foreground font-light leading-relaxed">{task.description}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 font-medium text-foreground">
                          <UserRound className="h-3.5 w-3.5" />
                          Submitted by: {ownerName}
                        </span>
                        {task.assignedBy?.name && (
                          <span className="rounded-full bg-muted px-3 py-1 font-medium text-foreground">
                            Assigned by: {task.assignedBy.name}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 font-medium text-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          Due: {formatDate(task.dueDate)}
                        </span>
                      </div>
                      {task.completionAttachmentUrl && (
                        <a
                          href={task.completionAttachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-info bg-info-subtle px-3 py-2 text-xs font-semibold text-info transition hover:border-info hover:bg-info-subtle"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          <span>{task.completionAttachmentName || "View completion file"}</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>

                    {activeTab === "pending" && (
                      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center" onClick={(event) => event.stopPropagation()}>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => openApprovalModal({ action: "reject", id: task.id, title: task.title })}
                          disabled={saving}
                          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-danger bg-danger-subtle px-3 text-[11px] font-bold text-danger shadow-sm transition hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-8 sm:rounded-full"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {saving ? "Rejecting..." : "Reject"}
                        </Button>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => openApprovalModal({ action: "approve", id: task.id, title: task.title })}
                          disabled={saving}
                          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-success px-3 text-[11px] font-bold text-success-foreground shadow-sm transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-8 sm:rounded-full"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {saving ? "Approving..." : "Approve"}
                        </Button>
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
        <Dialog open onOpenChange={(open) => { if (!open && !savingId) closeApprovalModal(); }}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!savingId}>
            <DialogHeader className="pr-8">
              <DialogTitle>{approvalModal.action === "approve" ? "Approve task" : "Reject task"}</DialogTitle>
              <DialogDescription>{approvalModal.title}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleApprovalSubmit} className="space-y-4" aria-busy={!!savingId}>
              <label className="block text-sm font-semibold text-foreground">
                {approvalModal.action === "approve" ? "Approval note" : "Rejection note"}
                <Textarea
                  required
                  rows={4}
                  value={approvalComment}
                  onChange={(event) => {
                    setApprovalComment(event.target.value);
                    if (commentError) setCommentError(null);
                  }}
                  placeholder={approvalModal.action === "approve" ? "Add final acceptance note..." : "Add rejection reason..."}
                  className="mt-2 w-full resize-none rounded-xl border border-border bg-muted px-3 py-2 text-sm font-normal text-foreground outline-none transition focus:ring-2 focus:ring-ring/20"
                />
              </label>
              {commentError && <p role="alert" className="text-xs font-semibold text-danger">{commentError}</p>}

              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={closeApprovalModal}
                  disabled={!!savingId}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-card px-4 text-xs font-bold text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!!savingId || !approvalComment.trim()}
                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${approvalModal.action === "approve" ? "bg-success text-success-foreground hover:bg-success/90" : "bg-danger text-danger-foreground hover:bg-danger/90"}`}
                >
                  {approvalModal.action === "approve" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {savingId ? "Submitting..." : approvalModal.action === "approve" ? "Approve" : "Reject"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}



