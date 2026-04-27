import { Badge } from "@/components/ui/badge";
import { EmployeeProfileData } from "@/types/employee";

export const IdentityCard = ({ employee }: { employee: EmployeeProfileData }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-6">
    <div className="relative">
      <div className="h-24 w-24 bg-slate-800 rounded-2xl overflow-hidden">
        <img src="/api/placeholder/100/100" alt={employee.name} className="w-full h-full object-cover opacity-80" />
      </div>
      <div className={`absolute -bottom-1 -right-1 h-4 w-4 border-2 border-white rounded-full ${employee.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
    </div>
    <div>
      <div className="text-[10px] uppercase tracking-widest text-blue-600 font-mono mb-1">STAFF ID: {employee.employeeId}</div>
      <h2 className="text-xl font-bold text-slate-900 mb-1">{employee.name}</h2>
      <p className="text-sm text-slate-500 mb-3">{employee.role}</p>
      <div className="flex flex-col gap-2">
        <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none">{employee.employmentType}</Badge>
        <p className="text-blue-600 border-none text-xs rounded-2xl">{employee.department}</p>
      </div>
    </div>
  </div>
);