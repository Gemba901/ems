"use client";

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, EmployeeProfile, CompletionResult,
  GROUP_LABELS, GroupKey, EMPLOYMENT_STATUS_LABELS, SKILL_LEVEL_LABELS,
  completionColor, completionBg,
} from "@/services/ems.service";
import { Loader2, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

function CompletionRing({ pct, size = 96 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 97 ? "#10b981" : pct >= 90 ? "#3b82f6" : pct >= 75 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={10} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <span className={`absolute inset-0 flex flex-col items-center justify-center font-bold ${completionColor(pct)}`}>
        <span className="text-2xl leading-none">{pct}%</span>
        <span className="text-[10px] text-slate-400 font-normal mt-0.5">complete</span>
      </span>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs font-semibold text-slate-400 w-36 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm ${value ? "text-slate-700" : "text-slate-300 italic"}`}>
        {value || "Not provided"}
      </span>
    </div>
  );
}

export default function MyProfilePage() {
  const { accessToken } = useAuthStore();

  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: ["ems-my-profile"],
    queryFn: () => EmsService.getMyProfile(accessToken!),
    enabled: !!accessToken,
  });

  const employee: EmployeeProfile | null    = data?.employee   ?? null;
  const completion: CompletionResult | null = data?.completion ?? null;
  const error = queryError ? (queryError as any).message : null;

  const isIncomplete = completion && completion.overall < 90;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
      <div className="space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your employee master data completeness</p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-16 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
        )}

        {employee && completion && (
          <>
            {/* Incomplete alert */}
            {isIncomplete && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Your profile is {completion.overall}% complete</p>
                  <p className="text-sm text-amber-700 mt-0.5">
                    Please visit <span className="font-semibold">HR</span> to have your data updated. A complete profile ensures accurate records and smooth HR processes.
                  </p>
                </div>
              </div>
            )}

            {completion.overall >= 90 && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-700">
                  Your profile is <span className="font-semibold">{completion.overall}% complete</span>. Great job keeping your data up to date!
                </p>
              </div>
            )}

            {/* Completion overview */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6">
              <div className="flex flex-col sm:flex-row items-center gap-8">
                <CompletionRing pct={completion.overall} />
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                  {(Object.keys(GROUP_LABELS) as GroupKey[]).map((key) => {
                    const pct = completion.groups[key] ?? 0;
                    return (
                      <div key={key} className="border border-slate-100 rounded-xl p-3">
                        <p className="text-xs text-slate-400 font-medium mb-1.5">{GROUP_LABELS[key]}</p>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                          <div className={`h-full ${completionBg(pct)}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className={`text-sm font-bold ${completionColor(pct)}`}>{pct}%</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Profile data (read-only for employee) */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                <Info className="h-4 w-4 text-slate-400" />
                <p className="text-sm font-bold text-slate-800">Your Information on Record</p>
                <span className="ml-auto text-xs text-slate-400">Contact HR to update any field</span>
              </div>
              <div className="p-6 space-y-6">

                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Identity</p>
                  <div className="space-y-2">
                    <ProfileField label="Employee Code" value={employee.employeeCode} />
                    <ProfileField label="Full Name" value={`${employee.firstName} ${employee.lastName}`} />
                    <ProfileField label="Gender" value={employee.gender ? { MALE: "Male", FEMALE: "Female", OTHER: "Other" }[employee.gender] : null} />
                    <ProfileField label="Date of Birth" value={employee.dateOfBirth ? new Date(employee.dateOfBirth).toLocaleDateString("en-GB") : null} />
                    <ProfileField label="National ID" value={employee.nationalId} />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Work Allocation</p>
                  <div className="space-y-2">
                    <ProfileField label="Department" value={employee.department?.name} />
                    <ProfileField label="Job Title" value={employee.jobTitle} />
                    <ProfileField label="Employment Status" value={EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]} />
                    <ProfileField label="Date Joined" value={employee.dateJoined ? new Date(employee.dateJoined).toLocaleDateString("en-GB") : null} />
                    <ProfileField label="Work Station" value={employee.workStation} />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Contact</p>
                  <div className="space-y-2">
                    <ProfileField label="Phone" value={employee.phone} />
                    <ProfileField label="Email" value={employee.email} />
                    <ProfileField label="Home Address" value={employee.homeAddress} />
                    <ProfileField label="Emergency Contact" value={employee.emergencyContactName} />
                    <ProfileField label="Emergency Phone" value={employee.emergencyContactPhone} />
                    <ProfileField label="Relationship" value={employee.emergencyContactRelationship} />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Skill</p>
                  <div className="space-y-2">
                    <ProfileField
                      label="Skill Level"
                      value={employee.skillLevel ? SKILL_LEVEL_LABELS[employee.skillLevel] : null}
                    />
                    <ProfileField label="Training Needed" value={employee.trainingNeeded === null ? null : employee.trainingNeeded ? "Yes" : "No"} />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
