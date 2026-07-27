"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

function initials(first: string, last: string) {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function EmployeeCard({ emp }: { emp: EmployeeApiResponse }) {
    return (
        <Link
            href={`/leave/employees/${emp.id}`}
            className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 hover:border-indigo-300 hover:shadow-sm transition-all"
        >
            <div className="h-11 w-11 shrink-0 rounded-full overflow-hidden bg-slate-800 text-white text-sm font-bold flex items-center justify-center">
                {emp.avatarUrl ? (
                    <img src={emp.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                    initials(emp.firstName, emp.lastName)
                )}
            </div>
            <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{emp.firstName} {emp.lastName}</p>
                <p className="text-xs text-slate-400 truncate">{emp.department?.name ?? "No department"}</p>
            </div>
        </Link>
    );
}

function EmployeesDirectory() {
    const accessToken = useAuthStore((s) => s.accessToken)!;
    const user = useAuthStore((s) => s.user);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    const isHod = user?.roleLevel === Role.HOD;

    const { data, isLoading } = useQuery({
        queryKey: ["leave-employees", isHod ? "dept" : "org", user?.organizationId, user?.departmentId, page, search],
        queryFn: () =>
            isHod
                ? EmployeeService.getByDepartment(user!.departmentId!, accessToken, page, 24)
                : EmployeeService.getByOrganization(user!.organizationId!, accessToken, page, 24, search || undefined),
        enabled: !!accessToken && !!user && (!isHod || !!user.departmentId),
    });

    if (isHod && !user?.departmentId) {
        return <p className="text-sm text-slate-400 p-6">No department assigned to your account.</p>;
    }

    return (
        <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-slate-900">Employees</h1>
                    <p className="text-sm text-slate-500">Browse leave balances and history by employee.</p>
                </div>
                {!isHod && (
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search employee…"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                        />
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="bg-white rounded-xl border border-slate-200 h-[68px] animate-pulse" />
                    ))}
                </div>
            ) : !data || data.data.length === 0 ? (
                <p className="text-sm text-slate-400">No employees found.</p>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {data.data.map((emp) => <EmployeeCard key={emp.id} emp={emp} />)}
                    </div>

                    {data.pagination.pages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                            <p className="text-xs text-slate-400">
                                Page {data.pagination.page} of {data.pagination.pages} &middot; {data.pagination.total} employees
                            </p>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setPage((p) => Math.min(data.pagination.pages, p + 1))}
                                    disabled={page >= data.pagination.pages}
                                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default function LeaveEmployeesPage() {
    return (
        <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD]}>
            <EmployeesDirectory />
        </ProtectedRoute>
    );
}
