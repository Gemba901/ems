"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useOrgModules } from "@/hooks/useOrgModules";
import { EmployeeService } from "@/services/employee.service";
import { EmsService, EMPLOYMENT_STATUS_LABELS } from "@/services/ems.service";
import { LeaveService, LEAVE_TYPE_LABELS } from "@/services/leave.service";
import { ArrowLeft, CalendarDays } from "lucide-react";

function fmtShort(d: string) {
    return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function initials(first: string, last: string) {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}
// Bar color reflects health (how much is left), independent of how much
// of the bar is filled (which tracks days used).
function healthColor(remaining: number, allocated: number) {
    if (allocated === 0) return "bg-slate-300";
    const pct = remaining / allocated;
    if (pct >= 0.5) return "bg-emerald-500";
    if (pct >= 0.25) return "bg-amber-400";
    return "bg-red-500";
}

// last 12 calendar months ending this month, oldest first
function last12Months() {
    const months: { year: number; month: number; label: string }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString("en-GB", { month: "short" }) });
    }
    return months;
}

function LeaveProfile() {
    const params = useParams();
    const employeeId = params.id as string;
    const accessToken = useAuthStore((s) => s.accessToken)!;
    const viewer = useAuthStore((s) => s.user);
    const { hasModule } = useOrgModules();

    const canUseEms = !!viewer?.roleLevel && [Role.SUPER_ADMIN, Role.ADMIN, Role.HR].includes(viewer.roleLevel);

    const { data: employee, isLoading: employeeLoading } = useQuery({
        queryKey: ["employee", employeeId],
        queryFn: () => EmployeeService.getById(employeeId, accessToken),
        enabled: !!accessToken && !!employeeId,
    });

    // Best-effort enrichment (job title, employment status) — silently
    // unavailable for HOD viewers or orgs without the EMS module.
    const { data: emsProfile } = useQuery({
        queryKey: ["ems-employee", employeeId],
        queryFn: async () => {
            try {
                return await EmsService.getEmployee(employeeId, accessToken);
            } catch {
                return null;
            }
        },
        enabled: !!accessToken && !!employeeId && canUseEms && hasModule("EMS"),
    });

    const { data: balances = [] } = useQuery({
        queryKey: ["leave-balance", employeeId],
        queryFn: () => LeaveService.getEmployeeBalance(accessToken, employeeId),
        enabled: !!accessToken && !!employeeId,
    });

    const { data: requests = [], isLoading: requestsLoading } = useQuery({
        queryKey: ["leave-requests", "employee", employeeId],
        queryFn: () => LeaveService.listRequests(accessToken, { employeeId }),
        enabled: !!accessToken && !!employeeId,
    });

    if (employeeLoading) {
        return <div className="p-6 text-sm text-slate-400">Loading…</div>;
    }
    if (!employee) {
        return <div className="p-6 text-sm text-slate-400">Employee not found.</div>;
    }

    const today = new Date();
    const totalRemaining = balances.reduce((s, b) => s + (b.allocated - b.used), 0);
    const takenYTD = balances.reduce((s, b) => s + b.used, 0);
    const upcoming = requests
        .filter((r) => r.status === "APPROVED" && new Date(r.startDate) > today)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const pendingDays = requests.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.days, 0);
    const nextLeave = upcoming[0];

    const months = last12Months();
    const monthTotals = months.map(({ year, month }) =>
        requests
            .filter((r) => r.status === "APPROVED")
            .filter((r) => {
                const d = new Date(r.startDate);
                return d.getFullYear() === year && d.getMonth() === month;
            })
            .reduce((s, r) => s + r.days, 0),
    );
    const maxMonthTotal = Math.max(1, ...monthTotals);

    const monthTimeline = months.map(({ year, month, label }) => {
        const match = requests
            .filter((r) => r.status !== "CANCELLED")
            .find((r) => {
                const d = new Date(r.startDate);
                return d.getFullYear() === year && d.getMonth() === month;
            });
        return { label, match };
    });

    return (
        <div className="p-6 space-y-6">
            <Link href="/leave/employees" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Employees
            </Link>

            {/* Header */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 rounded-full overflow-hidden bg-slate-800 text-white text-lg font-bold flex items-center justify-center">
                    {employee.avatarUrl ? (
                        <img src={employee.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                        initials(employee.firstName, employee.lastName)
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="text-lg font-bold text-slate-900">{employee.firstName} {employee.lastName}</h1>
                    <p className="text-sm text-slate-500">
                        {emsProfile?.employee.jobTitle && <span>{emsProfile.employee.jobTitle} &middot; </span>}
                        {employee.department?.name ?? "No department"}
                    </p>
                </div>
                {emsProfile && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                        {EMPLOYMENT_STATUS_LABELS[emsProfile.employee.employmentStatus]}
                    </span>
                )}
            </div>

            {/* Stat row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide">Total Balance</p>
                    <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{totalRemaining} Days</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide">Taken YTD</p>
                    <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{takenYTD} Days</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide">Pending</p>
                    <p className="text-xl font-bold text-amber-600 tabular-nums mt-1">{pendingDays} Days</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide">Next Leave</p>
                    <p className="text-xl font-bold text-slate-900 mt-1">{nextLeave ? fmtShort(nextLeave.startDate) : "—"}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                {/* Breakdown */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
                    <h2 className="text-sm font-semibold text-slate-900 mb-4">Leave Type Breakdown</h2>
                    {balances.length === 0 ? (
                        <p className="text-sm text-slate-400">No allocations set.</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {balances.map((b) => {
                                const remaining = b.allocated - b.used;
                                const usedPct = b.allocated > 0 ? (b.used / b.allocated) * 100 : 0;
                                return (
                                    <div key={b.id} className="rounded-lg border border-slate-100 px-3 py-2.5">
                                        <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                                            <span className="text-slate-500 truncate">{LEAVE_TYPE_LABELS[b.type] ?? b.type}</span>
                                            <span className="font-medium text-slate-700 tabular-nums shrink-0">{b.used}/{b.allocated}</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                            <div
                                                className={`h-1.5 rounded-full ${healthColor(remaining, b.allocated)}`}
                                                style={{ width: `${Math.min(Math.max(usedPct, 0), 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Upcoming leave */}
                <div className="bg-indigo-600 rounded-xl p-4 text-white">
                    <h2 className="text-sm font-semibold mb-3">Upcoming Approved Leave</h2>
                    {upcoming.length === 0 ? (
                        <p className="text-sm text-indigo-100 mb-3">No upcoming approved leave.</p>
                    ) : (
                        <div className="space-y-2 mb-3">
                            {upcoming.slice(0, 2).map((r) => (
                                <div key={r.id} className="bg-white/10 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-100 truncate">
                                            {LEAVE_TYPE_LABELS[r.type] ?? r.type}
                                        </p>
                                        <p className="text-sm font-medium">{fmtShort(r.startDate)} – {fmtShort(r.endDate)}</p>
                                    </div>
                                    <span className="text-xs text-indigo-100 shrink-0">{r.days}d</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <Link
                        href="/leave/calendar"
                        className="flex items-center justify-center gap-1.5 bg-white text-indigo-600 text-sm font-semibold py-2 rounded-xl hover:bg-indigo-50 transition-colors"
                    >
                        <CalendarDays className="h-4 w-4" /> View Calendar
                    </Link>
                </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-900 mb-5">Leave History Timeline</h2>
                <div className="flex items-end justify-between overflow-x-auto gap-2 pb-1">
                    {monthTimeline.map(({ label, match }, i) => (
                        <div key={i} className="flex flex-col items-center gap-1.5 min-w-[52px]">
                            <span
                                className={`h-2.5 w-2.5 rounded-full ${
                                    match
                                        ? match.status === "APPROVED" ? "bg-blue-500"
                                        : match.status === "PENDING" ? "bg-amber-400"
                                        : "bg-red-400"
                                        : "bg-slate-200"
                                }`}
                            />
                            <span className="text-[11px] text-slate-400">{label}</span>
                            {match && <span className="text-[10px] text-slate-500">{match.days}d</span>}
                        </div>
                    ))}
                </div>
            </div>

            {/* Trend */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-900 mb-5">Monthly Trend</h2>
                <div className="flex items-end justify-between gap-2 h-32">
                    {months.map((m, i) => {
                        const isCurrent = i === months.length - 1;
                        const heightPct = (monthTotals[i] / maxMonthTotal) * 100;
                        return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                                <div
                                    className={`w-full rounded-t ${isCurrent ? "bg-indigo-600" : "bg-slate-200"}`}
                                    style={{ height: `${Math.max(heightPct, 3)}%` }}
                                    title={`${monthTotals[i]} days`}
                                />
                                <span className="text-[10px] text-slate-400">{m.label}</span>
                            </div>
                        );
                    })}
                </div>
                <p className="text-xs text-slate-400 mt-3">Days attributed to the month a request starts in.</p>
            </div>

            {requestsLoading && <p className="text-xs text-slate-400">Loading leave history…</p>}
        </div>
    );
}

export default function LeaveEmployeeProfilePage() {
    return (
        <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD]}>
            <LeaveProfile />
        </ProtectedRoute>
    );
}
