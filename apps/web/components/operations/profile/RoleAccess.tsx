"use client";

import { useState } from "react";
import { Lock, Pencil, Building2 } from "lucide-react";
import { EmployeeProfileData } from "@/types/employee";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

const ROLE_OPTIONS = [
  { id: 2, name: "ADMIN" },
  { id: 3, name: "MANAGEMENT" },
  { id: 6, name: "HR" },
  { id: 4, name: "HOD" },
  { id: 5, name: "EMPLOYEE" },
];

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-primary/10 text-primary",
  ADMIN: "bg-danger-subtle text-danger",
  MANAGEMENT: "bg-info-subtle text-info",
  HR: "bg-success-subtle text-success",
  HOD: "bg-warning-subtle text-warning",
  EMPLOYEE: "bg-muted text-muted-foreground",
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
    <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-bold tracking-widest text-foreground uppercase">
          Role & Department
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Role */}
        <div className="bg-muted rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono">
              System Role
            </div>
            {canEditRole && !editingRole && (
              <Button variant="ghost"
                onClick={() => setEditingRole(true)}
                className="text-muted-foreground hover:text-info transition-colors h-auto whitespace-normal"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>

          {editingRole ? (
            <div className="space-y-3">
              <NativeSelect
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(Number(e.target.value))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
              <div className="flex gap-2">
                <Button variant="ghost"
                  onClick={() => setEditingRole(false)}
                  className="flex-1 py-1.5 text-xs text-muted-foreground border border-border rounded-lg hover:bg-card bg-transparent h-auto whitespace-normal"
                >
                  Cancel
                </Button>
                <Button variant="ghost"
                  onClick={handleRoleSave}
                  disabled={saving}
                  className="flex-1 py-1.5 text-xs bg-info text-info-foreground rounded-lg hover:bg-info disabled:opacity-50 h-auto whitespace-normal"
                >
                  {saving ? "..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <span
              className={`inline-block text-[11px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg ${
                ROLE_COLORS[employee.role] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {employee.role}
            </span>
          )}
        </div>

        {/* Department */}
        <div className="bg-muted rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono">
              Department
            </div>
            {canEditDepartment && !editingDept && (
              <Button variant="ghost"
                onClick={() => setEditingDept(true)}
                className="text-muted-foreground hover:text-info transition-colors h-auto whitespace-normal"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>

          {editingDept ? (
            <div className="space-y-3">
              <NativeSelect
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
              <div className="flex gap-2">
                <Button variant="ghost"
                  onClick={() => setEditingDept(false)}
                  className="flex-1 py-1.5 text-xs text-muted-foreground border border-border rounded-lg hover:bg-card bg-transparent h-auto whitespace-normal"
                >
                  Cancel
                </Button>
                <Button variant="ghost"
                  onClick={handleDeptSave}
                  disabled={saving}
                  className="flex-1 py-1.5 text-xs bg-info text-info-foreground rounded-lg hover:bg-info disabled:opacity-50 h-auto whitespace-normal"
                >
                  {saving ? "..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground">
                {employee.department === "—" ? (
                  <span className="text-muted-foreground italic text-xs">Unassigned</span>
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
