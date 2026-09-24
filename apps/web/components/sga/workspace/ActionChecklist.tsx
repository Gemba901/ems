"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Check, Loader2, UserRound } from "lucide-react";
import { Sga, SgaActionItem, SgaActionStatus, SgaService } from "@/services/sga.service";
import { formatDate } from "@/components/sga/sga-ui";
import { isActionOverdue } from "./stages";

const STATUS_OPTIONS: { value: SgaActionStatus; label: string; active: string }[] = [
  { value: "OPEN", label: "To do", active: "bg-slate-700 text-white" },
  { value: "IN_PROGRESS", label: "Doing", active: "bg-amber-500 text-white" },
  { value: "DONE", label: "Done", active: "bg-emerald-600 text-white" },
];

type Filter = "all" | "mine" | "overdue";

export default function ActionChecklist({
  sga,
  meId,
  teamCanEdit,
  statusOpen,
  token,
  onSaved,
  onPlanActions,
}: {
  sga: Sga;
  meId: string;
  // Team members can update any action; the person responsible can always update their own.
  teamCanEdit: boolean;
  statusOpen: boolean;
  token: string;
  onSaved: (updated: Sga) => void;
  onPlanActions?: () => void;
}) {
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: SgaActionStatus }) =>
      SgaService.updateActionItemStatus(sga.id, itemId, status, token),
    onMutate: ({ itemId }) => {
      setError(null);
      setPendingId(itemId);
    },
    onSuccess: (updated) => onSaved(updated),
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Could not update the action"),
    onSettled: () => setPendingId(null),
  });

  const canUpdate = (item: SgaActionItem) => statusOpen && (teamCanEdit || item.responsiblePersonId === meId);

  const items = sga.actionItems;
  const overdue = items.filter((a) => isActionOverdue(a, now));
  const mine = items.filter((a) => a.responsiblePersonId === meId);
  const done = items.filter((a) => a.status === "DONE").length;
  const shown = filter === "mine" ? mine : filter === "overdue" ? overdue : items;

  // Overdue first, then by due date, finished actions last.
  const sorted = [...shown].sort((a, b) => {
    const rank = (x: SgaActionItem) => (x.status === "DONE" ? 2 : isActionOverdue(x, now) ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
  });

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
        <p className="text-sm font-semibold text-slate-700">No actions yet</p>
        <p className="mt-1 text-sm text-slate-500">Actions are agreed in stage 4, Plan &amp; Implement. They show up here as a checklist.</p>
        {onPlanActions && teamCanEdit && statusOpen && (
          <button
            type="button"
            onClick={onPlanActions}
            className="mt-4 inline-flex h-9 items-center rounded-full bg-[#52618a] px-4 text-sm font-medium text-white hover:bg-[#445174]"
          >
            Plan actions
          </button>
        )}
      </div>
    );
  }

  const percent = Math.round((done / items.length) * 100);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-slate-800">
            {done} of {items.length} actions done
          </span>
          {overdue.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" /> {overdue.length} overdue
            </span>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div role="group" aria-label="Filter actions" className="flex flex-wrap gap-2">
        {(
          [
            ["all", `All (${items.length})`],
            ["mine", `Mine (${mine.length})`],
            ["overdue", `Overdue (${overdue.length})`],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
              filter === value ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      {sorted.length === 0 ? (
        <p className="px-1 text-sm text-slate-500">{filter === "mine" ? "No actions are assigned to you." : "Nothing is overdue."}</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((item) => {
            const late = isActionOverdue(item, now);
            const editable = canUpdate(item);
            const busy = pendingId === item.id;
            const isDone = item.status === "DONE";
            return (
              <li
                key={item.id}
                className={`rounded-xl border bg-white px-4 py-3 ${late ? "border-red-200" : "border-slate-200"}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    disabled={!editable || busy}
                    onClick={() => mutation.mutate({ itemId: item.id, status: isDone ? "OPEN" : "DONE" })}
                    aria-label={isDone ? `Mark "${item.improvementAction}" as not done` : `Mark "${item.improvementAction}" as done`}
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-default ${
                      isDone ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 text-transparent hover:border-emerald-500"
                    }`}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : isDone ? <Check className="h-3.5 w-3.5" /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${isDone ? "text-slate-400 line-through" : "text-slate-800"}`}>{item.improvementAction}</p>
                    <p className="mt-0.5 text-xs text-slate-500">Cause: {item.confirmedRootCause}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <UserRound className="h-3.5 w-3.5" />
                        {item.responsiblePerson
                          ? `${item.responsiblePerson.firstName} ${item.responsiblePerson.lastName}${item.responsiblePersonId === meId ? " (you)" : ""}`
                          : "Unassigned"}
                      </span>
                      {item.dueDate && (
                        <span className={`inline-flex items-center gap-1 ${late ? "font-semibold text-red-600" : "text-slate-500"}`}>
                          <CalendarDays className="h-3.5 w-3.5" />
                          {late ? `Overdue since ${formatDate(item.dueDate)}` : `Due ${formatDate(item.dueDate)}`}
                        </span>
                      )}
                      {isDone && item.completedAt && <span className="text-emerald-600">Done {formatDate(item.completedAt)}</span>}
                    </div>
                  </div>
                  {editable ? (
                    <div role="group" aria-label="Action status" className="hidden shrink-0 overflow-hidden rounded-lg border border-slate-200 sm:flex">
                      {STATUS_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={busy}
                          aria-pressed={item.status === option.value}
                          onClick={() => item.status !== option.value && mutation.mutate({ itemId: item.id, status: option.value })}
                          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                            item.status === option.value ? option.active : "bg-white text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {STATUS_OPTIONS.find((o) => o.value === item.status)?.label}
                    </span>
                  )}
                </div>
                {editable && (
                  // On phones the three-way switch sits under the text so it stays thumb-sized.
                  <div role="group" aria-label="Action status" className="mt-3 grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200 sm:hidden">
                    {STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={busy}
                        aria-pressed={item.status === option.value}
                        onClick={() => item.status !== option.value && mutation.mutate({ itemId: item.id, status: option.value })}
                        className={`py-2 text-xs font-medium ${item.status === option.value ? option.active : "bg-white text-slate-500"}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
