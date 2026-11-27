"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/patterns/LoadingState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { EmptyState } from "@/components/patterns/EmptyState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useMyAttendance, usePeopleSearch, useTeam, useTeamAttendance, useWorkContext, useWorkPermissions } from "@/hooks/work/useWork";
import { useAuthStore } from "@/store/auth.store";
import { RANGE_PRESET_LABELS, toDateRange, type RangePreset } from "@/lib/work/format";
import type { AttendanceRecord, EmployeeSummary, TeamAttendanceRecord } from "@/services/work.service";
import { AttendanceTable } from "@/components/work/attendance/AttendanceTable";
import { CorrectTimeDialog } from "@/components/work/attendance/CorrectTimeDialog";
import { RecordDetailsDialog } from "@/components/work/attendance/RecordDetailsDialog";
import { WeekStrip } from "@/components/work/attendance/WeekStrip";
import { errorMessage } from "@/components/work/ui";

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
        <span className="block text-sm font-medium text-foreground">Employee</span>
        <span className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-info bg-info-subtle px-3 text-sm text-info">
          {value.name}
          <Button
            variant="ghost"
            type="button"
            className="rounded p-0.5 hover:bg-info-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
            aria-label={`Clear employee filter (${value.name})`}
            onClick={() => {
              onChange(null);
              setSearch("");
            }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </span>
      </div>
    );
  }

  return (
    <div className="relative space-y-1.5">
      <label htmlFor="employee-filter" className="block text-sm font-medium text-foreground">
        Employee
      </label>
      <Input
        id="employee-filter"
        type="search"
        autoComplete="off"
        placeholder="All employees"
        className="sm:w-56"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {term.length >= 2 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card shadow-lg sm:w-56" aria-live="polite">
          {people.isLoading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          ) : (people.data ?? []).length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matching employees.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto py-1">
              {people.data!.map((p) => (
                <li key={p.id}>
                  <Button
                    variant="ghost"
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => onChange(p)}
                  >
                    {p.name}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// A reporting manager without attendance-manager rights picks from their direct reports only.
function ReportFilter({ value, onChange }: { value: EmployeeSummary | null; onChange: (e: EmployeeSummary | null) => void }) {
  const team = useTeam();
  return (
    <div className="space-y-1.5">
      <label htmlFor="report-filter" className="block text-sm font-medium text-foreground">
        Employee
      </label>
      <NativeSelect
        id="report-filter"
        className="sm:w-56"
        value={value?.id ?? ""}
        onChange={(e) => {
          const member = team.data?.find((m) => m.id === e.target.value);
          onChange(member ? { id: member.id, name: member.name } : null);
        }}
      >
        <option value="">All my direct reports</option>
        {(team.data ?? []).map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export default function AttendancePage() {
  const { canManageAttendance } = useWorkPermissions();
  const { data: context } = useWorkContext();
  const hasReports = (context?.directReportCount ?? 0) > 0;
  const canSeeTeam = canManageAttendance || hasReports;
  const timeZone = useAuthStore((s) => s.user?.organizationTimeZone) || "UTC";
  const [scope, setScope] = useState<"me" | "team">("me");
  const [preset, setPreset] = useState<RangePreset>("month");
  const [range, setRange] = useState(() => toDateRange("month", timeZone));
  const [page, setPage] = useState(1);
  const [employee, setEmployee] = useState<EmployeeSummary | null>(null);
  const [details, setDetails] = useState<(AttendanceRecord & { employee?: EmployeeSummary }) | null>(null);
  const [correcting, setCorrecting] = useState<TeamAttendanceRecord | null>(null);

  const team = scope === "team" && canSeeTeam;
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

  function choosePreset(next: RangePreset) {
    setPreset(next);
    if (next !== "custom") setRange(toDateRange(next, timeZone));
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Attendance" description="Clock-in and clock-out history. Location is recorded only at clock-in." />

      {canSeeTeam && (
        <div role="group" aria-label="Whose attendance" className="inline-flex rounded-lg border border-border bg-card p-1">
          {(["me", "team"] as const).map((s) => (
            <Button
              variant="ghost"
              key={s}
              type="button"
              aria-pressed={scope === s}
              onClick={() => {
                setScope(s);
                setPage(1);
              }}
              className={`min-h-9 rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info ${
                scope === s ? "bg-info text-info-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {s === "me" ? "My attendance" : canManageAttendance ? "Team attendance" : "My team"}
            </Button>
          ))}
        </div>
      )}

      {!team ? <WeekStrip /> : employee && <WeekStrip key={employee.id} employeeId={employee.id} title={`${employee.name}'s week`} />}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="range-preset" className="block text-sm font-medium text-foreground">
            Period
          </label>
          <NativeSelect id="range-preset" className="sm:w-44" value={preset} onChange={(e) => choosePreset(e.target.value as RangePreset)}>
            {(Object.keys(RANGE_PRESET_LABELS) as RangePreset[]).map((p) => (
              <option key={p} value={p}>
                {RANGE_PRESET_LABELS[p]}
              </option>
            ))}
          </NativeSelect>
        </div>
        {preset === "custom" && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="range-from" className="block text-sm font-medium text-foreground">
                From
              </label>
              <Input id="range-from" type="date" value={range.from} max={range.to || undefined} onChange={(e) => updateRange("from", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="range-to" className="block text-sm font-medium text-foreground">
                To
              </label>
              <Input id="range-to" type="date" value={range.to} min={range.from || undefined} onChange={(e) => updateRange("to", e.target.value)} />
            </div>
          </>
        )}
        {team &&
          (canManageAttendance ? (
            <EmployeeFilter
              value={employee}
              onChange={(e) => {
                setEmployee(e);
                setPage(1);
              }}
            />
          ) : (
            <ReportFilter
              value={employee}
              onChange={(e) => {
                setEmployee(e);
                setPage(1);
              }}
            />
          ))}
      </div>

      <Card className="block overflow-hidden">
        {!rangeValid ? (
          <div className="p-5">
            <div role="alert" className="rounded-lg bg-danger-subtle p-3 text-danger">Choose a start date that is on or before the end date.</div>
          </div>
        ) : active.isLoading ? (
          <LoadingState label="Loading attendance…" />
        ) : active.isError ? (
          <ErrorState
            title="Unable to load attendance"
            description={errorMessage(active.error, "Please try again.")}
            onRetry={() => void active.refetch()}
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="No attendance records in this period" />
        ) : (
          <AttendanceTable
            records={data.items}
            showEmployee={team}
            onDetails={setDetails}
            onCorrect={team && canManageAttendance ? setCorrecting : undefined}
          />
        )}
      </Card>

      {data && pages > 1 && (
        <nav aria-label="Attendance pages" className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {pages} · {data.total} records
          </span>
          <span className="flex gap-2">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button type="button" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </span>
        </nav>
      )}

      {details && <RecordDetailsDialog record={details} employeeName={details.employee?.name} onClose={() => setDetails(null)} />}
      {correcting && <CorrectTimeDialog record={correcting} onClose={() => setCorrecting(null)} />}
    </div>
  );
}
