"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";
import { useProjects, useWorkPermissions } from "@/hooks/work/useWork";
import { useAuthStore } from "@/store/auth.store";
import { formatDateOnly, todayIn } from "@/lib/work/format";
import { ProjectFormDialog } from "@/components/work/projects/ProjectFormDialog";
import { EmptyState, ErrorNote, Loading, Surface, errorMessage, primaryButton, secondaryButton } from "@/components/work/ui";

export default function ProjectsPage() {
  const router = useRouter();
  const projects = useProjects();
  const { canCreateProjects } = useWorkPermissions();
  const [creating, setCreating] = useState(false);
  const timeZone = useAuthStore((s) => s.user?.organizationTimeZone) || "UTC";
  const today = todayIn(timeZone);
  const items = projects.data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">Projects you belong to. Open one to see its tasks and sprints / phases.</p>
        </div>
        {canCreateProjects && (
          <button type="button" className={primaryButton} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add project
          </button>
        )}
      </header>

      {projects.isLoading ? (
        <Loading label="Loading projects…" />
      ) : projects.isError ? (
        <div className="space-y-3">
          <ErrorNote>We couldn&apos;t load projects. {errorMessage(projects.error, "")}</ErrorNote>
          <button type="button" className={secondaryButton} onClick={() => projects.refetch()}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <Surface>
          <EmptyState title="No projects yet">
            {canCreateProjects ? "Add a project to start planning work with your team." : "You will see projects here once someone adds you to one."}
          </EmptyState>
        </Surface>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/work/projects/${p.id}`}
                className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="flex items-start gap-2">
                  <FolderKanban className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-slate-900">{p.name}</span>
                    {p.description && <span className="mt-1 line-clamp-2 block text-sm text-slate-500">{p.description}</span>}
                  </span>
                </span>
                <span className="mt-4 flex flex-1 flex-col justify-end gap-1 text-sm text-slate-600">
                  <span>
                    {p.status === "COMPLETED" ? (
                      <span className="font-medium text-emerald-700">Completed</span>
                    ) : p.activeSprints.length > 0 ? (
                      <>
                        Active: <span className="font-medium text-slate-800">{p.activeSprints.map((s) => s.name).join(", ")}</span>
                      </>
                    ) : (
                      <span className="text-slate-500">No active sprint / phase</span>
                    )}
                  </span>
                  {p.targetDate && p.status !== "COMPLETED" && (
                    <span className={p.targetDate < today ? "font-medium text-amber-700" : undefined}>
                      {p.targetDate < today ? "Overdue · target " : "Target "}
                      {formatDateOnly(p.targetDate, { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                  <span>
                  </span>
                  <span>
                    {p.taskCounts.done} of {p.taskCounts.total} tasks done
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <ProjectFormDialog
          open={creating}
          onOpenChange={setCreating}
          onSaved={(project) => router.push(`/work/projects/${project.id}`)}
        />
      )}
    </div>
  );
}
