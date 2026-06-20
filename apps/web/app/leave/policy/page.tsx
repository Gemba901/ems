"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
    LeaveService, ALL_LEAVE_TYPES, LEAVE_TYPE_LABELS,
    WORKING_DAY_LABELS, LeaveDepartment, CustomLeaveType,
} from "@/services/leave.service";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import {
    ArrowLeft, Save, Users, CheckCircle2, ChevronDown, AlertCircle,
    Loader2, Plus, Trash2, ToggleLeft, ToggleRight,
} from "lucide-react";
import Link from "next/link";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];

// ── Row: one leave type with toggle + day allocator ───────────────────────────

function LeaveTypeRow({
    typeCode,
    label,
    value,
    active,
    isCustom,
    onChangeDays,
    onToggle,
    onDelete,
}: {
    typeCode: string;
    label: string;
    value: number;
    active: boolean;
    isCustom?: boolean;
    onChangeDays: (v: number) => void;
    onToggle: () => void;
    onDelete?: () => void;
}) {
    const [display, setDisplay] = useState(String(value));
    useEffect(() => { setDisplay(String(value)); }, [value]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const raw = e.target.value.replace(/[^0-9]/g, "");
        setDisplay(raw);
        if (raw !== "") onChangeDays(Math.min(365, parseInt(raw)));
    }
    function handleBlur() {
        const num = Math.min(365, Math.max(0, parseInt(display) || 0));
        setDisplay(String(num));
        onChangeDays(num);
    }
    function step(delta: number) {
        const next = Math.min(365, Math.max(0, value + delta));
        onChangeDays(next);
        setDisplay(String(next));
    }

    return (
        <div className={`flex items-center gap-3 py-3 border-b border-slate-100 last:border-0 transition-opacity ${active ? "" : "opacity-50"}`}>
            {/* Active toggle */}
            <button
                type="button"
                onClick={onToggle}
                title={active ? "Deactivate" : "Activate"}
                className="shrink-0"
            >
                {active
                    ? <ToggleRight className="h-6 w-6 text-indigo-600" />
                    : <ToggleLeft  className="h-6 w-6 text-slate-300" />}
            </button>

            {/* Name */}
            <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${active ? "text-slate-800" : "text-slate-400"}`}>{label}</p>
                <p className="text-xs text-slate-400">per employee per year</p>
            </div>

            {/* Day stepper */}
            <div className="flex items-center gap-1.5 shrink-0">
                <button
                    type="button"
                    onClick={() => step(-1)}
                    disabled={!active}
                    className="h-7 w-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center text-sm font-bold transition-colors"
                >−</button>
                <input
                    type="text"
                    inputMode="numeric"
                    value={display}
                    disabled={!active}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className="w-14 text-center rounded-lg border border-slate-200 px-2 py-1 text-sm font-semibold text-slate-900 disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                    type="button"
                    onClick={() => step(1)}
                    disabled={!active}
                    className="h-7 w-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center text-sm font-bold transition-colors"
                >+</button>
                <span className="text-xs text-slate-400 w-8">days</span>
            </div>

            {/* Delete (custom types only) */}
            {isCustom && onDelete && (
                <button
                    type="button"
                    onClick={onDelete}
                    className="shrink-0 text-slate-300 hover:text-red-500 transition-colors ml-1"
                    title="Remove custom type"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}

export default function LeavePolicyPage() {
    return (
        <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
            <LeavePolicyContent />
        </ProtectedRoute>
    );
}

function LeavePolicyContent() {
    const accessToken = useAuthStore((s) => s.accessToken)!;
    const queryClient = useQueryClient();

    // ── Year selector ──────────────────────────────────────────────────────────
    const [year, setYear] = useState(CURRENT_YEAR);

    // ── Policy allocations ─────────────────────────────────────────────────────
    const [allocations, setAllocations] = useState<Record<string, number>>({});
    const [applyResult, setApplyResult] = useState<{ applied: number; year: number } | null>(null);
    const [confirmApply, setConfirmApply] = useState(false);
    const initPolicyRef = useRef("");

    const { data: policyData, isLoading: policyLoading } = useQuery({
        queryKey: ["leave-policy", year],
        queryFn: () => LeaveService.getPolicy(accessToken, year),
        enabled: !!accessToken,
    });

    useEffect(() => {
        if (policyData === undefined) return;
        const key = `${year}:${policyData.map((p) => `${p.type}=${p.allocated}`).sort().join(",")}`;
        if (initPolicyRef.current === key) return;
        initPolicyRef.current = key;
        const base: Record<string, number> = {};
        for (const t of ALL_LEAVE_TYPES) base[t] = 0;
        for (const p of policyData) base[p.type] = p.allocated;
        setAllocations(base);
    }, [policyData, year]);

    // ── Settings: working days + enabled types + custom types ──────────────────
    const { data: settings, isLoading: settingsLoading } = useQuery({
        queryKey: ["leave-settings"],
        queryFn: () => LeaveService.getSettings(accessToken),
        enabled: !!accessToken,
        staleTime: 30_000,
    });

    const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [enabledTypes, setEnabledTypes] = useState<string[]>([]);
    const [customTypes, setCustomTypes] = useState<CustomLeaveType[]>([]);
    const [settingsInit, setSettingsInit] = useState(false);

    useEffect(() => {
        if (settings && !settingsInit) {
            setWorkingDays(settings.workingDays);
            setEnabledTypes(settings.enabledTypes);
            setCustomTypes(settings.customLeaveTypes ?? []);
            // Seed allocation map for custom types
            setAllocations((prev) => {
                const updated = { ...prev };
                for (const ct of (settings.customLeaveTypes ?? [])) {
                    if (!(ct.code in updated)) updated[ct.code] = 0;
                }
                return updated;
            });
            setSettingsInit(true);
        }
    }, [settings, settingsInit]);

    // Keep allocation map in sync when custom types change
    useEffect(() => {
        setAllocations((prev) => {
            const updated = { ...prev };
            for (const ct of customTypes) {
                if (!(ct.code in updated)) updated[ct.code] = 0;
            }
            return updated;
        });
        // Apply policy row seeding from fetched data
        if (policyData) {
            setAllocations((prev) => {
                const updated = { ...prev };
                for (const p of policyData) updated[p.type] = p.allocated;
                return updated;
            });
        }
    }, [customTypes]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Active type helpers ────────────────────────────────────────────────────
    function isActive(typeCode: string) {
        return enabledTypes.length === 0 || enabledTypes.includes(typeCode);
    }

    function toggleActive(typeCode: string) {
        const allCodes = [...ALL_LEAVE_TYPES, ...customTypes.map((c) => c.code)];
        if (enabledTypes.length === 0) {
            // All active → disable just this one
            setEnabledTypes(allCodes.filter((t) => t !== typeCode));
        } else if (enabledTypes.includes(typeCode)) {
            const next = enabledTypes.filter((t) => t !== typeCode);
            // If all others remain, switch back to "all enabled" (empty)
            setEnabledTypes(next.length === allCodes.length - 1 && allCodes.every((c) => c === typeCode || next.includes(c)) ? [] : next);
        } else {
            const next = [...enabledTypes, typeCode];
            setEnabledTypes(next.length === allCodes.length ? [] : next);
        }
    }

    // ── Add custom type ────────────────────────────────────────────────────────
    const [newTypeName, setNewTypeName] = useState("");
    const [addError, setAddError] = useState("");

    function toCode(name: string) {
        return name.trim().toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
    }

    function handleAddType() {
        const name = newTypeName.trim();
        if (!name) { setAddError("Enter a leave type name."); return; }
        const code = toCode(name);
        if (!code) { setAddError("Name must contain letters or numbers."); return; }
        const existing = [...ALL_LEAVE_TYPES, ...customTypes.map((c) => c.code)];
        if (existing.includes(code)) { setAddError("A leave type with this code already exists."); return; }
        setCustomTypes((prev) => [...prev, { code, name }]);
        // Auto-enable the new type
        if (enabledTypes.length > 0) {
            setEnabledTypes((prev) => [...prev, code]);
        }
        setNewTypeName("");
        setAddError("");
    }

    function handleDeleteCustom(code: string) {
        setCustomTypes((prev) => prev.filter((c) => c.code !== code));
        setEnabledTypes((prev) => prev.filter((t) => t !== code));
        setAllocations((prev) => { const next = { ...prev }; delete next[code]; return next; });
    }

    // ── Departments ────────────────────────────────────────────────────────────
    const { data: departments = [], isLoading: deptsLoading } = useQuery({
        queryKey: ["leave-departments"],
        queryFn: () => LeaveService.getDepartments(accessToken),
        enabled: !!accessToken,
        staleTime: 60_000,
    });

    const [deptMins, setDeptMins] = useState<Record<string, number>>({});

    useEffect(() => {
        if (departments.length > 0) {
            const map: Record<string, number> = {};
            for (const d of departments) map[d.id] = d.minLeaveHeadcount;
            setDeptMins(map);
        }
    }, [departments]);

    const updateDeptMinMutation = useMutation({
        mutationFn: ({ deptId, min }: { deptId: string; min: number }) =>
            LeaveService.updateDeptMin(accessToken, deptId, min),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leave-departments"] }),
    });

    // ── Save (policy + settings together) ─────────────────────────────────────
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveOk, setSaveOk] = useState(false);

    async function handleSaveAll() {
        setSaving(true); setSaveError(null); setSaveOk(false);
        try {
            const allTypeCodes = [...ALL_LEAVE_TYPES, ...customTypes.map((c) => c.code)];
            // Save policy + settings in parallel, then auto-apply so balances appear immediately
            await Promise.all([
                LeaveService.upsertPolicy(accessToken, {
                    year,
                    entries: allTypeCodes.map((type) => ({ type, allocated: allocations[type] ?? 0 })),
                }),
                LeaveService.updateSettings(accessToken, { workingDays, enabledTypes, customLeaveTypes: customTypes }),
            ]);
            // Auto-apply to all employees so the dashboard shows balances right away
            const result = await LeaveService.applyPolicy(accessToken, year);
            setApplyResult(result);
            queryClient.invalidateQueries({ queryKey: ["leave-policy", year] });
            queryClient.invalidateQueries({ queryKey: ["leave-settings"] });
            queryClient.invalidateQueries({ queryKey: ["leave-balance"] });
            setSaveOk(true);
            setTimeout(() => setSaveOk(false), 4000);
        } catch (e: unknown) {
            setSaveError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }

    const applyMutation = useMutation({
        mutationFn: () => LeaveService.applyPolicy(accessToken, year),
        onSuccess: (data) => {
            setApplyResult(data);
            setConfirmApply(false);
            queryClient.invalidateQueries({ queryKey: ["leave-balance"] });
        },
    });

    const allTypeCodes = [...ALL_LEAVE_TYPES, ...customTypes.map((c) => c.code)];
    const activeCount = enabledTypes.length === 0 ? allTypeCodes.length : enabledTypes.length;
    const totalDays = allTypeCodes.reduce((s, t) => s + (allocations[t] ?? 0), 0);

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <div>
                <Link href="/leave/manage" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to Manage
                </Link>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-lg font-bold text-slate-900">Leave Policy</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Configure leave types, allocations, working days, and department minimums.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                            <select
                                value={year}
                                onChange={(e) => { setYear(Number(e.target.value)); setApplyResult(null); initPolicyRef.current = ""; }}
                                className="appearance-none bg-white border border-slate-200 rounded-xl pl-4 pr-9 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                                {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                        </div>
                        <button
                            onClick={handleSaveAll}
                            disabled={saving}
                            className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {saving ? "Saving & Applying…" : "Save Policy & Apply"}
                        </button>
                    </div>
                </div>
            </div>

            {saveError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {saveError}
                </div>
            )}
            {saveOk && applyResult && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 px-4 py-3 rounded-xl">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Policy saved and applied to <strong>{applyResult.applied}</strong> employee{applyResult.applied !== 1 ? "s" : ""} for {year}.
                </div>
            )}
            {saveOk && !applyResult && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 px-4 py-3 rounded-xl">
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> Policy and settings saved.
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* ── Left: leave types table + working days + depts ── */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Leave types unified table */}
                    <div className="bg-white rounded-xl border border-slate-200">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                            <div>
                                <p className="text-sm font-semibold text-slate-800">Leave Types — {year}</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Toggle to activate or deactivate. Inactive types are hidden from employees.
                                </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 text-xs text-slate-400">
                                <span>{activeCount} active</span>
                                <span>·</span>
                                <span>{totalDays} total days</span>
                            </div>
                        </div>

                        <div className="px-5">
                            {(policyLoading || settingsLoading) ? (
                                <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-sm">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                                </div>
                            ) : (
                                <>
                                    {/* Built-in types */}
                                    {ALL_LEAVE_TYPES.map((typeCode) => (
                                        <LeaveTypeRow
                                            key={typeCode}
                                            typeCode={typeCode}
                                            label={LEAVE_TYPE_LABELS[typeCode] ?? typeCode}
                                            value={allocations[typeCode] ?? 0}
                                            active={isActive(typeCode)}
                                            onChangeDays={(v) => setAllocations((prev) => ({ ...prev, [typeCode]: v }))}
                                            onToggle={() => toggleActive(typeCode)}
                                        />
                                    ))}

                                    {/* Custom types */}
                                    {customTypes.map((ct) => (
                                        <LeaveTypeRow
                                            key={ct.code}
                                            typeCode={ct.code}
                                            label={ct.name}
                                            value={allocations[ct.code] ?? 0}
                                            active={isActive(ct.code)}
                                            isCustom
                                            onChangeDays={(v) => setAllocations((prev) => ({ ...prev, [ct.code]: v }))}
                                            onToggle={() => toggleActive(ct.code)}
                                            onDelete={() => handleDeleteCustom(ct.code)}
                                        />
                                    ))}
                                </>
                            )}
                        </div>

                        {/* Add custom type row */}
                        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50">
                            <p className="text-xs font-semibold text-slate-500 mb-2">Add Custom Leave Type</p>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newTypeName}
                                    onChange={(e) => { setNewTypeName(e.target.value); setAddError(""); }}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddType(); } }}
                                    placeholder="e.g., Sabbatical Leave"
                                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddType}
                                    className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors shrink-0"
                                >
                                    <Plus className="h-3.5 w-3.5" /> Add
                                </button>
                            </div>
                            {addError && <p className="text-xs text-red-500 mt-1.5">{addError}</p>}
                            {newTypeName && !addError && (
                                <p className="text-xs text-slate-400 mt-1.5">
                                    Code: <span className="font-mono text-slate-600">{toCode(newTypeName) || "—"}</span>
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Working days */}
                    <div className="bg-white rounded-xl border border-slate-200">
                        <div className="px-5 py-4 border-b border-slate-100">
                            <p className="text-sm font-semibold text-slate-800">Working Days</p>
                            <p className="text-xs text-slate-400 mt-0.5">Select which days count as working days for leave calculations.</p>
                        </div>
                        <div className="px-5 py-4">
                            {settingsLoading ? (
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 flex-wrap">
                                    {ALL_DAYS.map((day) => (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={() => setWorkingDays((prev) =>
                                                prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
                                            )}
                                            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                                workingDays.includes(day)
                                                    ? "bg-indigo-600 text-white"
                                                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                            }`}
                                        >
                                            {WORKING_DAY_LABELS[day]}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <p className="text-xs text-slate-400 mt-3">
                                {workingDays.length} working day{workingDays.length !== 1 ? "s" : ""} per week selected
                            </p>
                        </div>
                    </div>

                    {/* Department minimum headcounts */}
                    <div className="bg-white rounded-xl border border-slate-200">
                        <div className="px-5 py-4 border-b border-slate-100">
                            <p className="text-sm font-semibold text-slate-800">Department Minimum Headcount</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Minimum staff that must remain present in each department. Leave cannot be approved below this.
                            </p>
                        </div>
                        <div className="px-5 py-2">
                            {deptsLoading ? (
                                <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                                </div>
                            ) : departments.length === 0 ? (
                                <p className="py-4 text-sm text-slate-400">No departments found.</p>
                            ) : (
                                departments.map((dept: LeaveDepartment) => (
                                    <div key={dept.id} className="flex items-center gap-4 py-3 border-b border-slate-100 last:border-0">
                                        <p className="flex-1 text-sm font-medium text-slate-800">{dept.name}</p>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button type="button"
                                                onClick={() => setDeptMins((p) => ({ ...p, [dept.id]: Math.max(0, (p[dept.id] ?? dept.minLeaveHeadcount) - 1) }))}
                                                className="h-7 w-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center text-sm font-bold">−</button>
                                            <span className="w-10 text-center text-sm font-semibold text-slate-900">
                                                {deptMins[dept.id] ?? dept.minLeaveHeadcount}
                                            </span>
                                            <button type="button"
                                                onClick={() => setDeptMins((p) => ({ ...p, [dept.id]: (p[dept.id] ?? dept.minLeaveHeadcount) + 1 }))}
                                                className="h-7 w-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center text-sm font-bold">+</button>
                                            <button
                                                onClick={() => updateDeptMinMutation.mutate({ deptId: dept.id, min: deptMins[dept.id] ?? dept.minLeaveHeadcount })}
                                                disabled={updateDeptMinMutation.isPending}
                                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors disabled:opacity-50 ml-1"
                                            >Save</button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Right: apply panel ── */}
                <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                                <Users className="h-4 w-4 text-indigo-600" />
                            </div>
                            <p className="text-sm font-semibold text-slate-800">Re-apply to All Employees</p>
                        </div>
                        <p className="text-xs text-slate-500">
                            Use this after adding new employees mid-year. Saving already applies automatically — this is for re-syncing. Existing <span className="font-medium text-slate-700">used</span> days are preserved.
                        </p>

                        {applyResult && (
                            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-emerald-700">
                                    Applied to <span className="font-bold">{applyResult.applied}</span> employee{applyResult.applied !== 1 ? "s" : ""} for {applyResult.year}.
                                </p>
                            </div>
                        )}

                        {!confirmApply ? (
                            <button
                                onClick={() => setConfirmApply(true)}
                                disabled={applyMutation.isPending}
                                className="w-full inline-flex items-center justify-center gap-2 border border-indigo-200 text-indigo-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                            >
                                <Users className="h-4 w-4" /> Re-apply to All Employees
                            </button>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    This will overwrite <strong>allocated</strong> days for every employee for {year}. Used days won&apos;t change.
                                </p>
                                <div className="flex gap-2">
                                    <button onClick={() => setConfirmApply(false)}
                                        className="flex-1 text-sm text-slate-500 border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                                    <button
                                        onClick={() => applyMutation.mutate()}
                                        disabled={applyMutation.isPending}
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-3 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                    >
                                        {applyMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…</> : "Confirm"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">How it works</p>
                        <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
                            <li>Toggle types on/off and set days per type</li>
                            <li>Add any custom leave types your company offers</li>
                            <li>Click <span className="font-medium text-slate-700">Save Policy &amp; Apply</span> — balances update immediately</li>
                            <li>Set department minimums per department</li>
                            <li>Use <span className="font-medium text-slate-700">Re-apply to All Employees</span> after adding new staff</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
}
