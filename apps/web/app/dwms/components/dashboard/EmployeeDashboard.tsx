import React from 'react';
import type { DwmsEmployeeDashboardResponse } from '@/services/dwms.service';

type EmployeeDashboardProps = {
  employeeData: DwmsEmployeeDashboardResponse;
  loggedInUserId: string;
  onSelectEmployee?: (empId: string) => void;
  activeSubTab?: 'insights' | 'team';
};

function formatDuration(minutes: number | undefined) {
  if (minutes === undefined || minutes === null || isNaN(minutes)) return '0 min';
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1)} hrs`;
  }
  return `${Math.round(minutes)} min`;
}

export default function EmployeeDashboard({
  employeeData,
  loggedInUserId,
  onSelectEmployee,
  activeSubTab = 'insights'
}: EmployeeDashboardProps) {
  const isSelf = employeeData.employee?.id === loggedInUserId;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {(activeSubTab === 'team' && isSelf) && employeeData.reporteesPerformance && employeeData.reporteesPerformance.length > 0 && (
        <div className="rounded-2xl border border-border-app bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6 lg:col-span-3">
          <h3 className="font-semibold text-text-app mb-1">My Reportees Performance</h3>
          <p className="text-xs text-muted-app mb-4">Click on any reportee to view their detailed performance insights, trends, and tasks.</p>
          <div className="overflow-x-auto">
            <table className="min-w-[42rem] w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border-app text-muted-app font-semibold">
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3 text-center">Tasks Today</th>
                  <th className="py-2.5 px-3 text-center">Avg Acknowledge</th>
                </tr>
              </thead>
              <tbody>
                {[...(employeeData.reporteesPerformance ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((rep) => (
                  <tr
                    key={rep.id}
                    onClick={() => onSelectEmployee?.(rep.id)}
                    className="border-b border-border-app/50 hover:bg-slate-50 cursor-pointer transition"
                  >
                    <td className="py-3 px-3 font-semibold text-text-app">{rep.name}</td>
                    <td className="py-3 px-3 text-muted-app">{rep.role}</td>
                    <td className="py-3 px-3 text-muted-app">{rep.departmentName}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-lg font-semibold ${
                        (rep.tasksPerformedTodayPercent ?? 0) >= 80 ? 'bg-emerald-50 text-emerald-700' :
                        (rep.tasksPerformedTodayPercent ?? 0) >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {rep.tasksPerformedTodayPercent ?? 0}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center text-text-app">{formatDuration(rep.avgAcknowledgeTimeMin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
