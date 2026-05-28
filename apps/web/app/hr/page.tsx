"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import {
    Building2, Search, X, ChevronRight, TrendingUp,
    ChevronLeft, Loader2, BarChart3, UserPlus,
    CheckCircle2, ArrowRight, AlertCircle, Plus,
} from "lucide-react";
import Link from "next/link";

const PAGE_SIZE = 15;

const ASSIGNABLE_ROLES = [
    { id: 2, label: "Admin" },
    { id: 6, label: "HR" },
    { id: 3, label: "Management" },
    { id: 4, label: "Head of Department" },
    { id: 5, label: "Employee" },
];

// ─── Onboarding slide-over ────────────────────────────────────────────────────

interface OnboardingPanelProps {
    open: boolean;
    onClose: () => void;
    departments: { id: string; name: string }[];
    accessToken: string;
    onSuccess: (name: string) => void;
}

function OnboardingPanel({ open, onClose, departments, accessToken, onSuccess }: OnboardingPanelProps) {
    const [step, setStep] = useState<1 | 2>(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [firstName, setFirstName]       = useState("");
    const [lastName,  setLastName]        = useState("");
    const [email,     setEmail]           = useState("");
    const [phone,     setPhone]           = useState("");
    const [deptId,    setDeptId]          = useState("");
    const [roleId,    setRoleId]          = useState<number>(5);

    const [localDepts, setLocalDepts] = useState<{ id: string; name: string }[]>([]);
    const [showNewDept, setShowNewDept] = useState(false);
    const [newDeptName, setNewDeptName] = useState("");
    const [creatingDept, setCreatingDept] = useState(false);
    const [deptError, setDeptError] = useState<string | null>(null);

    useEffect(() => { setLocalDepts(departments); }, [departments]);

    function resetForm() {
        setStep(1);
        setFirstName(""); setLastName(""); setEmail("");
        setPhone(""); setDeptId(""); setRoleId(5);
        setError(null);
        setShowNewDept(false); setNewDeptName(""); setDeptError(null);
    }

    async function handleCreateDept() {
        if (!newDeptName.trim()) return;
        setCreatingDept(true);
        setDeptError(null);
        try {
            const created = await EmployeeService.createDepartment(newDeptName.trim(), accessToken);
            setLocalDepts((prev) => [...prev, { id: created.id, name: created.name }]);
            setDeptId(created.id);
            setShowNewDept(false);
            setNewDeptName("");
        } catch (e: any) {
            setDeptError(e.message || "Failed to create department.");
        } finally {
            setCreatingDept(false);
        }
    }

    function handleClose() {
        resetForm();
        onClose();
    }

    function isValidPhone(p: string) {
        return /^[71]\d{8}$/.test(p.replace(/\s/g, ""));
    }

    function canProceed() {
        return (
            firstName.trim() !== "" &&
            lastName.trim() !== "" &&
            /\S+@\S+\.\S+/.test(email) &&
            isValidPhone(phone)
        );
    }

    async function handleSubmit() {
        setError(null);
        setSubmitting(true);
        try {
            await EmployeeService.onboard(
                { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: `+254${phone.trim()}`, departmentId: deptId || undefined, roleId },
                accessToken,
            );
            const fullName = `${firstName.trim()} ${lastName.trim()}`;
            resetForm();
            onSuccess(fullName);
        } catch (e: any) {
            setError(e.message || "Failed to onboard employee.");
        } finally {
            setSubmitting(false);
        }
    }

    const inputCls = "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400 transition-all";
    const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                onClick={handleClose}
            />

            {/* Panel */}
            <div
                className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                            <UserPlus className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-900">Onboard Employee</p>
                            <p className="text-[11px] text-slate-400">Step {step} of 2</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2 px-6 pt-5">
                    {[1, 2].map((s) => (
                        <div key={s} className="flex items-center gap-2 flex-1">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors ${step >= s ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                                {step > s ? <CheckCircle2 className="h-3.5 w-3.5" /> : s}
                            </div>
                            <span className={`text-xs font-medium ${step >= s ? "text-slate-700" : "text-slate-400"}`}>
                                {s === 1 ? "Personal details" : "Role & department"}
                            </span>
                            {s < 2 && <div className={`flex-1 h-px ${step > s ? "bg-indigo-300" : "bg-slate-200"}`} />}
                        </div>
                    ))}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

                    {error && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    {step === 1 && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>First name <span className="text-red-400">*</span></label>
                                    <input
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        placeholder="e.g. Jane"
                                        className={inputCls}
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Last name <span className="text-red-400">*</span></label>
                                    <input
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        placeholder="e.g. Doe"
                                        className={inputCls}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Work email <span className="text-red-400">*</span></label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="jane.doe@company.com"
                                    className={inputCls}
                                />
                                <p className="text-[11px] text-slate-400 mt-1.5">This will be their login email once they set a password.</p>
                            </div>

                            <div>
                                <label className={labelCls}>Phone number <span className="text-red-400">*</span></label>
                                <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-slate-50/50 focus-within:ring-2 focus-within:ring-indigo-500/25 focus-within:border-indigo-400 transition-all">
                                    <span className="flex items-center px-3 text-sm font-medium text-slate-500 bg-slate-100 border-r border-slate-200 shrink-0 gap-1.5">
                                        🇰🇪 +254
                                    </span>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                                        placeholder="700 000 000"
                                        maxLength={9}
                                        className="flex-1 px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none bg-transparent"
                                    />
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1.5">Enter 9 digits after +254 (e.g. 712 345 678).</p>
                            </div>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            {/* Preview chip */}
                            <div className="flex items-center gap-3 bg-indigo-50 rounded-xl px-4 py-3">
                                <div className="h-9 w-9 rounded-full bg-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-700 shrink-0">
                                    {firstName[0]?.toUpperCase()}{lastName[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-indigo-900">{firstName} {lastName}</p>
                                    <p className="text-xs text-indigo-500 truncate">{email}</p>
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Role <span className="text-red-400">*</span></label>
                                <select
                                    value={roleId}
                                    onChange={(e) => setRoleId(Number(e.target.value))}
                                    className={inputCls}
                                >
                                    {ASSIGNABLE_ROLES.map((r) => (
                                        <option key={r.id} value={r.id}>{r.label}</option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-slate-400 mt-1.5">You can change this later from the members settings.</p>
                            </div>

                            <div>
                                <label className={labelCls}>Department <span className="text-slate-300 font-normal">(optional)</span></label>
                                {showNewDept ? (
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <input
                                                autoFocus
                                                value={newDeptName}
                                                onChange={(e) => { setNewDeptName(e.target.value); setDeptError(null); }}
                                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCreateDept(); } }}
                                                placeholder="e.g. Engineering"
                                                className={inputCls}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => void handleCreateDept()}
                                                disabled={creatingDept || !newDeptName.trim()}
                                                className="shrink-0 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                                            >
                                                {creatingDept ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setShowNewDept(false); setNewDeptName(""); setDeptError(null); }}
                                            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                                        >
                                            ← Back to list
                                        </button>
                                        {deptError && <p className="text-xs text-red-600 mt-1">{deptError}</p>}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <select
                                            value={deptId}
                                            onChange={(e) => setDeptId(e.target.value)}
                                            className={inputCls}
                                        >
                                            <option value="">Not assigned yet</option>
                                            {localDepts.map((d) => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => { setShowNewDept(true); setDeptError(null); }}
                                            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                                        >
                                            <Plus className="h-3 w-3" /> New department
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Summary card */}
                            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2 text-xs">
                                <p className="font-semibold text-slate-600 uppercase tracking-wider text-[10px]">Summary</p>
                                <div className="flex justify-between"><span className="text-slate-500">Name</span><span className="font-medium text-slate-900">{firstName} {lastName}</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="font-medium text-slate-900 truncate max-w-[200px]">{email}</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-medium text-slate-900">+254 {phone}</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Role</span><span className="font-medium text-slate-900">{ASSIGNABLE_ROLES.find(r => r.id === roleId)?.label}</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">Department</span><span className="font-medium text-slate-900">{localDepts.find(d => d.id === deptId)?.name ?? "Unassigned"}</span></div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between gap-3">
                    {step === 1 ? (
                        <button onClick={handleClose} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
                            Cancel
                        </button>
                    ) : (
                        <button onClick={() => { setStep(1); setError(null); }} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                            <ChevronLeft className="h-4 w-4" /> Back
                        </button>
                    )}

                    {step === 1 ? (
                        <button
                            onClick={() => { setError(null); setStep(2); }}
                            disabled={!canProceed()}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Next <ArrowRight className="h-4 w-4" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        >
                            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Onboarding…</> : "Confirm & Onboard"}
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}

// ─── Success toast ────────────────────────────────────────────────────────────

function SuccessToast({ name, onDismiss, onAnother }: { name: string; onDismiss: () => void; onAnother: () => void }) {
    useEffect(() => {
        const t = setTimeout(onDismiss, 6000);
        return () => clearTimeout(t);
    }, [onDismiss]);

    return (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-white border border-emerald-200 shadow-xl rounded-2xl px-5 py-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="h-9 w-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{name} onboarded</p>
                <p className="text-xs text-slate-400">They can now set a password to log in.</p>
            </div>
            <div className="flex items-center gap-2 ml-2 shrink-0">
                <button onClick={onAnother} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors whitespace-nowrap">
                    + Add another
                </button>
                <button onClick={onDismiss} className="text-slate-300 hover:text-slate-500 transition-colors">
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function HRContent() {
    const { user, accessToken } = useAuthStore();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [deptFilter, setDeptFilter] = useState("");
    const [page, setPage] = useState(1);

    // onboarding state
    const [panelOpen, setPanelOpen] = useState(false);
    const [successName, setSuccessName] = useState<string | null>(null);

    const orgId = user?.organizationId ?? "";

    useEffect(() => {
        const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => { setPage(1); }, [deptFilter]);

    const { data: departments = [] } = useQuery({
        queryKey: ["departments", orgId],
        queryFn: () => EmployeeService.getDepartments(orgId, accessToken!),
        enabled: !!accessToken && !!orgId,
    });

    const { data: empData, isLoading: loading } = useQuery({
        queryKey: ["employees", orgId, page, debouncedSearch, deptFilter],
        queryFn: () => EmployeeService.getByOrganization(orgId, accessToken!, page, PAGE_SIZE, debouncedSearch || undefined, deptFilter || undefined),
        enabled: !!accessToken && !!orgId,
    });

    const employees: EmployeeApiResponse[] = empData?.data ?? [];
    const total = empData?.pagination.total ?? null;
    const totalPages = Math.max(1, empData?.pagination.pages ?? 1);

    const totalDeptEmployees = departments.reduce((s, d) => s + d._count.employees, 0);

    function handleOnboardSuccess(name: string) {
        setPanelOpen(false);
        setSuccessName(name);
        queryClient.invalidateQueries({ queryKey: ["departments", orgId] });
        queryClient.invalidateQueries({ queryKey: ["employees", orgId] });
        setPage(1);
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Employee Directory</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        {total !== null
                            ? `${total.toLocaleString()} employee${total !== 1 ? "s" : ""} · ${departments.length} department${departments.length !== 1 ? "s" : ""}`
                            : "Loading…"}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Link
                        href="/hr/reports"
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                    >
                        <BarChart3 className="h-3.5 w-3.5" />
                        Analytics
                    </Link>
                    <button
                        onClick={() => setPanelOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                        <UserPlus className="h-3.5 w-3.5" />
                        Onboard Employee
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
                {/* Employee table */}
                <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Toolbar */}
                    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search employees…"
                                className="w-full pl-8 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                            />
                            {search && (
                                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                    <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                                </button>
                            )}
                        </div>
                        <select
                            value={deptFilter}
                            onChange={(e) => setDeptFilter(e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                        >
                            <option value="">All departments</option>
                            {departments.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                        {total !== null && (
                            <span className="ml-auto text-[11px] text-slate-400 whitespace-nowrap">
                                {total} employee{total !== 1 ? "s" : ""}
                            </span>
                        )}
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
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-10 text-center">
                                            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Loading employees…
                                            </div>
                                        </td>
                                    </tr>
                                ) : employees.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-10 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                                                    <UserPlus className="h-5 w-5 text-slate-400" />
                                                </div>
                                                <p className="text-sm text-slate-400">
                                                    {search || deptFilter ? "No employees match your filters." : "No employees yet."}
                                                </p>
                                                {!search && !deptFilter && (
                                                    <button
                                                        onClick={() => setPanelOpen(true)}
                                                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                                                    >
                                                        Onboard your first employee →
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : employees.map((emp) => {
                                    const roleName = emp.user?.organizations?.[0]?.role?.name ?? "—";
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
                                Page {page} of {totalPages} · {total} employees
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

                {/* Department sidebar */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-800">Headcount by Department</p>
                    </div>
                    <div className="p-5 space-y-3">
                        {departments.length === 0 && (
                            <div className="flex items-center gap-2 text-xs text-slate-400 py-4 justify-center">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading…
                            </div>
                        )}
                        {departments.map((dept) => {
                            const count = dept._count.employees;
                            const pct = totalDeptEmployees > 0 ? Math.round((count / totalDeptEmployees) * 100) : 0;
                            return (
                                <div key={dept.id}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="font-medium text-slate-700 truncate max-w-[140px]">{dept.name}</span>
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

            {/* Onboarding slide-over */}
            <OnboardingPanel
                open={panelOpen}
                onClose={() => setPanelOpen(false)}
                departments={departments}
                accessToken={accessToken ?? ""}
                onSuccess={handleOnboardSuccess}
            />

            {/* Success toast */}
            {successName && (
                <SuccessToast
                    name={successName}
                    onDismiss={() => setSuccessName(null)}
                    onAnother={() => { setSuccessName(null); setPanelOpen(true); }}
                />
            )}
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
