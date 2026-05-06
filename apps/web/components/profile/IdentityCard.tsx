"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmployeeProfileData } from "@/types/employee";
import { Camera } from "lucide-react";

interface IdentityCardProps {
  employee: EmployeeProfileData;
  canEditAvatar?: boolean;
  onAvatarSave?: (url: string) => Promise<void>;
}

export const IdentityCard = ({ employee, canEditAvatar, onAvatarSave }: IdentityCardProps) => {
  const [showAvatarInput, setShowAvatarInput] = useState(false);
  const [avatarInput, setAvatarInput] = useState(employee.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);

  const handleAvatarSave = async () => {
    if (!onAvatarSave) return;
    setSaving(true);
    try {
      await onAvatarSave(avatarInput);
      setShowAvatarInput(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-6">
      <div className="relative group shrink-0">
        <div className="h-24 w-24 bg-slate-800 rounded-2xl overflow-hidden">
          <img
            src={employee.avatarUrl ?? "/api/placeholder/100/100"}
            alt={employee.name}
            className="w-full h-full object-cover"
          />
        </div>
        {canEditAvatar && (
          <button
            onClick={() => setShowAvatarInput(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
            title="Update profile picture"
          >
            <Camera className="h-5 w-5 text-white" />
          </button>
        )}
        <div
          className={`absolute -bottom-1 -right-1 h-4 w-4 border-2 border-white rounded-full ${
            employee.status === "Active" ? "bg-emerald-500" : "bg-slate-300"
          }`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-blue-600 font-mono mb-1">
          STAFF ID: {employee.employeeId}
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1 truncate">{employee.name}</h2>
        <p className="text-sm text-slate-500 mb-3">{employee.role}</p>
        <div className="flex flex-col gap-2">
          <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none w-fit">
            {employee.employmentType}
          </Badge>
          <p className="text-blue-600 text-xs">{employee.department}</p>
        </div>
      </div>

      {showAvatarInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Update Profile Picture</h3>
            <p className="text-xs text-slate-500 mb-4">Paste a publicly accessible image URL.</p>
            <input
              type="url"
              value={avatarInput}
              onChange={(e) => setAvatarInput(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {avatarInput && (
              <div className="mb-4 rounded-xl overflow-hidden h-20 w-20 bg-slate-100 border border-slate-200">
                <img
                  src={avatarInput}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowAvatarInput(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAvatarSave}
                disabled={saving || !avatarInput.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
