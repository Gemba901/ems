"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import {
    Users, ChevronRight, Loader2, ChevronLeft,
    Building2, Mail, Phone, ShieldCheck, AlertCircle,
} from "lucide-react";

const PAGE_SIZE = 20;

const ROLE_STYLE: Record<string, { label: string; cls: string }> = {
    SUPER_ADMIN: { label: "Super Admin", cls: "bg-purple-100 text-purple-700" },
    ADMIN:       { label: "Admin",       cls: "bg-indigo-100 text-indigo-700" },
    MANAGEMENT:  { label: "Management",  cls: "bg-blue-100   text-blue-700"   },
    HR:          { label: "HR",          cls: "bg-rose-100   text-rose-700"   },
    HOD:         { label: "Head of Dept",cls: "bg-amber-100  text-amber-700"  },
    EMPLOYEE:    { label: "Employee",    cls: "bg-slate-100  text-slate-600"  },
};

function DeptContent() {
    const { user, accessToken } = useAuthStore();
    const router = useRouter();

    const [deptId,   setDeptId]   = useState<string | null>(null);
    const [deptName, setDeptName] = useState<string>("");
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError,   setProfileError]   = useState<string | null>(null);

    const [employees,   setEmployees]   = useState<EmployeeApiResponse[]>([]);
    const [total,       setTotal]       = useState<number | null>(null);
    const [totalPages,  setTotalPages]  = useState(1);
    const [page,        setPage]        = useState(1);
    const [listLoading, setListLoading] = useState(false);

    // Step 1: resolve the HOD's own department
    useEffect(() => {
        if (!accessToken) return;
        EmployeeService.getMe(accessToken)
            .then((emp) => {
                if (!emp.departmentId) {
                    setProfileError("You are not assigned to a department yet.");
                    return;
                }
                setDeptId(emp.departmentId);
                setDeptName(emp.department?.name ?? "My Department");
            })
            .catch(() => setProfileError("Could not load your profile."))
            .finally(() => setProfileLoading(false));
    }, [accessToken]);

    // Step 2: load department employees whenever deptId or page changes
    useEffect(() => {
        if (!accessToken || !deptId) return;
        setListLoading(true);
        EmployeeService.getByDepartment(deptId, accessToken, page, PAGE_SIZE)
            .then((res) => {
                setEmployees(res.data);
                setTotal(res.pagination.total);
                setTotalPages(Math.max(1, res.pagination.pages));
            })
            .catch(console.error)
            .finally(() => setListLoading(false));
    }, [accessToken, deptId, page]);

    if (profileLoading) {
        return (
            <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading your profile…</span>
            </div>
        );
    }

    if (profileError) {
        return (
            <div className="max-w-md mx-auto mt-16 flex flex-col items-center gap-3 text-center">
                <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-amber-500" />
                </div>
                <p className="text-sm font-semibold text-slate-700">{profileError}</p>
                <p className="text-xs text-slate-400">Contact your administrator to get assigned to a department.</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Building2 className="h-4 w-4 text-indigo-400" />
                        <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">{deptName}</span>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">My Team</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        {total !== null
                            ? `${total} member${total !== 1 ? "s" : ""} in your department`
                            : "Loading…"}
                    </p>
                </div>
                <div className="h-11 w-11 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 text-indigo-600" />
                </div>
            </div>

            {/* Employee grid */}
            {listLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading team…</span>
                </div>
            ) : employees.length === 0 ? (
                <div className="text-center py-16">
                    <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                        <Users className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">No employees in this department yet.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {employees.map((emp) => {
                        const userOrg = emp.user?.organizations?.[0];
                        const roleName = userOrg?.role?.name ?? null;
                        const roleStyle = roleName ? (ROLE_STYLE[roleName] ?? ROLE_STYLE.EMPLOYEE) : null;
                        const initials = `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase();

                        return (
                            <div
                                key={emp.id}
                                onClick={() => router.push(`/operations/employees/${emp.id}`)}
                                className="group bg-white rounded-xl border border-slate-200 shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-indigo-200 hover:ring-1 hover:ring-indigo-200 transition-all duration-150 flex flex-col gap-4"
                            >
                                {/* Top: avatar + name + chevron */}
                                <div className="flex items-start gap-3">
                                    {emp.avatarUrl ? (
                                        <img
                                            src={emp.avatarUrl}
                                            alt=""
                                            className="h-11 w-11 rounded-full object-cover border border-slate-200 shrink-0"
                                        />
                                    ) : (
                                        <div className="h-11 w-11 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-700 shrink-0">
                                            {initials}
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-slate-900 truncate">
                                            {emp.firstName} {emp.lastName}
                                        </p>
                                        {roleStyle && (
                                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1 ${roleStyle.cls}`}>
                                                <ShieldCheck className="h-3 w-3" />
                                                {roleStyle.label}
                                            </span>
                                        )}
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0 mt-0.5" />
                                </div>

                                {/* Bottom: contact details */}
                                <div className="space-y-1.5 border-t border-slate-50 pt-3">
                                    <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                                        <Mail className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                                        <span className="truncate">{emp.email}</span>
                                    </div>
                                    {(emp.phone ?? emp.user?.phone) && (
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <Phone className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                                            <span>{emp.phone ?? emp.user?.phone}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {!listLoading && totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">
                        Page {page} of {totalPages} · {total} members
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
                                    <span key={`e-${i}`} className="px-1 text-xs text-slate-300">…</span>
                                ) : (
                                    <button
                                        key={p}
                                        onClick={() => setPage(p as number)}
                                        className={`min-w-[28px] h-7 rounded-lg text-xs font-medium transition-colors ${
                                            page === p ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
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
    );
}

export default function DepartmentPage() {
    return (
        <ProtectedRoute allowedRoles={[Role.HOD, Role.MANAGEMENT, Role.SUPER_ADMIN, Role.ADMIN]}>
            <DeptContent />
        </ProtectedRoute>
    );
}
