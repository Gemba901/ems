"use client";

import { ConfirmDialog } from "@/components/patterns/ConfirmDialog";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TenantImage } from "@/components/files/TenantImage";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import {
    Search, X, ChevronRight, TrendingUp,
    ChevronLeft, Loader2, BarChart3, UserPlus,
    CheckCircle2, ArrowRight, AlertCircle, Plus, Building2,
    Pencil, Trash2, ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { COUNTRY_CODES } from "@/lib/countries";

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
    const [countryCode, setCountryCode]   = useState("254");
    const [showCodes, setShowCodes]       = useState(false);
    const [deptId,    setDeptId]          = useState("");
    const [roleId,    setRoleId]          = useState<number>(5);

    const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) ?? COUNTRY_CODES[0];

    const [localDepts, setLocalDepts] = useState<{ id: string; name: string }[]>([]);
    const [showNewDept, setShowNewDept] = useState(false);
    const [newDeptName, setNewDeptName] = useState("");
    const [creatingDept, setCreatingDept] = useState(false);
    const [deptError, setDeptError] = useState<string | null>(null);

    useEffect(() => { setLocalDepts(departments); }, [departments]);

    function resetForm() {
        setStep(1);
        setFirstName(""); setLastName(""); setEmail("");
        setPhone(""); setCountryCode("254"); setShowCodes(false);
        setDeptId(""); setRoleId(5);
        setError(null);
        setShowNewDept(false); setNewDeptName(""); setDeptError(null);
    }

    async function handleCreateDept() {
        if (creatingDept || !newDeptName.trim()) return;
        setCreatingDept(true);
        setDeptError(null);
        try {
            const created = await EmployeeService.createDepartment(newDeptName.trim(), accessToken);
            setLocalDepts((prev) => [...prev, { id: created.id, name: created.name }]);
            setDeptId(created.id);
            setShowNewDept(false);
            setNewDeptName("");
        } catch (error: unknown) {
            setDeptError(error instanceof Error && error.message ? error.message : "Failed to create department.");
        } finally {
            setCreatingDept(false);
        }
    }

    function handleClose() {
        resetForm();
        onClose();
    }

    function isValidPhone(p: string) {
        const digits = p.replace(/\s/g, "");
        return /^\d+$/.test(digits) && digits.length >= 9;
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
                { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), phone: `${countryCode}${phone.trim()}`, departmentId: deptId || undefined, roleId },
                accessToken,
            );
            const fullName = `${firstName.trim()} ${lastName.trim()}`;
            resetForm();
            onSuccess(fullName);
        } catch (error: unknown) {
            setError(error instanceof Error && error.message ? error.message : "Failed to onboard employee.");
        } finally {
            setSubmitting(false);
        }
    }

    const inputCls = "w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/25 focus:border-ring transition-all";
    const labelCls = "block text-xs font-semibold text-muted-foreground mb-1.5";

    return (
        <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !submitting && !creatingDept) handleClose(); }}>
            <SheetContent showCloseButton={false} className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                            <UserPlus className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                            <SheetTitle className="text-sm font-bold">Onboard Employee</SheetTitle>
                            <SheetDescription className="text-xs">Step {step} of 2</SheetDescription>
                        </div>
                    </div>
                    <Button variant="ghost" aria-label="Close" onClick={handleClose} disabled={submitting || creatingDept} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2 px-6 pt-5">
                    {[1, 2].map((s) => (
                        <div key={s} className="flex items-center gap-2 flex-1">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors ${step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                {step > s ? <CheckCircle2 className="h-3.5 w-3.5" /> : s}
                            </div>
                            <span className={`text-xs font-medium ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
                                {s === 1 ? "Personal details" : "Role & department"}
                            </span>
                            {s < 2 && <div className={`flex-1 h-px ${step > s ? "bg-primary" : "bg-muted"}`} />}
                        </div>
                    ))}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

                    {error && (
                        <div role="alert" className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
                    )}

                    {step === 1 && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="hr-firstName" className={labelCls}>First name <span className="text-destructive">*</span></label>
                                    <Input
                                        id="hr-firstName"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        placeholder="e.g. Jane"
                                        className={inputCls}
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label htmlFor="hr-lastName" className={labelCls}>Last name <span className="text-destructive">*</span></label>
                                    <Input
                                        id="hr-lastName"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        placeholder="e.g. Doe"
                                        className={inputCls}
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="hr-email" className={labelCls}>Work email <span className="text-destructive">*</span></label>
                                <Input
                                    type="email"
                                    id="hr-email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="jane.doe@company.com"
                                    className={inputCls}
                                />
                                <p className="text-[11px] text-muted-foreground mt-1.5">This will be their login email once they set a password.</p>
                            </div>

                            <div>
                                <label htmlFor="hr-phone" className={labelCls}>Phone number <span className="text-destructive">*</span></label>
                                <div className="flex rounded-xl overflow-visible border border-border bg-muted/50 focus-within:ring-2 focus-within:ring-ring/25 focus-within:border-ring transition-all">
                                    <div className="relative shrink-0">
                                        <Button variant="ghost"
                                            type="button"
                                            aria-label="Country calling code" aria-expanded={showCodes}
                                            onClick={() => setShowCodes((v) => !v)}
                                            className="flex items-center gap-1.5 h-full px-3 text-sm font-medium text-muted-foreground bg-muted border-r border-border rounded-l-xl hover:bg-muted/60 transition-colors whitespace-nowrap"
                                        >
                                            <span>{selectedCountry.flag}</span>
                                            <span>+{selectedCountry.code}</span>
                                            <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform shrink-0 ${showCodes ? "rotate-180" : ""}`} />
                                        </Button>

                                        {showCodes && (
                                            <div className="absolute top-full left-0 z-20 mt-1 w-44 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                                                {COUNTRY_CODES.map((c) => (
                                                    <Button variant="ghost"
                                                        key={c.code}
                                                        type="button"
                                                        onClick={() => { setCountryCode(c.code); setShowCodes(false); }}
                                                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors ${
                                                            c.code === countryCode ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                                                        }`}
                                                    >
                                                        <span>{c.flag}</span>
                                                        <span>+{c.code}</span>
                                                        <span className="text-muted-foreground ml-auto">{c.name}</span>
                                                    </Button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <Input
                                        type="tel"
                                        id="hr-phone"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                                        placeholder="700 000 000"
                                        maxLength={10}
                                        className="flex-1 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none bg-transparent rounded-r-xl"
                                    />
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-1.5">Select country and enter the number without the leading 0.</p>
                            </div>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            {/* Preview chip */}
                            <div className="flex items-center gap-3 bg-primary/10 rounded-xl px-4 py-3">
                                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                                    {firstName[0]?.toUpperCase()}{lastName[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-primary">{firstName} {lastName}</p>
                                    <p className="text-xs text-primary truncate">{email}</p>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="hr-role" className={labelCls}>Role <span className="text-destructive">*</span></label>
                                <NativeSelect
                                    id="hr-role"
                                    value={roleId}
                                    onChange={(e) => setRoleId(Number(e.target.value))}
                                    className={inputCls}
                                >
                                    {ASSIGNABLE_ROLES.map((r) => (
                                        <option key={r.id} value={r.id}>{r.label}</option>
                                    ))}
                                </NativeSelect>
                                <p className="text-[11px] text-muted-foreground mt-1.5">You can change this later from the members settings.</p>
                            </div>

                            <div>
                                <label htmlFor="hr-department" className={labelCls}>Department <span className="text-muted-foreground font-normal">(optional)</span></label>
                                {showNewDept ? (
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <Input
                                                autoFocus
                                                id="hr-department"
                                                value={newDeptName}
                                                onChange={(e) => { setNewDeptName(e.target.value); setDeptError(null); }}
                                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCreateDept(); } }}
                                                placeholder="e.g. Engineering"
                                                className={inputCls}
                                            />
                                            <Button
                                                type="button"
                                                onClick={() => void handleCreateDept()}
                                                disabled={creatingDept || !newDeptName.trim()}
                                            >
                                                {creatingDept ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                                            </Button>
                                        </div>
                                        <Button variant="ghost"
                                            type="button"
                                            onClick={() => { setShowNewDept(false); setNewDeptName(""); setDeptError(null); }}
                                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            ← Back to list
                                        </Button>
                                        {deptError && <p className="text-xs text-destructive mt-1">{deptError}</p>}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <NativeSelect
                                            id="hr-department"
                                            value={deptId}
                                            onChange={(e) => setDeptId(e.target.value)}
                                            className={inputCls}
                                        >
                                            <option value="">Not assigned yet</option>
                                            {localDepts.map((d) => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </NativeSelect>
                                        <Button variant="ghost"
                                            type="button"
                                            onClick={() => { setShowNewDept(true); setDeptError(null); }}
                                            className="flex items-center gap-1.5 text-xs font-medium text-primary transition-colors"
                                        >
                                            <Plus className="h-3 w-3" /> New department
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Summary card */}
                            <div className="bg-muted rounded-xl border border-border p-4 space-y-2 text-xs">
                                <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Summary</p>
                                <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium text-foreground">{firstName} {lastName}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium text-foreground truncate max-w-50">{email}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-medium text-foreground">+{countryCode} {phone}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span className="font-medium text-foreground">{ASSIGNABLE_ROLES.find(r => r.id === roleId)?.label}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Department</span><span className="font-medium text-foreground">{localDepts.find(d => d.id === deptId)?.name ?? "Unassigned"}</span></div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-border px-6 py-4 flex items-center justify-between gap-3">
                    {step === 1 ? (
                        <Button variant="ghost" onClick={handleClose} disabled={submitting || creatingDept} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                            Cancel
                        </Button>
                    ) : (
                        <Button variant="ghost" onClick={() => { setStep(1); setError(null); }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                            <ChevronLeft className="h-4 w-4" /> Back
                        </Button>
                    )}

                    {step === 1 ? (
                        <Button
                            onClick={() => { setError(null); setStep(2); }}
                            disabled={!canProceed()}
                        >
                            Next <ArrowRight className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            onClick={handleSubmit}
                            disabled={submitting}
                        >
                            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Onboarding…</> : "Confirm & Onboard"}
                        </Button>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

// ─── Create / edit department panel ──────────────────────────────────────────

interface DepartmentPanelProps {
    open: boolean;
    mode: "create" | "edit";
    department?: { id: string; name: string } | null;
    onClose: () => void;
    accessToken: string;
    onSuccess: (name: string) => void;
}

function DepartmentPanel({ open, mode, department, onClose, accessToken, onSuccess }: DepartmentPanelProps) {
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setName(mode === "edit" ? (department?.name ?? "") : "");
            setError(null);
            setSubmitting(false);
        }
    }, [open, mode, department]);

    async function handleSubmit() {
        const trimmed = name.trim();
        if (!trimmed) return;

        setSubmitting(true);
        setError(null);
        try {
            const result = mode === "edit" && department
                ? await EmployeeService.updateDepartment(department.id, trimmed, accessToken)
                : await EmployeeService.createDepartment(trimmed, accessToken);
            onSuccess(result.name);
            onClose();
        } catch (error: unknown) {
            setError(error instanceof Error && error.message ? error.message : `Failed to ${mode === "edit" ? "rename" : "create"} department.`);
        } finally {
            setSubmitting(false);
        }
    }

    const isEdit = mode === "edit";

    return (
        <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !submitting) onClose(); }}>
            <SheetContent showCloseButton={false} className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
                <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                            <SheetTitle className="text-sm font-bold">{isEdit ? "Rename Department" : "Create Department"}</SheetTitle>
                            <SheetDescription className="text-xs">
                                {isEdit ? "Update this department's name" : "Add a new department for your organization"}
                            </SheetDescription>
                        </div>
                    </div>
                    <Button variant="ghost" aria-label="Close" onClick={onClose} disabled={submitting} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 px-6 py-6 space-y-5">
                    {error && (
                        <div role="alert" className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
                    )}

                    <div>
                        <label htmlFor="hr-name" className="block text-xs font-semibold text-muted-foreground mb-1.5">Department name</label>
                        <Input
                            id="hr-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Engineering"
                            className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/25 focus:border-ring transition-all"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="border-t border-border px-6 py-4 flex items-center justify-between gap-3">
                    <Button variant="ghost" onClick={onClose} disabled={submitting} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void handleSubmit()}
                        disabled={submitting || !name.trim()}
                    >
                        {submitting
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> {isEdit ? "Saving…" : "Creating…"}</>
                            : isEdit ? "Save Changes" : "Create Department"}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

// ─── Success toast ────────────────────────────────────────────────────────────

function SuccessToast({ name, onDismiss, onAnother }: { name: string; onDismiss: () => void; onAnother: () => void }) {
    useEffect(() => {
        const t = setTimeout(onDismiss, 6000);
        return () => clearTimeout(t);
    }, [onDismiss]);

    return (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-card border border-success/20 shadow-xl rounded-2xl px-5 py-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="h-9 w-9 rounded-full bg-success-subtle flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{name} onboarded</p>
                <p className="text-xs text-muted-foreground">They can now set a password to log in.</p>
            </div>
            <div className="flex items-center gap-2 ml-2 shrink-0">
                <Button variant="ghost" onClick={onAnother} className="text-xs font-semibold text-primary transition-colors whitespace-nowrap">
                    + Add another
                </Button>
                <Button variant="ghost" aria-label="Dismiss notification" onClick={onDismiss} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function HRContent() {
    const { user, accessToken } = useAuthStore();
    const queryClient = useQueryClient();

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [deptFilter, setDeptFilter] = useState("");
    const [page, setPage] = useState(1);

    // onboarding state
    const [panelOpen, setPanelOpen] = useState(false);
    const [deptPanelOpen, setDeptPanelOpen] = useState(false);
    const [editingDept, setEditingDept] = useState<{ id: string; name: string } | null>(null);
    const [departmentToDelete, setDepartmentToDelete] = useState<(typeof departments)[number] | null>(null);
    const [deptActionError, setDeptActionError] = useState<string | null>(null);
    const [deletingDeptId, setDeletingDeptId] = useState<string | null>(null);
    const [successName, setSuccessName] = useState<string | null>(null);
    const [deptSuccessName, setDeptSuccessName] = useState<string | null>(null);
    const [deptSuccessVerb, setDeptSuccessVerb] = useState<"created" | "renamed">("created");

    const orgId = user?.organizationId ?? "";

    useEffect(() => {
        const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        if (!deptSuccessName) return;
        const t = window.setTimeout(() => setDeptSuccessName(null), 4000);
        return () => window.clearTimeout(t);
    }, [deptSuccessName]);

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

    function handleDepartmentCreateSuccess(name: string) {
        setDeptPanelOpen(false);
        setDeptSuccessVerb(editingDept ? "renamed" : "created");
        setEditingDept(null);
        setDeptSuccessName(name);
        queryClient.invalidateQueries({ queryKey: ["departments", orgId] });
    }

    async function handleDeleteDepartment(dept: { id: string; name: string; _count: { employees: number } }) {
        if (dept._count.employees > 0) return;

        setDeptActionError(null);
        setDeletingDeptId(dept.id);
        try {
            await EmployeeService.deleteDepartment(dept.id, accessToken!);
            queryClient.invalidateQueries({ queryKey: ["departments", orgId] });
        } catch (error: unknown) {
            setDeptActionError(error instanceof Error && error.message ? error.message : "Failed to delete department.");
            throw error;
        } finally {
            setDeletingDeptId(null);
        }
    }

    return (
        <div className="mx-auto space-y-8">
            <PageHeader
                title="People"
                description={total !== null
                    ? `${total.toLocaleString()} employee${total !== 1 ? "s" : ""} · ${departments.length} department${departments.length !== 1 ? "s" : ""}`
                    : "Loading…"}
                actions={<>
                    <Button variant="outline" nativeButton={false} render={<Link href="/hr/reports" />}>
                        <BarChart3 /> Analytics
                    </Button>
                    <Button variant="outline" onClick={() => { setEditingDept(null); setDeptPanelOpen(true); }}>
                        <Building2 /> Create Department
                    </Button>
                    <Button onClick={() => setPanelOpen(true)}>
                        <UserPlus /> Onboard Employee
                    </Button>
                </>}
            />

            {deptSuccessName && (
                <div className="rounded-xl border border-success/20 bg-success-subtle px-4 py-3 text-sm text-success">
                    Department <span className="font-semibold">{deptSuccessName}</span> {deptSuccessVerb} successfully.
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
                {/* Employee table */}
                <div className="xl:col-span-2 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                    {/* Toolbar */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 border-b border-border">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                aria-label="Search employees"
                                placeholder="Search employees…"
                                className="w-full pl-8 pr-8 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                            />
                            {search && (
                                <Button variant="ghost" aria-label="Clear employee search" onClick={() => setSearch("")} size="icon-xs" className="absolute right-1 top-1/2 -translate-y-1/2">
                                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <NativeSelect
                                aria-label="Filter by department"
                                value={deptFilter}
                                onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
                                className="flex-1 sm:flex-none text-xs border border-border rounded-lg px-2 py-1.5 text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 bg-card"
                            >
                                <option value="">All departments</option>
                                {departments.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </NativeSelect>
                            {total !== null && (
                                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                    {total} employee{total !== 1 ? "s" : ""}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <Table aria-label="Employees">
                            <TableHeader className="bg-muted border-b border-border">
                                <TableRow>
                                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Employee</TableHead>
                                    <TableHead className="hidden sm:table-cell px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Department</TableHead>
                                    <TableHead className="hidden md:table-cell px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Role</TableHead>
                                    <TableHead className="px-4 py-3" />
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-border">
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="px-5 py-10 text-center">
                                            <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Loading employees…
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : employees.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="px-5 py-10 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                                    <UserPlus className="h-5 w-5 text-muted-foreground" />
                                                </div>
                                                <p className="text-sm text-muted-foreground">
                                                    {search || deptFilter ? "No employees match your filters." : "No employees yet."}
                                                </p>
                                                {!search && !deptFilter && (
                                                    <Button variant="ghost"
                                                        onClick={() => setPanelOpen(true)}
                                                        className="text-xs font-semibold text-primary transition-colors"
                                                    >
                                                        Onboard your first employee →
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : employees.map((emp) => {
                                    const roleName = emp.user?.organizations?.[0]?.role?.name ?? "—";
                                    return (
                                        <TableRow
                                            key={emp.id}
                                            className="hover:bg-muted/60"
                                        >
                                            <TableCell className="px-4 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    {emp.avatarUrl ? (
                                                        <TenantImage src={emp.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover border border-border shrink-0" />
                                                    ) : (
                                                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                                            {emp.firstName[0]}{emp.lastName[0]}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <Link href={`/ems/employees/${emp.id}`} className="block truncate font-medium text-foreground hover:underline">{emp.firstName} {emp.lastName}</Link>
                                                        <p className="text-[11px] text-muted-foreground truncate">
                                                            <span className="sm:hidden">{emp.department?.name ?? roleName.replace(/_/g, " ").toLowerCase()}</span>
                                                            <span className="hidden sm:inline">{emp.email}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell px-4 py-3.5">
                                                {emp.department ? (
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{emp.department.name}</span>
                                                ) : <span className="text-muted-foreground text-xs">Unassigned</span>}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell px-4 py-3.5 text-xs text-muted-foreground capitalize">
                                                {roleName.replace(/_/g, " ").toLowerCase()}
                                            </TableCell>
                                            <TableCell className="px-4 py-3.5 text-right">
                                                <Button variant="ghost" size="icon-sm" nativeButton={false}
                                                    aria-label={`Open profile for ${emp.firstName} ${emp.lastName}`}
                                                    render={<Link href={`/ems/employees/${emp.id}`} />}
                                                >
                                                    <ChevronRight />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    {!loading && totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/50">
                            <p className="text-xs text-muted-foreground hidden sm:block">
                                Page {page} of {totalPages} · {total} employees
                            </p>
                            <p className="text-xs text-muted-foreground sm:hidden">
                                {page}/{totalPages}
                            </p>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost"
                                    aria-label="Previous page"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                                    .reduce<(number | "…")[]>((acc, p, i, arr) => {
                                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                                        acc.push(p);
                                        return acc;
                                    }, [])
                                    .map((p, i) =>
                                        p === "…" ? (
                                            <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                                        ) : (
                                            <Button variant="ghost"
                                                key={p}
                                                aria-current={page === p ? "page" : undefined}
                                                onClick={() => setPage(p as number)}
                                                className={`min-w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                                                    page === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                                                }`}
                                            >
                                                {p}
                                            </Button>
                                        )
                                    )}
                                <Button variant="ghost"
                                    aria-label="Next page"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Department sidebar */}
                <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-semibold text-foreground">Headcount by Department</p>
                    </div>
                    <div className="p-5 space-y-3">
                        {departments.length === 0 && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading…
                            </div>
                        )}
                        {deptActionError && (
                            <div role="alert" className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                                <p className="text-xs text-destructive">{deptActionError}</p>
                            </div>
                        )}
                        {departments.map((dept) => {
                            const count = dept._count.employees;
                            const pct = totalDeptEmployees > 0 ? Math.round((count / totalDeptEmployees) * 100) : 0;
                            return (
                                <div key={dept.id} className="group">
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="font-medium text-foreground truncate max-w-24">{dept.name}</span>
                                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                            <span className="text-muted-foreground tabular-nums">{count} ({pct}%)</span>
                                            <Button variant="ghost"
                                                onClick={() => { setEditingDept({ id: dept.id, name: dept.name }); setDeptPanelOpen(true); }}
                                                title="Rename department"
                                                className="text-muted-foreground hover:text-primary transition-all"
                                            >
                                                <Pencil className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost"
                                                onClick={() => setDepartmentToDelete(dept)}
                                                disabled={count > 0 || deletingDeptId === dept.id}
                                                title={count > 0 ? "Cannot delete: department has employees" : "Delete department"}
                                                className="text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:hover:text-muted-foreground transition-all"
                                            >
                                                {deletingDeptId === dept.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Department create/edit slide-over */}
            <ConfirmDialog
                open={departmentToDelete !== null}
                onOpenChange={(open) => { if (!open) setDepartmentToDelete(null); }}
                title="Delete department"
                description={`Delete "${departmentToDelete?.name ?? ""}"? This cannot be undone.`}
                confirmLabel="Delete department"
                destructive
                onConfirm={async () => {
                    if (departmentToDelete) await handleDeleteDepartment(departmentToDelete);
                }}
            />

            <DepartmentPanel
                open={deptPanelOpen}
                mode={editingDept ? "edit" : "create"}
                department={editingDept}
                onClose={() => { setDeptPanelOpen(false); setEditingDept(null); }}
                accessToken={accessToken ?? ""}
                onSuccess={handleDepartmentCreateSuccess}
            />

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
