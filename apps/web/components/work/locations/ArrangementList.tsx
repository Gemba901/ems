"use client";

import { useEffect, useState } from "react";
import { House } from "lucide-react";
import { useArrangements, useSetArrangement } from "@/hooks/work/useWork";
import { formatDay } from "@/lib/work/location";
import { ARRANGEMENT_LABELS, type EmployeeArrangement, type WorkArrangement } from "@/services/work.service";
import { EmptyState, ErrorNote, HelpTip, Loading, Surface, errorMessage, inputClass, secondaryButton } from "@/components/work/ui";

const ARRANGEMENTS = Object.keys(ARRANGEMENT_LABELS) as WorkArrangement[];

function ArrangementRow({ row }: { row: EmployeeArrangement }) {
  const set = useSetArrangement();
  const [confirmClear, setConfirmClear] = useState(false);
  const usesHome = row.arrangement !== "ON_SITE";
  const selectId = `arrangement-${row.employee.id}`;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{row.employee.name}</p>
        <p className="text-xs text-slate-500">{[row.jobTitle, row.department?.name].filter(Boolean).join(" · ") || "—"}</p>
        {usesHome && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
            <House className="h-3 w-3" aria-hidden="true" />
            {row.hasHome && row.homeApprovedAt ? `Home approved ${formatDay(row.homeApprovedAt)}` : "No approved home yet"}
            {row.pendingRequest && <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-800">Request waiting</span>}
          </p>
        )}
        {set.isError && <p className="mt-1 text-xs font-medium text-red-600">{errorMessage(set.error)}</p>}
      </div>
      <div className="flex items-center gap-2">
        {row.hasHome &&
          (confirmClear ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                disabled={set.isPending}
                onClick={() => set.mutate({ employeeId: row.employee.id, arrangement: row.arrangement, clearHome: true }, { onSuccess: () => setConfirmClear(false) })}
              >
                Forget home
              </button>
              <button type="button" className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setConfirmClear(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setConfirmClear(true)}>
              Forget home<span className="sr-only"> for {row.employee.name}</span>
            </button>
          ))}
        <label htmlFor={selectId} className="sr-only">
          Work arrangement for {row.employee.name}
        </label>
        <select
          id={selectId}
          className={`${inputClass} w-32`}
          value={row.arrangement}
          disabled={set.isPending}
          onChange={(e) => set.mutate({ employeeId: row.employee.id, arrangement: e.target.value as WorkArrangement })}
        >
          {ARRANGEMENTS.map((a) => (
            <option key={a} value={a}>
              {ARRANGEMENT_LABELS[a]}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

/** Who works where. Settings roles only. */
export function ArrangementList() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<WorkArrangement | "">("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const id = window.setTimeout(() => setTerm(search.trim()), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  const list = useArrangements({ search: term || undefined, arrangement: filter || undefined, page });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Surface>
      <div className="space-y-3 border-b border-slate-100 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Work arrangements</h2>
          <HelpTip label="About work arrangements">
            On-site people are checked against company locations, remote people against their approved home, and hybrid people
            against either. Everyone starts on-site.
          </HelpTip>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            aria-label="Search employees"
            placeholder="Search by name"
            className={`${inputClass} sm:w-64`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="Filter by arrangement"
            className={`${inputClass} w-40`}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as WorkArrangement | "");
              setPage(1);
            }}
          >
            <option value="">All arrangements</option>
            {ARRANGEMENTS.map((a) => (
              <option key={a} value={a}>
                {ARRANGEMENT_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <div className="p-4">
          <ErrorNote>{errorMessage(list.error, "Could not load work arrangements.")}</ErrorNote>
        </div>
      ) : data!.items.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No employees found" />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data!.items.map((row) => (
            <ArrangementRow key={row.employee.id} row={row} />
          ))}
        </ul>
      )}
      {data && pages > 1 && (
        <nav aria-label="Arrangement pages" className="flex items-center justify-between border-t border-slate-100 p-4 text-sm text-slate-600">
          <span>
            Page {page} of {pages} · {data.total} employees
          </span>
          <span className="flex gap-2">
            <button type="button" className={secondaryButton} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button type="button" className={secondaryButton} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </span>
        </nav>
      )}
    </Surface>
  );
}
