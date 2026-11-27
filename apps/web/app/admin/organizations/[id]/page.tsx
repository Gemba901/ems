"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { TenantImage } from "@/components/files/TenantImage";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { AdminService, OrgDetail, OrgStats, OrgStatus, ModuleType, AVAILABLE_MODULES } from "@/services/admin.service";
import { EmployeeService } from "@/services/employee.service";
import ColumnMappingDialog from "@/components/employee-import/ColumnMappingDialog";
import { EmployeeImportMapping, SheetData, readWorkbook } from "@/lib/employee-import-mapping";
import {
    ArrowLeft, Building2, Users, Lightbulb, BarChart2,
    CircleDot, Mail, Phone, MapPin, ChevronDown,
    EyeOff, Puzzle, Loader2, Filter, ShieldCheck, Trash2, ShieldAlert,
    Upload, Columns3,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type OrganizationEmployee = {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    avatarUrl?: string | null;
    department?: { name: string } | null;
    user?: { organizations?: { role?: { id: number; name: string } }[] } | null;
};

type OrganizationSuggestion = {
    id: string;
    title: string;
    category: string;
    status: string;
    employee?: { firstName: string; lastName: string } | null;
    createdAt: string;
};

type OrganizationRole = {
    id: number;
    name: string;
    _count: { users: number };
    permissions: { permissionId: number; permission?: { name: string } }[];
};

type Tab = "overview" | "employees" | "suggestions" | "roles";

type ImportSummary = {
    rowsRead: number;
    validRows: number;
    invalidRows: number;
    created: number;
    updated: number;
    deleted: number;
    preserved: number;
    dryRun: boolean;
    issues: { row: number; message: string }[];
};

const ROLE_OPTIONS = [
    { value: 2, label: "Admin" },
    { value: 3, label: "Management" },
    { value: 4, label: "HR" },
    { value: 5, label: "HOD" },
    { value: 6, label: "Employee" },
];

function Modal({ title, onClose, pending, children }: {
    title: string;
    onClose: () => void;
    pending: boolean;
    children: React.ReactNode;
}) {
    return (
        <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }} disablePointerDismissal>
            <DialogContent showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                {children}
            </DialogContent>
        </Dialog>
    );
}

const STATUS_CONFIG: Record<OrgStatus, { label: string; badge: string; dot: string }> = {
    ACTIVE:    { label: "Active",    dot: "bg-success", badge: "bg-success/10 text-success border border-success/20" },
    SUSPENDED: { label: "Suspended", dot: "bg-warning",   badge: "bg-warning/10 text-warning border border-warning/20" },
    INACTIVE:  { label: "Inactive",  dot: "bg-muted-foreground",   badge: "bg-muted text-muted-foreground border border-border" },
};

const SIM_STATUS_BADGE: Record<string, string> = {
    UNDER_REVIEW:                "bg-warning-subtle text-warning",
    ON_HOLD:                     "bg-warning-subtle text-warning",
    SELECTED_FOR_SGA:            "bg-primary/10 text-primary",
    APPROVED_FOR_IMPLEMENTATION: "bg-success-subtle text-success",
    REJECTED:                    "bg-danger-subtle text-danger",
};

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
    return (
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex items-center gap-4">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="h-4 w-4" />
            </div>
            <div>
                <p className="text-xl font-bold text-foreground tabular-nums leading-none">{value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">{label}</p>
            </div>
        </div>
    );
}

