"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";

import { PageHeader } from "@/components/patterns/PageHeader";
import { FormField } from "@/components/patterns/FormField";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { TenantImage } from "@/components/files/TenantImage";
import { useState, type ElementType } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, EmployeeProfile, CompletionResult,
  EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS, SKILL_LEVEL_LABELS,
  GROUP_LABELS, UpdateEmployeeEmsPayload, GroupKey,
} from "@/services/ems.service";
import { EmployeeService } from "@/services/employee.service";
import {
  ArrowLeft, Save, Loader2, CheckCircle2,
  ClipboardList, User, Briefcase, FileText, Phone, TrendingUp,
  CalendarCheck, CalendarX, Clock, ChevronLeft, ChevronRight,
  Camera, Pencil, Lock, Building2, Users,
  KeyRound, Copy, Check, AlertCircle,
} from "lucide-react";
import { CalendarService, EVENT_COLOR_CONFIG } from "@/services/calendar.service";
import EmployeeDwmsPanel from "@/app/dwms/components/EmployeeDwmsPanel";
import { useOrgModules } from "@/hooks/useOrgModules";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ringColor(pct: number) {
  if (pct >= 97) return "var(--success)";
  if (pct >= 90) return "var(--info)";
  if (pct >= 75) return "var(--warning)";
  return "var(--danger)";
}

