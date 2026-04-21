import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { Archive, Plus } from "lucide-react";

export default function InventoryPage() {
  return (
    // Employees are blocked from even loading this component
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
      <div className="p-8 max-w-7xl mx-auto w-full">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Company Inventory</h1>
            <p className="text-sm text-slate-500 mt-1">Track hardware, software licenses, and physical assets.</p>
          </div>

          <button className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <Plus className="h-4 w-4" />
            Assign Asset
          </button>
        </div>

        {/* Empty State / Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {["Total Assets", "Assigned", "In Repair"].map((stat, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                <Archive className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{stat}</p>
                <p className="text-2xl font-bold text-slate-900">0</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </ProtectedRoute>
  );
}