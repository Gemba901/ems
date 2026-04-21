import { Briefcase } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface OrgContextProps {
  supervisor: { name: string; title: string; initials: string };
  directReports: { name: string; initials: string }[];
}

export function OrgContext({ supervisor, directReports }: OrgContextProps) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <Briefcase className="h-4 w-4 text-slate-400" />
        <h3 className="text-xs font-bold tracking-widest text-slate-800 uppercase">Org Context</h3>
      </div>
      <div className="grid grid-cols-2 gap-8">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-400 font-mono mb-3">Direct Supervisor</div>
          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-slate-200 text-slate-600">{supervisor.initials}</AvatarFallback>
            </Avatar>
            <div>
              <div className="text-sm font-bold text-slate-900">{supervisor.name}</div>
              <div className="text-xs text-slate-500">{supervisor.title}</div>
            </div>
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-slate-400 font-mono mb-3">Direct Reports ({directReports.length})</div>
          <div className="flex -space-x-3 overflow-hidden mt-2">
            {directReports.slice(0, 3).map((report, i) => (
              <Avatar key={i} className="h-10 w-10 border-2 border-white">
                <AvatarFallback className="bg-blue-100 text-blue-700">{report.initials}</AvatarFallback>
              </Avatar>
            ))}
            {directReports.length > 3 && (
              <div className="flex items-center justify-center h-10 w-10 rounded-full border-2 border-white bg-slate-100 text-xs font-medium text-slate-500 z-10">
                +{directReports.length - 3}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}