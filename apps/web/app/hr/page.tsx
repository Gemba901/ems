"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import {
    Users, Building2, Search, X, ChevronRight,
    TrendingUp, UserCheck, Briefcase, ChevronLeft,
} from "lucide-react";

const PAGE_SIZE = 12;

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{value}</p>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">{label}</p>
            </div>
        </div>
    );
}

function HRContent() {
    const { user, accessToken } = useAuthStore();
    const router = useRouter();

    const [employees, setEmployees] = useState<EmployeeApiResponse[]>([]);
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [deptFilter, setDeptFilter] = useState("");
    const [page, setPage] = useState(1);

    const orgId = user?.organizationId ?? "";

    useEffect(() => {
        if (!accessToken || !orgId) return;
        Promise.all([
            EmployeeService.getByOrganization(orgId, accessToken, 1, 200),
            EmployeeService.getDepartments(orgId, accessToken),
        ])
            .then(([empRes, depts]) => {
                setEmployees(empRes.data);
                setDepartments(depts);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [accessToken, orgId]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return employees.filter((e) => {
            const matchSearch = !q || `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) || e.email.toLowerCase().includes(q);
            const matchDept = !deptFilter || e.departmentId === deptFilter;
            return matchSearch && matchDept;
        });
    }, [employees, search, deptFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const handleSearchChange = (val: string) => { setSearch(val); setPage(1); };
    const handleDeptChange = (val: string) => { setDeptFilter(val); setPage(1); };

    // Org-level stats derived from employees
    const byDept = useMemo(() => {
        const map: Record<string, number> = {};
        for (const e of employees) {
            const name = e.department?.name ?? "Unassigned";
            map[name] = (map[name] ?? 0) + 1;
        }
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [employees]);

    const withAccounts = employees.filter((e) => e.userId).length;

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">HR Dashboard</h1>
                <p className="text-sm text-slate-500 mt-1">Manage and review your organization's workforce.</p>
            </div>

            {/* KPI row */}
            {!loading && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="Total Employees"   value={employees.length}    icon={Users}      color="bg-sky-50 text-sky-600" />
                    <StatCard label="Departments"       value={departments.length}  icon={Building2}  color="bg-indigo-50 text-indigo-600" />
                    <StatCard label="With Accounts"     value={withAccounts}        icon={UserCheck}  color="bg-emerald-50 text-emerald-600" />
                    <StatCard label="Active Roles"      value={new Set(employees.map(e => e.user?.role?.name).filter(Boolean)).size}  icon={Briefcase}  color="bg-amber-50 text-amber-600" />
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Employee table */}
                <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Toolbar */}
                    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Search employees…"
                                className="w-full pl-8 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                            />
                            {search && (
                                <button onClick={() => handleSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                    <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                                </button>
                            )}
                        </div>
                        <select
                            value={deptFilter}
                            onChange={(e) => handleDeptChange(e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                        >
                            <option value="">All departments</option>
                            {departments.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                        <span className="ml-auto text-[11px] text-slate-400 whitespace-nowrap">{filtered.length} of {employees.length}</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Employee</th>
                                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Department</th>
                                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                                    <th className="px-5 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading && (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-10 text-center text-slate-400 text-sm">
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                                Loading employees…
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {!loading && filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-10 text-center text-slate-400 text-sm">No employees match your filters.</td>
                                    </tr>
                                )}
                                {!loading && paginated.map((emp) => {
                                    const roleName = emp.user?.organizations?.[0]?.role?.name ?? emp.user?.role?.name ?? "—";
                                    return (
                                        <tr
                                            key={emp.id}
                                            className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                                            onClick={() => router.push(`/operations/employees/${emp.id}`)}
                                        >
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    {emp.avatarUrl ? (
                                                        <img src={emp.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover border border-slate-200 shrink-0" />
                                                    ) : (
                                                        <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                                                            {emp.firstName[0]}{emp.lastName[0]}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="font-medium text-slate-900">{emp.firstName} {emp.lastName}</p>
                                                        <p className="text-[11px] text-slate-400">{emp.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {emp.department ? (
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{emp.department.name}</span>
                                                ) : <span className="text-slate-300 text-xs">Unassigned</span>}
                                            </td>
                                            <td className="px-5 py-3.5 text-xs text-slate-500 capitalize">
                                                {roleName.replace(/_/g, " ").toLowerCase()}
                                            </td>
                                            <td className="px-5 py-3.5 text-right">
                                                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition-colors ml-auto" />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {!loading && totalPages > 1 && (
                        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                            <p className="text-xs text-slate-400">
                                Page {page} of {totalPages} · {filtered.length} employees
                            </p>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                                    .reduce<(number | "…")[]>((acc, p, i, arr) => {
                                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                                        acc.push(p);
                                        return acc;
                                    }, [])
                                    .map((p, i) =>
                                        p === "…" ? (
                                            <span key={`ellipsis-${i}`} className="px-1 text-xs text-slate-300">…</span>
                                        ) : (
                                            <button
                                                key={p}
                                                onClick={() => setPage(p as number)}
                                                className={`min-w-[28px] h-7 rounded-lg text-xs font-medium transition-colors ${
                                                    page === p
                                                        ? "bg-indigo-600 text-white"
                                                        : "text-slate-600 hover:bg-slate-100"
                                                }`}
                                            >
                                                {p}
                                            </button>
                                        )
                                    )}
                                <button
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Department breakdown */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-800">Headcount by Department</p>
                    </div>
                    <div className="p-5 space-y-3">
                        {loading && (
                            <div className="flex items-center gap-2 text-xs text-slate-400 py-4 justify-center">
                                <div className="h-3 w-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                Loading…
                            </div>
                        )}
                        {!loading && byDept.length === 0 && (
                            <p className="text-xs text-slate-400 text-center py-4">No department data</p>
                        )}
                        {!loading && byDept.map(([name, count]) => {
                            const pct = employees.length > 0 ? Math.round((count / employees.length) * 100) : 0;
                            return (
                                <div key={name}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="font-medium text-slate-700 truncate max-w-[140px]">{name}</span>
                                        <span className="text-slate-400 tabular-nums shrink-0 ml-2">{count} ({pct}%)</span>
                                    </div>
                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function HRPage() {
    return (
        <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
            <HRContent />
        </ProtectedRoute>
    );
}