export default function OrgDetailPage() {
    const { id }     = useParams<{ id: string }>();
    const router     = useRouter();
    const { accessToken } = useAuthStore();
    const queryClient = useQueryClient();

    const statusMutation = useMutation({
  mutationFn: (status: OrgStatus) =>
    AdminService.updateOrgStatus(accessToken!, id, status),
  onSuccess: (_, status) => {
    setOrg((prev) => prev ? { ...prev, status } : prev);
    queryClient.invalidateQueries({ queryKey: ["organizations"] });
  },
});


    const [org, setOrg]         = useState<OrgDetail | null>(null);
    const [stats, setStats]     = useState<OrgStats | null>(null);
    const [employees, setEmps]  = useState<OrganizationEmployee[]>([]);
    const [suggestions, setSuggestions] = useState<OrganizationSuggestion[]>([]);
    const [roles, setRoles]     = useState<OrganizationRole[]>([]);
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
    const [deptFilter, setDeptFilter]   = useState<string>("");
    const [tab, setTab]         = useState<Tab>("overview");
    const [loading, setLoading] = useState(true);
    const [tabLoading, setTabLoading] = useState(false);
    const [statusOpen, setStatusOpen] = useState(false);
    const [updatingModules, setUpdatingModules] = useState(false);
    const [moduleError, setModuleError] = useState<string | null>(null);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importSheets, setImportSheets] = useState<SheetData[] | null>(null);
    const [importMapping, setImportMapping] = useState<EmployeeImportMapping | null>(null);
    const [mappingOpen, setMappingOpen] = useState(false);

    // Role change modal
    const [roleModal, setRoleModal] = useState<{ emp: OrganizationEmployee } | null>(null);
    const [selectedRoleId, setSelectedRoleId] = useState<number>(6);
    const [savingRole, setSavingRole] = useState(false);
    const [roleError, setRoleError] = useState<string | null>(null);

    // Delete org modal
    const [deleteModal, setDeleteModal] = useState(false);
    const [deleteConfirmName, setDeleteConfirmName] = useState("");
    const [deletingOrg, setDeletingOrg] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

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
                ? AdminService.getOrgEmployees(accessToken, id, 1, 100, deptFilter || undefined).then((r) => setEmps(r.data))
                : tab === "suggestions"
                ? AdminService.getOrgSuggestions(accessToken, id).then((r) => setSuggestions(r.data))
                : AdminService.getOrgRoles(accessToken, id).then(setRoles);

        fetch.catch(console.error).finally(() => setTabLoading(false));
    }, [tab, accessToken, id, loading, deptFilter]);

    // Pre-load departments for filter
    useEffect(() => {
        if (!accessToken || !id || loading) return;
        EmployeeService.getDepartments(id, accessToken)
            .then(setDepartments)
            .catch(console.error);
    }, [accessToken, id, loading]);

    const handleModuleToggle = useCallback(async (mod: ModuleType) => {
        if (!accessToken || !org) return;
        setUpdatingModules(true);
        const current = org.modules ?? [];
        const updated = current.includes(mod)
            ? current.filter((m) => m !== mod)
            : [...current, mod];
        try {
            await AdminService.updateOrganization(accessToken, org.id, { modules: updated });
            setOrg((prev) => prev ? { ...prev, modules: updated } : prev);
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["org-modules"] });
            setModuleError(null);
        } catch (e: unknown) {
            setModuleError(e instanceof Error && e.message ? e.message : "Failed to update modules.");
        } finally {
            setUpdatingModules(false);
        }
    }, [accessToken, org, queryClient]);

    const refreshEmployeeData = useCallback(async () => {
        if (!accessToken || !id) return;
        const [employeeData, statData, deptData] = await Promise.all([
            AdminService.getOrgEmployees(accessToken, id, 1, 100, deptFilter || undefined),
            AdminService.getOrgStats(accessToken, id),
            EmployeeService.getDepartments(id, accessToken),
        ]);
        setEmps(employeeData.data);
        setStats(statData);
        setDepartments(deptData);
    }, [accessToken, id, deptFilter]);

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
        if (!accessToken || !org || !file) return;
        setImportMapping(mapping);
        setMappingOpen(false);
        setImportSummary(null);
        setImportError(null);
        setImporting(true);
        try {
            const summary = await AdminService.importOrgEmployees(accessToken, org.id, file, true, mapping);
            setImportSummary(summary);
        } catch (e: unknown) {
            setImportError(e instanceof Error && e.message ? e.message : "Failed to read employee workbook.");
        } finally {
            setImporting(false);
        }
    };

    const handleImportCommit = async () => {
        if (!accessToken || !org || !importFile) return;
        setImportError(null);
        setImporting(true);
        try {
            const summary = await AdminService.importOrgEmployees(accessToken, org.id, importFile, false, importMapping);
            setImportSummary(summary);
            await refreshEmployeeData();
        } catch (e: unknown) {
            setImportError(e instanceof Error && e.message ? e.message : "Failed to sync employees.");
        } finally {
            setImporting(false);
        }
    };

    const handleStatusChange = (status: OrgStatus) => {
  setStatusOpen(false);
  statusMutation.mutate(status);
};


    const openRoleModal = (emp: OrganizationEmployee) => {
        const currentRoleId = emp.user?.organizations?.[0]?.role?.id ?? 6;
        setSelectedRoleId(currentRoleId);
        setRoleError(null);
        setRoleModal({ emp });
    };

    const handleRoleSave = async () => {
        if (!accessToken || !roleModal) return;
        setSavingRole(true);
        setRoleError(null);
        try {
            await EmployeeService.updateRole(roleModal.emp.id, selectedRoleId, accessToken);
            setEmps((prev) => prev.map((e) =>
                e.id === roleModal.emp.id
                    ? { ...e, user: { ...e.user, organizations: [{ ...e.user?.organizations?.[0], role: { id: selectedRoleId, name: ROLE_OPTIONS.find(r => r.value === selectedRoleId)?.label?.toUpperCase() ?? "" } }] } }
                    : e
            ));
            setRoleModal(null);
        } catch (e: unknown) {
            setRoleError(e instanceof Error && e.message ? e.message : "Failed to update role");
        } finally {
            setSavingRole(false);
        }
    };

    const handleDeleteOrg = async () => {
        if (!accessToken || !org) return;
        if (deleteConfirmName.trim() !== org.name) {
            setDeleteError("Organization name does not match.");
            return;
        }
        setDeletingOrg(true);
        setDeleteError(null);
        try {
            await AdminService.deleteOrganization(accessToken, org.id, deleteConfirmName.trim());
            router.push("/admin/organizations");
        } catch (e: unknown) {
            setDeleteError(e instanceof Error && e.message ? e.message : "Failed to delete organization.");
            setDeletingOrg(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm gap-2">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Loading organization...
            </div>
        );
    }

    if (!org) {
        return (
            <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
                <Building2 className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">Organization not found</p>
                <Button variant="ghost" onClick={() => router.back()} className="text-xs text-primary hover:underline">Go back</Button>
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
        <>
        <div className="max-w-6xl mx-auto space-y-6">

            {/* Back */}
            <Button variant="ghost"
                onClick={() => router.push("/admin/organizations")}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="h-4 w-4" /> Organizations
            </Button>

            {/* Org header card */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                        {org.logoUrl ? (
                            <TenantImage src={org.logoUrl} organizationId={org.id} alt={org.name} className="h-14 w-14 rounded-xl object-cover border border-border" />
                        ) : (
                            <div className="h-14 w-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0">
                                {org.name[0].toUpperCase()}
                            </div>
                        )}
                        <div>
                            <div className="flex items-center gap-3 mb-1 flex-wrap">
                                <h1 className="text-page-title">{org.name}</h1>
                                <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${sc.badge}`}>
                                    <CircleDot className="h-2.5 w-2.5" /> {sc.label}
                                </span>
                                {org.isAdminOrg && (
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                                        <ShieldAlert className="h-2.5 w-2.5" /> Platform Admin
                                    </span>
                                )}
                            </div>
                            {org.industry && <p className="text-sm text-muted-foreground">{org.industry}</p>}
                            <p className="text-[11px] text-muted-foreground mt-1">
                                Joined {new Date(org.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                            </p>
                        </div>
                    </div>

                    {/* Status control + delete */}
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Button variant="ghost"
                                aria-expanded={statusOpen}
                                onClick={() => setStatusOpen((o) => !o)}
                                disabled={statusMutation.isPending}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                {statusMutation.isPending ? "Updating..." : "Change Status"}
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            {statusOpen && (
                                <div className="absolute right-0 top-10 z-10 w-44 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                                    {(["ACTIVE", "SUSPENDED", "INACTIVE"] as OrgStatus[])
                                        .filter((s) => s !== org.status)
                                        .map((s) => {
                                            const cfg = STATUS_CONFIG[s];
                                            return (
                                                <Button variant="ghost"
                                                    key={s}
                                                    onClick={() => handleStatusChange(s)}
                                                    className="h-auto w-full justify-start gap-2.5 px-4 py-2.5 text-sm text-left hover:bg-muted transition-colors"
                                                >
                                                    <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                                                    {cfg.label}
                                                </Button>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                        {!org.isAdminOrg && (
                            <Button variant="ghost"
                                onClick={() => { setDeleteConfirmName(""); setDeleteError(null); setDeleteModal(true); }}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-danger/20 text-sm font-medium text-danger hover:bg-danger-subtle transition-colors"
                            >
                                <Trash2 className="h-4 w-4" /> Delete
                            </Button>
                        )}
                    </div>
                </div>

                {/* Contact row */}
                {(org.email || org.phone || org.address) && (
                    <div className="mt-5 pt-5 border-t border-border flex flex-wrap gap-5">
                        {org.email && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail className="h-4 w-4 text-muted-foreground" /> {org.email}
                            </div>
                        )}
                        {org.phone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="h-4 w-4 text-muted-foreground" /> {org.phone}
                            </div>
                        )}
                        {org.address && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <MapPin className="h-4 w-4 text-muted-foreground" /> {org.address}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MiniStat label="Employees"        value={stats?.employeeCount   ?? org._count.employees}   icon={Users}     color="bg-info-subtle text-info" />
                <MiniStat label="Departments"      value={stats?.departmentCount ?? org._count.departments} icon={Building2} color="bg-primary/10 text-primary" />
                <MiniStat label="Suggestions"      value={stats?.suggestionCount ?? org._count.suggestions} icon={Lightbulb} color="bg-warning-subtle text-warning" />
                <MiniStat label="Implementation %" value={`${stats?.implementationRate ?? 0}%`}             icon={BarChart2} color="bg-success-subtle text-success" />
            </div>

            {/* Tabs */}
            <div className="border-b border-border flex gap-1">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <Button variant="ghost"
                        key={key}
                        onClick={() => setTab(key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            tab === key
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Icon className="h-3.5 w-3.5" /> {label}
                    </Button>
                ))}
            </div>

            {/* Tab content */}
            <div>
                {tabLoading && (
                    <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                        <div className="h-4 w-4 border-2 border-ring border-t-transparent rounded-full animate-spin" />
                        Loading...
                    </div>
                )}

                {/* Overview */}
                {!tabLoading && tab === "overview" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Departments */}
                        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-border">
                                <p className="text-sm font-semibold text-foreground">Departments</p>
                            </div>
                            <div className="divide-y divide-border">
                                {org.departments.length === 0 && (
                                    <p className="px-5 py-8 text-sm text-muted-foreground text-center">No departments yet</p>
                                )}
                                {org.departments.map((dept) => (
                                    <div key={dept.id} className="flex items-center justify-between px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center">
                                                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                            </div>
                                            <span className="text-sm font-medium text-foreground">{dept.name}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground tabular-nums">
                                            {dept._count.employees} {dept._count.employees === 1 ? "employee" : "employees"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Suggestion breakdown */}
                        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-border">
                                <p className="text-sm font-semibold text-foreground">Suggestion Breakdown</p>
                            </div>
                            <div className="p-5 space-y-3">
                                {stats && Object.entries(stats.suggestionsByStatus).length === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-4">No suggestions yet</p>
                                )}
                                {stats && Object.entries(stats.suggestionsByStatus).map(([status, count]) => {
                                    const total = stats.suggestionCount || 1;
                                    const pct   = Math.round((count / total) * 100);
                                    const badgeClass = SIM_STATUS_BADGE[status] ?? "bg-muted text-muted-foreground";
                                    return (
                                        <div key={status}>
                                            <div className="flex items-center justify-between text-xs mb-1.5">
                                                <span className={`px-2 py-0.5 rounded-md font-semibold ${badgeClass}`}>
                                                    {status.replace(/_/g, " ")}
                                                </span>
                                                <span className="text-muted-foreground tabular-nums">{count} ({pct}%)</span>
                                            </div>
                                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Modules */}
                        <div className="lg:col-span-2 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                                <div className="flex items-center gap-2">
                                    <Puzzle className="h-4 w-4 text-muted-foreground" />
                                    <p className="text-sm font-semibold text-foreground">Modules</p>
                                </div>
                                {updatingModules && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                {moduleError && !updatingModules && (
                                    <p className="text-xs text-danger bg-danger-subtle border border-danger/20 rounded-lg px-3 py-1">{moduleError}</p>
                                )}
                            </div>
                            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {AVAILABLE_MODULES.map(({ key, label, description }) => {
                                    const active = (org.modules ?? []).includes(key);
                                    return (
                                        <div
                                            key={key}
                                            className={`flex items-center justify-between p-4 rounded-lg border ${active ? "border-primary/20 bg-primary/10" : "border-border bg-card"}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Puzzle className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                                                <div>
                                                    <p className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{label}</p>
                                                    <p className="text-[11px] text-muted-foreground">{description}</p>
                                                </div>
                                            </div>
                                            <Button variant="ghost"
                                                onClick={() => handleModuleToggle(key)}
                                                disabled={updatingModules}
                                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                                                    active
                                                        ? "bg-danger-subtle text-danger hover:bg-danger-subtle border border-danger/20"
                                                        : "bg-primary text-primary-foreground hover:bg-primary"
                                                }`}
                                            >
                                                {active ? "Disable" : "Enable"}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Employees tab */}
                {!tabLoading && tab === "employees" && (
                    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                        {/* Dept filter toolbar */}
                        <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
                            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <NativeSelect
                                aria-label="Filter by department"
                                value={deptFilter}
                                onChange={(e) => setDeptFilter(e.target.value)}
                                className="text-xs border border-border rounded-lg px-2 py-1.5 text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring bg-card"
                            >
                                <option value="">All departments</option>
                                {departments.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </NativeSelect>
                            {deptFilter && (
                                <Button variant="ghost" onClick={() => setDeptFilter("")} className="text-xs text-primary hover:underline">
                                    Clear
                                </Button>
                            )}
                            <label className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/20 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors cursor-pointer">
                                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                Import Excel
                                <Input
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
                            </label>
                            <span className="ml-auto text-[11px] text-muted-foreground">{employees.length} shown</span>
                        </div>

                        {mappingOpen && importFile && importSheets && (
                            <ColumnMappingDialog
                                fileName={importFile.name}
                                sheets={importSheets}
                                initialMapping={importMapping}
                                onCancel={() => setMappingOpen(false)}
                                onConfirm={(mapping) => void handleImportDryRun(mapping)}
                            />
                        )}

                        {(importSummary || importError) && (
                            <div className="px-5 py-4 border-b border-border bg-muted space-y-2">
                                {importError && (
                                    <p className="text-xs font-medium text-danger">{importError}</p>
                                )}
                                {importSheets && (importError || importSummary?.dryRun) && (
                                    <Button variant="ghost"
                                        onClick={() => setMappingOpen(true)}
                                        disabled={importing}
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                                    >
                                        <Columns3 className="h-3.5 w-3.5" /> Edit column mapping
                                    </Button>
                                )}
                                {importSummary && (
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                            <span className="font-semibold text-foreground">{importFile?.name ?? "Workbook"}</span>
                                            <span className="px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground">{importSummary.validRows} valid rows</span>
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
                                                    This sync will make the database match the workbook for this organization.
                                                </p>
                                                <Button
                                                    onClick={handleImportCommit}
                                                    disabled={importing}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary disabled:opacity-50"
                                                >
                                                    {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                                    Confirm Sync
                                                </Button>
                                            </div>
                                        ) : (
                                            <p className="text-xs font-medium text-success">Employee data synced successfully.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <Table className="w-full text-sm">
                            <TableHeader className="bg-muted border-b border-border">
                                <TableRow>
                                    <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Name</TableHead>
                                    <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Email</TableHead>
                                    <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Department</TableHead>
                                    <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Role</TableHead>
                                    <TableHead className="px-6 py-3 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-border">
                                {employees.length === 0 && (
                                    <TableRow><TableCell colSpan={5} className="px-6 py-12 text-center text-muted-foreground text-sm">No employees found</TableCell></TableRow>
                                )}
                                {employees.map((emp) => {
                                    const roleName = emp.user?.organizations?.[0]?.role?.name ?? "—";
                                    return (
                                        <TableRow key={emp.id} className="hover:bg-muted/60 transition-colors">
                                            <TableCell className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    {emp.avatarUrl ? (
                                                        <TenantImage src={emp.avatarUrl} organizationId={org.id} alt="" className="h-7 w-7 rounded-full object-cover shrink-0 border border-border" />
                                                    ) : (
                                                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                                            {emp.firstName[0]}{emp.lastName[0]}
                                                        </div>
                                                    )}
                                                    <span className="font-medium text-foreground">{emp.firstName} {emp.lastName}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-6 py-4 text-muted-foreground">{emp.email}</TableCell>
                                            <TableCell className="px-6 py-4">
                                                {emp.department ? (
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                                                        {emp.department.name}
                                                    </span>
                                                ) : <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell className="px-6 py-4 text-xs text-muted-foreground capitalize">
                                                {roleName.replace(/_/g, " ").toLowerCase()}
                                            </TableCell>
                                            <TableCell className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <Button variant="ghost"
                                                        onClick={() => openRoleModal(emp)}
                                                        title="Change role"
                                                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                                    >
                                                        <ShieldCheck className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {/* Suggestions tab */}
                {!tabLoading && tab === "suggestions" && (
                    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                        <Table className="w-full text-sm">
                            <TableHeader className="bg-muted border-b border-border">
                                <TableRow>
                                    <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Title</TableHead>
                                    <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Category</TableHead>
                                    <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                                    <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Author</TableHead>
                                    <TableHead className="px-6 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-border">
                                {suggestions.length === 0 && (
                                    <TableRow><TableCell colSpan={5} className="px-6 py-12 text-center text-muted-foreground text-sm">No suggestions yet</TableCell></TableRow>
                                )}
                                {suggestions.map((s) => (
                                    <TableRow key={s.id} className="hover:bg-muted/60 transition-colors">
                                        <TableCell className="px-6 py-4 font-medium text-foreground max-w-[280px] truncate">{s.title}</TableCell>
                                        <TableCell className="px-6 py-4">
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                                                {s.category}
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-6 py-4">
                                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${SIM_STATUS_BADGE[s.status] ?? "bg-muted text-muted-foreground"}`}>
                                                {s.status.replace(/_/g, " ")}
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-6 py-4 text-muted-foreground text-xs">
                                            {s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : (
                                                <span className="flex items-center gap-1 text-muted-foreground"><EyeOff className="h-3 w-3" /> Anonymous</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                                            {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {/* Roles tab */}
                {!tabLoading && tab === "roles" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {roles.length === 0 && (
                            <p className="text-sm text-muted-foreground col-span-3 text-center py-12">No roles configured</p>
                        )}
                        {roles.map((role) => (
                            <div key={role.id} className="bg-card rounded-xl border border-border shadow-sm p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="font-semibold text-foreground text-sm">{role.name.replace(/_/g, " ")}</p>
                                    <span className="text-xs text-muted-foreground tabular-nums bg-muted px-2 py-0.5 rounded-full border border-border">
                                        {role._count.users} {role._count.users === 1 ? "user" : "users"}
                                    </span>
                                </div>
                                {role.permissions?.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {role.permissions.map((rp) => (
                                            <span key={rp.permissionId} className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
                                                {rp.permission?.name}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">No permissions assigned</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Role change modal */}
        {roleModal && (
            <Modal title={`Change Role — ${roleModal.emp.firstName} ${roleModal.emp.lastName}`} onClose={() => setRoleModal(null)} pending={savingRole}>
                <div className="space-y-4">
                    <DialogDescription>Select a new role for this employee within the organization.</DialogDescription>
                    <NativeSelect
                        aria-label="New employee role"
                        value={selectedRoleId}
                        onChange={(e) => setSelectedRoleId(Number(e.target.value))}
                        className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                    >
                        {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                    </NativeSelect>
                    {roleError && <p role="alert" className="text-xs text-danger bg-danger-subtle rounded-lg px-3 py-2">{roleError}</p>}
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" onClick={() => setRoleModal(null)} disabled={savingRole} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg transition-colors">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRoleSave}
                            disabled={savingRole}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary rounded-lg transition-colors disabled:opacity-50"
                        >
                            {savingRole ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                            Save Role
                        </Button>
                    </div>
                </div>
            </Modal>
        )}

        {/* Delete organization modal */}
        {deleteModal && org && (
            <Modal title="Delete Organization" onClose={() => setDeleteModal(false)} pending={deletingOrg}>
                <div className="space-y-4">
                    <div className="flex items-start gap-3 p-3 bg-danger-subtle border border-danger/20 rounded-lg">
                        <Trash2 className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                        <DialogDescription className="text-xs text-danger">
                            This will permanently delete <strong>{org.name}</strong> and all its employees, departments, and suggestions. This action cannot be undone.
                        </DialogDescription>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">
                            Type <strong className="text-foreground">{org.name}</strong> to confirm:
                        </p>
                        <Input
                            aria-label="Organization name confirmation"
                            value={deleteConfirmName}
                            onChange={(e) => { setDeleteConfirmName(e.target.value); setDeleteError(null); }}
                            placeholder={org.name}
                            className="w-full border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                        />
                    </div>
                    {deleteError && <p role="alert" className="text-xs text-danger bg-danger-subtle rounded-lg px-3 py-2">{deleteError}</p>}
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" onClick={() => setDeleteModal(false)} disabled={deletingOrg} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg transition-colors">
                            Cancel
                        </Button>
                        <Button variant="destructive-solid"
                            onClick={handleDeleteOrg}
                            disabled={deletingOrg || deleteConfirmName.trim() !== org.name}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-danger-foreground bg-danger hover:bg-danger/90 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {deletingOrg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Permanently Delete
                        </Button>
                    </div>
                </div>
            </Modal>
        )}
        </>
    );
}
