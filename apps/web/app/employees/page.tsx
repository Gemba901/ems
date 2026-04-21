import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { Role } from "@/types/role";
import { Search, Plus, MoreHorizontal } from "lucide-react";

export default function TeamDirectoryPage() {
  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE]}>
      <div className="p-8 max-w-7xl mx-auto w-full">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Team Directory</h1>
            <p className="text-sm text-slate-500 mt-1">Manage and view team members across the organization.</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Minimalist Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search employees..." 
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-64"
              />
            </div>

            {/* Protected Action Button */}
            <RoleGuard allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
              <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                <Plus className="h-4 w-4" />
                Add Employee
              </button>
            </RoleGuard>
          </div>
        </div>

        {/* Minimalist Data Grid/List Placeholder */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Department</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {/* Dummy Row */}
              <tr className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">JD</div>
                    <span className="font-medium text-slate-900">John Doe</span>
                  </div>
                </td>
                <td className="px-6 py-4">Software Engineer</td>
                <td className="px-6 py-4">Engineering</td>
                <td className="px-6 py-4 text-right">
                  <button className="text-slate-400 hover:text-slate-600 transition-colors">
                    <MoreHorizontal className="h-5 w-5 ml-auto" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </ProtectedRoute>
  );
}