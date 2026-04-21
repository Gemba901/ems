import { Lock, Archive, BarChart2, Users } from "lucide-react";

interface Permission {
  title: string;
  description: string;
  icon: any;
}

interface RoleAccessProps {
  roleName: string;
  permissions: Permission[];
}

export function RoleAccess({ roleName, permissions }: RoleAccessProps) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-slate-400" />
          <h3 className="text-xs font-bold tracking-widest text-slate-800 uppercase">Role & Access</h3>
        </div>
        <span className="px-2.5 py-1 bg-red-50 text-red-700 text-[10px] font-bold tracking-widest uppercase rounded">{roleName}</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {permissions.map((perm, i) => (
          <div key={i} className="border border-slate-100 rounded-xl p-4 flex flex-col justify-between h-32 hover:border-slate-300 transition-colors cursor-pointer">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
              <perm.icon className="h-4 w-4 text-blue-600" /> {perm.title}
            </div>
            <p className="text-xs text-slate-500">{perm.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}