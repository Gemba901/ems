"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Lock, Pencil, Plus } from "lucide-react";
import { useProject, useProjectTasks, useSprint, useSprints } from "@/hooks/work/useWork";
import { useAuthStore } from "@/store/auth.store";
import { todayIn } from "@/lib/work/format";
import { SPRINT_STATUS_LABELS, TASK_STATUS_LABELS, TASK_STATUSES, WorkApiError, type Sprint, type SprintSnapshot } from "@/services/work.service";
import { ProjectFormDialog } from "@/components/work/projects/ProjectFormDialog";
import { SprintFormDialog } from "@/components/work/sprints/SprintFormDialog";
import { SprintHeader } from "@/components/work/sprints/SprintHeader";
import { TaskBoard } from "@/components/work/tasks/TaskBoard";
import { TaskFormDialog } from "@/components/work/tasks/TaskFormDialog";
import { TaskPanel } from "@/components/work/tasks/TaskPanel";
import { EmptyState, ErrorNote, Loading, Surface, TaskStatusBadge, errorMessage, linkButton, primaryButton, secondaryButton } from "@/components/work/ui";

function SnapshotList({ snapshot, onOpen }: { snapshot: SprintSnapshot; onOpen: (taskId: string) => void }) {
  return (
    <Surface>
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm text-slate-600">
        <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
        Read-only record of the sprint when it was completed.
      </div>
      {snapshot.tasks.length === 0 ? (
        <EmptyState title="This sprint had no tasks" />
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

  // The view lives in the URL so it survives reloads and can be shared. Without one,
  // show the active sprint if there is one, otherwise everything.
  const viewParam = searchParams.get("view");
  const activeSprint = sprintList.find((s) => s.status === "ACTIVE");
  const view = viewParam ?? (sprints.isSuccess ? (activeSprint?.id ?? "all") : sprints.isError ? "all" : null);
  const selectedSprint = view && view !== "all" && view !== "unscheduled" ? sprintList.find((s) => s.id === view) ?? null : null;
  const completed = selectedSprint?.status === "COMPLETED";

  const tasks = useProjectTasks(projectId, completed ? "" : (view ?? ""));
  const sprintDetail = useSprint(completed ? selectedSprint!.id : null);
  const taskId = searchParams.get("task");

  const [editingProject, setEditingProject] = useState(false);
  const [creatingSprint, setCreatingSprint] = useState(false);
  const [addingTask, setAddingTask] = useState(false);

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
          <p className="mt-1 text-xs text-slate-500">
            {p.memberCount} {p.memberCount === 1 ? "member" : "members"}
          </p>
        </div>
        {p.canManage && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} onClick={() => setEditingProject(true)}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit project
            </button>
            <button type="button" className={secondaryButton} onClick={() => setCreatingSprint(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New sprint
            </button>
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
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
              <optgroup label="Sprints">
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

      {selectedSprint && <SprintHeader sprint={selectedSprint} canManage={p.canManage} />}
      {viewParam && viewParam !== "all" && viewParam !== "unscheduled" && sprints.isSuccess && !selectedSprint && (
        <ErrorNote>That sprint was not found in this project.</ErrorNote>
      )}

      {completed ? (
        sprintDetail.isLoading ? (
          <Loading label="Loading sprint record…" />
        ) : sprintDetail.data?.completionSnapshot ? (
          <SnapshotList snapshot={sprintDetail.data.completionSnapshot} onOpen={(id) => setParam("task", id)} />
        ) : (
          <ErrorNote>{errorMessage(sprintDetail.error, "The sprint record could not be loaded.")}</ErrorNote>
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
