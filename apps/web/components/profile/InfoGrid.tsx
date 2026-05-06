"use client";

import { useState } from "react";
import { EmployeeProfileData } from "@/types/employee";
import { User, Pencil } from "lucide-react";

interface InfoGridProps {
  employee: EmployeeProfileData;
  canEdit?: boolean;
  onSave?: (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }) => Promise<void>;
}

export const InfoGrid = ({ employee, canEdit, onSave }: InfoGridProps) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone === "—" ? "" : employee.phone,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = "text") => (
    <div>
      <label className="text-[9px] uppercase tracking-wider text-slate-400 font-mono mb-1.5 block">
        {label}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-slate-800">
          <User className="h-4 w-4 text-slate-400" />
          <h3 className="text-xs font-bold tracking-widest uppercase">Personal Information</h3>
        </div>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field("First Name", "firstName")}
            {field("Last Name", "lastName")}
          </div>
          {field("Email Address", "email", "email")}
          {field("Phone Number", "phone", "tel")}
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-y-6 gap-x-4">
          {[
            { label: "First Name", value: employee.firstName },
            { label: "Last Name", value: employee.lastName },
            { label: "Email Address", value: employee.email, fullWidth: true },
            { label: "Phone Number", value: employee.phone },
            { label: "Employment Type", value: employee.employmentType },
          ].map((item) => (
            <div key={item.label} className={"fullWidth" in item && item.fullWidth ? "col-span-2" : ""}>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-mono mb-1.5">
                {item.label}
              </div>
              <div className="text-sm font-medium text-slate-900 break-all">{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
