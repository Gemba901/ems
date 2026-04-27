"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { AdminService, OrgDetail, OrgStats, OrgStatus } from "@/services/admin.service";
import {
    ArrowLeft, Building2, Users, Lightbulb, BarChart2,
    CircleDot, Mail, Phone, MapPin, Globe, ChevronDown,
    EyeOff, CheckCircle2, Clock, AlertCircle,
} from "lucide-react";

type Tab = "overview" | "employees" | "suggestions" | "roles";

const STATUS_CONFIG: Record<OrgStatus, { label: string; badge: string; dot: string }> = {
    ACTIVE:    { label: "Active",    dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" },
    SUSPENDED: { label: "Suspended", dot: "bg-amber-500",   badge: "bg-amber-500/10 text-amber-600 border border-amber-500/20" },
    INACTIVE:  { label: "Inactive",  dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-500 border border-slate-200" },
};

const SIM_STATUS_BADGE: Record<string, string> = {
    SUBMITTED:           "bg-sky-100 text-sky-700",
    UNDER_REVIEW:        "bg-amber-100 text-amber-700",
    NEEDS_CLARIFICATION: "bg-orange-100 text-orange-700",
    APPROVED:            "bg-indigo-100 text-indigo-700",
    IMPLEMENTED:         "bg-emerald-100 text-emerald-700",
    REJECTED:            "bg-red-100 text-red-700",
    ARCHIVED:            "bg-slate-100 text-slate-500",
};

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="h-4 w-4" />
            </div>
            <div>
                <p className="text-xl font-bold text-slate-900 tabular-nums leading-none">{value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{label}</p>
            </div>
        </div>
    );
}

export default function OrgDetailPage() {
    const { id }     = useParams<{ id: string }>();
    const router     = useRouter();
    const { accessToken } = useAuthStore();

    const [org, setOrg]         = useState<OrgDetail | null>(null);
    const [stats, setStats]     = useState<OrgStats | null>(null);
    const [employees, setEmps]  = useState<any[]>([]);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [roles, setRoles]     = useState<any[]>([]);
    const [tab, setTab]         = useState<Tab>("overview");
    const [loading, setLoading] = useState(true);
    const [tabLoading, setTabLoading] = useState(false);
    const [statusOpen, setStatusOpen] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Initial load
    useEffect(() => {
        if (!accessToken || !id) return;
        Promise.all([
            AdminService.getOrganization(accessToken, id),
            AdminService.getOrgStats(accessToken, id),
        ])
            .then(([o, s]) => { setOrg(o); setStats(s); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [accessToken, id]);

    // Tab data
    useEffect(() => {
        if (!accessToken || !id || loading) return;
        if (tab === "overview") return;

        setTabLoading(true);
        const fetch =
            tab === "employees"
                ? AdminService.getOrgEmployees(accessToken, id).then((r) => setEmps(r.data))
                : tab === "suggestions"
                ? AdminService.getOrgSuggestions(accessToken, id).then((r) => setSuggestions(r.data))
                : AdminService.getOrgRoles(accessToken, id).then(setRoles);

        fetch.catch(console.error).finally(() => setTabLoading(false));
    }, [tab, accessToken, id, loading]);

    const handleStatusChange = useCallback(async (status: OrgStatus) => {
        if (!accessToken || !org) return;
        setUpdatingStatus(true);
        setStatusOpen(false);
        try {
            await AdminService.updateOrgStatus(accessToken, org.id, status);
            setOrg((prev) => prev ? { ...prev, status } : prev);
        } catch (e: any) {
            alert(e.message || "Failed to update status");
        } finally {
            setUpdatingStatus(false);
        }
    }, [accessToken, org]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm gap-2">
                <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                Loading organization...
            </div>
        );
    }

    if (!org) {
        return (
            <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
                <Building2 className="h-10 w-10 text-slate-200" />
                <p className="text-sm font-medium">Organization not found</p>
                <button onClick={() => router.back()} className="text-xs text-indigo-600 hover:underline">Go back</button>
            </div>
        );
    }

    const sc = STATUS_CONFIG[org.status];

    const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
        { key: "overview",     label: "Overview",     icon: BarChart2 },
        { key: "employees",    label: `Employees (${stats?.employeeCount ?? org._count.employees})`,    icon: Users },
        { key: "suggestions",  label: `Suggestions (${stats?.suggestionCount ?? org._count.suggestions})`, icon: Lightbulb },
        { key: "roles",        label: "Roles",        icon: CircleDot },
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-6">

            {/* Back */}
            <button
                onClick={() => router.push("/admin/organizations")}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
            >
                <ArrowLeft className="h-4 w-4" /> Organizations
            </button>

            {/* Org header card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                        {org.logoUrl ? (
                            <img src={org.logoUrl} alt={org.name} className="h-14 w-14 rounded-xl object-cover border border-slate-200" />
                        ) : (
                            <div className="h-14 w-14 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-bold shrink-0">
                                {org.name[0].toUpperCase()}
                            </div>
                        )}
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-xl font-bold text-slate-900">{org.name}</h1>
                                <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${sc.badge}`}>
                                    <CircleDot className="h-2.5 w-2.5" /> {sc.label}
                                </span>
                            </div>
                            {org.industry && <p className="text-sm text-slate-500">{org.industry}</p>}
                            <p className="text-[11px] text-slate-400 mt-1">
                                Joined {new Date(org.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                            </p>
                        </div>
                    </div>

                    {/* Status control */}
                    <div className="relative">
                        <button
                            onClick={() => setStatusOpen((o) => !o)}
                            disabled={updatingStatus}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                            {updatingStatus ? "Updating..." : "Change Status"}
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                        </button>
                        {statusOpen && (
                            <div className="absolute right-0 top-10 z-10 w-44 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                                {(["ACTIVE", "SUSPENDED", "INACTIVE"] as OrgStatus[])
                                    .filter((s) => s !== org.status)
                                    .map((s) => {
                                        const cfg = STATUS_CONFIG[s];
                                        return (
                                            <button
                                                key={s}
                                                onClick={() => handleStatusChange(s)}
                                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left hover:bg-slate-50 transition-colors"
                                            >
                                                <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                                                {cfg.label}
                                            </button>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Contact row */}
                {(org.email || org.phone || org.address) && (
                    <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap gap-5">
                        {org.email && (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <Mail className="h-4 w-4 text-slate-300" /> {org.email}
                            </div>
                        )}
                        {org.phone && (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <Phone className="h-4 w-4 text-slate-300" /> {org.phone}
                            </div>
                        )}
                        {org.address && (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <MapPin className="h-4 w-4 text-slate-300" /> {org.address}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MiniStat label="Employees"        value={stats?.employeeCount   ?? org._count.employees}   icon={Users}     color="bg-sky-50 text-sky-600" />
                <MiniStat label="Departments"      value={stats?.departmentCount ?? org._count.departments} icon={Building2} color="bg-indigo-50 text-indigo-600" />
                <MiniStat label="Suggestions"      value={stats?.suggestionCount ?? org._count.suggestions} icon={Lightbulb} color="bg-amber-50 text-amber-600" />
                <MiniStat label="Implementation %" value={`${stats?.implementationRate ?? 0}%`}             icon={BarChart2} color="bg-emerald-50 text-emerald-600" />
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-200 flex gap-1">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            tab === key
                                ? "border-indigo-600 text-indigo-600"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                        }`}
                    >
                        <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div>
                {tabLoading && (
                    <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
                        <div className="h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        Loading...
                    </div>
                )}

                {/* Overview */}
                {!tabLoading && tab === "overview" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Departments */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100">
                                <p className="text-sm font-semibold text-slate-800">Departments</p>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {org.departments.length === 0 && (
                                    <p className="px-5 py-8 text-sm text-slate-400 text-center">No departments yet</p>
                                )}
                                {org.departments.map((dept) => (
                                    <div key={dept.id} className="flex items-center justify-between px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center">
                                                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                                            </div>
                                            <span className="text-sm font-medium text-slate-700">{dept.name}</span>
                                        </div>
                                        <span className="text-xs text-slate-400 tabular-nums">
                                            {dept._count.employees} {dept._count.employees === 1 ? "employee" : "employees"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Suggestion breakdown */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100">
                                <p className="text-sm font-semibold text-slate-800">Suggestion Breakdown</p>
                            </div>
                            <div className="p-5 space-y-3">
                                {stats && Object.entries(stats.suggestionsByStatus).length === 0 && (
                                    <p className="text-sm text-slate-400 text-center py-4">No suggestions yet</p>
                                )}
                                {stats && Object.entries(stats.suggestionsByStatus).map(([status, count]) => {
                                    const total = stats.suggestionCount || 1;
                                    const pct   = Math.round((count / total) * 100);
                                    const badgeClass = SIM_STATUS_BADGE[status] ?? "bg-slate-100 text-slate-500";
                                    return (
                                        <div key={status}>
                                            <div className="flex items-center justify-between text-xs mb-1.5">
                                                <span className={`px-2 py-0.5 rounded-md font-semibold ${badgeClass}`}>
                                                    {status.replace(/_/g, " ")}
                                                </span>
                                                <span className="text-slate-400 tabular-nums">{count} ({pct}%)</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Employees tab */}
                {!tabLoading && tab === "employees" && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Department</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {employees.length === 0 && (
                                    <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm">No employees found</td></tr>
                                )}
                                {employees.map((emp) => (
                                    <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                                                    {emp.firstName[0]}{emp.lastName[0]}
                                                </div>
                                                <span className="font-medium text-slate-900">{emp.firstName} {emp.lastName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500">{emp.email}</td>
                                        <td className="px-6 py-4">
                                            {emp.department ? (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                                                    {emp.department.name}
                                                </span>
                                            ) : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-500 capitalize">
                                            {emp.user?.role?.name?.replace(/_/g, " ").toLowerCase() ?? "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Suggestions tab */}
                {!tabLoading && tab === "suggestions" && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Title</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Author</th>
                                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {suggestions.length === 0 && (
                                    <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">No suggestions yet</td></tr>
                                )}
                                {suggestions.map((s) => (
                                    <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-900 max-w-[280px] truncate">{s.title}</td>
                                        <td className="px-6 py-4">
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                                                {s.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${SIM_STATUS_BADGE[s.status] ?? "bg-slate-100 text-slate-500"}`}>
                                                {s.status.replace(/_/g, " ")}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 text-xs">
                                            {s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : (
                                                <span className="flex items-center gap-1 text-slate-400"><EyeOff className="h-3 w-3" /> Anonymous</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                                            {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Roles tab */}
                {!tabLoading && tab === "roles" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {roles.length === 0 && (
                            <p className="text-sm text-slate-400 col-span-3 text-center py-12">No roles configured</p>
                        )}
                        {roles.map((role) => (
                            <div key={role.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="font-semibold text-slate-900 text-sm">{role.name.replace(/_/g, " ")}</p>
                                    <span className="text-xs text-slate-400 tabular-nums bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                                        {role._count.users} {role._count.users === 1 ? "user" : "users"}
                                    </span>
                                </div>
                                {role.permissions?.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {role.permissions.map((rp: any) => (
                                            <span key={rp.permissionId} className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 font-medium">
                                                {rp.permission?.name}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-slate-400">No permissions assigned</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
