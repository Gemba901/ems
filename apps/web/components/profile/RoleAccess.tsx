"use client";

import { useState } from "react";
import { Lock, Pencil, Building2 } from "lucide-react";
import { EmployeeProfileData } from "@/types/employee";

const ROLE_OPTIONS = [
  { id: 2, name: "ADMIN" },
  { id: 3, name: "MANAGEMENT" },
  { id: 6, name: "HR" },
  { id: 4, name: "HOD" },
  { id: 5, name: "EMPLOYEE" },
];

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-50 text-purple-700",
  ADMIN: "bg-red-50 text-red-700",
  MANAGEMENT: "bg-blue-50 text-blue-700",
  HR: "bg-teal-50 text-teal-700",
  HOD: "bg-amber-50 text-amber-700",
  EMPLOYEE: "bg-slate-100 text-slate-600",
};

interface RoleAccessProps {
  employee: EmployeeProfileData;
  canEditRole?: boolean;
  canEditDepartment?: boolean;
  departments?: { id: string; name: string }[];
  onRoleSave?: (roleId: number) => Promise<void>;
  onDepartmentSave?: (departmentId: string) => Promise<void>;
}

export function RoleAccess({
  employee,
  canEditRole,
  canEditDepartment,
  departments = [],
  onRoleSave,
  onDepartmentSave,
}: RoleAccessProps) {
  const [editingRole, setEditingRole] = useState(false);
  const [editingDept, setEditingDept] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<number>(employee.roleId ?? 5);
  const [selectedDeptId, setSelectedDeptId] = useState<string>(employee.departmentId ?? "");
  const [saving, setSaving] = useState(false);

  const handleRoleSave = async () => {
    if (!onRoleSave) return;
    setSaving(true);
    try {
      await onRoleSave(selectedRoleId);
      setEditingRole(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDeptSave = async () => {
    if (!onDepartmentSave) return;
    setSaving(true);
    try {
      await onDepartmentSave(selectedDeptId);
      setEditingDept(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <Lock className="h-4 w-4 text-slate-400" />
        <h3 className="text-xs font-bold tracking-widest text-slate-800 uppercase">
          Role & Department
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Role */}
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-mono">
              System Role
            </div>
            {canEditRole && !editingRole && (
              <button
                onClick={() => setEditingRole(true)}
                className="text-slate-400 hover:text-blue-600 transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>

          {editingRole ? (
            <div className="space-y-3">
              <select
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingRole(false)}
                  className="flex-1 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-white bg-transparent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRoleSave}
                  disabled={saving}
                  className="flex-1 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <span
              className={`inline-block text-[11px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg ${
                ROLE_COLORS[employee.role] ?? "bg-slate-100 text-slate-600"
              }`}
            >
              {employee.role}
            </span>
          )}
        </div>

        {/* Department */}
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-mono">
              Department
            </div>
            {canEditDepartment && !editingDept && (
              <button
                onClick={() => setEditingDept(true)}
                className="text-slate-400 hover:text-blue-600 transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>

          {editingDept ? (
            <div className="space-y-3">
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingDept(false)}
                  className="flex-1 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-white bg-transparent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeptSave}
                  disabled={saving}
                  className="flex-1 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="text-sm font-medium text-slate-900">
                {employee.department === "—" ? (
                  <span className="text-slate-400 italic text-xs">Unassigned</span>
                ) : (
                  employee.department
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
