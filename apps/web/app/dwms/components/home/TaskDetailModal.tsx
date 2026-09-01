import type {
  DwmsTaskItem as TaskItem,
  DwmsTaskStatus as TaskStatus,
} from "@/services/dwms.service";
import { ExternalLink, Paperclip } from "lucide-react";

type Props = {
  task: TaskItem | null;
  open: boolean;
  statusTone: Record<TaskStatus, string>;
  statusLabel: (status: TaskStatus) => string;
  formatDateOnly: (value: string) => string;
  formatDateTime: (value: string) => string;
  onClose: () => void;
};

export default function TaskDetailModal({
  task,
  open,
  statusTone,
  statusLabel,
  formatDateOnly,
  formatDateTime,
  onClose,
}: Props) {
  if (!open || !task) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[2px] transition-colors duration-200"
      onClick={onClose}
    >
      <article
        className="max-h-[88vh] w-full max-w-3xl overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl transition-colors duration-200 sm:rounded-[28px] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
              Task details
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {task.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            aria-label="Close task details"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone[task.status]}`}
          >
            {statusLabel(task.status)}
          </span>
          <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200">
            Frequency: {task.frequency}
          </span>
          <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200">
            Assigned by: {task.assignedBy?.name || "System"}
          </span>
          <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200">
            Owner: {task.owner.name}
          </span>
        </div>

        <div className="mt-5 rounded-2xl border border-border-app bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Description
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-700">
            {task.description || "No description available for this task."}
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 font-semibold">Completion</span>
              <span className="font-semibold text-slate-900">
                {task.completionPercent}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                style={{ width: `${task.completionPercent}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-600 border border-slate-200">
            <p>Scheduled: {formatDateOnly(task.scheduledFor)}</p>
            <p>
              Acknowledged:{" "}
              {task.acknowledgedAt
                ? formatDateOnly(task.acknowledgedAt)
                : "Not acknowledged"}
            </p>
            <p className="mt-1">Due at: {formatDateTime(task.dueAt)}</p>
            {task.completedAt && (
              <p className="mt-1">
                Completed: {formatDateTime(task.completedAt)}
              </p>
            )}
          </div>
        </div>

        {task.completionAttachmentUrl && (
          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-blue-700">
              Completion file
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
          </div>
        )}
      </article>
    </div>
  );
}
