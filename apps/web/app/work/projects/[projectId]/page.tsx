"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Lock, Pencil, Plus, RotateCcw } from "lucide-react";
import { useProject, useProjectTasks, useSprint, useSprints, useUpdateProject } from "@/hooks/work/useWork";
import { useAuthStore } from "@/store/auth.store";
import { formatDateOnly, todayIn } from "@/lib/work/format";
import { SPRINT_STATUS_LABELS, TASK_STATUS_LABELS, TASK_STATUSES, WorkApiError, type Sprint, type SprintSnapshot } from "@/services/work.service";
import { ProjectFormDialog } from "@/components/work/projects/ProjectFormDialog";
import { SprintFormDialog } from "@/components/work/sprints/SprintFormDialog";
import { SprintHeader } from "@/components/work/sprints/SprintHeader";
import { TaskBoard } from "@/components/work/tasks/TaskBoard";
import { TaskFormDialog } from "@/components/work/tasks/TaskFormDialog";
import { TaskPanel } from "@/components/work/tasks/TaskPanel";
import { useToast } from "@/contexts/toast.context";
import { EmptyState, ErrorNote, Loading, SprintHelp, Surface, TaskStatusBadge, errorMessage, linkButton, primaryButton, secondaryButton } from "@/components/work/ui";

