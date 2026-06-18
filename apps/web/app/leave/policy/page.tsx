"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
    LeaveService, LeaveType, LEAVE_TYPE_LABELS, ALL_LEAVE_TYPES,
    WORKING_DAY_LABELS, LeaveDepartment,
} from "@/services/leave.service";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { ArrowLeft, Save, Users, CheckCircle2, ChevronDown, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0]; // Mon→Sat→Sun display order

function PolicyRow({
    type,
    value,
    onChange,
}: {
    type: LeaveType;
    value: number;
    onChange: (v: number) => void;
}) {
    const [display, setDisplay] = useState(String(value));

    useEffect(() => { setDisplay(String(value)); }, [value]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const raw = e.target.value.replace(/[^0-9]/g, "");
        setDisplay(raw);
        if (raw !== "") onChange(Math.min(365, parseInt(raw)));
    }

    function handleBlur() {
        const num = Math.min(365, Math.max(0, parseInt(display) || 0));
        setDisplay(String(num));
        onChange(num);
    }

    function step(delta: number) {
        const next = Math.min(365, Math.max(0, value + delta));
        onChange(next);
        setDisplay(String(next));
    }

    return (
        <div className="flex items-center gap-4 py-3 border-b border-slate-100 last:border-0">
            <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{LEAVE_TYPE_LABELS[type]}</p>
                <p className="text-xs text-slate-400 mt-0.5">per employee per year</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => step(-1)}
                    className="h-7 w-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center text-sm font-bold transition-colors">
                    −
                </button>
                <input
                    type="text"
                    inputMode="numeric"
                    value={display}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className="w-16 text-center rounded-lg border border-slate-200 px-2 py-1 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button type="button" onClick={() => step(1)}
                    className="h-7 w-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center text-sm font-bold transition-colors">
                    +
                </button>
                <span className="text-xs text-slate-400 w-8">days</span>
            </div>
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

    // ── Policy allocations ─────────────────────────────────────────────────
    const [year, setYear] = useState(CURRENT_YEAR);
    const [allocations, setAllocations] = useState<Record<LeaveType, number>>(() =>
        Object.fromEntries(ALL_LEAVE_TYPES.map((t) => [t, 0])) as Record<LeaveType, number>,
    );
    const [applyResult, setApplyResult] = useState<{ applied: number; year: number } | null>(null);
    const [confirmApply, setConfirmApply] = useState(false);
    const initKeyRef = useRef("");

    const { data: policyData, isLoading: policyLoading } = useQuery({
        queryKey: ["leave-policy", year],
        queryFn: () => LeaveService.getPolicy(accessToken, year),
        enabled: !!accessToken,
    });

    useEffect(() => {
        if (policyData === undefined) return;
        const key = `${year}:${policyData.map((p) => `${p.type}=${p.allocated}`).sort().join(",")}`;
        if (initKeyRef.current === key) return;
        initKeyRef.current = key;
        const base = Object.fromEntries(ALL_LEAVE_TYPES.map((t) => [t, 0])) as Record<LeaveType, number>;
        for (const p of policyData) base[p.type as LeaveType] = p.allocated;
        setAllocations(base);
    }, [policyData, year]);

    const savePolicyMutation = useMutation({
        mutationFn: () =>
            LeaveService.upsertPolicy(accessToken, {
                year,
                entries: ALL_LEAVE_TYPES.map((type) => ({ type, allocated: allocations[type] })),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["leave-policy", year] });
            setApplyResult(null);
        },
    });

    const applyMutation = useMutation({
        mutationFn: () => LeaveService.applyPolicy(accessToken, year),
        onSuccess: (data) => {
            setApplyResult(data);
            setConfirmApply(false);
            queryClient.invalidateQueries({ queryKey: ["leave-balance"] });
        },
    });

    // ── Settings: working days + enabled types ─────────────────────────────
    const { data: settings, isLoading: settingsLoading } = useQuery({
        queryKey: ["leave-settings"],
        queryFn: () => LeaveService.getSettings(accessToken),
        enabled: !!accessToken,
        staleTime: 30_000,
    });

    const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [enabledTypes, setEnabledTypes] = useState<string[]>([]);
    const [settingsInit, setSettingsInit] = useState(false);

    useEffect(() => {
        if (settings && !settingsInit) {
            setWorkingDays(settings.workingDays);
            setEnabledTypes(settings.enabledTypes);
            setSettingsInit(true);
        }
    }, [settings, settingsInit]);

    const saveSettingsMutation = useMutation({
        mutationFn: () =>
            LeaveService.updateSettings(accessToken, { workingDays, enabledTypes }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leave-settings"] }),
    });

    function toggleDay(day: number) {
        setWorkingDays((prev) =>
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
        );
    }

    function toggleLeaveType(type: string) {
        setEnabledTypes((prev) =>
            prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
        );
    }

    // ── Departments min headcount ──────────────────────────────────────────
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

    const totalDays = Object.values(allocations).reduce((s, v) => s + v, 0);

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <div>
                <Link href="/leave/manage" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to Manage
                </Link>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-lg font-bold text-slate-900">Leave Policy</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Configure leave allocations, enabled types, working days, and department minimums.
                        </p>
                    </div>
                    <div className="relative shrink-0">
                        <select
                            value={year}
                            onChange={(e) => { setYear(Number(e.target.value)); setApplyResult(null); }}
                            className="appearance-none bg-white border border-slate-200 rounded-xl pl-4 pr-9 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* ── Left: allocations + settings ── */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Allocations */}
                    <div className="bg-white rounded-xl border border-slate-200">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-800">Days per Leave Type — {year}</p>
                            <span className="text-xs text-slate-400">{totalDays} total days</span>
                        </div>
                        <div className="px-5">
                            {policyLoading ? (
                                <div className="flex items-center justify-center py-10 gap-2 text-slate-400 text-sm">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                                </div>
                            ) : (
                                ALL_LEAVE_TYPES.map((type) => (
                                    <PolicyRow
                                        key={type}
                                        type={type}
                                        value={allocations[type]}
                                        onChange={(v) => setAllocations((prev) => ({ ...prev, [type]: v }))}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {savePolicyMutation.error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {(savePolicyMutation.error as Error).message}
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button
                            onClick={() => savePolicyMutation.mutate()}
                            disabled={savePolicyMutation.isPending || policyLoading}
                            className="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            {savePolicyMutation.isPending
                                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                                : <><Save className="h-4 w-4" /> Save Policy</>
                            }
                        </button>
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
                                            onClick={() => toggleDay(day)}
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

                    {/* Leave type toggles */}
                    <div className="bg-white rounded-xl border border-slate-200">
                        <div className="px-5 py-4 border-b border-slate-100">
                            <p className="text-sm font-semibold text-slate-800">Enabled Leave Types</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Uncheck a type to hide it from employees. All types are enabled if none are selected.
                            </p>
                        </div>
                        <div className="px-5 py-4 space-y-2">
                            {settingsLoading ? (
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                                </div>
                            ) : (
                                ALL_LEAVE_TYPES.map((type) => {
                                    const active = enabledTypes.length === 0 || enabledTypes.includes(type);
                                    return (
                                        <label key={type} className="flex items-center gap-3 py-1.5 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={active}
                                                onChange={() => {
                                                    // If currently "all enabled" (empty array), toggling off means we specify everything EXCEPT this
                                                    if (enabledTypes.length === 0) {
                                                        setEnabledTypes(ALL_LEAVE_TYPES.filter((t) => t !== type));
                                                    } else {
                                                        toggleLeaveType(type);
                                                        // If we just enabled the last one, reset to empty (all enabled)
                                                        if (!enabledTypes.includes(type) && enabledTypes.length + 1 === ALL_LEAVE_TYPES.length) {
                                                            setEnabledTypes([]);
                                                        }
                                                    }
                                                }}
                                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className={`text-sm ${active ? "text-slate-800" : "text-slate-400 line-through"}`}>
                                                {LEAVE_TYPE_LABELS[type]}
                                            </span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Save settings */}
                    {saveSettingsMutation.error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {(saveSettingsMutation.error as Error).message}
                        </div>
                    )}
                    {saveSettingsMutation.isSuccess && (
                        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 px-4 py-3 rounded-xl">
                            <CheckCircle2 className="h-4 w-4 shrink-0" /> Settings saved.
                        </div>
                    )}
                    <div className="flex justify-end">
                        <button
                            onClick={() => saveSettingsMutation.mutate()}
                            disabled={saveSettingsMutation.isPending}
                            className="inline-flex items-center gap-2 bg-slate-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-900 disabled:opacity-50 transition-colors"
                        >
                            {saveSettingsMutation.isPending
                                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                                : <><Save className="h-4 w-4" /> Save Settings</>
                            }
                        </button>
                    </div>

                    {/* Department minimum headcounts */}
                    <div className="bg-white rounded-xl border border-slate-200">
                        <div className="px-5 py-4 border-b border-slate-100">
                            <p className="text-sm font-semibold text-slate-800">Department Minimum Headcount</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Minimum number of staff that must remain present (not on leave) in each department.
                                Leave cannot be approved if it would drop below this.
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
                                                className="h-7 w-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center text-sm font-bold transition-colors">
                                                −
                                            </button>
                                            <span className="w-10 text-center text-sm font-semibold text-slate-900">
                                                {deptMins[dept.id] ?? dept.minLeaveHeadcount}
                                            </span>
                                            <button type="button"
                                                onClick={() => setDeptMins((p) => ({ ...p, [dept.id]: (p[dept.id] ?? dept.minLeaveHeadcount) + 1 }))}
                                                className="h-7 w-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center text-sm font-bold transition-colors">
                                                +
                                            </button>
                                            <button
                                                onClick={() => updateDeptMinMutation.mutate({ deptId: dept.id, min: deptMins[dept.id] ?? dept.minLeaveHeadcount })}
                                                disabled={updateDeptMinMutation.isPending}
                                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors disabled:opacity-50 ml-1"
                                            >
                                                Save
                                            </button>
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
                            <p className="text-sm font-semibold text-slate-800">Apply to All Employees</p>
                        </div>
                        <p className="text-xs text-slate-500">
                            Pushes the {year} policy allocations to every employee in the organisation.
                            Existing <span className="font-medium text-slate-700">used</span> days are preserved.
                        </p>

                        {applyResult ? (
                            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-emerald-700">
                                    Applied to <span className="font-bold">{applyResult.applied}</span> employee{applyResult.applied !== 1 ? "s" : ""} for {applyResult.year}.
                                </p>
                            </div>
                        ) : null}

                        {!confirmApply ? (
                            <button
                                onClick={() => setConfirmApply(true)}
                                disabled={applyMutation.isPending}
                                className="w-full inline-flex items-center justify-center gap-2 border border-indigo-200 text-indigo-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                            >
                                <Users className="h-4 w-4" /> Apply to All Employees
                            </button>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    This will overwrite the <strong>allocated</strong> days for every employee for {year}. Used days won&apos;t be affected.
                                </p>
                                <div className="flex gap-2">
                                    <button onClick={() => setConfirmApply(false)}
                                        className="flex-1 text-sm text-slate-500 border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => applyMutation.mutate()}
                                        disabled={applyMutation.isPending}
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-3 py-2 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                    >
                                        {applyMutation.isPending
                                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…</>
                                            : "Confirm"
                                        }
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">How it works</p>
                        <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
                            <li>Set the days for each leave type above</li>
                            <li>Click <span className="font-medium text-slate-700">Save Policy</span> to store the company policy</li>
                            <li>Configure working days and enabled types, then <span className="font-medium text-slate-700">Save Settings</span></li>
                            <li>Set department minimums per department</li>
                            <li>Click <span className="font-medium text-slate-700">Apply to All Employees</span> to push allocations to all staff</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
}
