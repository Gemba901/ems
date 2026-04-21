"use client"

import { IdentityCard } from "../../../../components/profile/IdentityCard";
import { InfoGrid } from "../../../../components/profile/InfoGrid";
import { MetricCard } from "../../../../components/profile/MetricCard";
import { OrgContext } from "../../../../components/profile/OrgContext";
import { HistoryTimeline } from "../../../../components/profile/HistoryTimeline";
import { RoleAccess } from "../../../../components/profile/RoleAccess";
import { EmployeeProfileData } from "@/types/employee";
import { Archive, BarChart2, Users } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

async function getEmployeeData(id: string): Promise<EmployeeProfileData> {
  const user = useAuthStore.getState().user;

  return {
    id: id,
    employeeId: "EMP-90241",
    name: user?.name || "??",
    role: "Senior Software Engineer",
    department: "Engineering Hub",
    status: "Active",
    email: "surya@gembapms.co.in",
    phone: user?.phone || "+254 700 000 000",
    dob: "Oct 14, 1994",
    nationalId: "XXX-XX-9481",
    address: "Nairobi, Kenya",
    employmentType: "Full-Time",
    metrics: { projectsCompleted: 14, utilizationRate: 94.2, velocity: "A+" },
    directReports: [{ name: "T1" }, { name: "T2" }],
  };
}

export default async function EmployeeProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const employee = await getEmployeeData(params.id);

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
                role: "CEO",
                description: "Lead dev...",
                date: "Since Jan 2024",
                isCurrent: true,
              },
            ]}
          />
        </div>

        {/* Right Column */}
        <div className="col-span-2 flex flex-col gap-6">
          <OrgContext
            supervisor={{
              name: "Sarah Hernandez",
              title: "VP of Engineering",
              initials: "SH",
            }}
            directReports={[
              {
                initials: "T1",
                name: "",
              },
              {
                initials: "T2",
                name: "",
              },
              {
                initials: "T3",
                name: "",
              },
              {
                initials: "T4",
                name: "",
              },
            ]}
          />
          <RoleAccess
            roleName="Admin Access"
            permissions={[
              {
                title: "API Architecture",
                description: "Full rights...",
                icon: Archive,
              },
              {
                title: "Financials",
                description: "View-only...",
                icon: BarChart2,
              },
              {
                title: "Personnel",
                description: "Approval rights...",
                icon: Users,
              },
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
