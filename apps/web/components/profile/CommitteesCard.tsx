import { Users } from "lucide-react";
import { Committee } from "@/types/employee";

const TYPE_COLORS: Record<string, string> = {
  QUALITY: "bg-blue-50 text-blue-700",
  COST: "bg-emerald-50 text-emerald-700",
  DELIVERY: "bg-amber-50 text-amber-700",
  SAFETY: "bg-red-50 text-red-700",
  MORALE: "bg-purple-50 text-purple-700",
  TECHNOLOGY: "bg-cyan-50 text-cyan-700",
  GENERAL: "bg-slate-100 text-slate-600",
};

export function CommitteesCard({ committees }: { committees: Committee[] }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <Users className="h-4 w-4 text-slate-400" />
        <h3 className="text-xs font-bold tracking-widest text-slate-800 uppercase">
          Steering Committees
        </h3>
        <span className="ml-auto text-xs font-semibold text-slate-400">{committees.length}</span>
      </div>

      {committees.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">
          Not assigned to any committee
        </p>
      ) : (
        <div className="space-y-3">
          {committees.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
            >
              <span className="text-sm font-medium text-slate-900">{c.name}</span>
              <span
                className={`text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded ${
                  TYPE_COLORS[c.type] ?? "bg-slate-100 text-slate-600"
                }`}
              >
                {c.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
