"use client";

import { use, useEffect, useState } from "react";
import { IdentityCard } from "../../../../components/profile/IdentityCard";
import { InfoGrid } from "../../../../components/profile/InfoGrid";
import { MetricCard } from "../../../../components/profile/MetricCard";
import { OrgContext } from "../../../../components/profile/OrgContext";
import { HistoryTimeline } from "../../../../components/profile/HistoryTimeline";
import { RoleAccess } from "../../../../components/profile/RoleAccess";
import { EmployeeProfileData } from "@/types/employee";
import { Archive, BarChart2, Users } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { EmployeeService, EmployeeApiResponse } from "@/services/employee.service";

function mapToProfileData(emp: EmployeeApiResponse): EmployeeProfileData {
  return {
    id: emp.id,
    employeeId: `EMP-${emp.id.slice(0, 5).toUpperCase()}`,
    name: `${emp.firstName} ${emp.lastName}`,
    role: emp.user?.role?.name ?? "—",
    department: emp.department?.name ?? "—",
    status: "Active",
    email: emp.email,
    phone: emp.phone ?? emp.user?.phone ?? "—",
    dob: "—",
    nationalId: "—",
    address: "—",
    employmentType: "Full-Time",
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
  const { accessToken } = useAuthStore();
  const [employee, setEmployee] = useState<EmployeeProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    setLoading(true);
    EmployeeService.getById(id, accessToken)
      .then((data) => setEmployee(mapToProfileData(data)))
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

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
            Operations {">"} Team Directory
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Employee Profile
          </h1>
        </div>
        <div className="flex gap-3">
          <button className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-all">
            Edit Record
          </button>
          <button className="px-5 py-2.5 bg-blue-600 rounded-xl text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-all">
            Action Menu
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="flex flex-col gap-6">
          <IdentityCard employee={employee} />
          <InfoGrid employee={employee} />
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

        {/* Right Column */}
        <div className="col-span-2 flex flex-col gap-6">
          <OrgContext
            supervisor={{ name: "—", title: "—", initials: "—" }}
            directReports={[]}
          />
          <RoleAccess
            roleName={employee.role}
            permissions={[
              { title: "API Architecture", description: "Full rights", icon: Archive },
              { title: "Financials", description: "View-only", icon: BarChart2 },
              { title: "Personnel", description: "Approval rights", icon: Users },
            ]}
          />

          <div className="grid grid-cols-3 gap-6">
            <MetricCard
              title="Projects Completed"
              value={employee.metrics.projectsCompleted}
              progress={75}
              colorClass="bg-blue-600"
            />
            <MetricCard
              title="Utilization Rate"
              value={`${employee.metrics.utilizationRate}%`}
              progress={employee.metrics.utilizationRate}
              colorClass="bg-emerald-500"
            />
            <MetricCard
              title="Sprint Velocity"
              value={employee.metrics.velocity}
              progress={98}
              colorClass="bg-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
