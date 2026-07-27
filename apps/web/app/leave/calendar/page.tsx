// apps/web/app/leave/calendar/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { LeaveService, LeaveRequest, LEAVE_TYPE_LABELS } from "@/services/leave.service";
import { ChevronLeft, ChevronRight, Plane, HeartPulse, ClipboardList } from "lucide-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Left border + background per leave type — extend if you add custom types.
const LEAVE_TYPE_PILL: Record<string, string> = {
    ANNUAL:         "bg-blue-50 text-blue-700 border-l-blue-500",
    SICK:           "bg-amber-50 text-amber-700 border-l-amber-500",
    SICK_EMERGENCY: "bg-amber-50 text-amber-700 border-l-amber-500",
    UNPAID:         "bg-slate-100 text-slate-600 border-l-slate-400",
    MATERNITY:      "bg-purple-50 text-purple-700 border-l-purple-500",
    PATERNITY:      "bg-purple-50 text-purple-700 border-l-purple-500",
    PRE_ADOPTIVE:   "bg-purple-50 text-purple-700 border-l-purple-400",
    COMPASSIONATE:  "bg-rose-50 text-rose-700 border-l-rose-500",
    STUDY:          "bg-teal-50 text-teal-700 border-l-teal-500",
};
const DEFAULT_PILL = "bg-indigo-50 text-indigo-700 border-l-indigo-400";

const LEGEND_TYPES = ["ANNUAL", "SICK", "PATERNITY", "UNPAID"] as const;

function sameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function overlapsDay(day: Date, r: LeaveRequest) {
    const start = new Date(r.startDate);
    const end = new Date(r.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return day >= start && day <= end;
}

function buildGrid(viewDate: Date) {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay(); // 0=Sun
    const gridStart = new Date(year, month, 1 - startOffset);

    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
        days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
    }
    return days;
}

