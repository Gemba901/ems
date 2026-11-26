import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>

        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone[task.status]}`}
          >
            {statusLabel(task.status)}
          </span>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground border border-border">
            Frequency: {task.frequency}
          </span>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground border border-border">
            Assigned by: {task.assignedBy?.name || "System"}
          </span>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground border border-border">
            Owner: {task.owner.name}
          </span>
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Description
          </p>
          <p className="mt-2 text-sm leading-7 text-foreground">
            {task.description || "No description available for this task."}
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-muted p-4 border border-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-semibold">Completion</span>
              <span className="font-semibold text-foreground">
                {task.completionPercent}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${task.completionPercent}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-muted p-4 text-xs text-muted-foreground border border-border">
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
          <div className="mt-5 rounded-xl border border-border bg-muted p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-info">
              Completion file
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
