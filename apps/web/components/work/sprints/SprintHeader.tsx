"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { CalendarRange, Loader2, Users } from "lucide-react";
import { useCompleteSprint, useStartSprint } from "@/hooks/work/useWork";
import { formatDateOnly } from "@/lib/work/format";
import { SPRINT_STATUS_LABELS, type ProjectMember, type Sprint } from "@/services/work.service";
import { useToast } from "@/contexts/toast.context";
import { SprintFormDialog } from "@/components/work/sprints/SprintFormDialog";
import { ErrorNote, SprintHelp, Surface, WorkDialog, errorMessage } from "@/components/work/ui";

const STATUS_STYLES: Record<Sprint["status"], string> = {
  PLANNED: "bg-muted text-foreground",
  ACTIVE: "bg-info-subtle text-info",
  COMPLETED: "bg-success-subtle text-success",
};

export function SprintHeader({ sprint, canManage, projectMembers }: { sprint: Sprint; canManage: boolean; projectMembers: ProjectMember[] }) {
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
            <h2 className="text-base font-semibold text-foreground">{sprint.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[sprint.status]}`}>
              {SPRINT_STATUS_LABELS[sprint.status]}
            </span>
            <SprintHelp />
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {formatDateOnly(sprint.startDate)} – {formatDateOnly(sprint.endDate)}
          </p>
          {sprint.goal && <p className="text-sm text-muted-foreground">Goal: {sprint.goal}</p>}
          {(sprint.lead || sprint.members.length > 0) && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>
                {sprint.lead && (
                  <>
                    Lead: <span className="font-medium text-foreground">{sprint.lead.name}</span>
                    {sprint.members.length > 1 && " · "}
                  </>
                )}
                {sprint.members
                  .filter((m) => m.id !== sprint.lead?.id)
                  .map((m) => m.name)
                  .join(", ")}
              </span>
            </p>
          )}
          <p className="text-sm font-medium text-foreground">
            {done} of {total} tasks done
            {sprint.status === "COMPLETED" && " at completion"}
          </p>
        </div>
        {canManage && sprint.status !== "COMPLETED" && (
          <div className="flex flex-wrap gap-2">
            {sprint.status === "PLANNED" && (
              <>
                <Button variant="outline" type="button" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button
                  variant="default"
                  type="button"
                  disabled={start.isPending}
                  onClick={() =>
                    start.mutate(sprint.id, {
                      onSuccess: () => toast(`${sprint.name} started`, "success"),
                      onError: (e) => toast(errorMessage(e), "error"),
                    })
                  }
                >
                  {start.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Start
                </Button>
              </>
            )}
            {sprint.status === "ACTIVE" && (
              <Button variant="outline" type="button" onClick={() => setEditing(true)}>
                Edit team
              </Button>
            )}
            {sprint.status === "ACTIVE" && (
              <Button
                variant="default"
                type="button"
                onClick={() => {
                  setCompleteError(null);
                  setConfirmComplete(true);
                }}
              >
                Complete
              </Button>
            )}
          </div>
        )}
      </div>

      {editing && <SprintFormDialog open={editing} onOpenChange={setEditing} projectId={sprint.projectId} projectMembers={projectMembers} sprint={sprint} />}

      <WorkDialog
        open={confirmComplete}
        onOpenChange={setConfirmComplete}
        title={`Complete ${sprint.name}?`}
        description="Its result is saved as a read-only record."
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setConfirmComplete(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              type="button"
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
              Complete
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-foreground">
          <p>
            {done} of {total} tasks are done.
          </p>
          {unfinished > 0 && (
            <p>
              The {unfinished} unfinished {unfinished === 1 ? "task moves" : "tasks move"} back to Unscheduled so they can be planned
              into another sprint / phase.
            </p>
          )}
          {completeError && <ErrorNote>{completeError}</ErrorNote>}
        </div>
      </WorkDialog>
    </Surface>
  );
}
