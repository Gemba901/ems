"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useCreateSprint, useUpdateSprint, useUpdateSprintTeam } from "@/hooks/work/useWork";
import type { ProjectMember, Sprint } from "@/services/work.service";
import { ErrorNote, Field, SPRINT_TERM, SprintHelp, WorkDialog, errorMessage, inputClass, primaryButton, secondaryButton } from "@/components/work/ui";

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * Creates a sprint / phase, or edits one. A planned one can change everything; once started the
 * backend locks the dates, so only its lead and members can change. Mount only while open.
 */
export function SprintFormDialog({
  open,
  onOpenChange,
  projectId,
  projectMembers,
  sprint,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectMembers: ProjectMember[];
  sprint?: Sprint;
  onSaved?: (sprint: Sprint) => void;
}) {
  const create = useCreateSprint(projectId);
  const update = useUpdateSprint();
  const updateTeam = useUpdateSprintTeam();
  const teamOnly = sprint?.status === "ACTIVE";
  const [leadId, setLeadId] = useState(sprint?.lead?.id ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(sprint?.members.map((m) => m.id) ?? []);
  const [name, setName] = useState(sprint?.name ?? "");
  const [goal, setGoal] = useState(sprint?.goal ?? "");
  const [startDate, setStartDate] = useState(sprint?.startDate ?? "");
  const [endDate, setEndDate] = useState(sprint?.endDate ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending || updateTeam.isPending;
  const people = [...projectMembers].sort((a, b) => a.employee.name.localeCompare(b.employee.name));

  // The lead is always part of the team; the backend adds them too.
  function team(): string[] {
    return leadId && !memberIds.includes(leadId) ? [...memberIds, leadId] : memberIds;
  }

  function toggleMember(id: string) {
    setMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!teamOnly && !name.trim()) next.name = "Enter a name.";
    if (!teamOnly && !startDate) next.startDate = "Choose a start date.";
    if (!teamOnly && !endDate) next.endDate = "Choose an end date.";
    if (startDate && endDate && endDate < startDate) next.endDate = "The end date cannot be before the start date.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setServerError(null);
    const data = { name: name.trim(), goal: goal.trim() || null, startDate, endDate };
    const members = team();
    try {
      let saved: Sprint;
      if (!sprint) {
        saved = await create.mutateAsync({ ...data, goal: data.goal ?? undefined, leadId: leadId || undefined, memberIds: members });
      } else {
        saved = teamOnly ? sprint : await update.mutateAsync({ sprintId: sprint.id, data });
        const teamChanged = leadId !== (sprint.lead?.id ?? "") || !sameIds(members, sprint.members.map((m) => m.id));
        if (teamChanged) saved = await updateTeam.mutateAsync({ sprintId: sprint.id, data: { leadId: leadId || null, memberIds: members } });
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      setServerError(errorMessage(err));
    }
  }

  return (
    <WorkDialog
      open={open}
      onOpenChange={onOpenChange}
      title={sprint ? (teamOnly ? `${sprint.name}: team` : `Edit ${SPRINT_TERM.toLowerCase()}`) : `New ${SPRINT_TERM.toLowerCase()}`}
      description={
        <span className="inline-flex items-center gap-1">
          {teamOnly ? "Dates are fixed once it has started; the team can still change." : "A dated block of work within this project."}
          <SprintHelp />
        </span>
      }
      footer={
        <>
          <button type="button" className={secondaryButton} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" form="sprint-form" className={primaryButton} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {sprint ? "Save changes" : "Create"}
          </button>
        </>
      }
    >
      <form id="sprint-form" className="space-y-4" onSubmit={onSubmit} noValidate>
        {!teamOnly && (
          <>
            <Field label="Name" htmlFor="sprint-name" error={errors.name}>
              <input
                id="sprint-name"
                className={inputClass}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "sprint-name-error" : undefined}
              />
            </Field>
            <Field label="Goal (optional)" htmlFor="sprint-goal" hint={`${goal.length}/500`}>
              <textarea
                id="sprint-goal"
                className={inputClass}
                rows={2}
                maxLength={500}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                aria-describedby="sprint-goal-hint"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" htmlFor="sprint-start" error={errors.startDate}>
                <input
                  id="sprint-start"
                  type="date"
                  className={inputClass}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  aria-invalid={!!errors.startDate}
                  aria-describedby={errors.startDate ? "sprint-start-error" : undefined}
                />
              </Field>
              <Field label="End date" htmlFor="sprint-end" error={errors.endDate}>
                <input
                  id="sprint-end"
                  type="date"
                  className={inputClass}
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  aria-invalid={!!errors.endDate}
                  aria-describedby={errors.endDate ? "sprint-end-error" : undefined}
                />
              </Field>
            </div>
          </>
        )}
        <Field label="Lead (optional)" htmlFor="sprint-lead" hint="Only project members can lead or join.">
          <select id="sprint-lead" className={inputClass} value={leadId} onChange={(e) => setLeadId(e.target.value)} aria-describedby="sprint-lead-hint">
            <option value="">No lead</option>
            {people.map((m) => (
              <option key={m.employee.id} value={m.employee.id}>
                {m.employee.name}
              </option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Team ({team().length})</legend>
          {people.length === 0 ? (
            <p className="text-sm text-slate-500">Add people to the project first.</p>
          ) : (
            <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {people.map((m) => {
                const isLead = m.employee.id === leadId;
                return (
                  <li key={m.employee.id}>
                    <label className="flex min-h-10 items-center gap-2 px-3 py-1.5 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={isLead || memberIds.includes(m.employee.id)}
                        disabled={isLead}
                        onChange={() => toggleMember(m.employee.id)}
                      />
                      <span className="truncate">{m.employee.name}</span>
                      {isLead && <span className="text-xs text-slate-500">Lead</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
        {serverError && <ErrorNote>{serverError}</ErrorNote>}
      </form>
    </WorkDialog>
  );
}
