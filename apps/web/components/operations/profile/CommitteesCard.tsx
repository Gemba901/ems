import { Users } from "lucide-react";
import { Committee } from "@/types/employee";

const TYPE_COLORS: Record<string, string> = {
  QUALITY: "bg-info-subtle text-info",
  COST: "bg-success-subtle text-success",
  DELIVERY: "bg-warning-subtle text-warning",
  SAFETY: "bg-danger-subtle text-danger",
  MORALE: "bg-primary/10 text-primary",
  TECHNOLOGY: "bg-info-subtle text-info",
  GENERAL: "bg-muted text-muted-foreground",
};

export function CommitteesCard({ committees }: { committees: Committee[] }) {
  return (
    <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-bold tracking-widest text-foreground uppercase">
          Committees
        </h3>
        <span className="ml-auto text-xs font-semibold text-muted-foreground">{committees.length}</span>
      </div>

      {committees.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Not assigned to any committee
        </p>
      ) : (
        <div className="space-y-3">
          {committees.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between p-3 bg-muted rounded-xl"
            >
              <span className="text-sm font-medium text-foreground">{c.name}</span>
              <span
                className={`text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded ${
                  TYPE_COLORS[c.type] ?? "bg-muted text-muted-foreground"
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