export default function LeaveCalendarPage() {
    const accessToken = useAuthStore((s) => s.accessToken)!;
    const [viewDate, setViewDate] = useState(() => new Date());

    const days = useMemo(() => buildGrid(viewDate), [viewDate]);
    const years = useMemo(
        () => Array.from(new Set([days[0].getFullYear(), days[days.length - 1].getFullYear()])),
        [days],
    );

    const { data: requests = [], isLoading } = useQuery({
        queryKey: ["leave-requests", "calendar", years.join("-")],
        queryFn: async () => {
            const results = await Promise.all(years.map((y) => LeaveService.listRequests(accessToken, { year: y })));
            return results.flat();
        },
        enabled: !!accessToken,
    });

    const departments = useMemo(() => {
        const map = new Map<string, string>();
        for (const r of requests) {
            if (r.employee?.department) map.set(r.employee.department.id, r.employee.department.name);
        }
        return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [requests]);

    const [deptFilter, setDeptFilter] = useState<string | null>(null);

    const visibleRequests = requests
        .filter((r) => r.status === "APPROVED" || r.status === "PENDING")
        .filter((r) => !deptFilter || r.employee?.department?.id === deptFilter);

    const eventsByDay = useMemo(() => {
        const map = new Map<string, LeaveRequest[]>();
        for (const day of days) {
            const key = day.toDateString();
            map.set(key, visibleRequests.filter((r) => overlapsDay(day, r)));
        }
        return map;
    }, [days, visibleRequests]);

    const today = new Date();
    const onLeaveToday = visibleRequests.filter((r) => r.status === "APPROVED" && overlapsDay(today, r));
    const sickToday = onLeaveToday.filter((r) => r.type === "SICK" || r.type === "SICK_EMERGENCY");
    const pendingThisMonth = visibleRequests.filter(
        (r) => r.status === "PENDING" && days.some((d) => d.getMonth() === viewDate.getMonth() && overlapsDay(d, r)),
    );
    const daysThisMonth = visibleRequests
        .filter((r) => r.status === "APPROVED")
        .reduce((sum, r) => sum + days.filter((d) => d.getMonth() === viewDate.getMonth() && overlapsDay(d, r)).length, 0);

    const monthLabel = viewDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-slate-900">Company Leave Calendar</h1>
                    <p className="text-sm text-slate-500">Viewing all departments for {monthLabel}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
                {/* Left rail */}
                <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-slate-900">{monthLabel}</span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
                                    className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
                                    className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={() => setViewDate(new Date())}
                            className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                            Jump to today
                        </button>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-semibold text-slate-900 mb-3">Filter by Department</h3>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                                <input
                                    type="radio"
                                    name="dept-filter"
                                    checked={deptFilter === null}
                                    onChange={() => setDeptFilter(null)}
                                    className="border-slate-300"
                                />
                                All Departments
                            </label>
                            {departments.map((d) => (
                                <label key={d.id} className="flex items-center gap-2 text-sm text-slate-600">
                                    <input
                                        type="radio"
                                        name="dept-filter"
                                        checked={deptFilter === d.id}
                                        onChange={() => setDeptFilter(d.id)}
                                        className="border-slate-300"
                                    />
                                    {d.name}
                                </label>
                            ))}
                        </div>
                        {departments.length === 0 && !isLoading && (
                            <p className="text-xs text-slate-400 mt-2">No departments found among visible requests.</p>
                        )}
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-semibold text-slate-900 mb-3">Leave Legend</h3>
                        <div className="space-y-2">
                            {LEGEND_TYPES.map((t) => (
                                <div key={t} className="flex items-center gap-2 text-sm text-slate-600">
                                    <span className={`h-2.5 w-2.5 rounded-full ${(LEAVE_TYPE_PILL[t] ?? DEFAULT_PILL).match(/border-l-(\S+)/)?.[0].replace("border-l-", "bg-")}`} />
                                    {LEAVE_TYPE_LABELS[t] ?? t}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Calendar grid */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-slate-200">
                        {WEEKDAYS.map((d) => (
                            <div key={d} className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide text-center">
                                {d}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {days.map((day) => {
                            const inMonth = day.getMonth() === viewDate.getMonth();
                            const isToday = sameDay(day, today);
                            const events = eventsByDay.get(day.toDateString()) ?? [];
                            const visible = events.slice(0, 2);
                            const overflow = events.length - visible.length;

                            return (
                                <div
                                    key={day.toDateString()}
                                    className={`min-h-25 border-b border-r border-slate-100 p-1.5 ${inMonth ? "bg-white" : "bg-slate-50/50"}`}
                                >
                                    <div className={`text-xs mb-1 ${isToday ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white font-semibold" : inMonth ? "text-slate-600" : "text-slate-300"}`}>
                                        {day.getDate()}
                                    </div>
                                    <div className="space-y-1">
                                        {visible.map((r) => (
                                            <div
                                                key={r.id}
                                                title={`${r.employee?.firstName} ${r.employee?.lastName} — ${LEAVE_TYPE_LABELS[r.type] ?? r.type}${r.status === "PENDING" ? " (pending)" : ""}`}
                                                className={`text-[10px] leading-tight px-1.5 py-1 rounded border-l-2 truncate ${LEAVE_TYPE_PILL[r.type] ?? DEFAULT_PILL} ${r.status === "PENDING" ? "opacity-60" : ""}`}
                                            >
                                                {r.employee?.firstName} {r.employee?.lastName?.[0]}.
                                            </div>
                                        ))}
                                        {overflow > 0 && (
                                            <div className="text-[10px] text-slate-400 px-1.5">+{overflow} more</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {isLoading && (
                        <div className="p-6 text-center text-sm text-slate-400">Loading…</div>
                    )}
                </div>
            </div>

            {/* Footer stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                        <Plane className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">On Leave Today</p>
                        <p className="text-lg font-bold text-slate-900 tabular-nums">{onLeaveToday.length}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                        <HeartPulse className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">Sick Leave Today</p>
                        <p className="text-lg font-bold text-slate-900 tabular-nums">{sickToday.length}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <ClipboardList className="h-4 w-4 text-slate-600" />
                    </div>
                    <div>
                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">Pending This Month</p>
                        <p className="text-lg font-bold text-slate-900 tabular-nums">{pendingThisMonth.length}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                        <ClipboardList className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">Leave Days This Month</p>
                        <p className="text-lg font-bold text-slate-900 tabular-nums">{daysThisMonth}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
