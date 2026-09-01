"use client";

import { useState, type ElementType } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, EmployeeProfile, CompletionResult,
  EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS, SKILL_LEVEL_LABELS,
  GROUP_LABELS, UpdateEmployeeEmsPayload, GroupKey, completionBg,
} from "@/services/ems.service";
import { EmployeeService } from "@/services/employee.service";
import {
  ArrowLeft, Save, Loader2, CheckCircle2,
  ClipboardList, User, Briefcase, FileText, Phone, TrendingUp,
  CalendarCheck, CalendarX, Clock, ChevronLeft, ChevronRight,
  Camera, Pencil, Lock, Building2, Users, Shield,
  KeyRound, Copy, Check, AlertCircle,
} from "lucide-react";
import { CalendarService, EVENT_COLOR_CONFIG } from "@/services/calendar.service";
import EmployeeDwmsPanel from "@/app/dwms/components/EmployeeDwmsPanel";
import { useOrgModules } from "@/hooks/useOrgModules";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ringColor(pct: number) {
  if (pct >= 97) return "#10b981";
  if (pct >= 90) return "#3b82f6";
  if (pct >= 75) return "#f59e0b";
  return "#ef4444";
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColor(pct)}
          strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-bold text-slate-800 leading-none" style={{ fontSize: Math.max(size * 0.18, 10) }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Excellent: "bg-emerald-100 text-emerald-700",
    Good: "bg-blue-100 text-blue-700",
    Fair: "bg-amber-100 text-amber-700",
    Poor: "bg-red-100 text-red-700",
  };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${map[status] ?? map.Poor}`}>{status}</span>;
}

function CardHeader({ icon: Icon, title, iconColor = "text-indigo-500", iconBg = "bg-indigo-50" }: {
  icon: ElementType; title: string; iconColor?: string; iconBg?: string;
}) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2.5">
      <div className={`p-1.5 rounded-lg ${iconBg}`}>
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
      </div>
      <p className="text-sm font-bold text-slate-800">{title}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
      <span className="text-sm text-slate-700">{label}</span>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${checked ? "bg-indigo-600" : "bg-slate-200"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </button>
    </label>
  );
}

const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all";
const selectCls = `${inputCls} bg-white`;
const readonlyCls = `${inputCls} bg-slate-50 text-slate-500 cursor-default`;

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-700",
  ADMIN: "bg-red-100 text-red-700",
  MANAGEMENT: "bg-blue-100 text-blue-700",
  HR: "bg-teal-100 text-teal-700",
  HOD: "bg-amber-100 text-amber-700",
  EMPLOYEE: "bg-slate-100 text-slate-600",
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
  const saveError = saveMutation.error ? (saveMutation.error as any).message : null;
  const loading = emsLoading || empLoading;
  const error = emsError ? (emsError as any).message : null;

  const fullName = employee
    ? `${employee.firstName}${employee.middleName ? " " + employee.middleName : ""} ${employee.lastName}`
    : "Employee";

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "master-data", label: "Master Data" },
    ...(canUseDwms ? [{ id: "dwms" as const, label: "DWMS" }] : []),
    { id: "activity", label: "Activity" },
  ];

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="space-y-5">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-slate-900 truncate">{fullName}</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {employee?.department?.name ?? "—"}
              {employee?.jobTitle ? ` · ${employee.jobTitle}` : ""}
            </p>
          </div>
          {employee?.employeeCode && (
            <span className="shrink-0 text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
              {employee.employeeCode}
            </span>
          )}
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-16 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
        )}

        {/* ── Profile tab ───────────────────────────────────────────────── */}
        {activeTab === "profile" && employee && (
          <div className="space-y-5">

            {/* Identity card */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 flex items-center gap-5">
              <div className="relative group shrink-0">
                <div className="h-20 w-20 rounded-2xl overflow-hidden bg-slate-100">
                  {employee.avatarUrl ? (
                    <img src={employee.avatarUrl} alt={fullName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xl font-bold text-slate-400">
                      {employee.firstName[0]}{employee.lastName[0]}
                    </div>
                  )}
                </div>
                {canEditAvatar && (
                  <button
                    onClick={() => setShowAvatarModal(true)}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Camera className="h-5 w-5 text-white" />
                  </button>
                )}
                <div className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 border-2 border-white rounded-full ${
                  employee.employmentStatus === "ACTIVE" ? "bg-emerald-500" : "bg-slate-300"
                }`} />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-slate-900 truncate">{fullName}</h2>
                {employee.jobTitle && (
                  <p className="text-sm text-slate-500 mt-0.5">{employee.jobTitle}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {systemRole !== "—" && (
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${ROLE_COLORS[systemRole] ?? "bg-slate-100 text-slate-600"}`}>
                      {systemRole}
                    </span>
                  )}
                  {employee.department?.name && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {employee.department.name}
                    </span>
                  )}
                  {completion && (
                    <span className="text-xs font-semibold text-slate-500 ml-auto flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${
                        completion.overall >= 90 ? "bg-emerald-500"
                          : completion.overall >= 75 ? "bg-amber-400" : "bg-red-400"
                      }`} />
                      {completion.overall}% complete
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Personal info */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-indigo-50">
                      <User className="h-3.5 w-3.5 text-indigo-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">Personal Information</p>
                  </div>
                  {isAdminOrHr && !editingPersonal && (
                    <button onClick={() => setEditingPersonal(true)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 transition-colors">
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  )}
                </div>

                <div className="p-5">
                  {editingPersonal ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-slate-500 block mb-1">First Name</label>
                          <input className={inputCls} value={personalForm.firstName}
                            onChange={(e) => setPersonalForm((f) => ({ ...f, firstName: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-500 block mb-1">Last Name</label>
                          <input className={inputCls} value={personalForm.lastName}
                            onChange={(e) => setPersonalForm((f) => ({ ...f, lastName: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1">Email</label>
                        <input type="email" className={inputCls} value={personalForm.email}
                          onChange={(e) => setPersonalForm((f) => ({ ...f, email: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1">Phone</label>
                        <input type="tel" className={inputCls} value={personalForm.phone}
                          onChange={(e) => setPersonalForm((f) => ({ ...f, phone: e.target.value }))} />
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                        <button onClick={() => setEditingPersonal(false)}
                          className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                          Cancel
                        </button>
                        <button
                          onClick={() => personalMutation.mutate(personalForm)}
                          disabled={personalMutation.isPending}
                          className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                          {personalMutation.isPending ? "Saving…" : "Save"}
                        </button>
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
                          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1">{item.label}</p>
                          <p className="text-sm font-medium text-slate-800 break-all">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* System access */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-violet-50">
                    <Lock className="h-3.5 w-3.5 text-violet-500" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">System Access</p>
                </div>

                <div className="p-5 space-y-4">
                  {/* Role */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">System Role</p>
                      {isAdminOnly && !editingRole && (
                        <button onClick={() => setEditingRole(true)}
                          className="text-slate-400 hover:text-indigo-600 transition-colors">
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {editingRole ? (
                      <div className="space-y-2">
                        <select value={selectedRoleId} onChange={(e) => setSelectedRoleId(Number(e.target.value))}
                          className={selectCls}>
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingRole(false)}
                            className="flex-1 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                            Cancel
                          </button>
                          <button onClick={() => roleMutation.mutate(selectedRoleId)}
                            disabled={roleMutation.isPending}
                            className="flex-1 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                            {roleMutation.isPending ? "…" : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className={`inline-block text-[11px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg ${ROLE_COLORS[systemRole] ?? "bg-slate-100 text-slate-600"}`}>
                        {systemRole}
                      </span>
                    )}
                  </div>

                  {/* Department */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Department</p>
                      {isAdminOrHr && !editingDept && (
                        <button onClick={() => setEditingDept(true)}
                          className="text-slate-400 hover:text-indigo-600 transition-colors">
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {editingDept ? (
                      <div className="space-y-2">
                        <select value={selectedDeptId} onChange={(e) => setSelectedDeptId(e.target.value)}
                          className={selectCls}>
                          <option value="">No Department</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingDept(false)}
                            className="flex-1 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                            Cancel
                          </button>
                          <button onClick={() => deptMutation.mutate(selectedDeptId)}
                            disabled={deptMutation.isPending}
                            className="flex-1 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                            {deptMutation.isPending ? "…" : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="text-sm font-medium text-slate-800">
                          {employee.department?.name ?? <span className="text-slate-400 italic text-xs">Unassigned</span>}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Date joined + service */}
                  {employee.dateJoined && (
                    <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1">Date Joined</p>
                        <p className="text-sm font-medium text-slate-800">{formatDate(employee.dateJoined)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono mb-1">Service</p>
                        <p className="text-sm font-medium text-slate-800">{yearsMonths(employee.dateJoined) ?? "—"}</p>
                      </div>
                    </div>
                  )}

                  {/* Password reset */}
                  {isAdminOnly && empRaw?.userId && (
                    <div className="pt-3 border-t border-slate-100">
                      <button
                        onClick={() => setShowResetModal(true)}
                        className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors">
                        <KeyRound className="h-3.5 w-3.5" /> Reset Password
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Committees */}
            {employee.committeeMembers.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <CardHeader icon={Users} title="Committee Memberships" iconColor="text-purple-500" iconBg="bg-purple-50" />
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {employee.committeeMembers.map((m, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-sm font-medium text-slate-800">{m.committee.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">{m.committee.type}</span>
                        {m.roleInCommittee && (
                          <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
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
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={ClipboardList} title="Data Completeness" />
              <div className="p-5">
                {/* Overall score */}
                <div className="flex items-center gap-4 mb-5 pb-5 border-b border-slate-100">
                  <RingGauge pct={completion.overall} size={72} strokeWidth={7} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-3xl font-black text-slate-900 leading-none tabular-nums">{completion.overall}<span className="text-base font-semibold text-slate-300">%</span></span>
                      <StatusBadge status={statusLabel(completion.overall)} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">
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
                        <div className="h-7 w-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                          <Icon className="h-3.5 w-3.5 text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-slate-700 truncate">{GROUP_LABELS[key]}</span>
                            <span className="text-xs font-bold tabular-nums ml-2 shrink-0" style={{ color }}>{pct}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
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
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={User} title="Section 1 — Identity" />
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Employee Code">
                  <input className={inputCls} value={form.employeeCode ?? ""} onChange={(e) => set("employeeCode", e.target.value)} placeholder="EMP-0001" />
                </Field>
                <Field label="First Name">
                  <input className={readonlyCls} value={employee.firstName} readOnly />
                </Field>
                <Field label="Middle Name">
                  <input className={inputCls} value={form.middleName ?? ""} onChange={(e) => set("middleName", e.target.value)} placeholder="Middle name" />
                </Field>
                <Field label="Last Name">
                  <input className={readonlyCls} value={employee.lastName} readOnly />
                </Field>
                <Field label="Gender">
                  <select className={selectCls} value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value || undefined)}>
                    <option value="">— Select —</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
                <Field label="Date of Birth">
                  <input type="date" className={inputCls} value={form.dateOfBirth ?? ""} onChange={(e) => set("dateOfBirth", e.target.value)} />
                </Field>
                <Field label="National ID">
                  <input className={inputCls} value={form.nationalId ?? ""} onChange={(e) => set("nationalId", e.target.value)} placeholder="ID number" />
                </Field>
                <Field label="Nationality">
                  <input className={inputCls} value={form.nationality ?? ""} onChange={(e) => set("nationality", e.target.value)} placeholder="e.g. Kenyan" />
                </Field>
              </div>
            </div>

            {/* Section 2 — Work Allocation */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={Briefcase} title="Section 2 — Work Allocation" iconColor="text-blue-500" iconBg="bg-blue-50" />
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Department">
                  <input className={readonlyCls} value={employee.department?.name ?? "—"} readOnly />
                </Field>
                <Field label="Plant / Branch">
                  <input className={inputCls} value={form.plantBranch ?? ""} onChange={(e) => set("plantBranch", e.target.value)} placeholder="e.g. Head Office, ROTO" />
                </Field>
                <Field label="Employment Status">
                  <select className={selectCls} value={form.employmentStatus ?? ""} onChange={(e) => set("employmentStatus", e.target.value || undefined)}>
                    {(Object.entries(EMPLOYMENT_STATUS_LABELS) as [string, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Employment Type">
                  <select className={selectCls} value={form.employmentType ?? ""} onChange={(e) => set("employmentType", e.target.value || undefined)}>
                    <option value="">— Select —</option>
                    {(Object.entries(EMPLOYMENT_TYPE_LABELS) as [string, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Job Title / Designation">
                  <input className={inputCls} value={form.jobTitle ?? ""} onChange={(e) => set("jobTitle", e.target.value)} placeholder="e.g. Machine Operator" />
                </Field>
                <Field label="Date Joined">
                  <input type="date" className={inputCls} value={form.dateJoined ?? ""} onChange={(e) => set("dateJoined", e.target.value)} />
                </Field>
                <Field label="Length of Service">
                  <input className={readonlyCls} value={yearsMonths(employee.dateJoined) ?? "—"} readOnly />
                </Field>
                <Field label="Work Station / Line">
                  <input className={inputCls} value={form.workStation ?? ""} onChange={(e) => set("workStation", e.target.value)} placeholder="e.g. Line 3" />
                </Field>
                <Field label="Section / Area">
                  <input className={inputCls} value={form.section ?? ""} onChange={(e) => set("section", e.target.value)} placeholder="e.g. Assembly" />
                </Field>
                <Field label="Sub-Section / Line">
                  <input className={inputCls} value={form.subSection ?? ""} onChange={(e) => set("subSection", e.target.value)} placeholder="e.g. Sub-line A" />
                </Field>
                <Field label="Shift">
                  <input className={inputCls} value={form.shift ?? ""} onChange={(e) => set("shift", e.target.value)} placeholder="e.g. Morning, Night" />
                </Field>
                <Field label="Reporting Manager">
                  <select className={selectCls} value={form.reportingManagerId ?? ""} onChange={(e) => set("reportingManagerId", e.target.value)}>
                    <option value="">— None —</option>
                    {employeesData?.data.filter((e) => e.id !== id).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}{e.jobTitle ? ` (${e.jobTitle})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="HR Record Owner">
                  <select className={selectCls} value={form.hrRecordOwnerId ?? ""} onChange={(e) => set("hrRecordOwnerId", e.target.value)}>
                    <option value="">— None —</option>
                    {employeesData?.data.filter((e) => e.id !== id).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}{e.jobTitle ? ` (${e.jobTitle})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            {/* Section 3 — Role & Responsibility */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={FileText} title="Section 3 — Role & Responsibility" iconColor="text-violet-500" iconBg="bg-violet-50" />
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Level"><input className={inputCls} value={form.level ?? ""} onChange={(e) => set("level", e.target.value)} placeholder="e.g. L3, Senior" /></Field>
                  <Field label="Grade"><input className={inputCls} value={form.grade ?? ""} onChange={(e) => set("grade", e.target.value)} placeholder="e.g. G5" /></Field>
                  <Field label="Job Category"><input className={inputCls} value={form.jobCategory ?? ""} onChange={(e) => set("jobCategory", e.target.value)} placeholder="e.g. Technical, Support" /></Field>
                  <Field label="Primary Work Role"><input className={inputCls} value={form.primaryWorkRole ?? ""} onChange={(e) => set("primaryWorkRole", e.target.value)} placeholder="e.g. Operator, Inspector" /></Field>
                  <Field label="Machine / Process"><input className={inputCls} value={form.machineProcess ?? ""} onChange={(e) => set("machineProcess", e.target.value)} placeholder="e.g. CNC-04, Welding" /></Field>
                </div>
                <Field label="Job Description">
                  <textarea rows={3} className={`${inputCls} resize-none`} value={form.jobDescription ?? ""} onChange={(e) => set("jobDescription", e.target.value)} placeholder="Key responsibilities…" />
                </Field>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Eligibility Flags</p>
                  <Toggle label="Can be assigned tasks" checked={form.canBeAssignedTasks ?? true} onChange={(v) => set("canBeAssignedTasks", v)} />
                  <Toggle label="Can be a committee member" checked={form.canBeMember ?? true} onChange={(v) => set("canBeMember", v)} />
                  <Toggle label="Can be a committee leader" checked={form.canBeLeader ?? false} onChange={(v) => set("canBeLeader", v)} />
                </div>
              </div>
            </div>

            {/* Section 4 — Contact */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={Phone} title="Section 4 — Contact" iconColor="text-teal-500" iconBg="bg-teal-50" />
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Mobile Number (system)"><input className={readonlyCls} value={employee.phone ?? ""} readOnly /></Field>
                <Field label="Company Email (system)"><input className={readonlyCls} value={employee.email ?? ""} readOnly /></Field>
                <Field label="WhatsApp Number"><input className={inputCls} value={form.whatsappNumber ?? ""} onChange={(e) => set("whatsappNumber", e.target.value)} placeholder="e.g. 254712345678" /></Field>
                <Field label="Home Address"><input className={inputCls} value={form.homeAddress ?? ""} onChange={(e) => set("homeAddress", e.target.value)} placeholder="Full home address" /></Field>
                <Field label="Emergency Contact Name"><input className={inputCls} value={form.emergencyContactName ?? ""} onChange={(e) => set("emergencyContactName", e.target.value)} placeholder="Full name" /></Field>
                <Field label="Emergency Contact Phone"><input className={inputCls} value={form.emergencyContactPhone ?? ""} onChange={(e) => set("emergencyContactPhone", e.target.value)} placeholder="254…" /></Field>
                <Field label="Emergency Contact Relationship"><input className={inputCls} value={form.emergencyContactRelationship ?? ""} onChange={(e) => set("emergencyContactRelationship", e.target.value)} placeholder="e.g. Spouse, Parent" /></Field>
              </div>
            </div>

            {/* Section 5 — Skill */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={TrendingUp} title="Section 5 — Skill" iconColor="text-emerald-500" iconBg="bg-emerald-50" />
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Skill Level">
                  <select className={selectCls} value={form.skillLevel ?? ""} onChange={(e) => set("skillLevel", e.target.value || undefined)}>
                    <option value="">— Select —</option>
                    {(Object.entries(SKILL_LEVEL_LABELS) as [string, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Training Needed">
                  <label className="flex items-center gap-2.5 mt-2 cursor-pointer">
                    <input type="checkbox" checked={form.trainingNeeded ?? false} onChange={(e) => set("trainingNeeded", e.target.checked)} className="h-4 w-4 rounded accent-indigo-600" />
                    <span className="text-sm text-slate-600">Yes, this employee needs training</span>
                  </label>
                </Field>
              </div>
            </div>

            {/* Save bar */}
            {saveError && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{saveError}</div>
            )}
            <div className="sticky bottom-4 flex items-center gap-3">
              <button
                onClick={() => { if (accessToken && id) saveMutation.mutate(); }}
                disabled={saving}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-indigo-200"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving…" : "Save Changes"}
              </button>
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
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
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <CardHeader icon={CalendarCheck} title="Calendar Activity" iconColor="text-violet-500" iconBg="bg-violet-50" />
                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col items-center gap-1 bg-emerald-50 border border-emerald-100 rounded-xl py-4">
                      <CalendarCheck className="h-5 w-5 text-emerald-500" />
                      <p className="text-2xl font-bold text-emerald-700">{calStats.accepted}</p>
                      <p className="text-[11px] text-emerald-600 font-semibold">Accepted</p>
                    </div>
                    <div className="flex flex-col items-center gap-1 bg-red-50 border border-red-100 rounded-xl py-4">
                      <CalendarX className="h-5 w-5 text-red-400" />
                      <p className="text-2xl font-bold text-red-600">{calStats.declined}</p>
                      <p className="text-[11px] text-red-500 font-semibold">Declined</p>
                    </div>
                    <div className="flex flex-col items-center gap-1 bg-amber-50 border border-amber-100 rounded-xl py-4">
                      <Clock className="h-5 w-5 text-amber-400" />
                      <p className="text-2xl font-bold text-amber-600">{calStats.pending}</p>
                      <p className="text-[11px] text-amber-500 font-semibold">Pending</p>
                    </div>
                  </div>

                  {inviteLog && inviteLog.invitations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Invitation History</p>
                      <div className="space-y-1.5">
                        {inviteLog.invitations.map((inv) => {
                          const cfg = EVENT_COLOR_CONFIG[inv.event.color];
                          const statusCls =
                            inv.status === "ACCEPTED" ? "bg-emerald-100 text-emerald-700"
                            : inv.status === "DECLINED" ? "bg-red-100 text-red-600"
                            : "bg-amber-100 text-amber-700";
                          return (
                            <div key={inv.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${cfg?.dot ?? "bg-slate-400"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 truncate">{inv.event.title}</p>
                                <p className="text-xs text-slate-400">
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
                          <p className="text-xs text-slate-400">
                            {((inviteLogPage - 1) * 10) + 1}–{Math.min(inviteLogPage * 10, inviteLog.total)} of {inviteLog.total}
                          </p>
                          <div className="flex items-center gap-1">
                            <button disabled={inviteLogPage === 1} onClick={() => setInviteLogPage((p) => p - 1)}
                              className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors">
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <button disabled={inviteLogPage * 10 >= inviteLog.total} onClick={() => setInviteLogPage((p) => p + 1)}
                              className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors">
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {inviteLog && inviteLog.invitations.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">No meeting invitations recorded yet.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-12 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
              </div>
            )}
          </div>
        )}

        {/* ── Avatar modal ──────────────────────────────────────────────── */}
        {showAvatarModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Update Profile Picture</h3>
              <p className="text-xs text-slate-500 mb-4">Paste a publicly accessible image URL.</p>
              <input type="url" value={avatarInput} onChange={(e) => setAvatarInput(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
              {avatarInput && (
                <div className="mb-4 rounded-xl overflow-hidden h-20 w-20 bg-slate-100 border border-slate-200">
                  <img src={avatarInput} alt="Preview" className="w-full h-full object-cover"
                    onError={(e) => (e.currentTarget.style.display = "none")} />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAvatarModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors">
                  Cancel
                </button>
                <button onClick={() => avatarMutation.mutate(avatarInput)}
                  disabled={avatarMutation.isPending || !avatarInput.trim()}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {avatarMutation.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Reset password modal ──────────────────────────────────────── */}
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Reset Password — {fullName}</h3>

              {resetResult ? (
                <div className="space-y-4 mt-3">
                  <p className="text-xs text-slate-500">
                    Share this temporary password with {employee?.firstName} directly (call, chat, in person).
                    It expires in {resetResult.expiresInMinutes} minutes and can only be used once. They&apos;ll enter it
                    on the &quot;Forgot password&quot; page to set their own new password.
                  </p>
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <code className="text-sm font-mono font-semibold text-slate-900 tracking-wide">{resetResult.tempPassword}</code>
                    <button onClick={copyTempPassword}
                      className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors shrink-0">
                      {resetCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {resetCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button onClick={closeResetModal}
                      className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 mt-3">
                  <p className="text-xs text-slate-500">
                    This generates a short-lived temporary password for {employee?.firstName}. Their current
                    password stays valid until they redeem it. You&apos;ll see it here once, to share with them yourself.
                  </p>
                  {resetPasswordMutation.error && (
                    <p className="flex items-center gap-1.5 text-xs text-red-600">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {(resetPasswordMutation.error as any).message}
                    </p>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={closeResetModal}
                      className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={() => resetPasswordMutation.mutate()}
                      disabled={resetPasswordMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                      {resetPasswordMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                      Generate Password
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}
