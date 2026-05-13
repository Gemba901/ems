import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { Activity, ShieldAlert, RefreshCw, Database } from "lucide-react";

export default function OperationsPage() {
  // Mock Audit Log Data
  const auditLogs = [
    { id: 1, action: "Payroll Sync", user: "System", status: "Success", time: "10 mins ago" },
    { id: 2, action: "Role Updated", user: "Admin (admin@test.com)", status: "Success", time: "2 hours ago" },
    { id: 3, action: "Failed Login", user: "Unknown (IP: 192.168.1.5)", status: "Warning", time: "5 hours ago" },
    { id: 4, action: "Database Backup", user: "System", status: "Success", time: "1 day ago" },
  ];

  return (
    // Restricted to top-level management
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
      <div className="max-w-7xl mx-auto w-full">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">System Operations</h1>
            <p className="text-sm text-slate-500 mt-1">Manage integrations, system health, and security logs.</p>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <button className="flex items-center gap-4 p-6 bg-white border border-slate-100 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:border-blue-500/30 hover:shadow-md transition-all text-left group">
            <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
              <RefreshCw className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Sync Integrations</p>
              <p className="text-xs text-slate-500 mt-1">Force sync with external tools</p>
            </div>
          </button>

          <button className="flex items-center gap-4 p-6 bg-white border border-slate-100 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:border-slate-300 hover:shadow-md transition-all text-left group">
            <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 group-hover:scale-110 transition-transform">
              <Database className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Manual Backup</p>
              <p className="text-xs text-slate-500 mt-1">Snapshot current database</p>
            </div>
          </button>
          
          <button className="flex items-center gap-4 p-6 bg-white border border-slate-100 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:border-red-500/30 hover:shadow-md transition-all text-left group">
            <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600 group-hover:scale-110 transition-transform">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Security Policies</p>
              <p className="text-xs text-slate-500 mt-1">Update global access rules</p>
            </div>
          </button>
        </div>

        {/* Audit Log Table */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-400" />
            <h2 className="font-semibold text-slate-800">Recent System Activity</h2>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-medium">Event</th>
                <th className="px-6 py-4 font-medium">Initiator</th>
                <th className="px-6 py-4 font-medium">Time</th>
                <th className="px-6 py-4 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{log.action}</td>
                  <td className="px-6 py-4">{log.user}</td>
                  <td className="px-6 py-4 text-slate-500">{log.time}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      log.status === 'Success' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

      </div>
    </ProtectedRoute>
  );
}