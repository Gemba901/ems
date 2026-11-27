"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useCreateProject, usePeopleSearch, useUpdateProject } from "@/hooks/work/useWork";
import { WorkApiError, type EmployeeSummary, type ProjectDetail, type WorkProjectRole } from "@/services/work.service";
import { ErrorNote, Field, WorkDialog, errorMessage } from "@/components/work/ui";

type MemberRow = { employee: EmployeeSummary; role: WorkProjectRole };

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function MemberPicker({ members, onChange }: { members: MemberRow[]; onChange: (members: MemberRow[]) => void }) {
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const people = usePeopleSearch(term, term.length >= 2);
  const chosen = new Set(members.map((m) => m.employee.id));
  const results = (people.data ?? []).filter((p) => !chosen.has(p.id));

  return (
    <div className="space-y-3">
      <Field label="Add members" htmlFor="member-search" hint="Type at least 2 letters of a name.">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="member-search"
            type="search"
            autoComplete="off"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-describedby="member-search-hint"
          />
        </div>
      </Field>
      {term.length >= 2 && (
        <div className="rounded-lg border border-border" aria-live="polite">
          {people.isLoading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          ) : people.isError ? (
            <p className="px-3 py-2 text-sm text-danger">{errorMessage(people.error)}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matching employees.</p>
          ) : (
            <ul className="max-h-40 divide-y divide-border overflow-y-auto">
              {results.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="truncate text-sm text-foreground">{p.name}</span>
                  <Button
                    variant="ghost"
                    type="button"
                    className="rounded px-2 py-1 text-sm font-medium text-info hover:bg-info-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
                    onClick={() => onChange([...members, { employee: p, role: "MEMBER" }])}
                    aria-label={`Add ${p.name}`}
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm font-medium text-foreground">Members ({members.length})</p>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other members yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {members.map((m, i) => (
              <li key={m.employee.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="min-w-0 truncate text-sm text-foreground">{m.employee.name}</span>
                <div className="flex items-center gap-1">
                  <label htmlFor={`member-role-${m.employee.id}`} className="sr-only">
                    Role of {m.employee.name}
                  </label>
                  <NativeSelect
                    id={`member-role-${m.employee.id}`}
                    className="min-h-8 rounded-lg border border-border bg-card px-2 text-sm"
                    value={m.role}
                    onChange={(e) => {
                      const next = [...members];
                      next[i] = { ...m, role: e.target.value as WorkProjectRole };
                      onChange(next);
                    }}
                  >
                    <option value="MEMBER">Member</option>
                    <option value="MANAGER">Manager</option>
                  </NativeSelect>
                  <Button
                    variant="ghost"
                    type="button"
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
                    aria-label={`Remove ${m.employee.name}`}
                    onClick={() => onChange(members.filter((x) => x.employee.id !== m.employee.id))}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Creates a project, or edits one (with its full member list) when `project` is given. Mount it only while open so the form starts fresh. */
export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectDetail;
  onSaved?: (project: ProjectDetail) => void;
}) {
  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [targetDate, setTargetDate] = useState(project?.targetDate ?? "");
  const [members, setMembers] = useState<MemberRow[]>(
    project?.members.map((m) => ({ employee: m.employee, role: m.role })) ?? [],
  );
  const [error, setError] = useState<{ message: string; tasks?: { id: string; title: string }[] } | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Enter a project name.");
      return;
    }
    setNameError(null);
    setError(null);
    const memberInput = members.map((m) => ({ employeeId: m.employee.id, role: m.role }));
    try {
      const saved = project
        ? await update.mutateAsync({ name: trimmed, description: description.trim() || null, targetDate: targetDate || null, members: memberInput })
        : await create.mutateAsync({ name: trimmed, description: description.trim() || undefined, targetDate: targetDate || undefined, members: memberInput });
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      const tasks = err instanceof WorkApiError && Array.isArray(err.details.tasks) ? (err.details.tasks as { id: string; title: string }[]) : undefined;
      setError({ message: errorMessage(err), tasks });
    }
  }

  return (
    <WorkDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={project ? "Edit project" : "New project"}
      description={project ? "Change the name, description, target date or members." : "You will be added as a project manager."}
      footer={
        <>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" type="submit" form="project-form"  disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {project ? "Save changes" : "Create project"}
          </Button>
        </>
      }
    >
      <form id="project-form" className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field label="Name" htmlFor="project-name" error={nameError}>
          <Input
            id="project-name"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? "project-name-error" : undefined}
          />
        </Field>
        <Field label="Description (optional)" htmlFor="project-description">
          <Textarea
            id="project-description"
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Target date (optional)" htmlFor="project-target" hint="Used to report whether the project finished on time.">
          <Input
            id="project-target"
            type="date"
            className="sm:w-56"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            aria-describedby="project-target-hint"
          />
        </Field>
        <MemberPicker members={members} onChange={setMembers} />
        {error && (
          <ErrorNote>
            {error.message}
            {error.tasks && error.tasks.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {error.tasks.map((t) => (
                  <li key={t.id}>{t.title}</li>
                ))}
              </ul>
            )}
          </ErrorNote>
        )}
      </form>
    </WorkDialog>
  );
}
