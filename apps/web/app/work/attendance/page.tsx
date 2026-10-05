"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useMyAttendance, usePeopleSearch, useTeamAttendance, useWorkPermissions } from "@/hooks/work/useWork";
import { useAuthStore } from "@/store/auth.store";
import { monthRangeIn } from "@/lib/work/format";
import type { AttendanceRecord, EmployeeSummary, TeamAttendanceRecord } from "@/services/work.service";
import { AttendanceTable } from "@/components/work/attendance/AttendanceTable";
import { CorrectTimeDialog } from "@/components/work/attendance/CorrectTimeDialog";
import { RecordDetailsDialog } from "@/components/work/attendance/RecordDetailsDialog";
import { EmptyState, ErrorNote, Loading, Surface, errorMessage, inputClass, secondaryButton } from "@/components/work/ui";

const PAGE_SIZE = 50;

function EmployeeFilter({ value, onChange }: { value: EmployeeSummary | null; onChange: (e: EmployeeSummary | null) => void }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setTerm(search.trim()), 250);
    return () => window.clearTimeout(id);
  }, [search]);
  const people = usePeopleSearch(term, !value && term.length >= 2);

  if (value) {
    return (
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-slate-700">Employee</span>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm text-blue-800">
          {value.name}
          <button
            type="button"
            className="rounded p-0.5 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={`Clear employee filter (${value.name})`}
            onClick={() => {
              onChange(null);
              setSearch("");
            }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="relative space-y-1.5">
      <label htmlFor="employee-filter" className="block text-sm font-medium text-slate-700">
        Employee
      </label>
      <input
        id="employee-filter"
        type="search"
        autoComplete="off"
        placeholder="All employees"
        className={`${inputClass} sm:w-56`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {term.length >= 2 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg sm:w-56" aria-live="polite">
          {people.isLoading ? (
            <p className="px-3 py-2 text-sm text-slate-500">Searching…</p>
          ) : (people.data ?? []).length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">No matching employees.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto py-1">
              {people.data!.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-50 focus-visible:bg-slate-100 focus-visible:outline-none"
                    onClick={() => onChange(p)}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function AttendancePage() {
  const { canManageAttendance } = useWorkPermissions();
  const timeZone = useAuthStore((s) => s.user?.organizationTimeZone) || "UTC";
  const [scope, setScope] = useState<"me" | "team">("me");
  const [range, setRange] = useState(() => monthRangeIn(timeZone));
  const [page, setPage] = useState(1);
  const [employee, setEmployee] = useState<EmployeeSummary | null>(null);
  const [details, setDetails] = useState<(AttendanceRecord & { employee?: EmployeeSummary }) | null>(null);
  const [correcting, setCorrecting] = useState<TeamAttendanceRecord | null>(null);

  const team = scope === "team" && canManageAttendance;
  const rangeValid = !!range.from && !!range.to && range.from <= range.to;
  const query = { ...range, page, pageSize: PAGE_SIZE };
  const mine = useMyAttendance(query, !team && rangeValid);
  const teamQuery = useTeamAttendance({ ...query, employeeId: employee?.id }, team && rangeValid);
  const active = team ? teamQuery : mine;
  const data = active.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function updateRange(key: "from" | "to", value: string) {
    setRange((r) => ({ ...r, [key]: value }));
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
        <p className="mt-1 text-sm text-slate-500">Clock-in and clock-out history. Location is recorded only at clock-in.</p>
      </header>

      {canManageAttendance && (
        <div role="group" aria-label="Whose attendance" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          {(["me", "team"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              onClick={() => {
                setScope(s);
                setPage(1);
              }}
              className={`min-h-9 rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                scope === s ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s === "me" ? "My attendance" : "Team attendance"}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="range-from" className="block text-sm font-medium text-slate-700">
            From
          </label>
          <input id="range-from" type="date" className={inputClass} value={range.from} max={range.to || undefined} onChange={(e) => updateRange("from", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="range-to" className="block text-sm font-medium text-slate-700">
            To
          </label>
          <input id="range-to" type="date" className={inputClass} value={range.to} min={range.from || undefined} onChange={(e) => updateRange("to", e.target.value)} />
        </div>
        {team && (
          <EmployeeFilter
            value={employee}
            onChange={(e) => {
              setEmployee(e);
              setPage(1);
            }}
          />
        )}
      </div>

      <Surface className="overflow-hidden">
        {!rangeValid ? (
          <div className="p-5">
            <ErrorNote>Choose a start date that is on or before the end date.</ErrorNote>
          </div>
        ) : active.isLoading ? (
          <Loading label="Loading attendance…" />
        ) : active.isError ? (
          <div className="space-y-3 p-5">
            <ErrorNote>We couldn&apos;t load attendance. {errorMessage(active.error, "")}</ErrorNote>
            <button type="button" className={secondaryButton} onClick={() => active.refetch()}>
              Try again
            </button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="No attendance records in this period" />
        ) : (
          <AttendanceTable
            records={data.items}
            showEmployee={team}
            onDetails={setDetails}
            onCorrect={team ? setCorrecting : undefined}
          />
        )}
      </Surface>

      {data && pages > 1 && (
        <nav aria-label="Attendance pages" className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {page} of {pages} · {data.total} records
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

      {details && <RecordDetailsDialog record={details} employeeName={details.employee?.name} onClose={() => setDetails(null)} />}
      {correcting && <CorrectTimeDialog record={correcting} onClose={() => setCorrecting(null)} />}
    </div>
  );
}
