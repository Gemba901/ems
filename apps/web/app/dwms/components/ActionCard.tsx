import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, type FormEvent, type ReactNode } from "react";
import { DwmsService, getDwmsErrorMessage } from "@/services/dwms.service";
import { useAuthStore } from "@/store/auth.store";
import type {
  DwmsAlertItem,
  DwmsAssignedTaskHistoryItem,
  DwmsTaskItem,
  DwmsTaskStatus,
} from "@/services/dwms.service";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  UserRound,
} from "lucide-react";
import {
  formatOrganizationDate,
  formatOrganizationDateKey,
} from "../utils/organizationDate";

type ActionCardProps =
  | {
      type: "task";
      item: DwmsTaskItem | null;
      open: boolean;
      onClose: () => void;
      onTaskCommentAdded?: () => void | Promise<void>;
    }
  | {
      type: "approvalTask";
      item: DwmsAssignedTaskHistoryItem | null;
      open: boolean;
      onClose: () => void;
    }
  | {
      type: "alert";
      item: DwmsAlertItem | null;
      open: boolean;
      onClose: () => void;
    };

const taskStatusTone: Record<DwmsTaskStatus, string> = {
  PENDING: "border-border bg-muted text-foreground",
  IN_PROGRESS: "border-info bg-info-subtle text-info",
  DONE: "border-success bg-success-subtle text-success",
  APPROVAL_PENDING: "border-info bg-info-subtle text-info",
  PARTLY_DONE: "border-warning bg-warning-subtle text-warning",
  LESS_THAN_50: "border-warning bg-warning-subtle text-warning",
  NOT_APPLICABLE: "border-info bg-info-subtle text-info",
  OVERDUE: "border-danger bg-danger-subtle text-danger",
};

const severityTone: Record<string, string> = {
  MEDIUM: "border-info bg-info-subtle text-info",
  HIGH: "border-warning bg-warning-subtle text-warning",
  CRITICAL: "border-danger bg-danger-subtle text-danger",
};

function label(value?: string | null) {
  if (!value) return "Not set";
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string | null, withTime = true, timeZone?: string | null) {
  return formatOrganizationDate(value, timeZone, {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  }) ?? "Not set";
}

function DetailRow({
  label: title,
  value,
}: {
  label: string;
  value?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </p>
      <div className="mt-1.5 text-sm font-medium text-foreground">
        {value || "Not set"}
      </div>
    </div>
  );
}

