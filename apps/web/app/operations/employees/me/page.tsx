"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Building2,
  ShieldCheck,
  Calendar,
  Users,
  Camera,
  X,
  Loader2,
} from "lucide-react";
import { useToast } from "@/contexts/toast.context";

function getInitials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function MyProfilePage() {
  const router = useRouter();
  const { accessToken, user: authUser } = useAuthStore();
  const { toast } = useToast();
  const [employee, setEmployee] = useState<EmployeeApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Avatar edit state
  const [avatarModal, setAvatarModal] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingAvatar, setSavingAvatar] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    EmployeeService.getMe(accessToken)
      .then(setEmployee)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Loading your profile...
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500 text-sm">
        {error ?? "Profile not found."}
      </div>
    );
  }

  const handleAvatarSave = async () => {
    if (!accessToken || !employee || !avatarUrl.trim()) return;
    setSavingAvatar(true);
    try {
      const updated = await EmployeeService.updateAvatar(employee.id, avatarUrl.trim(), accessToken);
      setEmployee(updated);
      setAvatarModal(false);
      toast("Profile picture updated!", "success");
    } catch (e: any) {
      toast(e.message || "Failed to update avatar", "error");
    } finally {
      setSavingAvatar(false);
    }
  };

  const fullName = `${employee.firstName} ${employee.lastName}`;
  const role = employee.user?.role?.name ?? authUser?.roleLevel ?? "—";
  const department = employee.department?.name ?? "—";
  const phone = employee.phone ?? employee.user?.phone ?? null;
  const staffId = `EMP-${employee.id.slice(0, 5).toUpperCase()}`;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="h-4 w-px bg-slate-200" />
        <div className="text-xs text-slate-400 font-mono uppercase tracking-widest">
          My Profile
        </div>
      </div>

      {/* Identity card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-center gap-5">
        <div className="relative shrink-0 group">
          {(employee as any).avatarUrl ? (
            <img
              src={(employee as any).avatarUrl}
              alt={fullName}
              className="h-16 w-16 rounded-2xl object-cover border border-slate-200"
            />
          ) : (
            <div className="h-16 w-16 rounded-2xl bg-slate-900 flex items-center justify-center">
              <span className="text-white font-bold text-xl">
                {getInitials(employee.firstName, employee.lastName)}
              </span>
            </div>
          )}
          <button
            onClick={() => { setAvatarUrl((employee as any).avatarUrl ?? ""); setAvatarModal(true); }}
            className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <Camera className="h-5 w-5 text-white" />
          </button>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-blue-600 mb-1">
            {staffId}
          </p>
          <h1 className="text-xl font-bold text-slate-900">{fullName}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{role} · {department}</p>
        </div>
        <div className="ml-auto shrink-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        </div>
      </div>

      {/* Contact info */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <User className="h-4 w-4 text-slate-400" />
          <h2 className="text-xs font-bold tracking-widest uppercase text-slate-700">
            Contact Information
          </h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Mail className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Email</p>
              <p className="text-sm font-medium text-slate-900">{employee.email}</p>
            </div>
          </div>

          {phone && (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <Phone className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Phone</p>
                <p className="text-sm font-medium text-slate-900">{phone}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Organization & Role */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <Building2 className="h-4 w-4 text-slate-400" />
          <h2 className="text-xs font-bold tracking-widest uppercase text-slate-700">
            Organization &amp; Role
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-slate-500" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Organization</p>
              <p className="text-sm font-medium text-slate-900">
                {authUser?.organizationName ?? "—"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4 text-indigo-500" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Role</p>
              <p className="text-sm font-medium text-slate-900">{role}</p>
            </div>
          </div>

          {department !== "—" && (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Department</p>
                <p className="text-sm font-medium text-slate-900">{department}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Member Since</p>
              <p className="text-sm font-medium text-slate-900">{formatDate(employee.createdAt)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Avatar edit modal */}
      {avatarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Update Profile Picture</h3>
              <button onClick={() => setAvatarModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-slate-500">Paste a publicly accessible image URL (HTTPS).</p>
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt="Preview"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  className="h-20 w-20 rounded-2xl object-cover border border-slate-200 mx-auto"
                />
              )}
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setAvatarModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleAvatarSave}
                  disabled={savingAvatar || !avatarUrl.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingAvatar && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
