"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";
import { useQuery } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import {
    Users, Search, Loader2, Check, ShieldCheck, AlertCircle, UserX,
    ChevronLeft, ChevronRight, Upload,
} from "lucide-react";

const PAGE_SIZE = 10;

const ASSIGNABLE_ROLES: { id: number; name: string; label: string }[] = [
    { id: 2, name: "ADMIN",      label: "Administrator"       },
    { id: 3, name: "MANAGEMENT", label: "Management"          },
    { id: 6, name: "HR",         label: "Human Resources"     },
    { id: 4, name: "HOD",        label: "Head of Department"  },
    { id: 5, name: "EMPLOYEE",   label: "Employee"            },
];

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
    SUPER_ADMIN: { bg: "bg-purple-100", text: "text-purple-700" },
    ADMIN:       { bg: "bg-indigo-100", text: "text-indigo-700" },
    MANAGEMENT:  { bg: "bg-blue-100",   text: "text-blue-700"   },
    HR:          { bg: "bg-rose-100",   text: "text-rose-700"   },
    HOD:         { bg: "bg-amber-100",  text: "text-amber-700"  },
    EMPLOYEE:    { bg: "bg-slate-100",  text: "text-slate-600"  },
};

function getInitials(firstName: string, lastName: string) {
    return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function getRoleForEmployee(emp: EmployeeApiResponse): { id: number; name: string } | null {
    return emp.user?.organizations?.[0]?.role ?? null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function MemberRow({
    emp,
    token,
    onRoleUpdated,
}: {
    emp: EmployeeApiResponse;
    token: string;
    onRoleUpdated: (empId: string, roleId: number, roleName: string) => void;
}) {
    const currentRole = getRoleForEmployee(emp);
    const [selectedId, setSelectedId] = useState<number>(currentRole?.id ?? 5);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [errorMsg, setErrorMsg] = useState("");

    // keep local selection in sync when parent refreshes data (e.g. page change)
    useEffect(() => {
        setSelectedId(currentRole?.id ?? 5);
        setSaveState("idle");
        setErrorMsg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [emp.id]);

    const isDirty = selectedId !== (currentRole?.id ?? 5);
    const hasAccount = !!emp.userId;

    const handleSave = async () => {
        setSaveState("saving");
        setErrorMsg("");
        try {
            await EmployeeService.updateRole(emp.id, selectedId, token);
            const role = ASSIGNABLE_ROLES.find((r) => r.id === selectedId);
            onRoleUpdated(emp.id, selectedId, role?.name ?? "");
            setSaveState("saved");
            setTimeout(() => setSaveState("idle"), 2500);
        } catch (e: any) {
            setErrorMsg(e.message || "Failed to update role");
            setSaveState("error");
            setTimeout(() => setSaveState("idle"), 3500);
        }
    };

    const handleReset = () => {
        setSelectedId(currentRole?.id ?? 5);
        setSaveState("idle");
        setErrorMsg("");
    };

    const roleColor = currentRole ? (ROLE_COLORS[currentRole.name] ?? ROLE_COLORS.EMPLOYEE) : null;

    return (
        <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
            {/* Avatar + Name */}
            <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {getInitials(emp.firstName, emp.lastName)}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                            {emp.firstName} {emp.lastName}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                            {emp.email ?? <span className="italic text-slate-300">No email on file</span>}
                        </p>
                    </div>
                </div>
            </td>

            {/* Department */}
            <td className="px-4 py-3 hidden md:table-cell">
                <span className="text-sm text-slate-500">
                    {emp.department?.name ?? <span className="text-slate-300 italic">Unassigned</span>}
                </span>
            </td>

            {/* Current role badge */}
            <td className="px-4 py-3 hidden sm:table-cell">
                {hasAccount && roleColor ? (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleColor.bg} ${roleColor.text}`}>
                        {currentRole?.name ?? "—"}
                    </span>
                ) : (
                    <span className="text-xs text-slate-300 italic flex items-center gap-1">
                        <UserX className="h-3 w-3" /> No account
                    </span>
                )}
            </td>

            {/* Role selector + actions */}
            <td className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                    {hasAccount ? (
                        <>
                            <select
                                value={selectedId}
                                onChange={(e) => { setSelectedId(Number(e.target.value)); setSaveState("idle"); setErrorMsg(""); }}
                                disabled={saveState === "saving"}
                                className={`text-sm border rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors disabled:opacity-50 ${
                                    isDirty ? "border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-700"
                                }`}
                            >
                                {ASSIGNABLE_ROLES.map((r) => (
                                    <option key={r.id} value={r.id}>{r.label}</option>
                                ))}
                            </select>

                            {isDirty && (
                                <>
                                    <button
                                        onClick={handleSave}
                                        disabled={saveState === "saving"}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                    >
                                        {saveState === "saving" ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Check className="h-3.5 w-3.5" />
                                        )}
                                        Save
                                    </button>
                                    <button
                                        onClick={handleReset}
                                        className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        Reset
                                    </button>
                                </>
                            )}

                            {saveState === "saved" && !isDirty && (
                                <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                    <Check className="h-3.5 w-3.5" /> Saved
                                </span>
                            )}

                            {saveState === "error" && (
                                <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                                    <AlertCircle className="h-3.5 w-3.5" /> {errorMsg}
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="text-xs text-slate-300 italic">No user account linked</span>
                    )}
                </div>
            </td>
        </tr>
    );
}

function MembersContent() {
    const { user, accessToken } = useAuthStore();

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importSummary, setImportSummary] = useState<Awaited<ReturnType<typeof EmployeeService.importEmployees>> | null>(null);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importProgress, setImportProgress] = useState(0);
    const [importPhase, setImportPhase] = useState("");
    const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    const orgId = user?.organizationId ?? "";

    // debounce search
    useEffect(() => {
        const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    const { data: empData, isLoading: loading, refetch } = useQuery({
        queryKey: ["settings-members", orgId, page, debouncedSearch],
        queryFn: () => EmployeeService.getByOrganization(orgId, accessToken!, page, PAGE_SIZE, debouncedSearch || undefined),
        enabled: !!accessToken && !!orgId,
    });

    const employees: EmployeeApiResponse[] = empData?.data ?? [];
    const total = empData?.pagination.total ?? null;
    const totalPages = Math.max(1, empData?.pagination.pages ?? 1);

    const handleRoleUpdated = () => {
        // MemberRow derives currentRole from the `emp` prop, so refetching
        // brings back the new role and lets isDirty/saved state settle correctly.
        void refetch();
    };

    const startProgress = (phases: { label: string; target: number; duration: number }[]) => {
        if (progressInterval.current) clearInterval(progressInterval.current);
        let phaseIndex = 0;
        let current = 0;
        setImportProgress(0);
        setImportPhase(phases[0]?.label ?? "");

        progressInterval.current = setInterval(() => {
            const phase = phases[phaseIndex];
            if (!phase) return;
            const step = (phase.target - current) / (phase.duration / 80);
            current = Math.min(current + step, phase.target);
            setImportProgress(Math.round(current));
            setImportPhase(phase.label);
            if (current >= phase.target) {
                phaseIndex++;
                if (phaseIndex >= phases.length) {
                    clearInterval(progressInterval.current!);
                }
            }
        }, 80);
    };

    const finishProgress = () => {
        if (progressInterval.current) clearInterval(progressInterval.current);
        setImportProgress(100);
    };

    const handleImportDryRun = async (file: File) => {
        if (!accessToken) return;
        setImportFile(file);
        setImportSummary(null);
        setImportError(null);
        setImporting(true);
        startProgress([
            { label: "Reading workbook…",   target: 40, duration: 600  },
            { label: "Validating records…", target: 88, duration: 2000 },
            { label: "Preparing preview…",  target: 94, duration: 1000 },
        ]);
        try {
            const summary = await EmployeeService.importEmployees(file, accessToken, true);
            finishProgress();
            setImportSummary(summary);
        } catch (e: any) {
            finishProgress();
            setImportError(e.message || "Failed to read employee workbook.");
        } finally {
            setImporting(false);
        }
    };

    const handleImportCommit = async () => {
        if (!accessToken || !importFile) return;
        setImportError(null);
        setImporting(true);
        startProgress([
            { label: "Uploading data…",     target: 20, duration: 500  },
            { label: "Creating accounts…",  target: 55, duration: 3000 },
            { label: "Syncing employees…",  target: 82, duration: 4000 },
            { label: "Finalizing…",         target: 94, duration: 2000 },
        ]);
        try {
            const summary = await EmployeeService.importEmployees(importFile, accessToken, false);
            finishProgress();
            setImportSummary(summary);
            await refetch();
        } catch (e: any) {
            finishProgress();
            setImportError(e.message || "Failed to sync employees.");
        } finally {
            setImporting(false);
        }
    };

    const startIndex = (page - 1) * PAGE_SIZE + 1;
    const endIndex = Math.min(page * PAGE_SIZE, total ?? 0);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Page header */}
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Team Members</h1>
                    <p className="text-sm text-slate-500">Manage roles for everyone in your organization.</p>
                </div>
            </div>

            {/* Search + count */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search by name, email or department…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                </div>
                {total !== null && (
                    <span className="text-sm text-slate-400 font-medium shrink-0">
                        {total} member{total !== 1 ? "s" : ""}
                    </span>
                )}
                <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${importing ? "border-indigo-100 text-indigo-300 cursor-not-allowed bg-indigo-50/50" : "border-indigo-200 text-indigo-600 hover:bg-indigo-50 cursor-pointer"}`}>
                    <Upload className="h-4 w-4" />
                    Import Excel
                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        disabled={importing}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void handleImportDryRun(file);
                        }}
                    />
                </label>
            </div>

            {importing && (
                <div className="rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
                    <div className="px-5 pt-5 pb-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="relative h-8 w-8 flex items-center justify-center">
                                    <div className="absolute inset-0 rounded-full border-2 border-indigo-100" />
                                    <div
                                        className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"
                                        style={{ animationDuration: "0.9s" }}
                                    />
                                    <Upload className="h-3.5 w-3.5 text-indigo-500" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-800 leading-tight">{importFile?.name ?? "Importing…"}</p>
                                    <p className="text-xs text-indigo-500 font-medium leading-tight mt-0.5">{importPhase}</p>
                                </div>
                            </div>
                            <span className="text-2xl font-black text-indigo-600 tabular-nums">{importProgress}%</span>
                        </div>

                        {/* Track */}
                        <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300 ease-out"
                                style={{ width: `${importProgress}%` }}
                            />
                            {/* shimmer */}
                            <div
                                className="absolute inset-y-0 rounded-full bg-white/30 w-24 animate-pulse"
                                style={{ left: `calc(${importProgress}% - 24px)`, opacity: importProgress < 100 ? 1 : 0 }}
                            />
                        </div>
                    </div>
                    <div className="h-px bg-gradient-to-r from-transparent via-indigo-100 to-transparent" />
                    <div className="px-5 py-2.5 bg-slate-50/60">
                        <p className="text-[11px] text-slate-400">Please keep this page open while the import runs.</p>
                    </div>
                </div>
            )}

            {!importing && (importSummary || importError) && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                    {importError && <p className="text-sm font-medium text-red-600">{importError}</p>}
                    {importSummary && (
                        <>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-semibold text-slate-700">{importFile?.name ?? "Workbook"}</span>
                                <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-500">{importSummary.validRows} valid rows</span>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{importSummary.created} create</span>
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{importSummary.updated} update</span>
                                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">{importSummary.deleted} delete</span>
                                {importSummary.preserved > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">{importSummary.preserved} current admin preserved</span>
                                )}
                            </div>
                            {importSummary.issues.length > 0 ? (
                                <div className="text-xs text-red-600 space-y-1">
                                    {importSummary.issues.slice(0, 5).map((issue) => (
                                        <p key={`${issue.row}-${issue.message}`}>Row {issue.row}: {issue.message}</p>
                                    ))}
                                    {importSummary.issues.length > 5 && <p>{importSummary.issues.length - 5} more issue(s)</p>}
                                </div>
                            ) : importSummary.dryRun ? (
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <p className="text-xs text-slate-500">
                                        This sync will make your employee database match the workbook.
                                    </p>
                                    <button
                                        onClick={handleImportCommit}
                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                                    >
                                        Confirm Sync
                                    </button>
                                </div>
                            ) : (
                                <p className="text-xs font-medium text-emerald-600">Employee data synced successfully.</p>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Table card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm">Loading members…</span>
                    </div>
                ) : employees.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                        <Users className="h-8 w-8" />
                        <p className="text-sm">
                            {debouncedSearch ? "No members match your search." : "No members found."}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50">
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Member</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Department</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Current Role</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Assign Role</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.map((emp) => (
                                        <MemberRow
                                            key={emp.id}
                                            emp={emp}
                                            token={accessToken ?? ""}
                                            onRoleUpdated={handleRoleUpdated}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination footer */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
                                <p className="text-xs text-slate-500">
                                    Showing {startIndex}–{endIndex} of {total} members
                                </p>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:border-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5" />
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
                                                    className={`h-7 w-7 text-xs font-semibold rounded-lg transition-colors ${
                                                        p === page
                                                            ? "bg-indigo-600 text-white border border-indigo-600"
                                                            : "border border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300"
                                                    }`}
                                                >
                                                    {p}
                                                </button>
                                            )
                                        )}

                                    <button
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:border-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default function MembersPage() {
    return (
        <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN]}>
            <MembersContent />
        </ProtectedRoute>
    );
}
