"use client";

import { useState, type ElementType } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, EmployeeProfile, CompletionResult,
  EMPLOYMENT_STATUS_LABELS, SKILL_LEVEL_LABELS, GROUP_LABELS,
  UpdateEmployeeEmsPayload, GroupKey, completionBg,
} from "@/services/ems.service";
import {
  ArrowLeft, Save, Loader2, CheckCircle2,
  ClipboardList, User, Briefcase, FileText, Phone, TrendingUp,
} from "lucide-react";
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
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor(pct)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
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
  icon: ElementType;
  title: string;
  iconColor?: string;
  iconBg?: string;
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

  // Initialize form once data loads
  if (data && !formInitialized) {
    const emp = data.employee;
    setForm({
      employeeCode:                 emp.employeeCode ?? "",
      gender:                       emp.gender ?? undefined,
      dateOfBirth:                  emp.dateOfBirth ? emp.dateOfBirth.split("T")[0] : "",
      nationalId:                   emp.nationalId ?? "",
      employmentStatus:             emp.employmentStatus,
      jobTitle:                     emp.jobTitle ?? "",
      dateJoined:                   emp.dateJoined ? emp.dateJoined.split("T")[0] : "",
      workStation:                  emp.workStation ?? "",
      jobDescription:               emp.jobDescription ?? "",
      homeAddress:                  emp.homeAddress ?? "",
      emergencyContactName:         emp.emergencyContactName ?? "",
      emergencyContactPhone:        emp.emergencyContactPhone ?? "",
      emergencyContactRelationship: emp.emergencyContactRelationship ?? "",
      skillLevel:                   emp.skillLevel ?? undefined,
      trainingNeeded:               emp.trainingNeeded ?? false,
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

  const handleSave = () => {
    if (!accessToken || !id) return;
    saveMutation.mutate();
  };

  const saving = saveMutation.isPending;
  const saveError = saveMutation.error ? (saveMutation.error as any).message : null;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="max-w-7xl mx-auto space-y-6">

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
              {employee ? `${employee.firstName} ${employee.lastName}` : "Employee Profile"}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {employee?.department?.name ? `${employee.department.name} · ` : ""}Edit EMS data
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
                {/* Overall ring */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <RingGauge pct={completion.overall} size={100} strokeWidth={9} />
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-[11px] text-slate-400">Overall</p>
                    <StatusBadge status={statusLabel(completion.overall)} />
                  </div>
                </div>
                {/* Group rings */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full">
                  {(Object.keys(GROUP_LABELS) as GroupKey[]).map((key) => {
                    const pct = completion.groups[key] ?? 0;
                    return (
                      <div key={key} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <RingGauge pct={pct} size={56} strokeWidth={5} />
                        <p className="text-[10px] font-semibold text-slate-500 text-center leading-tight">
                          {GROUP_LABELS[key]}
                        </p>
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

              {/* Identity */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <CardHeader icon={User} title="Identity" iconColor="text-indigo-500" iconBg="bg-indigo-50" />
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Employee Code">
                    <input
                      className={inputCls}
                      value={form.employeeCode ?? ""}
                      onChange={(e) => set("employeeCode", e.target.value)}
                      placeholder="EMP-0001"
                    />
                  </Field>
                  <Field label="Gender">
                    <select
                      className={selectCls}
                      value={form.gender ?? ""}
                      onChange={(e) => set("gender", e.target.value || undefined)}
                    >
                      <option value="">— Select —</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </Field>
                  <Field label="Date of Birth">
                    <input
                      type="date"
                      className={inputCls}
                      value={form.dateOfBirth ?? ""}
                      onChange={(e) => set("dateOfBirth", e.target.value)}
                    />
                  </Field>
                  <Field label="National ID">
                    <input
                      className={inputCls}
                      value={form.nationalId ?? ""}
                      onChange={(e) => set("nationalId", e.target.value)}
                      placeholder="ID number"
                    />
                  </Field>
                </div>
              </div>

              {/* Work Allocation */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <CardHeader icon={Briefcase} title="Work Allocation" iconColor="text-blue-500" iconBg="bg-blue-50" />
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Employment Status">
                    <select
                      className={selectCls}
                      value={form.employmentStatus ?? ""}
                      onChange={(e) => set("employmentStatus", e.target.value || undefined)}
                    >
                      {(Object.entries(EMPLOYMENT_STATUS_LABELS) as [string, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Job Title">
                    <input
                      className={inputCls}
                      value={form.jobTitle ?? ""}
                      onChange={(e) => set("jobTitle", e.target.value)}
                      placeholder="e.g. Machine Operator"
                    />
                  </Field>
                  <Field label="Date Joined">
                    <input
                      type="date"
                      className={inputCls}
                      value={form.dateJoined ?? ""}
                      onChange={(e) => set("dateJoined", e.target.value)}
                    />
                  </Field>
                  <Field label="Work Station / Line">
                    <input
                      className={inputCls}
                      value={form.workStation ?? ""}
                      onChange={(e) => set("workStation", e.target.value)}
                      placeholder="e.g. Line 3"
                    />
                  </Field>
                </div>
              </div>

              {/* Role & Responsibility */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <CardHeader icon={FileText} title="Role & Responsibility" iconColor="text-violet-500" iconBg="bg-violet-50" />
                <div className="p-5">
                  <Field label="Job Description">
                    <textarea
                      rows={4}
                      className={`${inputCls} resize-none`}
                      value={form.jobDescription ?? ""}
                      onChange={(e) => set("jobDescription", e.target.value)}
                      placeholder="Describe the key responsibilities…"
                    />
                  </Field>
                </div>
              </div>

              {/* Contact */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <CardHeader icon={Phone} title="Contact" iconColor="text-teal-500" iconBg="bg-teal-50" />
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Phone (system)">
                    <input className={readonlyCls} value={employee.phone ?? ""} readOnly />
                  </Field>
                  <Field label="Email (system)">
                    <input className={readonlyCls} value={employee.email} readOnly />
                  </Field>
                  <Field label="Home Address">
                    <input
                      className={inputCls}
                      value={form.homeAddress ?? ""}
                      onChange={(e) => set("homeAddress", e.target.value)}
                      placeholder="Full home address"
                    />
                  </Field>
                  <Field label="Emergency Contact Name">
                    <input
                      className={inputCls}
                      value={form.emergencyContactName ?? ""}
                      onChange={(e) => set("emergencyContactName", e.target.value)}
                      placeholder="Full name"
                    />
                  </Field>
                  <Field label="Emergency Contact Phone">
                    <input
                      className={inputCls}
                      value={form.emergencyContactPhone ?? ""}
                      onChange={(e) => set("emergencyContactPhone", e.target.value)}
                      placeholder="+254…"
                    />
                  </Field>
                  <Field label="Emergency Contact Relationship">
                    <input
                      className={inputCls}
                      value={form.emergencyContactRelationship ?? ""}
                      onChange={(e) => set("emergencyContactRelationship", e.target.value)}
                      placeholder="e.g. Spouse, Parent"
                    />
                  </Field>
                </div>
              </div>

              {/* Skill */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <CardHeader icon={TrendingUp} title="Skill" iconColor="text-emerald-500" iconBg="bg-emerald-50" />
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Skill Level">
                    <select
                      className={selectCls}
                      value={form.skillLevel ?? ""}
                      onChange={(e) => set("skillLevel", e.target.value || undefined)}
                    >
                      <option value="">— Select —</option>
                      {(Object.entries(SKILL_LEVEL_LABELS) as [string, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Training Needed">
                    <label className="flex items-center gap-2.5 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.trainingNeeded ?? false}
                        onChange={(e) => set("trainingNeeded", e.target.checked)}
                        className="h-4 w-4 rounded accent-indigo-600"
                      />
                      <span className="text-sm text-slate-600">Yes, this employee needs training</span>
                    </label>
                  </Field>
                </div>
              </div>
            </div>

            {/* ── Save bar ──────────────────────────────────────────────── */}
            <div className="sticky bottom-4 flex items-center gap-3">
              <button
                onClick={handleSave}
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
