"use client";

import { useState } from "react";
import { CalendarRange, Loader2 } from "lucide-react";
import { useCompleteSprint, useStartSprint } from "@/hooks/work/useWork";
import { formatDateOnly } from "@/lib/work/format";
import { SPRINT_STATUS_LABELS, type Sprint } from "@/services/work.service";
import { useToast } from "@/contexts/toast.context";
import { SprintFormDialog } from "@/components/work/sprints/SprintFormDialog";
import { ErrorNote, Surface, WorkDialog, errorMessage, primaryButton, secondaryButton } from "@/components/work/ui";

const STATUS_STYLES: Record<Sprint["status"], string> = {
  PLANNED: "bg-slate-100 text-slate-700",
  ACTIVE: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
};

export function SprintHeader({ sprint, canManage }: { sprint: Sprint; canManage: boolean }) {
  const start = useStartSprint();
  const complete = useCompleteSprint();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const { total, done } = sprint.taskCounts;
  const unfinished = total - done;

  return (
    <Surface className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">{sprint.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[sprint.status]}`}>
              {SPRINT_STATUS_LABELS[sprint.status]}
            </span>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-slate-600">
            <CalendarRange className="h-4 w-4 text-slate-400" aria-hidden="true" />
            {formatDateOnly(sprint.startDate)} – {formatDateOnly(sprint.endDate)}
          </p>
          {sprint.goal && <p className="text-sm text-slate-600">Goal: {sprint.goal}</p>}
          <p className="text-sm font-medium text-slate-800">
            {done} of {total} tasks done
            {sprint.status === "COMPLETED" && " at completion"}
          </p>
        </div>
        {canManage && sprint.status !== "COMPLETED" && (
          <div className="flex flex-wrap gap-2">
            {sprint.status === "PLANNED" && (
              <>
                <button type="button" className={secondaryButton} onClick={() => setEditing(true)}>
                  Edit sprint
                </button>
                <button
                  type="button"
                  className={primaryButton}
                  disabled={start.isPending}
                  onClick={() =>
                    start.mutate(sprint.id, {
                      onSuccess: () => toast(`${sprint.name} started`, "success"),
                      onError: (e) => toast(errorMessage(e), "error"),
                    })
                  }
                >
                  {start.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Start sprint
                </button>
              </>
            )}
            {sprint.status === "ACTIVE" && (
              <button
                type="button"
                className={primaryButton}
                onClick={() => {
                  setCompleteError(null);
                  setConfirmComplete(true);
                }}
              >
                Complete sprint
              </button>
            )}
          </div>
        )}
      </div>

      {editing && <SprintFormDialog open={editing} onOpenChange={setEditing} projectId={sprint.projectId} sprint={sprint} />}

      <WorkDialog
        open={confirmComplete}
        onOpenChange={setConfirmComplete}
        title={`Complete ${sprint.name}?`}
        description="The sprint's result is saved as a read-only record."
        footer={
          <>
            <button type="button" className={secondaryButton} onClick={() => setConfirmComplete(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={primaryButton}
              disabled={complete.isPending}
              onClick={() =>
                complete.mutate(sprint.id, {
                  onSuccess: () => {
                    setConfirmComplete(false);
                    toast(`${sprint.name} completed`, "success");
                  },
                  onError: (e) => setCompleteError(errorMessage(e)),
                })
              }
            >
              {complete.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Complete sprint
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            {done} of {total} tasks are done.
          </p>
          {unfinished > 0 && (
            <p>
              The {unfinished} unfinished {unfinished === 1 ? "task moves" : "tasks move"} back to Unscheduled so they can be planned
              into another sprint.
            </p>
          )}
          {completeError && <ErrorNote>{completeError}</ErrorNote>}
        </div>
      </WorkDialog>
    </Surface>
  );
}
