"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { ErrorState } from "@/components/patterns/ErrorState";
import { PageHeader } from "@/components/patterns/PageHeader";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";
import { useQuery } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import ColumnMappingDialog from "@/components/employee-import/ColumnMappingDialog";
import { EmployeeImportMapping, SheetData, readWorkbook } from "@/lib/employee-import-mapping";
import { Role } from "@/types/role";
import {
    Users, Search, Loader2, Check, AlertCircle, UserX,
    ChevronLeft, ChevronRight, Upload, Columns3,
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
    SUPER_ADMIN: { bg: "bg-primary/10", text: "text-primary" },
    ADMIN:       { bg: "bg-primary/10", text: "text-primary" },
    MANAGEMENT:  { bg: "bg-info-subtle",   text: "text-info"   },
    HR:          { bg: "bg-rose-100",   text: "text-rose-700"   },
    HOD:         { bg: "bg-warning-subtle",  text: "text-warning"  },
    EMPLOYEE:    { bg: "bg-muted",  text: "text-muted-foreground"  },
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
        } catch (e: unknown) {
            setErrorMsg(e instanceof Error && e.message ? e.message : "Failed to update role");
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
        <TableRow className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
            {/* Avatar + Name */}
            <TableCell className="px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-foreground flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                        {getInitials(emp.firstName, emp.lastName)}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                            {emp.firstName} {emp.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                            {emp.email ?? <span className="italic text-muted-foreground">No email on file</span>}
                        </p>
                    </div>
                </div>
            </TableCell>

            {/* Department */}
            <TableCell className="px-4 py-3 hidden md:table-cell">
                <span className="text-sm text-muted-foreground">
                    {emp.department?.name ?? <span className="text-muted-foreground italic">Unassigned</span>}
                </span>
            </TableCell>

            {/* Current role badge */}
            <TableCell className="px-4 py-3 hidden sm:table-cell">
                {hasAccount && roleColor ? (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleColor.bg} ${roleColor.text}`}>
                        {currentRole?.name ?? "—"}
                    </span>
                ) : (
                    <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                        <UserX className="h-3 w-3" /> No account
                    </span>
                )}
            </TableCell>

            {/* Role selector + actions */}
            <TableCell className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                    {hasAccount ? (
                        <>
                            <NativeSelect
                                aria-label={`Role for ${emp.firstName} ${emp.lastName}`}
                                value={selectedId}
                                onChange={(e) => { setSelectedId(Number(e.target.value)); setSaveState("idle"); setErrorMsg(""); }}
                                disabled={saveState === "saving"}
                                className={`text-sm border rounded-lg px-2.5 py-1.5 bg-card focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors disabled:opacity-50 ${
                                    isDirty ? "border-primary text-primary" : "border-border text-foreground"
                                }`}
                            >
                                {ASSIGNABLE_ROLES.map((r) => (
                                    <option key={r.id} value={r.id}>{r.label}</option>
                                ))}
                            </NativeSelect>

                            {isDirty && (
                                <>
                                    <Button
                                        onClick={handleSave}
                                        disabled={saveState === "saving"}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-foreground bg-primary rounded-lg hover:bg-primary transition-colors disabled:opacity-50"
                                    >
                                        {saveState === "saving" ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Check className="h-3.5 w-3.5" />
                                        )}
                                        Save
                                    </Button>
                                    <Button variant="ghost"
                                        onClick={handleReset}
                                        className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
                                    >
                                        Reset
                                    </Button>
                                </>
                            )}

                            {saveState === "saved" && !isDirty && (
                                <span className="flex items-center gap-1 text-xs text-success font-medium">
                                    <Check className="h-3.5 w-3.5" /> Saved
                                </span>
                            )}

                            {saveState === "error" && (
                                <span className="flex items-center gap-1 text-xs text-danger font-medium">
                                    <AlertCircle className="h-3.5 w-3.5" /> {errorMsg}
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="text-xs text-muted-foreground italic">No user account linked</span>
                    )}
                </div>
            </TableCell>
        </TableRow>
    );
}

function MembersContent() {
    const importInput = useRef<HTMLInputElement>(null);
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
    const [importSheets, setImportSheets] = useState<SheetData[] | null>(null);
    const [importMapping, setImportMapping] = useState<EmployeeImportMapping | null>(null);
    const [mappingOpen, setMappingOpen] = useState(false);
    const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    const orgId = user?.organizationId ?? "";

    useEffect(() => () => {
        if (progressInterval.current) clearInterval(progressInterval.current);
    }, []);

    // debounce search
    useEffect(() => {
        const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    const { data: empData, isLoading: loading, error: loadError, refetch } = useQuery({
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

    // Step 1: read the workbook in the browser and let the user map its columns.
    const handleImportFileSelected = async (file: File) => {
        setImportFile(file);
        setImportSummary(null);
        setImportError(null);
        setImportMapping(null);
        try {
            setImportSheets(await readWorkbook(file));
            setMappingOpen(true);
        } catch {
            setImportSheets(null);
            setImportError("Couldn't read that file. Make sure it's an Excel workbook (.xlsx or .xls).");
        }
    };

    // Step 2: dry run with the confirmed mapping.
    const handleImportDryRun = async (mapping: EmployeeImportMapping) => {
        const file = importFile;
        if (!accessToken || !file) return;
        setImportMapping(mapping);
        setMappingOpen(false);
        setImportSummary(null);
        setImportError(null);
        setImporting(true);
        startProgress([
            { label: "Reading workbook…",   target: 40, duration: 600  },
            { label: "Validating records…", target: 88, duration: 2000 },
            { label: "Preparing preview…",  target: 94, duration: 1000 },
        ]);
        try {
            const summary = await EmployeeService.importEmployees(file, accessToken, true, mapping);
            finishProgress();
            setImportSummary(summary);
        } catch (e: unknown) {
            finishProgress();
            setImportError(e instanceof Error && e.message ? e.message : "Failed to read employee workbook.");
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
            const summary = await EmployeeService.importEmployees(importFile, accessToken, false, importMapping);
            finishProgress();
            setImportSummary(summary);
            await refetch();
        } catch (e: unknown) {
            finishProgress();
            setImportError(e instanceof Error && e.message ? e.message : "Failed to sync employees.");
        } finally {
            setImporting(false);
        }
    };

    const startIndex = (page - 1) * PAGE_SIZE + 1;
    const endIndex = Math.min(page * PAGE_SIZE, total ?? 0);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <PageHeader
                title="Team Members"
                description="Manage roles for everyone in your organization."
                breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Team Members" }]}
            />

            {/* Search + count */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-48 flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                        type="text"
                        aria-label="Search team members"
                        placeholder="Search by name, email or department…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                    />
                </div>
                {total !== null && (
                    <span className="text-sm text-muted-foreground font-medium shrink-0">
                        {total} member{total !== 1 ? "s" : ""}
                    </span>
                )}
                <Button variant="outline" type="button" onClick={() => importInput.current?.click()} disabled={importing}>
                    <Upload /> Import Excel
                </Button>
                <Input
                    ref={importInput}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    disabled={importing}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleImportFileSelected(file);
                    }}
                />
            </div>

            {importing && (
                <div className="rounded-2xl border border-primary/20 bg-card shadow-sm overflow-hidden">
                    <div className="px-5 pt-5 pb-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="relative h-8 w-8 flex items-center justify-center">
                                    <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                                    <div
                                        className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"
                                        style={{ animationDuration: "0.9s" }}
                                    />
                                    <Upload className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-foreground leading-tight">{importFile?.name ?? "Importing…"}</p>
                                    <p className="text-xs text-primary font-medium leading-tight mt-0.5">{importPhase}</p>
                                </div>
                            </div>
                            <span className="text-2xl font-black text-primary tabular-nums">{importProgress}%</span>
                        </div>

                        {/* Track */}
                        <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                            <div
                                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-300 ease-out"
                                style={{ width: `${importProgress}%` }}
                            />
                            {/* shimmer */}
                            <div
                                className="absolute inset-y-0 rounded-full bg-card/30 w-24 animate-pulse"
                                style={{ left: `calc(${importProgress}% - 24px)`, opacity: importProgress < 100 ? 1 : 0 }}
                            />
                        </div>
                    </div>
                    <div className="h-px bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
                    <div className="px-5 py-2.5 bg-muted/60">
                        <p className="text-[11px] text-muted-foreground">Please keep this page open while the import runs.</p>
                    </div>
                </div>
            )}

            {mappingOpen && importFile && importSheets && (
                <ColumnMappingDialog
                    fileName={importFile.name}
                    sheets={importSheets}
                    initialMapping={importMapping}
                    onCancel={() => setMappingOpen(false)}
                    onConfirm={(mapping) => void handleImportDryRun(mapping)}
                />
            )}

            {!importing && (importSummary || importError) && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
                    {importError && <p className="text-sm font-medium text-danger">{importError}</p>}
                    {importSheets && (importError || importSummary?.dryRun) ? (
                        <Button variant="ghost"
                            onClick={() => setMappingOpen(true)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                        >
                            <Columns3 className="h-3.5 w-3.5" /> Edit column mapping
                        </Button>
                    ) : null}
                    {importSummary && (
                        <>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-semibold text-foreground">{importFile?.name ?? "Workbook"}</span>
                                <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">{importSummary.validRows} valid rows</span>
                                <span className="px-2 py-0.5 rounded-full bg-success-subtle text-success border border-success/20">{importSummary.created} create</span>
                                <span className="px-2 py-0.5 rounded-full bg-info-subtle text-info border border-info/20">{importSummary.updated} update</span>
                                <span className="px-2 py-0.5 rounded-full bg-danger-subtle text-danger border border-danger/20">{importSummary.deleted} delete</span>
                                {importSummary.preserved > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-warning-subtle text-warning border border-warning/20">{importSummary.preserved} current admin preserved</span>
                                )}
                            </div>
                            {importSummary.issues.length > 0 ? (
                                <div className="text-xs text-danger space-y-1">
                                    {importSummary.issues.slice(0, 5).map((issue) => (
                                        <p key={`${issue.row}-${issue.message}`}>Row {issue.row}: {issue.message}</p>
                                    ))}
                                    {importSummary.issues.length > 5 && <p>{importSummary.issues.length - 5} more issue(s)</p>}
                                </div>
                            ) : importSummary.dryRun ? (
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <p className="text-xs text-muted-foreground">
                                        This sync will make your employee database match the workbook.
                                    </p>
                                    <Button
                                        onClick={handleImportCommit}
                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary"
                                    >
                                        Confirm Sync
                                    </Button>
                                </div>
                            ) : (
                                <p className="text-xs font-medium text-success">Employee data synced successfully.</p>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Table card */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm">Loading members…</span>
                    </div>
                ) : loadError ? (
                    <ErrorState title="Could not load team members" description={loadError.message} onRetry={() => void refetch()} />
                ) : employees.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                        <Users className="h-8 w-8" />
                        <p className="text-sm">
                            {debouncedSearch ? "No members match your search." : "No members found."}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <Table aria-label="Team members">
                                <TableHeader>
                                    <TableRow className="border-b border-border bg-muted">
                                        <TableHead className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</TableHead>
                                        <TableHead className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Department</TableHead>
                                        <TableHead className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Current Role</TableHead>
                                        <TableHead className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assign Role</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {employees.map((emp) => (
                                        <MemberRow
                                            key={emp.id}
                                            emp={emp}
                                            token={accessToken ?? ""}
                                            onRoleUpdated={handleRoleUpdated}
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Pagination footer */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted">
                                <p className="text-xs text-muted-foreground">
                                    Showing {startIndex}–{endIndex} of {total} members
                                </p>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost"
                                        aria-label="Previous page"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-card hover:border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5" />
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
                                                    className={`h-7 w-7 text-xs font-semibold rounded-lg transition-colors ${
                                                        p === page
                                                            ? "bg-primary text-primary-foreground border border-primary"
                                                            : "border border-border text-muted-foreground hover:bg-card hover:border-border"
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
                                        className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-card hover:border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </Button>
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