function statusLabel(pct: number) {
  if (pct >= 97) return "Excellent";
  if (pct >= 90) return "Good";
  if (pct >= 75) return "Fair";
  return "Poor";
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function yearsMonths(iso: string | null | undefined) {
  if (!iso) return null;
  const start = new Date(iso);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}mo`;
  return m > 0 ? `${y}yr ${m}mo` : `${y}yr`;
}

// ── UI Primitives ─────────────────────────────────────────────────────────────

function RingGauge({ pct, size = 100, strokeWidth = 9 }: { pct: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} className="absolute">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColor(pct)}
          strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-bold text-foreground leading-none" style={{ fontSize: Math.max(size * 0.18, 10) }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

function CompletionBadge({ status }: { status: string }) {
  const variant = status === "Excellent" ? "success" : status === "Good" ? "info" : status === "Fair" ? "warning" : "danger";
  return <Badge variant={variant}>{status}</Badge>;
}

function CardHeader({ icon: Icon, title, iconColor = "text-primary", iconBg = "bg-primary/10" }: {
  icon: ElementType; title: string; iconColor?: string; iconBg?: string;
}) {
  return (
    <div className="px-5 py-4 border-b border-border bg-muted flex items-center gap-2.5">
      <div className={`p-1.5 rounded-lg ${iconBg}`}>
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
      </div>
      <p className="text-sm font-bold text-foreground">{title}</p>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted transition-colors">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

const inputCls = "w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all";
const selectCls = `${inputCls} bg-card`;
const readonlyCls = `${inputCls} bg-muted text-muted-foreground cursor-default`;

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-primary/10 text-primary",
  ADMIN: "bg-danger-subtle text-danger",
  MANAGEMENT: "bg-info-subtle text-info",
  HR: "bg-success-subtle text-success",
  HOD: "bg-warning-subtle text-warning",
  EMPLOYEE: "bg-muted text-muted-foreground",
};

const ROLE_OPTIONS = [
  { id: 2, name: "ADMIN" },
  { id: 3, name: "MANAGEMENT" },
  { id: 6, name: "HR" },
  { id: 4, name: "HOD" },
  { id: 5, name: "EMPLOYEE" },
];

type Tab = "profile" | "master-data" | "dwms" | "activity";

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken, user: viewer } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { hasModule } = useOrgModules();

  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [form, setForm] = useState<UpdateEmployeeEmsPayload>({});
  const [formInitialized, setFormInitialized] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inviteLogPage, setInviteLogPage] = useState(1);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarInput, setAvatarInput] = useState("");
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [editingRole, setEditingRole] = useState(false);
  const [editingDept, setEditingDept] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<number>(5);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetResult, setResetResult] = useState<{ tempPassword: string; expiresInMinutes: number } | null>(null);
  const [resetCopied, setResetCopied] = useState(false);

  const viewerRole = viewer?.roleLevel;
  const isAdminOrHr = [Role.ADMIN, Role.SUPER_ADMIN, Role.HR].includes(viewerRole as Role);
  const isAdminOnly = [Role.ADMIN, Role.SUPER_ADMIN].includes(viewerRole as Role);
  const canUseDwms = hasModule("DWMS");

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: emsData, isLoading: emsLoading, error: emsError } = useQuery({
    queryKey: ["ems-employee", id],
    queryFn: () => EmsService.getEmployee(id!, accessToken!),
    enabled: !!accessToken && !!id,
  });

  const { data: empRaw, isLoading: empLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => EmployeeService.getById(id!, accessToken!),
    enabled: !!accessToken && !!id,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", viewer?.organizationId],
    queryFn: () => EmployeeService.getDepartments(viewer!.organizationId!, accessToken!),
    enabled: !!accessToken && !!viewer?.organizationId,
  });

  const { data: employeesData } = useQuery({
    queryKey: ["ems-employees-list"],
    queryFn: () => EmsService.getEmployees(accessToken!, { limit: 200 }),
    enabled: !!accessToken,
  });

  const { data: calStats } = useQuery({
    queryKey: ["calendar-employee-stats", id],
    queryFn: () => CalendarService.getEmployeeEventStats(id!, accessToken!),
    enabled: !!accessToken && !!id,
  });

  const { data: inviteLog } = useQuery({
    queryKey: ["calendar-employee-log", id, inviteLogPage],
    queryFn: () => CalendarService.getEmployeeInvitationLog(id!, accessToken!, inviteLogPage, 10),
    enabled: !!accessToken && !!id,
  });

  // ── Derived state ─────────────────────────────────────────────────────────

  const employee: EmployeeProfile | null = emsData?.employee ?? null;
  const completion: CompletionResult | null = emsData?.completion ?? null;
  const userOrg = empRaw?.user?.organizations?.find((o) => o.organizationId === empRaw?.organizationId);
  const systemRole = userOrg?.role?.name?.toUpperCase() ?? "—";
  const systemRoleId = userOrg?.role?.id ?? 5;
  const canEditAvatar = viewer?.userId === empRaw?.userId;

  // Initialise EMS form once
  if (employee && !formInitialized) {
    setForm({
      employeeCode: employee.employeeCode ?? "",
      middleName: employee.middleName ?? "",
      gender: employee.gender ?? undefined,
      dateOfBirth: employee.dateOfBirth ? employee.dateOfBirth.split("T")[0] : "",
      nationalId: employee.nationalId ?? "",
      nationality: employee.nationality ?? "",
      employmentStatus: employee.employmentStatus,
      employmentType: employee.employmentType ?? undefined,
      jobTitle: employee.jobTitle ?? "",
      dateJoined: employee.dateJoined ? employee.dateJoined.split("T")[0] : "",
      plantBranch: employee.plantBranch ?? "",
      workStation: employee.workStation ?? "",
      section: employee.section ?? "",
      subSection: employee.subSection ?? "",
      shift: employee.shift ?? "",
      reportingManagerId: employee.reportingManagerId ?? "",
      hrRecordOwnerId: employee.hrRecordOwnerId ?? "",
      jobDescription: employee.jobDescription ?? "",
      level: employee.level ?? "",
      grade: employee.grade ?? "",
      jobCategory: employee.jobCategory ?? "",
      primaryWorkRole: employee.primaryWorkRole ?? "",
      machineProcess: employee.machineProcess ?? "",
      canBeAssignedTasks: employee.canBeAssignedTasks,
      canBeMember: employee.canBeMember,
      canBeLeader: employee.canBeLeader,
      whatsappNumber: employee.whatsappNumber ?? "",
      homeAddress: employee.homeAddress ?? "",
      emergencyContactName: employee.emergencyContactName ?? "",
      emergencyContactPhone: employee.emergencyContactPhone ?? "",
      emergencyContactRelationship: employee.emergencyContactRelationship ?? "",
      skillLevel: employee.skillLevel ?? undefined,
      trainingNeeded: employee.trainingNeeded ?? false,
    });
    setPersonalForm({
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email ?? "",
      phone: empRaw?.phone ?? employee.phone ?? "",
    });
    setSelectedRoleId(systemRoleId);
    setSelectedDeptId(employee.departmentId ?? "");
    setAvatarInput(employee.avatarUrl ?? "");
    setFormInitialized(true);
  }

  const set = (key: keyof UpdateEmployeeEmsPayload, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: () => EmsService.updateEmployee(id!, form, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ems-employee", id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (url: string) => EmployeeService.updateAvatar(id!, url, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ems-employee", id] });
      queryClient.invalidateQueries({ queryKey: ["employee", id] });
      setShowAvatarModal(false);
    },
  });

  const personalMutation = useMutation({
    mutationFn: (data: { firstName: string; lastName: string; email: string; phone: string }) =>
      EmployeeService.update(id!, data, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ems-employee", id] });
      queryClient.invalidateQueries({ queryKey: ["employee", id] });
      setEditingPersonal(false);
    },
  });

  const roleMutation = useMutation({
    mutationFn: (roleId: number) => EmployeeService.updateRole(id!, roleId, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee", id] });
      setEditingRole(false);
    },
  });

  const deptMutation = useMutation({
    mutationFn: (deptId: string) =>
      EmployeeService.update(id!, {
        firstName: employee!.firstName,
        lastName: employee!.lastName,
        email: employee!.email,
        phone: employee!.phone ?? undefined,
        departmentId: deptId || null,
      }, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ems-employee", id] });
      queryClient.invalidateQueries({ queryKey: ["employee", id] });
      setEditingDept(false);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => EmployeeService.resetPassword(id!, accessToken!),
    onSuccess: (data) => {
      setResetResult({ tempPassword: data.tempPassword, expiresInMinutes: data.expiresInMinutes });
    },
  });

  const closeResetModal = () => {
    setShowResetModal(false);
    setResetResult(null);
    setResetCopied(false);
    resetPasswordMutation.reset();
  };

  const copyTempPassword = () => {
    if (!resetResult) return;
    navigator.clipboard.writeText(resetResult.tempPassword);
    setResetCopied(true);
    setTimeout(() => setResetCopied(false), 2000);
  };

  const saving = saveMutation.isPending;
  const saveError = saveMutation.error?.message;
  const loading = emsLoading || empLoading;
  const error = emsError?.message;

  const fullName = employee
    ? `${employee.firstName}${employee.middleName ? " " + employee.middleName : ""} ${employee.lastName}`
    : "Employee";

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "master-data", label: "Master Data" },
    ...(canUseDwms ? [{ id: "dwms" as const, label: "RTM" }] : []),
    { id: "activity", label: "Activity" },
  ];

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="space-y-5">

        <PageHeader
          title={fullName}
          description={[employee?.department?.name, employee?.jobTitle].filter(Boolean).join(" · ")}
          actions={<>
            <Button variant="outline" aria-label="Go back" onClick={() => router.back()}>
              <ArrowLeft /> Back
            </Button>
            {employee?.employeeCode && <Badge variant="outline">{employee.employeeCode}</Badge>}
          </>}
        />

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div role="group" aria-label="Employee sections" className="flex items-center gap-1 overflow-x-auto border-b border-border">
          {tabs.map((tab) => (
            <Button variant="ghost"
              key={tab.id}
              aria-pressed={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {error && (
          <div role="alert" className="bg-danger-subtle border border-danger/20 text-danger text-sm px-4 py-3 rounded-xl">{error}</div>
        )}

        {/* ── Profile tab ───────────────────────────────────────────────── */}
        {activeTab === "profile" && employee && (
          <div className="space-y-5">

            {/* Identity card */}
            <div className="bg-card border border-border rounded-2xl shadow-sm p-5 flex items-center gap-5">
              <div className="relative group shrink-0">
                <div className="h-20 w-20 rounded-2xl overflow-hidden bg-muted">
                  {employee.avatarUrl ? (
                    <TenantImage src={employee.avatarUrl} alt={fullName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xl font-bold text-muted-foreground">
                      {employee.firstName[0]}{employee.lastName[0]}
                    </div>
                  )}
                </div>
                {canEditAvatar && (
                  <Button
                    variant="ghost"
                    aria-label="Update profile picture"
                    onClick={() => setShowAvatarModal(true)}
                    className="absolute inset-0 h-full w-full p-0 flex items-center justify-center bg-overlay/40 hover:bg-overlay/60 rounded-2xl opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                  >
                    <Camera className="size-5 text-background dark:text-foreground" />
                  </Button>
                )}
                <div className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 border-2 border-card rounded-full ${
                  employee.employmentStatus === "ACTIVE" ? "bg-success" : "bg-muted-foreground"
                }`} />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-foreground truncate">{fullName}</h2>
                {employee.jobTitle && (
                  <p className="text-sm text-muted-foreground mt-0.5">{employee.jobTitle}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {systemRole !== "—" && (
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${ROLE_COLORS[systemRole] ?? "bg-muted text-muted-foreground"}`}>
                      {systemRole}
                    </span>
                  )}
                  {employee.department?.name && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {employee.department.name}
                    </span>
                  )}
                  {completion && (
                    <span className="text-xs font-semibold text-muted-foreground ml-auto flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${
                        completion.overall >= 90 ? "bg-success"
                          : completion.overall >= 75 ? "bg-warning" : "bg-danger"
                      }`} />
                      {completion.overall}% complete
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Personal info */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border bg-muted flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-sm font-bold text-foreground">Personal Information</p>
                  </div>
                  {isAdminOrHr && !editingPersonal && (
                    <Button variant="ghost" onClick={() => setEditingPersonal(true)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                  )}
                </div>

                <div className="p-5">
                  {editingPersonal ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground block mb-1">First Name</label>
                          <Input className={inputCls} aria-label="First name" value={personalForm.firstName}
                            onChange={(e) => setPersonalForm((f) => ({ ...f, firstName: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground block mb-1">Last Name</label>
                          <Input className={inputCls} aria-label="Last name" value={personalForm.lastName}
                            onChange={(e) => setPersonalForm((f) => ({ ...f, lastName: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Email</label>
                        <Input type="email" className={inputCls} aria-label="Email" value={personalForm.email}
                          onChange={(e) => setPersonalForm((f) => ({ ...f, email: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Phone</label>
                        <Input type="tel" className={inputCls} aria-label="Phone" value={personalForm.phone}
                          onChange={(e) => setPersonalForm((f) => ({ ...f, phone: e.target.value }))} />
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                        <Button variant="ghost" onClick={() => setEditingPersonal(false)}
                          className="px-3 py-1.5 text-xs text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">
                          Cancel
                        </Button>
                        <Button
                          onClick={() => personalMutation.mutate(personalForm)}
                          disabled={personalMutation.isPending}
                          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary disabled:opacity-50 transition-colors">
                          {personalMutation.isPending ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                      {[
                        { label: "First Name", value: employee.firstName },
                        { label: "Last Name", value: employee.lastName },
                        { label: "Email", value: employee.email ?? "—", full: true },
                        { label: "Phone", value: employee.phone ?? "—" },
                        { label: "Employment Type", value: employee.employmentType
                            ? EMPLOYMENT_TYPE_LABELS[employee.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS] ?? employee.employmentType
                            : "—" },
                      ].map((item) => (
                        <div key={item.label} className={"full" in item && item.full ? "col-span-2" : ""}>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">{item.label}</p>
                          <p className="text-sm font-medium text-foreground break-all">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* System access */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border bg-muted flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <p className="text-sm font-bold text-foreground">System Access</p>
                </div>

                <div className="p-5 space-y-4">
                  {/* Role */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">System Role</p>
                      {isAdminOnly && !editingRole && (
                        <Button variant="ghost" onClick={() => setEditingRole(true)}
                          className="text-muted-foreground hover:text-primary transition-colors">
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    {editingRole ? (
                      <div className="space-y-2">
                        <NativeSelect aria-label="Role" value={selectedRoleId} onChange={(e) => setSelectedRoleId(Number(e.target.value))}
                          className={selectCls}>
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </NativeSelect>
                        <div className="flex gap-2">
                          <Button variant="ghost" onClick={() => setEditingRole(false)}
                            className="flex-1 py-1.5 text-xs text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">
                            Cancel
                          </Button>
                          <Button onClick={() => roleMutation.mutate(selectedRoleId)}
                            disabled={roleMutation.isPending}
                            className="flex-1 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary disabled:opacity-50 transition-colors">
                            {roleMutation.isPending ? "…" : "Save"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className={`inline-block text-[11px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg ${ROLE_COLORS[systemRole] ?? "bg-muted text-muted-foreground"}`}>
                        {systemRole}
                      </span>
                    )}
                  </div>

                  {/* Department */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Department</p>
                      {isAdminOrHr && !editingDept && (
                        <Button variant="ghost" onClick={() => setEditingDept(true)}
                          className="text-muted-foreground hover:text-primary transition-colors">
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    {editingDept ? (
                      <div className="space-y-2">
                        <NativeSelect aria-label="Department" value={selectedDeptId} onChange={(e) => setSelectedDeptId(e.target.value)}
                          className={selectCls}>
                          <option value="">No Department</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </NativeSelect>
                        <div className="flex gap-2">
                          <Button variant="ghost" onClick={() => setEditingDept(false)}
                            className="flex-1 py-1.5 text-xs text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">
                            Cancel
                          </Button>
                          <Button onClick={() => deptMutation.mutate(selectedDeptId)}
                            disabled={deptMutation.isPending}
                            className="flex-1 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary disabled:opacity-50 transition-colors">
                            {deptMutation.isPending ? "…" : "Save"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground">
                          {employee.department?.name ?? <span className="text-muted-foreground italic text-xs">Unassigned</span>}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Date joined + service */}
                  {employee.dateJoined && (
                    <div className="pt-3 border-t border-border grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Date Joined</p>
                        <p className="text-sm font-medium text-foreground">{formatDate(employee.dateJoined)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">Service</p>
                        <p className="text-sm font-medium text-foreground">{yearsMonths(employee.dateJoined) ?? "—"}</p>
                      </div>
                    </div>
                  )}

                  {/* Password reset */}
                  {isAdminOnly && empRaw?.userId && (
                    <div className="pt-3 border-t border-border">
                      <Button
                        variant="outline"
                        onClick={() => setShowResetModal(true)}
                        className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors">
                        <KeyRound className="h-3.5 w-3.5" /> Reset Password
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Committees */}
            {employee.committeeMembers.length > 0 && (
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <CardHeader icon={Users} title="Committee Memberships" iconColor="text-primary" iconBg="bg-primary/10" />
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {employee.committeeMembers.map((m, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted border border-border">
                      <span className="text-sm font-medium text-foreground">{m.committee.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{m.committee.type}</span>
                        {m.roleInCommittee && (
                          <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            {m.roleInCommittee}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Master Data tab ───────────────────────────────────────────── */}
        {activeTab === "master-data" && employee && completion && (
          <div className="space-y-5">

            {/* Completeness overview */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={ClipboardList} title="Data Completeness" />
              <div className="p-5">
                {/* Overall score */}
                <div className="flex items-center gap-4 mb-5 pb-5 border-b border-border">
                  <RingGauge pct={completion.overall} size={72} strokeWidth={7} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-3xl font-black text-foreground leading-none tabular-nums">{completion.overall}<span className="text-base font-semibold text-muted-foreground">%</span></span>
                      <CompletionBadge status={statusLabel(completion.overall)} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {(() => {
                        const keys = Object.keys(GROUP_LABELS) as GroupKey[];
                        const done = keys.filter((k) => (completion.groups[k] ?? 0) >= 90).length;
                        return `${done} of ${keys.length} sections complete`;
                      })()}
                    </p>
                  </div>
                </div>

                {/* Section bars */}
                <div className="space-y-3.5">
                  {(Object.keys(GROUP_LABELS) as GroupKey[]).map((key) => {
                    const pct = completion.groups[key] ?? 0;
                    const sectionIcons: Record<GroupKey, ElementType> = {
                      IDENTITY: User, WORK_ALLOCATION: Briefcase, ROLE_RESPONSIBILITY: FileText, CONTACT: Phone, SKILL: TrendingUp,
                    };
                    const Icon = sectionIcons[key];
                    const color = ringColor(pct);
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-foreground truncate">{GROUP_LABELS[key]}</span>
                            <span className="text-xs font-bold tabular-nums ml-2 shrink-0" style={{ color }}>{pct}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Section 1 — Identity */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={User} title="Section 1 — Identity" />
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Employee Code">
                  <Input className={inputCls} value={form.employeeCode ?? ""} onChange={(e) => set("employeeCode", e.target.value)} placeholder="EMP-0001" />
                </FormField>
                <FormField label="First Name">
                  <Input className={readonlyCls} value={employee.firstName} readOnly />
                </FormField>
                <FormField label="Middle Name">
                  <Input className={inputCls} value={form.middleName ?? ""} onChange={(e) => set("middleName", e.target.value)} placeholder="Middle name" />
                </FormField>
                <FormField label="Last Name">
                  <Input className={readonlyCls} value={employee.lastName} readOnly />
                </FormField>
                <FormField label="Gender">
                  <NativeSelect className={selectCls} value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value || undefined)}>
                    <option value="">— Select —</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </NativeSelect>
                </FormField>
                <FormField label="Date of Birth">
                  <Input type="date" className={inputCls} value={form.dateOfBirth ?? ""} onChange={(e) => set("dateOfBirth", e.target.value)} />
                </FormField>
                <FormField label="National ID">
                  <Input className={inputCls} value={form.nationalId ?? ""} onChange={(e) => set("nationalId", e.target.value)} placeholder="ID number" />
                </FormField>
                <FormField label="Nationality">
                  <Input className={inputCls} value={form.nationality ?? ""} onChange={(e) => set("nationality", e.target.value)} placeholder="e.g. Kenyan" />
                </FormField>
              </div>
            </div>

            {/* Section 2 — Work Allocation */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={Briefcase} title="Section 2 — Work Allocation" iconColor="text-info" iconBg="bg-info-subtle" />
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Department">
                  <Input className={readonlyCls} value={employee.department?.name ?? "—"} readOnly />
                </FormField>
                <FormField label="Plant / Branch">
                  <Input className={inputCls} value={form.plantBranch ?? ""} onChange={(e) => set("plantBranch", e.target.value)} placeholder="e.g. Head Office, ROTO" />
                </FormField>
                <FormField label="Employment Status">
                  <NativeSelect className={selectCls} value={form.employmentStatus ?? ""} onChange={(e) => set("employmentStatus", e.target.value || undefined)}>
                    {(Object.entries(EMPLOYMENT_STATUS_LABELS) as [string, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Employment Type">
                  <NativeSelect className={selectCls} value={form.employmentType ?? ""} onChange={(e) => set("employmentType", e.target.value || undefined)}>
                    <option value="">— Select —</option>
                    {(Object.entries(EMPLOYMENT_TYPE_LABELS) as [string, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="Job Title / Designation">
                  <Input className={inputCls} value={form.jobTitle ?? ""} onChange={(e) => set("jobTitle", e.target.value)} placeholder="e.g. Machine Operator" />
                </FormField>
                <FormField label="Date Joined">
                  <Input type="date" className={inputCls} value={form.dateJoined ?? ""} onChange={(e) => set("dateJoined", e.target.value)} />
                </FormField>
                <FormField label="Length of Service">
                  <Input className={readonlyCls} value={yearsMonths(employee.dateJoined) ?? "—"} readOnly />
                </FormField>
                <FormField label="Work Station / Line">
                  <Input className={inputCls} value={form.workStation ?? ""} onChange={(e) => set("workStation", e.target.value)} placeholder="e.g. Line 3" />
                </FormField>
                <FormField label="Section / Area">
                  <Input className={inputCls} value={form.section ?? ""} onChange={(e) => set("section", e.target.value)} placeholder="e.g. Assembly" />
                </FormField>
                <FormField label="Sub-Section / Line">
                  <Input className={inputCls} value={form.subSection ?? ""} onChange={(e) => set("subSection", e.target.value)} placeholder="e.g. Sub-line A" />
                </FormField>
                <FormField label="Shift">
                  <Input className={inputCls} value={form.shift ?? ""} onChange={(e) => set("shift", e.target.value)} placeholder="e.g. Morning, Night" />
                </FormField>
                <FormField label="Reporting Manager">
                  <NativeSelect className={selectCls} value={form.reportingManagerId ?? ""} onChange={(e) => set("reportingManagerId", e.target.value)}>
                    <option value="">— None —</option>
                    {employeesData?.data.filter((e) => e.id !== id).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}{e.jobTitle ? ` (${e.jobTitle})` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="HR Record Owner">
                  <NativeSelect className={selectCls} value={form.hrRecordOwnerId ?? ""} onChange={(e) => set("hrRecordOwnerId", e.target.value)}>
                    <option value="">— None —</option>
                    {employeesData?.data.filter((e) => e.id !== id).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}{e.jobTitle ? ` (${e.jobTitle})` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              </div>
            </div>

            {/* Section 3 — Role & Responsibility */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={FileText} title="Section 3 — Role & Responsibility" iconColor="text-primary" iconBg="bg-primary/10" />
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Level"><Input className={inputCls} value={form.level ?? ""} onChange={(e) => set("level", e.target.value)} placeholder="e.g. L3, Senior" /></FormField>
                  <FormField label="Grade"><Input className={inputCls} value={form.grade ?? ""} onChange={(e) => set("grade", e.target.value)} placeholder="e.g. G5" /></FormField>
                  <FormField label="Job Category"><Input className={inputCls} value={form.jobCategory ?? ""} onChange={(e) => set("jobCategory", e.target.value)} placeholder="e.g. Technical, Support" /></FormField>
                  <FormField label="Primary Work Role"><Input className={inputCls} value={form.primaryWorkRole ?? ""} onChange={(e) => set("primaryWorkRole", e.target.value)} placeholder="e.g. Operator, Inspector" /></FormField>
                  <FormField label="Machine / Process"><Input className={inputCls} value={form.machineProcess ?? ""} onChange={(e) => set("machineProcess", e.target.value)} placeholder="e.g. CNC-04, Welding" /></FormField>
                </div>
                <FormField label="Job Description">
                  <Textarea rows={3} className={`${inputCls} resize-none`} value={form.jobDescription ?? ""} onChange={(e) => set("jobDescription", e.target.value)} placeholder="Key responsibilities…" />
                </FormField>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Eligibility Flags</p>
                  <Toggle label="Can be assigned tasks" checked={form.canBeAssignedTasks ?? true} onChange={(v) => set("canBeAssignedTasks", v)} />
                  <Toggle label="Can be a committee member" checked={form.canBeMember ?? true} onChange={(v) => set("canBeMember", v)} />
                  <Toggle label="Can be a committee leader" checked={form.canBeLeader ?? false} onChange={(v) => set("canBeLeader", v)} />
                </div>
              </div>
            </div>

            {/* Section 4 — Contact */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={Phone} title="Section 4 — Contact" iconColor="text-success" iconBg="bg-success-subtle" />
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Mobile Number (system)"><Input className={readonlyCls} value={employee.phone ?? ""} readOnly /></FormField>
                <FormField label="Company Email (system)"><Input className={readonlyCls} value={employee.email ?? ""} readOnly /></FormField>
                <FormField label="WhatsApp Number"><Input className={inputCls} value={form.whatsappNumber ?? ""} onChange={(e) => set("whatsappNumber", e.target.value)} placeholder="e.g. 254712345678" /></FormField>
                <FormField label="Home Address"><Input className={inputCls} value={form.homeAddress ?? ""} onChange={(e) => set("homeAddress", e.target.value)} placeholder="Full home address" /></FormField>
                <FormField label="Emergency Contact Name"><Input className={inputCls} value={form.emergencyContactName ?? ""} onChange={(e) => set("emergencyContactName", e.target.value)} placeholder="Full name" /></FormField>
                <FormField label="Emergency Contact Phone"><Input className={inputCls} value={form.emergencyContactPhone ?? ""} onChange={(e) => set("emergencyContactPhone", e.target.value)} placeholder="254…" /></FormField>
                <FormField label="Emergency Contact Relationship"><Input className={inputCls} value={form.emergencyContactRelationship ?? ""} onChange={(e) => set("emergencyContactRelationship", e.target.value)} placeholder="e.g. Spouse, Parent" /></FormField>
              </div>
            </div>

            {/* Section 5 — Skill */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={TrendingUp} title="Section 5 — Skill" iconColor="text-success" iconBg="bg-success-subtle" />
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Skill Level">
                  <NativeSelect className={selectCls} value={form.skillLevel ?? ""} onChange={(e) => set("skillLevel", e.target.value || undefined)}>
                    <option value="">— Select —</option>
                    {(Object.entries(SKILL_LEVEL_LABELS) as [string, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </NativeSelect>
                </FormField>
                <label className="flex items-center gap-2.5 self-end py-2">
                  <Checkbox checked={form.trainingNeeded ?? false} onCheckedChange={(checked) => set("trainingNeeded", checked)} />
                  <span className="text-sm text-muted-foreground">Training needed</span>
                </label>
              </div>
            </div>

            {/* Save bar */}
            {saveError && (
              <div role="alert" className="bg-danger-subtle border border-danger/20 text-danger text-sm px-4 py-3 rounded-xl">{saveError}</div>
            )}
            <div className="sticky bottom-4 flex items-center gap-3">
              <Button
                onClick={() => { if (accessToken && id) saveMutation.mutate(); }}
                disabled={saving}
                className="flex items-center gap-2 bg-primary hover:bg-primary disabled:opacity-50 text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-primary/20"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-success font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Saved
                </span>
              )}
            </div>
          </div>
        )}

        {canUseDwms && activeTab === "dwms" && employee && accessToken && id && (
          <EmployeeDwmsPanel
            employeeId={id}
            accessToken={accessToken}
            jobTitle={employee.jobTitle}
            canManageActivities={isAdminOrHr}
          />
        )}

        {/* ── Activity tab ──────────────────────────────────────────────── */}
        {activeTab === "activity" && (
          <div className="space-y-5">
            {calStats ? (
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <CardHeader icon={CalendarCheck} title="Calendar Activity" iconColor="text-primary" iconBg="bg-primary/10" />
                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col items-center gap-1 bg-success-subtle border border-success/20 rounded-xl py-4">
                      <CalendarCheck className="h-5 w-5 text-success" />
                      <p className="text-2xl font-bold text-success">{calStats.accepted}</p>
                      <p className="text-[11px] text-success font-semibold">Accepted</p>
                    </div>
                    <div className="flex flex-col items-center gap-1 bg-danger-subtle border border-danger/20 rounded-xl py-4">
                      <CalendarX className="h-5 w-5 text-danger" />
                      <p className="text-2xl font-bold text-danger">{calStats.declined}</p>
                      <p className="text-[11px] text-danger font-semibold">Declined</p>
                    </div>
                    <div className="flex flex-col items-center gap-1 bg-warning-subtle border border-warning/20 rounded-xl py-4">
                      <Clock className="h-5 w-5 text-warning" />
                      <p className="text-2xl font-bold text-warning">{calStats.pending}</p>
                      <p className="text-[11px] text-warning font-semibold">Pending</p>
                    </div>
                  </div>

                  {inviteLog && inviteLog.invitations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Invitation History</p>
                      <div className="space-y-1.5">
                        {inviteLog.invitations.map((inv) => {
                          const cfg = EVENT_COLOR_CONFIG[inv.event.color];
                          const statusCls =
                            inv.status === "ACCEPTED" ? "bg-success-subtle text-success"
                            : inv.status === "DECLINED" ? "bg-danger-subtle text-danger"
                            : "bg-warning-subtle text-warning";
                          return (
                            <div key={inv.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted px-3 py-2.5">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${cfg?.dot ?? "bg-muted-foreground"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{inv.event.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(inv.event.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                  {" · "}{inv.event.createdBy.firstName} {inv.event.createdBy.lastName}
                                </p>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusCls}`}>
                                {inv.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {inviteLog.total > 10 && (
                        <div className="flex items-center justify-between pt-1">
                          <p className="text-xs text-muted-foreground">
                            {((inviteLogPage - 1) * 10) + 1}–{Math.min(inviteLogPage * 10, inviteLog.total)} of {inviteLog.total}
                          </p>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" aria-label="Previous invitation page" disabled={inviteLogPage === 1} onClick={() => setInviteLogPage((p) => p - 1)}
                              className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-muted-foreground disabled:opacity-40 transition-colors">
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" aria-label="Next invitation page" disabled={inviteLogPage * 10 >= inviteLog.total} onClick={() => setInviteLogPage((p) => p + 1)}
                              className="h-7 w-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-muted-foreground disabled:opacity-40 transition-colors">
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {inviteLog && inviteLog.invitations.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No meeting invitations recorded yet.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
              </div>
            )}
          </div>
        )}

        {/* ── Avatar modal ──────────────────────────────────────────────── */}
        <Dialog open={showAvatarModal} onOpenChange={(open) => {
          if (!open && !avatarMutation.isPending) setShowAvatarModal(false);
        }}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Update Profile Picture</DialogTitle>
              <DialogDescription>Paste a publicly accessible image URL.</DialogDescription>
            </DialogHeader>
            <Input aria-label="Image URL" type="url" value={avatarInput} onChange={(e) => setAvatarInput(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              disabled={avatarMutation.isPending} />
            {avatarMutation.error && <p role="alert" className="text-caption text-danger">{avatarMutation.error.message}</p>}
            {avatarInput && (
              <div className="mb-4 rounded-xl overflow-hidden h-20 w-20 bg-muted border border-border">
                <TenantImage src={avatarInput} alt="Preview" className="w-full h-full object-cover"
                  onError={(e) => (e.currentTarget.style.display = "none")} />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" disabled={avatarMutation.isPending} onClick={() => setShowAvatarModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => avatarMutation.mutate(avatarInput)} disabled={avatarMutation.isPending || !avatarInput.trim()}>
                {avatarMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Reset password modal ──────────────────────────────────────── */}
        <Dialog disablePointerDismissal open={showResetModal} onOpenChange={(open) => {
          if (!open && !resetPasswordMutation.isPending && !resetResult) closeResetModal();
        }}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Reset Password — {fullName}</DialogTitle>
            </DialogHeader>

            {resetResult ? (
              <div className="space-y-4 mt-3">
                <DialogDescription>
                  Share this temporary password with {employee?.firstName} directly (call, chat, in person).
                  It expires in {resetResult.expiresInMinutes} minutes and can only be used once. They&apos;ll enter it
                  on the &quot;Forgot password&quot; page to set their own new password.
                </DialogDescription>
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-muted border border-border rounded-lg">
                  <code className="text-sm font-mono font-semibold text-foreground tracking-wide">{resetResult.tempPassword}</code>
                  <Button variant="ghost" onClick={copyTempPassword}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors shrink-0">
                    {resetCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    {resetCopied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <div className="flex justify-end pt-1">
                  <Button onClick={closeResetModal}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 mt-3">
                <DialogDescription>
                  This generates a short-lived temporary password for {employee?.firstName}. Their current
                  password stays valid until they redeem it. You&apos;ll see it here once, to share with them yourself.
                </DialogDescription>
                {resetPasswordMutation.error && (
                  <p role="alert" className="flex items-center gap-1.5 text-xs text-danger">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {resetPasswordMutation.error.message}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" disabled={resetPasswordMutation.isPending} onClick={closeResetModal}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => resetPasswordMutation.mutate()}
                    disabled={resetPasswordMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary disabled:opacity-50 transition-colors">
                    {resetPasswordMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                    Generate Password
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </ProtectedRoute>
  );
}