export default function ActionCard(props: ActionCardProps) {
  if (!props.open || !props.item) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <DialogTitle>{props.item.title}</DialogTitle>
        </DialogHeader>

        {props.type === "task" ? (
          <TaskDetails
            task={props.item}
            onCommentAdded={props.onTaskCommentAdded}
          />
        ) : props.type === "approvalTask" ? (
          <ApprovalTaskDetails task={props.item} />
        ) : (
          <AlertDetails alert={props.item} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TaskDetails({
  task,
  onCommentAdded,
}: {
  task: DwmsTaskItem;
  onCommentAdded?: () => void | Promise<void>;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const timeZone = task.organizationTimeZone;
  const [comment, setComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = comment.trim();
    if (!trimmed || !token) return;

    setSavingComment(true);
    setCommentError(null);
    try {
      await DwmsService.addTaskComment(token, task.instanceId, trimmed);
      setComment("");
      await onCommentAdded?.();
    } catch (error) {
      setCommentError(getDwmsErrorMessage(error, "Failed to add comment"));
    } finally {
      setSavingComment(false);
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${taskStatusTone[task.status]}`}
        >
          {label(task.status)}
        </span>
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
          {label(task.frequency)}
        </span>
        {task.priority && (
          <span className="rounded-full border border-warning bg-warning-subtle px-3 py-1 text-xs font-medium text-warning">
            {label(task.priority)} Priority
          </span>
        )}
      </div>

      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Description
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">
          {task.description || "No description available for this task."}
        </p>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <DetailRow label="Owner" value={task.owner?.name} />
        <DetailRow
          label="Assigned By"
          value={task.assignedBy?.name || "System"}
        />
        <DetailRow label="Approver" value={task.approvedBy?.name} />
        <DetailRow label="Department" value={task.department?.name} />
        <DetailRow
          label="Scheduled For"
          value={formatOrganizationDateKey(task.scheduledFor, { dateStyle: "medium" }) ?? "Not set"}
        />
        <DetailRow label="Due At" value={formatDate(task.dueAt, true, timeZone)} />
        <DetailRow
          label="Acknowledged"
          value={
            task.acknowledgedAt
              ? formatDate(task.acknowledgedAt, true, timeZone)
              : "Not acknowledged"
          }
        />
        <DetailRow
          label="Completed"
          value={
            task.completedAt ? formatDate(task.completedAt, true, timeZone) : "Not completed"
          }
        />
      </div>

      <section className="mt-5 rounded-2xl border border-border bg-muted p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-foreground">Completion</span>
          <span className="font-semibold text-foreground">
            {task.completionPercent}%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-info"
            style={{
              width: `${Math.min(100, Math.max(0, task.completionPercent))}%`,
            }}
          />
        </div>
      </section>

      {task.completionAttachmentUrl && (
        <section className="mt-5 rounded-xl border border-border bg-muted p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-info">
            Completion File
          </p>
          <a
            href={task.completionAttachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-info transition hover:text-info"
          >
            <Paperclip className="h-4 w-4" />
            <span>
              {task.completionAttachmentName || "View completion file"}
            </span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </section>
      )}

      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span>Task Comments</span>
        </div>

        <div className="mt-4 space-y-3">
          {(task.comments ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-muted px-3 py-4 text-sm text-muted-foreground">
              No comments added yet.
            </p>
          ) : (
            (task.comments ?? []).map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-muted px-3 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {item.author?.name || "Unknown user"}
                  </span>
                  <span>{formatDate(item.createdAt, true, timeZone)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {item.comment}
                </p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={submitComment} className="mt-4 space-y-3">
          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            placeholder="Add a task comment..."
            className="w-full resize-none rounded-xl border border-border px-3 py-2 text-sm font-normal text-foreground outline-none transition focus:border-info focus:ring-2 focus:ring-info"
          />
          {commentError && (
            <p className="text-xs font-medium text-danger">{commentError}</p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={savingComment || !comment.trim() || !token}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-info px-4 text-xs font-semibold text-primary-foreground transition hover:bg-info disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingComment ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>{savingComment ? "Adding..." : "Add Comment"}</span>
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}

function ApprovalTaskDetails({ task }: { task: DwmsAssignedTaskHistoryItem }) {
  const timeZone = task.organizationTimeZone;
  const priority = task.priority === "LOW" ? "MEDIUM" : task.priority;
  const status = String(task.status || "APPROVAL_PENDING") as DwmsTaskStatus;

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${taskStatusTone[status] ?? taskStatusTone.APPROVAL_PENDING}`}
        >
          {label(String(task.status || "APPROVAL_PENDING"))}
        </span>
        {priority && (
          <span className="rounded-full border border-warning bg-warning-subtle px-3 py-1 text-xs font-medium text-warning">
            {label(priority)} Priority
          </span>
        )}
      </div>

      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Description
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">
          {task.description || "No description available for this task."}
        </p>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <DetailRow
          label="Submitted By"
          value={task.ownerName || task.owner?.name || "Unknown employee"}
        />
        <DetailRow
          label="Assigned By"
          value={task.assignedBy?.name || "System"}
        />
        <DetailRow
          label="Approver"
          value={task.approvedBy?.name || "Not set"}
        />
        <DetailRow label="Due Date" value={formatDate(task.dueDate, true, timeZone)} />
        <DetailRow
          label="Acknowledged"
          value={
            task.acknowledgedAt
              ? formatDate(task.acknowledgedAt, true, timeZone)
              : "Not acknowledged"
          }
        />
      </div>

      {task.completionNote && (
        <section className="mt-5 rounded-xl border border-border bg-muted p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" />
            Completion Note
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-success/80">
            {task.completionNote}
          </p>
        </section>
      )}

      {task.completionAttachmentUrl && (
        <section className="mt-5 rounded-xl border border-border bg-muted p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-info">
            Completion File
          </p>
          <a
            href={task.completionAttachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-info transition hover:text-info"
          >
            <Paperclip className="h-4 w-4" />
            <span>
              {task.completionAttachmentName || "View completion file"}
            </span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </section>
      )}
    </>
  );
}
function AlertDetails({ alert }: { alert: DwmsAlertItem }) {
  const timeZone = useAuthStore((state) => state.user?.organizationTimeZone);
  const normalizedSeverity =
    alert.severity === "LOW" ? "MEDIUM" : alert.severity;
  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${severityTone[normalizedSeverity] || severityTone.MEDIUM}`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {label(normalizedSeverity)}
        </span>
        <span
          className="rounded-full border border-info bg-info-subtle px-3 py-1 text-xs font-semibold text-info"
        >
          {alert.pendingAcknowledgments ? "Not Acknowledged" : "Acknowledged"}
        </span>
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
          {label(alert.type)}
        </span>
      </div>

      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Description
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground">
          {alert.description || "No description available for this alert."}
        </p>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <DetailRow
          label="Raised By"
          value={
            alert.raisedBy
              ? `${alert.raisedBy.name} (${alert.raisedBy.email})`
              : "Not set"
          }
        />
        <DetailRow label="Created At" value={formatDate(alert.createdAt, true, timeZone)} />
        <DetailRow
          label="Against Person"
          value={
            alert.againstUser
              ? `${alert.againstUser.name} (${alert.againstUser.email})`
              : "Not assigned"
          }
        />
        <DetailRow
          label="Department"
          value={alert.department?.name || "Not assigned"}
        />
        <DetailRow
          label="Linked Task"
          value={alert.taskInstance?.task?.title || "Not linked"}
        />
        <DetailRow
          label="Task Owner"
          value={alert.taskInstance?.owner?.name || "Not assigned"}
        />
        <DetailRow
          label="Repeat Count"
          value={String(alert.raiseCount)}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted p-4 text-sm text-foreground">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          <span>{alert.raisedBy?.name || "Unknown raiser"}</span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted p-4 text-sm text-foreground">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <span>{formatDate(alert.createdAt, false, timeZone)}</span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted p-4 text-sm text-foreground">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <span>{alert.isAbnormality ? "Abnormality" : "Alert"}</span>
        </div>
      </div>
    </>
  );
}