function SnapshotList({ snapshot, onOpen }: { snapshot: SprintSnapshot; onOpen: (taskId: string) => void }) {
  return (
    <Surface>
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm text-slate-600">
        <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
        Read-only record of the sprint / phase when it was completed.
      </div>
      {snapshot.tasks.length === 0 ? (
        <EmptyState title="It had no tasks" />
      ) : (
        TASK_STATUSES.filter((s) => snapshot.tasks.some((t) => t.status === s)).map((status) => (
          <section key={status} aria-labelledby={`snapshot-${status}`} className="border-b border-slate-100 last:border-b-0">
            <h3 id={`snapshot-${status}`} className="bg-slate-50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {TASK_STATUS_LABELS[status]} at completion
            </h3>
            <ul className="divide-y divide-slate-100">
              {snapshot.tasks
                .filter((t) => t.status === status)
                .map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                    <button type="button" className={`${linkButton} text-left`} onClick={() => onOpen(t.id)}>
                      {t.title}
                    </button>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {t.assigneeName ?? "Unassigned"}
                      <TaskStatusBadge status={t.status} />
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </Surface>
  );
}

function sprintLabel(s: Sprint): string {
  return s.status === "PLANNED" ? s.name : `${s.name} (${SPRINT_STATUS_LABELS[s.status]})`;
}

function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timeZone = useAuthStore((s) => s.user?.organizationTimeZone) || "UTC";
  const today = todayIn(timeZone);

  const project = useProject(projectId);
  const sprints = useSprints(projectId);
  const sprintList = sprints.data?.items ?? [];

  // The view lives in the URL so it survives reloads and can be shared. Without one, show the
  // active sprint when exactly one runs; with several in parallel, show everything.
  const viewParam = searchParams.get("view");
  const activeSprints = sprintList.filter((s) => s.status === "ACTIVE");
  const defaultView = activeSprints.length === 1 ? activeSprints[0].id : "all";
  const view = viewParam ?? (sprints.isSuccess ? defaultView : sprints.isError ? "all" : null);
  const selectedSprint = view && view !== "all" && view !== "unscheduled" ? sprintList.find((s) => s.id === view) ?? null : null;
  const completed = selectedSprint?.status === "COMPLETED";

  const tasks = useProjectTasks(projectId, completed ? "" : (view ?? ""));
  const sprintDetail = useSprint(completed ? selectedSprint!.id : null);
  const taskId = searchParams.get("task");

  const [editingProject, setEditingProject] = useState(false);
  const [creatingSprint, setCreatingSprint] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const updateProject = useUpdateProject(projectId);
  const { toast } = useToast();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const text = next.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }

  if (project.isLoading) return <Loading label="Loading project…" />;
  if (project.isError || !project.data) {
    const notFound = project.error instanceof WorkApiError && project.error.status === 404;
    return (
      <div className="space-y-4">
        <Link href="/work/projects" className={linkButton}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to projects
        </Link>
        <ErrorNote>{notFound ? "This project doesn't exist or you don't have access to it." : errorMessage(project.error)}</ErrorNote>
      </div>
    );
  }

  const p = project.data;
  const members = p.members;

  return (
    <div className="space-y-5">
      <Link href="/work/projects" className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to projects
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">{p.name}</h1>
          {p.description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{p.description}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>
              {p.memberCount} {p.memberCount === 1 ? "member" : "members"}
            </span>
            {p.status === "COMPLETED" ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                Completed{p.completedAt && ` ${formatDateOnly(p.completedAt.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}`}
              </span>
            ) : (
              p.targetDate && (
                <span className={p.targetDate < today ? "rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800" : undefined}>
                  {p.targetDate < today ? "Overdue · target " : "Target "}
                  {formatDateOnly(p.targetDate, { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )
            )}
          </p>
        </div>
        {p.canManage && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} onClick={() => setEditingProject(true)}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit project
            </button>
            {p.status !== "COMPLETED" && (
              <button type="button" className={secondaryButton} onClick={() => setCreatingSprint(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" /> New sprint / phase
              </button>
            )}
            <button
              type="button"
              className={secondaryButton}
              disabled={updateProject.isPending}
              onClick={() =>
                updateProject.mutate(
                  { status: p.status === "COMPLETED" ? "ACTIVE" : "COMPLETED" },
                  {
                    onSuccess: (saved) => toast(saved.status === "COMPLETED" ? `${p.name} marked complete` : `${p.name} reopened`, "success"),
                    onError: (e) => toast(errorMessage(e), "error"),
                  },
                )
              }
            >
              {p.status === "COMPLETED" ? (
                <>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reopen
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Mark complete
                </>
              )}
            </button>
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <SprintHelp />
          <label htmlFor="task-view" className="text-sm font-medium text-slate-700">
            Show
          </label>
          <select
            id="task-view"
            className="min-h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={view ?? ""}
            disabled={!view}
            onChange={(e) => setParam("view", e.target.value)}
          >
            <option value="all">All tasks</option>
            <option value="unscheduled">Unscheduled</option>
            {sprintList.length > 0 && (
              <optgroup label="Sprints / Phases">
                {sprintList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sprintLabel(s)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        {!completed && (
          <button type="button" className={primaryButton} onClick={() => setAddingTask(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add task
          </button>
        )}
      </div>

      {selectedSprint && <SprintHeader sprint={selectedSprint} canManage={p.canManage} projectMembers={members} />}
      {viewParam && viewParam !== "all" && viewParam !== "unscheduled" && sprints.isSuccess && !selectedSprint && (
        <ErrorNote>That sprint / phase was not found in this project.</ErrorNote>
      )}

      {completed ? (
        sprintDetail.isLoading ? (
          <Loading label="Loading record…" />
        ) : sprintDetail.data?.completionSnapshot ? (
          <SnapshotList snapshot={sprintDetail.data.completionSnapshot} onOpen={(id) => setParam("task", id)} />
        ) : (
          <ErrorNote>{errorMessage(sprintDetail.error, "The record could not be loaded.")}</ErrorNote>
        )
      ) : !view || tasks.isLoading ? (
        <Loading label="Loading tasks…" />
      ) : tasks.isError ? (
        <div className="space-y-3">
          <ErrorNote>We couldn&apos;t load tasks. {errorMessage(tasks.error, "")}</ErrorNote>
          <button type="button" className={secondaryButton} onClick={() => tasks.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <TaskBoard tasks={tasks.data?.items ?? []} today={today} onOpen={(id) => setParam("task", id)} />
      )}

      <TaskPanel
        taskId={taskId}
        onClose={() => setParam("task", null)}
        members={members}
        sprints={sprintList}
        canManage={p.canManage}
      />

      {editingProject && <ProjectFormDialog open={editingProject} onOpenChange={setEditingProject} project={p} />}
      {creatingSprint && (
        <SprintFormDialog
          open={creatingSprint}
          onOpenChange={setCreatingSprint}
          projectId={p.id}
          projectMembers={members}
          onSaved={(sprint) => setParam("view", sprint.id)}
        />
      )}
      {addingTask && (
        <TaskFormDialog
          open={addingTask}
          onOpenChange={setAddingTask}
          projectId={p.id}
          members={members}
          sprints={sprintList}
          canManage={p.canManage}
          defaultSprintId={selectedSprint?.id ?? null}
        />
      )}
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function ProjectWorkspacePage() {
  return (
    <Suspense fallback={<Loading label="Loading project…" />}>
      <ProjectWorkspace />
    </Suspense>
  );
}
