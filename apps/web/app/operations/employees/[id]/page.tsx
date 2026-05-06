"use client";

import { use, useEffect, useState } from "react";
import { IdentityCard } from "../../../../components/profile/IdentityCard";
import { InfoGrid } from "../../../../components/profile/InfoGrid";
import { CommitteesCard } from "../../../../components/profile/CommitteesCard";
import { RoleAccess } from "../../../../components/profile/RoleAccess";
import { HistoryTimeline } from "../../../../components/profile/HistoryTimeline";
import { EmployeeProfileData } from "@/types/employee";
import { useAuthStore, Role } from "@/store/auth.store";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";

function mapToProfileData(emp: EmployeeApiResponse): EmployeeProfileData {
  const userOrg = emp.user?.organizations?.find(
    (o) => o.organizationId === emp.organizationId,
  );
  return {
    id: emp.id,
    userId: emp.userId,
    employeeId: `EMP-${emp.id.slice(0, 5).toUpperCase()}`,
    firstName: emp.firstName,
    lastName: emp.lastName,
    name: `${emp.firstName} ${emp.lastName}`,
    role: userOrg?.role?.name ?? "—",
    roleId: userOrg?.role?.id ?? null,
    department: emp.department?.name ?? "—",
    departmentId: emp.departmentId,
    organizationId: emp.organizationId,
    status: "Active",
    email: emp.email,
    phone: emp.phone ?? emp.user?.phone ?? "—",
    avatarUrl: emp.avatarUrl,
    employmentType: "Full-Time",
    committees: (emp.committeeMembers ?? []).map((cm) => ({
      id: cm.committee.id,
      name: cm.committee.name,
      type: cm.committee.type,
    })),
    directReports: [],
    metrics: { projectsCompleted: 0, utilizationRate: 0, velocity: "—" },
  };
}

export default function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { accessToken, user: viewer } = useAuthStore();

  const [employee, setEmployee] = useState<EmployeeProfileData | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewerRole = viewer?.roleLevel;
  const isAdminOrHr =
    viewerRole === Role.ADMIN ||
    viewerRole === Role.SUPER_ADMIN ||
    viewerRole === Role.HR;
  const isAdminOnly =
    viewerRole === Role.ADMIN || viewerRole === Role.SUPER_ADMIN;

  const reload = () => {
    if (!accessToken) return;
    EmployeeService.getById(id, accessToken)
      .then((data) => setEmployee(mapToProfileData(data)))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    Promise.all([
      EmployeeService.getById(id, accessToken),
      isAdminOrHr && viewer?.organizationId
        ? EmployeeService.getDepartments(viewer.organizationId, accessToken)
        : Promise.resolve([]),
    ])
      .then(([emp, depts]) => {
        setEmployee(mapToProfileData(emp));
        setDepartments(depts);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, accessToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Loading employee profile...
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500 text-sm">
        {error ?? "Employee not found."}
      </div>
    );
  }

  // The employee viewing their own profile can edit their avatar
  const canEditAvatar = viewer?.userId === employee.userId;

  const handleAvatarSave = async (avatarUrl: string) => {
    await EmployeeService.updateAvatar(employee.id, avatarUrl, accessToken!);
    reload();
  };

  const handlePersonalInfoSave = async (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }) => {
    await EmployeeService.update(employee.id, data, accessToken!);
    reload();
  };

  const handleRoleSave = async (roleId: number) => {
    await EmployeeService.updateRole(employee.id, roleId, accessToken!);
    reload();
  };

  const handleDepartmentSave = async (departmentId: string) => {
    await EmployeeService.update(
      employee.id,
      {
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        phone: employee.phone === "—" ? undefined : employee.phone,
        departmentId: departmentId || null,
      },
      accessToken!,
    );
    reload();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-8">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
            Operations {">"} Team Directory
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Employee Profile</h1>
        </div>
        <div className="flex gap-3">
          <span className="px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest uppercase bg-slate-100 text-slate-500">
            {employee.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="flex flex-col gap-6">
          <IdentityCard
            employee={employee}
            canEditAvatar={canEditAvatar}
            onAvatarSave={handleAvatarSave}
          />
          <InfoGrid
            employee={employee}
            canEdit={isAdminOrHr}
            onSave={handlePersonalInfoSave}
          />
          <CommitteesCard committees={employee.committees} />
        </div>

        {/* Right Column */}
        <div className="col-span-2 flex flex-col gap-6">
          <RoleAccess
            employee={employee}
            canEditRole={isAdminOnly}
            canEditDepartment={isAdminOrHr}
            departments={departments}
            onRoleSave={handleRoleSave}
            onDepartmentSave={handleDepartmentSave}
          />
          <HistoryTimeline
            history={[
              {
                role: employee.role,
                description: employee.department,
                date: "—",
                isCurrent: true,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
