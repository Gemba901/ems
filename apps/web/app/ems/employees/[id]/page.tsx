"use client";

import { useState, type ElementType } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, EmployeeProfile, CompletionResult,
  EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS, SKILL_LEVEL_LABELS,
  GROUP_LABELS, UpdateEmployeeEmsPayload, GroupKey, completionBg,
} from "@/services/ems.service";
import {
  ArrowLeft, Save, Loader2, CheckCircle2,
  ClipboardList, User, Briefcase, FileText, Phone, TrendingUp, Users,
  CalendarCheck, CalendarX, Clock, ChevronLeft, ChevronRight,
} from "lucide-react";
import { CalendarService, EVENT_TYPE_CONFIG } from "@/services/calendar.service";
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

// ── Components ────────────────────────────────────────────────────────────────

function RingGauge({ pct, size = 100, strokeWidth = 9 }: { pct: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} className="absolute">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={ringColor(pct)} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
        />
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
    Good:      "bg-blue-100 text-blue-700",
    Fair:      "bg-amber-100 text-amber-700",
    Poor:      "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${map[status] ?? map.Poor}`}>
      {status}
    </span>
  );
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
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${checked ? "bg-indigo-600" : "bg-slate-200"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </button>
    </label>
  );
}

const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all";
const selectCls = `${inputCls} bg-white`;
const readonlyCls = `${inputCls} bg-slate-50 text-slate-500 cursor-default`;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EmployeeEmsEditPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<UpdateEmployeeEmsPayload>({});
  const [formInitialized, setFormInitialized] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: ["ems-employee", id],
    queryFn: () => EmsService.getEmployee(id!, accessToken!),
    enabled: !!accessToken && !!id,
  });

  const { data: employeesData } = useQuery({
    queryKey: ["ems-employees-list"],
    queryFn: () => EmsService.getEmployees(accessToken!, { limit: 200 }),
    enabled: !!accessToken,
  });

  if (data && !formInitialized) {
    const emp = data.employee;
    setForm({
      // Identity
      employeeCode:  emp.employeeCode ?? "",
      middleName:    emp.middleName ?? "",
      gender:        emp.gender ?? undefined,
      dateOfBirth:   emp.dateOfBirth ? emp.dateOfBirth.split("T")[0] : "",
      nationalId:    emp.nationalId ?? "",
      nationality:   emp.nationality ?? "",

      // Work Allocation
      employmentStatus: emp.employmentStatus,
      employmentType:   emp.employmentType ?? undefined,
      jobTitle:         emp.jobTitle ?? "",
      dateJoined:       emp.dateJoined ? emp.dateJoined.split("T")[0] : "",
      workStation:      emp.workStation ?? "",
      section:          emp.section ?? "",
      subSection:       emp.subSection ?? "",
      shift:            emp.shift ?? "",
      reportingManagerId: emp.reportingManagerId ?? "",
      hrRecordOwnerId:    emp.hrRecordOwnerId ?? "",

      // Role & Responsibility
      jobDescription:   emp.jobDescription ?? "",
      level:            emp.level ?? "",
      grade:            emp.grade ?? "",
      jobCategory:      emp.jobCategory ?? "",
      primaryWorkRole:  emp.primaryWorkRole ?? "",
      machineProcess:   emp.machineProcess ?? "",
      canBeAssignedTasks: emp.canBeAssignedTasks,
      canBeMember:        emp.canBeMember,
      canBeLeader:        emp.canBeLeader,

      // Contact
      whatsappNumber:               emp.whatsappNumber ?? "",
      homeAddress:                  emp.homeAddress ?? "",
      emergencyContactName:         emp.emergencyContactName ?? "",
      emergencyContactPhone:        emp.emergencyContactPhone ?? "",
      emergencyContactRelationship: emp.emergencyContactRelationship ?? "",

      // Skill
      skillLevel:    emp.skillLevel ?? undefined,
      trainingNeeded: emp.trainingNeeded ?? false,
    });
    setFormInitialized(true);
  }

  const employee: EmployeeProfile | null   = data?.employee ?? null;
  const completion: CompletionResult | null = data?.completion ?? null;
  const error = queryError ? (queryError as any).message : null;

  const saveMutation = useMutation({
    mutationFn: () => EmsService.updateEmployee(id!, form, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ems-employee", id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const set = (key: keyof UpdateEmployeeEmsPayload, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const saving = saveMutation.isPending;
  const saveError = saveMutation.error ? (saveMutation.error as any).message : null;

  const [inviteLogPage, setInviteLogPage] = useState(1);

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

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="space-y-6">

        {/* Page header */}
        <div className="flex items-center gap-3">
          <Link
            href="/ems/employees"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {employee ? `${employee.firstName}${employee.middleName ? " " + employee.middleName : ""} ${employee.lastName}` : "Employee Profile"}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {employee?.department?.name ? `${employee.department.name} · ` : ""}
              {employee?.updatedAt ? `Last updated ${formatDate(employee.updatedAt)}` : "Edit EMS data"}
            </p>
          </div>
          {employee?.employeeCode && (
            <span className="ml-auto text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
              {employee.employeeCode}
            </span>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-16 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {(error || saveError) && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error || saveError}</div>
        )}

        {employee && completion && (
          <>
            {/* ── Completion overview ───────────────────────────────────── */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader icon={ClipboardList} title="Data Completeness" />
              <div className="p-5 flex flex-col sm:flex-row items-center gap-6">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <RingGauge pct={completion.overall} size={100} strokeWidth={9} />
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-[11px] text-slate-400">Overall</p>
                    <StatusBadge status={statusLabel(completion.overall)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full">
                  {(Object.keys(GROUP_LABELS) as GroupKey[]).map((key) => {
                    const pct = completion.groups[key] ?? 0;
                    return (
                      <div key={key} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <RingGauge pct={pct} size={56} strokeWidth={5} />
                        <p className="text-[10px] font-semibold text-slate-500 text-center leading-tight">{GROUP_LABELS[key]}</p>
                        <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${completionBg(pct)}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Form sections ─────────────────────────────────────────── */}
            <div className="space-y-5">

              {/* Section 1 — Identity */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <CardHeader icon={User} title="Section 1 — Identity" iconColor="text-indigo-500" iconBg="bg-indigo-50" />
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
                    <select
                      className={selectCls}
                      value={form.reportingManagerId ?? ""}
                      onChange={(e) => set("reportingManagerId", e.target.value)}
                    >
                      <option value="">— None —</option>
                      {employeesData?.data
                        .filter((e) => e.id !== id)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.firstName} {e.lastName}{e.jobTitle ? ` (${e.jobTitle})` : ""}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="HR Record Owner">
                    <select
                      className={selectCls}
                      value={form.hrRecordOwnerId ?? ""}
                      onChange={(e) => set("hrRecordOwnerId", e.target.value)}
                    >
                      <option value="">— None —</option>
                      {employeesData?.data
                        .filter((e) => e.id !== id)
                        .map((e) => (
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
                    <Field label="Level">
                      <input className={inputCls} value={form.level ?? ""} onChange={(e) => set("level", e.target.value)} placeholder="e.g. L3, Senior" />
                    </Field>
                    <Field label="Grade">
                      <input className={inputCls} value={form.grade ?? ""} onChange={(e) => set("grade", e.target.value)} placeholder="e.g. G5" />
                    </Field>
                    <Field label="Job Category">
                      <input className={inputCls} value={form.jobCategory ?? ""} onChange={(e) => set("jobCategory", e.target.value)} placeholder="e.g. Technical, Support" />
                    </Field>
                    <Field label="Primary Work Role">
                      <input className={inputCls} value={form.primaryWorkRole ?? ""} onChange={(e) => set("primaryWorkRole", e.target.value)} placeholder="e.g. Operator, Inspector" />
                    </Field>
                    <Field label="Machine / Process Assigned">
                      <input className={inputCls} value={form.machineProcess ?? ""} onChange={(e) => set("machineProcess", e.target.value)} placeholder="e.g. CNC-04, Welding" />
                    </Field>
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

                  {/* Steering Committee — read-only */}
                  {employee.committeeMembers.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Steering Committee Memberships</p>
                      <div className="space-y-2">
                        {employee.committeeMembers.map((m, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-sm">
                            <span className="font-medium text-slate-700">{m.committee.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">{m.committee.type}</span>
                              {m.roleInCommittee && (
                                <span className="text-xs font-semibold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{m.roleInCommittee}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 4 — Contact */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <CardHeader icon={Phone} title="Section 4 — Contact" iconColor="text-teal-500" iconBg="bg-teal-50" />
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Mobile Number (system)">
                    <input className={readonlyCls} value={employee.phone ?? ""} readOnly />
                  </Field>
                  <Field label="Company Email (system)">
                    <input className={readonlyCls} value={employee.email} readOnly />
                  </Field>
                  <Field label="WhatsApp Number">
                    <input className={inputCls} value={form.whatsappNumber ?? ""} onChange={(e) => set("whatsappNumber", e.target.value)} placeholder="e.g. 254712345678" />
                  </Field>
                  <Field label="Home Address">
                    <input className={inputCls} value={form.homeAddress ?? ""} onChange={(e) => set("homeAddress", e.target.value)} placeholder="Full home address" />
                  </Field>
                  <Field label="Emergency Contact Name">
                    <input className={inputCls} value={form.emergencyContactName ?? ""} onChange={(e) => set("emergencyContactName", e.target.value)} placeholder="Full name" />
                  </Field>
                  <Field label="Emergency Contact Phone">
                    <input className={inputCls} value={form.emergencyContactPhone ?? ""} onChange={(e) => set("emergencyContactPhone", e.target.value)} placeholder="254…" />
                  </Field>
                  <Field label="Emergency Contact Relationship">
                    <input className={inputCls} value={form.emergencyContactRelationship ?? ""} onChange={(e) => set("emergencyContactRelationship", e.target.value)} placeholder="e.g. Spouse, Parent" />
                  </Field>
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
            </div>

            {/* ── Calendar Activity ─────────────────────────────────────── */}
            {calStats && (
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <CardHeader icon={CalendarCheck} title="Calendar Activity" iconColor="text-violet-500" iconBg="bg-violet-50" />
                <div className="p-5 space-y-5">

                  {/* KPI counters */}
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

                  {/* Invitation log */}
                  {inviteLog && inviteLog.invitations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Invitation History</p>
                      <div className="space-y-1.5">
                        {inviteLog.invitations.map(inv => {
                          const cfg = EVENT_TYPE_CONFIG[inv.event.type];
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
                                  {new Date(inv.event.startAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}
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

                      {/* Pagination */}
                      {inviteLog.total > 10 && (
                        <div className="flex items-center justify-between pt-1">
                          <p className="text-xs text-slate-400">
                            {((inviteLogPage-1)*10)+1}–{Math.min(inviteLogPage*10, inviteLog.total)} of {inviteLog.total}
                          </p>
                          <div className="flex items-center gap-1">
                            <button
                              disabled={inviteLogPage === 1}
                              onClick={() => setInviteLogPage(p => p-1)}
                              className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <button
                              disabled={inviteLogPage * 10 >= inviteLog.total}
                              onClick={() => setInviteLogPage(p => p+1)}
                              className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors"
                            >
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
            )}

            {/* ── Save bar ──────────────────────────────────────────────── */}
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
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
