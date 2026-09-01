import { useState, type FormEvent, type ReactNode } from "react";
import { DwmsService, getDwmsErrorMessage } from "@/services/dwms.service";
import { useAuthStore } from "@/store/auth.store";
import type {
  DwmsAlertItem,
  DwmsAssignedTaskHistoryItem,
  DwmsAlertStatus,
  DwmsTaskItem,
  DwmsTaskStatus,
} from "@/services/dwms.service";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  UserRound,
  X,
} from "lucide-react";

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
  PENDING: "border-slate-200 bg-slate-100 text-slate-700",
  IN_PROGRESS: "border-blue-200 bg-blue-100 text-blue-700",
  DONE: "border-emerald-200 bg-emerald-100 text-emerald-700",
  APPROVAL_PENDING: "border-cyan-200 bg-cyan-100 text-cyan-700",
  PARTLY_DONE: "border-amber-200 bg-amber-100 text-amber-700",
  LESS_THAN_50: "border-orange-200 bg-orange-100 text-orange-700",
  NOT_APPLICABLE: "border-violet-200 bg-violet-100 text-violet-700",
  OVERDUE: "border-rose-200 bg-rose-100 text-rose-700",
};

const alertStatusTone: Record<DwmsAlertStatus, string> = {
  OPEN: "border-blue-200 bg-blue-50 text-blue-700",
  IN_PROGRESS: "border-sky-200 bg-sky-50 text-sky-700",
  ESCALATED: "border-violet-200 bg-violet-50 text-violet-700",
  CLOSED: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const severityTone: Record<string, string> = {
  MEDIUM: "border-blue-100 bg-blue-50 text-blue-700",
  HIGH: "border-amber-200 bg-amber-50 text-amber-700",
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-700",
};

function label(value?: string | null) {
  if (!value) return "Not set";
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string | null, withTime = true) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

function DetailRow({
  label: title,
  value,
}: {
  label: string;
  value?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        {title}
      </p>
      <div className="mt-1.5 text-sm font-medium text-slate-800">
        {value || "Not set"}
      </div>
    </div>
  );
}

export default function ActionCard(props: ActionCardProps) {
  if (!props.open || !props.item) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
      onClick={props.onClose}
    >
      <article
        className="max-h-[88vh] w-full max-w-3xl overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-[28px] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
              {props.type === "alert"
                ? "Alert Action Card"
                : "Task Action Card"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {props.item.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            aria-label="Close action card"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

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
      </article>
    </div>
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
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          {label(task.frequency)}
        </span>
        {task.priority && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            {label(task.priority)} Priority
          </span>
        )}
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Description
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
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
          value={formatDate(task.scheduledFor, false)}
        />
        <DetailRow label="Due At" value={formatDate(task.dueAt)} />
        <DetailRow
          label="Acknowledged"
          value={
            task.acknowledgedAt
              ? formatDate(task.acknowledgedAt)
              : "Not acknowledged"
          }
        />
        <DetailRow
          label="Completed"
          value={
            task.completedAt ? formatDate(task.completedAt) : "Not completed"
          }
        />
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">Completion</span>
          <span className="font-semibold text-slate-900">
            {task.completionPercent}%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-blue-600"
            style={{
              width: `${Math.min(100, Math.max(0, task.completionPercent))}%`,
            }}
          />
        </div>
      </section>

      {task.completionAttachmentUrl && (
        <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blue-700">
            Completion File
          </p>
          <a
            href={task.completionAttachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition hover:text-blue-800"
          >
            <Paperclip className="h-4 w-4" />
            <span>
              {task.completionAttachmentName || "View completion file"}
            </span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </section>
      )}

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <MessageSquare className="h-4 w-4 text-slate-500" />
          <span>Task Comments</span>
        </div>

        <div className="mt-4 space-y-3">
          {(task.comments ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              No comments added yet.
            </p>
          ) : (
            (task.comments ?? []).map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {item.author?.name || "Unknown user"}
                  </span>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {item.comment}
                </p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={submitComment} className="mt-4 space-y-3">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            placeholder="Add a task comment..."
            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          {commentError && (
            <p className="text-xs font-medium text-rose-600">{commentError}</p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingComment || !comment.trim() || !token}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingComment ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>{savingComment ? "Adding..." : "Add Comment"}</span>
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function ApprovalTaskDetails({ task }: { task: DwmsAssignedTaskHistoryItem }) {
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
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            {label(priority)} Priority
          </span>
        )}
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Description
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
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
        <DetailRow label="Due Date" value={formatDate(task.dueDate)} />
        <DetailRow
          label="Acknowledged"
          value={
            task.acknowledgedAt
              ? formatDate(task.acknowledgedAt)
              : "Not acknowledged"
          }
        />
      </div>

      {task.completionNote && (
        <section className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            Completion Note
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-900/80">
            {task.completionNote}
          </p>
        </section>
      )}

      {task.completionAttachmentUrl && (
        <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blue-700">
            Completion File
          </p>
          <a
            href={task.completionAttachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition hover:text-blue-800"
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
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${alertStatusTone[alert.status]}`}
        >
          {label(alert.status)}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          {label(alert.type)}
        </span>
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Description
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
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
        <DetailRow label="Created At" value={formatDate(alert.createdAt)} />
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
          value={String(alert.repeatCount ?? 0)}
        />
        <DetailRow
          label="Resolved At"
          value={
            alert.resolvedAt ? formatDate(alert.resolvedAt) : "Not resolved"
          }
        />
      </div>

      {alert.correctiveAction && (
        <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
            <Clock className="h-4 w-4" />
            Corrective Action Taken
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-blue-900/80">
            {alert.correctiveAction}
          </p>
        </section>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <UserRound className="h-4 w-4 text-slate-500" />
          <span>{alert.raisedBy?.name || "Unknown raiser"}</span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <CalendarClock className="h-4 w-4 text-slate-500" />
          <span>{formatDate(alert.createdAt, false)}</span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <AlertTriangle className="h-4 w-4 text-slate-500" />
          <span>{alert.isRepeated ? "Repeated alert" : "Single alert"}</span>
        </div>
      </div>
    </>
  );
}

